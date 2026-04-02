'use strict';

// sw.js — 서천버스 Service Worker
// 캐시 초기화 전용: 모든 캐시 삭제 후 네트워크 직통
// (이전 버전 캐시 문제 방지)

const SW_VERSION = 'v2025-04-02b';

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        console.log('[SW] 캐시 삭제:', key);
        return caches.delete(key);
      }))
    ).then(() => {
      console.log('[SW] 모든 캐시 삭제 완료. 버전:', SW_VERSION);
      return self.clients.claim();
    })
  );
});

// 항상 네트워크에서 직접 가져옴 (캐시 사용 안 함)
self.addEventListener('fetch', event => {
  event.respondWith(fetch(event.request));
});
