/* engine.js — showreel runtime (template v2).
 * Do not edit per reel. Content lives in reel.js, which calls Reel.define({...}).
 * Every frame is a pure function of time t, so the page, the MP4 and the audit all see the same picture.
 *
 * Globals for reel.js:
 *   canvas   W, H, ctx
 *   math     cl, P, lerp, eo3, eo5, eoX, eio, eback, A(hex, alpha), mulberry32(seed)
 *   type     font(k,s,w), text(s,x,y,o), measure(s,o), rise(s,x,y,t0,t,o), typeOn(s,x,y,t0,t,cps,o)
 *   shapes   gridBg(bg,line,step,lw), stripes(pts,phase,c1,c2), stripeRect(x,y,w,h,phase,c1,c2),
 *            stamp(s,cx,cy,rot,p,o), rectDraw(x,y,w,h,p), bezierPart(x0,y0,x1,y1,x2,y2,x3,y3,p)
 *   captions caption(s,t0,t1,t,o), captions([[t0,t1,s],...],t,o)   (subtitle band for videos watched without a speaker)
 *   scenes[].cut  'wipe' (default, or theme.cut) | 'fade' crossfade | 'cut' hard cut
 * Text options o: { k:'d'|'b'|'m', s:size, w:weight, c:color, a:'left'|'center'|'right', ls:letterSpacing,
 *                   al:alpha, st:stagger, d:duration, caret:color,
 *                   free:true (skip audit: tickers, HUD), skim:true (decorative/fine print: half reading time),
 *                   overlapOk:true (intentional overlap: stamps, labels under stamps) }
 */
'use strict';
const W = 1920, H = 1080;
const cvs = document.getElementById('reel');
const ctx = cvs.getContext('2d');
let FAM = { d: 'sans-serif', b: 'sans-serif', m: 'monospace' };
let CFG = null, SCENES = [], DUR = 30, FPS = 30, PRE = .28, POST = .22;

