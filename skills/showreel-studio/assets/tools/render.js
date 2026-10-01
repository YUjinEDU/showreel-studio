// Showreel renderer (template v1). Run from the project root; see USAGE below.
// Headless Chrome drives <reelDir>/index.html frame by frame (window.reel.renderAt), so the MP4 matches the page.
const puppeteer = require('puppeteer-core');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const mode = argv[0], reelDir = argv[1] && path.resolve(argv[1]);
const flag = name => { const i = argv.indexOf('--' + name); return i > 0 ? argv[i + 1] : null; };
const USAGE = `usage: node render.js <mode> <reelDir> [options]

All times are GLOBAL seconds from the start of the reel (the HUD timecode).
In reel.js, scene code uses LOCAL time; global = SC[i] + local.

  sheet  <dir> [--times 1.5,4,9 | --holds] [--cols 3] [--out f.png]
         Contact sheet. Default: each scene at 50% and 93%. --holds: each scene's finished
         state (where presenter mode stops) — the "slide list" of the reel. --cols 2 → 960×540 cells (readable
         small text), 3 → 640×360 (default). Any number of times; rows grow as needed.
  frames <dir> --times 1.5,4,9 [--out-dir build/frames]
         Full-resolution 1920×1080 PNGs, one per time (for reading small text).
  audit  <dir>
         Layout audit → build/audit.json. Issues carry global from/to and scene.
         Kinds: offscreen, margin, overlap, reading-critical, reading-tight.
  audio  <dir> [--out f.mp3]
         Synthesize the score. Default writes <dir>/reel-music.mp3 (the published file!).
         Reviewers: pass --out build/check.mp3 to avoid touching deliverables.
  video  <dir> [--out f.mp4]
         Score + all frames → MP4 (≈1 min for 30 s). Default build/reel.mp4. Rewrites reel-music.mp3.
  bundle <dir>
         Inline engine.js + reel.js → build/artifact.html (publish with reel-music.mp3 alongside).`;
if (!mode || mode === 'help' || argv.includes('--help') || !reelDir || !fs.existsSync(path.join(reelDir, 'index.html'))) {
  console.error(USAGE);
  process.exit(mode === 'help' || argv.includes('--help') ? 0 : 2);
}
const BUILD = path.join(reelDir, 'build');
fs.mkdirSync(BUILD, { recursive: true });
const WAV = path.join(BUILD, 'reel-music.wav');

const CHROME = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => fs.existsSync(p));

