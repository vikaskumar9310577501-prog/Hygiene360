// Live camera angle guide: compares video frames with the toilet reference photos entirely on the phone
const G = 64;
const MARGIN = 10;
const STEP = 2;
const CROPS = [1, 0.85, 0.72];

// Roughly the same angle is enough; the server still checks cleanliness against the reference
export const ALIGN_SCORE = 0.25;
export const NEAR_SCORE = 0.12;
const CENTER_TOLERANCE = 6;
// A zoom/shift hint is only given when it is clearly better than the current framing
const ZOOM_MARGIN = 0.05;
// Another reference photo must be clearly better before the guide switches to it
const SWITCH_MARGIN = 0.07;

let workCanvas = null;
function ctx2d() {
  if (!workCanvas) {
    workCanvas = document.createElement('canvas');
    workCanvas.width = G;
    workCanvas.height = G;
  }
  return workCanvas.getContext('2d', { willReadFrequently: true });
}

function edgeFeatures(source, sw, sh, crop) {
  const ctx = ctx2d();
  const side = Math.min(sw, sh) * crop;
  ctx.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side, 0, 0, G, G);
  const d = ctx.getImageData(0, 0, G, G).data;
  const g = new Float32Array(G * G);
  for (let i = 0; i < G * G; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;

  const e = new Float32Array(G * G);
  for (let y = 1; y < G - 1; y++) {
    for (let x = 1; x < G - 1; x++) {
      const i = y * G + x;
      const gx = g[i - G + 1] + 2 * g[i + 1] + g[i + G + 1] - g[i - G - 1] - 2 * g[i - 1] - g[i + G - 1];
      const gy = g[i + G - 1] + 2 * g[i + G] + g[i + G + 1] - g[i - G - 1] - 2 * g[i - G] - g[i - G + 1];
      e[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  let mean = 0;
  for (let i = 0; i < e.length; i++) mean += e[i];
  mean /= e.length;
  let v = 0;
  for (let i = 0; i < e.length; i++) v += (e[i] - mean) ** 2;
  const sd = Math.sqrt(v / e.length) || 1;
  for (let i = 0; i < e.length; i++) e[i] = (e[i] - mean) / sd;
  return e;
}

function correlate(ref, live, dx, dy) {
  let s = 0;
  for (let y = MARGIN; y < G - MARGIN; y++) {
    const ro = y * G;
    const lo = (y + dy) * G + dx;
    for (let x = MARGIN; x < G - MARGIN; x++) s += ref[ro + x] * live[lo + x];
  }
  return s / (G - 2 * MARGIN) ** 2;
}

function bestShift(ref, live) {
  let best = { score: -Infinity, dx: 0, dy: 0 };
  for (let dy = -MARGIN; dy <= MARGIN; dy += STEP) {
    for (let dx = -MARGIN; dx <= MARGIN; dx += STEP) {
      const s = correlate(ref, live, dx, dy);
      if (s > best.score) best = { score: s, dx, dy };
    }
  }
  const coarse = best;
  for (let dy = coarse.dy - 1; dy <= coarse.dy + 1; dy++) {
    for (let dx = coarse.dx - 1; dx <= coarse.dx + 1; dx++) {
      if (Math.abs(dx) > MARGIN || Math.abs(dy) > MARGIN || (dx === coarse.dx && dy === coarse.dy)) continue;
      const s = correlate(ref, live, dx, dy);
      if (s > best.score) best = { score: s, dx, dy };
    }
  }
  return best;
}

// ---------- Check sheet: find the paper anywhere in the frame, then compare its printed layout ----------
const D = 96;
const SHEET_MARGIN = 6;
export const SHEET_ALIGN_SCORE = 0.3;
export const SHEET_NEAR_SCORE = 0.15;
const MIN_PAPER_FRACTION = 0.18;

function grayFrom(source, sx, sy, sw, sh, size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, size, size);
  const d = ctx.getImageData(0, 0, size, size).data;
  const g = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  return g;
}

function otsu(g) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = g.length - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = i; }
  }
  return threshold;
}