/* ---------- math ---------- */
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const P = (t, a, b) => cl((t - a) / (b - a));
const lerp = (a, b, x) => a + (b - a) * x;
const eo3 = x => 1 - Math.pow(1 - x, 3);
const eo5 = x => 1 - Math.pow(1 - x, 5);
const eoX = x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
const eio = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const eback = x => { if (x <= 0) return 0; const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const A = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${n >> 8 & 255},${n & 255},${a})`; };
function mulberry32(a){ return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- layout recorder (used by the audit) ---------- */
let REC = null;
const SKIM = new Set();
function recBox(s, x0, y0, x1, y1, o){
  if (!REC || o.free) return;
  if (o.skim) SKIM.add(s);
  const al = ctx.globalAlpha; if (al < .05) return;
  const m = ctx.getTransform();
  const pts = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  REC.push({ s, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), al, ok: !!o.overlapOk });
}

/* ---------- type ---------- */
const font = (k, s, w) => `${w || (k === 'd' ? 400 : 500)} ${s}px ${FAM[k]}`;
function text(s, x, y, o){
  ctx.save();
  ctx.font = font(o.k || 'b', o.s, o.w);
  ctx.fillStyle = o.c; ctx.textAlign = o.a || 'left'; ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = (o.ls || 0) + 'px';
  if (o.al != null) ctx.globalAlpha *= o.al;
  ctx.fillText(s, x, y);
  if (REC) { const w = ctx.measureText(s).width, x0 = o.a === 'center' ? x - w / 2 : o.a === 'right' ? x - w : x; recBox(s, x0, y - o.s * .8, x0 + w, y + o.s * .22, o); }
  ctx.restore();
}
function measure(s, o){
  ctx.save(); ctx.font = font(o.k || 'b', o.s, o.w); ctx.letterSpacing = (o.ls || 0) + 'px';
  const w = ctx.measureText(s).width; ctx.restore(); return w;
}
/* masked per-character rise: each glyph slides up out of its own baseline slot. Returns the line width. */
function rise(s, x, y, t0, t, o){
  const chars = [...s];
  ctx.save();
  ctx.font = font(o.k || 'd', o.s, o.w);
  ctx.letterSpacing = (o.ls || 0) + 'px';
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  if (o.al != null) ctx.globalAlpha *= o.al;
  const total = ctx.measureText(s).width;
  if (t < t0) { ctx.restore(); return total; }
  if (REC) recBox(s, x, y - o.s * .8, x + total, y + o.s * .22, o);
  ctx.beginPath(); ctx.rect(x - 40, y - o.s * 1.08, total + 80, o.s * 1.42); ctx.clip();
  ctx.fillStyle = o.c;
  const st = o.st ?? .035, d = o.d ?? .55;
  let cx = x;
  for (let i = 0; i < chars.length; i++) {
    const w = ctx.measureText(chars[i]).width;
    const p = eo5(P(t, t0 + i * st, t0 + i * st + d));
    if (p > 0) ctx.fillText(chars[i], cx, y + (1 - p) * o.s * 1.15);
    cx += w;
  }
  ctx.restore();
  return total;
}
function typeOn(s, x, y, t0, t, cps, o){
  const ch = [...s];
  const n = Math.max(0, Math.min(ch.length, Math.floor((t - t0) * cps)));
  const shown = ch.slice(0, n).join('');
  if (n > 0) text(shown, x, y, { ...o, free: true });
  const w = n > 0 ? measure(shown, o) : 0;
  if (REC && n > 0) { ctx.save(); if (o.al != null) ctx.globalAlpha *= o.al; recBox(s, x, y - o.s * .8, x + w, y + o.s * .22, o); ctx.restore(); }
  if (o.caret && t >= t0 && (n < ch.length || Math.floor(t * 2.6) % 2 === 0)) {
    ctx.save(); if (o.al != null) ctx.globalAlpha *= o.al;
    ctx.fillStyle = o.caret; ctx.fillRect(x + w + 10, y - o.s * .8, Math.max(6, o.s * .09), o.s * .92);
    ctx.restore();
  }
  return w;
}

/* ---------- shapes ---------- */
function gridBg(bg, line, step = 240, lw = 2){
  ctx.fillStyle = bg; ctx.fillRect(-60, -60, W + 120, H + 120);
  if (!line) return;
  ctx.strokeStyle = line; ctx.lineWidth = lw; ctx.beginPath();
  for (let x = step; x < W; x += step) { ctx.moveTo(x, -60); ctx.lineTo(x, H + 60); }
  for (let y = step; y < H; y += step) { ctx.moveTo(-60, y); ctx.lineTo(W + 60, y); }
  ctx.stroke();
}
/* 45° two-colour stripes clipped to any polygon (safety tape, warning bands, wipe edges) */
function stripes(pts, phase, c1, c2){
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const h = maxY - minY, sw = 30;
  ctx.save();
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.clip();
  ctx.fillStyle = c1; ctx.fillRect(minX, minY, maxX - minX, h);
  ctx.fillStyle = c2;
  const off = ((phase % (sw * 2)) + sw * 2) % (sw * 2);
  for (let x = minX - h - sw * 2 + off; x < maxX + h; x += sw * 2) {
    ctx.beginPath(); ctx.moveTo(x, minY); ctx.lineTo(x + sw, minY); ctx.lineTo(x + sw + h, maxY); ctx.lineTo(x + h, maxY); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
const stripeRect = (x, y, w, h, ph, c1, c2) => { if (w > 0) stripes([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], ph, c1, c2); };
/* rubber stamp that slams in with overshoot. o: { size, color, font:'d' } */
function stamp(s, cx, cy, rot, p, o = {}){
  if (p <= 0) return;
  const size = o.size || 104, color = o.color || '#E0352B';
  const sc = lerp(2.3, 1, eback(p));
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.globalAlpha *= Math.min(1, p * 4) * .93;
  ctx.font = font(o.font || 'd', size, o.w); const w = ctx.measureText(s).width;
  ctx.strokeStyle = color; ctx.lineWidth = 9; ctx.strokeRect(-w / 2 - 34, -size * .7, w + 68, size * 1.3);
  ctx.lineWidth = 3; ctx.strokeRect(-w / 2 - 22, -size * .58, w + 44, size * 1.06);
  text(s, 0, size * .36, { k: o.font || 'd', s: size, w: o.w, c: color, a: 'center', overlapOk: true });
  ctx.restore();
}
/* stroke a rectangle's perimeter progressively (p = 0..1); set strokeStyle/lineWidth first */
function rectDraw(x, y, w, h, p){
  let r = 2 * (w + h) * p, cx = x, cy = y;
  ctx.beginPath(); ctx.moveTo(x, y);
  for (const [dx, dy] of [[w, 0], [0, h], [-w, 0], [0, -h]]) {
    const len = Math.abs(dx) + Math.abs(dy), f = Math.min(1, r / len);
    cx += dx * f; cy += dy * f; ctx.lineTo(cx, cy); r -= len; if (r <= 0) break;
  }
  ctx.stroke();
}
function bezierPart(x0, y0, x1, y1, x2, y2, x3, y3, p){
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let i = 1; i <= 48 * p; i++) {
    const u = i / 48, v = 1 - u;
    ctx.lineTo(v*v*v*x0 + 3*v*v*u*x1 + 3*v*u*u*x2 + u*u*u*x3, v*v*v*y0 + 3*v*v*u*y1 + 3*v*u*u*y2 + u*u*u*y3);
  }
  ctx.stroke();
}

/* ---------- film grain (seeded, so every export is identical) ---------- */
const grainPat = (() => {
  const g = document.createElement('canvas'); g.width = g.height = 256;
  const gx = g.getContext('2d'), id = gx.createImageData(256, 256), r = mulberry32(7);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255 | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  gx.putImageData(id, 0, 0); return ctx.createPattern(g, 'repeat');
})();
function drawGrain(t){
  const amt = CFG.theme.grain ?? .05; if (!amt) return;
  const f = Math.floor(t * 24), ox = (f * 97) % 256, oy = (f * 57) % 256;
  ctx.save(); ctx.globalAlpha = amt; ctx.globalCompositeOperation = 'overlay';
  ctx.translate(-ox, -oy); ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W + 256, H + 256);
  ctx.restore();
}

/* ---------- sequencer ---------- */
function drawScene(s, t){
  const lt = t - s.a, d = s.b - s.a, z = 1 + (CFG.theme.push ?? .018) * cl(lt / d);
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(z, z); ctx.translate(-W / 2, -H / 2);
  s.draw(lt, d);
  ctx.restore();
}
function wipe(p, fn, ph){
  const SK = 320, BAND = 84, ex = lerp(W + SK, -SK - BAND, p), [c1, c2] = CFG.theme.wipe;
  ctx.save();
  ctx.beginPath(); ctx.moveTo(ex + SK / 2 + BAND, 0); ctx.lineTo(W + SK + BAND * 2, 0); ctx.lineTo(W + SK + BAND * 2, H); ctx.lineTo(ex - SK / 2 + BAND, H); ctx.closePath(); ctx.clip();
  fn(); ctx.restore();
  stripes([[ex + SK / 2, 0], [ex + SK / 2 + BAND, 0], [ex - SK / 2 + BAND, H], [ex - SK / 2, H]], ph, c1, c2);
}
const tcode = t => { const s = Math.floor(t), cs = Math.floor((t - s) * 100); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`; };
function hud(t, sc){
  const h = CFG.theme.hud; if (!h) return;
  const c = sc.dark ? h.dark : h.light, o = { free: true };
  ctx.fillStyle = h.mark; ctx.fillRect(60, 55, 14, 14);
  text(sc.tag, 88, 69, { ...o, k: 'm', s: 20, w: 700, c, ls: 3 });
  if (CFG.meta.hudRight) text(CFG.meta.hudRight, 1860, 69, { ...o, k: 'm', s: 20, w: 500, c, a: 'right', ls: 1, al: .75 });
  text(`${tcode(t)} / ${tcode(DUR)}`, 60, 1037, { ...o, k: 'm', s: 18, w: 500, c, al: .75 });
  const x0 = 330, x1 = 1860, y = 1030;
  ctx.fillStyle = A(c, .18); ctx.fillRect(x0, y, x1 - x0, 3);
  ctx.fillStyle = h.mark; ctx.fillRect(x0, y, (x1 - x0) * t / DUR, 3);
  ctx.fillStyle = c;
  SCENES.forEach(s => { if (s.a > 0) ctx.fillRect(x0 + (x1 - x0) * s.a / DUR - 1, y - 5, 2, 13); });
}
const cutOf = s => s.cut || (CFG.theme && CFG.theme.cut) || 'wipe';
function inWipe(t){ return SCENES.some((s, k) => k > 0 && cutOf(s) !== 'cut' && t >= s.a - PRE && t < s.a + POST); }
function frame(t){
  t = cl(t, 0, DUR);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  let hs = null;
  for (let k = 1; k < SCENES.length; k++) {
    const T = SCENES[k].a;
    const kind = cutOf(SCENES[k]);
    if (kind !== 'cut' && t >= T - PRE && t < T + POST) {
      const p = eio(P(t, T - PRE, T + POST));
      drawScene(SCENES[k - 1], t);
      if (kind === 'fade') { ctx.save(); ctx.globalAlpha = p; drawScene(SCENES[k], t); ctx.restore(); }
      else wipe(p, () => drawScene(SCENES[k], t), t * 260);
      hs = p < .5 ? SCENES[k - 1] : SCENES[k];
      break;
    }
  }
  if (!hs) { hs = SCENES.find(s => t < s.b) || SCENES[SCENES.length - 1]; drawScene(hs, t); }
  drawGrain(t);
  hud(t, hs);
}

