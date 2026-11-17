// Polish: theme, tour and "what's new", the beta banner (copy of the data), gestures, app badge, chat access.
import { H, applyTheme, themePref } from './ui.js';
const { $, $$, esc, ic, ls, api, toast, S, dmy } = H;

const TOUR_V = 1;
const SLIDES = [
  ['sparkles', 'Tanya DPR', 'Tanya dalam ayat biasa: “bila bahan terakhir tiba?”, “apa yang belum siap?”. Jawapan datang bersama rekod sumbernya.'],
  ['chart', 'Papan', 'Kemajuan setiap sistem, aktiviti setiap hari, dan apa yang perlu perhatian, dalam satu skrin.'],
  ['search', 'Cari rekod lama', 'Tekan ikon carian di atas. Taip BM atau English; tapis ikut unit, status dan tempoh.'],
  ['repeat', 'Tambah lebih cepat', 'Sambung kerja semalam dengan satu tekan, rakam nota suara, atau biar AI cadang sistem dari gambar.'],
  ['moon', 'Mod gelap & kalendar', 'Pilih paparan cerah atau gelap dalam Saya. Tekan tarikh untuk kalendar yang menunjukkan hari ada rekod.']
];

function tour() {
  let i = 0;
  const L = H.openLayer('<div id="trb"></div>', { title: 'Apa yang baru', foot: '<div class="btn-row"><button class="btn ghost" data-skip>Langkau</button><button class="btn primary" data-next>Seterusnya</button></div>', onClose: () => ls.set('tour', TOUR_V) });
  const draw = () => {
    const s = SLIDES[i];
    $('#trb', L.el).innerHTML = '<div class="tour rise"><div class="pic">' + ic(s[0]) + '</div><h3>' + esc(s[1]) + '</h3><p>' + esc(s[2]) + '</p><div class="tour-dots">' + SLIDES.map((x, k) => '<i class="' + (k === i ? 'on' : '') + '"></i>').join('') + '</div></div>';
    $('[data-next]', L.el).textContent = i === SLIDES.length - 1 ? 'Mula guna' : 'Seterusnya';
  };
  $('[data-next]', L.el).onclick = () => { if (i === SLIDES.length - 1) return H.closeLayer(); i++; H.buzz(); draw(); };
  $('[data-skip]', L.el).onclick = () => H.closeLayer();
  draw();
}

// ---------- beta banner ----------
function ribbon() {
  const env = S.meta && S.meta.env;
  if (!H.beta || !S.meta) return '';
  if (!env || !env.sandbox) return '<div class="banner rose" style="margin-top:12px">' + ic('warn') + '<div class="grow"><b>Awas: beta ini bersambung ke data SEBENAR</b>Backend ini bukan salinan. Apa yang disimpan di sini masuk laporan sebenar.</div></div>';
  if (ls.get('ribbonHide', '') === H.today()) return '';
  return '<div class="ribbon" style="margin-top:12px">' + ic('info', 's') + '<span class="grow"><b>Versi ujian · data salinan</b>Disalin ' + esc(dmy(String(env.at).slice(0, 10)) + ' ' + H.hhmm(env.at)) + '. Laporan sebenar tidak berubah.</span><button data-ribx>OK</button></div>';
}

async function refreshCopy(btn) {
  if (!(await H.confirmBox('Salin semula data sebenar?', 'Salinan beta diganti dengan data terkini dari Sheet sebenar. Apa yang ditambah dalam beta tidak dibawa (salinan lama disimpan sebagai “(lama)”). Mengambil masa kira-kira 1 minit.', 'Salin semula'))) return;
  H.busy(btn, true, 'Menyalin…');
  try {
    const r = await api('betaRefresh', {}, { timeout: 300000 });
    Object.keys(S.days).forEach((k) => delete S.days[k]);
    ls.get('dayKeys', []).forEach((k) => ls.del('day.' + k)); ls.del('dayKeys');
    [7, 14, 30].forEach((n) => ls.del('ins.' + n));
    if (H.HOOK.boardRefresh) H.HOOK.boardRefresh();
    await H.loadMeta(); await H.loadDay(S.date, true);
    toast('Data disalin semula (' + dmy(String(r.at).slice(0, 10)) + ' ' + H.hhmm(r.at) + ').', 'ok');
  } catch (e) { toast(e.message, 'bad'); }
  H.render();
}

