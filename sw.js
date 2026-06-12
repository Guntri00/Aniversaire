// ══════════════════════════════════════════════════════════════════
// Anniversaire 2026 — Service Worker (PWA)
// ──────────────────────────────────────────────────────────────────
// VERSIONING : bumper SW_VERSION à chaque déploiement significatif.
// → purge automatique des anciens caches + update notif côté client.
// ══════════════════════════════════════════════════════════════════

const SW_VERSION   = '2026-05-13-b';                 // ← bump à chaque deploy
const CACHE_STATIC = `aniv01-static-${SW_VERSION}`;
const CACHE_PHOTOS = `aniv01-photos-${SW_VERSION}`;

// Seuls les assets same-origin sont mis en cache au install
const STATIC_ASSETS = [
  '/index.html',
  '/manifest.json'
];

// ── INSTALL ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// ── ACTIVATE : purge tout cache dont le nom ne matche pas la version courante ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(cacheNames
        .filter(name => name !== CACHE_STATIC && name !== CACHE_PHOTOS)
        .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// ── MESSAGE : permet au client de forcer l'activation ──
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ── FETCH ──
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Photos Supabase : network-first + cache fallback
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(networkFirstWithCache(request, CACHE_PHOTOS, 5000));
    return;
  }
  // API REST : pass-through
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/')) {
    return;
  }
  // Fonts : cache-first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirstWithNetwork(request, CACHE_STATIC));
    return;
  }
  // HTML : network-first (fix : l'ancien SW faisait cache-first → bug updates)
  const isHTML = url.hostname === self.location.hostname
              && (url.pathname === '/' || url.pathname.endsWith('.html') || request.mode === 'navigate');
  if (isHTML) {
    event.respondWith(networkFirstWithCache(request, CACHE_STATIC, 4000));
    return;
  }
  // Autres assets same-origin : stale-while-revalidate
  if (url.hostname === self.location.hostname) {
    event.respondWith(staleWhileRevalidate(request, CACHE_STATIC));
  }
});

async function networkFirstWithCache(request, cacheName, timeoutMs) {
  const cache = await caches.open(cacheName);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeout);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('', { status: 503 });
  }
}

async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 503 });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const netPromise = fetch(request).then((response) => {
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await netPromise) || new Response('', { status: 503 });
}

// ── Push Notifications (non utilisé pour l'instant) ──
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Anniversaire 2026', {
      body:    data.body || 'Nouvelle photo partagée !',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      vibrate: [100, 50, 100],
      data:    { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || '/'));
});
