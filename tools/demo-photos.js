// Draws illustrative "site photos" (original pastel scenes) for the local preview and the how-to video.
// node tools/demo-photos.js  → tools/.cache/photo-*.jpg
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '.cache');
const bg = (a, b) => `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#bg)"/>`;
const floor = '<rect y="470" width="800" height="130" fill="#C9C3D9"/><rect y="470" width="800" height="8" fill="#B5AEC9"/>';
const stamp = (t) => `<rect x="24" y="530" width="300" height="46" rx="10" fill="rgba(0,0,0,.45)"/><text x="40" y="561" font-family="monospace" font-size="22" fill="#fff">${t}</text>`;
const SCENES = {
  cable: bg('#DCE7F5', '#EEF2F8') + floor +
    '<rect x="70" y="120" width="190" height="350" rx="10" fill="#8FA3BF"/><rect x="90" y="150" width="150" height="90" rx="6" fill="#B9C7DA"/><circle cx="120" cy="300" r="14" fill="#5CC08F"/><circle cx="165" cy="300" r="14" fill="#F2B04A"/><circle cx="210" cy="300" r="14" fill="#E46F6F"/>' +
    '<path d="M260 380 C 360 380, 380 300, 470 300 S 640 360, 760 330" stroke="#2B2B2B" stroke-width="26" fill="none"/><path d="M260 410 C 360 410, 400 340, 490 340 S 650 400, 790 380" stroke="#3A3A3A" stroke-width="22" fill="none"/>' +
    '<g transform="translate(560 360)"><circle r="96" fill="#B07A44"/><circle r="70" fill="#8A5A2B"/><circle r="22" fill="#D9B48A"/></g>' +
    '<g transform="translate(420 240)"><rect x="-22" y="40" width="44" height="120" rx="14" fill="#F28C38"/><circle r="30" cy="10" fill="#F1C7A3"/><path d="M-36 0 a36 30 0 0 1 72 0z" fill="#FFD43B"/></g>',
  panel: bg('#E9E4F5', '#F5F2FA') + floor +
    [0, 1, 2].map((i) => `<rect x="${110 + i * 200}" y="90" width="180" height="380" rx="8" fill="#D2D8E2" stroke="#9CA6B8" stroke-width="4"/><rect x="${130 + i * 200}" y="120" width="140" height="70" rx="5" fill="#2F3B52"/><text x="${150 + i * 200}" y="165" font-family="monospace" font-size="26" fill="#7CF2B0">${['415V', '230V', '110V'][i]}</text>` +
      [0, 1, 2, 3].map((j) => `<rect x="${135 + i * 200}" y="${215 + j * 52}" width="130" height="32" rx="5" fill="#AEB8C8"/><circle cx="${245 + i * 200}" cy="${231 + j * 52}" r="8" fill="${['#5CC08F', '#F2B04A', '#5CC08F', '#E46F6F'][j]}"/>`).join('')).join(''),
  battery: bg('#E2F1EA', '#F2F8F5') + floor +
    '<rect x="80" y="160" width="640" height="16" fill="#7B8798"/><rect x="80" y="300" width="640" height="16" fill="#7B8798"/><rect x="80" y="440" width="640" height="16" fill="#7B8798"/>' +
    [0, 1].map((r) => [0, 1, 2, 3, 4, 5, 6, 7].map((k) => `<rect x="${100 + k * 76}" y="${190 + r * 140}" width="62" height="108" rx="6" fill="#3C4A5E"/><rect x="${110 + k * 76}" y="${180 + r * 140}" width="14" height="14" fill="#E46F6F"/><rect x="${138 + k * 76}" y="${180 + r * 140}" width="14" height="14" fill="#2F3B52"/>`).join('')).join(''),
  stator: bg('#F7E9DE', '#FBF3EC') + floor +
    '<g transform="translate(400 330)"><circle r="210" fill="#6E7A8A"/><circle r="170" fill="#C47A3E"/><circle r="120" fill="#8E5427"/><circle r="70" fill="#D9C8B4"/>' +
    Array.from({ length: 36 }, (_, i) => `<rect x="-6" y="-200" width="12" height="40" fill="#B06A33" transform="rotate(${i * 10})"/>`).join('') + '</g>' +
    '<rect x="390" y="0" width="20" height="120" fill="#555"/><path d="M380 120h40l-20 30z" fill="#F2B04A"/>',
  crane: bg('#E3EEFB', '#F3F7FC') + floor +
    '<rect x="0" y="80" width="800" height="40" fill="#F2B04A"/><rect x="0" y="80" width="800" height="10" fill="#D9932C"/><rect x="330" y="120" width="140" height="70" rx="8" fill="#E0A23C"/>' +
    '<rect x="396" y="190" width="8" height="160" fill="#444"/><path d="M380 350h40v20c0 30-40 30-40 0" stroke="#444" stroke-width="10" fill="none"/>' +
    '<rect x="60" y="120" width="40" height="350" fill="#B9C2CE"/><rect x="700" y="120" width="40" height="350" fill="#B9C2CE"/>',
  transformer: bg('#EAF3E6', '#F5F9F2') + floor +
    '<rect x="230" y="200" width="340" height="270" rx="14" fill="#8C9A7E"/>' + [0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${250 + i * 46}" y="230" width="26" height="210" rx="6" fill="#76856A"/>`).join('') +
    [0, 1, 2].map((i) => `<rect x="${290 + i * 100}" y="110" width="22" height="90" fill="#D8DDE3"/>` + [0, 1, 2, 3].map((j) => `<ellipse cx="${301 + i * 100}" cy="${125 + j * 20}" rx="22" ry="7" fill="#B9C2CE"/>`).join('')).join('')
};

async function make() {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  const names = Object.keys(SCENES);
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    const file = path.join(OUT, 'photo-' + n + '.jpg');
    if (fs.existsSync(file)) continue;
    await p.setContent(`<html><body style="margin:0"><svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">${SCENES[n]}${stamp('2026-11-04 ' + (8 + i) + ':' + (10 + i * 7) + ' SJ CEND')}</svg></body></html>`);
    await p.screenshot({ path: file, type: 'jpeg', quality: 82 });
  }
  await b.close();
  return names.map((n) => path.join(OUT, 'photo-' + n + '.jpg'));
}
if (require.main === module) make().then((f) => console.log(f.join('\n')));
module.exports = { make, OUT };