// ---------- Saya ----------
function me() {
  const p = themePref();
  const env = S.meta && S.meta.env;
  let h = '<div class="section-t"><h2>Paparan</h2></div><div class="card"><div class="theme-seg">' +
    [['auto', 'phone', 'Ikut telefon'], ['light', 'sun', 'Cerah'], ['dark', 'moon', 'Gelap']].map((t) => '<button class="opt-card" data-themeset="' + t[0] + '" aria-pressed="' + (p === t[0]) + '"><span class="ic">' + ic(t[1], 's') + '</span>' + t[2] + '</button>').join('') + '</div></div>';
  // the chat-access setting exists from backend w2.0 on ("chat" in meta)
  if (H.isEng() && S.meta && S.meta.chat) h += '<div class="section-t"><h2>Tanya DPR</h2><span>siapa boleh guna</span></div><div class="card" id="prefl"><button class="btn soft block" data-prefl>' + ic('sparkles', 's') + ' Buka tetapan</button></div>';
  if (H.beta) {
    h += '<div class="section-t"><h2>Versi ujian (beta)</h2></div><div class="card">' +
      (env && env.sandbox ? '<div class="list-row"><span class="ic" style="background:var(--butter-50);color:var(--butter)">' + ic('copy', 's') + '</span><div class="grow"><div class="t">Data salinan</div><div class="s">Disalin ' + esc(dmy(String(env.at).slice(0, 10)) + ' ' + H.hhmm(env.at)) + ' · Sheet sebenar tidak disentuh</div></div></div>' +
        (H.isEng() ? '<button class="btn soft block" style="margin-top:12px" data-recopy>' + ic('sync', 's') + ' Salin semula data sebenar</button>' : '')
        : '<div class="banner rose">' + ic('warn') + '<div class="grow">Backend ini bukan salinan (sandbox).</div></div>') + '</div>';
  }
  h += '<div class="section-t"><h2>Bantuan</h2></div><div class="card"><button class="list-row" style="width:100%;text-align:left" data-tour><span class="ic">' + ic('gift', 's') + '</span><span class="grow"><span class="t">Apa yang baru</span><br><span class="s">Lawatan ringkas ciri 2.0</span></span>' + ic('right', 's') + '</button></div>';
  return h;
}

