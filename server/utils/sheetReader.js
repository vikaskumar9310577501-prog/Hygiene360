// Reads the printed daily check sheet: finds the table, flattens it, locates every cell and detects ticks.
const { Jimp } = require('jimp');

let cvPromise = null;
function getCv() {
  if (!cvPromise) {
    cvPromise = new Promise((resolve, reject) => {
      let cv;
      try { cv = require('@techstark/opencv-js'); } catch (e) { reject(e); return; }
      // The module is itself a thenable; resolving a promise with it would recurse forever
      const ready = () => { try { delete cv.then; } catch (e) {} resolve(cv); };
      if (cv.Mat) ready();
      else cv.onRuntimeInitialized = ready;
    });
  }
  return cvPromise;
}

const WORK_W = 1600;
const FLAT_W = 1600;

function orderCorners(pts) {
  const bySum = [...pts].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => (a.y - a.x) - (b.y - b.x));
  return { tl: bySum[0], br: bySum[3], tr: byDiff[0], bl: byDiff[3] };
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// Positions where a line mask has a long run along the row/column, merged into single line positions
function linePositions(mask, horizontal, minFill) {
  const rows = mask.rows, cols = mask.cols, data = mask.data;
  const len = horizontal ? rows : cols;
  const span = horizontal ? cols : rows;
  const profile = new Float32Array(len);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (data[y * cols + x]) profile[horizontal ? y : x]++;
    }
  }
  const lines = [];
  let start = -1, weight = 0, acc = 0;
  for (let i = 0; i <= len; i++) {
    const on = i < len && profile[i] >= span * minFill;
    if (on) {
      if (start < 0) { start = i; weight = 0; acc = 0; }
      weight += profile[i];
      acc += profile[i] * i;
    } else if (start >= 0) {
      lines.push(acc / weight);
      start = -1;
    }
  }
  const merged = [];
  for (const p of lines) {
    if (merged.length && p - merged[merged.length - 1] < 6) merged[merged.length - 1] = (merged[merged.length - 1] + p) / 2;
    else merged.push(p);
  }
  return merged;
}

function lineMasks(cv, gray) {
  const bin = new cv.Mat();
  cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 25, 12);
  const h = new cv.Mat();
  const v = new cv.Mat();
  const hk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(20, Math.round(gray.cols / 40)), 1));
  const vk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, Math.max(15, Math.round(gray.rows / 60))));
  cv.morphologyEx(bin, h, cv.MORPH_OPEN, hk);
  cv.morphologyEx(bin, v, cv.MORPH_OPEN, vk);
  hk.delete(); vk.delete();
  return { bin, h, v };
}

// Only lines far longer than any tick stroke, widened a little: removed before counting ink
function printedLines(cv, bin) {
  const h = new cv.Mat();
  const v = new cv.Mat();
  const hk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.round(bin.cols / 12), 1));
  const vk = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, Math.round(bin.rows / 14)));
  cv.morphologyEx(bin, h, cv.MORPH_OPEN, hk);
  cv.morphologyEx(bin, v, cv.MORPH_OPEN, vk);
  const lines = new cv.Mat();
  cv.bitwise_or(h, v, lines);
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.dilate(lines, lines, k);
  hk.delete(); vk.delete(); k.delete(); h.delete(); v.delete();
  return lines;
}

async function toMat(cv, source) {
  const img = await Jimp.read(source);
  if (img.bitmap.width > WORK_W || img.bitmap.height > WORK_W) {
    if (img.bitmap.width >= img.bitmap.height) img.resize({ w: WORK_W });
    else img.resize({ h: WORK_W });
  }
  const { width, height, data } = img.bitmap;
  return cv.matFromImageData({ data: new Uint8ClampedArray(data), width, height });
}

