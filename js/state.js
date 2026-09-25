// Player state in localStorage.
//
// Every read and write is wrapped: localStorage throws outright in some privacy
// modes and inside embedded frames, which is exactly where portals like Poki and
// CrazyGames run the game. A storage failure must never break play, it just
// means stats do not persist.

import { previousKey } from "./rng.js";

const KEY = "coldopen.v1";

const EMPTY = {
  streak: 0,
  bestStreak: 0,
  lastPlayed: null,
  played: 0,
  solved: 0,
  history: [], // most recent first, capped
  domains: {}, // domain -> { seen, solved }
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY };
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function alreadyPlayed(dateKey) {
  return load().lastPlayed === dateKey;
}

// results: [{ domain, solved, hints, seconds }]
export function recordDaily(dateKey, results) {
  const state = load();
  if (state.lastPlayed === dateKey) return state; // one scored run per day

  if (state.lastPlayed === previousKey(dateKey)) state.streak += 1;
  else state.streak = 1;

  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.lastPlayed = dateKey;
  state.played += 1;

  const solvedCount = results.filter((r) => r.solved).length;
  state.solved += solvedCount;

  for (const r of results) {
    const d = (state.domains[r.domain] ||= { seen: 0, solved: 0 });
    d.seen += 1;
    if (r.solved) d.solved += 1;
  }

  state.history.unshift({
    date: dateKey,
    results: results.map((r) => ({
      domain: r.domain,
      solved: r.solved,
      hints: r.hints,
      seconds: r.seconds,
    })),
  });
  state.history = state.history.slice(0, 60);

  save(state);
  return state;
}