function run(args, feed) {
  return new Promise((res, rej) => {
    const p = spawn(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: [feed ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
    p.on('close', c => (c === 0 ? res() : rej(new Error('ffmpeg exited ' + c))));
    if (feed) feed(p.stdin).catch(rej);
  });
}

async function openPage() {
  if (!CHROME) throw new Error('Chrome/Edge not found — set CHROME_PATH');
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({ width: 1400, height: 1000 });
  await page.goto('file:///' + path.join(reelDir, 'index.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 60000 });
  const ok = await page.evaluate(() => !!(window.reel && window.reel.ready));
  if (!ok) throw new Error('window.reel missing — reel.js failed to load or Reel.define() threw.\n' + errors.join('\n'));
  await page.evaluate(() => window.reel.ready);
  await page.evaluate(() => window.reel.pause());
  const fonts = await page.evaluate(() => [...document.fonts].filter(f => f.status === 'error').map(f => f.family));
  if (fonts.length) console.warn('warning: fonts failed to load:', [...new Set(fonts)].join(', '));
  const real = errors.filter(e => !/favicon|reel-music/.test(e));
  if (real.length) console.warn('page errors:\n' + real.join('\n'));
  return { browser, page };
}

async function makeAudio(page, MP3 = path.join(reelDir, 'reel-music.mp3')) {
  const input = await page.evaluate(() => ({ cues: window.reel.cues, scenes: window.reel.scenes, music: window.reel.music, DUR: window.reel.DUR }));
  const musicPath = path.join(reelDir, 'music.js');
  delete require.cache[require.resolve(musicPath)];
  const synth = require(musicPath);
  const t0 = Date.now();
  const out = synth(input);
  synth.writeWav(WAV, out);
  await run(['-i', WAV, '-c:a', 'libmp3lame', '-b:a', '192k', path.resolve(MP3)]);
  console.log(`audio: ${path.resolve(MP3)} — length ${(out.L.length / out.SR).toFixed(2)}s, synthesized in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function bundle() {
  let html = fs.readFileSync(path.join(reelDir, 'index.html'), 'utf8');
  html = html.replace(/<script src="([^"]+\.js)"><\/script>/g, (m, f) => {
    const p = path.join(reelDir, f);
    return fs.existsSync(p) ? `<script>\n${fs.readFileSync(p, 'utf8').replace(/<\/script/gi, '<\\/script')}\n</script>` : m;
  });
  const out = path.join(BUILD, 'artifact.html');
  fs.writeFileSync(out, html);
  console.log('bundle:', out, '(publish with reel-music.mp3 alongside)');
}

(async () => {
  if (mode === 'bundle') return bundle();
  const { browser, page } = await openPage();
  try {
    if (mode === 'sheet') {
      const times = flag('times') ? flag('times').split(',').map(Number)
        : argv.includes('--holds') ? await page.evaluate(() => window.reel.scenes.map((s, k) => window.reel.presenter.holdOf(k)))
        : await page.evaluate(() => window.reel.scenes.flatMap(s => [s.a + (s.b - s.a) * .5, s.a + (s.b - s.a) * .93]));
      const out = flag('out') || path.join(BUILD, 'sheet.png');
      const cols = Math.max(1, Math.min(4, Number(flag('cols')) || 3));
      const b64 = await page.evaluate((ts, cols) => {
        const tw = 1920 / cols, th = 1080 / cols, rows = Math.ceil(ts.length / cols);
        const sheet = document.createElement('canvas'); sheet.width = tw * cols; sheet.height = th * rows;
        const g = sheet.getContext('2d'), src = document.getElementById('reel');
        ts.forEach((t, i) => {
          window.reel.renderAt(t);
          const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
          g.drawImage(src, x, y, tw, th);
          g.fillStyle = '#000'; g.fillRect(x, y, 70, 28);
          g.fillStyle = '#FFD400'; g.font = '700 18px monospace'; g.fillText(t.toFixed(1) + 's', x + 8, y + 20);
        });
        return sheet.toDataURL('image/png');
      }, times, cols);
      fs.writeFileSync(out, Buffer.from(b64.split(',')[1], 'base64'));
      console.log('sheet:', out, `(${times.length} frames: ${times.map(t => t.toFixed(1)).join(', ')})`);
    } else if (mode === 'frames') {
      if (!flag('times')) throw new Error('frames needs --times a,b,c (global seconds)');
      const times = flag('times').split(',').map(Number);
      const dir = path.resolve(flag('out-dir') || path.join(BUILD, 'frames'));
      fs.mkdirSync(dir, { recursive: true });
      for (const t of times) {
        const b64 = await page.evaluate(t => { window.reel.renderAt(t); return document.getElementById('reel').toDataURL('image/png'); }, t);
        const f = path.join(dir, `t${t.toFixed(2).replace('.', '_')}.png`);
        fs.writeFileSync(f, Buffer.from(b64.split(',')[1], 'base64'));
        console.log('frame:', f);
      }
    } else if (mode === 'audit') {
      const rep = await page.evaluate(() => window.reel.audit(.1));
      const out = path.join(BUILD, 'audit.json');
      fs.writeFileSync(out, JSON.stringify(rep, null, 2));
      const by = rep.issues.reduce((m, i) => ((m[i.kind] = (m[i.kind] || 0) + 1), m), {});
      console.log(`audit: ${rep.issues.length} issue(s) ${JSON.stringify(by)} → ${out}`);
      rep.issues.forEach(i => console.log(`  [${i.kind}] ${i.from}–${i.to}s (scene ${i.scene}) ${i.text} — ${i.detail}`));
    } else if (mode === 'audio') {
      await makeAudio(page, flag('out') || undefined);
    } else if (mode === 'video') {
      await makeAudio(page);
      const out = path.resolve(flag('out') || path.join(BUILD, 'reel.mp4'));
      fs.mkdirSync(path.dirname(out), { recursive: true });
      const { DUR, FPS } = await page.evaluate(() => ({ DUR: window.reel.DUR, FPS: window.reel.FPS }));
      const N = Math.round(DUR * FPS), t0 = Date.now();
      await run([
        '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-i', WAV,
        '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-tune', 'animation',
        '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out,
      ], async stdin => {
        for (let f = 0; f < N; f++) {
          const b64 = await page.evaluate(t => window.reel.frameJPEG(t, .95), f / FPS);
          if (!stdin.write(Buffer.from(b64.split(',')[1], 'base64'))) await new Promise(r => stdin.once('drain', r));
          if (f % 150 === 0) console.log(`frame ${f}/${N} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
        stdin.end();
      });
      console.log('video:', out);
    } else {
      throw new Error(`unknown mode "${mode}"`);
    }
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