/* ---------- captions ----------
 * caption(s, t0, t1, t, o): one subtitle line on a band near the bottom, fades in at t0 and out at t1 (scene-local).
 * captions(list, t, o): list = [[t0, t1, '문장'], ...] — shows whichever line is active. Lines stay readable for the
 * audit (they are not free/skim), so give each one .6 + 글자수/8 seconds. Keep one line ≤ 34 syllables.
 * o: { y: 948 baseline, s: 40 size, w: 500 weight, c: text colour, bg: band colour, al: max alpha } */
function caption(s, t0, t1, t, o = {}){
  const a = Math.min(eo3(P(t, t0, t0 + .25)), 1 - eo3(P(t, t1 - .25, t1)));
  if (a <= 0 || !s) return;
  const size = o.s || 40, y = o.y || 948, pad = 28;
  ctx.save(); ctx.globalAlpha *= a * (o.al ?? 1);
  ctx.font = font('b', size, o.w || 500); ctx.letterSpacing = '0px';
  const w = ctx.measureText(s).width;
  ctx.fillStyle = o.bg || 'rgba(10,12,16,.72)';
  ctx.beginPath(); ctx.roundRect(W / 2 - w / 2 - pad, y - size * 1.05, w + pad * 2, size * 1.5, 8); ctx.fill();
  text(s, W / 2, y, { k: 'b', s: size, w: o.w || 500, c: o.c || '#F4F2EC', a: 'center' });
  ctx.restore();
}
function captions(list, t, o){ for (const [a, b, s] of list) if (t >= a - .01 && t < b + .01) caption(s, a, b, t, o); }

