// Headless checks. No browser, no framework.
//
// Covers the two things most likely to be silently broken: a generator that
// builds a puzzle whose own stated answer fails its own check, and DOM ids that
// main.js reaches for but index.html does not define.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { makeRng, todayKey, dayNumber, previousKey } from "../js/rng.js";
import { GENERATORS, dailySet } from "../js/puzzles/index.js";
import { buildCard, formatClock } from "../js/share.js";
import { composeBriefing } from "../js/briefing.js";
import { scoreVoice } from "../js/voice.js";

// Minimal DOM stub so puzzle render output can be inspected without a browser.
// The rendered markup is what the player actually sees, so it is the only honest
// place to check for tells.
function stubDom() {
  const make = (tag) => ({
    tagName: tag,
    children: [],
    _html: "",
    dataset: {},
    className: "",
    set innerHTML(v) {
      this._html = v;
      this.children = [];
    },
    get innerHTML() {
      return this._html + this.children.map((c) => c.outerHTML).join("");
    },
    get outerHTML() {
      return `<${tag}>${this.innerHTML}</${tag}>`;
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    setAttribute() {},
  });
  globalThis.document = { createElement: make };
  return make("div");
}

function renderText(puzzle) {
  const root = stubDom();
  puzzle.render(root, () => {});
  return root.innerHTML;
}

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
  }
}

// The index a "pick" puzzle expects, recovered from its own solution string.
function pickIndex(puzzle) {
  return Number(String(puzzle.solution).replace(/\D/g, "")) - 1;
}

console.log("\ngenerators");

for (const gen of GENERATORS) {
  const name = gen.meta.name;

  test(`${name}: produces a complete puzzle across 200 seeds`, () => {
    for (let i = 0; i < 200; i++) {
      const p = gen.generate(makeRng(`seed-${i}`));
      assert.ok(p.brief, "missing brief");
      assert.ok(p.solution, "missing solution");
      assert.ok(["text", "pick"].includes(p.mode), `bad mode ${p.mode}`);
      assert.equal(typeof p.render, "function", "render is not a function");
      assert.equal(typeof p.check, "function", "check is not a function");
      assert.ok(p.hints.length >= 3, "fewer than 3 hints");
      assert.ok(p.hints.every((h) => typeof h === "string" && h.length > 10), "weak hint");
      assert.ok(p.explain.method && p.explain.real, "missing explanation");
      assert.ok(p.explain.next?.url?.startsWith("https://"), "missing next link");
    }
  });

  test(`${name}: accepts its own answer across 200 seeds`, () => {
    for (let i = 0; i < 200; i++) {
      const p = gen.generate(makeRng(`seed-${i}`));
      const answer = p.mode === "text" ? p.solution : pickIndex(p);
      assert.ok(p.check(answer), `seed ${i} rejected its own solution (${p.solution})`);
    }
  });

  test(`${name}: rejects wrong answers across 200 seeds`, () => {
    for (let i = 0; i < 200; i++) {
      const p = gen.generate(makeRng(`seed-${i}`));
      if (p.mode === "text") {
        assert.ok(!p.check("DEFINITELY NOT THE ANSWER"), `seed ${i} accepted garbage`);
        assert.ok(!p.check(""), `seed ${i} accepted empty`);
      } else {
        const right = pickIndex(p);
        const wrong = right === 0 ? 1 : 0;
        assert.ok(!p.check(wrong), `seed ${i} accepted the wrong row`);
      }
    }
  });

  test(`${name}: same seed gives an identical puzzle`, () => {
    for (let i = 0; i < 50; i++) {
      const a = gen.generate(makeRng(`repeat-${i}`));
      const b = gen.generate(makeRng(`repeat-${i}`));
      assert.equal(a.solution, b.solution);
      assert.deepEqual(a.hints, b.hints);
    }
  });
}

console.log("\ncipher answers are non-trivial");

test("Intercept never ships plaintext as the ciphertext", () => {
  // A zero shift would hand the player the answer. Verified through the render
  // output, since that is what the player actually sees.
  const cipher = GENERATORS.find((g) => g.meta.id === "cipher");
  for (let i = 0; i < 300; i++) {
    const p = cipher.generate(makeRng(`plain-${i}`));
    let html = "";
    p.render({ set innerHTML(v) { html = v; } });
    assert.ok(!html.includes(p.solution), `seed ${i} leaked the plaintext`);
  }
});

