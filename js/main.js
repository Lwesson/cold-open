import { makeRng, todayKey, dayNumber } from "./rng.js";
import { dailySet, randomOne } from "./puzzles/index.js";
import { load, recordDaily, alreadyPlayed } from "./state.js";
import { buildCard, copy, formatClock } from "./share.js";
import { composeBriefing } from "./briefing.js";
import * as voice from "./voice.js";
import * as backdrop from "./backdrop.js";

const HINT_PENALTY_SECONDS = 30;
const TYPE_SPEED_MS = 18;

const $ = (sel) => document.querySelector(sel);
const screens = {
  home: $("#screen-home"),
  briefing: $("#screen-briefing"),
  play: $("#screen-play"),
  explain: $("#screen-explain"),
  results: $("#screen-results"),
};

let run = null;
let ticker = null;
let typer = null;

function show(name) {
  Object.entries(screens).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  // The stepper is run chrome, so it belongs to the screens inside a run.
  $("#stepper").hidden = !(run && run.mode === "daily" && ["briefing", "play", "explain"].includes(name));
}

// A thin progress rail: solved, missed, current, pending. Cheaper to read at a
// glance than a "puzzle 2 of 3" label, and it carries the result as well.
function renderStepper() {
  const el = $("#stepper");
  el.innerHTML = "";
  if (!run || run.mode !== "daily") return;
  run.puzzles.forEach((_, i) => {
    const bar = document.createElement("i");
    const done = run.results[i];
    if (done) bar.className = done.solved ? "done" : "miss";
    else if (i === run.index) bar.className = "active";
    el.appendChild(bar);
  });
}

// Each domain carries its own colour so the three days of the week are visually
// distinct at a glance, matching the legend on the home screen.
function setDomain(el, domain) {
  el.textContent = domain;
  el.dataset.domain = domain;
}

function nowSeconds() {
  return Math.floor(performance.now() / 1000);
}

// Dateline for the masthead. Built from the puzzle key rather than a fresh Date
// so it can never disagree with the day number sitting next to it, and written
// out longhand so it does not read as a different order in another locale.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateline(dateKey) {
  const [y, m, d] = dateKey.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

// ---------- home ----------

function renderHome() {
  const state = load();
  const key = todayKey();
  const played = alreadyPlayed(key);

  $("#day-number").textContent = `#${dayNumber(key)}`;
  $("#edition-date").textContent = formatDateline(key);
  $("#stat-streak").textContent = state.streak;
  $("#stat-best").textContent = state.bestStreak;
  $("#stat-played").textContent = state.played;

  const accuracy = state.played ? Math.round((state.solved / (state.played * 3)) * 100) : 0;
  $("#stat-accuracy").textContent = `${accuracy}%`;

  $("#btn-daily").textContent = played ? "Today is done" : "Start today's briefing";
  $("#btn-daily").disabled = played;
  $("#daily-note").textContent = played
    ? "One scored run per day. Practice is unlimited."
    : "Three puzzles, easiest first. Everyone gets the same set today.";

  show("home");
}

// ---------- run setup ----------

function startDaily() {
  const key = todayKey();
  run = {
    mode: "daily",
    dateKey: key,
    rng: makeRng(`brief:${key}`),
    puzzles: dailySet(makeRng(`daily:${key}`)),
    index: 0,
    results: [],
  };
  openBriefing();
}

function startPractice(difficulty) {
  const seed = `practice:${Date.now()}:${Math.random()}`;
  run = {
    mode: "practice",
    rng: makeRng(`${seed}:brief`),
    puzzles: [randomOne(makeRng(seed), difficulty)],
    index: 0,
    results: [],
  };
  openBriefing();
}

// ---------- briefing ----------

function openBriefing() {
  const puzzle = run.puzzles[run.index];
  const text = composeBriefing(run.rng, puzzle, run.index, run.puzzles.length);

  setDomain($("#briefing-domain"), puzzle.meta.domain);
  $("#briefing-difficulty").textContent = "●".repeat(puzzle.difficulty || 2);
  $("#briefing-difficulty").title = `Difficulty ${puzzle.difficulty || 2} of 3`;
  $("#briefing-step").textContent =
    run.mode === "daily" ? `${run.index + 1} of ${run.puzzles.length}` : "Practice";

  renderStepper();
  typeOut($("#briefing-text"), text);
  voice.speak(text);
  syncVoiceButton();
  show("briefing");
}

