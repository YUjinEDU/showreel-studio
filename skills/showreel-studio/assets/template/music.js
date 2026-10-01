// music.js — procedural score for a showreel (template v2).
// Everything is synthesized here (no samples, no borrowed melodies), so each track is original and free to use.
//
// synth(input) → { L, R, SR }   where input = window.reel's { cues, scenes, music, DUR }
//
//   scenes[i].music  section style: 'intro' | 'groove' | 'drive' | 'half' | 'chorus' | 'breakdown' | 'calm' | 'pulse' | 'silent'
//                    calm / pulse are for long explainer videos: under captions, no snare, low energy, so 3–5 minutes stay listenable
//   scenes[i].cut    'wipe' → whoosh + impact at the cut (default) | 'fade' → soft whoosh only | 'cut' → nothing
//   scenes[i].prog   optional chord progression for that scene (same format as music.prog) — vary long reels
//   music            { bpm: 150, offset: .2, prog: [[bassMidi, [chordMidi...]], ...], endChord: [...], endRoot: 38 }
//   cues             sound design keyed to the picture (all times in seconds, absolute):
//     hits [t]            rubber-stamp slam           booms [t]          low impact + sub drop
//     whooshes [t]        noise sweep ending at t     swishes [t]        short downward swish (strike lines)
//     beeps [t|{t,f}]     scanner beep                scans [t]          double "bip-bip" (barcode scan)
//     pops [t]            tiny blips (many items)     blips [t]          UI chip pop
//     ticks [[a,b]]       counter ticking a→b         plucks [{t,note}]  melodic pluck (note = MIDI)
//     alarms [t]          4-beep alarm                keys [t]           typewriter key
//     risers [[a,b]]      tension riser               crashes [t]        cymbal
//     drops [t]           music + drums go silent for 0.3 s before t (use before a big hit)
//     freezes [[a,b]]     drums stop, music goes dark (a moment of "wait, what?")
//     builds [[a,b]]      accelerating snare roll (pair with a riser)
//     end t               final hit + ringing chord; the groove stops here
//   Any one-shot cue may be given as {t, g} instead of t: g scales that cue's volume (e.g. hits: [{t: 12.3, g: .5}]).
//   Scene cuts get a whoosh + impact automatically; 'chorus' sections open with a crash.
//   music.lufs       optional loudness target (e.g. -16). Without it the mix is peak-normalized (about -14 LUFS for a dense
//                    30 s reel, but calm 5-minute explainers come out much quieter). With it the mix is K-weighted,
//                    gated (ITU BS.1770) and gained to the target, then limited to about -1 dBFS true peak.

const SR = 44100;
const TAU = Math.PI * 2;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
let rnd = mulberry32(1500);
const noise = () => rnd() * 2 - 1;
const stereo = n => [new Float32Array(n), new Float32Array(n)];
const idx = t => Math.round(t * SR);
function put(b, i, l, r) { if (i >= 0 && i < b[0].length) { b[0][i] += l; b[1][i] += r; } }
const pan = (v, p) => [v * Math.cos((p + 1) * Math.PI / 4) * 1.414, v * Math.sin((p + 1) * Math.PI / 4) * 1.414];
const lpA = fc => 1 - Math.exp(-TAU * Math.min(fc, SR * .45) / SR);

