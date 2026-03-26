'use strict';

// ==================== 서천버스 Service Worker ====================
// 캐시 전략:
//   앱 셸 + 정적 데이터  → Cache First  (오프라인 완전 동작)
//   카카오 외부 리소스   → Network First (오프라인 시 캐시 폴백)
//   카카오 Directions    → Network Only  (오프라인 시 앵커 직선 폴백, routeCoords.js에서 처리)

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `sc-shell-${CACHE_VERSION}`;
const DATA_CACHE    = `sc-data-${CACHE_VERSION}`;
const KAKAO_CACHE   = `sc-kakao-${CACHE_VERSION}`;

// 앱 셸: 설치 시 반드시 캐싱
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/style.css',
  '/js/data.js',
  '/js/routeCoords.js',
  '/js/search.js',
  '/js/maps.js',
  '/js/ui.js',
  '/js/screens.js',
];

// 정적 데이터: 설치 시 캐싱 (용량 약 221KB, 오프라인 경로 검색의 핵심)
const DATA_URLS = [
  '/data/routes.json',
  '/data/stops.json',
  '/data/route_anchors.json',
];

// ==================== 설치 ====================
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      // 앱 셸 캐싱
      caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_URLS)),
      // 정적 데이터 캐싱
      caches.open(DATA_CACHE).then(cache => cache.addAll(DATA_URLS)),
    ]).then(() => {
      // route_coords.json은 선택적 파일 — 있을 때만 캐싱
      return caches.open(DATA_CACHE).then(async cache => {
        try {
          const res = await fetch('/data/route_coords.json');
          if (res.ok) await cache.put('/data/route_coords.json', res);
        } catch {
          // 없으면 무시
        }
      });
    }).then(() => self.skipWaiting())
  );
});

// ==================== 활성화 ====================
// 이전 버전 캐시 삭제
self.addEventListener('activate', event => {
  const CURRENT_CACHES = [SHELL_CACHE, DATA_CACHE, KAKAO_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => !CURRENT_CACHES.includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ==================== 요청 처리 ====================
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // GET 요청만 캐시 처리
  if (request.method !== 'GET') return;

  // ── 카카오 Directions API ──────────────────────────────────────
  // 오프라인 시 routeCoords.js의 catch 블록이 앵커 직선으로 폴백하므로
  // 여기서는 네트워크 실패를 그대로 전달 (캐싱 안 함)
  if (url.hostname === 'apis-navi.kakaomobility.com') {
    return; // service worker 개입 없이 네트워크 그대로
  }

  // ── 카카오 지도 SDK / 폰트 등 외부 리소스 ────────────────────
  // Network First → 실패 시 캐시 폴백
  if (
    url.hostname === 'dapi.kakao.com' ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname.endsWith('.kakaocdn.net')
  ) {
    event.respondWith(networkFirstWithCache(request, KAKAO_CACHE));
    return;
  }

  // ── 앱 내부 리소스 ────────────────────────────────────────────
  if (url.origin === self.location.origin) {
    // 정적 데이터 파일: Cache First (변경이 거의 없음)
    if (url.pathname.startsWith('/data/')) {
      event.respondWith(cacheFirstWithNetwork(request, DATA_CACHE));
      return;
    }
    // 앱 셸: Cache First
    event.respondWith(cacheFirstWithNetwork(request, SHELL_CACHE));
    return;
  }
});

// ==================== 캐시 전략 함수 ====================

// Cache First: 캐시에 있으면 캐시 반환, 없으면 네트워크 요청 후 캐싱
async function cacheFirstWithNetwork(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // 오프라인 + 캐시 없음: 빈 응답
    return new Response('', {
      status: 503,
      statusText: 'Service Unavailable (offline)',
    });
  }
}

// Network First: 네트워크 우선, 실패 시 캐시 폴백
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('', {
      status: 503,
      statusText: 'Service Unavailable (offline)',
    });
  }
}
