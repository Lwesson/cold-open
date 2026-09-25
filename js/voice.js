// Spoken briefings through the browser's own speech synthesis.
//
// Free, offline capable, no key, no dependency. It is also wildly inconsistent:
// available voices differ per machine, per browser, and per operating system,
// they load asynchronously, and long utterances get cut off. Every path here
// degrades to silent on-screen text rather than to an error.

const PREF_KEY = "coldopen.voice";
const VOICE_KEY = "coldopen.voicename";

let voice = null;
let voices = [];
const listeners = new Set();

function supported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

// Names that are reliably female across Windows, macOS, Chrome, and Android.
// The API exposes no gender field, so the name is the only signal available.
const FEMALE = [
  "zira", "hazel", "eva", "aria", "jenny", "michelle", "ana", "clara", "linda",
  "samantha", "ava", "allison", "susan", "karen", "moira", "tessa", "fiona",
  "victoria", "serena", "zoe", "kate", "catherine", "nora", "sonia", "libby",
  "emma", "amber", "ashley", "cora", "elizabeth", "monica", "joanna", "salli",
];

const MALE = [
  "david", "mark", "george", "james", "ryan", "guy", "eric", "christopher",
  "alex", "daniel", "fred", "tom", "oliver", "arthur", "brian", "matthew",
  "aaron", "gordon", "lee", "liam", "male",
];

// Higher is better. Smoothness outranks everything: a neural voice reading in a
// slightly wrong accent still sounds far better than a robotic one in the right
// accent. Gender is weighted next, then language, then locality as a tiebreak.
export function scoreVoice(v) {
  const name = String(v.name || "").toLowerCase();
  const lang = String(v.lang || "").toLowerCase();
  let score = 0;

  if (/natural|neural/.test(name)) score += 9;
  if (/online/.test(name)) score += 3;
  if (/enhanced|premium/.test(name)) score += 4;

  if (/female/.test(name)) score += 7;
  if (FEMALE.some((n) => name.includes(n))) score += 8;
  if (/\bmale\b/.test(name) || MALE.some((n) => new RegExp(`\\b${n}\\b`).test(name))) score -= 12;

  if (lang.startsWith("en")) score += 3;
  if (lang.startsWith("en-us") || lang.startsWith("en_us")) score += 2;
  if (lang.startsWith("en-gb") || lang.startsWith("en_gb")) score += 1;
  if (!lang.startsWith("en")) score -= 10;

  if (v.localService) score += 1;
  if (v.default) score += 1;

  return score;
}

function refresh() {
  if (!supported()) return;
  voices = window.speechSynthesis.getVoices() || [];
  const saved = savedVoiceName();
  const match = saved && voices.find((v) => v.name === saved);
  voice = match || voices.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
  listeners.forEach((fn) => fn());
}

export function init() {
  if (!supported()) return;
  refresh();
  // Chrome populates the list asynchronously and fires this once it has.
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
}

export function onVoicesChanged(fn) {
  listeners.add(fn);
}

export function available() {
  return supported() && Boolean(voice);
}

// English voices only, best first. This is what the picker offers.
export function listVoices() {
  return voices
    .filter((v) => String(v.lang || "").toLowerCase().startsWith("en"))
    .sort((a, b) => scoreVoice(b) - scoreVoice(a));
}

export function currentVoiceName() {
  return voice ? voice.name : "";
}

function savedVoiceName() {
  try {
    return localStorage.getItem(VOICE_KEY) || "";
  } catch {
    return "";
  }
}

export function setVoice(name) {
  const found = voices.find((v) => v.name === name);
  if (!found) return;
  voice = found;
  try {
    localStorage.setItem(VOICE_KEY, name);
  } catch {
    // Preference will simply not survive a reload.
  }
}

export function isEnabled() {
  try {
    return localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

export function setEnabled(on) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    // A blocked storage API is not a reason to refuse to speak this session.
  }
  if (!on) cancel();
}

// Split into sentences and queue them separately. Two reasons, both real:
// Chrome silently stops speaking after roughly fifteen seconds of a single
// utterance, and sentence sized chunks give the engine natural breath points
// instead of one flat unbroken run.
function chunk(text) {
  return String(text)
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function speak(text) {
  if (!supported() || !isEnabled()) return;
  try {
    cancel();
    for (const part of chunk(text)) {
      const u = new SpeechSynthesisUtterance(part);
      if (voice) u.voice = voice;
      // Slightly under natural pace reads as composed rather than hurried, and
      // a touch above default pitch keeps it from sounding flat.
      u.rate = 0.94;
      u.pitch = 1.05;
      u.volume = 1;
      window.speechSynthesis.speak(u);
    }
  } catch {
    // Silence is acceptable. The briefing is on screen regardless.
  }
}

export function cancel() {
  if (!supported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing to do.
  }
}
