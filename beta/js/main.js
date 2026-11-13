// HLEP DPR 2.0 (beta): loads the feature modules onto the core app, then starts it.
import { H, applyTheme } from './ui.js';
import * as chat from './chat.js';
import * as board from './board.js';
import * as search from './search.js';
import * as detail from './detail.js';
import * as calendar from './calendar.js';
import * as quick from './quick.js';
import * as extras from './extras.js';

applyTheme();
[chat, board, search, detail, calendar, quick, extras].forEach((m) => { try { m.init(); } catch (e) { console.error('module', e); } });

// Home-screen shortcuts and the share sheet open the app with ?do=…
const params = new URLSearchParams(location.search);
const todo = params.get('do');
if (todo) history.replaceState(null, '', location.pathname + location.hash);

async function act() {
  if (!todo || !H.S.session) return;
  if (todo === 'chat') return H.go('chat');
  if (todo === 'search') return H.HOOK.search && H.HOOK.search();
  // "add" and "share" need the systems list
  for (let i = 0; i < 40 && !H.S.meta; i++) await H.sleep(150);
  if (todo === 'add') return H.addSheet();
  if (todo === 'share') {
    const inbox = await H.idb.get('inbox', 'share').catch(() => null);
    await H.idb.del('inbox', 'share').catch(() => {});
    if (!inbox || !inbox.files || !inbox.files.length) return H.addSheet(inbox && inbox.text ? { raw: inbox.text } : undefined);
    H.addSheet({ files: inbox.files, raw: inbox.text || '' });
  }
}

H.start().then(act).then(() => extras.afterStart()).catch((e) => console.error(e));

// A new version waits until the person agrees (never in the middle of typing an activity).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    const offer = (w) => {
      if (!w || !navigator.serviceWorker.controller) return;
      const ask = () => {
        if (H.layers.length) return setTimeout(ask, 20000);
        H.confirmBox('Versi baru tersedia', 'Muat semula untuk guna versi terkini HLEP DPR?', 'Muat semula').then((yes) => { if (yes) w.postMessage('skipWaiting'); });
      };
      ask();
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (w) w.addEventListener('statechange', () => { if (w.state === 'installed') offer(w); });
    });
    let reloaded = !navigator.serviceWorker.controller;      // first install: nothing to reload
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && H.started && document.getElementById('shell')) { reloaded = true; location.reload(); } });
  }).catch(() => {});
}
