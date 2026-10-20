// Carnet Boutique : permet d'ouvrir l'app même sans internet.
// Pour forcer une mise à jour du cache, changer le numéro de VERSION.
const VERSION = 'cb-v18';
const APP = ['./', './index.html', './apple-touch-icon.png'];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js'
];
const CDN = /^https:\/\/(cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await c.addAll(APP).catch(() => {});
    await Promise.all(LIBS.map(u =>
      fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})
    ));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cb-') && k !== VERSION) await caches.delete(k); // solo le copie del Carnet: le altre app sullo stesso sito restano
    await self.clients.claim();
  })());
});

// Page de l'app : internet d'abord (pour avoir toujours la dernière version),
// mais si internet est absent ou trop lent, on ouvre la copie gardée.
async function page(req) {
  const c = await caches.open(VERSION);
  const net = fetch(req).then(r => {
    if (r && r.ok) c.put('./index.html', r.clone());
    return r;
  });
  const timeout = new Promise(res => setTimeout(res, 4000));
  try {
    const r = await Promise.race([net, timeout]);
    if (r) return r;
  } catch (e) {}
  const cached = await c.match('./index.html');
  if (cached) return cached;
  return net;
}

// Bibliothèques et images : copie gardée d'abord, mise à jour en arrière-plan.
async function asset(req) {
  const c = await caches.open(VERSION);
  const cached = await c.match(req, { ignoreSearch: false });
  const net = fetch(req).then(r => {
    if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone());
    return r;
  }).catch(() => null);
  return cached || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin && /shop\.html$/.test(url.pathname)) return; // page des clients (boutique en ligne) : toujours en ligne, jamais mélangée avec l'app
  if (req.mode === 'navigate' && url.origin === location.origin) return e.respondWith(page(req));
  if (url.origin === location.origin) {
    if (/config\.json$/.test(url.pathname)) return; // toujours en ligne (l'app garde déjà une copie)
    return e.respondWith(asset(req));
  }
  if (CDN.test(req.url)) return e.respondWith(asset(req));
  // Supabase, WhatsApp, etc. : on ne touche pas.
});

// Notifications : une nouvelle commande arrive même si l'app est fermée.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Carnet Boutique', {
    body: d.body || '', tag: d.tag || 'commande', renotify: true,
    icon: './apple-touch-icon.png', badge: './apple-touch-icon.png', data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const scope = self.registration.scope;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) if (w.url.startsWith(scope) && !/(menu|shop|reserver)\.html/.test(w.url)) { await w.focus(); return; }
    await self.clients.openWindow(scope);
  })());
});
