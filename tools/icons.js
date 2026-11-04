// Renders app/icons/*.png from tools/icon.svg.  node tools/icons.js
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const b = await chromium.launch(); const p = await b.newPage();
  const shot = async (size, pad, radius, out) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${pad ? '#B99AF6' : 'transparent'}"><div style="width:${size - pad * 2}px;height:${size - pad * 2}px;border-radius:${radius}px;overflow:hidden">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div></body></html>`);
    await p.screenshot({ path: path.join(__dirname, '..', 'app', 'icons', out), omitBackground: !pad });
  };
  await shot(192, 0, 0, 'icon-192.png');
  await shot(512, 0, 0, 'icon-512.png');
  await shot(180, 0, 0, 'apple-touch-icon.png');
  await shot(512, 56, 90, 'maskable-512.png');
  await b.close();
})();
