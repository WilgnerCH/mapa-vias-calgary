/* Offline copy for the track map. Holds only what the site already serves (the encrypted page and images) plus map tiles already seen. */
const V = 'tm-shell-v1', TILES = 'tm-tiles-v1', TILE_MAX = 3000;
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== V && k !== TILES) await caches.delete(k); await self.clients.claim(); })()));
const PAGE = new URL('index.html', self.registration.scope).href;
async function page(req) { // always the newest page when there is a connection; the saved copy when there is none
  const c = await caches.open(V);
  try {
    const r = await Promise.race([fetch(PAGE, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 8000))]);
    if (r && r.ok) { await c.put(PAGE, r.clone()); return r; }
    throw new Error('bad');
  } catch (e) { const m = await c.match(PAGE); if (m) return m; return fetch(req); }
}
async function keep(req) { // images: saved copy first, refreshed in the background
  const c = await caches.open(V), m = await c.match(req.url);
  const f = fetch(req).then(r => { if (r.ok) c.put(req.url, r.clone()); return r; }).catch(() => null);
  return m || (await f) || Response.error();
}
let puts = 0;
async function tile(req) {
  const c = await caches.open(TILES), m = await c.match(req.url); if (m) return m;
  try {
    const r = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (r.ok) { c.put(req.url, r.clone()); if (++puts % 60 === 0) c.keys().then(ks => { if (ks.length > TILE_MAX) ks.slice(0, ks.length - TILE_MAX + 200).forEach(k => c.delete(k)); }); }
    return r;
  } catch (e) { return fetch(req); }
}
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET') return; const u = new URL(r.url);
  if (u.hostname === 'server.arcgisonline.com') return e.respondWith(tile(r));
  if (u.origin !== location.origin || !u.href.startsWith(self.registration.scope)) return;
  if (r.mode === 'navigate' || u.href === PAGE || u.href === self.registration.scope) return e.respondWith(page(r));
  if (u.pathname.includes('/data/img/')) return e.respondWith(keep(r));
});
