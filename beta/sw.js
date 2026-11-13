// Offline shell for the HLEP DPR beta. API calls (to script.google.com) are never cached.
// Its cache name differs from the live app's, and it only ever deletes its own old caches.
const PREFIX = 'hlep-dpr-beta-';
const CACHE = PREFIX + '2.0.0-b1';
const SHELL = ['./', 'index.html', 'styles.css', 'v2.css', 'app.js', 'config.js', 'manifest.webmanifest',
  'js/main.js', 'js/ui.js', 'js/chat.js', 'js/board.js', 'js/charts.js', 'js/search.js', 'js/detail.js', 'js/calendar.js', 'js/quick.js', 'js/extras.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  // one missing file must not stop the rest from being saved
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.indexOf(PREFIX) === 0 && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// the page asks for this once the person agrees to update
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// photos shared into the app (Android share sheet) wait in IndexedDB for the add-activity sheet
function inboxPut(files, text) {
  return new Promise((res, rej) => {
    const r = indexedDB.open('hlep-dpr-beta', 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      [['outbox', { keyPath: 'cid' }], ['thumbs'], ['inbox']].forEach((x) => { if (!db.objectStoreNames.contains(x[0])) db.createObjectStore(x[0], x[1]); });
    };
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const t = r.result.transaction('inbox', 'readwrite');
      t.objectStore('inbox').put({ files, text, at: Date.now() }, 'share');
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
    };
  });
}

function timed(req, ms) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('slow')), ms);
    fetch(req).then((r) => { clearTimeout(t); res(r); }, (err) => { clearTimeout(t); rej(err); });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === self.location.origin && /\/share$/.test(url.pathname)) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const files = fd.getAll('photos').filter((f) => f && f.size);
        await inboxPut(files, [fd.get('title'), fd.get('text')].filter(Boolean).join(' ').slice(0, 1500));
      } catch (err) { /* open the app anyway */ }
      return Response.redirect('./?do=share', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;
  if (/\.mp4$/.test(url.pathname)) return;      // video: let the browser stream it (range requests)
  if (url.origin === self.location.origin) {
    // network first (so updates arrive); on a weak signal the saved copy answers after 2.5 s
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      try {
        const res = await (hit ? timed(req, 2500) : fetch(req));
        if (res.status === 200) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      } catch (err) {
        return hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
      }
    })());
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
  }
});
