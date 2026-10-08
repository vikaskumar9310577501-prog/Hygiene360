const { Jimp } = require('jimp');
const db = require('../database');
const storage = require('./storage');

// Comparison runs on a small square grid so lighting noise and phone resolution don't matter
const N = 96;
const MARGIN = 8;
const BLOCKS = 8;
// Height of the date/time banner the capture screen stamps at the bottom of every live photo
const STAMP_BAND_PX = 76;

async function setting(key, fallback) {
  try {
    const row = await db.get('SELECT value FROM system_settings WHERE key = ?', [key]);
    const v = row ? Number(row.value) : NaN;
    return Number.isFinite(v) ? v : fallback;
  } catch (e) {
    return fallback;
  }
}

async function toGray(source, dropStamp) {
  const img = await Jimp.read(source);
  let { width: w, height: h } = img.bitmap;
  if (dropStamp && h > STAMP_BAND_PX * 4) {
    img.crop({ x: 0, y: 0, w, h: h - STAMP_BAND_PX });
    h -= STAMP_BAND_PX;
  }
  const side = Math.min(w, h);
  img.crop({ x: Math.floor((w - side) / 2), y: Math.floor((h - side) / 2), w: side, h: side });
  img.resize({ w: N, h: N });
  const d = img.bitmap.data;
  const g = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  return g;
}

function normalize(a) {
  let mean = 0;
  for (let i = 0; i < a.length; i++) mean += a[i];
  mean /= a.length;
  let v = 0;
  for (let i = 0; i < a.length; i++) v += (a[i] - mean) ** 2;
  const sd = Math.sqrt(v / a.length) || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] - mean) / sd;
  return out;
}

function gradient(g) {
  const out = new Float32Array(N * N);
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      const gx = g[i - N + 1] + 2 * g[i + 1] + g[i + N + 1] - g[i - N - 1] - 2 * g[i - 1] - g[i + N - 1];
      const gy = g[i + N - 1] + 2 * g[i + N] + g[i + N + 1] - g[i - N - 1] - 2 * g[i - N] - g[i - N + 1];
      out[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

async function features(source, dropStamp) {
  const gray = await toGray(source, dropStamp);
  return { gray: normalize(gray), edge: normalize(gradient(gray)) };
}

// Reference photo URLs are timestamped and never overwritten, so features can be cached per URL
const refCache = new Map();
async function refFeatures(rel) {
  if (refCache.has(rel)) return refCache.get(rel);
  const buf = await storage.read(rel);
  if (!buf) return null;
  const f = await features(buf, false);
  refCache.set(rel, f);
  return f;
}

function bestShift(ref, live) {
  let best = { score: -Infinity, dx: 0, dy: 0 };
  const count = (N - 2 * MARGIN) ** 2;
  for (let dy = -MARGIN; dy <= MARGIN; dy++) {
    for (let dx = -MARGIN; dx <= MARGIN; dx++) {
      let s = 0;
      for (let y = MARGIN; y < N - MARGIN; y++) {
        const ro = y * N;
        const lo = (y + dy) * N + dx;
        for (let x = MARGIN; x < N - MARGIN; x++) s += ref[ro + x] * live[lo + x];
      }
      s /= count;
      if (s > best.score) best = { score: s, dx, dy };
    }
  }
  return best;
}

// Share of the scene that looks different from the clean reference (stains, trash, clutter, water)
function dirtyFraction(ref, live, dx, dy) {
  const span = N - 2 * MARGIN;
  const bs = Math.floor(span / BLOCKS);
  let dirty = 0;
  for (let by = 0; by < BLOCKS; by++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      let diff = 0;
      let extraEdge = 0;
      for (let y = 0; y < bs; y++) {
        for (let x = 0; x < bs; x++) {
          const rx = MARGIN + bx * bs + x;
          const ry = MARGIN + by * bs + y;
          const ri = ry * N + rx;
          const li = (ry + dy) * N + rx + dx;
          diff += Math.abs(ref.gray[ri] - live.gray[li]);
          extraEdge += live.edge[li] - ref.edge[ri];
        }
      }
      const n = bs * bs;
      if (diff / n > 0.9 || extraEdge / n > 0.8) dirty++;
    }
  }
  return dirty / (BLOCKS * BLOCKS);
}

// ---------- Check sheet: same method as the phone guide (client/src/utils/alignGuide.js) ----------
const SD = 96;
const SG = 64;
const SHEET_MARGIN = 6;

function jimpGray(img) {
  const d = img.bitmap.data;
  const n = img.bitmap.width * img.bitmap.height;
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
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
    const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
    if (between > best) { best = between; threshold = i; }
  }
  return threshold;
}