console.log("\ndaily set");

test("a daily run covers all three domains", () => {
  for (let i = 0; i < 100; i++) {
    const set = dailySet(makeRng(`daily:2026-01-${(i % 28) + 1}`));
    const domains = new Set(set.map((p) => p.meta.domain));
    assert.equal(set.length, GENERATORS.length);
    assert.equal(domains.size, GENERATORS.length, "a domain was missing or duplicated");
  }
});

test("the same day gives the same set, a different day does not", () => {
  const a = dailySet(makeRng("daily:2026-08-30"));
  const b = dailySet(makeRng("daily:2026-08-30"));
  const c = dailySet(makeRng("daily:2026-08-31"));
  assert.deepEqual(a.map((p) => p.solution), b.map((p) => p.solution));
  assert.notDeepEqual(a.map((p) => p.solution), c.map((p) => p.solution));
});

// Real sequential dates. Generating keys with a modulo produces duplicate dates
// and measures the test's own arithmetic instead of the game's variety.
function yearOfKeys(startUtc) {
  const keys = [];
  let d = new Date(startUtc);
  for (let i = 0; i < 365; i++) {
    keys.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return keys;
}

test("a year of real dates rarely repeats a solution set", () => {
  const sigs = yearOfKeys(Date.UTC(2027, 0, 1)).map((k) =>
    dailySet(makeRng(`daily:${k}`)).map((p) => p.solution).join("|")
  );
  const distinct = new Set(sigs).size;
  assert.ok(distinct >= 340, `only ${distinct} distinct sets in 365 days`);
});

// A daily player who meets the same phrase repeatedly stops decoding it and
// starts recognising it by shape, which retires the puzzle regardless of the key.
test("the cipher corpus is deep enough for daily play", () => {
  const plains = yearOfKeys(Date.UTC(2027, 0, 1)).map(
    (k) => dailySet(makeRng(`daily:${k}`)).find((p) => p.meta.domain === "crypto").solution
  );
  const distinct = new Set(plains).size;
  assert.ok(distinct >= 30, `only ${distinct} distinct plaintexts across a year`);
});

console.log("\ndates");

test("previousKey walks back one day, including across months", () => {
  assert.equal(previousKey("2026-08-30"), "2026-08-29");
  assert.equal(previousKey("2026-09-01"), "2026-08-31");
  assert.equal(previousKey("2027-01-01"), "2026-12-31");
  assert.equal(previousKey("2028-03-01"), "2028-02-29"); // leap year
});

test("dayNumber advances by exactly one per day", () => {
  assert.equal(dayNumber("2026-01-01"), 1);
  assert.equal(dayNumber("2026-01-02") - dayNumber("2026-01-01"), 1);
  assert.equal(dayNumber("2026-03-01") - dayNumber("2026-02-28"), 1);
});

test("todayKey is a well formed local date", () => {
  assert.match(todayKey(new Date(2026, 7, 30)), /^2026-08-30$/);
});

console.log("\nshare card");

test("the card shows no answers and encodes the run", () => {
  const card = buildCard({
    dayNumber: 242,
    results: [
      { solved: true, hints: 0 },
      { solved: true, hints: 2 },
      { solved: false, hints: 3 },
    ],
    totalSeconds: 252,
    streak: 4,
  });
  assert.ok(card.includes("COLD OPEN #242"));
  assert.ok(card.includes("4:12"));
  assert.ok(card.includes("4 day streak"));
  assert.equal(card.split("\n").length, 3);
});

test("the card carries the play link when there is one, and only then", () => {
  const base = { dayNumber: 9, results: [{ solved: true, hints: 0 }], totalSeconds: 30, streak: 1 };
  const withUrl = buildCard({ ...base, url: "https://example.com/cold-open/" });
  assert.equal(withUrl.split("\n").pop(), "https://example.com/cold-open/");
  assert.ok(!buildCard(base).includes("http"));
});

test("a one day streak is not announced", () => {
  const card = buildCard({ dayNumber: 1, results: [{ solved: true, hints: 0 }], totalSeconds: 30, streak: 1 });
  assert.ok(!card.includes("streak"));
});

test("formatClock pads seconds", () => {
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(65), "1:05");
  assert.equal(formatClock(600), "10:00");
});

