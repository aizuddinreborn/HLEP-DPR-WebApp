// w1.1 check: all photos in the edit sheet; PDF photo limit picker (engineer).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8080'); await p.waitForSelector('.person');
  await p.click('.person:has-text("Aizuddin")'); for (const k of '1234') await p.click('.pad button[data-k="' + k + '"]');
  await p.waitForSelector('.act'); await p.addStyleTag({ content: '#toasts{display:none!important}' });
  // the 4-photo stator entry
  await p.click('.act:has-text("stator") [data-edit]');
  await p.waitForSelector('#et'); await p.waitForTimeout(800);
  const n = await p.$$eval('.sheet [data-ph] .ph', (x) => x.length);
  await p.screenshot({ path: 'tools/.cache/w11-edit.png' });
  await p.click('.sheet [data-close]'); await p.waitForTimeout(300);
  await p.click('.tab[data-tab="me"]'); await p.click('[data-setl]');
  await p.waitForSelector('[data-s]'); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#setl').scrollIntoView({ block: 'end' }));
  await p.screenshot({ path: 'tools/.cache/w11-list.png' });
  await p.click('[data-s]:has-text("Had gambar")');
  await p.waitForSelector('[data-n]');
  await p.click('[data-n="4"]');
  await p.screenshot({ path: 'tools/.cache/w11-pick.png' });
  await p.click('.sheet [data-ok]'); await p.waitForTimeout(1200);
  const val = await p.$eval('[data-s]:has-text("Had gambar") .s', (x) => x.textContent);
  console.log('edit photos shown:', n, '· limit now:', val, errs.length ? '· ERR ' + errs.join(' | ') : '· no errors');
  await b.close();
})();