/* ---------------- instruments ---------------- */
function kick(b, t, g) {
  const i0 = idx(t), n = idx(.45); let ph = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR;
    ph += TAU * (43 + 125 * Math.exp(-s * 30)) / SR;
    let v = Math.tanh(Math.sin(ph) * Math.exp(-s * 7) * (s < .002 ? s / .002 : 1) * 1.7);
    if (s < .004) v += noise() * .3 * (1 - s / .004);
    put(b, i0 + k, v * g, v * g);
  }
}
function snare(b, send, t, g) {
  const i0 = idx(t), n = idx(.3); let prev = 0, lp = 0, ph = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR, w = noise(), hp = w - prev; prev = w; lp += (hp - lp) * .55;
    ph += TAU * (185 + 70 * Math.exp(-s * 45)) / SR;
    const v = (lp * Math.exp(-s * 17) * .95 + Math.sin(ph) * Math.exp(-s * 30) * .6) * g;
    put(b, i0 + k, v * .96, v); put(send, i0 + k, v * .18, v * .18);
  }
}
function clap(b, send, t, g) {
  const i0 = idx(t), n = idx(.25); let prev = 0, bp = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR, w = noise(), hp = w - prev; prev = w; bp += (hp - bp) * .3;
    const burst = s < .03 ? Math.exp(-(s % .01) * 400) : Math.exp(-(s - .03) * 22);
    const v = bp * burst * g;
    put(b, i0 + k, v, v * .9); put(send, i0 + k, v * .25, v * .25);
  }
}
function hat(b, t, g, open = false, p = .25) {
  const i0 = idx(t), n = idx(open ? .38 : .07), dec = open ? 13 : 75; let p1 = 0, p2 = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR, w = noise(), h1 = w - p1; p1 = w; const h2 = h1 - p2; p2 = h1;
    const [l, r] = pan(h2 * Math.exp(-s * dec) * g * .45, p); put(b, i0 + k, l, r);
  }
}
function crash(b, send, t, g) {
  const i0 = idx(t), n = idx(2.4); let a1 = 0, a2 = 0, b1 = 0, b2 = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR, env = Math.exp(-s * 2.1) * (s < .003 ? s / .003 : 1);
    const wl = noise(), hl = wl - a1; a1 = wl; const hl2 = hl - a2; a2 = hl;
    const wr = noise(), hr = wr - b1; b1 = wr; const hr2 = hr - b2; b2 = hr;
    put(b, i0 + k, hl2 * env * g * .35, hr2 * env * g * .35);
    put(send, i0 + k, hl2 * env * g * .12, hr2 * env * g * .12);
  }
}
function bass(b, t, dur, m, g, cut) {
  const i0 = idx(t), n = idx(dur + .06), f = mtof(m); let ph = 0, ph2 = 0, y1 = 0, y2 = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR;
    ph = (ph + f / SR) % 1; ph2 += TAU * f / 2 / SR;
    const env = Math.min(1, s / .004) * (s < dur ? Math.exp(-s * 1.8) : Math.exp(-dur * 1.8) * Math.max(0, 1 - (s - dur) / .06));
    const a = lpA(cut * (1 + 3.5 * Math.exp(-s * 16)));
    y1 += a * ((2 * ph - 1) - y1); y2 += a * (y1 - y2);
    const v = Math.tanh((y2 * .8 + Math.sin(ph2) * .6) * 1.3) * env * g;
    put(b, i0 + k, v, v);
  }
}
function pad(b, send, t, dur, notes, g, cut) {
  const i0 = idx(t), rel = .9, n = idx(dur + rel), a = lpA(cut);
  for (const m of notes) {
    for (const [det, p] of [[-.09, -.7], [.09, .7], [0, 0]]) {
      const f = mtof(m + det); let ph = rnd(), y1 = 0, y2 = 0;
      for (let k = 0; k < n; k++) {
        const s = k / SR;
        ph = (ph + f / SR) % 1;
        const env = Math.min(1, s / .35) * (s < dur ? 1 : Math.max(0, 1 - (s - dur) / rel));
        y1 += a * ((2 * ph - 1) - y1); y2 += a * (y1 - y2);
        const [l, r] = pan(y2 * env * g / notes.length, p);
        put(b, i0 + k, l, r); put(send, i0 + k, l * .35, r * .35);
      }
    }
  }
}
function pluck(b, send, t, m, g, cut, p = 0) {
  const i0 = idx(t), n = idx(.4), f = mtof(m); let ph = 0, y1 = 0, y2 = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR;
    ph = (ph + f / SR) % 1;
    const sq = (ph < .5 ? 1 : -1) * .6 + (2 * ph - 1) * .4;
    const a = lpA(cut * (.25 + Math.exp(-s * 18)));
    y1 += a * (sq - y1); y2 += a * (y1 - y2);
    const [l, r] = pan(y2 * Math.exp(-s * 12) * Math.min(1, s / .002) * g, p);
    put(b, i0 + k, l, r); put(send, i0 + k, l * .4, r * .4);
  }
}
function whoosh(b, send, tEnd, len, g, f0 = 250, f1 = 6500) {
  const i0 = idx(tEnd - len), n = idx(len + .05), st = [[0, 0], [0, 0]];
  for (let k = 0; k < n; k++) {
    const s = k / SR, u = Math.min(1, s / len);
    const fc = f0 * Math.pow(f1 / f0, u), f = 2 * Math.sin(Math.PI * Math.min(fc, 7000) / SR);
    const env = Math.pow(u, 2.2) * (s > len ? Math.max(0, 1 - (s - len) / .05) : 1);
    const out = st.map(v => { const x = noise(); v[0] += f * v[1]; const h = x - v[0] - .7 * v[1]; v[1] += f * h; return v[1]; });
    put(b, i0 + k, out[0] * env * g, out[1] * env * g);
    put(send, i0 + k, out[0] * env * g * .3, out[1] * env * g * .3);
  }
}
function swish(b, t, g) {
  const i0 = idx(t), n = idx(.28), st = [0, 0];
  for (let k = 0; k < n; k++) {
    const s = k / SR, u = s / .28, fc = 5000 * Math.pow(.08, u), f = 2 * Math.sin(Math.PI * fc / SR);
    const x = noise(); st[0] += f * st[1]; const h = x - st[0] - .5 * st[1]; st[1] += f * h;
    const v = st[1] * Math.sin(Math.PI * u) * g;
    put(b, i0 + k, v * (1 - u * .6), v * (.4 + u * .6));
  }
}
function impact(b, send, t, g) {
  const i0 = idx(t), n = idx(1.6); let ph = 0, lp = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR;
    ph += TAU * (30 + 55 * Math.exp(-s * 9)) / SR;
    lp += (noise() - lp) * .08;
    const v = (Math.tanh(Math.sin(ph) * 1.8) * Math.exp(-s * 2.6) + lp * Math.exp(-s * 7) * 1.4) * g;
    put(b, i0 + k, v, v); put(send, i0 + k, v * .25, v * .25);
  }
}
function stampHit(b, send, t, g) {
  impact(b, send, t, g * .7); snare(b, send, t, g * .9);
  const i0 = idx(t), n = idx(.12); let ph = 0;
  for (let k = 0; k < n; k++) { const s = k / SR; ph += TAU * (95 - 40 * s / .12) / SR; const v = Math.sin(ph) * Math.exp(-s * 30) * g; put(b, i0 + k, v, v); }
}
function tone(b, send, t, f, len, g, wave = 'sine', p = 0) {
  const i0 = idx(t), n = idx(len + .015); let ph = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR; ph = (ph + f / SR) % 1;
    const w = wave === 'sine' ? Math.sin(ph * TAU) : wave === 'square' ? (ph < .5 ? .6 : -.6) : 2 * ph - 1;
    const env = Math.min(1, s / .002) * (s < len ? 1 : Math.max(0, 1 - (s - len) / .015));
    const [l, r] = pan(w * env * g, p);
    put(b, i0 + k, l, r); if (send) put(send, i0 + k, l * .25, r * .25);
  }
}
function blip(b, send, t, f, g, p = 0) {
  const i0 = idx(t), n = idx(.06); let ph = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR; ph += TAU * f * (1 + .5 * Math.exp(-s * 80)) / SR;
    const [l, r] = pan(Math.sin(ph) * Math.exp(-s * 60) * g, p);
    put(b, i0 + k, l, r); put(send, i0 + k, l * .2, r * .2);
  }
}
function tick(b, t, g, f = 3200) {
  const i0 = idx(t), n = idx(.012); let ph = 0;
  for (let k = 0; k < n; k++) { const s = k / SR; ph += TAU * f / SR; const v = (Math.sin(ph) * .7 + noise() * .3) * Math.exp(-s * 450) * g; put(b, i0 + k, v, v); }
}
function typeKey(b, t, g, p) {
  const i0 = idx(t), n = idx(.05); let ph = 0, ph2 = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR; ph += TAU * 1700 / SR; ph2 += TAU * 170 / SR;
    const v = (noise() * Math.exp(-s * 900) * .8 + Math.sin(ph) * Math.exp(-s * 160) * .35 + Math.sin(ph2) * Math.exp(-s * 90) * .5) * g;
    const [l, r] = pan(v, p); put(b, i0 + k, l, r);
  }
}
function riser(b, send, t0, t1, g) {
  const i0 = idx(t0), len = t1 - t0, n = idx(len), st = [0, 0]; let ph = 0, y = 0;
  for (let k = 0; k < n; k++) {
    const s = k / SR, u = s / len;
    const fc = 400 * Math.pow(14, u), f = 2 * Math.sin(Math.PI * Math.min(fc, 7000) / SR);
    const x = noise(); st[0] += f * st[1]; const h = x - st[0] - .6 * st[1]; st[1] += f * h;
    ph = (ph + mtof(45 + 26 * u) / SR) % 1; y += lpA(900 + 4000 * u) * ((2 * ph - 1) - y);
    const v = (st[1] * .7 + y * .35) * Math.pow(u, 1.6) * g;
    put(b, i0 + k, v, v * .95); put(send, i0 + k, v * .3, v * .3);
  }
}
function reverb(inp) {
  const n = inp[0].length, out = stereo(n);
  [0, 1].forEach(ch => {
    const x = inp[ch], y = out[ch], sp = ch ? 23 : 0;
    const combs = [1557, 1617, 1491, 1422].map(d => ({ buf: new Float32Array(d + sp), i: 0, lp: 0 }));
    const aps = [556, 441].map(d => ({ buf: new Float32Array(d + sp), i: 0 }));
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (const c of combs) { const o = c.buf[c.i]; c.lp = o * .7 + c.lp * .3; c.buf[c.i] = x[k] + c.lp * .8; c.i = (c.i + 1) % c.buf.length; s += o; }
      s *= .25;
      for (const a of aps) { const o = a.buf[a.i]; const v = -s + o; a.buf[a.i] = s + o * .5; a.i = (a.i + 1) % a.buf.length; s = v; }
      y[k] = s;
    }
  });
  return out;
}

