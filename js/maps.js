'use strict';

// =====================================================
// maps.js  —  카카오맵 초기화 & 지도 조작 전담
//
// [보안 설계]
//  · JS 키  : index.html <head> SDK 태그에만 존재 (이 파일에 없음)
//  · REST 키: data.js의 KAKAO_REST_KEY 변수 한 곳에서만 관리
//             사용자 지정 키는 localStorage 'sc_kakao_rest_key' 우선
// =====================================================

// ==================== 카카오맵 로드 ====================
// index.html <head>에서 autoload=false로 SDK가 동기 로드되므로
// kakao 객체는 이 함수 호출 시점에 반드시 존재함.
// 그러나 방어적으로 재시도 로직 유지.

function loadKakaoMap() {
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    if (!loadKakaoMap._retry) loadKakaoMap._retry = 0;
    if (++loadKakaoMap._retry > 20) {
      _showMapError(); return;
    }
    setTimeout(loadKakaoMap, 500);
    return;
  }

  // kakao.maps.load(): autoload=false 일 때 내부 초기화 완료 후 콜백 실행
  // 이것이 핵심 — 절대 이 콜백 밖에서 kakao.maps.* 호출 금지
  kakao.maps.load(async () => {
    _initHomeMap();
    await buildRouteCoords();
  });
}

function _showMapError() {
  if (document.getElementById('map-error-banner')) return;
  const el = document.createElement('div');
  el.id = 'map-error-banner';
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;' +
    'background:#FCEBEB;color:#A32D2D;font-size:13px;text-align:center;' +
    'padding:10px 16px;line-height:1.5;';
  el.textContent = '⚠️ 지도를 불러오지 못했습니다. 네트워크를 확인하거나 새로고침해 주세요.';
  document.body.prepend(el);
}

// ==================== 도로 Polyline (Lazy 로드) ====================
// REST 키: localStorage 우선, 없으면 data.js의 KAKAO_REST_KEY 사용

const ROAD_CHUNK       = 5;
const ROAD_CONCURRENCY = 3;

function _getRestKey() {
  return localStorage.getItem('sc_kakao_rest_key') || KAKAO_REST_KEY;
}