// Reveal the briefing a character at a time. Clicking anywhere finishes it
// immediately, because nobody should be held hostage by an animation.
function typeOut(el, text) {
  stopTyping();
  el.textContent = "";
  let i = 0;
  typer = setInterval(() => {
    el.textContent = text.slice(0, ++i);
    if (i >= text.length) stopTyping();
  }, TYPE_SPEED_MS);
  el.dataset.full = text;
}

function stopTyping() {
  if (typer) clearInterval(typer);
  typer = null;
}

function finishTyping() {
  const el = $("#briefing-text");
  if (!typer) return false;
  stopTyping();
  el.textContent = el.dataset.full || "";
  return true;
}

function syncVoiceButton() {
  const btn = $("#btn-voice");
  const picker = $("#voice-picker");
  if (!voice.available()) {
    btn.hidden = true;
    picker.hidden = true;
    return;
  }
  btn.hidden = false;
  const on = voice.isEnabled();
  btn.textContent = on ? "Voice on" : "Voice off";
  btn.setAttribute("aria-pressed", String(on));

  // Which voices exist is machine specific, so the pick is offered rather than
  // assumed. Only worth showing when there is an actual choice to make.
  const options = voice.listVoices();
  picker.hidden = !on || options.length < 2;
  if (picker.hidden) return;
  const current = voice.currentVoiceName();
  if (picker.dataset.filled !== String(options.length)) {
    picker.innerHTML = options
      .map((v) => `<option value="${v.name}">${v.name.replace(/\s*\(.*?\)\s*/g, " ").trim()}</option>`)
      .join("");
    picker.dataset.filled = String(options.length);
  }
  picker.value = current;
}

function toggleVoice() {
  const next = !voice.isEnabled();
  voice.setEnabled(next);
  syncVoiceButton();
  if (next) voice.speak($("#briefing-text").dataset.full || "");
}

function changeVoice(e) {
  voice.setVoice(e.target.value);
  voice.speak($("#briefing-text").dataset.full || "");
}

// ---------- play ----------

function beginPuzzle() {
  stopTyping();
  voice.cancel();

  const puzzle = run.puzzles[run.index];
  run.hintsShown = 0;
  run.selected = null;
  run.startedAt = nowSeconds();

  $("#play-progress").textContent =
    run.mode === "daily" ? `Puzzle ${run.index + 1} of ${run.puzzles.length}` : "Practice";
  setDomain($("#play-domain"), puzzle.meta.domain);
  $("#play-difficulty").textContent = "●".repeat(puzzle.difficulty || 2);
  $("#play-title").textContent = puzzle.meta.name;
  $("#play-brief").textContent = puzzle.brief;

  const body = $("#puzzle-body");
  body.innerHTML = "";
  puzzle.render(body, (value) => {
    run.selected = value;
    $("#btn-submit").disabled = false;
  });

  const textWrap = $("#answer-wrap");
  textWrap.hidden = puzzle.mode !== "text";
  if (puzzle.mode === "text") {
    const input = $("#answer-input");
    input.value = "";
    input.focus();
  }

  $("#hint-list").innerHTML = "";
  $("#btn-hint").disabled = false;
  $("#btn-hint").textContent = `Hint (costs ${HINT_PENALTY_SECONDS}s)`;
  $("#btn-submit").disabled = puzzle.mode === "pick";

  renderStepper();
  startTicker();
  show("play");
}

function startTicker() {
  stopTicker();
  const tick = () => {
    $("#timer").textContent = formatClock(nowSeconds() - run.startedAt);
  };
  tick();
  ticker = setInterval(tick, 1000);
}

function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

function takeHint() {
  const puzzle = run.puzzles[run.index];
  if (run.hintsShown >= puzzle.hints.length) return;
  const li = document.createElement("li");
  li.textContent = puzzle.hints[run.hintsShown];
  $("#hint-list").appendChild(li);
  run.hintsShown += 1;
  if (run.hintsShown >= puzzle.hints.length) {
    $("#btn-hint").disabled = true;
    $("#btn-hint").textContent = "No hints left";
  }
}