// Finds the outer border of the table and returns it flattened to a straight rectangle
function flattenTable(cv, rgba) {
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  const { bin, h, v } = lineMasks(cv, gray);
  const grid = new cv.Mat();
  cv.bitwise_or(h, v, grid);
  const k = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
  cv.dilate(grid, grid, k);
  k.delete();

  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  cv.findContours(grid, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
  let best = null, bestArea = 0;
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const a = cv.contourArea(c);
    if (a > bestArea) { if (best) best.delete(); best = c; bestArea = a; } else c.delete();
  }
  const imgArea = gray.rows * gray.cols;
  let result = null;
  if (best && bestArea > imgArea * 0.15) {
    const peri = cv.arcLength(best, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(best, approx, 0.02 * peri, true);
    let pts;
    if (approx.rows === 4) {
      pts = [];
      for (let i = 0; i < 4; i++) pts.push({ x: approx.data32S[i * 2], y: approx.data32S[i * 2 + 1] });
    } else {
      const rect = cv.minAreaRect(best);
      pts = cv.RotatedRect.points(rect).map(p => ({ x: p.x, y: p.y }));
    }
    approx.delete();
    const { tl, tr, br, bl } = orderCorners(pts);
    const w = Math.max(dist(tl, tr), dist(bl, br));
    const hgt = Math.max(dist(tl, bl), dist(tr, br));
    const outW = FLAT_W;
    const outH = Math.round(FLAT_W * hgt / w);
    const src = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
    const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
    const M = cv.getPerspectiveTransform(src, dst);
    const flat = new cv.Mat();
    cv.warpPerspective(rgba, flat, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    src.delete(); dst.delete(); M.delete();
    result = flat;
  }
  if (best) best.delete();
  contours.delete(); hier.delete(); gray.delete(); bin.delete(); h.delete(); v.delete(); grid.delete();
  return result;
}

// Straightens a tilted photo using the rectangle that encloses all printed ink
function deskew(cv, rgba) {
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  const bin = new cv.Mat();
  cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, 25, 15);
  const { h, v } = lineMasks(cv, gray);
  const lines = new cv.Mat();
  cv.bitwise_or(h, v, lines);
  // Prefer printed lines; fall back to all ink when the tilt hides them
  const src = cv.countNonZero(lines) > gray.rows * gray.cols * 0.01 ? lines : bin;
  const coords = [];
  for (let y = 0; y < src.rows; y += 2) {
    for (let x = 0; x < src.cols; x += 2) if (src.data[y * src.cols + x]) coords.push(x, y);
  }
  const pts = cv.matFromArray(coords.length / 2, 1, cv.CV_32SC2, coords.length ? coords : [0, 0]);
  let angle = 0;
  if (pts.rows > 100) {
    const rect = cv.minAreaRect(pts);
    angle = rect.angle;
    if (rect.size.width < rect.size.height) angle -= 90;
    while (angle < -45) angle += 90;
    while (angle > 45) angle -= 90;
  }
  pts.delete(); gray.delete(); bin.delete(); h.delete(); v.delete(); lines.delete();
  if (Math.abs(angle) < 0.3) return rgba;
  const center = new cv.Point(rgba.cols / 2, rgba.rows / 2);
  const M = cv.getRotationMatrix2D(center, angle, 1);
  const out = new cv.Mat();
  cv.warpAffine(rgba, out, M, new cv.Size(rgba.cols, rgba.rows), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  M.delete();
  rgba.delete();
  return out;
}

function resizeToWidth(cv, mat, width) {
  if (mat.cols === width) return mat;
  const out = new cv.Mat();
  cv.resize(mat, out, new cv.Size(width, Math.round(mat.rows * width / mat.cols)), 0, 0, cv.INTER_AREA);
  mat.delete();
  return out;
}

function rotateMat(cv, mat, code) {
  const out = new cv.Mat();
  cv.rotate(mat, out, code);
  mat.delete();
  return out;
}

// Date rows: the longest run of equally tall rows. Header rows above them are taller.
function findDateRows(rowLines) {
  const gaps = [];
  for (let i = 1; i < rowLines.length; i++) gaps.push({ top: rowLines[i - 1], bottom: rowLines[i], h: rowLines[i] - rowLines[i - 1] });
  const sorted = gaps.map(g => g.h).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  let bestRun = [], run = [];
  for (const g of gaps) {
    if (Math.abs(g.h - median) <= median * 0.35) run.push(g);
    else { if (run.length > bestRun.length) bestRun = run; run = []; }
  }
  if (run.length > bestRun.length) bestRun = run;
  return { rows: bestRun, headerAbove: bestRun.length ? bestRun[0].top - rowLines[0] : 0, below: bestRun.length ? rowLines[rowLines.length - 1] - bestRun[bestRun.length - 1].bottom : 0 };
}

// Paper curls, so printed lines are never perfectly straight: thicken them before measuring
function thicken(cv, mask, horizontal) {
  const out = new cv.Mat();
  const k = cv.getStructuringElement(cv.MORPH_RECT, horizontal ? new cv.Size(1, 7) : new cv.Size(7, 1));
  cv.dilate(mask, out, k);
  k.delete();
  return out;
}

// A missing line shows up as a gap two or three rows tall: split it evenly
function fillMissingLines(lines) {
  if (lines.length < 4) return lines;
  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i] - lines[i - 1]);
  const median = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i] - lines[i - 1];
    const n = Math.round(gap / median);
    if (n >= 2 && n <= 4 && Math.abs(gap - n * median) <= median * 0.3) {
      for (let k = 1; k < n; k++) out.push(lines[i - 1] + (gap * k) / n);
    }
    out.push(lines[i]);
  }
  return out;
}

function analyseGrid(cv, flat) {
  const gray = new cv.Mat();
  cv.cvtColor(flat, gray, cv.COLOR_RGBA2GRAY);
  const masks = lineMasks(cv, gray);
  masks.hThick = thicken(cv, masks.h, true);
  masks.vThick = thicken(cv, masks.v, false);
  masks.printed = printedLines(cv, masks.bin);
  const rowLines = fillMissingLines(linePositions(masks.hThick, true, 0.3));
  const dateRows = findDateRows(rowLines);
  return { gray, masks, rowLines, dateRows };
}

