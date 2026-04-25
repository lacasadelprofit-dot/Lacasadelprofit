/* Service Worker — La Casa del Profit */
const CACHE = 'lcp-v1';
const SHELL = ['/index.html', '/'];

/* ── Install: precache the app shell ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

/* ── Activate: clean old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch: Network-first for Supabase/CDN, Cache-first for app shell ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Let Supabase, CDN and external requests pass through unmodified
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('cdn.') ||
    !url.pathname.match(/\.(html|js|css|png|svg|ico|webmanifest|json)?$|^\/$/)
  ) return;

  e.respondWith(
    // Try network first so we always get the latest version
    fetch(e.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      })
      .catch(() =>
        // Offline fallback: serve from cache
        caches.match(e.request).then(cached =>
          cached || caches.match('/index.html')
        )
      )
  );
});
