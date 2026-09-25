// Spoiler-free result card.
//
// This is the distribution engine, not a nicety. It has to say enough to invite
// a reply and nothing that spoils the day's puzzles. Players arriving from a
// shared card count as your own traffic on portals that split revenue by source.

const SQUARE = { clean: "\u{1F7E9}", hinted: "\u{1F7E8}", failed: "\u{2B1B}" };

export function buildCard({ dayNumber, results, totalSeconds, streak, url }) {
  const grid = results
    .map((r) => (!r.solved ? SQUARE.failed : r.hints === 0 ? SQUARE.clean : SQUARE.hinted))
    .join("");
  const time = formatClock(totalSeconds);
  const lines = [`COLD OPEN #${dayNumber}`, `${grid}  ${time}`];
  if (streak > 1) lines.push(`${streak} day streak`);
  if (url) lines.push(url);
  return lines.join("\n");
}

export function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Clipboard access throws in insecure contexts and inside some portal frames.
// Fall back to a hidden textarea, then report honestly if neither worked.
export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
