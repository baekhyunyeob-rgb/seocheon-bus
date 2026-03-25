'use strict';

// ==================== 카카오맵 로드 ====================
function loadKakaoMap() {
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    // 최초 호출 시 타이머 시작
    if (!loadKakaoMap._retryCount) loadKakaoMap._retryCount = 0;
    loadKakaoMap._retryCount++;
    if (loadKakaoMap._retryCount > 10) {
      // 5초(500ms × 10) 이상 로드 안 되면 사용자에게 안내
      const ex = document.getElementById('map-error-banner');
      if (!ex) {
        const banner = document.createElement('div');
        banner.id = 'map-error-banner';
        banner.style.cssText = [
          'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
          'background:#FCEBEB', 'color:#A32D2D',
          'font-size:13px', 'text-align:center',
          'padding:10px 16px', 'line-height:1.5',
        ].join(';');
        banner.textContent = '⚠️ 지도를 불러오지 못했습니다. 네트워크를 확인하거나 새로고침해 주세요.';
        document.body.prepend(banner);
      }
      return;
    }
    setTimeout(loadKakaoMap, 500); return;
  }
  kakao.maps.load(async () => {
    initHomeMap();
    await buildRouteCoords();
  });
}

// ==================== 홈 지도 ====================
function initHomeMap() {
  const el = document.getElementById('map-home');
  if (!el) return;
  STATE.mapHome = new kakao.maps.Map(el, {
    center: new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng),
    level: 8,
  });
  STATE.mapHome.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  // 줌 레벨 6 이하: 근처 정류장 표시
  let stopOverlays = [];
  let lastLevel = 8;
  const showStopDots = () => {
    stopOverlays.forEach(o => o.setMap(null));
    stopOverlays = [];
    const bounds = STATE.mapHome.getBounds();
    STOPS.filter(s =>
      s.lat >= bounds.getSouthWest().getLat() && s.lat <= bounds.getNorthEast().getLat() &&
      s.lng >= bounds.getSouthWest().getLng() && s.lng <= bounds.getNorthEast().getLng()
    ).slice(0,200).forEach(s => {
      const disp = s.displayName || s.name;
      const ov = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(s.lat, s.lng),
        content: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer"
          onclick="selectPlace('to',${JSON.stringify({name:s.name,displayName:disp,lat:s.lat,lng:s.lng}).replace(/"/g,'&quot;')})">
          <div style="background:#fff;border:1.5px solid #1D9E75;border-radius:4px;padding:1px 5px;font-size:10px;color:#1D9E75;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.1)">${disp}</div>
          <div style="width:6px;height:6px;background:#1D9E75;border:1.5px solid #fff;border-radius:50%;margin-top:1px"></div>
        </div>`,
        yAnchor: 1.4, zIndex: 3,
      });
      ov.setMap(STATE.mapHome);
      stopOverlays.push(ov);
    });
  };
  kakao.maps.event.addListener(STATE.mapHome, 'zoom_changed', () => {
    const lv = STATE.mapHome.getLevel();
    if (lv <= 6 && lastLevel > 6) showStopDots();
    else if (lv > 6 && stopOverlays.length) { stopOverlays.forEach(o=>o.setMap(null)); stopOverlays=[]; }
    lastLevel = lv;
  });
  kakao.maps.event.addListener(STATE.mapHome, 'dragend', () => {
    if (STATE.mapHome.getLevel() <= 6) showStopDots();
  });

  // GPS 3초 후 fallback
  setTimeout(() => { if (!STATE.myMarker) updateMyMarker(STATE.mapHome, new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng)); }, 3000);
}

// 내 위치 마커
function updateMyMarker(map, latlng) {
  if (STATE.myMarker) { STATE.myMarker.setMap(null); STATE.myMarker = null; }
  STATE.myMarker = new kakao.maps.CustomOverlay({
    position: latlng,
    content: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="width:20px;height:20px;background:#185FA5;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(24,95,165,.5);display:flex;align-items:center;justify-content:center">
        <div style="width:6px;height:6px;background:#fff;border-radius:50%"></div>
      </div>
    </div>`,
    yAnchor: 1.0, zIndex: 10,
  });
  STATE.myMarker.setMap(map);
}

