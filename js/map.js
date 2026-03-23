// ================================================================
// map.js — 카카오맵 초기화, 도로 기반 경로, 노선도
// ================================================================

let mapHome    = null;
let mapDetail  = null;
let mapRoutes  = null;

let myMarker      = null;
let detailPolys   = [];   // 경로 상세 폴리라인들
let detailMarkers = [];   // 경로 상세 마커들
let routePolylines = [];  // 노선도 폴리라인
let routeOverlays  = [];  // 노선도 오버레이(화살표 등)

// 노선도 현재 경로 저장 (zoom_changed 시 재사용)
let currentRoute  = null;
let currentPaths  = [];   // [{path, color, bothWay}]

// ── 카카오맵 SDK 로드 ──────────────────────────────────────────
function loadKakaoMap() {
  const JS_KEY = 'ea4bdbbdf5c627aba4db0a4b163c9b0d';
  const script = document.createElement('script');
  script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${JS_KEY}&autoload=false`;
  script.onload = () => {
    kakao.maps.load(() => {
      initHomeMap();
    });
  };
  document.head.appendChild(script);
}

// ── 홈 화면 지도 ───────────────────────────────────────────────
function initHomeMap() {
  const container = document.getElementById('map-home');
  if (!container) return;
  mapHome = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(APP.myLocation.lat, APP.myLocation.lng),
    level: 8,
  });

  // 줌 레벨 변경 시 정류장 표시 갱신
  kakao.maps.event.addListener(mapHome, 'zoom_changed', updateHomeStopMarkers);
  kakao.maps.event.addListener(mapHome, 'dragend', updateHomeStopMarkers);

  updateMyMarker();
  updateHomeStopMarkers();
}

// ── 내 위치 마커 ───────────────────────────────────────────────
function updateMyMarker() {
  if (!mapHome) return;
  if (myMarker) myMarker.setMap(null);
  const pos = new kakao.maps.LatLng(APP.myLocation.lat, APP.myLocation.lng);
  myMarker = new kakao.maps.CustomOverlay({
    position: pos,
    content: `<div style="width:14px;height:14px;background:#185FA5;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4)"></div>`,
    yAnchor: 0.5,
  });
  myMarker.setMap(mapHome);
  mapHome.setCenter(pos);

  if (!isInSeocheon(APP.myLocation.lat, APP.myLocation.lng)) {
    document.getElementById('out-of-area-notice')?.style.setProperty('display','flex');
  }
}

// ── 홈 지도 정류장 마커 (레벨 7 이하에서 표시) ────────────────
let stopMarkers = [];
function updateHomeStopMarkers() {
  if (!mapHome) return;
  const level = mapHome.getLevel();
  stopMarkers.forEach(m => m.setMap(null));
  stopMarkers = [];
  if (level > 7) return;

  const bounds = mapHome.getBounds();
  APP.stops.forEach(s => {
    if (!bounds.contain(new kakao.maps.LatLng(s.lat, s.lng))) return;
    const ov = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(s.lat, s.lng),
      content: `<div style="width:6px;height:6px;background:#1D9E75;border:1.5px solid #fff;border-radius:50%;opacity:0.8;cursor:pointer"
                     onclick="selectStopOnMap('${s.name}','${s.displayName}',${s.lat},${s.lng})"></div>`,
      yAnchor: 0.5,
    });
    ov.setMap(mapHome);
    stopMarkers.push(ov);
  });
}

function selectStopOnMap(name, displayName, lat, lng) {
  // 정류장 클릭 → 도착지로 설정
  selectPlace('to', { name, displayName, lat, lng });
}

// ── 경로 상세 지도 ─────────────────────────────────────────────
function initDetailMap(result) {
  const container = document.getElementById('map-detail');
  if (!container) return;

  // 기존 지도 초기화
  detailPolys.forEach(p => p.setMap(null));
  detailMarkers.forEach(m => m.setMap(null));
  detailPolys = [];
  detailMarkers = [];
  if (mapDetail) { mapDetail = null; container.innerHTML = ''; }

  const fromStop = findStop(APP.searchState.from?.name) || APP.searchState.from;
  const toStop   = findStop(APP.searchState.to?.name)   || APP.searchState.to;

  mapDetail = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(fromStop?.lat || APP.myLocation.lat, fromStop?.lng || APP.myLocation.lng),
    level: 9,
  });

  const color1 = getZoneColor(result.route);
  const color2 = result.route2 ? getZoneColor(result.route2) : color1;

  if (result.type === 'transfer') {
    // 환승: 1구간, 2구간 각각 그리기
    const hubStop = result.hubStop;
    const coords1 = getRouteCoords(result.route).filter(c => c.lat);
    const coords2 = getRouteCoords(result.route2).filter(c => c.lat);

    const seg1 = sliceSegment(coords1, fromStop, hubStop);
    const seg2 = sliceSegment(coords2, hubStop, toStop);

    const bounds = new kakao.maps.LatLngBounds();
    drawSegment(seg1, color1, bounds);
    drawSegment(seg2, color2, bounds, () => {
      if (!bounds.isEmpty()) mapDetail.setBounds(bounds, 80);
    });

    addDetailMarker(fromStop, '출발', '#185FA5');
    if (hubStop) addDetailMarker(hubStop, '환승', '#FF8C00');
    addDetailMarker(toStop,   '도착', '#E24B4A');
  } else {
    // 직행
    const coords = getRouteCoords(result.route).filter(c => c.lat);
    const seg = sliceSegment(coords, fromStop, toStop);
    const bounds = new kakao.maps.LatLngBounds();
    drawSegment(seg, color1, bounds, () => {
      if (!bounds.isEmpty()) mapDetail.setBounds(bounds, 80);
    });
    addDetailMarker(fromStop, '출발', '#185FA5');
    addDetailMarker(toStop,   '도착', '#E24B4A');

    // 초기 범위 (도로경로 오기 전)
    if (fromStop) bounds.extend(new kakao.maps.LatLng(fromStop.lat, fromStop.lng));
    if (toStop)   bounds.extend(new kakao.maps.LatLng(toStop.lat,   toStop.lng));
    if (!bounds.isEmpty()) mapDetail.setBounds(bounds, 80);
  }
}

// 좌표 배열에서 from~to 구간 추출
function sliceSegment(coords, fromStop, toStop) {
  if (!coords.length) return [];
  let fi = 0, fd = 9e9, ti = coords.length - 1, td = 9e9;
  coords.forEach((c, i) => {
    if (fromStop) {
      const d = coordDist(c.lat, c.lng, fromStop.lat, fromStop.lng);
      if (d < fd) { fd = d; fi = i; }
    }
    if (toStop) {
      const d = coordDist(c.lat, c.lng, toStop.lat, toStop.lng);
      if (d < td) { td = d; ti = i; }
    }
  });
  if (fi > ti) { const t = fi; fi = ti; ti = t; }
  return coords.slice(fi, ti + 1);
}

// 구간 폴리라인 그리기 (직선 먼저 → 도로 기반으로 교체)
function drawSegment(coords, color, bounds, onDone) {
  if (!coords.length) { if (onDone) onDone(null); return; }

  const straight = coords.map(c => new kakao.maps.LatLng(c.lat, c.lng));
  straight.forEach(p => bounds.extend(p));

  // 직선 임시 표시
  const tmp = new kakao.maps.Polyline({
    map: mapDetail, path: straight,
    strokeWeight: 5, strokeColor: color,
    strokeOpacity: 0.35, strokeStyle: 'dashed',
  });
  detailPolys.push(tmp);

  // 도로 기반 경로 요청
  fetchRoadPath(coords).then(road => {
    tmp.setMap(null);
    const path = (road && road.length >= 2) ? road : straight;
    const poly = new kakao.maps.Polyline({
      map: mapDetail, path,
      strokeWeight: 5, strokeColor: color,
      strokeOpacity: 0.92, strokeStyle: 'solid',
    });
    detailPolys.push(poly);
    if (road) road.forEach(p => bounds.extend(p));
    if (onDone) onDone(path);
  });
}

// 출발/환승/도착 마커
function addDetailMarker(stop, label, color) {
  if (!stop?.lat || !mapDetail) return;
  const ov = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(stop.lat, stop.lng),
    content: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
      <div style="background:${color};color:#fff;border-radius:8px;padding:2px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,.25)">${label}</div>
      <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${color}"></div>
      <div style="width:7px;height:7px;background:${color};border:2px solid #fff;border-radius:50%"></div>
    </div>`,
    yAnchor: 1.15, zIndex: 10,
  });
  ov.setMap(mapDetail);
  detailMarkers.push(ov);
}