function submit() {
  // Enter can arrive after the screen has already moved on, and a second submit
  // would score the same puzzle twice.
  if (!run || screens.play.hidden) return;
  const puzzle = run.puzzles[run.index];
  const raw = puzzle.mode === "text" ? $("#answer-input").value : run.selected;
  if (puzzle.mode === "text" && !String(raw).trim()) return;
  if (puzzle.mode === "pick" && raw === null) return;

  stopTicker();
  const seconds = nowSeconds() - run.startedAt;
  const solved = puzzle.check(raw);

  run.results.push({
    domain: puzzle.meta.domain,
    solved,
    hints: run.hintsShown,
    seconds: seconds + run.hintsShown * HINT_PENALTY_SECONDS,
  });

  renderExplain(puzzle, solved, seconds);
}

// ---------- explain ----------

function renderExplain(puzzle, solved, seconds) {
  $("#verdict").textContent = solved ? "Solved" : "Missed";
  $("#verdict").className = solved ? "verdict good" : "verdict bad";
  $("#verdict-detail").textContent = solved
    ? `${formatClock(seconds)}${run.hintsShown ? `, ${run.hintsShown} hint${run.hintsShown > 1 ? "s" : ""}` : ", no hints"}`
    : `The answer was ${puzzle.solution}.`;

  $("#explain-method").textContent = puzzle.explain.method;
  $("#explain-real").textContent = puzzle.explain.real;

  const next = $("#explain-next");
  next.textContent = puzzle.explain.next.label;
  next.href = puzzle.explain.next.url;

  const last = run.mode === "daily" && run.index === run.puzzles.length - 1;
  $("#btn-continue").textContent =
    run.mode === "practice" ? "Another puzzle" : last ? "See results" : "Next briefing";

  renderStepper();
  show("explain");
}

function advance() {
  if (run.mode === "practice") {
    startPractice();
    return;
  }
  if (run.index < run.puzzles.length - 1) {
    run.index += 1;
    openBriefing();
    return;
  }
  finishDaily();
}

// ---------- results ----------

function finishDaily() {
  const state = recordDaily(run.dateKey, run.results);
  const total = run.results.reduce((sum, r) => sum + r.seconds, 0);
  const solved = run.results.filter((r) => r.solved).length;

  $("#results-grid").textContent = run.results
    .map((r) => (!r.solved ? "⬛" : r.hints === 0 ? "\u{1F7E9}" : "\u{1F7E8}"))
    .join(" ");
  $("#results-line").textContent = `${solved} of ${run.results.length} solved in ${formatClock(total)}`;
  $("#results-streak").textContent =
    state.streak > 1 ? `${state.streak} day streak` : "Streak started";

  $("#share-preview").textContent = buildCard({
    dayNumber: dayNumber(run.dateKey),
    results: run.results,
    totalSeconds: total,
    streak: state.streak,
    url: playUrl(),
  });

  $("#btn-copy").textContent = "Copy result";
  show("results");
}

// The card is how new players arrive, so it carries the way in. Only a real web
// address is worth sharing; a local file path or preview frame is left off.
function playUrl() {
  try {
    const { protocol, host, pathname } = window.location;
    if (!/^https?:$/.test(protocol) || /^(localhost|127\.|\[::1\])/.test(host)) return "";
    return `${protocol}//${host}${pathname.replace(/index\.html$/, "")}`;
  } catch {
    return "";
  }
}

async function copyResult() {
  const ok = await copy($("#share-preview").textContent);
  $("#btn-copy").textContent = ok ? "Copied" : "Copy failed, select it manually";
}

// ---------- wiring ----------

backdrop.init(document.getElementById("backdrop"));
voice.init();
// Chrome fills the voice list after first paint, so refresh the control then.
voice.onVoicesChanged(() => {
  if (!screens.briefing.hidden) syncVoiceButton();
});

$("#voice-picker").addEventListener("change", changeVoice);
$("#btn-daily").addEventListener("click", startDaily);
$("#btn-practice").addEventListener("click", () => startPractice());
$("#btn-begin").addEventListener("click", beginPuzzle);
$("#btn-voice").addEventListener("click", toggleVoice);
$("#btn-hint").addEventListener("click", takeHint);
$("#btn-submit").addEventListener("click", submit);
$("#btn-continue").addEventListener("click", advance);
$("#btn-copy").addEventListener("click", copyResult);

// Click the briefing body to skip the reveal.
$("#briefing-text").addEventListener("click", finishTyping);

document.querySelectorAll("[data-home]").forEach((el) =>
  el.addEventListener("click", () => {
    stopTicker();
    stopTyping();
    voice.cancel();
    renderHome();
  })
);

$("#answer-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submit();
});

renderHome();
