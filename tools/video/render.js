// Renders the how-to video frame by frame.
//   node tools/video/render.js --stills 3,9,30        → stills only (checking)
//   node tools/video/render.js                         → tools/.cache/video/frames.mp4 (no audio)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CACHE = path.join(ROOT, 'tools', '.cache', 'video');
const FONTS = path.join(ROOT, 'tools', '.cache', 'fonts', 'node_modules', '@fontsource', 'plus-jakarta-sans', 'files');
const FPS = 30, TOTAL = 80;
const args = process.argv.slice(2);
const stillsArg = args.indexOf('--stills') >= 0 ? args[args.indexOf('--stills') + 1] : null;

(async () => {
  const taps = JSON.parse(fs.readFileSync(path.join(CACHE, 'taps.json'), 'utf8'));
  const shots = {};
  fs.readdirSync(CACHE).filter((f) => /\.png$/.test(f) && !/^still/.test(f)).forEach((f) => { shots[f.replace(/\.png$/, '')] = 'file://' + path.join(CACHE, f); });
  let html = fs.readFileSync(path.join(__dirname, 'compose.html'), 'utf8')
    .replace(/FONTS\//g, 'file://' + FONTS + '/')
    .replace(/src="ICON"/g, 'src="file://' + path.join(ROOT, 'app', 'icons', 'icon-512.png') + '"')
    .replace('<script>', '<script>window.SHOTS=' + JSON.stringify(shots) + ';window.TAPS=' + JSON.stringify(taps) + ';window.URL_TEXT="aizuddinreborn.github.io/HLEP-DPR-WebApp";</script><script>');
  const page = path.join(CACHE, 'compose.html');
  fs.writeFileSync(page, html);

  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await p.goto('file://' + page);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);

  if (stillsArg) {
    for (const s of stillsArg.split(',')) {
      await p.evaluate((t) => window.seek(t), Number(s));
      await p.screenshot({ path: path.join(CACHE, 'still-' + s + '.png') });
    }
    await b.close();
    return;
  }
  const out = path.join(CACHE, 'frames.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const N = FPS * TOTAL;
  const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    await p.evaluate((t) => window.seek(t), f / FPS);
    const buf = await p.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log('frame ' + f + '/' + N + ' · ' + Math.round((Date.now() - t0) / 1000) + 's');
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await b.close();
  console.log('done ' + out);
})().catch((e) => { console.error(e); process.exit(1); });
