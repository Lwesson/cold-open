# Cold Open

A daily security puzzle. Three real techniques, about five minutes, generated
fresh every day.

**Play it:** https://lwesson.github.io/cold-open/

## Run it

```bash
cd cold-open
python3 -m http.server 8080
```

Then open http://localhost:8080

A server is required because the game uses ES modules, which browsers refuse to
load over `file://`. Any static server works.

## Test

```bash
node tests/run.mjs
```

No dependencies, no framework, no browser.

## How it works

**Generators, not authored puzzles.** Each domain module exports `generate(rng)`
and builds a fresh instance from a seeded random number generator. That gives
unlimited content from a small amount of code, and it means nobody can post the
answer online. The only thing anyone can share is the method, which is the thing
worth spreading.

**The daily puzzle needs no server.** The seed is the date string. Every player
in the world gets the same three puzzles on the same day, derived locally. This
is what lets the whole game ship as static files with no backend and no hosting
cost.

**One puzzle per domain per day**, in a seed-shuffled order.

| Module | Domain | Skill |
|---|---|---|
| `cipher.js` | crypto | Caesar, Vigenere, single byte XOR |
| `logscan.js` | forensics | Brute force success, hostile sudo, web attack |
| `netflow.js` | network | Exfiltration, C2 beaconing, DNS tunneling |

## Adding a domain

Write a module that exports `meta` and `generate(rng)`, then add it to
`js/puzzles/index.js`. Nothing else changes. The puzzle object needs:

```js
{
  meta,                    // { id, name, domain }
  brief,                   // one line objective
  mode,                    // "text" or "pick"
  solution,                // shown on a miss
  hints: [a, b, c],        // progressive, each costs 30 seconds
  explain: { method, real, next: { label, url } },
  check(value),            // true if correct
  render(root, onPick),    // draw into root
}
```

The test suite picks new modules up automatically and will hold them to the same
contract as the existing three.

## Layout

```
index.html        markup and screens
styles.css        all styling
js/rng.js         seeded PRNG, date to seed, day numbering
js/state.js       localStorage: streak, history, per domain stats
js/share.js       spoiler free result card and clipboard
js/main.js        screen flow, timer, scoring
js/puzzles/       one module per domain plus the registry
tests/run.mjs     headless checks
```

## The look

The name is a film term: the scene that runs before the title card. So the
interface is a dossier handed to you in the dark, not a security dashboard.

**One signal colour.** Gold means "this is the thing to press." Nothing else in
the interface is allowed to use it, which is why hints are grey and a disabled
primary button keeps a gold tint rather than going flat.

**One content object, repeated.** The handler panel, the explain cards, and the
share card are all the same thing: a hairline box with a labelled header bar.
Repeating one object is what makes five screens feel like one document.

**Square corners, no gradients, no glow.** Gradient text and neon shadows are
the house style of every security site there is, which makes them invisible.
Weight, rules, and negative space do the same work and age better.

**Type is the design.** IBM Plex Sans Condensed for display, Plex Sans for body,
Plex Mono for every label and every number. Fonts come from Google with a real
fallback stack, so the layout survives being offline.

**Atmosphere is film, not particles.** `backdrop.js` draws grain from one
pre-rendered tile at 12fps, plus a single gold band drifting down every 23
seconds. Two fills per frame, and the loop stops when the tab is hidden.

## Design decisions worth keeping

**Hints cost time rather than being free or forbidden.** A hint is 30 seconds on
the clock, so a stuck player always has a way forward and a fast player is still
rewarded. Nobody gets walled.

**The explain screen runs on a miss as well as a solve.** Failing is where the
teaching lands, so it is the wrong moment to show nothing.

**Four leaderboards, not one** (designed, not built yet). Global all time boards tell a new player they are
rank 40,000 and to go away. Daily, percentile, streak, and per domain each give a
different player a reason to feel like they are winning something.

**Every puzzle has exactly one defensible answer, and the tests enforce it.**
A generator that lets a benign row look like a second incident marks a correct
analyst wrong, which teaches the opposite of the skill. Hints are held to the
same bar: if a hint makes a claim about the puzzle, a test checks the claim
across the whole corpus.

**The share card is deliberately spoiler free.** It reports squares and a time,
never a puzzle or an answer, so it can be posted the moment someone finishes.

## Not built yet

- Server backed leaderboards. All four are designed, none exist. Everything so
  far is local only.
- Percentile ranking, which needs other players' times and therefore a backend.
- Affiliate links are placeholders pointing at the plain sites. They need real
  tracking parameters once the programs are approved.
- Onboarding for a first time player. The handler voice (browser speech,
  off by default) and the film backdrop are built.

## License

MIT. See `LICENSE`.
