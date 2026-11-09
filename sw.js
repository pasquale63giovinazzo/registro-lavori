// Tiene l'app disponibile anche senza internet. I dati cifrati li salva app.js.
const CACHE = "registro-v1";
const GUSCIO = ["./", "index.html", "stile.css", "app.js", "manifest.webmanifest", "icona.svg", "icona-180.png", "icona-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(GUSCIO)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.endsWith("dati.bin")) return;
  // prima internet (così vedi sempre l'ultima versione), poi la copia salvata
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
