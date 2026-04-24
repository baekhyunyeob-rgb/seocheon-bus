'use strict';

// =====================================================
// bis.js — 충청남도 CN BUS 실시간 버스위치 연동
//
// 역공학으로 파악한 API:
//   base  : https://www.chungnam.go.kr/cnbus
//   search: POST /mobile/api/search.do
//   위치  : POST /cmmn/selectBusRealTimeListGeoJsonProcs.do
//
// 파라미터:
//   ADMIN_ID = 295 (서천군 고정)
//   TODAY    = YYYYMMDD (오늘 날짜)
//   LayerId  = VECTOR_TMPR_ICON_ALL_VEH (전체 차량)
//
// CORS 문제: chungnam.go.kr는 외부 도메인 직접 호출 불가
//   → Vercel rewrites로 프록시 처리 필요 (vercel.json 수정)
// =====================================================

const CNBUS_BASE   = 'https://www.chungnam.go.kr/cnbus';
const CNBUS_ADMIN  = '295'; // 서천군

// 실시간 버스 위치 마커 저장
const BIS_MARKERS  = [];
let   BIS_TIMER    = null;
let   BIS_MAP      = null;
let   BIS_ENABLED  = false;

// ── 오늘 날짜 YYYYMMDD ──────────────────────────────
function _today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const dd= String(d.getDate()).padStart(2,'0');
  return `${y}${m}${dd}`;
}

// ── POST 헬퍼 ────────────────────────────────────────
async function _post(path, params) {
  const body = new URLSearchParams(params);
  const res  = await fetch(`/cnbus-proxy${path}`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : body.toString(),
  });
  return res.json();
}

// ── 전체 차량 실시간 위치 조회 ────────────────────────
// GeoJSON 형태로 서천군 내 운행 중인 모든 버스 좌표 반환
async function fetchAllBusLocations() {
  try {
    const data = await _post(
      '/cmmn/selectBusRealTimeListGeoJsonProcs.do',
      {
        TODAY  : _today(),
        LayerId: 'VECTOR_TMPR_ICON_ALL_VEH',
        adminId: CNBUS_ADMIN,
      }
    );

    // GeoJSON 구조: data.features[] 또는 data.data[]
    const features =
      data?.features ||
      data?.data?.features ||
      data?.data?.result?.features ||
      [];

    return features.map(f => {
      const props = f.properties || f.props || {};
      const geom  = f.geometry   || {};
      const coords= geom.coordinates || []; // [lng, lat]
      return {
        lng      : parseFloat(coords[0]),
        lat      : parseFloat(coords[1]),
        vehicleNo: props.VehicleNo  || props.vehicleNo || props.VEHICLE_NO || '',
        routeNo  : props.RouteNo    || props.routeNo   || props.ROUTE_NO   || '',
        routeId  : props.RouteId    || props.routeId   || props.ROUTE_ID   || '',
        stationNm: props.StationNm  || props.stationNm || '',
      };
    }).filter(b => b.lat > 30 && b.lat < 40 && b.lng > 120 && b.lng < 132);

  } catch(e) {
    console.warn('[BIS] 버스위치 조회 실패:', e);
    return [];
  }
}

// ── 마커 전체 제거 ────────────────────────────────────
function _clearMarkers() {
  BIS_MARKERS.forEach(m => m.setMap(null));
  BIS_MARKERS.length = 0;
}

// ── 지도에 버스 마커 그리기 ──────────────────────────
function _drawMarkers(buses) {
  _clearMarkers();
  if (!BIS_MAP) return;

  buses.forEach(bus => {
    const color   = '#185FA5';
    const label   = bus.routeNo || '?';
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(bus.lat, bus.lng),
      content : `<div style="
          display:flex;flex-direction:column;align-items:center;
          pointer-events:none;
          filter:drop-shadow(0 2px 5px rgba(0,0,0,.4));
        ">
        <div style="
          background:${color};color:#fff;
          border:2px solid #fff;border-radius:12px;
          padding:2px 8px;font-size:11px;font-weight:700;
          white-space:nowrap;line-height:1.6;
        ">🚌 ${label}
          <span style="font-size:9px;opacity:.8;margin-left:2px">${bus.vehicleNo.slice(-4)}</span>
        </div>
        <div style="width:0;height:0;
          border-left:5px solid transparent;
          border-right:5px solid transparent;
          border-top:6px solid ${color};"></div>
      </div>`,
      yAnchor: 1.1,
      zIndex : 20,
    });
    overlay.setMap(BIS_MAP);
    BIS_MARKERS.push(overlay);
  });
}

// ── 갱신 1회 ─────────────────────────────────────────
async function _refresh() {
  if (!BIS_ENABLED || !BIS_MAP) return;
  const buses = await fetchAllBusLocations();
  _drawMarkers(buses);

  // 디버그: 콘솔에 운행 중 버스 요약
  if (buses.length) {
    console.log(`[BIS] 운행 중 버스 ${buses.length}대:`,
      buses.map(b=>`${b.routeNo}(${b.vehicleNo})`).join(', '));
  }
}

// ── 추적 시작 ─────────────────────────────────────────
function startBISTracking(mapObj) {
  BIS_MAP     = mapObj;
  BIS_ENABLED = true;
  stopBISTracking(); // 중복 방지
  _refresh();        // 즉시 1회
  BIS_TIMER = setInterval(_refresh, 30000); // 30초 간격
  console.log('[BIS] 실시간 추적 시작');
}

// ── 추적 중지 ─────────────────────────────────────────
function stopBISTracking() {
  if (BIS_TIMER) { clearInterval(BIS_TIMER); BIS_TIMER = null; }
  BIS_ENABLED = false;
  _clearMarkers();
  console.log('[BIS] 실시간 추적 중지');
}

// ── 홈 지도에 BIS 연결 (loadKakaoMap 콜백 후 호출) ────
function attachBISToHomeMap() {
  if (!STATE.mapHome) return;
  startBISTracking(STATE.mapHome);
}

// ── 노선도 지도에 BIS 연결 ────────────────────────────
function attachBISToRouteMap() {
  if (!STATE.mapRoutes) return;
  startBISTracking(STATE.mapRoutes);
}

function detachBISFromRouteMap() {
  stopBISTracking();
}

// ── 초기화 (앱 시작 시 1회 호출) ─────────────────────
function initBIS() {
  console.log('[BIS] CN BUS 실시간 연동 준비 완료 (서천군 ADMIN_ID=295)');
}
