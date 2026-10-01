/* Showreel Studio — how the plugin works. 30-second summary mode: 7 scenes, 34.6 s, on-screen text carries the story.
 *
 * A complete reel.js, meant to be read top to bottom:
 *   1. theme      palette C, named after the subject's world (an edit suite: suite, desk, card, clip, tally)
 *   2. materials  small drawing helpers shared by several scenes (perforations, playhead, report paper, thumbnails)
 *   3. scenes     s0 … s6. Each draws the whole frame from its local time t only — no state kept between frames
 *   4. table      SC = scene boundaries in global seconds, the single source of timing; at(i, lt) = SC[i] + lt
 *   5. cues       sound effects, computed with at() from the same constants the scenes animate with
 *   6. music      tempo, beat offset, per-scene section styles and chord progressions, loudness target
 *
 * All on-screen props (report lines, card labels, the broken layout in 03) are illustrative, not data.
 */

/* ============ 1. THEME ============ */
const C = {
  suite: '#121110', desk: '#1C1A17', rule: '#2A2723',      // dark edit-suite background, panels, grid lines
  card: '#EFE8D8', graphite: '#8C857A',                     // storyboard paper / main text, pencil grey
  clip: '#2FC2AE', tally: '#FF4436'                         // clip-label teal = approved / pass, tally-lamp red = error / REC
};
const rnd = mulberry32(20261001);                           // the only randomness: seeded, so every frame is reproducible

/* ============ 2. MATERIALS ============ */
const suiteBg = () => gridBg(C.suite, C.rule, 240);
const eyebrow = (s, t) => text(s, 162, 170, { k:'m', s:22, w:700, c:C.clip, ls:3, al:eo3(P(t, .05, .4)), skim:true });

