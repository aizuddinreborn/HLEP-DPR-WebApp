// Clean 2× phone screenshots of the real app (local preview) for the how-to video, plus tap targets.
//   node tools/video-shots.js  → tools/.cache/video/*.png + taps.json
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = path.join(__dirname, '.cache', 'video');
fs.mkdirSync(OUT, { recursive: true });
const photo = (k) => path.join(__dirname, '.cache', 'photo-' + k + '.jpg');

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const taps = {};
  const hideToasts = () => p.addStyleTag({ content: '#toasts{display:none!important} *{caret-color:transparent!important}' });
  const box = async (sel) => { const el = await p.$(sel); if (!el) return null; const r = await el.boundingBox(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; };
  const shot = async (name, tapSel) => {
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(OUT, name + '.png') });
    taps[name] = tapSel ? await box(tapSel) : null;
  };

  await p.goto(BASE);
  await hideToasts();
  await p.waitForSelector('.person');
  await p.waitForTimeout(500);
  await shot('login', '.person:has-text("Ali Firdaus")');
  await p.click('.person:has-text("Ali Firdaus")');
  await p.click('.pad button[data-k="1"]'); await p.click('.pad button[data-k="2"]');
  await shot('pin', '.pad button[data-k="3"]');
  await p.click('.pad button[data-k="3"]'); await p.click('.pad button[data-k="4"]');
  await p.waitForSelector('.act');
  await hideToasts();
  await p.waitForTimeout(1200);
  await shot('home', '#fab');

  await p.click('#fab');
  await p.waitForSelector('.sheet [data-pick]');
  await p.waitForTimeout(400);
  await shot('add-empty', '.sheet [data-pick]');
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.sheet [data-pick]')]);
  await fc.setFiles([photo('cable'), photo('panel'), photo('cable')]);
  await p.waitForFunction(() => document.querySelectorAll('.sheet .photos .ph img').length === 3 && !document.querySelector('.sheet .busy'));
  await shot('add-photos', '.sheet [data-area="U1"]');
  await p.click('.sheet [data-area="U1"]');
  await p.click('.sheet [data-cat="U1_EPS"]');
  await p.waitForTimeout(500);
  await p.evaluate(() => { document.querySelector('.sheet [data-cat="U1_EPS"]').scrollIntoView({ block: 'start' }); document.querySelector('.sheet-b').scrollTop -= 60; });
  await shot('add-system', '.sheet [data-st="CP"]');
  await p.click('.sheet [data-st="CP"]');
  await p.fill('#raw', 'uji IR kabel LV dan MV');
  await p.evaluate(() => document.querySelector('#raw').scrollIntoView({ block: 'center' }));
  await shot('add-filled', '#addgo');
  await p.click('#addgo');
  await p.waitForSelector('#pv');
  await p.evaluate(() => document.querySelector('#pv').scrollIntoView({ block: 'center' }));
  await shot('add-preview', '#addgo');
  await p.click('#addgo');
  await p.waitForTimeout(3000);
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('home-saved', '.act');

  const ed = await p.$('[data-edit]');
  await shot('home-edit', '[data-edit]');
  await ed.click();
  await p.waitForSelector('#et');
  await shot('edit', '[data-save]');
  await p.click('.sheet [data-close]');
  await p.waitForTimeout(400);

  // offline
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await p.click('#fab');
  await p.waitForSelector('.sheet [data-same]');
  await p.click('.sheet [data-same]');
  await p.fill('#raw', 'pasang DB 415VAC baru di bilik suis');
  await p.click('#addgo');
  await p.waitForTimeout(900);
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('offline', '.act.pending');
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await p.waitForTimeout(4000);
  await p.evaluate(() => window.scrollTo(0, 0));
  await shot('online', null);

  // engineer
  await p.click('.tab[data-tab="me"]');
  await p.waitForTimeout(300);
  await p.click('[data-out]');
  await p.waitForSelector('.person');
  await p.click('.pad button[data-k="back"]').catch(() => {});
  await p.waitForSelector('.person');
  await p.click('.person:has-text("Aizuddin")');
  for (const k of '1234') await p.click('.pad button[data-k="' + k + '"]');
  await p.waitForSelector('.act');
  await hideToasts();
  await p.click('.tab[data-tab="report"]');
  await p.waitForTimeout(700);
  await shot('report', '[data-wa]');
  await p.click('[data-wa]');
  await p.waitForSelector('#wa0');
  await p.evaluate(() => { const el = document.querySelector('[data-wa]'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 140); });
  await shot('report-wa', '[data-copy="0"]');
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('[data-pdf="1"]');
  await p.waitForSelector('#hlv', { timeout: 20000 });
  await shot('pdf-headline', '[data-hok]');
  await p.click('[data-hok]');
  await p.waitForSelector('#pfend [data-dl]', { timeout: 60000 });
  await shot('pdf-done', '#pfend [data-dl]');
  await p.click('.sheet [data-close]');
  await p.click('.tab[data-tab="data"]');
  await p.waitForTimeout(700);
  await shot('data', null);

  fs.writeFileSync(path.join(OUT, 'taps.json'), JSON.stringify(taps, null, 1));
  console.log(Object.keys(taps).join(' '));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