/* ---------- audit: text boxes per frame → off-screen, safe margin, overlaps, reading time ---------- */
function audit(step = .1){
  const M = CFG.theme.safe ?? 48, seen = new Map(), issues = [];
  const bump = (key, kind, t, extra) => { const k = key + '|' + kind; const e = seen.get(k) || { s: key, kind, n: 0, t0: t, t1: t, extra }; e.n++; e.t1 = t; seen.set(k, e); };
  const vis = new Map();
  for (let t = 0; t <= DUR + 1e-9; t += step) {
    REC = []; frame(t); const boxes = REC; REC = null;
    const wiping = inWipe(t);
    for (const b of boxes) {
      if (b.al > .5) { const v = vis.get(b.s) || { first: t, last: t, n: 0 }; v.last = t; v.n++; vis.set(b.s, v); }
      if (wiping || b.al < .3) continue;
      if (b.x0 < 0 || b.y0 < 0 || b.x1 > W || b.y1 > H) bump(b.s, 'offscreen', t, `box ${Math.round(b.x0)},${Math.round(b.y0)}–${Math.round(b.x1)},${Math.round(b.y1)}`);
      else if (b.x0 < M || b.y0 < M || b.x1 > W - M || b.y1 > H - M) bump(b.s, 'margin', t, `box ${Math.round(b.x0)},${Math.round(b.y0)}–${Math.round(b.x1)},${Math.round(b.y1)}`);
    }
    if (wiping) continue;
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.s === b.s || a.ok || b.ok || a.al < .5 || b.al < .5) continue;
      const ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
      if (ix <= 0 || iy <= 0) continue;
      const small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
      if (ix * iy > small * .12) bump(`${a.s}  ⟷  ${b.s}`, 'overlap', t);
    }
  }
  /* every issue carries global times (the ones render.js --times takes) and the scene it sits in */
  const sceneOf = t => { const i = SCENES.findIndex(s => t < s.b); const k = i < 0 ? SCENES.length - 1 : i; return `${k} ${SCENES[k].name}`; };
  const minN = Math.round(.45 / step);
  for (const e of seen.values()) if (e.n >= minN) issues.push({ kind: e.kind, text: e.s, from: +e.t0.toFixed(2), to: +e.t1.toFixed(2), scene: sceneOf(e.t0), detail: e.extra || '' });
  /* reading time: ~8 Korean syllables/s plus 0.6 s to find the line. Numbers mid-count-up are skipped;
     texts marked { skim:true } (texture, tickers' neighbours, fine print) only need half. */
  const reading = [];
  for (const [s, v] of vis) {
    const chars = [...s.replace(/\s/g, '')].length;
    if (chars < 6 || /^[\d.,%+\-−:/×\s]+$/.test(s)) continue;
    const shown = v.n * step, need = (.6 + chars / 8) * (SKIM.has(s) ? .5 : 1);
    const level = shown >= need ? 'ok' : shown >= need * .5 ? 'tight' : 'critical';
    reading.push({ text: s, shown: +shown.toFixed(2), need: +need.toFixed(2), level, from: +v.first.toFixed(2), to: +v.last.toFixed(2), scene: sceneOf(v.first) });
  }
  reading.filter(r => r.level !== 'ok').forEach(r => issues.push({ kind: 'reading-' + r.level, text: r.text, from: r.from, to: r.to, scene: r.scene, detail: `on screen ${r.shown}s, needs ~${r.need}s` }));
  return { issues, reading };
}