console.log("\ndifficulty");

test("a daily run climbs 1, 2, 3", () => {
  for (let i = 0; i < 60; i++) {
    const set = dailySet(makeRng(`daily:ramp-${i}`));
    assert.deepEqual(set.map((p) => p.difficulty), [1, 2, 3]);
  }
});

test("harder settings produce more to sift through", () => {
  const sizeAt = (gen, d) => {
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const p = gen.generate(makeRng(`size-${d}-${i}`), d);
      total += renderText(p).split("\n").join(" ").length;
    }
    return total / 40;
  };
  for (const gen of GENERATORS) {
    if (gen.meta.id === "cipher") continue; // scheme changes, not volume
    const easy = sizeAt(gen, 1);
    const hard = sizeAt(gen, 3);
    assert.ok(hard > easy * 1.4, `${gen.meta.name}: difficulty 3 is not meaningfully denser than 1`);
  }
});

test("the easiest cipher is always a single shift", () => {
  for (let i = 0; i < 100; i++) {
    const p = GENERATORS.find((g) => g.meta.id === "cipher").generate(makeRng(`easy-${i}`), 1);
    assert.ok(/substitution/.test(renderText(p)), "difficulty 1 used something other than a shift");
  }
});

console.log("\nno exploitable tells");

test("the answer is not parked in a fixed position", () => {
  for (const gen of GENERATORS) {
    if (gen.meta.id === "cipher") continue;
    const positions = new Set();
    let first = 0;
    let last = 0;
    for (let i = 0; i < 400; i++) {
      const p = gen.generate(makeRng(`pos-${i}`), 2);
      const idx = Number(String(p.solution).replace(/\D/g, "")) - 1;
      positions.add(idx);
      if (idx === 0) first++;
      // Count rows by their line-number marker. Matching loose digit runs picks
      // up log timestamps and miscounts the list.
      const rows = renderText(p).match(/class="ln"/g) || [];
      if (idx === rows.length - 1) last++;
    }
    assert.ok(positions.size > 6, `${gen.meta.name}: answer only ever lands in ${positions.size} positions`);
    assert.ok(first > 0, `${gen.meta.name}: the answer is never the first row`);
    assert.ok(last > 0, `${gen.meta.name}: the answer is never the last row`);
  }
});

test("a fixed interval alone does not mark a flow as hostile", () => {
  // If only hostile rows ever showed a numeric interval, a player could win by
  // clicking whatever does not say "varies" and learn nothing.
  const netflow = GENERATORS.find((g) => g.meta.id === "netflow");
  let benignFixed = 0;
  for (let i = 0; i < 300; i++) {
    const p = netflow.generate(makeRng(`intv-${i}`), 2);
    const text = renderText(p);
    const rows = text.split("<tr>").filter((r) => r.includes("</td>"));
    const answer = Number(String(p.solution).replace(/\D/g, "")) - 1;
    rows.forEach((row, idx) => {
      if (idx !== answer && /\d+s</.test(row)) benignFixed++;
    });
  }
  assert.ok(benignFixed > 50, `only ${benignFixed} benign rows had a fixed interval across 300 puzzles`);
});

test("an unfamiliar destination alone does not mark a flow as hostile", () => {
  const netflow = GENERATORS.find((g) => g.meta.id === "netflow");
  let multi = 0;
  for (let i = 0; i < 300; i++) {
    const p = netflow.generate(makeRng(`dst-${i}`), 2);
    const text = renderText(p);
    const approved = approvedIps(text);
    const body = text.split("</thead>")[1] || "";
    const dests = [...body.matchAll(/<td>((?:\d{1,3}\.){3}\d{1,3})<\/td>\s*<td>\d+<\/td>/g)].map((m) => m[1]);
    const unfamiliar = dests.filter((d) => !approved.includes(d));
    if (unfamiliar.length > 1) multi++;
  }
  assert.ok(multi > 200, `only ${multi} of 300 puzzles had more than one unfamiliar destination`);
});

// The approved list renders as "ip (label), ip (label)". Only the addresses matter.
function approvedIps(text) {
  const list = (text.match(/Approved destinations: ([^<]+)/) || [, ""])[1];
  return [...list.matchAll(/((?:\d{1,3}\.){3}\d{1,3})/g)].map((m) => m[1]);
}