// 핀 마커 생성 (홈화면/상세화면 공통)
function makePinOverlay(lat, lng, color, label) {
  return new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(lat, lng),
    content: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="background:${color};color:#fff;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,.2)">${label}</div>
      <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${color};margin-top:-1px"></div>
      <div style="width:8px;height:8px;background:${color};border:2px solid #fff;border-radius:50%"></div>
    </div>`,
    yAnchor: 1.1, zIndex: 5,
  });
}

// 핀 마커 (핀 모양, 지도 위 핀)
function makeLocationPin(lat, lng, color) {
  return new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(lat, lng),
    content: `<svg width="18" height="26" viewBox="0 0 18 26" style="filter:drop-shadow(0 2px 3px rgba(0,0,0,.25))">
      <path d="M9,26 C9,14 1,9 1,5 C1,2.2 4.7,0 9,0 C13.3,0 17,2.2 17,5 C17,9 9,14 9,26Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
      <circle cx="9" cy="5.5" r="3" fill="#fff"/>
    </svg>`,
    yAnchor: 1.0, zIndex: 6,
  });
}

// 홈 지도 마커 업데이트
function updateHomeMarkers() {
  if (!STATE.mapHome) return;
  if (STATE.homeFromMarker) { STATE.homeFromMarker.setMap(null); STATE.homeFromMarker=null; }
  if (STATE.homeToMarker)   { STATE.homeToMarker.setMap(null);   STATE.homeToMarker=null; }

  const fr = STATE.search.from, to = STATE.search.to;

  if (fr?.lat && !fr.isGps) {
    STATE.homeFromMarker = makeLocationPin(fr.lat, fr.lng, '#185FA5');
    STATE.homeFromMarker.setMap(STATE.mapHome);
  }
  if (to?.lat) {
    STATE.homeToMarker = makeLocationPin(to.lat, to.lng, '#E24B4A');
    STATE.homeToMarker.setMap(STATE.mapHome);
  }
  if (fr?.lat && to?.lat) {
    const bounds = new kakao.maps.LatLngBounds();
    if (!fr.isGps) bounds.extend(new kakao.maps.LatLng(fr.lat, fr.lng));
    bounds.extend(new kakao.maps.LatLng(to.lat, to.lng));
    STATE.mapHome.setBounds(bounds, 80);
  }
}

// ==================== 경로 상세 지도 ====================
function initDetailMap(result) {
  const el = document.getElementById('map-detail');
  if (!el) return;
  STATE.mapDetail = new kakao.maps.Map(el, {
    center: new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng),
    level: 9,
  });

  // 기존 오버레이 정리
  STATE.detailMarkers.forEach(m => m.setMap(null));
  STATE.detailMarkers = [];
  if (STATE.detailPolyline) { STATE.detailPolyline.setMap(null); STATE.detailPolyline=null; }

  const color = getZoneColor(result.route);
  const allCoords = getRouteCoords(result.route).filter(c=>c.lat);

  // 출발·도착 좌표 결정
  const fr = STATE.search.from?.isGps ? {lat:STATE.myLocation.lat,lng:STATE.myLocation.lng} : (STATE.search.from || {});
  const to = STATE.search.to || {};

  // 구간 추출
  let segCoords = allCoords;
  if (fr.lat && to.lat && allCoords.length) {
    let fiI=0,fiD=9e9,tiI=allCoords.length-1,tiD=9e9;
    allCoords.forEach((c,i) => {
      const df=distM(c.lat,c.lng,fr.lat,fr.lng), dt=distM(c.lat,c.lng,to.lat,to.lng);
      if(df<fiD){fiD=df;fiI=i;} if(dt<tiD){tiD=dt;tiI=i;}
    });
    if (fiI > tiI) [fiI,tiI]=[tiI,fiI];
    segCoords = allCoords.slice(fiI, tiI+1);
  }

  // 지나온 구간 (흐리게)
  const myLat=STATE.myLocation.lat, myLng=STATE.myLocation.lng;
  const myI = findNearestIdx(segCoords, myLat, myLng);

  if (segCoords.length >= 2) {
    // 지나온 구간
    if (myI > 0) {
      const pastPath = segCoords.slice(0, myI+1).map(c=>new kakao.maps.LatLng(c.lat,c.lng));
      new kakao.maps.Polyline({ map:STATE.mapDetail, path:pastPath, strokeWeight:4, strokeColor:color, strokeOpacity:0.25, strokeStyle:'solid' });
    }
    // 남은 구간
    const futurePath = segCoords.slice(myI).map(c=>new kakao.maps.LatLng(c.lat,c.lng));
    STATE.detailPolyline = new kakao.maps.Polyline({ map:STATE.mapDetail, path:futurePath, strokeWeight:4, strokeColor:color, strokeOpacity:0.9, strokeStyle:'solid' });
  }

  // 환승 2구간
  if (result.type === 'transfer') {
    const c2 = getRouteCoords(result.route2).filter(c=>c.lat);
    const color2 = getZoneColor(result.route2);
    if (c2.length >= 2) {
      new kakao.maps.Polyline({ map:STATE.mapDetail, path:c2.map(c=>new kakao.maps.LatLng(c.lat,c.lng)), strokeWeight:4, strokeColor:color2, strokeOpacity:0.85, strokeStyle:'solid' });
    }
  }

  // 정류장 점
  segCoords.forEach((c,i) => {
    if (!c.lat || i===0||i===segCoords.length-1) return;
    const dot = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(c.lat,c.lng),
      content: `<div style="width:6px;height:6px;background:${color};border:1.5px solid #fff;border-radius:50%"></div>`,
      yAnchor:0.5, zIndex:3,
    });
    dot.setMap(STATE.mapDetail);
    STATE.detailMarkers.push(dot);
  });

  // 현재 위치
  updateMyMarker(STATE.mapDetail, new kakao.maps.LatLng(myLat,myLng));

  // 출발·도착 핀
  if (fr.lat) { const p=makeLocationPin(fr.lat,fr.lng,'#185FA5'); p.setMap(STATE.mapDetail); STATE.detailMarkers.push(p); }
  if (to.lat) { const p=makeLocationPin(to.lat,to.lng,'#E24B4A'); p.setMap(STATE.mapDetail); STATE.detailMarkers.push(p); }

  // 범위 조정
  const bounds = new kakao.maps.LatLngBounds();
  if (fr.lat) bounds.extend(new kakao.maps.LatLng(fr.lat,fr.lng));
  if (to.lat) bounds.extend(new kakao.maps.LatLng(to.lat,to.lng));
  if (fr.lat||to.lat) STATE.mapDetail.setBounds(bounds, 80);
}

// ==================== 노선도 지도 ====================
function initRoutesMap() {
  const el = document.getElementById('map-routes');
  if (!el) return;
  if (typeof kakao === 'undefined' || !kakao.maps) { setTimeout(initRoutesMap,300); return; }
  kakao.maps.load(() => {
    if (STATE.mapRoutes) return;
    STATE.mapRoutes = new kakao.maps.Map(el, {
      center: new kakao.maps.LatLng(36.0758,126.6908), level:10,
    });
    // 지도 준비 완료 → tryShow 루프가 돌고 있으면 즉시 표시
    if (STATE.selectedRoute) {
      showRouteOnMap(STATE.selectedRoute, STATE.timetableSearchStop || null);
    }
  });
}

function showRouteOnMap(route, searchStop) {
  if (!STATE.mapRoutes) return;
  STATE.routeMarkers.forEach(m=>m.setMap(null)); STATE.routeMarkers=[];
  if (STATE.routePolyline) { STATE.routePolyline.setMap(null); STATE.routePolyline=null; }
  // 이전 검색 정류장 마커 제거
  if (STATE.searchStopMarker) { STATE.searchStopMarker.setMap(null); STATE.searchStopMarker=null; }

  const color  = getZoneColor(route);
  const coords = getRouteCoords(route).filter(c=>c.lat);
  if (coords.length < 2) return;

  const path = coords.map(c=>new kakao.maps.LatLng(c.lat,c.lng));

  // 메인 폴리라인
  STATE.routePolyline = new kakao.maps.Polyline({
    map:STATE.mapRoutes, path, strokeWeight:4, strokeColor:color, strokeOpacity:0.9, strokeStyle:'solid',
  });

  // 방향 삼각형 (등간격 4개)
  const totalLen = coords.length;
  [0.2, 0.4, 0.6, 0.8].forEach(ratio => {
    const idx = Math.floor(totalLen * ratio);
    if (idx <= 0 || idx >= totalLen-1) return;
    const a=coords[idx-1], b=coords[idx+1];
    if (!a||!b) return;
    const angle = Math.atan2(b.lat-a.lat, b.lng-a.lng);
    const size  = 0.0003;
    const tip  = { lat: coords[idx].lat + Math.sin(angle)*size, lng: coords[idx].lng + Math.cos(angle)*size };
    const bl   = { lat: coords[idx].lat - Math.sin(angle+Math.PI/2)*size*0.6, lng: coords[idx].lng - Math.cos(angle+Math.PI/2)*size*0.6 };
    const br   = { lat: coords[idx].lat + Math.sin(angle+Math.PI/2)*size*0.6, lng: coords[idx].lng + Math.cos(angle+Math.PI/2)*size*0.6 };
    const tri  = new kakao.maps.Polygon({
      map: STATE.mapRoutes,
      path: [new kakao.maps.LatLng(tip.lat,tip.lng), new kakao.maps.LatLng(bl.lat,bl.lng), new kakao.maps.LatLng(br.lat,br.lng)],
      fillColor: color, fillOpacity: 0.9,
      strokeColor: color, strokeOpacity: 0, strokeWeight: 0,
    });
    STATE.routeMarkers.push(tri);
  });

  // 중간 정류장 점
  coords.forEach((c,i) => {
    if (i===0||i===coords.length-1) return;
    const isSnapped = c.source === 'snapped';
    const dotColor  = isSnapped ? '#E24B4A' : color;
    const dotSize   = isSnapped ? '7px' : '5px';
    const border    = isSnapped ? '2px solid #fff' : '1.5px solid #fff';
    const title     = isSnapped ? `title="${c.name} (도로스냅)"` : `title="${c.name}"`;
    const dot = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(c.lat,c.lng),
      content: `<div ${title} style="width:${dotSize};height:${dotSize};background:${dotColor};border:${border};border-radius:50%;cursor:default"></div>`,
      yAnchor:0.5, zIndex:2,
    });
    dot.setMap(STATE.mapRoutes);
    STATE.routeMarkers.push(dot);
  });

  // 기점 핀 (파랑)
  const startPin = makeLocationPin(coords[0].lat, coords[0].lng, '#185FA5');
  startPin.setMap(STATE.mapRoutes);
  STATE.routeMarkers.push(startPin);

  // 종점 핀 (빨강)
  const endPin = makeLocationPin(coords[coords.length-1].lat, coords[coords.length-1].lng, '#E24B4A');
  endPin.setMap(STATE.mapRoutes);
  STATE.routeMarkers.push(endPin);

  // ── 검색 정류장 마커 (시간표에서 진입했을 때) ──────────────────
  if (searchStop?.lat && searchStop?.lng) {
    const disp = searchStop.displayName || searchStop.name;
    STATE.searchStopMarker = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(searchStop.lat, searchStop.lng),
      content: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="background:#EF9F27;color:#fff;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)">${disp}</div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #EF9F27;margin-top:-1px"></div>
        <div style="width:10px;height:10px;background:#EF9F27;border:2.5px solid #fff;border-radius:50%;margin-top:-1px;box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>
      </div>`,
      yAnchor: 1.15, zIndex: 10,
    });
    STATE.searchStopMarker.setMap(STATE.mapRoutes);
  }
  // ──────────────────────────────────────────────────────────────

  // 지도 범위 조정
  const bounds = new kakao.maps.LatLngBounds();
  coords.forEach(c => bounds.extend(new kakao.maps.LatLng(c.lat,c.lng)));
  STATE.mapRoutes.setBounds(bounds, 60);
}

function clearRouteMap() {
  STATE.routeMarkers.forEach(m=>m.setMap(null)); STATE.routeMarkers=[];
  if (STATE.routePolyline) { STATE.routePolyline.setMap(null); STATE.routePolyline=null; }
  if (STATE.mapRoutes) STATE.mapRoutes.setLevel(10);
}