// ── 카카오 모빌리티 도로 경로 API ─────────────────────────────
async function fetchRoadPath(coords) {
  if (!coords || coords.length < 2) return null;
  const validCoords = coords.filter(c => c.lat && c.lng);
  if (validCoords.length < 2) return null;

  const origin = `${validCoords[0].lng},${validCoords[0].lat}`;
  const dest   = `${validCoords[validCoords.length-1].lng},${validCoords[validCoords.length-1].lat}`;

  // 경유지 최대 5개 균등 추출
  const mids = validCoords.slice(1, -1);
  const step = mids.length <= 5 ? 1 : Math.floor(mids.length / 5);
  const waypts = [];
  for (let i = 0; i < mids.length && waypts.length < 5; i += step) {
    waypts.push(`${mids[i].lng},${mids[i].lat}`);
  }

  const url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${dest}${waypts.length ? '&waypoints=' + waypts.join('|') : ''}&priority=RECOMMEND`;

  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `KakaoAK ${KAKAO_REST_KEY}` },
    });
    const data = await res.json();
    const sections = data.routes?.[0]?.sections;
    if (!sections?.length) return null;

    const path = [];
    sections.forEach(sec => {
      (sec.roads || []).forEach(road => {
        const vx = road.vertexes || [];
        for (let i = 0; i + 1 < vx.length; i += 2) {
          path.push(new kakao.maps.LatLng(vx[i+1], vx[i]));
        }
      });
    });
    return path.length >= 2 ? path : null;
  } catch {
    return null;
  }
}

// ── 노선도 지도 ────────────────────────────────────────────────
function initRoutesMap() {
  const container = document.getElementById('map-routes');
  if (!container || mapRoutes) return;
  if (typeof kakao === 'undefined' || !kakao.maps) {
    setTimeout(initRoutesMap, 300); return;
  }
  if (APP.routeCoords.size === 0) {
    setTimeout(initRoutesMap, 300); return;
  }
  kakao.maps.load(() => {
    if (mapRoutes) return;
    mapRoutes = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(36.0758, 126.6908),
      level: 10,
    });
    // 줌 변경 시 화살표 재생성
    kakao.maps.event.addListener(mapRoutes, 'zoom_changed', () => {
      if (currentRoute) redrawArrows();
    });
  });
}

function showRouteOnMap(route) {
  if (!mapRoutes) return;
  clearRouteMap();
  currentRoute = route;
  currentPaths = [];

  const color = getZoneColor(route);
  const coords = getRouteCoords(route).filter(c => c.lat);
  if (coords.length < 2) {
    mapRoutes.setCenter(new kakao.maps.LatLng(36.0758, 126.6908));
    mapRoutes.setLevel(10);
    return;
  }

  // 왕복/순환 구간 감지
  const segments = parseRouteSegments(route);
  const nameCount = {};
  segments.forEach(s => { nameCount[s.name] = (nameCount[s.name] || 0) + 1; });
  const bothWay = segments.some(s => s.dir === 'both') || Object.values(nameCount).some(c => c > 1);

  // 기점/종점 마커
  addRouteEndMarker(coords[0], true, color);
  addRouteEndMarker(coords[coords.length - 1], false, color);

  // 중간 경유지 점
  coords.forEach((c, i) => {
    if (i === 0 || i === coords.length - 1) return;
    const dot = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(c.lat, c.lng),
      content: `<div style="width:4px;height:4px;background:${color};border:1px solid #fff;border-radius:50%;opacity:0.6"></div>`,
      yAnchor: 0.5, zIndex: 2,
    });
    dot.setMap(mapRoutes);
    routeOverlays.push(dot);
  });

  // 지도 범위 먼저 설정
  const bounds = new kakao.maps.LatLngBounds();
  coords.forEach(c => bounds.extend(new kakao.maps.LatLng(c.lat, c.lng)));
  mapRoutes.setBounds(bounds, 40);

  // 직선 임시 표시
  const tmpPoly = new kakao.maps.Polyline({
    map: mapRoutes, path: coords.map(c => new kakao.maps.LatLng(c.lat, c.lng)),
    strokeWeight: 4, strokeColor: color, strokeOpacity: 0.3, strokeStyle: 'dashed',
  });
  routePolylines.push(tmpPoly);

  // 도로 기반 경로 요청
  fetchRoadPath(coords).then(road => {
    tmpPoly.setMap(null);
    const path = (road && road.length >= 2) ? road : coords.map(c => new kakao.maps.LatLng(c.lat, c.lng));
    const poly = new kakao.maps.Polyline({
      map: mapRoutes, path,
      strokeWeight: 4, strokeColor: color, strokeOpacity: 0.88, strokeStyle: 'solid',
    });
    routePolylines.push(poly);
    currentPaths = [{ path, color, bothWay }];
    drawArrows(path, color, bothWay);
    if (road) {
      const rb = new kakao.maps.LatLngBounds();
      road.forEach(p => rb.extend(p));
      mapRoutes.setBounds(rb, 40);
    }
  });
}

function addRouteEndMarker(coord, isStart, color) {
  const c = isStart ? '#185FA5' : '#E24B4A';
  const ov = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(coord.lat, coord.lng),
    content: `<div style="width:10px;height:10px;background:${c};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`,
    yAnchor: 0.5, zIndex: 5,
  });
  ov.setMap(mapRoutes);
  routeOverlays.push(ov);
}

