// The handler's briefing.
//
// Assembled from parts against the puzzle's own generated details rather than
// selected from a list of finished paragraphs. A fixed set of briefings would be
// the same problem as a fixed set of puzzles: the player stops reading once they
// recognise the shape, and the words stop doing any work.

const CALLS = [
  "You are up.", "Go ahead.", "You are on.", "Listen up.", "Got a live one.",
  "You are needed.", "Here we go.", "Eyes up.",
];

const HANDOFFS = [
  "This came in a few minutes ago.", "Day shift flagged it and went home.",
  "Nobody upstairs has looked at this yet.", "It landed while you were reading the last one.",
  "This one came through the on call line.", "Someone noticed it late.",
  "It has been sitting in the queue for an hour.", "This got escalated to us directly.",
];

const STAKES = {
  1: [
    "Nothing is on fire. Take your time and get it right.",
    "This one is straightforward. Read carefully and it will come to you.",
    "Low stakes. Treat it as a warm up.",
    "No pressure on this one. Just work it.",
  ],
  2: [
    "It is not obvious, so do not rush it.",
    "There is more noise here than the last one. Slow down.",
    "A couple of things in here will look wrong and be perfectly fine.",
    "Take the extra minute. Guessing will cost you more.",
  ],
  3: [
    "This one is buried. Assume the first thing you notice is a decoy.",
    "Whoever did this knew what normal looks like here. So do you.",
    "Nothing here announces itself. You will have to combine two things.",
    "The obvious answer is wrong. It usually is by this point.",
  ],
};

const SIGNOFFS = [
  "Find it.", "Call it when you have it.", "Give me the line.",
  "Show me what you find.", "Your call.", "Mark it and we move.",
  "Tell me which one.", "Flag it.",
];

const DOMAIN_COLOUR = {
  crypto: ["Signals pulled this off a seized handset.", "This came out of an intercept.", "Forensics recovered this from a device."],
  forensics: ["This is straight off the host.", "These are the raw logs, unfiltered.", "This is what the box actually recorded."],
  network: ["This is an hour of flow data off the core switch.", "Sensor dumped this from the egress point.", "This is everything that crossed the perimeter."],
};

export function composeBriefing(rng, puzzle, position, total) {
  const d = puzzle.difficulty || 2;
  const parts = [];

  if (position === 0) parts.push(rng.pick(CALLS));
  else if (position === total - 1) parts.push(rng.pick(["Last one.", "One more.", "Final item.", "This is the last of it."]));
  else parts.push(rng.pick(["Next.", "Moving on.", "Here is the next one.", "Keep going."]));

  parts.push(rng.pick(HANDOFFS));
  parts.push(rng.pick(DOMAIN_COLOUR[puzzle.meta.domain] || []));
  if (puzzle.situation) parts.push(`${puzzle.situation}.`);
  parts.push(rng.pick(STAKES[d] || STAKES[2]));
  parts.push(puzzle.brief);
  parts.push(rng.pick(SIGNOFFS));

  return parts.filter(Boolean).join(" ");
}
