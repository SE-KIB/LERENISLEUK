/* ============================================================
   Service worker — snellere herhaalbezoeken + (deels) offline werken.

   Strategie: NETWORK-FIRST. Online zie je altijd de nieuwste versie; lukt het
   ophalen niet (offline/storing), dan valt de app terug op de cache. Zo kan een
   nieuwe versie nooit 'blijven plakken'. Alleen eigen bestanden worden gecachet;
   verzoeken naar Supabase of de GitHub-API laten we met rust (die moeten live).

   Nieuwe uitrol? Verhoog VERSION zodat oude caches worden opgeruimd.

   Deze service worker verzorgt óók de pushmeldingen: als de server (Supabase
   Edge Function) een bericht stuurt, vangt de 'push'-handler dat op en toont
   een melding — óók als de app dicht is. Bij een tik op de melding opent
   'notificationclick' de app op de juiste plek.
   ============================================================ */
const VERSION = 'v6-2026-07-28';
const CACHE = 'lil-cache-' + VERSION;

// De 'app-shell' die we bij installatie alvast opslaan (offline startpunt).
const CORE = [
  './', './index.html', './styles.css', './app.js', './lessons.js', './manifest.webmanifest',
  './icons/favicon-32.png', './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './icons/maskable-512.png',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('lil-cache-') && k !== CACHE)
          .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // alleen leesverzoeken
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;        // Supabase/GitHub: met rust laten

  e.respondWith((async () => {
    try {
      const fresh = await fetch(req);                     // altijd eerst live proberen
      if (fresh && fresh.ok) {
        const copy = fresh.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return fresh;
    } catch (err) {
      const cached = await caches.match(req);             // offline: uit de cache
      if (cached) return cached;
      if (req.mode === 'navigate') {                      // laatste redmiddel: de app-shell
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw err;
    }
  })());
});

/* ============================================================
   PUSHMELDINGEN
   De server stuurt een klein JSON-bericht ({ title, body, url, tag }).
   We tonen dat als systeemmelding. Zo krijg je op je telefoon een melding
   ook als de app niet openstaat.
   ============================================================ */
self.addEventListener('push', (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) {
    data = { body: (e.data && e.data.text()) || '' };
  }
  const title = data.title || 'Çalış Artık Da';
  const options = {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/favicon-32.png',
    lang: 'nl',
    tag: data.tag || 'lil-melding',            // gelijke tag = melding vervangt de vorige
    renotify: true,
    data: { url: data.url || './index.html' }, // waarheen bij een tik
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Tik op de melding: bestaande tab naar voren halen, anders de app openen.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if ('focus' in c) { try { await c.focus(); return; } catch (_) {} }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