test("a beacon puzzle has exactly one defensible answer", () => {
  // A benign row that runs on a timer to an unapproved address is itself a
  // beacon, which would make the puzzle mark a correct call as wrong.
  const netflow = GENERATORS.find((g) => g.meta.id === "netflow");
  let checked = 0;
  for (const d of [1, 2, 3]) {
    for (let i = 0; i < 600; i++) {
      const p = netflow.generate(makeRng(`beacon-${d}-${i}`), d);
      if (!/controller/.test(p.brief)) continue;
      checked++;
      const text = renderText(p);
      const approved = approvedIps(text);
      const body = text.split("</thead>")[1] || "";
      const rows = body.split("<tr>").filter((r) => r.includes("</td>"));
      const answer = pickIndex(p);
      rows.forEach((row, idx) => {
        if (idx === answer) return;
        const cells = [...row.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((m) => m[1]);
        const timed = /^\d+s$/.test(cells[7]);
        assert.ok(!(timed && !approved.includes(cells[2])), `d${d} seed ${i}: row ${idx + 1} is a second beacon`);
      });
    }
  }
  assert.ok(checked > 300, `only ${checked} beacon puzzles checked`);
});

test("the XOR hint's promise holds: an encoded space is always a top byte", () => {
  // The hint tells the player an encoded space is among the most frequent bytes.
  // Every message in the corpus has to keep that true.
  const cipher = GENERATORS.find((g) => g.meta.id === "cipher");
  let checked = 0;
  for (let i = 0; i < 1500; i++) {
    const p = cipher.generate(makeRng(`xor-${i}`), 3);
    const html = renderText(p);
    if (!/single byte XOR/.test(html)) continue;
    checked++;
    const bytes = html.match(/<pre class="cipher-text">([^<]+)<\/pre>/)[1].trim().split(" ");
    const counts = {};
    bytes.forEach((b) => (counts[b] = (counts[b] || 0) + 1));
    const key = parseInt(p.hints[2].match(/0x([0-9a-f]+)/)[1], 16);
    const space = (0x20 ^ key).toString(16).padStart(2, "0");
    const higher = new Set(Object.values(counts).filter((c) => c > counts[space]));
    assert.ok(higher.size < 3, `seed ${i}: the space byte ranks below the top three (${p.solution})`);
  }
  assert.ok(checked > 200, `only ${checked} XOR puzzles checked`);
});

test("hostile external addresses are not drawn from a separate range", () => {
  // Memorising "203.0.113 means bad" must not work, so benign traffic has to use
  // the same pool the incident does.
  const logscan = GENERATORS.find((g) => g.meta.id === "logscan");
  const hostileFirstOctets = new Set();
  const benignFirstOctets = new Set();
  for (let i = 0; i < 300; i++) {
    const p = logscan.generate(makeRng(`ip-${i}`), 2);
    const text = renderText(p);
    const lines = text.split("<span").slice(1);
    const answer = Number(String(p.solution).replace(/\D/g, "")) - 1;
    lines.forEach((line, idx) => {
      for (const m of line.matchAll(/\b((?:\d{1,3}\.){3}\d{1,3})\b/g)) {
        const net = m[1].split(".").slice(0, 3).join(".");
        if (net.startsWith("10.") || net.startsWith("192.168")) continue;
        (idx === answer ? hostileFirstOctets : benignFirstOctets).add(net);
      }
    });
  }
  const shared = [...hostileFirstOctets].filter((n) => benignFirstOctets.has(n));
  assert.ok(shared.length >= 4, `only ${shared.length} external networks appear on both sides`);
});

console.log("\nbriefing");

test("briefings vary rather than repeating a fixed script", () => {
  const gen = GENERATORS[0];
  const seen = new Set();
  for (let i = 0; i < 300; i++) {
    const p = gen.generate(makeRng(`b-${i}`), 2);
    seen.add(composeBriefing(makeRng(`brief-${i}`), p, 1, 3));
  }
  assert.ok(seen.size > 250, `only ${seen.size} distinct briefings in 300 draws`);
});

test("a briefing states the objective and adapts to position", () => {
  const p = GENERATORS[0].generate(makeRng("brief-x"), 2);
  const first = composeBriefing(makeRng("s1"), p, 0, 3);
  const last = composeBriefing(makeRng("s2"), p, 2, 3);
  assert.ok(first.includes(p.brief), "the objective is missing from the briefing");
  assert.ok(last.includes(p.brief));
  assert.notEqual(first.split(" ")[0], last.split(" ")[0]);
});

console.log("\nvoice selection");

// Real voice names as the browsers actually report them.
const V = {
  ariaNeural: { name: "Microsoft Aria Online (Natural) - English (United States)", lang: "en-US", localService: false },
  zira: { name: "Microsoft Zira - English (United States)", lang: "en-US", localService: true },
  david: { name: "Microsoft David - English (United States)", lang: "en-US", localService: true },
  guyNeural: { name: "Microsoft Guy Online (Natural) - English (United States)", lang: "en-US", localService: false },
  ukFemale: { name: "Google UK English Female", lang: "en-GB", localService: false },
  ukMale: { name: "Google UK English Male", lang: "en-GB", localService: false },
  samantha: { name: "Samantha", lang: "en-US", localService: true },
  alex: { name: "Alex", lang: "en-US", localService: true },
  german: { name: "Google Deutsch", lang: "de-DE", localService: false },
};

const best = (list) => list.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0].name;