// Largest bright, roughly rectangular blob = the sheet of paper. Returns a box in 0..1 coordinates.
export function detectPaper(g, size = D) {
  const t = otsu(g);
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < g.length; i++) mask[i] = g[i] > t ? 1 : 0;
  // Close small gaps left by printed lines and handwriting
  const closed = new Uint8Array(size * size);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      closed[i] = mask[i] || (mask[i - 1] && mask[i + 1]) || (mask[i - size] && mask[i + size]) ? 1 : 0;
    }
  }
  const seen = new Uint8Array(size * size);
  const stack = new Int32Array(size * size);
  let best = null;
  for (let start = 0; start < closed.length; start++) {
    if (!closed[start] || seen[start]) continue;
    let top = 0, count = 0, x0 = size, y0 = size, x1 = 0, y1 = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top) {
      const i = stack[--top];
      const x = i % size, y = (i / size) | 0;
      count++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const nb = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, y > 0 ? i - size : -1, y < size - 1 ? i + size : -1];
      for (const n of nb) if (n >= 0 && closed[n] && !seen[n]) { seen[n] = 1; stack[top++] = n; }
    }
    if (!best || count > best.count) best = { count, x0, y0, x1, y1 };
  }
  if (!best) return { found: false, fraction: 0 };
  const boxArea = (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1);
  const fraction = boxArea / (size * size);
  const fill = best.count / boxArea;
  return {
    found: fraction >= 0.08 && fill >= 0.5,
    fraction,
    x0: best.x0 / size, y0: best.y0 / size, x1: (best.x1 + 1) / size, y1: (best.y1 + 1) / size
  };
}

function edgeNorm(g, size) {
  const e = new Float32Array(size * size);
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const gx = g[i - size + 1] + 2 * g[i + 1] + g[i + size + 1] - g[i - size - 1] - 2 * g[i - 1] - g[i + size - 1];
      const gy = g[i + size - 1] + 2 * g[i + size] + g[i + size + 1] - g[i - size - 1] - 2 * g[i - size] - g[i - size + 1];
      e[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  let mean = 0;
  for (let i = 0; i < e.length; i++) mean += e[i];
  mean /= e.length;
  let v = 0;
  for (let i = 0; i < e.length; i++) v += (e[i] - mean) ** 2;
  const sd = Math.sqrt(v / e.length) || 1;
  for (let i = 0; i < e.length; i++) e[i] = (e[i] - mean) / sd;
  return e;
}

function rotate90(a, size) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[x * size + (size - 1 - y)] = a[y * size + x];
  return out;
}

function sheetShift(ref, live) {
  let best = -Infinity;
  const n = (G - 2 * SHEET_MARGIN) ** 2;
  for (let dy = -SHEET_MARGIN; dy <= SHEET_MARGIN; dy += 2) {
    for (let dx = -SHEET_MARGIN; dx <= SHEET_MARGIN; dx += 2) {
      let s = 0;
      for (let y = SHEET_MARGIN; y < G - SHEET_MARGIN; y++) {
        const ro = y * G, lo = (y + dy) * G + dx;
        for (let x = SHEET_MARGIN; x < G - SHEET_MARGIN; x++) s += ref[ro + x] * live[lo + x];
      }
      if (s / n > best) best = s / n;
    }
  }
  return best;
}

// Region (sx, sy, sw, sh) of the source → paper box + layout features of the paper
function sheetFeaturesFrom(source, sx, sy, sw, sh) {
  const paper = detectPaper(grayFrom(source, sx, sy, sw, sh, D));
  let cx = sx, cy = sy, cw = sw, ch = sh;
  if (paper.found) {
    const inset = 0.03;
    const bw = paper.x1 - paper.x0, bh = paper.y1 - paper.y0;
    cx = sx + (paper.x0 + bw * inset) * sw;
    cy = sy + (paper.y0 + bh * inset) * sh;
    cw = bw * (1 - 2 * inset) * sw;
    ch = bh * (1 - 2 * inset) * sh;
  }
  return { paper, features: edgeNorm(grayFrom(source, cx, cy, cw, ch, G), G) };
}

