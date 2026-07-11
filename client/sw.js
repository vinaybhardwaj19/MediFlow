/**
 * sw.js — MediFlow Service Worker
 * Provides offline caching, background sync, and push notifications.
 */

const CACHE_NAME = 'mediflow-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/globals.css',
  '/css/2036-spatial.css',
  '/js/app.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/router.js',
  '/js/store.js',
  '/js/toast.js',
  '/js/particles.js',
  '/js/charts.js',
  '/js/medibot.js',
  '/js/triage.js',
  '/js/pharmacy.js',
  '/js/bodymap.js',
  '/js/qrcode.js',
  '/js/drone-tracker.js',
  '/js/ambient-monitor.js',
  '/js/consultation.js',
  '/js/real-sensors.js',
  '/js/health-ai.js',
  '/js/appointments.js',
  '/js/doctor-tools.js',
  '/manifest.json',
];

const API_CACHE = 'mediflow-api-v2';

// ── Install: pre-cache static assets ──────────────────────────────────────────
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' }))).catch(() => {
        // Partial failure OK — cache what we can
        return Promise.allSettled(STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => {})
        ));
      });
    })
  );
});

// ── Activate: clean old caches ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for static ───────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and chrome-extension
  if (request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // API: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(API_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() =>
        caches.match(request).then(r => r || new Response(
          JSON.stringify({ success: false, message: 'Offline — cached data unavailable', offline: true }),
          { headers: { 'Content-Type': 'application/json' } }
        ))
      )
    );
    return;
  }

  // Static assets: cache-first with network fallback
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch((err) => {
        if (request.mode === 'navigate') {
          return caches.match('/index.html'); // SPA fallback
        }
        throw err;
      });
    })
  );
});

// ── Push Notifications ─────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const { title = 'MediFlow', body = 'You have a new notification', icon = '🏥' } = data;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='52' font-size='52'>${icon}</text></svg>`,
      badge: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><text y='52' font-size='52'>🏥</text></svg>`,
      tag: data.tag || 'mediflow-notification',
      requireInteraction: data.urgent || false,
      data: data.url || '/',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || '/')
  );
});

// ── Background Sync (Medicine reminders) ──────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'medicine-reminder') {
    event.waitUntil(
      self.registration.showNotification('💊 Medicine Reminder', {
        body: 'Time to take your medication as prescribed.',
        requireInteraction: true,
      })
    );
  }
});