test("a female voice outranks a male one on the same engine", () => {
  assert.ok(scoreVoice(V.zira) > scoreVoice(V.david));
  assert.ok(scoreVoice(V.ukFemale) > scoreVoice(V.ukMale));
  assert.ok(scoreVoice(V.samantha) > scoreVoice(V.alex));
});

test("a neural voice outranks a basic one of the same gender", () => {
  assert.ok(scoreVoice(V.ariaNeural) > scoreVoice(V.zira));
});

test("gender is not sacrificed for smoothness", () => {
  // A male neural voice must not beat a female neural voice.
  assert.ok(scoreVoice(V.ariaNeural) > scoreVoice(V.guyNeural));
});

test("non English voices are never chosen when English exists", () => {
  assert.ok(scoreVoice(V.german) < scoreVoice(V.david));
  assert.equal(best([V.german, V.david, V.zira]), V.zira.name);
});

test("realistic voice lists pick the smooth female option", () => {
  assert.equal(best(Object.values(V)), V.ariaNeural.name);
  assert.equal(best([V.david, V.zira, V.german]), V.zira.name);
  assert.equal(best([V.ukMale, V.ukFemale]), V.ukFemale.name);
  // Degenerate case: only a male voice is installed, so it still gets picked.
  assert.equal(best([V.david, V.alex]), V.david.name);
});

test("a name containing a male substring is not misread", () => {
  // "Amber" contains "mar" only by coincidence elsewhere; the check must be on
  // whole words so ordinary female names are not penalised.
  assert.ok(scoreVoice({ name: "Microsoft Amber", lang: "en-US" }) > 0);
  assert.ok(scoreVoice({ name: "Microsoft Michelle", lang: "en-US" }) > 0);
});

console.log("\nwiring");

test("every id main.js reaches for exists in index.html", () => {
  const js = readFileSync(join(root, "js/main.js"), "utf8");
  const html = readFileSync(join(root, "index.html"), "utf8");
  const ids = [...js.matchAll(/\$\("#([\w-]+)"\)/g)].map((m) => m[1]);
  assert.ok(ids.length > 10, "selector scan found suspiciously little");
  const missing = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
  assert.deepEqual(missing, [], `ids referenced but not defined: ${missing.join(", ")}`);
});

test("every screen main.js toggles exists", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");
  for (const s of ["screen-home", "screen-play", "screen-explain", "screen-results"]) {
    assert.ok(html.includes(`id="${s}"`), `missing ${s}`);
  }
});

test("no em dashes or en dashes in any source file", () => {
  const files = [
    "index.html",
    "styles.css",
    "js/main.js",
    "js/rng.js",
    "js/state.js",
    "js/share.js",
    "js/puzzles/index.js",
    "js/puzzles/cipher.js",
    "js/puzzles/logscan.js",
    "js/puzzles/netflow.js",
    "js/briefing.js",
    "js/voice.js",
    "js/backdrop.js",
    "README.md",
  ];
  for (const f of files) {
    const text = readFileSync(join(root, f), "utf8");
    assert.ok(!/[\u2013\u2014]/.test(text), `${f} contains a dash`);
  }
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
