// UI walk-through on the local preview, with screenshots + console errors.
//   node tools/shots.js [baseUrl] [outDir] [--laptop] [--scale=2]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const BASE = args.find((a) => /^http/.test(a)) || 'http://localhost:8080';
const OUT = args.find((a) => !/^(http|--)/.test(a)) || path.join(__dirname, '.cache', 'shots');
const LAPTOP = args.includes('--laptop');
const SCALE = Number((args.find((a) => /^--scale=/.test(a)) || '--scale=1').split('=')[1]);
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext(LAPTOP ? { viewport: { width: 1366, height: 860 }, deviceScaleFactor: SCALE } : { viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  let n = 0;
  const shot = async (name) => { await p.waitForTimeout(450); await p.screenshot({ path: path.join(OUT, String(++n).padStart(2, '0') + '-' + name + '.png') }); };
  const photo = (k) => path.join(__dirname, '.cache', 'photo-' + k + '.jpg');

  await p.goto(BASE);
  await p.waitForSelector('.person');
  await shot('login');
  await p.click('.person:has-text("Ali Firdaus")');
  await shot('pin');
  for (const k of '1234') await p.click('.pad button[data-k="' + k + '"]');
  await p.waitForSelector('.act');
  await p.waitForTimeout(800);
  await shot('home');
  await p.evaluate(() => window.scrollTo(0, 600));
  await shot('home-scrolled');
  await p.evaluate(() => window.scrollTo(0, 0));

  // add an activity
  await p.click('#fab');
  await p.waitForSelector('.sheet [data-pick]');
  await shot('add-empty');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.sheet [data-pick]')]);
  await fc.setFiles([photo('cable'), photo('panel')]);
  await p.waitForFunction(() => document.querySelectorAll('.sheet .photos .ph img').length === 2 && !document.querySelector('.sheet .busy'));
  await p.click('.sheet [data-area="U1"]');
  await p.click('.sheet [data-cat="U1_EPS"]');
  await shot('add-system');
  await p.click('.sheet [data-st="CP"]');
  await p.fill('#raw', 'uji IR kabel LV dan MV');
  await shot('add-filled');
  await p.click('#addgo');
  await p.waitForSelector('#pv');
  await p.waitForTimeout(300);
  await p.evaluate(() => { const el = document.querySelector('#pv'); el.scrollIntoView({ block: 'center' }); });
  await shot('add-preview');
  await p.click('#addgo');
  await p.waitForTimeout(2500);
  await shot('home-after-save');

  // edit own line
  const ed = await p.$('[data-edit]');
  if (ed) { await ed.click(); await p.waitForSelector('#et'); await shot('edit'); await p.click('.sheet [data-close]'); await p.waitForTimeout(300); }

  // data tab
  await p.click('.tab[data-tab="data"]');
  await p.waitForTimeout(600);
  await shot('data');
  // report tab (technician)
  await p.click('.tab[data-tab="report"]');
  await p.waitForTimeout(800);
  await shot('report-tech');
  await p.click('.tab[data-tab="me"]');
  await shot('me-tech');

  // engineer
  await p.click('[data-out]');
  await p.waitForSelector('.person');
  await p.click('.pad button[data-k="back"]').catch(() => {});
  await p.waitForSelector('.person');
  await p.click('.person:has-text("Aizuddin")');
  for (const k of '1234') await p.click('.pad button[data-k="' + k + '"]');
  await p.waitForSelector('.act');
  await p.click('.tab[data-tab="report"]');
  await p.waitForTimeout(500);
  await p.click('[data-wa]');
  await p.waitForSelector('#wa0');
  await shot('report-wa');
  await p.click('[data-pdf="1"]');
  await p.waitForSelector('#hlv', { timeout: 20000 });
  await shot('pdf-headline');
  await p.click('[data-hok]');
  await p.waitForSelector('#pfend [data-dl]', { timeout: 60000 });
  await shot('pdf-done');
  await p.click('.sheet [data-close]');
  await p.click('.tab[data-tab="data"]');
  await p.waitForTimeout(500);
  await p.click('[data-pct="U1_DTHOIST"]');
  await shot('pct');
  await p.click('.sheet [data-close]');

  // offline
  await ctx.setOffline(true);
  await p.click('.tab[data-tab="home"]');
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.click('#fab');
  await p.click('.sheet [data-same]').catch(() => {});
  await p.waitForTimeout(200);
  if (await p.$('#raw')) {
    if (!(await p.$('.sheet [data-st][aria-pressed="true"]'))) { await p.click('.sheet [data-area="U1"]'); await p.click('.sheet [data-cat="U1_EPS"]'); await p.click('.sheet [data-st="IP"]'); }
    await p.fill('#raw', 'pasang DB 415VAC baru di bilik suis');
    await p.click('#addgo');
    await p.waitForTimeout(800);
  }
  await shot('offline-pending');
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForTimeout(3500);
  await shot('back-online');

  console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
