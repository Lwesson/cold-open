// Seeded pseudo-random number generator.
//
// The daily puzzle is derived from the date string alone. Every player gets the
// same three puzzles on the same day with no server involved, which is what lets
// this ship as static files.

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seedStr) {
  const next = mulberry32(hashSeed(String(seedStr)));
  const int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return {
    next,
    int,
    pick,
    shuffle,
    bool: (p = 0.5) => next() < p,
    sample: (arr, n) => shuffle(arr).slice(0, n),
  };
}

// Local date as YYYY-MM-DD. Local rather than UTC so the puzzle rolls over at
// the player's midnight, not at some hour that feels arbitrary to them.
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dayNumber(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const epoch = Date.UTC(2026, 0, 1);
  return Math.floor((Date.UTC(y, m - 1, d) - epoch) / 86400000) + 1;
}

export function previousKey(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) - 86400000);
  return todayKey(new Date(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}
