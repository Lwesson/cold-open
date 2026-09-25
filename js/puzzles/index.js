// Generator registry. Adding a fourth domain means writing one module that
// exports meta and generate, then adding it here. Nothing else changes.

import * as cipher from "./cipher.js";
import * as logscan from "./logscan.js";
import * as netflow from "./netflow.js";

export const GENERATORS = [cipher, logscan, netflow];

// A daily run is one puzzle from each domain. The domain order is seed shuffled
// so the sequence varies day to day, but difficulty always climbs 1, 2, 3. The
// first puzzle of the day should be winnable by someone who has never done this
// before, and the last should not be.
export function dailySet(rng) {
  return rng.shuffle(GENERATORS).map((g, i) => g.generate(rng, i + 1));
}

export function randomOne(rng, difficulty) {
  return rng.pick(GENERATORS).generate(rng, difficulty || rng.int(1, 3));
}
