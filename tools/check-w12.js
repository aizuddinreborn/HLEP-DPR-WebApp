// w1.2 check (technician): edit another person's activity, add + delete photos; add + edit Bahan tiba.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const out = [];
  await p.goto('http://localhost:8080'); await p.waitForSelector('.person');
  await p.click('.person:has-text("Ali Firdaus")'); for (const k of '1234') await p.click('.pad button[data-k="' + k + '"]');
  await p.waitForSelector('.act'); await p.addStyleTag({ content: '#toasts{display:none!important}' });
  // Zafran's stator activity (not his own)
  await p.click('.act:has-text("stator") [data-edit]');
  await p.waitForSelector('#et'); await p.waitForTimeout(600);
  out.push('delete-activity button: ' + !!(await p.$('.sheet [data-del]')));
  const n0 = await p.$$eval('.sheet [data-prm]', (x) => x.length);
  const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.sheet [data-padd]')]);
  await fc.setFiles([path.join(__dirname, '.cache', 'photo-cable.jpg'), path.join(__dirname, '.cache', 'photo-panel.jpg')]);
  await p.waitForFunction((n) => document.querySelectorAll('.sheet [data-prm]').length === n + 2 && !document.querySelector('.sheet .busy'), n0, { timeout: 30000 });
  await p.screenshot({ path: 'tools/.cache/w12-edit.png' });
  await p.click('.sheet [data-prm] >> nth=0');
  await p.waitForSelector('[data-yes]'); await p.screenshot({ path: 'tools/.cache/w12-confirm.png' });
  await p.click('[data-yes]'); await p.waitForTimeout(2500); out.push('after yes: layers=' + (await p.$$eval('.lay', (x) => x.length)) + ' toasts=' + (await p.$$eval('.toast', (x) => x.map((t) => t.textContent).join(' / '))) + ' prm=' + (await p.$$eval('.sheet [data-prm]', (x) => x.length))); console.log(out.join('\n'));
  await p.waitForFunction((n) => document.querySelectorAll('.sheet [data-prm]').length === n + 1, n0, { timeout: 15000 });
  out.push('photos ' + n0 + ' → +2 → -1 = ' + (await p.$$eval('.sheet [data-prm]', (x) => x.length)));
  await p.click('.sheet [data-close]'); await p.waitForTimeout(1500);
  out.push('home card count: ' + (await p.$eval('.act:has-text("stator") .strip', (s) => s.querySelectorAll('.ph').length + ' tiles, ' + ((s.querySelector('.more') || {}).textContent || 'no +N'))));
  // Bahan tiba
  await p.click('.tab[data-tab="data"]'); await p.waitForTimeout(700);
  out.push('material add button: ' + !!(await p.$('[data-mat]')) + ', delete icons: ' + (await p.$$('[data-mdel]')).length);
  await p.click('[data-medit] >> nth=0'); await p.waitForSelector('#mti');
  await p.fill('#mti', 'Stator halves (re-delivered)');
  await p.screenshot({ path: 'tools/.cache/w12-mat.png' });
  await p.click('.sheet [data-ok]'); await p.waitForTimeout(1500);
  out.push('material now: ' + (await p.$eval('[data-medit] >> nth=0', (x) => x.textContent.trim().slice(0, 60))));
  await p.click('[data-mat]'); await p.click('.sheet [data-area="U1"]'); await p.click('.sheet [data-cat="U1_EPS"]');
  await p.fill('#mti', 'Cable ladder 300mm'); await p.click('.sheet [data-ok]'); await p.waitForTimeout(1500);
  out.push('added: ' + !!(await p.$('[data-medit]:has-text("Cable ladder 300mm")')));
  await p.evaluate(() => document.querySelector('[data-medit]').scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: 'tools/.cache/w12-data.png' });
  console.log(out.join('\n') + '\n' + (errs.length ? 'ERRORS: ' + errs.join(' | ') : 'no errors'));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