function detectPaper(g, size) {
  const t = otsu(g);
  const mask = new Uint8Array(size * size);
  for (let i = 0; i < g.length; i++) mask[i] = g[i] > t ? 1 : 0;
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
      if (x > 0 && closed[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < size - 1 && closed[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && closed[i - size] && !seen[i - size]) { seen[i - size] = 1; stack[top++] = i - size; }
      if (y < size - 1 && closed[i + size] && !seen[i + size]) { seen[i + size] = 1; stack[top++] = i + size; }
    }
    if (!best || count > best.count) best = { count, x0, y0, x1, y1 };
  }
  if (!best) return { found: false };
  const boxArea = (best.x1 - best.x0 + 1) * (best.y1 - best.y0 + 1);
  return {
    found: boxArea / (size * size) >= 0.08 && best.count / boxArea >= 0.5,
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
  return normalize(e);
}

function rotate90(a, size) {
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) out[x * size + (size - 1 - y)] = a[y * size + x];
  return out;
}

function sheetShift(ref, live) {
  let best = -Infinity;
  const n = (SG - 2 * SHEET_MARGIN) ** 2;
  for (let dy = -SHEET_MARGIN; dy <= SHEET_MARGIN; dy++) {
    for (let dx = -SHEET_MARGIN; dx <= SHEET_MARGIN; dx++) {
      let s = 0;
      for (let y = SHEET_MARGIN; y < SG - SHEET_MARGIN; y++) {
        const ro = y * SG, lo = (y + dy) * SG + dx;
        for (let x = SHEET_MARGIN; x < SG - SHEET_MARGIN; x++) s += ref[ro + x] * live[lo + x];
      }
      if (s / n > best) best = s / n;
    }
  }
  return best;
}

// Live photos: drop the stamp banner and use the centre square, exactly what the phone guide looked at
async function sheetFeatures(source, isLive) {
  const img = await Jimp.read(source);
  let { width: w, height: h } = img.bitmap;
  if (isLive) {
    if (h > STAMP_BAND_PX * 4) { img.crop({ x: 0, y: 0, w, h: h - STAMP_BAND_PX }); h -= STAMP_BAND_PX; }
    const side = Math.min(w, h);
    img.crop({ x: Math.floor((w - side) / 2), y: Math.floor((h - side) / 2), w: side, h: side });
    w = h = side;
  }
  const paper = detectPaper(jimpGray(img.clone().resize({ w: SD, h: SD })), SD);
  if (paper.found) {
    const inset = 0.03;
    const bw = paper.x1 - paper.x0, bh = paper.y1 - paper.y0;
    const x = Math.floor((paper.x0 + bw * inset) * w);
    const y = Math.floor((paper.y0 + bh * inset) * h);
    const cw = Math.min(w - x, Math.max(8, Math.floor(bw * (1 - 2 * inset) * w)));
    const ch = Math.min(h - y, Math.max(8, Math.floor(bh * (1 - 2 * inset) * h)));
    img.crop({ x, y, w: cw, h: ch });
  }
  return edgeNorm(jimpGray(img.resize({ w: SG, h: SG })), SG);
}

