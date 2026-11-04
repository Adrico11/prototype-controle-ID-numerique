/* Mise en cache de l'application pour un usage sans réseau (après un premier chargement en ligne). */
const V = "fi-proto-v1";
const FILES = ["./", "index.html", "app.js", "assets/logo-rf.png", "assets/logo-fi.png",
  "js/jsQR.js", "js/cbor.min.js", "js/noble-curves.min.js", "js/openjpeg.js", "js/iaca-defaults.js", "js/iaca-management.js", "js/session-crypto.js",
  "js/ble-transport.js", "js/session-establishment.js", "js/verification.js", "js/device-engagement.js", "js/wallet-response.js", "js/request-builder.js"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(V).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