function freeGrid(g) {
  g.gray.delete(); g.masks.bin.delete(); g.masks.h.delete(); g.masks.v.delete();
  g.masks.hThick.delete(); g.masks.vThick.delete(); g.masks.printed.delete();
}

// Share of ink inside a cell, ignoring the printed grid lines and a margin near the borders
function inkRatio(masks, x0, y0, x1, y1) {
  const mx = (x1 - x0) * 0.12, my = (y1 - y0) * 0.15;
  const ax = Math.round(x0 + mx), bx = Math.round(x1 - mx), ay = Math.round(y0 + my), by = Math.round(y1 - my);
  const cols = masks.bin.cols;
  let ink = 0, total = 0;
  for (let y = ay; y < by; y++) {
    for (let x = ax; x < bx; x++) {
      const i = y * cols + x;
      total++;
      if (masks.bin.data[i] && !masks.printed.data[i]) ink++;
    }
  }
  return total ? ink / total : 0;
}

/**
 * Reads the sheet photo. Returns the flattened table, the date rows (top to bottom) and column
 * boundaries measured inside the date-row area, plus a tick matrix [row][column] of ink ratios.
 */
// Slivers much narrower than a real column come from the photo edge or a doubled line
function pruneNarrow(lines) {
  const out = [...lines];
  for (;;) {
    if (out.length < 4) return out;
    const widths = [];
    for (let i = 1; i < out.length; i++) widths.push(out[i] - out[i - 1]);
    const med = [...widths].sort((a, b) => a - b)[Math.floor(widths.length / 2)];
    const i = widths.findIndex(w => w < med * 0.4);
    if (i < 0) return out;
    if (i === widths.length - 1) out.splice(out.length - 1, 1);
    else out.splice(i === 0 ? 0 : i, 1);
  }
}

// The Date column is printed on every row, so it has the most consistent ink among the first columns
function findDateColumn(cells) {
  let best = 0, bestScore = -1;
  for (let c = 0; c < Math.min(3, cells[0].length); c++) {
    const vals = cells.map(r => r[c]).sort((a, b) => a - b);
    const score = vals[Math.floor(vals.length * 0.25)];
    if (score > bestScore + 0.02) { best = c; bestScore = score; }
  }
  return best;
}

function readGrid(cv, flat) {
  const grid = analyseGrid(cv, flat);
  const rows = grid.dateRows.rows;
  if (rows.length < 20) {
    freeGrid(grid);
    return { found: false, reason: 'ROWS_NOT_FOUND', rowCount: rows.length };
  }

  // Column lines measured only across the date rows, where every column divider is present
  const top = Math.round(rows[0].top), bottom = Math.round(rows[rows.length - 1].bottom);
  const band = grid.masks.vThick.roi(new cv.Rect(0, top, grid.masks.vThick.cols, Math.max(1, bottom - top)));
  let colLines = pruneNarrow(linePositions(band, false, 0.4));
  band.delete();

  let cells = rows.map(r => {
    const out = [];
    for (let c = 1; c < colLines.length; c++) out.push(inkRatio(grid.masks, colLines[c - 1], r.top, colLines[c], r.bottom));
    return out;
  });
  // Anything left of the printed Date column (photo edge, margin) is not part of the table
  const dateCol = findDateColumn(cells);
  if (dateCol > 0) {
    colLines = colLines.slice(dateCol);
    cells = cells.map(c => c.slice(dateCol));
  }
  const result = {
    found: true,
    allRowLines: grid.rowLines,
    width: flat.cols,
    height: flat.rows,
    rows: rows.map(r => ({ top: r.top, bottom: r.bottom })),
    colLines,
    cells
  };
  freeGrid(grid);
  return result;
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

// The printed Date column (first column) carries ink on every row; the last column is only signed sometimes
function looksUpsideDown(r) {
  if (!r.found || r.cells[0].length < 2) return false;
  const first = median(r.cells.map(c => c[0]));
  const last = median(r.cells.map(c => c[c.length - 1]));
  return last > first * 1.3;
}

async function readSheet(source) {
  const cv = await getCv();
  const rgba = deskew(cv, await toMat(cv, source));
  let flat = flattenTable(cv, rgba);
  rgba.delete();
  if (!flat) return { found: false, reason: 'TABLE_NOT_FOUND' };

  if (flat.rows > flat.cols) flat = rotateMat(cv, flat, cv.ROTATE_90_CLOCKWISE);
  flat = resizeToWidth(cv, flat, FLAT_W);
  let result = readGrid(cv, flat);
  if (!result.found || looksUpsideDown(result)) {
    const turned = rotateMat(cv, flat.clone(), cv.ROTATE_180);
    const second = readGrid(cv, turned);
    if (second.found && (!result.found || !looksUpsideDown(second))) {
      flat.delete();
      flat = turned;
      result = second;
    } else {
      turned.delete();
    }
  }
  if (!result.found) {
    flat.delete();
    return result;
  }
  result.flat = flat;
  return result;
}

module.exports = { readSheet, getCv };
