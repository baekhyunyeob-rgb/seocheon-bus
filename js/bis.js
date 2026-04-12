'use strict';

// =====================================================
// bis.js — TAGO 실시간 버스위치 API 연동
//
// 국토교통부 TAGO API
// Endpoint: https://apis.data.go.kr/1613000/BusLcInfoInqireService
//
// 사용 순서:
//   1. initBIS()         → 서천 도시코드 확인 + 노선ID 캐시
//   2. startBISTracking()→ 30초마다 전체 노선 버스위치 갱신
//   3. stopBISTracking() → 추적 중지
// =====================================================

const TAGO_KEY  = '58b48b0d19a525cf18e98d85a1b68cc560700393a7ed41f7538cc0758386b039';
const TAGO_BASE = 'https://apis.data.go.kr/1613000/BusLcInfoInqireService';

// 서천군 도시코드 — 초기화 시 API로 확인 후 저장
let BIS_CITY_CODE  = null;

// 노선번호 → TAGO routeId 매핑 캐시
// { '30_서천터미널': 'TAGOrouteId...' }
const BIS_ROUTE_CACHE = new Map();

// 실시간 버스 위치 마커 { routeKey: [kakao.maps.CustomOverlay, ...] }
const BIS_MARKERS = new Map();

// 추적 타이머
let BIS_TIMER = null;

// ── 1단계: 도시코드 조회 ──────────────────────────────────────────
async function _fetchCityCode() {
  const url = `${TAGO_BASE}/getCtyCodeList?serviceKey=${TAGO_KEY}&_type=json`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    const items = data?.response?.body?.items?.item || [];
    const arr   = Array.isArray(items) ? items : [items];

    // '서천' 포함 도시 찾기
    const seocheon = arr.find(it =>
      it.cityname && (it.cityname.includes('서천') || it.cityname.includes('충남서천'))
    );
    if (seocheon) {
      BIS_CITY_CODE = seocheon.citycode;
      console.log('[BIS] 서천 도시코드:', BIS_CITY_CODE, seocheon.cityname);
      return BIS_CITY_CODE;
    }

    // 서천이 없으면 충남 전체 출력해서 확인
    const chungnam = arr.filter(it => it.cityname && it.cityname.includes('충'));
    console.warn('[BIS] 서천 도시코드 없음. 충남 관련:', chungnam.map(i=>`${i.cityname}(${i.citycode})`));
    return null;
  } catch(e) {
    console.error('[BIS] 도시코드 조회 실패:', e);
    return null;
  }
}

// ── 2단계: 노선ID 조회 ───────────────────────────────────────────
// TAGO 노선번호로 routeId 획득
async function _fetchRouteId(routeNo) {
  if (!BIS_CITY_CODE) return null;
  const url = `${TAGO_BASE}/getRouteNoList?serviceKey=${TAGO_KEY}&cityCode=${BIS_CITY_CODE}&routeNo=${encodeURIComponent(routeNo)}&_type=json`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    const items = data?.response?.body?.items?.item || [];
    const arr   = Array.isArray(items) ? items : [items];
    if (arr.length && arr[0].routeid) return arr[0].routeid;
    return null;
  } catch(e) {
    console.warn('[BIS] 노선ID 조회 실패:', routeNo, e);
    return null;
  }
}

// ── 3단계: 실시간 버스위치 조회 ───────────────────────────────────
// routeId → [{ gpsLati, gpsLong, vehicleNo, sttnOrd, lastSttnId }, ...]
async function _fetchBusLocations(routeId) {
  if (!BIS_CITY_CODE || !routeId) return [];
  const url = `${TAGO_BASE}/getRouteAcctoBusLcList?serviceKey=${TAGO_KEY}&cityCode=${BIS_CITY_CODE}&routeId=${routeId}&_type=json`;
  try {
    const res  = await fetch(url);
    const data = await res.json();
    const items = data?.response?.body?.items?.item || [];
    return Array.isArray(items) ? items : (items ? [items] : []);
  } catch(e) {
    console.warn('[BIS] 버스위치 조회 실패:', routeId, e);
    return [];
  }
}

// ── 초기화 ────────────────────────────────────────────────────────
async function initBIS() {
  console.log('[BIS] 초기화 시작...');
  await _fetchCityCode();
  if (!BIS_CITY_CODE) {
    console.warn('[BIS] 서천 도시코드를 찾지 못했습니다. API 연계 미지원 가능성 있음.');
    return false;
  }
  console.log('[BIS] 초기화 완료. 도시코드:', BIS_CITY_CODE);
  return true;
}

