// Living backdrop: film grain and a slow telecine sweep.
//
// The name is a film term, so the atmosphere is film, not a particle network.
// Two layers only. Grain, blitted from one pre-rendered tile at a deliberately
// low frame rate because real grain jumps rather than glides. And a single wide
// gold band drifting down the page every twenty odd seconds, the way a scan head
// crosses a frame. Both sit under the vignette so they read as texture, never as
// something competing for attention.
//
// Cheap by construction: the noise is generated once, every frame is two fills,
// the loop runs at 12fps instead of 60, and it stops entirely when the tab is
// hidden or the player asked for reduced motion.

const TILE = 128;
const GRAIN_FPS = 12;
const GRAIN_ALPHA = 0.055;
const SWEEP_MS = 23000;
const SWEEP_HEIGHT = 300;

let raf = null;
let canvas = null;
let ctx = null;
let pattern = null;
let w = 0;
let h = 0;
let dpr = 1;
let lastGrain = 0;
let grainOffset = [0, 0];

function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// One tile of warm monochrome noise. Alpha varies per pixel, colour does not,
// so overall intensity is a single globalAlpha at draw time.
function buildGrain() {
  const tile = document.createElement("canvas");
  tile.width = TILE;
  tile.height = TILE;
  const tctx = tile.getContext("2d");
  if (!tctx) return null;

  const img = tctx.createImageData(TILE, TILE);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 246;
    data[i + 2] = 232;
    data[i + 3] = Math.random() * 255;
  }
  tctx.putImageData(img, 0, 0);
  return ctx.createPattern(tile, "repeat");
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  w = canvas.clientWidth;
  h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
}

function drawGrain() {
  const [ox, oy] = grainOffset;
  // Device pixels, no dpr transform: grain wants to be one real pixel wide.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = GRAIN_ALPHA;
  ctx.translate(ox, oy);
  ctx.fillStyle = pattern;
  ctx.fillRect(-ox, -oy, canvas.width, canvas.height);
  ctx.globalAlpha = 1;
}

function drawSweep(t) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const travel = h + SWEEP_HEIGHT * 2;
  const y = ((t % SWEEP_MS) / SWEEP_MS) * travel - SWEEP_HEIGHT;
  const g = ctx.createLinearGradient(0, y - SWEEP_HEIGHT / 2, 0, y + SWEEP_HEIGHT / 2);
  g.addColorStop(0, "rgba(233, 185, 73, 0)");
  g.addColorStop(0.5, "rgba(233, 185, 73, 0.05)");
  g.addColorStop(1, "rgba(233, 185, 73, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, y - SWEEP_HEIGHT / 2, w, SWEEP_HEIGHT);
}

function frame(t) {
  // Grain resamples on its own slow clock; the sweep moves every frame so it
  // never looks stepped.
  if (t - lastGrain >= 1000 / GRAIN_FPS) {
    lastGrain = t;
    grainOffset = [
      -Math.floor(Math.random() * TILE),
      -Math.floor(Math.random() * TILE),
    ];
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrain();
  drawSweep(t);
  raf = requestAnimationFrame(frame);
}

function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = null;
}

export function init(el) {
  canvas = el;
  if (!canvas || !canvas.getContext) return;
  ctx = canvas.getContext("2d");
  if (!ctx) return;

  resize();
  pattern = buildGrain();
  if (!pattern) return;

  if (reducedMotion()) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrain();
    return;
  }

  let t = null;
  window.addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(resize, 180);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (!raf) raf = requestAnimationFrame(frame);
  });

  raf = requestAnimationFrame(frame);
}
