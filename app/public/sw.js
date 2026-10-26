// Service worker: az alkalmazás internet nélkül is működjön.
//  - térképrészletek (OpenStreetMap csempék): először a tárolóból, különben letöltés és mentés
//  - az alkalmazás oldalai és fájljai, valamint az adatok (GET /api/…): először a hálózat,
//    ha nincs internet, a legutóbb mentett változat
// A jelöléseket (PUT) nem ez kezeli: azokat a kliens várólistája küldi el később (lib/outbox.ts).
const TILE_CACHE = "ujsagtura-tiles-v1";
const DATA_CACHE = "ujsagtura-data-v1";
const APP_CACHE = "ujsagtura-app-v1";
const KEEP = [TILE_CACHE, DATA_CACHE, APP_CACHE];

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Először a tárolóból (térképrészletek). */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request.url);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request.url, res.clone());
  return res;
}

/** Először a hálózat, hiba esetén a mentett változat. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(request)) ?? (request.mode === "navigate" ? await cache.match("/") : undefined);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "tile.openstreetmap.org") {
    event.respondWith(cacheFirst(request, TILE_CACHE));
    return;
  }
  if (url.origin !== self.location.origin) return; // egyéb külső szolgáltatás (útvonal, címkereső): nem tároljuk
  if (url.pathname.startsWith("/api/export") || url.pathname.startsWith("/api/import")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return; // fejlesztői mód élő frissítése

  event.respondWith(networkFirst(request, url.pathname.startsWith("/api/") ? DATA_CACHE : APP_CACHE));
});
