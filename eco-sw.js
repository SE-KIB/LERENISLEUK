/* ECO-meldingen: alleen pushmeldingen (ochtendbriefing), geen offline-cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "ECO", {
    body: d.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.url && d.url.includes("#briefing") ? "eco-briefing" : "eco",
    data: { url: d.url || "/" },
  }));
});

// Tik op de melding: ECO openen (of naar voren halen) en bij de briefing meteen klaarzetten.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const c = all.find((x) => new URL(x.url).origin === self.location.origin);
    if (c) {
      await c.focus();
      if (url.includes("#briefing")) c.postMessage({ type: "briefing" });
      return;
    }
    await self.clients.openWindow(url);
  })());
});
