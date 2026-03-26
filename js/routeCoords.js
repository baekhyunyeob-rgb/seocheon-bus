'use strict';

// ==================== 노선 좌표 로드 ====================
// 충남BIS 공식 데이터 기반의 route_coords.json을 로드합니다.
// 카카오 Directions API 예측 로직은 사용하지 않습니다.
//
// route_coords.json 구조:
//   { "번호_기점": [ {name, lat, lng, source:'bis', stopId}, ... ], ... }
//
// 동일 정류장명이 2개 이상인 경우(반대방향 등):
//   → stopId가 다르므로 노선별로 정확하게 특정됩니다.
//   → 검색은 정류장명 기준으로, 해당 노선에 포함된 정류장이면 매칭합니다.

// ---- 진행상태 오버레이 ----
function _showBuildProgress(msg) {
  let el = document.getElementById('build-progress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'build-progress';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);'
      + 'background:rgba(0,0,0,.75);color:#fff;border-radius:20px;padding:8px 18px;'
      + 'font-size:12px;z-index:999;white-space:nowrap;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}
function _hideBuildProgress() {
  const el = document.getElementById('build-progress');
  if (el) el.remove();
}

// ---- 메인 진입점 ----
async function buildRouteCoords() {
  _showBuildProgress('노선 데이터 로드 중...');
  try {
    const res = await fetch('data/route_coords.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    for (const [key, val] of Object.entries(data)) {
      STATE.routeCoords.set(key, val);
    }
    console.log('노선 좌표 로드 완료: ' + STATE.routeCoords.size + '개');
    _showBuildProgress('✅ 노선 데이터 로드 완료 (' + STATE.routeCoords.size + '개)');
    setTimeout(_hideBuildProgress, 2000);
  } catch (e) {
    console.error('route_coords.json 로드 실패:', e);
    _showBuildProgress('⚠️ 노선 데이터 로드 실패');
    setTimeout(_hideBuildProgress, 3000);
  }
}

// 노선 좌표 가져오기
function getRouteCoords(route) {
  return STATE.routeCoords.get(route['번호'] + '_' + route['기점']) || [];
}

// GPS 좌표 → 가장 가까운 coords 인덱스 (maps.js용)
function findNearestIdx(coords, lat, lng) {
  let best = -1, bestD = Infinity;
  coords.forEach((c, i) => {
    if (!c.lat) return;
    const d = distM(c.lat, c.lng, lat, lng);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
