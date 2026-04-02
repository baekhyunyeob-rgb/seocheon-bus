'use strict';

// sw.js — 서천버스 Service Worker
// 전략: 앱 셸(HTML/JS/CSS)은 캐시 우선, 데이터(JSON)는 네트워크 우선

const SW_VERSION  = 'v2025-04-02';
const CACHE_SHELL = `shell-${SW_VERSION}`;
const CACHE_DATA  = `data-${SW_VERSION}`;

// 앱 셸: 오프라인에서도 UI가 뜨도록 설치 시 미리 캐시
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/data.js',
  '/js/search.js',
  '/js/maps.js',
  '/js/ui.js',
  '/js/screens.js',
  '/js/routeCoords.js',
];

// ── install ──────────────────────────────────────────
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_SHELL).then(cache => cache.addAll(SHELL_ASSETS))
  );
});

// ── activate ─────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_SHELL && k !== CACHE_DATA)
          .map(k => {
            console.log('[SW] 구버전 캐시 삭제:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── fetch ─────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 카카오 외부 API → 항상 네트워크 (캐시 금지)
  if (url.hostname.includes('kakao') || url.hostname.includes('daumcdn')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // data/*.json → 네트워크 우선, 실패 시 캐시 fallback
  if (url.pathname.startsWith('/data/')) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_DATA).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 앱 셸 → 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