/* film perforations: a row of rounded holes that drifts with phase (pure decoration, no text → nothing to audit) */
function perfRow(x0, x1, y, phase, col){
  ctx.fillStyle = col;
  const off = ((phase % 48) + 48) % 48;
  for (let x = x0 - 48 + off; x < x1; x += 48) { ctx.beginPath(); ctx.roundRect(x, y, 26, 18, 4); ctx.fill(); }
}
/* teal playhead: vertical line with a triangle on top */
function playhead(x, y0, y1, al = 1){
  if (al <= 0) return;
  ctx.save(); ctx.globalAlpha *= al; ctx.fillStyle = C.clip;
  ctx.fillRect(x - 2, y0, 4, y1 - y0);
  ctx.beginPath(); ctx.moveTo(x - 15, y0 - 22); ctx.lineTo(x + 15, y0 - 22); ctx.lineTo(x, y0); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/* the input report: a sheet of paper whose grey lines stand in for body text. Scene 01 cuts it into 6 pieces. */
const PAPER = { x: 1420, y: 210, w: 300, h: 360 };
const PAPER_LINES = [];                                      // [x, y, w] in paper coordinates, computed once at load
for (let y = 84; y < PAPER.h - 24; y += 26) PAPER_LINES.push([24, y, 160 + Math.floor(rnd() * 92)]);
function paperLines(ox, oy){
  ctx.fillStyle = C.graphite; ctx.fillRect(ox + 24, oy + 30, 170, 16);
  ctx.fillStyle = A(C.graphite, .5);
  for (const [x, y, w] of PAPER_LINES) ctx.fillRect(ox + x, oy + y, w, 8);
}
function reportPaper(al){
  if (al <= 0) return;
  ctx.save(); ctx.globalAlpha *= al;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(PAPER.x + 12, PAPER.y + 14, PAPER.w, PAPER.h);
  ctx.fillStyle = C.card; ctx.fillRect(PAPER.x, PAPER.y, PAPER.w, PAPER.h);
  paperLines(PAPER.x, PAPER.y);
  ctx.restore();
}

/* thumbnails of scenes 00–05, shapes only (used on the film strip and the player in 04) */
function thumb(k, x, y, w, h){
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.translate(x, y); ctx.scale(w / 160, h / 90);           // draw on a 160×90 board
  ctx.fillStyle = C.suite; ctx.fillRect(0, 0, 160, 90);
  const box = (c, bx, by, bw, bh) => { ctx.fillStyle = c; ctx.fillRect(bx, by, bw, bh); };
  if (k === 0) { box(C.card, 14, 34, 74, 12); box(C.clip, 14, 52, 84, 12); box(C.card, 116, 16, 30, 38); box(C.desk, 116, 54, 30, 30); }
  if (k === 1) { for (let i = 0; i < 6; i++) box(C.card, 14 + (i % 3) * 30, 34 + Math.floor(i / 3) * 22, 26, 18); ctx.strokeStyle = C.clip; ctx.lineWidth = 2.5; ctx.strokeRect(70, 26, 30, 16); }
  if (k === 2) { box(C.desk, 12, 22, 70, 58); for (let i = 0; i < 4; i++) box(i ? C.card : C.clip, 18, 30 + i * 12, 26 + (i * 13) % 34, 4); ctx.strokeStyle = C.rule; ctx.lineWidth = 2; ctx.strokeRect(90, 26, 58, 33); }
  if (k === 3) { box(C.desk, 12, 22, 92, 56); box(C.card, 20, 34, 46, 8); box(C.clip, 20, 48, 34, 8); ctx.strokeStyle = C.clip; ctx.lineWidth = 2; ctx.strokeRect(16, 30, 56, 30); for (let i = 0; i < 4; i++) box(C.clip, 116, 26 + i * 12, 8, 8); }
  if (k === 4) { ctx.strokeStyle = C.rule; ctx.lineWidth = 2; ctx.strokeRect(50, 20, 96, 56); box(C.card, 14, 30, 26, 8); box(C.clip, 56, 70, 50, 3); }
  if (k === 5) { box(C.rule, 8, 40, 144, 26); const ws = [6, 6, 22, 22, 32, 52]; let cx = 9; ws.forEach((cw, i) => { box(i < 2 ? C.card : C.clip, cx, 46, cw, 14); cx += cw + 1; }); }
  ctx.restore();
}

/* ============ 3. SCENES ============ */

/* ---- 00 OPEN · typeOn prompt, two-line rise + blinking cursor block, drifting film strip, playhead sweep ---- */
const OPEN = { type: .15, cps: 18, l1: .85, l2: 1.15, caret: 1.5, sweep: [.6, 1.8] };
const PROMPT = '› 발표용 2분 영상 만들어줘';
function s0(t){
  suiteBg();
  perfRow(0, W, 112, t * 80, A(C.card, .12));
  perfRow(0, W, 950, -t * 80, A(C.card, .12));
  text('SHOWREEL STUDIO · CLAUDE CODE 플러그인', 162, 200, { k:'m', s:22, w:700, c:C.clip, ls:3, al:eo3(P(t, .05, .4)), skim:true });
  typeOn('› 발표용 2분 영상 만들어줘', 164, 320, OPEN.type, t, OPEN.cps, { k:'m', s:34, w:500, c:C.card });
  rise('보고서를 넣으면', 160, 560, OPEN.l1, t, { k:'d', s:150, c:C.card, st:.05 });
  const w2 = rise('발표 영상이 나온다', 160, 740, OPEN.l2, t, { k:'d', s:150, c:C.clip, st:.05 });
  if (t > OPEN.caret && Math.floor((t - OPEN.caret) * 2.4) % 2 === 0) { ctx.fillStyle = C.tally; ctx.fillRect(160 + w2 + 24, 740 - 114, 32, 128); }
  /* the report on the right runs off its bottom edge into a film strip */
  const pa = eo3(P(t, .2, .7));
  ctx.save(); ctx.globalAlpha = pa;
  ctx.fillStyle = C.desk; ctx.fillRect(PAPER.x, PAPER.y + PAPER.h, PAPER.w, 930 - PAPER.y - PAPER.h);
  ctx.save(); ctx.beginPath(); ctx.rect(PAPER.x, PAPER.y + PAPER.h, PAPER.w, 930 - PAPER.y - PAPER.h); ctx.clip();
  const fo = (t * 80) % 170;
  for (let y = PAPER.y + PAPER.h - 170 + fo; y < 930; y += 170) { ctx.fillStyle = A(C.card, .08); ctx.fillRect(PAPER.x + 40, y + 10, PAPER.w - 80, 150); }
  for (let y = PAPER.y + PAPER.h - 36 + (t * 80) % 36; y < 930; y += 36) { ctx.fillStyle = C.suite; ctx.fillRect(PAPER.x + 12, y, 14, 18); ctx.fillRect(PAPER.x + PAPER.w - 26, y, 14, 18); }
  ctx.restore();
  ctx.restore();
  reportPaper(pa);
  const sw = eio(P(t, OPEN.sweep[0], OPEN.sweep[1]));
  if (t > OPEN.sweep[0]) playhead(lerp(PAPER.x, PAPER.x + PAPER.w, sw), PAPER.y - 20, PAPER.y + PAPER.h + 20, 1 - P(t, OPEN.sweep[1], OPEN.sweep[1] + .3));
}

/* ---- 01 STORYBOARD · paper cut into 6 cards that fly into a sorted grid (PERM order, arc), source chips, stamp + shake ---- */
const PW = PAPER.w / 2, PH = PAPER.h / 3;                    // 2 × 3 paper pieces
const GRID = { x: 160, y: 420, w: 300, h: 190, gap: 28 };    // 3 × 2 cards
const cardX = k => GRID.x + (k % 3) * (GRID.w + GRID.gap), cardY = k => GRID.y + Math.floor(k / 3) * (GRID.h + GRID.gap);
const PERM = [0, 1, 2, 3, 4, 5];
for (let i = 5; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [PERM[i], PERM[j]] = [PERM[j], PERM[i]]; }
const FLY = { t0: .6, st: .08, d: .32 };                     // piece k launches at t0 + PERM[k] × st
const FLY_END = FLY.t0 + 5 * FLY.st + FLY.d;
const CHIP_T = k => 1.45 + k * .07;
const STAMP1 = 2.2;                                          // stamp(P(t, a, a + .25)) lands at a + .1
const SRC = ['§2.1', '§2.3', '§3.1', '§3.4', '§4.2', '§5.1'];
function s1(t){
  const sh = t > STAMP1 + .1 ? (1 - P(t, STAMP1 + .1, STAMP1 + .55)) * 10 : 0;
  ctx.translate(Math.sin(t * 95) * sh, Math.cos(t * 80) * sh * .6);
  suiteBg();
  eyebrow('01 STORYBOARD · reel-storyboarder', t);
  if (t < FLY.t0) {
    reportPaper(1);
    const cp = eoX(P(t, .35, .6));
    if (cp > 0) {
      ctx.save(); ctx.strokeStyle = C.graphite; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.beginPath();
      ctx.moveTo(PAPER.x + PW, PAPER.y); ctx.lineTo(PAPER.x + PW, PAPER.y + PAPER.h * cp);
      for (const r of [1, 2]) { ctx.moveTo(PAPER.x, PAPER.y + r * PH); ctx.lineTo(PAPER.x + PAPER.w * cp, PAPER.y + r * PH); }
      ctx.stroke(); ctx.restore();
    }
  } else {
    for (let k = 0; k < 6; k++) {
      const a = FLY.t0 + PERM[k] * FLY.st, m = eio(P(t, a, a + FLY.d));
      const c = k % 2, r = Math.floor(k / 2);
      const x = lerp(PAPER.x + c * PW, cardX(k), m), y = lerp(PAPER.y + r * PH, cardY(k), m) - Math.sin(m * Math.PI) * 18;
      const w = lerp(PW, GRID.w, m), h = lerp(PH, GRID.h, m);
      ctx.fillStyle = C.card; ctx.fillRect(x, y, w, h);
      if (m < 1) {                                           // the piece still shows its slice of the report while it flies
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
        ctx.translate(x, y); ctx.scale(w / PW, h / PH); ctx.globalAlpha = 1 - m;
        paperLines(-c * PW, -r * PH); ctx.restore();
      }
      const fa = P(t, a + FLY.d - .05, a + FLY.d + .2);
      if (fa > 0) {
        text('S0' + (k + 1), x + 20, y + 40, { k:'m', s:20, w:700, c:C.graphite, al:fa, free:true });
        ctx.fillStyle = A(C.graphite, .45 * fa); ctx.fillRect(x + 20, y + 80, 210, 10); ctx.fillRect(x + 20, y + 104, 150, 10);
      }
      const cq = eback(P(t, CHIP_T(k), CHIP_T(k) + .3));
      if (cq > 0) {
        ctx.save(); ctx.translate(cardX(k) + GRID.w - 62, cardY(k) + GRID.h - 34); ctx.scale(cq, cq);
        ctx.strokeStyle = C.clip; ctx.lineWidth = 3; ctx.strokeRect(-42, -18, 84, 36);
        text(SRC[k], 0, 7, { k:'m', s:18, w:700, c:'#1F8F80', a:'center', free:true });
        ctx.restore();
      }
    }
  }
  rise('검증된 사실만, 수치마다 출처', 160, 300, .2, t, { k:'d', s:84, c:C.card, st:.03 });   // drawn after the cards so pieces fly under it
  stamp('승인', 1040, 450, -.12, P(t, STAMP1, STAMP1 + .25), { size:84, color:C.clip });
  rise('만들기 전에 사용자 승인', 1220, 650, 2.4, t, { k:'b', s:44, w:700, c:C.clip, st:.025 });
}

/* ---- 02 BUILD · code typed with syntax colours (the real s0 source), then the preview plays s0(t) as the timecode counts ---- */
/* The code on screen is read from s0 itself, so it can never drift from the actual scene. Long lines are cut at a comma. */
const CODE_MAX = 50;                                         // budget in mono columns; a Hangul glyph costs about 1.6
const colsOf = s => [...s].reduce((n, ch) => n + (/[ㄱ-힣]/.test(ch) ? 1.6 : 1), 0);
function cutLine(l){
  if (colsOf(l) <= CODE_MAX) return l;
  let cut = l;
  while (colsOf(cut + ', …') > CODE_MAX && cut.lastIndexOf(', ') > 0) cut = cut.slice(0, cut.lastIndexOf(', '));
  return cut + ', …';
}
const CODE = s0.toString().split('\n').filter(l => /function s0|typeOn\(|rise\(/.test(l)).concat('}').map(cutLine);
const TOKENS = CODE.map(l => {                               // [text, colour] runs: strings, called names, numbers, the rest
  const out = [], re = /('[^']*')|([A-Za-z_$][\w$]*)(?=\()|([A-Za-z_$][\w$.]*)|(\.?\d[\d.]*)|([\s\S])/g;
  let m;
  while ((m = re.exec(l))) out.push([m[0], m[1] ? C.card : m[2] ? C.clip : m[4] ? A(C.tally, .75) : A(C.card, .55)]);
  return out;
});
const TYPE = { t0: .25, t1: 1.9, gap: .08 };                 // typing window and pause between lines
const CODE_CPS = CODE.reduce((n, l) => n + [...l].length, 0) / (TYPE.t1 - TYPE.t0 - TYPE.gap * (CODE.length - 1));
const LINE_T = []; { let tt = TYPE.t0; for (const l of CODE) { LINE_T.push(tt); tt += [...l].length / CODE_CPS + TYPE.gap; } }
const RUN = [1.95, 3.05];                                    // then the preview runs s0 from 0 to its full length
const runAt = lt0 => RUN[0] + lt0 / (SC[1] - SC[0]) * (RUN[1] - RUN[0]);   // s0-local time → s2-local time
const PV = { x: 1060, y: 320, w: 700, h: 394 };
function s2(t){
  suiteBg();
  eyebrow('02 BUILD · reel-builder', t);
  rise('카드가 캔버스 코드로', 160, 260, .1, t, { k:'d', s:84, c:C.card, st:.03 });
  ctx.fillStyle = C.desk; ctx.fillRect(160, 320, 840, 540);
  ctx.fillStyle = C.rule; ctx.fillRect(160, 320, 840, 46); ctx.fillStyle = C.desk; ctx.fillRect(160, 320, 150, 46);
  ctx.fillStyle = C.clip; ctx.fillRect(160, 320, 150, 3);
  text('reel.js', 184, 351, { k:'m', s:20, w:500, c:C.card, free:true });
  const lh = 64, ly = j => 430 + j * lh;
  let cx = null, cy = 0;
  CODE.forEach((l, j) => {
    let n = Math.max(0, Math.floor((t - LINE_T[j]) * CODE_CPS));
    if (t >= LINE_T[j]) text(String(j + 1), 214, ly(j), { k:'m', s:20, w:500, c:C.graphite, a:'right', free:true });
    if (n <= 0) return;
    let x = 240;
    for (const [s, col] of TOKENS[j]) {
      const part = [...s].slice(0, n).join(''); if (!part) break;
      text(part, x, ly(j), { k:'m', s:24, w:500, c:col, free:true });
      x += measure(part, { k:'m', s:24, w:500 }); n -= [...s].length; if (n <= 0) break;
    }
    cx = x; cy = ly(j);
  });
  if (cx != null && (t < TYPE.t1 || Math.floor(t * 2.6) % 2 === 0)) { ctx.fillStyle = C.clip; ctx.fillRect(cx + 4, cy - 22, 12, 28); }
  /* preview window: the real s0, scaled down, drawn at time tc */
  const tc = (SC[1] - SC[0]) * P(t, RUN[0], RUN[1]);
  ctx.save(); ctx.beginPath(); ctx.rect(PV.x, PV.y, PV.w, PV.h); ctx.clip();
  ctx.translate(PV.x, PV.y); ctx.scale(PV.w / W, PV.h / H); s0(tc, SC[1] - SC[0]);
  ctx.restore();
  ctx.strokeStyle = C.rule; ctx.lineWidth = 3; ctx.strokeRect(PV.x, PV.y, PV.w, PV.h);
  text('t = ' + tc.toFixed(2) + ' s', PV.x, 800, { k:'m', s:40, w:700, c:t >= RUN[0] ? C.clip : C.graphite, free:true });
}

/* ---- 03 AUDIT · a broken layout, tally boxes drawn with rectDraw, freeze, the fix, pass stamp, checklist ---- */
const WIN = { x: 160, y: 320, w: 1000, h: 562 };
const BOX = { a: .6, b: .9, fix: [1.6, 1.9], pass: 1.85 };  // first box, second box, fix move, colour flip + stamp
const CHECKS = ['겹침', '잘림', '화면 밖', '읽기 시간'];
const CHECK_T = i => 2.0 + i * .15;
function tag(s, x, y, al){
  if (al <= 0) return;
  ctx.save(); ctx.globalAlpha *= al;
  const w = measure(s, { k:'b', s:22, w:700 }) + 24;
  ctx.fillStyle = C.tally; ctx.fillRect(x, y - 36, w, 34);
  text(s, x + 12, y - 11, { k:'b', s:22, w:700, c:C.card, overlapOk:true });
  ctx.restore();
}
function s3(t){
  suiteBg();
  eyebrow('03 AUDIT · reel-reviewer', t);
  rise('레이아웃 자동 검사', 160, 260, .15, t, { k:'d', s:84, c:C.card, st:.03 });
  /* the window under test. Its "off-screen" line leaves the WINDOW, not the 1920 canvas: clip to the window and mark
     the mock text free, so the real audit stays clean. */
  const fx = eio(P(t, BOX.fix[0], BOX.fix[1]));
  ctx.fillStyle = C.desk; ctx.fillRect(WIN.x, WIN.y, WIN.w, WIN.h);
  ctx.save(); ctx.beginPath(); ctx.rect(WIN.x, WIN.y, WIN.w, WIN.h); ctx.clip();
  text('첫 장면 제목', 220, 470, { k:'d', s:80, c:C.card, free:true });
  text('두 번째 줄', lerp(330, 220, fx), lerp(500, 580, fx), { k:'d', s:80, c:C.clip, free:true });
  text('SOURCE · REPORT §2 · 2026', lerp(820, 222, fx), 690, { k:'m', s:30, w:500, c:C.graphite, free:true });
  ctx.restore();
  ctx.strokeStyle = C.rule; ctx.lineWidth = 3; ctx.strokeRect(WIN.x, WIN.y, WIN.w, WIN.h);
  const ok = t >= BOX.pass, bc = ok ? C.clip : C.tally;
  ctx.strokeStyle = bc; ctx.lineWidth = 5;
  const b1 = [205, 390, lerp(560, 490, fx), lerp(140, 210, fx)], b2 = [lerp(800, 205, fx), 652, lerp(352, 480, fx), 54];
  rectDraw(...b1, eio(P(t, BOX.a, BOX.a + .25)));
  rectDraw(...b2, eio(P(t, BOX.b, BOX.b + .25)));
  const ta = 1 - P(t, BOX.fix[0], BOX.fix[0] + .15);
  if (t > BOX.a) tag('겹침', b1[0], b1[1], ta);
  if (t > BOX.b) tag('화면 밖', b2[0], b2[1], ta);
  stamp('통과', 940, 440, -.1, P(t, BOX.pass, BOX.pass + .25), { size:80, color:C.clip });
  CHECKS.forEach((s, i) => {
    const y = 440 + i * 90, p = eo5(P(t, .35 + i * .06, .75 + i * .06)); if (p <= 0) return;
    ctx.save(); ctx.globalAlpha = p; ctx.translate((1 - p) * 40, 0);
    const cp = eback(P(t, CHECK_T(i), CHECK_T(i) + .25));
    ctx.strokeStyle = C.graphite; ctx.lineWidth = 3; ctx.strokeRect(1240, y - 34, 40, 40);
    if (cp > 0) {
      ctx.save(); ctx.translate(1260, y - 14); ctx.scale(cp, cp);
      ctx.fillStyle = C.clip; ctx.fillRect(-20, -20, 40, 40);
      ctx.strokeStyle = C.suite; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-3, 9); ctx.lineTo(12, -9); ctx.stroke();
      ctx.restore();
    }
    text(s, 1304, y, { k:'b', s:40, w:700, c:C.card });
    ctx.restore();
  });
  rise('검토 최대 2라운드', 1240, 820, 2.4, t, { k:'b', s:30, w:500, c:C.graphite, st:.02, skim:true });
}

/* ---- 04 OUTPUT · film strip slides into a player, keycaps pop (eback), → press moves the playhead to the next scene ---- */
const PL = { x: 820, y: 340, w: 940, h: 529 };
const KEYS = [['→', '다음'], ['←', '이전'], ['F', '전체 화면']];
const KEY_T = i => 1.4 + i * .15, PRESS = 2.6, FLASH = 3.4;
const barX = g => PL.x + 30 + (PL.w - 60) * g / SC[SC.length - 1];   // global seconds → x on the player's progress bar
function s4(t){
  suiteBg();
  eyebrow('04 OUTPUT', t);
  rise('MP4 + 웹 발표 모드', 160, 260, .3, t, { k:'d', s:84, c:C.card, st:.03 });
  rise('1920×1080 · 30fps · -16 LUFS', 162, 330, .9, t, { k:'m', s:24, w:500, c:C.graphite, st:.012, skim:true });
  /* player: screen, pause badge, progress bar with one tick per scene start */
  const mv = eio(P(t, PRESS, PRESS + .4));
  ctx.fillStyle = C.desk; ctx.fillRect(PL.x - 8, PL.y - 8, PL.w + 16, PL.h + 64);
  thumb(mv < .5 ? 1 : 2, PL.x, PL.y, PL.w, PL.h);
  if (t < PRESS || t > PRESS + .4) {
    ctx.fillStyle = 'rgba(18,17,16,.75)'; ctx.fillRect(PL.x + PL.w - 84, PL.y + 20, 64, 64);
    ctx.fillStyle = C.card; ctx.fillRect(PL.x + PL.w - 66, PL.y + 36, 9, 32); ctx.fillRect(PL.x + PL.w - 47, PL.y + 36, 9, 32);
  }
  const by = PL.y + PL.h + 28;
  ctx.fillStyle = C.rule; ctx.fillRect(barX(0), by, barX(SC[SC.length - 1]) - barX(0), 4);
  ctx.fillStyle = C.graphite; for (let i = 0; i < 7; i++) ctx.fillRect(barX(SC[i]) - 1, by - 8, 3, 20);
  const ph = lerp(barX(SC[2] - .3), barX(SC[3] - .3), mv);
  ctx.fillStyle = C.clip; ctx.fillRect(barX(0), by, ph - barX(0), 4);
  ctx.beginPath(); ctx.arc(ph, by + 2, 10, 0, Math.PI * 2); ctx.fill();
  /* film strip: slides in from the left and disappears behind the player's left edge */
  const fx = lerp(-1260, PL.x, eio(P(t, .2, 1.0)));
  if (fx < PL.x) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, PL.x - 8, H); ctx.clip();
    ctx.fillStyle = C.desk; ctx.fillRect(fx, 545, 1240, 150);
    perfRow(fx, fx + 1240, 552, 0, C.suite); perfRow(fx, fx + 1240, 670, 0, C.suite);
    for (let i = 0; i < 6; i++) thumb(5 - i, fx + 24 + i * 200, 576, 168, 94);
    ctx.restore();
  }
  KEYS.forEach(([k, label], i) => {
    const y = 520 + i * 110, p = eback(P(t, KEY_T(i), KEY_T(i) + .35)); if (p <= 0) return;
    const press = i === 0 && t >= PRESS ? 1 - P(t, PRESS + .15, PRESS + .35) : 0;
    const lit = Math.max(press, i === 2 ? Math.sin(Math.PI * P(t, FLASH, FLASH + .35)) : 0);
    ctx.save(); ctx.translate(198, y - 26 + press * 6); ctx.scale(p, p);
    ctx.fillStyle = C.rule; ctx.fillRect(-38, -32, 76, 76);
    ctx.fillStyle = lit > 0 ? A(C.clip, lit) : C.desk; ctx.fillRect(-38, -38, 76, 70);
    ctx.strokeStyle = C.graphite; ctx.lineWidth = 2; ctx.strokeRect(-38, -38, 76, 70);
    text(k, 0, 12, { k:'m', s:36, w:700, c:C.card, a:'center' });
    ctx.restore();
    text(label, 270, y, { k:'b', s:36, w:700, c:C.card, al:eo3(P(t, KEY_T(i) + .05, KEY_T(i) + .3)) });
  });
}