const sheetRefCache = new Map();
async function sheetRefVariants(rel) {
  if (sheetRefCache.has(rel)) return sheetRefCache.get(rel);
  const buf = await storage.read(rel);
  if (!buf) return null;
  const base = await sheetFeatures(buf, false);
  const r90 = rotate90(base, SG);
  const r180 = rotate90(r90, SG);
  const variants = [base, r90, r180, rotate90(r180, SG)];
  sheetRefCache.set(rel, variants);
  return variants;
}

// The check sheet only has to be the real sheet: ticks and handwriting are expected differences
async function checkSheetAgainstRefs(liveBuffer, refPaths) {
  const minScene = await setting('sheet_check_min_match', 22);
  const live = await sheetFeatures(liveBuffer, true);
  let bestScore = null;
  for (const rel of refPaths) {
    const variants = rel ? await sheetRefVariants(rel) : null;
    if (!variants) continue;
    for (const v of variants) {
      const score = Math.max(0, Math.min(100, Math.round(sheetShift(v, live) * 100)));
      if (bestScore === null || score > bestScore) bestScore = score;
    }
  }
  if (bestScore === null) return { checked: false, passed: true };
  if (bestScore < minScene) {
    return {
      checked: true, passed: false, code: 'WRONG_SHEET', sceneScore: bestScore,
      message: `Photo rejected: this is not the check sheet (match ${bestScore}%). Show the full check sheet inside the frame like the reference.`
    };
  }
  return { checked: true, passed: true, sceneScore: bestScore, message: `Check sheet recognised (${bestScore}%).` };
}

async function checkAgainstRefs(liveBuffer, refPaths) {
  const minScene = await setting('clean_check_min_scene', 25);
  const minClean = await setting('clean_check_min_score', 50);
  const live = await features(liveBuffer, true);

  let best = null;
  for (const rel of refPaths) {
    const ref = rel ? await refFeatures(rel) : null;
    if (!ref) continue;
    const shift = bestShift(ref.edge, live.edge);
    const sceneScore = Math.max(0, Math.min(100, Math.round(shift.score * 100)));
    const frac = dirtyFraction(ref, live, shift.dx, shift.dy);
    const cleanScore = Math.max(0, Math.round(100 * (1 - Math.min(1, frac / 0.4))));
    const r = { sceneScore, cleanScore, refPath: rel };
    const rank = (sceneScore >= minScene ? 1000 : 0) + cleanScore + sceneScore / 100;
    if (!best || rank > best.rank) best = { ...r, rank };
  }

  if (!best) return { checked: false, passed: true };
  const { rank, ...result } = best;
  if (result.sceneScore < minScene) {
    return {
      checked: true, passed: false, code: 'WRONG_VIEW', ...result,
      message: `Photo rejected: this does not match the toilet reference view (match ${result.sceneScore}%). Stand at the marked spot and follow the on-screen guide.`
    };
  }
  if (result.cleanScore < minClean) {
    return {
      checked: true, passed: false, code: 'NOT_CLEAN', ...result,
      message: `Photo rejected: the toilet does not look clean compared to the reference (clean score ${result.cleanScore}%). Please clean properly and retake.`
    };
  }
  return { checked: true, passed: true, ...result, message: `Clean check passed (${result.cleanScore}%).` };
}

const MAX_REFS = 4;

// Check sheets are usually the same printed form plant-wide, so a toilet without its own sheet photos uses the plant's
async function getToiletRefs(toiletId, kind = 'TOILET', { fallbackToPlant = kind === 'CHECK_SHEET' } = {}) {
  const own = await db.all('SELECT * FROM toilet_reference_photos WHERE toilet_id = ? AND kind = ? ORDER BY id ASC', [toiletId, kind]);
  if (own.length || !fallbackToPlant) return own;
  const toilet = await db.get('SELECT plant_id FROM toilets WHERE id = ?', [toiletId]);
  if (!toilet) return own;
  return db.all(
    'SELECT * FROM toilet_reference_photos WHERE plant_id = ? AND kind = ? ORDER BY id DESC LIMIT ?',
    [toilet.plant_id, kind, MAX_REFS]
  );
}

module.exports = { checkAgainstRefs, checkSheetAgainstRefs, getToiletRefs };