/* ---------------- section styles ---------------- */
// kick: '4' four-on-floor | 'late4' enters halfway | 'half' beats 1 & 3.5 | 'bar' once per bar | null
// snare: '24' backbeat | '24clap' backbeat + clap | '3' beat 3 | null
// hats: '16' accented 16ths | '16open' + open hat on the & | '8soft' | '8light' steady quiet 8ths | '8sparse' | null
// bass: '8' eighths | '8oct' eighths with octave pops | 'late8' | 'long' whole notes | null
// arp: false | 'rise' fades in | true | 'bright' | 'soft' quiet and dark, for under captions
const STYLES = {
  intro:     { kick: 'late4', snare: null,     hats: '8soft',   bass: 'late8', arp: 'rise',   pad: [.10, 900] },
  groove:    { kick: '4',     snare: '24',     hats: '16',      bass: '8',     arp: false,    pad: [.08, 1500] },
  drive:     { kick: '4',     snare: '24',     hats: '16',      bass: '8oct',  arp: true,     pad: [.08, 1700] },
  half:      { kick: 'half',  snare: '3',      hats: '8sparse', bass: 'long',  arp: false,    pad: [.11, 650] },
  chorus:    { kick: '4',     snare: '24clap', hats: '16open',  bass: '8oct',  arp: 'bright', pad: [.10, 2800] },
  breakdown: { kick: 'bar',   snare: null,     hats: '8sparse', bass: 'long',  arp: false,    pad: [.12, 1300] },
  calm:      { kick: null,    snare: null,     hats: null,      bass: 'long',  arp: 'soft',   pad: [.09, 1000] },
  pulse:     { kick: 'bar',   snare: null,     hats: '8light',  bass: '8',     arp: 'soft',   pad: [.08, 1300] },
  silent:    { kick: null,    snare: null,     hats: null,      bass: null,    arp: false,    pad: null },
};