/* ---- 05 MADE WITH IT · timeline track; clip width = nominal length (2 px per second); discrete counter 0 → 6 ---- */
const CLIPS = [[30, '30초', 0], [30, '30초', 0], [120, '2분', 1], [120, '2분', 1], [180, '3분', 2], [300, '5분', 2]];  // [s, label, mode]
const CLIP_X = []; { let x = 160; for (const [s] of CLIPS) { CLIP_X.push(x); x += s * 2 + 8; } }
const LAND = i => .5 + i * .18;
const MODES = ['30초 요약', '발표 보조', '숏동영상'];
function clipShape(mode, x, y, w, h, al = 1){
  ctx.save(); ctx.globalAlpha *= al;
  if (mode < 2) { ctx.fillStyle = mode ? C.clip : C.card; ctx.fillRect(x, y, w, h); }
  else { ctx.strokeStyle = C.clip; ctx.lineWidth = 4; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
  ctx.restore();
}
function s5(t){
  suiteBg();
  const hw = rise('개발하며 만든 영상', 160, 300, .3, t, { k:'d', s:84, c:C.card, st:.03 });
  const n = CLIPS.filter((_, i) => t >= LAND(i)).length;
  const bump = 1 + .14 * Math.sin(Math.PI * P(t, 1.42, 1.72));
  const nx = 160 + hw + 36;
  if (t > .3) {
    ctx.save(); ctx.translate(nx, 300); ctx.scale(bump, bump);
    text(String(n), 0, 0, { k:'m', s:200, w:700, c:n === 6 ? C.clip : C.card });
    ctx.restore();
    rise('편', nx + measure('6', { k:'m', s:200, w:700 }) + 20, 300, .45, t, { k:'d', s:84, c:C.card });
  }
  ctx.fillStyle = C.rule; ctx.fillRect(160, 520, 1600, 180);
  CLIPS.forEach(([s, label, mode], i) => {
    const p = eback(P(t, LAND(i) - .3, LAND(i))); if (p <= 0) return;
    const x = CLIP_X[i], w = s * 2, y = 600 - (1 - p) * 40;
    clipShape(mode, x, y, w, 80, Math.min(1, p * 3));
    text(label, x + 4, 580, { k:'m', s:22, w:700, c:mode ? C.clip : C.card, al:eo3(P(t, LAND(i), LAND(i) + .2)), skim:true });
  });
  playhead(lerp(160, 1760, eio(P(t, 1.8, 3.0))), 510, 712, P(t, 1.8, 1.9) * (1 - P(t, 3.0, 3.3)));
  let lx = 160;
  MODES.forEach((s, i) => {
    const a = eo3(P(t, 1.5 + i * .12, 1.8 + i * .12));
    clipShape(i, lx, 772, 44, 28, a);
    text(s, lx + 60, 798, { k:'b', s:30, w:700, c:C.card, al:a });
    lx += 60 + measure(s, { k:'b', s:30, w:700 }) + 56;
  });
}

/* ---- 06 END · eyebrow, title rise, stripe band (stripeRect), install command typed with a caret, REC dot ---- */
const INSTALL = '/plugin marketplace add YUjinEDU/showreel-studio';
const INST = { t0: 1.0, cps: 36 };
function s6(t){
  suiteBg();
  rise('CLAUDE CODE PLUGIN', 164, 330, .1, t, { k:'m', s:30, w:700, c:C.clip, ls:8, st:.02, skim:true });
  rise('Showreel Studio', 156, 500, .3, t, { k:'d', s:150, c:C.card, st:.035 });
  rise('보고서를 발표 영상으로', 162, 580, .75, t, { k:'b', s:44, w:500, c:C.card, st:.02, al:.85 });
  stripeRect(160, 624, 1600 * eoX(P(t, .6, 1.1)), 28, t * 120, C.card, C.suite);
  const ba = eo3(P(t, .8, 1.0));
  ctx.fillStyle = A(C.desk, ba); ctx.fillRect(160, 684, 1600, 96);
  text('›', 196, 746, { k:'m', s:36, w:700, c:C.clip, al:ba });
  typeOn(INSTALL, 240, 746, INST.t0, t, INST.cps, { k:'m', s:36, w:500, c:C.card, caret:C.clip, skim:true });
  rise('에이전트 3 · 스킬 4 · 모드 3', 162, 870, 2.4, t, { k:'m', s:24, w:500, c:C.graphite, st:.012, skim:true });
  if (t > .3 && Math.floor(t * 1.6) % 2 === 0) { ctx.fillStyle = C.tally; ctx.beginPath(); ctx.arc(1660, 320, 12, 0, Math.PI * 2); ctx.fill(); }
  text('REC', 1684, 330, { k:'m', s:24, w:700, c:C.tally, al:eo3(P(t, .3, .6)), free:true });
}

/* ============ 4. TABLE ============ */
const SC = [0, 4.6, 10.0, 14.2, 19.2, 24.2, 29.2, 34.6];   // scene boundaries, global seconds
const at = (i, lt) => SC[i] + lt;                           // scene-local → global
const MAJOR = [[41, [60, 65, 69]], [36, [60, 64, 67]], [38, [62, 65, 69]], [34, [62, 65, 70]]];   // F–C–Dm–B♭, one chord per bar

/* typed characters appear at t0 + k / cps (k = 1 … n); every `step`-th one gets a key click at volume g */
const keyTimes = (s, t0, cps, step = 1) => [...s].map((_, k) => t0 + (k + 1) / cps).filter((_, k) => k % step === step - 1);

Reel.define({
  meta: {
    title: 'Showreel Studio', hudRight: 'Showreel Studio · Claude Code 플러그인',
    dur: SC[SC.length - 1], fps: 30, poster: at(6, 4.6), music: 'reel-music.mp3'
  },
  fonts: {
    families: {
      d: '"Black Han Sans","Noto Sans KR",sans-serif',
      b: '"IBM Plex Sans KR","Noto Sans KR",sans-serif',
      m: '"IBM Plex Mono","IBM Plex Sans KR",monospace'
    },
    faces: ['400 100px "Black Han Sans"', '400 40px "IBM Plex Sans KR"', '500 40px "IBM Plex Sans KR"', '700 40px "IBM Plex Sans KR"', '500 40px "IBM Plex Mono"', '700 40px "IBM Plex Mono"']
  },
  theme: {
    wipe: [C.card, C.suite],                                 // clapperboard stripes
    hud: { light: C.suite, dark: C.card, mark: C.clip },
    grain: .05, push: .018, safe: 48
  },
  /* cut: how the scene enters — wipe (default), cut (hard), fade (crossfade). music: section style for that span. */
  scenes: [
    { a: SC[0], b: SC[1], dark: true, tag: '00  보고서 → 영상', name: '오프닝',     music: 'intro',     draw: s0 },
    { a: SC[1], b: SC[2], dark: true, tag: '01  스토리보드',   name: '스토리보드·승인', music: 'groove', draw: s1 },
    { a: SC[2], b: SC[3], dark: true, tag: '02  구현',        name: '구현',       music: 'drive',     draw: s2, cut: 'cut' },
    { a: SC[3], b: SC[4], dark: true, tag: '03  검사',        name: '자동 검사',   music: 'half',      draw: s3, cut: 'fade' },
    { a: SC[4], b: SC[5], dark: true, tag: '04  결과물',      name: 'MP4·발표 모드', music: 'chorus',  draw: s4, prog: MAJOR },
    { a: SC[5], b: SC[6], dark: true, tag: '05  만든 영상',    name: '영상 6편',    music: 'drive',     draw: s5, cut: 'fade', prog: MAJOR },
    { a: SC[6], b: SC[7], dark: true, tag: '06  설치',        name: '설치',       music: 'breakdown', draw: s6, prog: MAJOR }
  ],
  /* Sound cues, global seconds. Scene cuts and the chorus crash are added automatically. */
  cues: () => ({
    keys: [
      ...keyTimes(PROMPT, OPEN.type, OPEN.cps).map(lt => at(0, lt)),
      ...CODE.flatMap((l, j) => keyTimes(l, LINE_T[j], CODE_CPS, 2)).map(lt => ({ t: at(2, lt), g: .45 })),
      ...keyTimes(INSTALL, INST.t0, INST.cps, 2).map(lt => ({ t: at(6, lt), g: .4 }))
    ],
    blips: [
      at(0, OPEN.caret),
      ...PERM.map((_, k) => ({ t: at(1, CHIP_T(k)), g: .5 })),
      at(4, PRESS), { t: at(4, FLASH), g: .5 }
    ],
    pops: [
      ...PERM.map(p => at(1, FLY.t0 + p * FLY.st)),                          // each piece launches
      ...[OPEN.type, OPEN.l1, OPEN.l2].map(lt0 => at(2, runAt(lt0)))         // each s0 element appears in the preview
    ],
    whooshes: [at(1, FLY_END), at(3, BOX.fix[1]), at(4, 1.0), { t: at(5, 3.0), g: .5 }],
    drops: [at(1, STAMP1 + .1), SC[4]],                                       // silence before the stamp and the chorus
    hits: [at(1, STAMP1 + .1), at(3, BOX.pass + .1)],
    ticks: [[at(2, RUN[0]), at(2, RUN[1])]],
    alarms: [at(3, BOX.a), { t: at(3, BOX.b), g: .5 }],
    freezes: [[at(3, BOX.a + .05), at(3, BOX.fix[0])]],
    plucks: [
      ...[74, 77, 81, 86].map((note, i) => ({ t: at(3, CHECK_T(i)), note })),
      ...[74, 77, 81].map((note, i) => ({ t: at(4, KEY_T(i)), note })),
      ...[62, 65, 69, 72, 74, 77].map((note, i) => ({ t: at(5, LAND(i)), note }))
    ],
    booms: [at(5, 1.45)],
    risers: [[at(3, 4.0), SC[4]]],
    end: at(6, .35)
  }),
  /* 128 BPM, beat .469 s; offset puts most scene cuts near a beat. 00–03 use the default Dm–B♭–F–C, 04–06 the relative major. */
  music: {
    bpm: 128, offset: .14, seed: 1001, lufs: -16,
    endChord: [53, 60, 65, 67, 69, 72, 77], endRoot: 41
  }
});
