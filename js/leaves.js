// Autumn leaves: a gentle fall behind the content, and a burst of leaves when a challenge is passed.

const COLORS = ['#C05828', '#C8943A', '#9E3D22', '#A07828', '#6A6B38', '#E0BC72'];
const AMBIENT_COUNT = 14;
const BURST_COUNT = 26;
// The background fall runs at about 30 fps to save battery; bursts use every frame.
const AMBIENT_FRAME_MS = 33;
// Mobile browsers resize the viewport while their toolbars slide in and out.
const RESIZE_DELAY_MS = 150;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const layers = { ambient: null, burst: null };
let width = 0;
let height = 0;
let ambient = [];
let bursts = [];
let running = false;
let last = 0;
let resizeTimer = 0;

const random = (min, max) => min + Math.random() * (max - min);
const pick = (items) => items[Math.floor(Math.random() * items.length)];

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  for (const layer of Object.values(layers)) {
    layer.canvas.width = Math.round(width * ratio);
    layer.canvas.height = Math.round(height * ratio);
    layer.context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
}

function ambientLeaf(anywhere) {
  return {
    x: random(0, width),
    y: anywhere ? random(-height, height) : random(-60, -20),
    size: random(6, 11),
    fall: random(0.35, 0.8),
    drift: random(-0.25, 0.25),
    swing: random(0, Math.PI * 2),
    swingSpeed: random(0.012, 0.024),
    rotation: random(0, Math.PI * 2),
    spin: random(-0.02, 0.02),
    flip: random(0, Math.PI * 2),
    flipSpeed: random(0.02, 0.05),
    color: pick(COLORS),
    alpha: random(0.28, 0.5),
  };
}

function burstLeaf(x, y) {
  const angle = random(0, Math.PI * 2);
  const speed = random(3, 8);
  return {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 3,
    size: random(7, 13),
    rotation: random(0, Math.PI * 2),
    spin: random(-0.2, 0.2),
    flip: random(0, Math.PI * 2),
    flipSpeed: random(0.1, 0.25),
    color: pick(COLORS),
    alpha: 1,
    life: 1,
  };
}

/** A pointed leaf with a vein, seen at an angle that changes as it flips. */
function drawLeaf(context, leaf) {
  const { size } = leaf;
  context.save();
  context.translate(leaf.x, leaf.y);
  context.rotate(leaf.rotation);
  context.scale(1, Math.max(Math.abs(Math.cos(leaf.flip)), 0.15));
  context.globalAlpha = leaf.alpha;
  context.fillStyle = leaf.color;
  context.beginPath();
  context.moveTo(0, -size);
  context.bezierCurveTo(size * 0.9, -size * 0.45, size * 0.75, size * 0.55, 0, size);
  context.bezierCurveTo(-size * 0.75, size * 0.55, -size * 0.9, -size * 0.45, 0, -size);
  context.fill();
  context.strokeStyle = 'rgba(58, 36, 24, 0.45)';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, -size * 0.75);
  context.lineTo(0, size * 1.3);
  context.stroke();
  context.restore();
}

function step(now) {
  if (bursts.length === 0 && now - last < AMBIENT_FRAME_MS) {
    requestAnimationFrame(step);
    return;
  }
  const dt = Math.min((now - last) / 16.7, 3);
  last = now;

  if (ambient.length > 0) {
    const ambientContext = layers.ambient.context;
    ambientContext.clearRect(0, 0, width, height);
    for (const leaf of ambient) {
      leaf.swing += leaf.swingSpeed * dt;
      leaf.flip += leaf.flipSpeed * dt;
      leaf.rotation += leaf.spin * dt;
      leaf.x += (leaf.drift + Math.sin(leaf.swing) * 0.6) * dt;
      leaf.y += leaf.fall * dt;
      // A leaf blown off one side comes back from the other.
      if (leaf.x < -30) leaf.x += width + 60;
      else if (leaf.x > width + 30) leaf.x -= width + 60;
      if (leaf.y > height + 30) Object.assign(leaf, ambientLeaf(false));
      drawLeaf(ambientContext, leaf);
    }
  }

  // The frame that drops the last burst leaf also wipes the layer, which then stays untouched.
  if (bursts.length > 0) {
    const burstContext = layers.burst.context;
    burstContext.clearRect(0, 0, width, height);
    bursts = bursts.filter((leaf) => leaf.life > 0);
    for (const leaf of bursts) {
      const drag = 0.985 ** dt;
      leaf.vx *= drag;
      leaf.vy = leaf.vy * drag + 0.18 * dt;
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.rotation += leaf.spin * dt;
      leaf.flip += leaf.flipSpeed * dt;
      leaf.life -= 0.012 * dt;
      leaf.alpha = Math.max(leaf.life, 0);
      drawLeaf(burstContext, leaf);
    }
  }

  if (ambient.length > 0 || bursts.length > 0) {
    requestAnimationFrame(step);
  } else {
    running = false;
  }
}

function ensureRunning() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(step);
}

function applyMotionPreference() {
  if (reducedMotion.matches) {
    ambient = [];
    bursts = [];
    for (const layer of Object.values(layers)) layer.context.clearRect(0, 0, width, height);
    return;
  }
  ambient = Array.from({ length: AMBIENT_COUNT }, () => ambientLeaf(true));
  ensureRunning();
}

export function startLeaves(ambientCanvas, burstCanvas) {
  const ambientContext = ambientCanvas.getContext('2d');
  const burstContext = burstCanvas.getContext('2d');
  // No 2D canvas (for example a blocked one): no leaves, and burstLeaves() does nothing.
  if (!ambientContext || !burstContext) return;
  layers.ambient = { canvas: ambientCanvas, context: ambientContext };
  layers.burst = { canvas: burstCanvas, context: burstContext };
  resize();
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, RESIZE_DELAY_MS);
  });
  reducedMotion.addEventListener('change', applyMotionPreference);
  applyMotionPreference();
}

/** Throws a handful of leaves from a point of the screen (CSS pixels). */
export function burstLeaves(x, y) {
  if (!layers.burst || reducedMotion.matches) return;
  for (let i = 0; i < BURST_COUNT; i += 1) bursts.push(burstLeaf(x, y));
  ensureRunning();
}