/* ---------------- arrangement ---------------- */
module.exports = function synth({ cues = {}, scenes, music = {}, DUR }) {
  rnd = mulberry32(music.seed || 1500);
  const N = Math.ceil(DUR * SR);
  const drums = stereo(N), mus = stereo(N), fx = stereo(N), send = stereo(N);
  const BEAT = 60 / (music.bpm || 150), STEP = BEAT / 4, BAR = BEAT * 4, OFF = music.offset ?? 0;
  const PROG = music.prog || [[38, [62, 65, 69]], [34, [62, 65, 70]], [41, [60, 65, 69]], [36, [60, 64, 67]]];
  const S = scenes.map(s => s.a).concat([DUR]);
  const sec = t => { for (let i = 0; i < S.length - 1; i++) if (t < S[i + 1]) return i; return S.length - 2; };
  const style = i => STYLES[scenes[i].music] || STYLES.groove;
  const chordAt = t => { const pr = scenes[sec(t)].prog || PROG; return pr[((Math.floor((t - OFF) / BAR)) % pr.length + pr.length) % pr.length]; };
  const within = (t, list) => (list || []).some(([a, b]) => t >= a && t < b);
  const endHit = cues.end ?? DUR;
  const kicks = [];

  // pads: one chord per bar, colour from the section the bar starts in
  for (let tb = OFF; tb < endHit; tb += BAR) {
    const t = tb === OFF ? 0 : tb, i = sec(t), st = style(i);
    if (!st.pad) continue;
    const [g, cut] = within(t, cues.freezes) ? [.12, 480] : st.pad;
    const dur = Math.min(tb + BAR, endHit) - t;
    if (dur > .05) pad(mus, send, t, dur, chordAt(tb + .01)[1].map(m => m - 12), g, cut);
  }

  for (let s = 0; ; s++) {
    const t = OFF + s * STEP; if (t >= endHit - .01) break;
    const i = sec(t), st = style(i), bp = s % 16, qp = s % 4, onBeat = qp === 0;
    const sa = S[i], sd = S[i + 1] - S[i], u0 = (t - sa) / sd;
    const [root, ch] = chordAt(t);
    const freeze = within(t, cues.freezes);
    const build = (cues.builds || []).find(([a, b]) => t >= a && t < b);
    const late = u0 >= .5;

    // kick
    let k = 0;
    if (st.kick === '4' && onBeat) k = 1;
    if (st.kick === 'late4' && onBeat && late) k = .85;
    if (st.kick === 'half' && (bp === 0 || bp === 10)) k = 1;
    if (st.kick === 'bar' && bp === 0) k = .55;
    if (freeze && onBeat) k = k ? .4 : 0;
    if (k) { kick(drums, t, k * .95); kicks.push([t, k]); }

    // snare
    if (!freeze && !build) {
      if (st.snare === '24' && (bp === 4 || bp === 12)) snare(drums, send, t, .5);
      if (st.snare === '24clap' && (bp === 4 || bp === 12)) { snare(drums, send, t, .55); clap(drums, send, t, .45); }
      if (st.snare === '3' && bp === 8) snare(drums, send, t, .5);
    }
    if (build) {
      const u = (t - build[0]) / (build[1] - build[0]), every = u < .45 ? 4 : u < .8 ? 2 : 1;
      if (s % every === 0) snare(drums, send, t, .18 + .42 * u);
    }

    // hats
    const acc = [.35, .12, .8, .14][qp], hp = s % 2 ? .35 : -.25;
    if (!freeze) {
      if (st.hats === '16') hat(drums, t, .31 * acc * (build ? 1.25 : 1), false, hp);
      if (st.hats === '16open') { hat(drums, t, .34 * acc, false, hp); if (qp === 2) hat(drums, t, .17, true, -.3); }
      if (st.hats === '16' && bp === 14 && !build) hat(drums, t, .22, true, .3);
      if (st.hats === '8soft' && qp % 2 === 0 && u0 > .25) hat(drums, t, .12 + .1 * u0, false, hp);
      if (st.hats === '8sparse' && qp === 2) hat(drums, t, .11, false, hp);
      if (st.hats === '8light' && qp % 2 === 0) hat(drums, t, qp === 2 ? .13 : .07, false, hp);
    }

    // bass
    if (!freeze) {
      if ((st.bass === '8' || st.bass === '8oct' || (st.bass === 'late8' && late)) && (qp === 0 || qp === 2)) {
        const oct = st.bass === '8oct' && (bp === 6 || bp === 14) ? 12 : 0;
        bass(mus, t, .16, root + oct, .38, st.arp === 'bright' ? 950 : 700);
      }
      if (st.bass === 'long' && bp === 0) bass(mus, t, Math.min(BAR - .15, 1.45), root, .34, 280);
    }

    // arp
    if (st.arp && !freeze) {
      const seq = [0, 1, 2, 1, 2, 0, 2, 1, 0, 2, 1, 2, 0, 1, 2, 0];
      const note = ch[seq[bp] % ch.length] + (bp >= 8 && st.arp === 'bright' ? 12 : 0);
      const g = st.arp === 'rise' ? .04 + .08 * u0 : st.arp === 'bright' ? .13 : st.arp === 'soft' ? .055 : .1;
      const cut = st.arp === 'rise' ? 700 + 2200 * u0 : st.arp === 'bright' ? 4200 : st.arp === 'soft' ? 1500 : 3000;
      pluck(mus, send, t, note, g, cut, s % 2 ? .45 : -.45);
    }
  }

  // sidechain: music ducks under each kick
  const duck = new Float32Array(N).fill(1);
  for (const [tk, d] of kicks) {
    const i0 = idx(tk), n = idx(.3);
    for (let k = 0; k < n && i0 + k < N; k++) duck[i0 + k] = Math.min(duck[i0 + k], 1 - .55 * d * Math.exp(-(k / SR) / .07));
  }

  /* ---- sound design ---- */
  const T = x => (typeof x === 'number' ? x : x.t), G = x => (typeof x === 'number' ? 1 : x.g ?? 1);
  S.slice(1, -1).forEach(b => {
    const cut = scenes[sec(b)].cut || 'wipe';
    if (cut === 'wipe') { whoosh(fx, send, b, .55, .3); impact(fx, send, b, style(sec(b)).kick ? .38 : .22); }
    if (cut === 'fade') whoosh(fx, send, b, .7, .1, 500, 3000);
  });
  scenes.forEach(sc => { if (sc.music === 'chorus') crash(fx, send, sc.a, .8); });
  (cues.hits || []).forEach(x => stampHit(fx, send, T(x), .75 * G(x)));
  (cues.booms || []).forEach(x => { impact(fx, send, T(x), .5 * G(x)); bass(fx, T(x), .9, 26, .3 * G(x), 200); });
  (cues.whooshes || []).forEach(x => whoosh(fx, send, T(x), .55, .16 * G(x), 600, 5000));
  (cues.swishes || []).forEach(x => swish(fx, T(x), .3 * G(x)));
  (cues.beeps || []).forEach(x => tone(fx, send, T(x), x.f || 2750, .07, .12 * G(x)));
  (cues.scans || []).forEach(x => { const t = T(x), g = G(x); tone(fx, send, t, 1900, .05, .1 * g); tone(fx, send, t + .07, 2500, .05, .09 * g); });
  (cues.pops || []).forEach((x, j) => blip(fx, send, T(x), 900 + (j * 37 % 9) * 120, .045 * G(x), ((j * 13) % 11) / 5.5 - 1));
  (cues.blips || []).forEach(x => blip(fx, send, T(x), 1500, .12 * G(x)));
  (cues.ticks || []).forEach(([a, b]) => { for (let t = a, j = 0; t < b; t += .045, j++) tick(fx, t, .09, 2400 + j * 40); });
  (cues.plucks || []).forEach((x, j) => pluck(fx, send, T(x), x.note || [74, 77, 81, 84, 86][j % 5], .16 * G(x), 3400, .3));
  (cues.alarms || []).forEach(x => { const t = T(x), g = G(x); for (let j = 0; j < 4; j++) tone(fx, send, t + j * .13, j % 2 ? 660 : 880, .1, .09 * g, 'square'); impact(fx, send, t, .32 * g); });
  (cues.keys || []).forEach((x, j) => typeKey(fx, T(x), .22 * G(x), ((j * 7) % 5) / 2.5 - 1));
  (cues.risers || []).forEach(([a, b]) => riser(fx, send, a, b, .22));
  (cues.crashes || []).forEach(x => crash(fx, send, T(x), .8 * G(x)));

  if (cues.end != null) {
    impact(fx, send, endHit, .6); kick(drums, endHit, 1); snare(drums, send, endHit, .6); crash(fx, send, endHit, 1);
    pad(mus, send, endHit, DUR - endHit, music.endChord || [50, 57, 62, 64, 65, 69, 74], .16, 2400);
    bass(mus, endHit, Math.max(.2, DUR - endHit - .3), music.endRoot || 38, .32, 300);
  }

  const drops = (cues.drops || []).map(x => [T(x) - .3, T(x)]);
  const gate = t => { for (const [a, b] of drops) if (t >= a && t < b) return Math.max(0, 1 - (t - a) / .03); return 1; };

  /* ---- mix ---- */
  const rv = reverb(send), L = new Float32Array(N), R = new Float32Array(N);
  let peak = 0;
  for (let k = 0; k < N; k++) {
    const t = k / SR, gt = gate(t), fade = Math.min(1, t / .02) * Math.min(1, (DUR - t) / .45);
    for (const [o, c] of [[L, 0], [R, 1]]) {
      const v = (drums[c][k] * .9 * gt + mus[c][k] * duck[k] * .75 * gt + fx[c][k] * .85 + rv[c][k] * .55) * fade;
      o[k] = Math.tanh(v * .6); peak = Math.max(peak, Math.abs(o[k]));
    }
  }
  if (music.lufs == null) {
    const norm = .84 / (peak || 1);
    for (let k = 0; k < N; k++) { L[k] *= norm; R[k] *= norm; }
    return { L, R, SR };
  }
  // loudness target: gain to the target, then a look-ahead peak limiter (smooth gain, no clipping distortion).
  // Two passes because limiting costs a little loudness; the second pass wins it back.
  const CEIL = .75;                                    // aims at -1 dBFS true peak (ffmpeg ebur128): .85 measured -0.2, .78 -0.9, .75 -1.4 dBFS
  const tp = (x, k) => {
    const a = x[k - 1] ?? x[k], b = x[k], c = x[k + 1] ?? x[k], d = x[k + 2] ?? c; let m = Math.abs(b);
    for (const u of [.25, .5, .75]) m = Math.max(m, Math.abs(b + .5 * u * (c - a + u * (2 * a - 5 * b + 4 * c - d + u * (3 * (b - c) + d - a)))));
    return m;
  };
  const att = 1 / (.005 * SR), rel = 1 / (.12 * SR);   // 5 ms look-ahead ramp, 120 ms release
  // 16 kHz low-pass first: the synth's noise hats and key clicks carry energy near Nyquist, which makes inter-sample
  // peaks far above the sample peaks (+2 dB measured). Nothing musical lives up there.
  { const w0 = 2 * Math.PI * 16000 / SR, al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0);
    for (const x of [L, R]) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let k = 0; k < N; k++) { const v = ((1 - c) / 2 * x[k] + (1 - c) * x1 + (1 - c) / 2 * x2 + 2 * c * y1 - (1 - al) * y2) / (1 + al); x2 = x1; x1 = x[k]; y2 = y1; y1 = v; x[k] = v; } } }
  const g = new Float32Array(N);
  for (let pass = 0; pass < 2; pass++) {
    const l = loudness(L, R, SR);
    if (!isFinite(l)) break;
    const gain = Math.min(10 ** ((music.lufs - l) / 20), 8);
    let prev = 1;
    for (let k = 0; k < N; k++) {                      // need + release (forward)
      const pk = Math.max(tp(L, k), tp(R, k)) * gain, need = pk > CEIL ? CEIL / pk : 1;
      prev = Math.min(need, prev + (1 - prev) * rel * 8); g[k] = prev;
    }
    for (let k = N - 2; k >= 0; k--) g[k] = Math.min(g[k], g[k + 1] + att);   // look-ahead: ramp down before the peak
    for (let k = 0; k < N; k++) { const m = gain * g[k]; L[k] *= m; R[k] *= m; }
  }
  return { L, R, SR };
};