/* ---------- player ---------- */
const $ = id => document.getElementById(id);
let playing = false, cur = 0, last = null, dirty = true, isReady = false, dragging = false, presenter = false;
let actx = null, abuf = null, src = null, soundOn = false, aT0 = 0, aPos = 0;
async function loadAudio(){
  if (abuf) return true;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const r = await fetch(CFG.meta.music || 'reel-music.mp3'); if (!r.ok) throw new Error(r.status);
    abuf = await actx.decodeAudioData(await r.arrayBuffer());
    return true;
  } catch (e) { const b = $('sound'); if (b) { b.disabled = true; b.textContent = '음악 파일을 불러오지 못함'; } return false; }
}
function stopAudio(){ if (src) { try { src.stop(); } catch (e) {} src.disconnect(); src = null; } }
function startAudio(){
  stopAudio();
  if (!soundOn || !abuf || !playing || cur >= DUR) return;
  src = actx.createBufferSource(); src.buffer = abuf; src.connect(actx.destination);
  aT0 = actx.currentTime; aPos = cur; src.start(0, cur);
}
function seek(t){ cur = t; dirty = true; if (playing) startAudio(); }
function setPlaying(v){
  playing = v; last = null;
  const b = $('play'); if (b) { b.textContent = v ? '일시정지' : '재생'; b.setAttribute('aria-pressed', String(v)); }
  if (v) startAudio(); else stopAudio();
}
function setSound(v){
  soundOn = v; const b = $('sound');
  if (b) { b.textContent = v ? '소리 끄기' : '소리 켜기'; b.setAttribute('aria-pressed', String(v)); }
  if (v) startAudio(); else stopAudio();
}
/* presenter mode: each scene is a "slide". Playback stops on the scene's finished state (just before the
   outgoing wipe), → / PageDown / click advances (mid-animation it first completes the slide), ← goes back. */