async function prefs() {
  const box = $('#prefl');
  box.innerHTML = '<div class="skel" style="height:54px"></div>';
  try {
    const r = await api('prefs');
    box.innerHTML = r.list.map((p) => '<div class="field" style="margin-top:4px"><div class="lbl">' + esc(p.label) + '</div><div class="chips">' + p.options.map((o) => '<button class="chip" data-pk="' + esc(p.key) + '" data-pv="' + esc(o[0]) + '" aria-pressed="' + (p.value === o[0]) + '">' + esc(o[1]) + '</button>').join('') + '</div></div>').join('') +
      '<p class="hint">Tanya DPR hanya membaca rekod; ia tidak boleh mengubah apa-apa.</p>';
    $$('[data-pk]', box).forEach((b) => {
      b.onclick = async () => {
        try { await api('prefSet', { key: b.dataset.pk, value: b.dataset.pv }); toast('Dikemas kini ✓', 'ok'); await H.loadMeta(); prefs(); }
        catch (e) { toast(e.message, 'bad'); }
      };
    });
  } catch (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
}

function meBind() {
  $$('.opt-card[data-themeset]').forEach((b) => { b.onclick = () => { H.buzz(); applyTheme(b.dataset.themeset); H.render(); }; });
  const pl = $('[data-prefl]'); if (pl) pl.onclick = () => prefs();
  const rc = $('[data-recopy]'); if (rc) rc.onclick = (e) => refreshCopy(e.currentTarget);
  const t = $('[data-tour]'); if (t) t.onclick = () => tour();
}

// ---------- gestures: swipe between days, pull to refresh ----------
function gestures() {
  let x0 = 0, y0 = 0, on = false, pull = false, ptr = null;
  const skip = (t) => !!(t.closest && t.closest('.carry, .refs, .fchips, .gal, svg.chart, input, textarea, [contenteditable], .composer'));
  document.addEventListener('touchstart', (e) => {
    on = false; pull = false;
    if (!S.session || H.layers.length || e.touches.length !== 1 || !$('#shell') || skip(e.target)) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; on = true;
    pull = window.scrollY <= 0 && S.tab !== 'chat';
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!on || !pull) return;
    const dy = e.touches[0].clientY - y0, dx = Math.abs(e.touches[0].clientX - x0);
    if (dy < 12 || dx > dy) { if (ptr) ptr.style.opacity = 0; return; }
    if (!ptr) { ptr = document.createElement('div'); ptr.className = 'ptr'; ptr.innerHTML = ic('sync', 's'); document.body.appendChild(ptr); }
    const k = Math.min(1, dy / 110);
    ptr.style.opacity = k; ptr.style.transform = 'translateY(' + (-70 + 90 * k) + 'px) rotate(' + Math.round(k * 270) + 'deg)';
    ptr.dataset.ready = k >= 1 ? '1' : '';
  }, { passive: true });
  document.addEventListener('touchend', async (e) => {
    if (!on) return;
    on = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    if (ptr) {
      const p = ptr; ptr = null;
      if (p.dataset.ready) {
        p.classList.add('go'); p.style.transform = 'translateY(20px)'; H.buzz(12);
        try {
          if (S.tab === 'board') { if (H.HOOK.boardRefresh) H.HOOK.boardRefresh(); H.render(); await H.sleep(900); }
          else { await Promise.all([H.loadDay(S.date, true), H.loadMeta().catch(() => {})]); H.syncOutbox(); H.render(); }
        } catch (err) { /* shown elsewhere */ }
      }
      p.style.transition = 'opacity .2s, transform .2s'; p.style.opacity = 0; setTimeout(() => p.remove(), 220);
      return;
    }
    if (S.tab === 'home' && Math.abs(dx) > 80 && Math.abs(dy) < 50 && Math.abs(dx) > Math.abs(dy) * 2.2) {
      const d = H.addDays(S.date, dx > 0 ? -1 : 1);
      if (d <= H.today()) { H.buzz(); H.setDate(d); }
    }
  }, { passive: true });
}

// number of activities still waiting on the app icon
function badge() {
  if (!navigator.setAppBadge) return;
  let last = -1;
  setInterval(() => {
    const n = S.outbox.length;
    if (n === last) return;
    last = n;
    (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }, 4000);
}

// the tour shows once per phone, the first time the app is open and signed in (also right after a first login)
export function afterStart() {
  if (ls.get('tour', 0) >= TOUR_V) return;
  const t = setInterval(() => {
    if (ls.get('tour', 0) >= TOUR_V) return clearInterval(t);
    // after the backend is on w2.0 (the tour shows its new screens)
    if (S.session && S.meta && S.meta.feat && $('#shell') && !H.layers.length) { clearInterval(t); tour(); }
  }, 900);
}

export function init() {
  const top = H.HOOK.homeTop, bindTop = H.HOOK.homeBind;
  H.HOOK.homeTop = (d) => ribbon() + (top ? top(d) : '');
  H.HOOK.homeBind = (d) => { if (bindTop) bindTop(d); const x = $('[data-ribx]'); if (x) x.onclick = () => { ls.set('ribbonHide', H.today()); H.render(); }; };
  H.HOOK.me = me;
  H.HOOK.meBind = meBind;
  H.HOOK.tour = tour;
  gestures();
  badge();
}