export function prepareSheetReference(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const base = sheetFeaturesFrom(img, 0, 0, w, h).features;
  const r90 = rotate90(base, G);
  const r180 = rotate90(r90, G);
  return [base, r90, r180, rotate90(r180, G)];
}

export function evaluateSheetFrame(video, refs, memory = {}) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h || !refs.length) return null;
  const side = Math.min(w, h);
  const { paper, features } = sheetFeaturesFrom(video, (w - side) / 2, (h - side) / 2, side, side);

  let raw = -Infinity;
  for (const variants of refs) for (const v of variants) raw = Math.max(raw, sheetShift(v, features));
  const score = memory.score != null ? memory.score * 0.5 + raw * 0.5 : raw;
  memory.score = score;

  const bigEnough = paper.found && paper.fraction >= MIN_PAPER_FRACTION;
  const aligned = score >= SHEET_ALIGN_SCORE && (bigEnough || score >= SHEET_ALIGN_SCORE + 0.1);
  const hints = [];
  if (!aligned) {
    if (!paper.found) hints.push('searchSheet');
    else if (!bigEnough) hints.push('closer');
    else hints.push('steady');
  }
  return {
    score,
    alignScore: SHEET_ALIGN_SCORE,
    aligned,
    near: score >= SHEET_NEAR_SCORE || bigEnough,
    hints,
    paper: paper.found ? { x0: paper.x0, y0: paper.y0, x1: paper.x1, y1: paper.y1 } : null
  };
}

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export function prepareReference(img) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  return CROPS.map(c => edgeFeatures(img, w, h, c));
}

function evaluateRef(ref, live) {
  const straight = bestShift(ref[0], live[0]);
  const zooms = [
    { ...bestShift(ref[1], live[0]), zoom: 'back' },
    { ...bestShift(ref[2], live[0]), zoom: 'back' },
    { ...bestShift(ref[0], live[1]), zoom: 'closer' },
    { ...bestShift(ref[0], live[2]), zoom: 'closer' }
  ];
  const bestZoom = zooms.reduce((a, b) => (b.score > a.score ? b : a));
  if (bestZoom.score > straight.score + ZOOM_MARGIN) return bestZoom;
  return { ...straight, zoom: null };
}

// Returns how well the frame matches the reference and which way to move the phone.
// `memory` (kept by the caller between frames) holds the locked reference and smoothed readings.
export function evaluateFrame(video, refs, memory = {}) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h || !refs.length) return null;
  const live = CROPS.map(c => edgeFeatures(video, w, h, c));

  const results = refs.map(ref => evaluateRef(ref, live));
  let refIndex = results.reduce((bi, r, i) => (r.score > results[bi].score ? i : bi), 0);
  const locked = memory.refIndex;
  if (locked != null && locked < results.length && locked !== refIndex
      && results[refIndex].score < results[locked].score + SWITCH_MARGIN) {
    refIndex = locked;
  }
  const r = results[refIndex];

  const sameRef = memory.refIndex === refIndex;
  const smooth = (prev, cur) => (sameRef && prev != null ? prev * 0.5 + cur * 0.5 : cur);
  const score = smooth(memory.score, r.score);
  const dx = smooth(memory.dx, r.dx);
  const dy = smooth(memory.dy, r.dy);
  Object.assign(memory, { refIndex, score, dx, dy });

  // Framing hints are advice only; the match score alone decides
  const aligned = score >= ALIGN_SCORE;
  const hints = [];
  if (score >= NEAR_SCORE && !aligned) {
    if (r.zoom === 'back') hints.push('back');
    if (r.zoom === 'closer') hints.push('closer');
    if (dx > CENTER_TOLERANCE) hints.push('right');
    if (dx < -CENTER_TOLERANCE) hints.push('left');
    if (dy > CENTER_TOLERANCE) hints.push('down');
    if (dy < -CENTER_TOLERANCE) hints.push('up');
    if (!hints.length) hints.push('steady');
  }
  return { score, alignScore: ALIGN_SCORE, refIndex, aligned, near: score >= NEAR_SCORE, hints };
}
