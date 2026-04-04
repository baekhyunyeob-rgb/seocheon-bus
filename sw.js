// sw.js — 캐시 초기화 전용
// 기존 Service Worker가 85개짜리 route_coords.json을 캐시하고 있던 문제를 해결.
// 이 SW는 모든 캐시를 삭제하고 네트워크를 직접 통과시킨다.

const SW_VERSION = 'v2025-03-27';

self.addEventListener('install', event => {
  // 즉시 활성화 (waiting 단계 스킵)
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    // 모든 기존 캐시 삭제
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        console.log('[SW] 캐시 삭제:', key);
        return caches.delete(key);
      }));
    }).then(() => {
      console.log('[SW] 모든 캐시 삭제 완료. 버전:', SW_VERSION);
      // 열려있는 모든 탭을 즉시 이 SW로 전환
      return self.clients.claim();
    })
  );
});

// fetch는 캐시 없이 항상 네트워크로 직접 통과
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
