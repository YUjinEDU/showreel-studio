/* reel.js — the only file you rewrite per reel.
 * Structure: THEME → scene functions (s0, s1, …) → Reel.define({ meta, fonts, theme, scenes, cues, music }).
 * Each scene function receives (t, d): t = seconds since the scene started (can be slightly negative
 * during the incoming wipe), d = scene length. Draw the whole frame from t; never keep state between frames.
 * Canvas is 1920×1080. Keep text inside x 160–1760, y 120–980 (the HUD owns the corners).
 * This starter is a working 4-scene, 16-second example — replace it with the storyboard.
 */

/* Palette: name tokens after the subject's own materials, not generic roles. */
const T = {
  ink: '#16181C', paper: '#F3F1EA', ground: '#E4E1D8', joint: '#D3CFC4',
  accent: '#F6C400', second: '#1B4B9E', alert: '#E0352B'
};

/* 00 — title: two lines rise, one accent block */
function s0(t){
  gridBg(T.ground, T.joint, 240);
  const a = eoX(P(t, 0, .8));
  ctx.fillStyle = T.accent; ctx.fillRect(0, 180, W * a, 18);
  rise('{{HEADLINE_1}}', 160, 480, .25, t, { k:'d', s:150, c:T.ink, st:.05 });
  const w = rise('{{HEADLINE_2}}', 160, 670, .55, t, { k:'d', s:150, c:T.second, st:.05 });
  if (t > 1.1) { ctx.fillStyle = T.alert; ctx.fillRect(160 + w + 24, 670 - 112, 30, 124); }
  typeOn('{{SUBTITLE}}', 164, 780, 1.2, t, 40, { k:'m', s:26, w:500, c:T.ink, al:.75 });
}

/* 01 — one big number that counts up, then a caption */
function s1(t){
  gridBg(T.ink, '#1E2126', 240);
  text('{{LABEL_MONO}}', 162, 250, { k:'m', s:22, w:700, c:T.accent, ls:2, al:eo3(P(t, 0, .35)) });
  const v = 42 * eoX(P(t, .1, 1.0));
  text(v.toFixed(0) + '%', 150, 620, { k:'m', s:280, w:700, c:T.paper, ls:-8 });
  rise('{{CAPTION}}', 162, 740, 1.1, t, { k:'b', s:44, w:700, c:T.paper, st:.015 });
}

/* 02 — comparison bars on a real scale (px per unit is constant) */
function s2(t){
  gridBg(T.second, 'rgba(255,255,255,.07)', 120, 1.5);
  rise('{{COMPARE_TITLE}}', 160, 250, .05, t, { k:'d', s:84, c:T.paper, st:.03 });
  const rows = [['A', 23, T.accent], ['B', 17, A(T.paper, .8)], ['C', 9, A(T.paper, .35)]];
  const x0 = 520, pw = 36;
  rows.forEach(([name, val, col], i) => {
    const y = 430 + i * 150, p = eo5(P(t, .4 + i * .15, 1.3 + i * .15));
    text(name, 160, y + 18, { k:'m', s:56, w:700, c:T.paper, al:eo3(P(t, .2 + i * .1, .6 + i * .1)) });
    ctx.fillStyle = col; ctx.fillRect(x0, y - 30, val * pw * p, 60);
    if (p > 0) text(String(Math.round(val * p)), x0 + val * pw * p + 20, y + 22, { k:'m', s:60, w:700, c:T.paper });
  });
}

/* 03 — end card with a stripe band and a stamp */
function s3(t){
  gridBg(T.ink, '#1E2126', 240);
  rise('{{END_EYEBROW}}', 164, 360, .1, t, { k:'m', s:30, w:700, c:T.accent, ls:8, st:.02 });
  rise('{{END_TITLE}}', 156, 540, .2, t, { k:'d', s:140, c:T.paper, st:.035 });
  stripeRect(160, 620, 1600 * eoX(P(t, .6, 1.1)), 30, t * 120, T.accent, T.ink);
  stamp('{{STAMP}}', 1540, 400, -.14, P(t, 1.2, 1.45), { size:80, color:T.alert });
}

/* One source of truth for timing: scene boundaries in GLOBAL seconds. Scenes, cues and dur all derive from SC,
   so changing a scene's length is a one-line edit. at(i, lt) turns scene-local time into global time. */
const SC = [0, 3.6, 7.4, 12.0, 16];
const at = (i, lt) => SC[i] + lt;

Reel.define({
  meta: {
    title: '{{TITLE}}', hudRight: '{{HUD_RIGHT}}',
    dur: SC[SC.length - 1], fps: 30, poster: at(2, 2.0), music: 'reel-music.mp3'
  },
  fonts: {
    /* d = display, b = body, m = mono/data. The mono stack falls back to the body face for Hangul. */
    families: {
      d: '"Black Han Sans","Noto Sans KR",sans-serif',
      b: '"IBM Plex Sans KR","Noto Sans KR",sans-serif',
      m: '"IBM Plex Mono","IBM Plex Sans KR",monospace'
    },
    faces: ['400 100px "Black Han Sans"', '400 40px "IBM Plex Sans KR"', '500 40px "IBM Plex Sans KR"', '700 40px "IBM Plex Sans KR"', '500 40px "IBM Plex Mono"', '700 40px "IBM Plex Mono"']
  },
  theme: {
    wipe: [T.accent, T.ink],                 // stripe colours of the scene-cut wipe
    hud: { light: T.ink, dark: T.paper, mark: T.accent },
    grain: .05, push: .018, safe: 48
  },
  scenes: [
    { a: SC[0], b: SC[1], dark: false, tag: '00  {{TAG0}}', name: '오프닝',   music: 'intro',     draw: s0 },
    { a: SC[1], b: SC[2], dark: true,  tag: '01  {{TAG1}}', name: '핵심 수치', music: 'half',      draw: s1 },
    { a: SC[2], b: SC[3], dark: true,  tag: '02  {{TAG2}}', name: '비교',     music: 'chorus',    draw: s2 },
    { a: SC[3], b: SC[4], dark: true,  tag: '03  {{TAG3}}', name: '엔딩',     music: 'breakdown', draw: s3 }
  ],
  /* Sound cues in absolute seconds. Derive them from the same constants the scenes use. See music.js header for every key. */
  cues: () => ({
    ticks: [[at(1, .1), at(1, 1.0)]],                                  // s1 count-up
    booms: [at(1, 1.1)],                                                // s1 caption lands
    plucks: [0, 1, 2].map(i => ({ t: at(2, .4 + i * .15), note: [74, 77, 81][i] })),   // s2 bars
    risers: [[at(2, 3.4), SC[3]]],
    end: at(3, .2),                                                     // s3 title rises
    hits: [at(3, 1.2 + .4 * .25)]                                       // s3 stamp lands
  }),
  music: { bpm: 150, offset: .2, seed: 1500 }
});