// ── 특정 노선 버스위치 갱신 ──────────────────────────────────────
// route: ROUTES 배열의 노선 객체
// mapObj: kakao.maps.Map 인스턴스
async function updateBusLocations(route, mapObj) {
  if (!BIS_CITY_CODE || !mapObj) return;

  const routeKey = route['번호'] + '_' + route['기점'];
  const routeNo  = String(route['번호']);

  // routeId 캐시 확인
  let routeId = BIS_ROUTE_CACHE.get(routeKey);
  if (!routeId) {
    routeId = await _fetchRouteId(routeNo);
    if (!routeId) return;
    BIS_ROUTE_CACHE.set(routeKey, routeId);
  }

  // 버스위치 조회
  const buses = await _fetchBusLocations(routeId);
  if (!buses.length) {
    _clearBusMarkers(routeKey);
    return;
  }

  // 기존 마커 제거
  _clearBusMarkers(routeKey);

  // 새 마커 생성
  const color   = getZoneColor(route);
  const busNum  = getBusNum(route);
  const markers = [];

  buses.forEach(bus => {
    const lat = parseFloat(bus.gpsLati);
    const lng = parseFloat(bus.gpsLong);
    if (!lat || !lng || lat < 30 || lat > 40) return; // 유효범위 체크

    const marker = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content: `<div style="
        display:flex;flex-direction:column;align-items:center;
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.35));
        pointer-events:none;
      ">
        <div style="
          background:${color};color:#fff;
          border-radius:12px;padding:3px 8px;
          font-size:11px;font-weight:700;
          white-space:nowrap;
          border:2px solid #fff;
          position:relative;
        ">
          🚌 ${busNum}
          <span style="font-size:9px;opacity:.85;margin-left:3px">${bus.vehicleNo || ''}</span>
        </div>
        <div style="
          width:0;height:0;
          border-left:5px solid transparent;
          border-right:5px solid transparent;
          border-top:6px solid ${color};
        "></div>
      </div>`,
      yAnchor: 1.1,
      zIndex: 20,
    });

    marker.setMap(mapObj);
    markers.push(marker);
  });

  if (markers.length) BIS_MARKERS.set(routeKey, markers);
}

// ── 특정 노선 마커 제거 ──────────────────────────────────────────
function _clearBusMarkers(routeKey) {
  const markers = BIS_MARKERS.get(routeKey) || [];
  markers.forEach(m => m.setMap(null));
  BIS_MARKERS.delete(routeKey);
}

// ── 전체 마커 제거 ────────────────────────────────────────────────
function clearAllBusMarkers() {
  BIS_MARKERS.forEach((markers, key) => {
    markers.forEach(m => m.setMap(null));
  });
  BIS_MARKERS.clear();
}

// ── 현재 화면에 보이는 노선 버스위치 자동 갱신 ───────────────────
// mapObj: 지도 인스턴스
// targetRoutes: 갱신할 노선 배열 (없으면 STATE.selectedRoute 단일)
async function refreshVisibleBuses(mapObj, targetRoutes) {
  if (!BIS_CITY_CODE || !mapObj) return;
  const routes = targetRoutes || (STATE.selectedRoute ? [STATE.selectedRoute] : []);
  for (const route of routes) {
    await updateBusLocations(route, mapObj);
  }
}

// ── 자동 갱신 시작 (30초 간격) ───────────────────────────────────
function startBISTracking(mapObj, targetRoutes) {
  stopBISTracking();
  const doRefresh = () => refreshVisibleBuses(mapObj, targetRoutes);
  doRefresh(); // 즉시 1회
  BIS_TIMER = setInterval(doRefresh, 30000);
  console.log('[BIS] 실시간 추적 시작 (30초 간격)');
}

// ── 자동 갱신 중지 ────────────────────────────────────────────────
function stopBISTracking() {
  if (BIS_TIMER) {
    clearInterval(BIS_TIMER);
    BIS_TIMER = null;
    console.log('[BIS] 실시간 추적 중지');
  }
}

// ── 노선도 화면에서 선택된 노선 버스 표시 ─────────────────────────
// screens.js의 showRouteOnMap 호출 후 연동
function attachBISToRouteMap() {
  if (!STATE.selectedRoute || !STATE.mapRoutes) return;
  if (!BIS_CITY_CODE) {
    console.warn('[BIS] 도시코드 미확인. initBIS() 먼저 호출 필요');
    return;
  }
  startBISTracking(STATE.mapRoutes, [STATE.selectedRoute]);
}

// ── 노선도 화면 벗어날 때 정리 ───────────────────────────────────
function detachBISFromRouteMap() {
  stopBISTracking();
  clearAllBusMarkers();
}
