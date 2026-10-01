#!/usr/bin/env node
// Scaffold a new showreel from the template.
//   node <showreel-studio skill dir>/scripts/new-reel.js <slug> --title "제목" [--date 2026-09-29] [--eyebrow "..."] [--force]
// Creates (relative to the project root = current directory):
//   showreel/tools/            shared renderer + node_modules (installed once)
//   showreel/reels/<slug>/     index.html, engine.js, reel.js, music.js, _work/
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const argv = process.argv.slice(2);
const slug = argv[0];
const flag = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };
if (!slug || slug.startsWith('--') || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error('usage: new-reel.js <slug: lowercase-kebab> --title "제목" [--date YYYY-MM-DD] [--eyebrow "..."] [--force]');
  process.exit(2);
}
const SKILL = path.resolve(__dirname, '..');
const ROOT = process.cwd();
const TOOLS = path.join(ROOT, 'showreel', 'tools');
const REEL = path.join(ROOT, 'showreel', 'reels', slug);
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10); // local date, not UTC
const date = flag('date') || today;
const title = flag('title') || slug;
const eyebrow = flag('eyebrow') || `${date.replace(/-/g, '.')}`;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

// 1. shared tools
if (!fs.existsSync(path.join(TOOLS, 'render.js'))) {
  copyDir(path.join(SKILL, 'assets', 'tools'), TOOLS);
  console.log('tools: copied to', path.relative(ROOT, TOOLS));
}
if (!fs.existsSync(path.join(TOOLS, 'node_modules', 'puppeteer-core'))) {
  console.log('tools: npm install (first time only)…');
  execSync('npm install --no-audit --no-fund', { cwd: TOOLS, stdio: 'inherit' });
}
try {
  const ff = require(path.join(TOOLS, 'node_modules', 'ffmpeg-static'));
  if (!fs.existsSync(ff)) execSync('node node_modules/ffmpeg-static/install.js', { cwd: TOOLS, stdio: 'inherit' });
} catch (e) { console.warn('warning: ffmpeg-static check failed:', e.message); }

// 2. reel folder
if (fs.existsSync(REEL) && !argv.includes('--force')) {
  console.error(`exists: ${path.relative(ROOT, REEL)} — pick another slug or pass --force`);
  process.exit(1);
}
copyDir(path.join(SKILL, 'assets', 'template'), REEL);
fs.mkdirSync(path.join(REEL, '_work'), { recursive: true });
const fill = f => {
  const p = path.join(REEL, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8')
    .replaceAll('{{TITLE}}', title)
    .replaceAll('{{EYEBROW}}', eyebrow)
    .replaceAll('{{HUD_RIGHT}}', eyebrow)
    .replaceAll('{{META}}', '1920×1080 · 30fps'));
};
fill('index.html'); fill('reel.js');

console.log(`reel: ${path.relative(ROOT, REEL)}
next:
  node showreel/tools/render.js sheet  ${path.relative(ROOT, REEL)}   # preview frames → build/sheet.png
  node showreel/tools/render.js audit  ${path.relative(ROOT, REEL)}   # layout audit
  node showreel/tools/render.js video  ${path.relative(ROOT, REEL)} --out reports/${date}_${slug}.mp4`);