function clearRouteMap() {
  routePolylines.forEach(p => p.setMap(null));
  routeOverlays.forEach(o => o.setMap(null));
  routePolylines = [];
  routeOverlays = [];
}

// ── 방향 화살표 ────────────────────────────────────────────────
function drawArrows(path, color, bothWay) {
  if (!path || path.length < 2) return;
  const level = mapRoutes ? mapRoutes.getLevel() : 8;
  const count = level <= 4 ? 12 : level <= 6 ? 9 : level <= 8 ? 6 : 4;
  const step = Math.max(2, Math.floor(path.length / count));
  const edgeMargin = Math.max(3, Math.floor(path.length * 0.12));

  for (let i = step; i < path.length - 1; i += step) {
    if (i < edgeMargin || i > path.length - 1 - edgeMargin) continue;
    const p1 = path[i], p2 = path[i + 1];
    const angle = Math.atan2(p2.getLng() - p1.getLng(), p2.getLat() - p1.getLat()) * 180 / Math.PI;
    const mid = new kakao.maps.LatLng((p1.getLat() + p2.getLat()) / 2, (p1.getLng() + p2.getLng()) / 2);

    const mkArrow = (rot) => `<svg width="9" height="9" viewBox="0 0 14 14" style="transform:rotate(${rot}deg);filter:drop-shadow(0 1px 1px rgba(0,0,0,0.3))"><polygon points="7,0 14,14 0,14" fill="${color}" opacity="0.85"/></svg>`;
    const content = bothWay
      ? `<div style="display:flex;gap:2px">${mkArrow(angle)}${mkArrow(angle + 180)}</div>`
      : mkArrow(angle);

    const ov = new kakao.maps.CustomOverlay({
      position: mid,
      content: `<div style="pointer-events:none;display:flex;align-items:center;justify-content:center">${content}</div>`,
      yAnchor: 0.5, zIndex: 6,
    });
    ov.setMap(mapRoutes);
    routeOverlays.push(ov);
  }
}

function redrawArrows() {
  // 기존 화살표만 제거 (폴리라인 유지)
  routeOverlays.forEach(o => o.setMap(null));
  routeOverlays = [];
  currentPaths.forEach(({ path, color, bothWay }) => drawArrows(path, color, bothWay));
}

// ── 경유 파싱 (방향 정보 포함) ────────────────────────────────
function parseRouteSegments(route) {
  const via = (route['경유'] || '').replace(/[()]/g, '');
  const tokens = via.split(/(→|↔)/);
  const items = [{ name: route['기점'], dir: null }];
  let lastDir = 'fwd';
  tokens.forEach(tok => {
    const t = tok.trim();
    if (t === '→') lastDir = 'fwd';
    else if (t === '↔') lastDir = 'both';
    else if (t) items.push({ name: t, dir: lastDir });
  });
  items.push({ name: route['종점'], dir: lastDir });
  return items;
}

// ── GPS 위치 ───────────────────────────────────────────────────
function initLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    pos => {
      APP.myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      updateMyMarker();
    },
    () => {}, // 실패 시 기본값 유지
    { timeout: 8000 }
  );
}
