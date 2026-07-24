/* ============================================================
   Service worker — snellere herhaalbezoeken + (deels) offline werken.

   Strategie: NETWORK-FIRST. Online zie je altijd de nieuwste versie; lukt het
   ophalen niet (offline/storing), dan valt de app terug op de cache. Zo kan een
   nieuwe versie nooit 'blijven plakken'. Alleen eigen bestanden worden gecachet;
   verzoeken naar Supabase of de GitHub-API laten we met rust (die moeten live).

   Nieuwe uitrol? Verhoog VERSION zodat oude caches worden opgeruimd.
   ============================================================ */
const VERSION = 'v1-2026-07-24';
const CACHE = 'lil-cache-' + VERSION;

// De 'app-shell' die we bij installatie alvast opslaan (offline startpunt).
const CORE = [
  './', './index.html', './lessons.js', './manifest.webmanifest',
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