const sceneAt = t => { const i = SCENES.findIndex(s => t < s.b); return i < 0 ? SCENES.length - 1 : i; };
const holdOf = k => k === SCENES.length - 1 ? DUR : SCENES[k].b - PRE - .02;
function nextSlide(){
  const k = sceneAt(Math.min(cur, DUR - 1e-6)), h = holdOf(k);
  if (cur < h - .05) { seek(h); setPlaying(false); return; }
  if (k + 1 < SCENES.length) { seek(Math.max(0, SCENES[k + 1].a - PRE)); setPlaying(true); }
}
function prevSlide(){
  const target = sceneAt(Math.min(cur, DUR - 1e-6)) - 1;   // finished state of the previous slide
  if (target < 0) { seek(0); setPlaying(false); return; }
  seek(holdOf(target)); setPlaying(false);
}
function setPresenter(v){
  presenter = v; const b = $('present');
  if (b) { b.setAttribute('aria-pressed', String(v)); b.textContent = v ? '발표 모드 끄기' : '발표 모드'; }
  document.body.classList.toggle('presenting', v);
}
function toggleFull(){
  const st = $('stage'); if (!st) return;
  try { if (document.fullscreenElement) document.exitFullscreen(); else st.requestFullscreen().catch(() => {}); } catch (e) {}
}