/* integrated loudness, ITU-R BS.1770 (K-weighting, 400 ms blocks with 75% overlap, -70 LUFS absolute + -10 LU relative gates) */
function loudness(L, R, sr) {
  const biquad = (x, b0, b1, b2, a0, a1, a2) => {
    const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let k = 0; k < x.length; k++) { const v = (b0 * x[k] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[k]; y2 = y1; y1 = v; y[k] = v; }
    return y;
  };
  const kw = x => {
    let w0 = 2 * Math.PI * 1500 / sr, A = 10 ** (4 / 40), al = Math.sin(w0) / (2 * Math.SQRT1_2), c = Math.cos(w0), sA = Math.sqrt(A);
    const y = biquad(x, A * ((A + 1) + (A - 1) * c + 2 * sA * al), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - 2 * sA * al),
      (A + 1) - (A - 1) * c + 2 * sA * al, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - 2 * sA * al);
    w0 = 2 * Math.PI * 38 / sr; al = Math.sin(w0) / (2 * .5); c = Math.cos(w0);
    return biquad(y, (1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al);
  };
  const yl = kw(L), yr = kw(R), blk = Math.round(.4 * sr), hop = Math.round(.1 * sr), z = [];
  for (let i = 0; i + blk <= yl.length; i += hop) {
    let s = 0; for (let k = i; k < i + blk; k++) s += yl[k] * yl[k] + yr[k] * yr[k];
    z.push(s / blk);
  }
  const lk = p => -.691 + 10 * Math.log10(p);
  const abs = z.filter(p => lk(p) > -70); if (!abs.length) return -Infinity;
  const rel = lk(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const g = abs.filter(p => lk(p) > rel);
  return lk(g.reduce((a, b) => a + b, 0) / g.length);
}

module.exports.writeWav = function writeWav(path, { L, R, SR }) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let k = 0; k < n; k++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[k])) * 32767), 44 + k * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[k])) * 32767), 46 + k * 4);
  }
  require('fs').writeFileSync(path, buf);
};