async function fetchRoadPolyline(stops) {
  if (!stops || stops.length < 2) return stops.map(s => ({ lat: s.lat, lng: s.lng }));

  const segments = [];
  for (let i = 0; i < stops.length - 1; i += ROAD_CHUNK - 1) {
    segments.push(stops.slice(i, Math.min(i + ROAD_CHUNK, stops.length)));
    if (i + ROAD_CHUNK >= stops.length) break;
  }

  const restKey = _getRestKey();
  let polyline = [];

  for (let si = 0; si < segments.length; si += ROAD_CONCURRENCY) {
    const batch = segments.slice(si, si + ROAD_CONCURRENCY);
    const results = await Promise.all(batch.map(async seg => {
      const origin = `${seg[0].lng},${seg[0].lat}`;
      const dest   = `${seg[seg.length-1].lng},${seg[seg.length-1].lat}`;
      const wps    = seg.slice(1,-1).map(s=>`${s.lng},${s.lat}`).join('|');
      let url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${dest}&priority=RECOMMEND`;
      if (wps) url += `&waypoints=${wps}`;
      try {
        const res  = await fetch(url, { headers: { Authorization: `KakaoAK ${restKey}` } });
        const data = await res.json();
        const pts  = [];
        for (const section of data?.routes?.[0]?.sections || [])
          for (const road of section.roads || []) {
            const vx = road.vertexes || [];
            for (let i = 0; i < vx.length - 1; i += 2)
              pts.push({ lat: vx[i+1], lng: vx[i] });
          }
        return pts.length ? pts : seg.map(s=>({lat:s.lat,lng:s.lng}));
      } catch {
        return seg.map(s=>({lat:s.lat,lng:s.lng}));
      }
    }));
    for (const pts of results) {
      if (polyline.length && pts.length) pts.shift();
      polyline = polyline.concat(pts);
    }
  }
  return polyline;
}

async function getRoadPolyline(route) {
  if (!STATE.roadPolylineCache) STATE.roadPolylineCache = new Map();
  const key = route['번호'] + '_' + route['기점'];
  if (STATE.roadPolylineCache.has(key)) return STATE.roadPolylineCache.get(key);
  const stops = getRouteCoords(route).filter(c => c.lat && c.lng);
  if (stops.length < 2) return stops;
  const road = await fetchRoadPolyline(stops);
  STATE.roadPolylineCache.set(key, road);
  return road;
}

async function upgradeToRoadPolyline(mapObj, holder, route, color, onDone) {
  try {
    const road = await getRoadPolyline(route);
    if (!mapObj || !road.length) return;
    if (holder.obj) { holder.obj.setMap(null); holder.obj = null; }
    holder.obj = new kakao.maps.Polyline({
      map: mapObj,
      path: road.map(p => new kakao.maps.LatLng(p.lat, p.lng)),
      strokeWeight: 4, strokeColor: color, strokeOpacity: 0.9, strokeStyle: 'solid',
    });
    if (onDone) onDone(road);
  } catch(e) {
    console.warn('도로 polyline 로드 실패, 직선 유지:', e);
  }
}

// ==================== 홈 지도 ====================
// [모바일 height 수정]
// map-home 컨테이너가 flex:1 부모 안에서 height:100%로 선언되어 있는데
// iOS Safari / Android WebView는 부모에 명시적 height가 없으면 0으로 계산함.
// → 지도 초기화 전에 부모의 실제 계산 높이를 읽어 map-home에 px로 직접 지정.

function _fixMapHeight(el) {
  const parent = el.parentElement;
  if (!parent) return;
  // 부모의 실제 렌더링 높이 (getBoundingClientRect가 가장 정확)
  const h = parent.getBoundingClientRect().height;
  if (h > 0) {
    el.style.height = h + 'px';
  } else {
    // 레이아웃이 아직 안 됐으면 잠시 후 재시도
    setTimeout(() => _fixMapHeight(el), 100);
  }
}

function _initHomeMap() {
  const el = document.getElementById('map-home');
  if (!el) return;

  // 모바일 height 보정 (핵심 수정)
  _fixMapHeight(el);

  STATE.mapHome = new kakao.maps.Map(el, {
    center: new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng),
    level: 8,
  });
  STATE.mapHome.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  // 화면 크기 변화(회전 등) 시 지도 재조정
  window.addEventListener('resize', () => {
    _fixMapHeight(el);
    if (STATE.mapHome) STATE.mapHome.relayout();
  });

  let stopOverlays = [], lastLevel = 8;
  const showStopDots = () => {
    stopOverlays.forEach(o => o.setMap(null)); stopOverlays = [];
    const bounds = STATE.mapHome.getBounds();
    STOPS.filter(s =>
      s.lat >= bounds.getSouthWest().getLat() && s.lat <= bounds.getNorthEast().getLat() &&
      s.lng >= bounds.getSouthWest().getLng() && s.lng <= bounds.getNorthEast().getLng()
    ).slice(0, 200).forEach(s => {
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
      ov.setMap(STATE.mapHome); stopOverlays.push(ov);
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
  setTimeout(() => {
    if (!STATE.myMarker) updateMyMarker(STATE.mapHome, new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng));
  }, 3000);
}

// 외부에서 호출하는 별칭 유지 (ui.js의 relayout 호출 대응)
function initHomeMap() { _initHomeMap(); }

// ==================== 마커 ====================

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

function updateHomeMarkers() {
  if (!STATE.mapHome) return;
  if (STATE.homeFromMarker) { STATE.homeFromMarker.setMap(null); STATE.homeFromMarker = null; }
  if (STATE.homeToMarker)   { STATE.homeToMarker.setMap(null);   STATE.homeToMarker = null; }
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

  STATE.detailMarkers.forEach(m => m.setMap(null)); STATE.detailMarkers = [];
  if (STATE.detailPolyline)  { STATE.detailPolyline.setMap(null);  STATE.detailPolyline  = null; }
  if (STATE.detailPolyline2) { STATE.detailPolyline2.setMap(null); STATE.detailPolyline2 = null; }

  const color     = getZoneColor(result.route);
  const allCoords = getRouteCoords(result.route).filter(c => c.lat);
  const fr = STATE.search.from?.isGps
    ? { lat: STATE.myLocation.lat, lng: STATE.myLocation.lng }
    : (STATE.search.from || {});
  const to = STATE.search.to || {};

  let segCoords = allCoords;
  if (fr.lat && to.lat && allCoords.length) {
    let fiI=0, fiD=9e9, tiI=allCoords.length-1, tiD=9e9;
    allCoords.forEach((c,i)=>{
      const df=distM(c.lat,c.lng,fr.lat,fr.lng);
      const dt=distM(c.lat,c.lng,to.lat,to.lng);
      if(df<fiD){fiD=df;fiI=i;} if(dt<tiD){tiD=dt;tiI=i;}
    });
    if(fiI>tiI)[fiI,tiI]=[tiI,fiI];
    segCoords=allCoords.slice(fiI,tiI+1);
  }

  const myLat=STATE.myLocation.lat, myLng=STATE.myLocation.lng;
  const myI=findNearestIdx(segCoords,myLat,myLng);
  const detailHolder={obj:null}, detail2Holder={obj:null};

  if (segCoords.length >= 2) {
    if (myI > 0) {
      const pastPath=segCoords.slice(0,myI+1).map(c=>new kakao.maps.LatLng(c.lat,c.lng));
      new kakao.maps.Polyline({map:STATE.mapDetail,path:pastPath,strokeWeight:4,strokeColor:color,strokeOpacity:0.25,strokeStyle:'solid'});
    }
    const futurePath=segCoords.slice(myI).map(c=>new kakao.maps.LatLng(c.lat,c.lng));
    detailHolder.obj=new kakao.maps.Polyline({map:STATE.mapDetail,path:futurePath,strokeWeight:4,strokeColor:color,strokeOpacity:0.9,strokeStyle:'solid'});
    STATE.detailPolyline=detailHolder.obj;
    upgradeToRoadPolyline(STATE.mapDetail,detailHolder,result.route,color,()=>{STATE.detailPolyline=detailHolder.obj;});
  }

  if (result.type === 'transfer') {
    const c2=getRouteCoords(result.route2).filter(c=>c.lat);
    const color2=getZoneColor(result.route2);
    if (c2.length >= 2) {
      detail2Holder.obj=new kakao.maps.Polyline({map:STATE.mapDetail,path:c2.map(c=>new kakao.maps.LatLng(c.lat,c.lng)),strokeWeight:4,strokeColor:color2,strokeOpacity:0.85,strokeStyle:'solid'});
      STATE.detailPolyline2=detail2Holder.obj;
      upgradeToRoadPolyline(STATE.mapDetail,detail2Holder,result.route2,color2,()=>{STATE.detailPolyline2=detail2Holder.obj;});
    }
  }

  segCoords.forEach((c,i)=>{
    if(!c.lat||i===0||i===segCoords.length-1) return;
    const dot=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(c.lat,c.lng),content:`<div style="width:6px;height:6px;background:${color};border:1.5px solid #fff;border-radius:50%"></div>`,yAnchor:0.5,zIndex:3});
    dot.setMap(STATE.mapDetail); STATE.detailMarkers.push(dot);
  });

  updateMyMarker(STATE.mapDetail, new kakao.maps.LatLng(myLat,myLng));
  if(fr.lat){const p=makeLocationPin(fr.lat,fr.lng,'#185FA5');p.setMap(STATE.mapDetail);STATE.detailMarkers.push(p);}
  if(to.lat){const p=makeLocationPin(to.lat,to.lng,'#E24B4A');p.setMap(STATE.mapDetail);STATE.detailMarkers.push(p);}

  const bounds=new kakao.maps.LatLngBounds();
  if(fr.lat) bounds.extend(new kakao.maps.LatLng(fr.lat,fr.lng));
  if(to.lat) bounds.extend(new kakao.maps.LatLng(to.lat,to.lng));
  if(fr.lat||to.lat) STATE.mapDetail.setBounds(bounds,80);
}

// ==================== 노선도 지도 ====================

function initRoutesMap() {
  const el = document.getElementById('map-routes');
  if (!el) return;
  if (typeof kakao === 'undefined' || !kakao.maps) { setTimeout(initRoutesMap,300); return; }
  kakao.maps.load(() => {
    if (STATE.mapRoutes) return;
    STATE.mapRoutes = new kakao.maps.Map(el, {
      center: new kakao.maps.LatLng(36.0758, 126.6908), level: 10,
    });
    if (STATE.selectedRoute) showRouteOnMap(STATE.selectedRoute, STATE.timetableSearchStop||null);
  });
}

function showRouteOnMap(route, searchStop) {
  if (!STATE.mapRoutes) return;
  STATE.routeMarkers.forEach(m=>m.setMap(null)); STATE.routeMarkers=[];
  if(STATE.routePolyline){STATE.routePolyline.setMap(null);STATE.routePolyline=null;}
  if(STATE.searchStopMarker){STATE.searchStopMarker.setMap(null);STATE.searchStopMarker=null;}

  const color=getZoneColor(route);
  const coords=getRouteCoords(route).filter(c=>c.lat);
  if(coords.length<2) return;

  const holder={obj:null};
  holder.obj=new kakao.maps.Polyline({map:STATE.mapRoutes,path:coords.map(c=>new kakao.maps.LatLng(c.lat,c.lng)),strokeWeight:4,strokeColor:color,strokeOpacity:0.9,strokeStyle:'solid'});
  STATE.routePolyline=holder.obj;
  upgradeToRoadPolyline(STATE.mapRoutes,holder,route,color,(road)=>{
    STATE.routePolyline=holder.obj;
    _drawDirectionArrows(STATE.mapRoutes,road,color);
  });
  _drawDirectionArrows(STATE.mapRoutes,coords,color);

  coords.forEach((c,i)=>{
    if(i===0||i===coords.length-1) return;
    const dot=new kakao.maps.CustomOverlay({position:new kakao.maps.LatLng(c.lat,c.lng),content:`<div style="width:5px;height:5px;background:${color};border:1.5px solid #fff;border-radius:50%"></div>`,yAnchor:0.5,zIndex:2});
    dot.setMap(STATE.mapRoutes); STATE.routeMarkers.push(dot);
  });

  const sp=makeLocationPin(coords[0].lat,coords[0].lng,'#185FA5');
  sp.setMap(STATE.mapRoutes); STATE.routeMarkers.push(sp);
  const ep=makeLocationPin(coords[coords.length-1].lat,coords[coords.length-1].lng,'#E24B4A');
  ep.setMap(STATE.mapRoutes); STATE.routeMarkers.push(ep);

  if(searchStop?.lat&&searchStop?.lng){
    const disp=searchStop.displayName||searchStop.name;
    STATE.searchStopMarker=new kakao.maps.CustomOverlay({
      position:new kakao.maps.LatLng(searchStop.lat,searchStop.lng),
      content:`<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none">
        <div style="background:#EF9F27;color:#fff;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)">${disp}</div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #EF9F27;margin-top:-1px"></div>
        <div style="width:10px;height:10px;background:#EF9F27;border:2.5px solid #fff;border-radius:50%;margin-top:-1px;box-shadow:0 1px 4px rgba(0,0,0,.2)"></div>
      </div>`,
      yAnchor:1.15, zIndex:10,
    });
    STATE.searchStopMarker.setMap(STATE.mapRoutes);
  }

  const bounds=new kakao.maps.LatLngBounds();
  coords.forEach(c=>bounds.extend(new kakao.maps.LatLng(c.lat,c.lng)));
  STATE.mapRoutes.setBounds(bounds,60);
}

function _drawDirectionArrows(mapObj, coordArr, color) {
  if(!STATE._arrowMarkers) STATE._arrowMarkers=[];
  STATE._arrowMarkers.forEach(m=>m.setMap(null)); STATE._arrowMarkers=[];
  const total=coordArr.length;
  [0.2,0.4,0.6,0.8].forEach(ratio=>{
    const idx=Math.floor(total*ratio);
    if(idx<=0||idx>=total-1) return;
    const a=coordArr[idx-1],b=coordArr[idx+1];
    if(!a||!b) return;
    const angle=Math.atan2(b.lat-a.lat,b.lng-a.lng);
    const size=0.0003;
    const tip={lat:coordArr[idx].lat+Math.sin(angle)*size,    lng:coordArr[idx].lng+Math.cos(angle)*size};
    const bl ={lat:coordArr[idx].lat-Math.sin(angle+Math.PI/2)*size*0.6, lng:coordArr[idx].lng-Math.cos(angle+Math.PI/2)*size*0.6};
    const br ={lat:coordArr[idx].lat+Math.sin(angle+Math.PI/2)*size*0.6, lng:coordArr[idx].lng+Math.cos(angle+Math.PI/2)*size*0.6};
    const tri=new kakao.maps.Polygon({
      map:mapObj,
      path:[new kakao.maps.LatLng(tip.lat,tip.lng),new kakao.maps.LatLng(bl.lat,bl.lng),new kakao.maps.LatLng(br.lat,br.lng)],
      fillColor:color,fillOpacity:0.9,strokeColor:color,strokeOpacity:0,strokeWeight:0,
    });
    STATE._arrowMarkers.push(tri); STATE.routeMarkers.push(tri);
  });
}

function clearRouteMap() {
  STATE.routeMarkers.forEach(m=>m.setMap(null)); STATE.routeMarkers=[];
  if(STATE._arrowMarkers){STATE._arrowMarkers.forEach(m=>m.setMap(null));STATE._arrowMarkers=[];}
  if(STATE.routePolyline){STATE.routePolyline.setMap(null);STATE.routePolyline=null;}
  if(STATE.mapRoutes) STATE.mapRoutes.setLevel(10);
}