function bindPlayer(){
  const chapWrap = $('chapters'), scrub = $('scrub'), tcEl = $('tc');
  const chapBtns = chapWrap ? SCENES.map(s => {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = '<span class="n"></span><span></span>';
    b.firstChild.textContent = tcode(s.a).slice(3); b.lastChild.textContent = s.name;
    b.addEventListener('click', () => { seek(s.a + .001); if (!playing) setPlaying(true); });
    chapWrap.appendChild(b); return b;
  }) : [];
  const syncUI = () => {
    const t = Math.min(cur, DUR);
    if (scrub && !dragging) scrub.value = String(Math.round(t * 100));
    if (tcEl) tcEl.textContent = `${tcode(t)} / ${tcode(DUR)}`;
    const idx = SCENES.findIndex(s => t < s.b), ci = idx < 0 ? SCENES.length - 1 : idx;
    chapBtns.forEach((b, i) => b.setAttribute('aria-current', String(i === ci)));
  };
  const loop = now => {
    if (playing) {
      const before = cur;
      if (src) cur = aPos + (actx.currentTime - aT0);
      else if (last != null) cur += (now - last) / 1000;
      if (presenter) {
        const h = holdOf(sceneAt(Math.min(before, DUR - 1e-6)));
        if (before < h && cur >= h) { cur = h; setPlaying(false); }
      } else if (cur > DUR + 1.2) { cur = 0; startAudio(); }
      last = now; dirty = true;
    }
    if (dirty && isReady) { frame(Math.min(cur, DUR)); syncUI(); dirty = false; }
    requestAnimationFrame(loop);
  };
  const toggle = () => { if (cur >= DUR) cur = 0; setPlaying(!playing); };
  $('play')?.addEventListener('click', toggle);
  $('restart')?.addEventListener('click', () => { seek(0); if (!playing) setPlaying(true); });
  if (scrub) {
    scrub.max = String(Math.round(DUR * 100));
    scrub.addEventListener('input', () => { dragging = true; seek(Number(scrub.value) / 100); });
    scrub.addEventListener('change', () => { dragging = false; });
  }
  $('sound')?.addEventListener('click', async () => {
    if (soundOn) { setSound(false); return; }
    if (!(await loadAudio())) return;
    try { await actx.resume(); } catch (e) {}
    if (!playing) { if (cur >= DUR) cur = 0; setPlaying(true); }
    setSound(true);
  });
  $('present')?.addEventListener('click', () => { setPresenter(!presenter); $('stage')?.focus(); });
  $('full')?.addEventListener('click', toggleFull);
  const stage = $('stage');
  stage?.addEventListener('click', () => (presenter ? nextSlide() : toggle()));
  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.altKey || e.ctrlKey || e.metaKey) return;
    const onButton = tag === 'BUTTON';
    const k = e.key;
    if (k === 'f' || k === 'F') { e.preventDefault(); toggleFull(); return; }
    if (k === 'p' || k === 'P') { e.preventDefault(); setPresenter(!presenter); return; }
    if (presenter && (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !onButton) || (k === 'Enter' && !onButton))) { e.preventDefault(); nextSlide(); return; }
    if (presenter && (k === 'ArrowLeft' || k === 'PageUp')) { e.preventDefault(); prevSlide(); return; }
    if (!presenter && !onButton && (k === ' ' || (k === 'Enter' && e.target === stage))) { e.preventDefault(); toggle(); }
  });
  requestAnimationFrame(loop);
}

/* ---------- fonts: dry-run every frame once to learn which glyphs to fetch ---------- */
function collectText(){
  const seen = new Set(), orig = ctx.fillText;
  ctx.fillText = function(s){ seen.add(String(s)); };
  for (let t = 0; t <= DUR; t += .2) frame(t);
  frame(DUR);
  ctx.fillText = orig;
  return [...seen].join('');
}

/* ---------- boot ---------- */
const Reel = {
  define(cfg){
    CFG = cfg;
    FAM = cfg.fonts.families;
    SCENES = cfg.scenes;
    DUR = cfg.meta.dur ?? SCENES[SCENES.length - 1].b;
    FPS = cfg.meta.fps ?? 30;
    const cues = typeof cfg.cues === 'function' ? cfg.cues() : (cfg.cues || {});
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const ready = (async () => {
      const all = collectText() + '0123456789.%';
      try {
        await Promise.race([
          Promise.all((cfg.fonts.faces || []).map(f => document.fonts.load(f, all))),
          new Promise(r => setTimeout(r, 6000))
        ]);
      } catch (e) { /* fall back to system faces */ }
    })();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    ready.then(() => {
      isReady = true; dirty = true;
      if (reduce) cur = cfg.meta.poster ?? DUR * .6; else setPlaying(true);
    });
    bindPlayer();
    /* hooks used by tools/render.js */
    window.reel = {
      ready, DUR, FPS, cues,
      scenes: SCENES.map(s => ({ a: s.a, b: s.b, name: s.name, music: s.music || 'groove', prog: s.prog || null, cut: cutOf(s) })),
      music: cfg.music || {},
      poster: cfg.meta.poster ?? DUR * .6,
      pause(){ setPlaying(false); isReady = false; },
      renderAt(t){ frame(t); },
      frameJPEG(t, q = .95){ frame(t); return cvs.toDataURL('image/jpeg', q); },
      audit,
      presenter: { next: nextSlide, prev: prevSlide, set: setPresenter, holdOf }
    };
  }
};
