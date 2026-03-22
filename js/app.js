'use strict';

// ==================== 데이터 ====================
let ROUTES = [];
let STOPS = [];
let ROUTE_COORDS = new Map(); // 노선별 경유지 좌표 캐시
let mapHome = null, mapDetail = null, mapRoutes = null;
let currentScreen = 'home';
let searchState = { from: null, to: null, via: null, time: null, timeMode: 'now' };
let myLocation = { lat: 36.0758, lng: 126.6908 }; // 서천 기본값
let favorites = JSON.parse(localStorage.getItem('seocheon_favorites') || '[]');
let savedPlaces = JSON.parse(localStorage.getItem('seocheon_places') || '[]');
let searchHistory = JSON.parse(localStorage.getItem('seocheon_history') || '[]');
let placeSearchTarget = 'to';
let selectedZone = 'all';
let detailRoute = null;

// 권역 설정
const ZONES = [
  { id: 'all',    name: '전체',    color: '#1D9E75', keywords: [] },
  { id: 'jang',   name: '장항권',  color: '#185FA5', keywords: ['장항'] },
  { id: 'dong',   name: '동백·서면', color: '#E24B4A', keywords: ['동백', '서면'] },
  { id: 'han',    name: '한산권',  color: '#EF9F27', keywords: ['한산'] },
  { id: 'pan',    name: '판교권',  color: '#7F77DD', keywords: ['판교'] },
  { id: 'ma',     name: '마서권',  color: '#3B6D11', keywords: ['마서', '기산', '종천'] },
];

// 고속·기차 허브
const HUBS = [
  {
    id: 'seocheon-terminal', name: '서천터미널', type: 'bus',
    lat: 36.0758, lng: 126.6908,
    destinations: [
      { name: '서울(센트럴)', duration: '약 2시간', times: ['09:00','11:00','13:00','15:00','17:30','19:10'], lastReturn: '서울 → 서천 21:30' },
      { name: '대전(복합)', duration: '약 1시간', times: ['08:10','10:30','12:50','14:50','16:20','18:40','20:10'], lastReturn: '대전 → 서천 21:00' },
      { name: '광주(유스퀘어)', duration: '약 2시간 30분', times: ['09:20','12:40','15:30','18:00'], lastReturn: '광주 → 서천 19:30' },
    ],
    bookUrl: 'https://www.kobus.co.kr',
    bookLabel: '코버스 예매 바로가기'
  },
  {
    id: 'seocheon-station', name: '서천역', type: 'train',
    lat: 36.0680, lng: 126.6850,
    direction: true,
    upward: [
      { name: '서울(용산)', duration: '약 2시간 10분', times: ['06:42','09:18','12:05','14:22','16:48','19:05','21:30'], lastReturn: '서울 → 서천 22:10' },
      { name: '대전', duration: '약 45분', times: ['07:10','09:50','12:30','15:10','17:40','20:20'], lastReturn: '대전 → 서천 22:00' },
    ],
    downward: [
      { name: '익산', duration: '약 30분', times: ['07:55','10:35','13:15','15:55','18:25','21:05'], lastReturn: '익산 → 서천 22:30' },
      { name: '군산', duration: '약 50분', times: ['08:10','10:50','13:30','16:10','18:40','21:20'], lastReturn: '군산 → 서천 22:45' },
    ],
    bookUrl: 'https://www.letskorail.com',
    bookLabel: '코레일 예매 바로가기'
  },
  {
    id: 'janghang-terminal', name: '장항터미널', type: 'bus',
    lat: 36.0000, lng: 126.6800,
    destinations: [
      { name: '서울(센트럴)', duration: '약 2시간 20분', times: ['08:30','11:20','14:00','16:30','18:50','20:20'], lastReturn: '서울 → 장항 21:00' },
      { name: '대전(복합)', duration: '약 1시간 10분', times: ['08:00','11:00','14:00','16:40','19:00'], lastReturn: '대전 → 장항 20:30' },
    ],
    bookUrl: 'https://www.kobus.co.kr',
    bookLabel: '코버스 예매 바로가기'
  },
  {
    id: 'janghang-station', name: '장항역', type: 'train',
    lat: 36.0020, lng: 126.6820,
    direction: true,
    upward: [
      { name: '서울(용산)', duration: '약 2시간 20분', times: ['06:55','09:30','12:18','14:35','17:02','19:20','21:48'], lastReturn: '서울 → 장항 21:55' },
      { name: '대전', duration: '약 50분', times: ['07:20','10:00','12:40','15:20','17:50','20:30'], lastReturn: '대전 → 장항 21:50' },
    ],
    downward: [
      { name: '익산', duration: '약 25분', times: ['08:05','10:45','13:25','16:05','18:35','21:15'], lastReturn: '익산 → 장항 22:35' },
      { name: '군산', duration: '약 45분', times: ['08:20','11:00','13:40','16:20','18:50','21:30'], lastReturn: '군산 → 장항 22:50' },
    ],
    bookUrl: 'https://www.letskorail.com',
    bookLabel: '코레일 예매 바로가기'
  },
];

// ==================== 초기화 ====================
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initLocation();
  initZoneTabs();
  initHubGrid();
  initFavorites();
  loadKakaoMap();

  // 초기 history 상태 설정
  // PWA standalone 모드 대응: stack에 최소 2개 유지해야 popstate 발생
  history.replaceState({ screen: 'home' }, '', '');
  history.pushState({ screen: 'home_guard' }, '', '');

  // 폰 뒤로가기 - 각 화면의 ‹ 버튼과 동일한 로직
  window.addEventListener('popstate', (e) => {
    console.log('[뒤로가기] popstate 발생 / currentScreen:', currentScreen, '/ e.state:', JSON.stringify(e.state));
    switch (currentScreen) {
      case 'detail':
        // detail 화면엔 back-btn 없음 → result로
        showScreenNoHistory('result');
        history.pushState({ screen: 'result' }, '', '');
        break;
      case 'routes':
        // routes 화면 ‹ = routesBack()
        if (_timetableReturnScreen) {
          const target = _timetableReturnScreen;
          _timetableReturnScreen = null;
          showScreenNoHistory(target);
          history.pushState({ screen: target }, '', '');
        } else {
          showScreenNoHistory('home');
          history.replaceState({ screen: 'home' }, '', '');
        }
        break;
      case 'transport':
        // transport 상세 열려있으면 닫기, 아니면 홈
        const detail = document.getElementById('hub-detail');
        if (detail && detail.style.display !== 'none') {
          closeHubDetail();
          history.pushState({ screen: 'transport' }, '', '');
        } else {
          showScreenNoHistory('home');
          history.replaceState({ screen: 'home' }, '', '');
        }
        break;
      default:
        // result, timetable, favorites 등 → 홈
        showScreenNoHistory('home');
        history.replaceState({ screen: 'home' }, '', '');
        break;
    }
  });
});

async function loadData() {
  try {
    const res = await fetch('data/routes_fixed.json');
    const all = await res.json();
    const SEOCHEON_HUBS = ['서천','장항','한산','비인','판교','기산','문산','화양','마서'];
    ROUTES = all.filter(r => {
      if (!r['노선군'].includes('타시도')) return true;
      const text = r['기점'] + r['종점'] + r['경유'];
      return SEOCHEON_HUBS.some(h => text.includes(h));
    });
  } catch(e) {
    console.warn('routes.json 로드 실패');
  }
  try {
    const res = await fetch('data/stops.json');
    const raw = await res.json();
    STOPS = buildDisplayNames(raw);
    buildRouteCoords(); // 경유지 좌표 사전 구축
  } catch(e) {
    console.warn('stops.json 로드 실패');
  }
}

// 경유지 이름 → 좌표 사전 구축 (앱 로드 시 1회)
function buildRouteCoords() {
  // stops에서 이름 키워드로 빠르게 찾는 인덱스 생성
  const stopIndex = new Map();
  STOPS.forEach(s => {
    // 2글자 이상 키워드별로 인덱싱
    const keys = s.name.replace(/[().·]/g,' ').split(/[\s,]+/).filter(k => k.length >= 2);
    keys.forEach(k => {
      if (!stopIndex.has(k)) stopIndex.set(k, []);
      stopIndex.get(k).push(s);
    });
  });

  function findCoordByName(name) {
    const clean = name.replace(/[()↔→]/g,' ').trim();
    const keys = clean.split(/[\s.·]+/).filter(k => k.length >= 2);

    let best = null, bestScore = 0;
    for (const key of keys) {
      const candidates = stopIndex.get(key) || [];
      for (const s of candidates) {
        const score = key.length / Math.max(clean.length, s.name.length);
        if (score > bestScore) { bestScore = score; best = s; }
      }
    }

    // 키워드 매칭 보완: 정류장 이름에 경유지명이 포함되거나 경유지명이 정류장명에 포함
    // 예: 경유지 "연봉" → "연봉입구.갈숲마을" 매칭
    STOPS.forEach(s => {
      if (s.name.includes(clean) && clean.length >= 2) {
        // 정류장명에 경유지명이 포함: 점수 높게
        const score = clean.length / s.name.length + 0.2;
        if (score > bestScore) { bestScore = score; best = s; }
      }
    });
    return best;
  }

  ROUTES.forEach(route => {
    const via = route['경유'] || '';
    const names = [route['기점']];
    via.replace(/[()]/g,'').split(/[→↔,]/).forEach(s => { const t = s.trim(); if (t) names.push(t); });
    names.push(route['종점']);

    const coords = names.map(name => {
      const found = findCoordByName(name);
      return found ? { name, lat: found.lat, lng: found.lng } : { name, lat: null, lng: null };
    });

    // 좌표 없는 정류장은 앞뒤 정류장 좌표로 보간
    for (let i = 0; i < coords.length; i++) {
      if (!coords[i].lat) {
        const prev = coords.slice(0, i).reverse().find(c => c.lat);
        const next = coords.slice(i+1).find(c => c.lat);
        if (prev && next) {
          coords[i].lat = (prev.lat + next.lat) / 2;
          coords[i].lng = (prev.lng + next.lng) / 2;
        } else if (prev) {
          coords[i].lat = prev.lat; coords[i].lng = prev.lng;
        } else if (next) {
          coords[i].lat = next.lat; coords[i].lng = next.lng;
        }
      }
    }

    ROUTE_COORDS.set(route['번호'] + '_' + route['기점'], coords);
  });

  console.log(`경유지 좌표 사전 구축 완료: ${ROUTE_COORDS.size}개 노선`);
}

// 원본 데이터를 수정하지 않고 메모리에서 displayName 계산
function buildDisplayNames(stops) {
  const CENTERS = {
    '서천읍': [36.0758, 126.6908],
    '장항읍': [36.0197, 126.6996],
    '한산면': [36.1132, 126.7803],
    '판교면': [36.1489, 126.8303],
    '마서면': [36.0631, 126.7074],
    '비인면': [36.0170, 126.5923],
    '서면':   [36.0380, 126.5761],
    '종천면': [36.0897, 126.6433],
    '기산면': [36.1053, 126.7442],
    '문산면': [36.0542, 126.8108],
    '화양면': [36.0925, 126.8492],
    '시초면': [36.1308, 126.7197],
  };
  const SEOCHEON = [36.0758, 126.6908];

  function dist(a, b) {
    return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2);
  }
  function nearestRegion(lat, lng) {
    let best = '서천읍', bestD = 999;
    for (const [name, c] of Object.entries(CENTERS)) {
      const d = dist([lat, lng], c);
      if (d < bestD) { bestD = d; best = name; }
    }
    return best;
  }

  // 이름별 그룹
  const groups = {};
  stops.forEach((s, i) => {
    if (!groups[s.name]) groups[s.name] = [];
    groups[s.name].push(i);
  });

  // 원본 복사 후 displayName 추가
  const result = stops.map(s => ({ ...s }));

  for (const [name, idxs] of Object.entries(groups)) {
    if (idxs.length < 2) continue;
    const group = idxs.map(i => stops[i]);
    const regions = group.map(s => nearestRegion(s.lat, s.lng));

    if (new Set(regions).size > 1) {
      // 읍면이 다른 경우: (서천읍), (한산면) 등
      idxs.forEach((idx, j) => {
        result[idx].displayName = `${name}(${regions[j]})`;
      });
    } else {
      // 같은 읍면 내 양방향: 서천읍 중심 기준 내향/외향
      const dists = group.map(s => dist([s.lat, s.lng], SEOCHEON));
      const sorted = [...idxs].sort((a, b) =>
        dists[idxs.indexOf(a)] - dists[idxs.indexOf(b)]
      );
      result[sorted[0]].displayName = `${name}(서천읍 방향)`;
      result[sorted[1]].displayName = name; // 외향은 그냥 원래 이름
      // 3개 이상이면 번호 부여
      for (let k = 2; k < sorted.length; k++) {
        result[sorted[k]].displayName = `${name}(${k+1})`;
      }
    }
  }

  return result;
}

function loadKakaoMap() {
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    setTimeout(loadKakaoMap, 500);
    return;
  }
  kakao.maps.load(() => {
    initHomeMap();
  });
}

// ==================== 위치 ====================
let myMarkerOverlay = null; // 내 위치 마커 전역 관리
let gpsReady = false; // GPS 확인 여부

function initLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        gpsReady = true;
        if (mapHome) {
          const latlng = new kakao.maps.LatLng(myLocation.lat, myLocation.lng);
          mapHome.setCenter(latlng);
          updateMyMarker(mapHome, latlng);
        }
        // 서천 외 지역 안내
        if (!isInSeocheon(myLocation.lat, myLocation.lng)) {
          showOutOfAreaNotice();
        }
      },
      () => { /* GPS 실패 시 기본값(서천) 유지 */ }
    );
  }
}

function showOutOfAreaNotice() {
  // 기존 안내가 있으면 제거
  const existing = document.getElementById('out-of-area-notice');
  if (existing) existing.remove();

  const notice = document.createElement('div');
  notice.id = 'out-of-area-notice';
  notice.style.cssText = `
    position:absolute; top:12px; left:50%; transform:translateX(-50%);
    background:rgba(30,30,30,0.82); color:#fff;
    border-radius:20px; padding:6px 14px;
    font-size:12px; font-weight:600; white-space:nowrap;
    z-index:100; pointer-events:none;
    box-shadow:0 2px 8px rgba(0,0,0,0.3);
  `;
  notice.textContent = '📍 현재 서천 지역이 아닙니다';
  document.getElementById('screen-home')?.appendChild(notice);
}

// ==================== 홈 지도 ====================
function initHomeMap() {
  const container = document.getElementById('map-home');
  if (!container) return;
  mapHome = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(myLocation.lat, myLocation.lng),
    level: 8
  });
  mapHome.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);
  // GPS 결과가 오기 전에는 마커 표시 안 함 (GPS 성공 시 initLocation에서 찍힘)
  // GPS 실패 대비 3초 후에도 마커 없으면 기본값으로 찍기
  setTimeout(() => {
    if (!myMarkerOverlay) {
      updateMyMarker(mapHome, new kakao.maps.LatLng(myLocation.lat, myLocation.lng));
    }
  }, 3000);

  // 확대 시 정류장 표시 (레벨 7 이하)
  let stopOverlays = [];
  let lastLevel = 8;

  kakao.maps.event.addListener(mapHome, 'zoom_changed', () => {
    const level = mapHome.getLevel();
    if (level <= 6 && lastLevel > 6) {
      // 현재 지도 범위 내 정류장만 표시
      showNearbyStops();
    } else if (level > 6 && stopOverlays.length > 0) {
      stopOverlays.forEach(o => o.setMap(null));
      stopOverlays = [];
    }
    lastLevel = level;
  });

  function showNearbyStops() {
    stopOverlays.forEach(o => o.setMap(null));
    stopOverlays = [];
    const bounds = mapHome.getBounds();
    const visible = STOPS.filter(s =>
      s.lat >= bounds.getSouthWest().getLat() &&
      s.lat <= bounds.getNorthEast().getLat() &&
      s.lng >= bounds.getSouthWest().getLng() &&
      s.lng <= bounds.getNorthEast().getLng()
    ).slice(0, 150);

    visible.forEach(s => {
      const display = s.displayName || s.name;
      const overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(s.lat, s.lng),
        content: `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer" onclick="selectPlace('to',{name:'${s.name.replace(/'/g,"\\'")}',displayName:'${display.replace(/'/g,"\\'")}',lat:${s.lat},lng:${s.lng}})">
          <div style="background:#fff;border:1.5px solid #1D9E75;border-radius:4px;padding:1px 5px;font-size:10px;color:#1D9E75;font-weight:600;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.15)">${display}</div>
          <div style="width:8px;height:8px;background:#1D9E75;border:2px solid #fff;border-radius:50%;margin-top:2px;box-shadow:0 1px 2px rgba(0,0,0,.2)"></div>
        </div>`,
        yAnchor: 1.3,
        zIndex: 3
      });
      overlay.setMap(mapHome);
      stopOverlays.push(overlay);
    });
  }

  // 이동 후에도 재렌더
  kakao.maps.event.addListener(mapHome, 'dragend', () => {
    if (mapHome.getLevel() <= 6) showNearbyStops();
  });
}

function updateMyMarker(map, latlng) {
  // 기존 내 위치 마커 제거
  if (myMarkerOverlay) {
    myMarkerOverlay.setMap(null);
    myMarkerOverlay = null;
  }
  // 일반적인 위치 핀 아이콘 (파란 원 + 흰 점)
  const content = `<div style="display:flex;flex-direction:column;align-items:center">
    <div style="width:22px;height:22px;background:#185FA5;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(24,95,165,0.5);display:flex;align-items:center;justify-content:center">
      <div style="width:6px;height:6px;background:#fff;border-radius:50%"></div>
    </div>
    <div style="width:2px;height:6px;background:#185FA5;opacity:0.6"></div>
    <div style="width:4px;height:4px;background:#185FA5;border-radius:50%;opacity:0.3"></div>
  </div>`;
  myMarkerOverlay = new kakao.maps.CustomOverlay({
    position: latlng,
    content,
    yAnchor: 1.0,
    zIndex: 10
  });
  myMarkerOverlay.setMap(map);
}

// 하위 호환용 (혹시 다른 곳에서 호출하는 경우 대비)
function addMyMarker(map, latlng) {
  updateMyMarker(map, latlng);
}

function goToMyLocation() {
  if (mapHome) {
    const latlng = new kakao.maps.LatLng(myLocation.lat, myLocation.lng);
    mapHome.panTo(latlng);
  }
}

// ==================== 화면 전환 ====================
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

  const screen = document.getElementById('screen-' + name);
  if (screen) {
    screen.style.display = 'flex';
    screen.classList.add('active');
  }
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');

  currentScreen = name;

  if (name === 'routes' && !mapRoutes) {
    setTimeout(() => initRoutesMap(), 100);
  }
  if (name === 'transport') initTransport();
  if (name === 'favorites') renderFavorites();

  // 홈이 아닌 화면으로 이동 시 history에 추가
  if (name !== 'home') {
    history.pushState({ screen: name }, '', '');
  } else {
    history.replaceState({ screen: 'home' }, '', '');
  }
}

// history 조작 없이 화면만 전환 (popstate 핸들러에서 사용)
function showScreenNoHistory(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const screen = document.getElementById('screen-' + name);
  if (screen) { screen.style.display = 'flex'; screen.classList.add('active'); }
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');
  currentScreen = name;
  if (name === 'routes' && !mapRoutes) setTimeout(() => initRoutesMap(), 100);
  if (name === 'favorites') renderFavorites();
}

// ==================== 경유지 토글 ====================
function toggleVia() {
  const viaRow = document.getElementById('via-row');
  const addBtn = document.getElementById('add-via-btn');
  if (viaRow.style.display === 'none') {
    viaRow.style.display = 'flex';
    addBtn.textContent = '− 경유지 제거';
    addBtn.style.color = '#E24B4A';
  } else {
    viaRow.style.display = 'none';
    addBtn.textContent = '+ 경유지 추가';
    addBtn.style.color = 'var(--green)';
    searchState.via = null;
    document.getElementById('text-via').textContent = '경유지 입력';
  }
}

// ==================== 장소 검색 모달 ====================
function openPlaceSearch(target) {
  placeSearchTarget = target;
  const titles = { from: '출발지 선택', via: '경유지 선택', to: '도착지 선택' };
  document.getElementById('modal-title').textContent = titles[target] || '장소 선택';
  document.getElementById('place-input').value = '';
  document.getElementById('modal-results').innerHTML = '';
  renderModalSaved(target);
  document.getElementById('place-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('place-input').focus(), 300);
}

function closePlaceModal() {
  document.getElementById('place-modal').style.display = 'none';
}

function renderModalSaved(target) {
  const container = document.getElementById('modal-saved');
  let html = '';

  // 현위치 옵션 (출발지만, GPS 확인된 경우에만 표시)
  if (target === 'from' && gpsReady) {
    html += `<div class="modal-section-label">빠른 선택</div>`;
    html += `<div class="modal-item" onclick="selectPlace('from', {name:'현위치', lat:${myLocation.lat}, lng:${myLocation.lng}, isGps:true})">
      <div class="modal-item-icon" style="background:#E6F1FB">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="4" fill="#2979FF"/><circle cx="7" cy="7" r="2" fill="#fff"/></svg>
      </div>
      <div><div class="modal-item-name">현위치</div><div class="modal-item-sub">GPS 자동 감지</div></div>
    </div>`;
  }

  // 저장 장소
  if (savedPlaces.length > 0) {
    html += `<div class="modal-section-label">저장된 장소</div>`;
    savedPlaces.forEach(p => {
      html += `<div class="modal-item" onclick="selectPlace('${target}', ${JSON.stringify(p).replace(/"/g,'&quot;')})">
        <div class="modal-item-icon" style="background:${p.type==='home'?'#E6F1FB':'#FFF3E0'}">
          ${p.type === 'home'
            ? '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l5-5 5 5" stroke="#185FA5" stroke-width="1.3"/><rect x="4" y="8" width="6" height="5" rx=".5" stroke="#185FA5" stroke-width="1.1"/></svg>'
            : '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="5" width="10" height="8" rx="1" stroke="#E65100" stroke-width="1.1"/><path d="M5 5V3.5a2 2 0 014 0V5" stroke="#E65100" stroke-width="1.1"/></svg>'}
        </div>
        <div><div class="modal-item-name">${p.label}</div><div class="modal-item-sub">${p.name}</div></div>
      </div>`;
    });
  }

  // 최근 검색
  if (searchHistory.length > 0) {
    html += `<div class="modal-section-label">최근 검색</div>`;
    searchHistory.slice(0, 5).forEach(p => {
      html += `<div class="modal-item" onclick="selectPlace('${target}', ${JSON.stringify(p).replace(/"/g,'&quot;')})">
        <div class="modal-item-icon" style="background:#f5f5f5">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="#888" stroke-width="1.1"/><path d="M7 4v3l2 2" stroke="#888" stroke-width="1.1" stroke-linecap="round"/></svg>
        </div>
        <div><div class="modal-item-name">${p.name}</div></div>
      </div>`;
    });
  }

  container.innerHTML = html;
}

function onPlaceInput(val) {
  const container = document.getElementById('modal-results');
  if (!val.trim()) { container.innerHTML = ''; return; }

  // 1차: 정류장명 직접 매칭
  let results = STOPS.filter(s => s.name.includes(val.trim())).slice(0, 20);

  // 2차: 직접 매칭 없으면 카카오 로컬 API로 지명 검색 → 가장 가까운 정류장
  if (results.length === 0) {
    container.innerHTML = '<div class="loading">정류장을 찾는 중...</div>';
    searchPlaceAndFindNearestStop(val.trim(), container);
    return;
  }

  renderStopResults(results, container);
}

function searchPlaceAndFindNearestStop(keyword, container) {
  if (typeof kakao === 'undefined') return;
  const ps = new kakao.maps.services.Places();
  ps.keywordSearch(keyword + ' 서천', (data, status) => {
    if (status !== kakao.maps.services.Status.OK || data.length === 0) {
      container.innerHTML = '<div class="loading">검색 결과가 없습니다</div>';
      return;
    }
    // 검색된 장소 좌표 기준으로 가장 가까운 정류장 찾기
    const place = data[0];
    const pLat = parseFloat(place.y);
    const pLng = parseFloat(place.x);

    const nearest = STOPS.map(s => ({
      ...s,
      dist: Math.sqrt((s.lat - pLat) ** 2 + (s.lng - pLng) ** 2)
    })).sort((a, b) => a.dist - b.dist).slice(0, 5);

    container.innerHTML = `<div class="modal-section-label">
      "${place.place_name}" 인근 정류장
    </div>` + nearest.map(s => {
      const display = s.displayName || s.name;
      const distM = Math.round(s.dist * 111000);
      return `<div class="modal-item" style="display:flex;align-items:center">
        <div style="flex:1;display:flex;align-items:center;gap:8px"
          onclick="selectPlace('${placeSearchTarget}', {name:'${s.name.replace(/'/g,"\\'")}', displayName:'${display.replace(/'/g,"\\'")}', lat:${s.lat}, lng:${s.lng}})">
          <div class="modal-item-icon" style="background:#FFF3E0">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#EF9F27"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
          </div>
          <div>
            <div class="modal-item-name">${display}</div>
            <div style="font-size:10px;color:#bbb">약 ${distM}m</div>
          </div>
        </div>
      </div>`;
    }).join('');
  });
}

function renderStopResults(results, container) {
  container.innerHTML = '<div class="modal-section-label">정류장 검색결과</div>' +
    results.map(s => {
      const display = s.displayName || s.name;
      const isDiff = display !== s.name;
      return `
    <div class="modal-item" style="display:flex;align-items:center">
      <div style="flex:1;display:flex;align-items:center;gap:8px" onclick="selectPlace('${placeSearchTarget}', {name:'${s.name.replace(/'/g,"\\'")}', displayName:'${display.replace(/'/g,"\\'")}', lat:${s.lat}, lng:${s.lng}})">
        <div class="modal-item-icon">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#1D9E75"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
        </div>
        <div>
          <div class="modal-item-name">${display}</div>
          ${isDiff ? `<div style="font-size:10px;color:#bbb">${s.name}</div>` : ''}
        </div>
      </div>
      <button onclick="savePlace({name:'${s.name.replace(/'/g,"\\'")}',displayName:'${display.replace(/'/g,"\\'")}',lat:${s.lat},lng:${s.lng}})" style="background:none;border:1px solid #ddd;border-radius:6px;padding:3px 8px;font-size:10px;color:#888;cursor:pointer;flex-shrink:0">저장</button>
    </div>`;
    }).join('');
}

function savePlace(place) {
  const label = prompt(`"${place.name}" 을 저장합니다.\n별칭을 입력하세요 (예: 집, 직장, 학교)`);
  if (!label) return;
  const newPlace = { ...place, label, type: 'saved' };
  savedPlaces = [newPlace, ...savedPlaces.filter(p => p.name !== place.name)].slice(0, 10);
  localStorage.setItem('seocheon_places', JSON.stringify(savedPlaces));
  alert(`"${label}" 로 저장됐습니다! 즐겨찾기 탭에서 확인하세요.`);
}

function selectPlace(target, place) {
  searchState[target] = place;
  const label = place.displayName || place.name;

  if (target === 'from') {
    const textEl = document.getElementById('text-from');
    const tagEl = document.getElementById('tag-from');
    textEl.textContent = label;
    textEl.classList.remove('loc-placeholder');
    if (place.isGps) { tagEl.style.display = ''; }
    else { tagEl.style.display = 'none'; }
    if (mapHome && !place.isGps) { mapHome.panTo(new kakao.maps.LatLng(place.lat, place.lng)); updateHomeMarkers(); }
  } else if (target === 'via') {
    const el = document.getElementById('text-via');
    el.textContent = label;
    el.classList.remove('loc-placeholder');
  } else if (target === 'to') {
    const el = document.getElementById('text-to');
    el.textContent = label;
    el.classList.remove('loc-placeholder');
    const btn = document.getElementById('save-star-btn');
    if (btn) { btn.textContent = '☆'; btn.style.color = ''; }
    if (mapHome) { mapHome.panTo(new kakao.maps.LatLng(place.lat, place.lng)); updateHomeMarkers(); }
  }

  // 검색 기록 저장
  if (!place.isGps) {
    searchHistory = [place, ...searchHistory.filter(h => h.name !== place.name)].slice(0, 10);
    localStorage.setItem('seocheon_history', JSON.stringify(searchHistory));
  }

  closePlaceModal();
}

let homeFromMarker = null, homeToMarker = null;
let homeFromLabel = null, homeToLabel = null;

function updateHomeMarkers() {
  if (!mapHome) return;

  if (homeFromMarker) homeFromMarker.setMap(null);
  if (homeToMarker) homeToMarker.setMap(null);
  if (homeFromLabel) homeFromLabel.setMap(null);
  if (homeToLabel) homeToLabel.setMap(null);

  const from = searchState.from;
  const to = searchState.to;

  if (from && from.lat && !from.isGps) {
    homeFromMarker = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(from.lat, from.lng),
      content: `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="background:#185FA5;color:#fff;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 5px rgba(24,95,165,0.35)">출발</div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #185FA5;margin-top:-1px"></div>
        <div style="width:8px;height:8px;background:#185FA5;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);margin-top:1px"></div>
      </div>`,
      yAnchor: 1.05, zIndex: 5
    });
    homeFromMarker.setMap(mapHome);
  }

  if (to && to.lat) {
    homeToMarker = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(to.lat, to.lng),
      content: `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="background:#E24B4A;color:#fff;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 5px rgba(226,75,74,0.35)">도착</div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #E24B4A;margin-top:-1px"></div>
        <div style="width:8px;height:8px;background:#E24B4A;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);margin-top:1px"></div>
      </div>`,
      yAnchor: 1.05, zIndex: 5
    });
    homeToMarker.setMap(mapHome);
  }

  if (from?.lat && to?.lat) {
    const bounds = new kakao.maps.LatLngBounds();
    if (!from.isGps) bounds.extend(new kakao.maps.LatLng(from.lat, from.lng));
    bounds.extend(new kakao.maps.LatLng(to.lat, to.lng));
    mapHome.setBounds(bounds, 80);
  }
}

// ==================== 시간 설정 ====================
function setTimeChip(mode) {
  document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('chip-' + mode)?.classList.add('active');
  searchState.timeMode = mode;

  const customInput = document.getElementById('custom-time');
  if (mode === 'custom') {
    customInput.style.display = 'block';
    const now = new Date();
    customInput.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    searchState.time = customInput.value;
  } else {
    customInput.style.display = 'none';
    const now = new Date();
    if (mode === '1h') now.setHours(now.getHours() + 1);
    if (mode === '2h') now.setHours(now.getHours() + 2);
    searchState.time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  }
}

function onCustomTime(val) {
  searchState.time = val;
}

function getSearchTime() {
  const now = new Date();
  if (searchState.timeMode === 'now') return now;
  if (searchState.timeMode === '1h') { const d = new Date(now); d.setHours(d.getHours()+1); return d; }
  if (searchState.timeMode === '2h') { const d = new Date(now); d.setHours(d.getHours()+2); return d; }
  if (searchState.time) {
    const [h,m] = searchState.time.split(':').map(Number);
    const d = new Date(now); d.setHours(h,m,0); return d;
  }
  return now;
}

// ==================== 경로 검색 ====================
function searchRoute() {
  if (!searchState.to) {
    alert('도착지를 선택해주세요');
    return;
  }

  const fromName = searchState.from?.name || '현위치';
  const toName = searchState.to.name;
  const searchTime = getSearchTime();
  const timeStr = `${String(searchTime.getHours()).padStart(2,'0')}:${String(searchTime.getMinutes()).padStart(2,'0')}`;
  const dayType = getDayType();

  document.getElementById('result-title').textContent = `${fromName} → ${toName}`;
  document.getElementById('result-sub').textContent = `오늘 ${timeStr} 기준`;

  const results = findRoutes(fromName, toName, searchTime, dayType);
  renderResults(results, toName, fromName, timeStr, dayType);

  showScreen('result');

  // 검색 이력 저장
  saveSearchHistory(fromName, toName);
}

function getDayType() {
  const day = new Date().getDay();
  if (day === 0 || day === 6) return day === 6 ? 'sat' : 'hol';
  return 'weekday';
}

// 두 좌표간 거리(m) 계산
function coordDist(lat1, lng1, lat2, lng2) {
  return Math.sqrt((lat1-lat2)**2 + (lng1-lng2)**2) * 111000;
}

// 노선의 좌표 배열 가져오기 (캐시 사용)
function getRouteCoords(route) {
  const key = route['번호'] + '_' + route['기점'];
  return ROUTE_COORDS.get(key) || [];
}

// 좌표 기반: 특정 좌표가 노선 경유지 중 어느 인덱스에 해당하는지 (1500m 이내)
function findCoordIdx(coords, lat, lng, thresholdM = 1500) {
  let bestIdx = -1, bestDist = thresholdM;
  coords.forEach((c, i) => {
    if (!c.lat) return;
    const d = coordDist(c.lat, c.lng, lat, lng);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  });
  return bestIdx;
}

// 노선 전체 소요시간 추정 (분)
function routeTotalMin(r) {
  return Math.round((r['거리'] || 10) * 2.5 + 5);
}

// 특정 좌표 반경 300m 이내 정류장 좌표 배열 반환 (자기 자신 포함)
function getNearbyCoords(lat, lng, radiusM = 300) {
  const candidates = STOPS.filter(s => coordDist(s.lat, s.lng, lat, lng) <= radiusM);
  if (candidates.length === 0) return [{ lat, lng }];
  return candidates.map(s => ({ lat: s.lat, lng: s.lng }));
}

// 좌표 배열 중 하나라도 노선 경유지에 걸리면 그 인덱스 반환
// destMode=true 이면 반경 500m(목적지), false면 1500m(출발지/환승지)
function findCoordIdxMulti(coords, latLngs, thresholdM = 1500) {
  let bestIdx = -1, bestDist = thresholdM;
  for (const { lat, lng } of latLngs) {
    const idx = findCoordIdx(coords, lat, lng, thresholdM);
    if (idx !== -1) {
      const d = coordDist(coords[idx].lat, coords[idx].lng, lat, lng);
      if (d < bestDist) { bestDist = d; bestIdx = idx; }
    }
  }
  return bestIdx;
}

function findRoutes(fromName, toName, searchTime, dayType) {
  const results = [];

  // 출발지 좌표 결정
  let fromLat, fromLng;
  const isGps = fromName === '현위치' || searchState.from?.isGps;

  if (isGps) {
    fromLat = myLocation.lat;
    fromLng = myLocation.lng;
  } else if (searchState.from?.lat) {
    fromLat = searchState.from.lat;
    fromLng = searchState.from.lng;
  } else {
    // 이름으로 stops에서 좌표 찾기 (fallback)
    const s = STOPS.find(s => s.name.includes(fromName.substring(0,4)));
    if (s) { fromLat = s.lat; fromLng = s.lng; }
  }

  // 도착지 좌표 결정
  let toLat, toLng;
  if (searchState.to?.lat) {
    toLat = searchState.to.lat;
    toLng = searchState.to.lng;
  } else {
    const s = STOPS.find(s => s.name.includes(toName.substring(0,4)));
    if (s) { toLat = s.lat; toLng = s.lng; }
  }

  if (!toLat) return results; // 도착지 좌표 없으면 검색 불가

  // 출발지/도착지 반경 300m 내 정류장 좌표 배열
  const toCoords   = getNearbyCoords(toLat, toLng);
  const fromCoords = (fromLat && !isGps) ? getNearbyCoords(fromLat, fromLng) : null;

  // 직행 탐색 (좌표 기반)
  ROUTES.forEach(route => {
    const coords = getRouteCoords(route);
    if (!coords.length) return;

    const toIdx = findCoordIdxMulti(coords, toCoords, 500);  // 목적지: 500m
    if (toIdx === -1) return;

    let fromIdx = -1;
    if (fromLat) {
      fromIdx = fromCoords
        ? findCoordIdxMulti(coords, fromCoords, 1500)         // 출발지: 1500m
        : findCoordIdx(coords, fromLat, fromLng);
    }

    if (!isGps && fromIdx === -1) return;
    if (fromIdx !== -1 && fromIdx >= toIdx) return;

    const nextBus = getNextBus(route, searchTime, dayType);
    if (!nextBus) return;

    // 출발지→도착지 직선거리 기반 소요시간
    const fromC = (fromIdx >= 0 && coords[fromIdx]) ? coords[fromIdx] : (fromLat ? {lat:fromLat,lng:fromLng} : null);
    const toC   = coords[toIdx];
    const segKm = (fromC?.lat && toC?.lat)
      ? coordDist(fromC.lat, fromC.lng, toC.lat, toC.lng) / 1000
      : (route['거리'] || 10);
    const segMins = Math.round(segKm * 2.5 + 3);

    results.push({
      route,
      stops: getRouteStops(route),
      coords,
      nextBus,
      transferCount: 0,
      minutes: segMins,
      distanceKm: route['거리'] || 0,
      dayType,
      isTransfer: false
    });
  });

  // ── 환승 탐색 ──────────────────────────────────────────
  // 핵심 개선: 1구간 버스의 "기점 출발" 시각이 아니라
  //   실제 탑승지 통과 시각(boardMin)과 환승지 도착 시각(hubArrMin)을 추정해서
  //   환승 가능 여부를 판단함
  const HUBS_LIST = [
    '서천터미널', '장항터미널', '한산공용터미널',
    '서천역', '장항읍내', '판교', '기산', '문산',
    '화양', '비인', '마산', '시초', '광암', '구동입구'
  ];
  const countKeyT = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const searchBaseMin2 = searchTime.getHours() * 60 + searchTime.getMinutes();

  // 좌표 인덱스 비율로 구간 소요시간 추정
  // (startIdx → endIdx) / 전체길이 × 전체소요시간
  function segMin(r, coords, startIdx, endIdx) {
    const s = Math.max(startIdx, 0);
    const e = Math.min(endIdx, coords.length - 1);
    if (s === e) return 0;
    if (e < s)   return Math.round(routeTotalMin(r) * 0.3); // 방향 오류 fallback

    // 시작/끝 좌표로 직선거리 계산 → 어느 노선이든 동일 구간은 동일 소요시간
    const cs = coords[s], ce = coords[e];
    if (cs.lat && ce.lat) {
      const km = coordDist(cs.lat, cs.lng, ce.lat, ce.lng) / 1000;
      return Math.round(km * 2.5 + 3); // 직선거리 기반 (정류장 간 정차 고려 +3분)
    }
    // 좌표 없으면 비율 fallback
    const total = routeTotalMin(r);
    const len = Math.max(coords.length - 1, 1);
    return Math.round(total * (e - s) / len);
  }

  // 2구간 시간표 생성 함수 (searchTime 이후)
  function makeTimetable(r) {
    const count = r[countKeyT] || 0;
    if (!count || !r['첫차'] || !r['막차']) return [];
    const [fh, fm] = r['첫차'].split(':').map(Number);
    const [lh, lm] = r['막차'].split(':').map(Number);
    const fMin = fh*60+fm, lMin = lh*60+lm;
    const interval = count > 1 ? Math.round((lMin-fMin)/(count-1)) : 0;
    const times = [];
    for (let i = 0; i < count; i++) {
      const t = fMin + interval*i;
      if (t >= searchBaseMin2) times.push(t);
    }
    return times;
  }

  for (const hub of HUBS_LIST) {
    const hubStop = STOPS.find(s => s.name.includes(hub.substring(0,3)));
    if (!hubStop) continue;
    const hubLat = hubStop.lat, hubLng = hubStop.lng;

    // 허브 방향 체크: 허브가 출발지보다 목적지에 더 가까워야 유효한 환승지
    // (되돌아가는 방향의 환승지 제거)
    if (fromLat && toLat) {
      const dFromTo = coordDist(fromLat, fromLng, toLat, toLng);
      const dHubTo  = coordDist(hubLat,  hubLng,  toLat, toLng);
      if (dHubTo >= dFromTo) continue; // 허브가 출발지보다 목적지에서 멀거나 같으면 제외
    }

    // 1구간: from → hub 경유 노선
    const leg1Routes = ROUTES.filter(r => {
      const coords = getRouteCoords(r);
      const hi = findCoordIdx(coords, hubLat, hubLng);
      if (hi === -1) return false;
      if (!fromLat) return true;
      const fi = findCoordIdx(coords, fromLat, fromLng);
      return (isGps || fi !== -1) && (fi === -1 || fi < hi);
    });

    // 2구간: hub → to 경유 노선 (도착지 반경 300m 포함)
    const leg2Routes = ROUTES.filter(r => {
      const coords = getRouteCoords(r);
      const hi = findCoordIdx(coords, hubLat, hubLng);
      const ti = findCoordIdxMulti(coords, toCoords, 500);   // 목적지: 500m
      return hi !== -1 && ti !== -1 && hi < ti;
    });

    if (!leg1Routes.length || !leg2Routes.length) continue;

    // 2구간 후보 전체 탐색
    for (const r2 of leg2Routes) {
      const leg2Times = makeTimetable(r2);
      if (!leg2Times.length) continue;

      const r2Coords = getRouteCoords(r2);
      const r2HubIdx = findCoordIdx(r2Coords, hubLat, hubLng);
      const r2ToIdx  = findCoordIdxMulti(r2Coords, toCoords, 500);
      const leg2TravelMin = segMin(r2, r2Coords, r2HubIdx, r2ToIdx);

      for (const r1 of leg1Routes) {
        const r1Coords = getRouteCoords(r1);
        const fiIdx = fromLat ? findCoordIdx(r1Coords, fromLat, fromLng) : 0;
        const hiIdx = findCoordIdx(r1Coords, hubLat, hubLng);
        if (hiIdx === -1) continue;

        const leg0Min = segMin(r1, r1Coords, 0, fiIdx >= 0 ? fiIdx : 0);
        const safeFromIdx = fiIdx >= 0 ? fiIdx : 0;
        const leg1Min = segMin(r1, r1Coords, safeFromIdx, hiIdx);
        const r1Times = makeTimetable(r1);

        for (const bus2Min of leg2Times) {
          const needHubBy = bus2Min - 5;

          let bestBus1 = null;
          for (const depMin of r1Times) {
            const boardMin = depMin + leg0Min;
            if (boardMin < searchBaseMin2) continue;
            const hubArrMin = boardMin + leg1Min;
            if (hubArrMin <= needHubBy) {
              bestBus1 = { depMin, boardMin, hubArrMin };
              break;
            }
          }
          if (!bestBus1) continue;

          const bus1Str = `${String(Math.floor(bestBus1.depMin/60)).padStart(2,'0')}:${String(bestBus1.depMin%60).padStart(2,'0')}`;
          const bus2Str = `${String(Math.floor(bus2Min/60)).padStart(2,'0')}:${String(bus2Min%60).padStart(2,'0')}`;

          const leg2Leg0Min = segMin(r2, r2Coords, 0, r2HubIdx >= 0 ? r2HubIdx : 0);
          const hub2BoardMin = bus2Min + leg2Leg0Min;
          const hub2BoardStr = `${String(Math.floor(hub2BoardMin/60)).padStart(2,'0')}:${String(hub2BoardMin%60).padStart(2,'0')}`;

          const isDup = results.some(res =>
            res.isTransfer &&
            res.route['번호'] === r1['번호'] &&
            res.route2['번호'] === r2['번호'] &&
            res.nextBus === bus1Str
          );
          if (isDup) continue;

          const finalArrMin = hub2BoardMin + leg2TravelMin;
          const totalMinutes = finalArrMin - bestBus1.boardMin;

          results.push({
            route: r1, route2: r2,
            stops: getRouteStops(r1),
            stops2: getRouteStops(r2),
            nextBus: bus1Str,
            boardTime: `${String(Math.floor(bestBus1.boardMin/60)).padStart(2,'0')}:${String(bestBus1.boardMin%60).padStart(2,'0')}`,
            nextBus2: bus2Str,
            hub2BoardTime: hub2BoardStr,
            hub2BoardMin,
            leg0Min,
            leg1Min,
            transferHub: hub,
            transferCount: 1,
            minutes: totalMinutes,
            distanceKm: (r1['거리']||0) + (r2['거리']||0),
            dayType,
            isTransfer: true
          });
          break; // 이 r1+r2 조합에서 가장 이른 것만
        }
      }
    } // end for r2
  } // end for hub

  // ── 새 추천 로직 ──────────────────────────────────────
  // searchTime 기준 대기분 계산 (현재시각이 아닌 검색시각 기준)
  const searchBaseMin = searchTime.getHours() * 60 + searchTime.getMinutes();
  function waitMin(r) {
    const [h, m] = r.nextBus.split(':').map(Number);
    return (h * 60 + m) - searchBaseMin;
  }

  // 직행 중 가장 빠른 탑승 대기시간
  const directResults = results.filter(r => !r.isTransfer);
  const minDirectWait = directResults.length
    ? Math.min(...directResults.map(waitMin))
    : Infinity;

  results.sort((a, b) => {
    const aTransfer = a.transferCount || 0;
    const bTransfer = b.transferCount || 0;
    const aWait = waitMin(a);
    const bWait = waitMin(b);

    // 1순위: 직행 우선
    //   단, 직행의 가장 빠른 탑승 대기가 환승보다 30분 이상 늦으면 환승을 올려줌
    if (aTransfer !== bTransfer) {
      const faster = aTransfer < bTransfer ? a : b; // 직행 쪽
      const slower = aTransfer < bTransfer ? b : a; // 환승 쪽
      const fasterWait = aTransfer < bTransfer ? aWait : bWait;
      const slowerWait = aTransfer < bTransfer ? bWait : aWait;
      // 직행 대기 - 환승 대기 > 30분이면 환승 우선
      if (minDirectWait - slowerWait > 30) {
        return aTransfer < bTransfer ? 1 : -1; // 환승 올리기
      }
      return aTransfer - bTransfer; // 직행 우선
    }

    // 2순위: 탑승 대기시간 (검색시각 기준)
    if (Math.abs(aWait - bWait) > 3) return aWait - bWait;

    // 3순위: 총 소요시간
    return a.minutes - b.minutes;
  });
  return results.slice(0, 3); // 추천 포함 최대 3개
}

function getRouteStops(route) {
  const via = route['경유'] || '';
  const stops = [route['기점']];
  via.split(/→|,/).forEach(s => { const t = s.trim(); if (t) stops.push(t); });
  stops.push(route['종점']);
  return stops;
}

function estimateMinutes(km) {
  return Math.round(km * 2.5 + 5);
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}분`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

function getNextBus(route, searchTime, dayType) {
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = route[countKey] || 0;
  if (count === 0) return null;

  const firstStr = route['첫차'];
  const lastStr = route['막차'];
  if (!firstStr || !lastStr) return null;

  const [fh, fm] = firstStr.split(':').map(Number);
  const [lh, lm] = lastStr.split(':').map(Number);
  const searchMin = searchTime.getHours() * 60 + searchTime.getMinutes();
  const firstMin = fh * 60 + fm;
  const lastMin = lh * 60 + lm;

  if (searchMin > lastMin) return null;

  if (count <= 1) {
    return searchMin <= firstMin ? firstStr : null;
  }

  const interval = Math.round((lastMin - firstMin) / (count - 1));
  const times = [];
  for (let i = 0; i < count; i++) {
    const t = firstMin + interval * i;
    const h = Math.floor(t / 60);
    const m = t % 60;
    times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
  }

  const next = times.find(t => {
    const [th, tm] = t.split(':').map(Number);
    return th * 60 + tm >= searchMin;
  });
  return next || null;
}

function getMinutesUntil(timeStr) {
  const now = new Date();
  const [h, m] = timeStr.split(':').map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const targetMin = h * 60 + m;
  return targetMin - nowMin;
}

function formatWaitTime(min) {
  if (min <= 0) return '곧 출발';
  if (min < 60) return `${min}분 후`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}시간 ${m}분 후` : `${h}시간 후`;
}

// ==================== 결과 렌더링 ====================

// 서천군 정류장 위경도 범위 (stops.json 기반)
const SEOCHEON_BOUNDS = { minLat: 35.97, maxLat: 36.22, minLng: 126.49, maxLng: 126.89 };

function isInSeocheon(lat, lng) {
  return lat >= SEOCHEON_BOUNDS.minLat && lat <= SEOCHEON_BOUNDS.maxLat &&
         lng >= SEOCHEON_BOUNDS.minLng && lng <= SEOCHEON_BOUNDS.maxLng;
}

function renderResults(results, toName, fromName, timeStr, dayType) {
  const body = document.getElementById('result-body');

  // 도착지 범위 체크 (좌표가 있으면 위경도로, 없으면 정류장 데이터에서 확인)
  const toLat = searchState.to?.lat;
  const toLng = searchState.to?.lng;
  const toInRange = toLat
    ? isInSeocheon(toLat, toLng)
    : STOPS.some(s => s.name.includes(toName.substring(0,3)));

  if (!toInRange) {
    body.innerHTML = `<div class="no-result">
      <div class="no-result-icon">🗺️</div>
      <div class="no-result-text">앗, 여기는 서천 버스가 못 가요!</div>
      <div class="no-result-sub">"${toName}"은(는) 서천 관할 밖입니다 😅<br>서천군 내 목적지를 입력해주세요.<br><small style="color:#bbb">보령·부여·군산은 시외·기차 탭을 이용하세요</small></div>
    </div>`;
    window._searchResults = [];
    return;
  }

  // 출발지도 범위 체크 (현위치 제외)
  const fromLat = searchState.from?.lat;
  const fromLng = searchState.from?.lng;
  const fromIsGps = searchState.from?.isGps;
  if (fromLat && !fromIsGps && !isInSeocheon(fromLat, fromLng)) {
    body.innerHTML = `<div class="no-result">
      <div class="no-result-icon">🗺️</div>
      <div class="no-result-text">출발지도 서천 밖이에요!</div>
      <div class="no-result-sub">"${fromName}"은(는) 서천 관할 밖입니다 😅<br>서천군 내 출발지를 입력해주세요.</div>
    </div>`;
    window._searchResults = [];
    return;
  }

  if (results.length === 0) {
    // 도착지 근처를 지나는 노선이 있는지 확인
    const nearbyRoutes = ROUTES.filter(r => {
      const stops = getRouteStops(r);
      return stops.some(s => s.includes(toName.substring(0,3)));
    }).slice(0, 3);

    let hintHtml = '';
    if (nearbyRoutes.length > 0) {
      hintHtml = `<div style="margin-top:12px;padding:10px;background:#f8f8f8;border-radius:8px;font-size:12px;color:#666">
        <div style="font-weight:700;margin-bottom:6px;color:#333">💡 "${toName}" 근처를 지나는 버스</div>
        ${nearbyRoutes.map(r => `<div style="padding:3px 0">${getBusDisplayNum(r)} · ${r['기점']} → ${r['종점']}</div>`).join('')}
        <div style="font-size:11px;color:#aaa;margin-top:6px">출발지를 변경하거나 환승을 시도해보세요</div>
      </div>`;
    }

    body.innerHTML = `<div class="no-result">
      <div class="no-result-icon">🚌</div>
      <div class="no-result-text">검색된 경로가 없습니다</div>
      <div class="no-result-sub">${timeStr} 이후 운행하는 버스가 없거나<br>직접 연결 노선이 없습니다</div>
      ${hintHtml}
    </div>`;
    window._searchResults = [];
    return;
  }

  let html = '';

  // 추천 경로 (1개) + 기타 경로
  const best = results[0];
  const others = results.slice(1);

  // 추천 경로 카드
  html += '<div class="result-section-label">추천 경로</div>';
  html += renderRouteCard(best, 0, true, dayType);

  // 기타 경로
  if (others.length > 0) {
    html += '<div class="result-section-label" style="margin-top:4px">기타 경로</div>';
    others.forEach((r, i) => {
      html += renderRouteCard(r, i + 1, false, dayType);
    });
  }

  // 복귀시에는
  // 추천 경로 도착 시각 + 30분 = 복귀 기준 시각
  const bestArriveTime = calcArrivalTime(best.boardTime || best.nextBus, best.minutes);
  const [baH, baM] = bestArriveTime.split(':').map(Number);
  const retBaseMin = baH * 60 + baM + 30;
  const retBaseStr = `${String(Math.floor(retBaseMin/60)%24).padStart(2,'0')}:${String(retBaseMin%60).padStart(2,'0')}`;

  html += '<div class="result-section-label" style="margin-top:4px">복귀시에는</div>';
  const returnRoute = findReturnRoute(dayType, retBaseMin);
  if (returnRoute && !returnRoute.notFound) {
    if (returnRoute.isTransfer) {
      // 환승 복귀 — 정상 검색 환승 카드와 동일 형식
      const zoneColor1 = getZoneColor(returnRoute.route);
      const zoneColor2 = getZoneColor(returnRoute.route2);
      const busNum1 = getBusDisplayNum(returnRoute.route);
      const busNum2 = getBusDisplayNum(returnRoute.route2);

      // 1구간 기점출발 시각
      const retDep = getNextBusAfter(returnRoute.route, retBaseMin, dayType);
      if (retDep) {
        // 1구간 기점→허브 소요시간 추정
        const r1coords = getRouteCoords(returnRoute.route);
        const hubStop = STOPS.find(s => s.name.includes(returnRoute.transferHub.substring(0,3)));
        const r1HubIdx = hubStop ? findCoordIdx(r1coords, hubStop.lat, hubStop.lng) : -1;
        const retFromLat = searchState.to?.lat, retFromLng = searchState.to?.lng;
        const retToLat   = searchState.from?.isGps ? myLocation.lat : searchState.from?.lat;
        const retToLng   = searchState.from?.isGps ? myLocation.lng : searchState.from?.lng;
        const retFromStop = STOPS.find(s => coordDist(s.lat,s.lng,retFromLat,retFromLng) < 100);
        const r1FromIdx = retFromStop ? findCoordIdx(r1coords, retFromStop.lat, retFromStop.lng) : 0;
        const r1total = routeTotalMin(returnRoute.route);
        const r1len = Math.max(r1coords.length-1,1);
        // 탑승지 통과 시각 (leg0: 기점→탑승지)
        const leg0m = r1FromIdx > 0 ? Math.round(r1total * r1FromIdx / r1len) : 0;
        const [dh,dm] = retDep.split(':').map(Number);
        const boardMin = dh*60+dm + leg0m;
        // 환승지 도착 시각 (leg1: 탑승지→허브)
        const leg1m = (r1HubIdx > r1FromIdx)
          ? Math.round(r1total * (r1HubIdx - r1FromIdx) / r1len) : 0;
        const hubArrMin = boardMin + leg1m;
        const hubArrStr = `${String(Math.floor(hubArrMin/60)%24).padStart(2,'0')}:${String(hubArrMin%60).padStart(2,'0')}`;

        // 2구간: 허브 이후 첫 버스 + 도착 시각
        const retDep2 = getNextBusAfter(returnRoute.route2, hubArrMin + 5, dayType);
        let arrStr = '';
        if (retDep2) {
          const r2coords = getRouteCoords(returnRoute.route2);
          const r2HubIdx = hubStop ? findCoordIdx(r2coords, hubStop.lat, hubStop.lng) : 0;
          const retToStop = STOPS.find(s => coordDist(s.lat,s.lng,retToLat,retToLng) < 100);
          const r2ToIdx = retToStop ? findCoordIdx(r2coords, retToStop.lat, retToStop.lng) : r2coords.length-1;
          const leg2m = (r2ToIdx > r2HubIdx)
            ? Math.round(routeTotalMin(returnRoute.route2) * (r2ToIdx - r2HubIdx) / Math.max(r2coords.length-1,1)) : 0;
          const [d2h,d2m] = retDep2.split(':').map(Number);
          const arrMin = d2h*60+d2m + leg2m;
          arrStr = `${String(Math.floor(arrMin/60)%24).padStart(2,'0')}:${String(arrMin%60).padStart(2,'0')}`;
        }

        const boardStr = `${String(Math.floor(boardMin/60)%24).padStart(2,'0')}:${String(boardMin%60).padStart(2,'0')}`;

        html += `<div style="margin:0 10px 8px;background:#fff;border:.5px solid #ddd;border-radius:10px;padding:10px 12px">
          <div style="font-size:10px;color:#aaa;margin-bottom:6px">${bestArriveTime} 도착 후 기준 (${retBaseStr} 이후)</div>
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:6px">
            <span class="bus-pill" style="background:${zoneColor1}">${busNum1}</span>
            <span style="color:#888;font-size:12px">→ ${returnRoute.transferHub}에서</span>
            <span class="bus-pill" style="background:${zoneColor2}">${busNum2}</span>
            <span style="color:#888;font-size:12px">환승</span>
          </div>
          <div style="font-size:13px;color:#222">
            <span style="color:#185FA5;font-weight:700">${boardStr}</span>
            <span style="color:#555;font-size:11px"> 출발</span>
            <span style="color:#888;font-size:12px"> → ${retDep2 || '?'} 환승 →</span>
            ${arrStr ? `<span style="color:#E24B4A;font-weight:700"> ${arrStr}</span><span style="color:#555;font-size:11px"> 도착</span>` : '<span style="color:#aaa;font-size:11px"> 운행 종료</span>'}
          </div>
        </div>`;
      } else {
        html += `<div style="margin:0 10px 8px;background:#f8f8f8;border-radius:10px;padding:12px;font-size:13px;color:#888;text-align:center">
          오늘 해당 구간 복귀 노선을 찾을 수 없습니다
        </div>`;
      }
    } else {
      // 직행 복귀
      const retTimetableHtml = buildTimetableHtmlAfter(returnRoute.route, retBaseMin, dayType, '#E24B4A');
      if (retTimetableHtml) {
        let retHtml = retTimetableHtml
          .replace('class="tt-fill"', 'class="tt-fill ret"')
          .replace('background:#1D9E75', 'background:#E24B4A');
        retHtml = retHtml.replace(
          `${returnRoute.route['기점']} → ${returnRoute.route['종점']}`,
          `${toName} → ${fromName}`
        );
        html += `<div style="font-size:10px;color:#aaa;margin:0 10px 4px">${bestArriveTime} 도착 후 기준 (${retBaseStr} 이후)</div>`;
        html += retHtml;
      }
    }
  } else {
    html += `<div style="margin:0 10px 8px;background:#f8f8f8;border-radius:10px;padding:12px;font-size:13px;color:#888;text-align:center">
      오늘 해당 구간 복귀 노선을 찾을 수 없습니다
    </div>`;
  }

  body.innerHTML = html;
  window._searchResults = results;
}

function calcArrivalTime(departTimeStr, minutes) {
  const [h, m] = departTimeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total/60) % 24).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

function getBoardAndAlight(r) {
  const coords = r.coords || [];
  const fromLat = searchState.from?.lat || myLocation.lat;
  const fromLng = searchState.from?.lng || myLocation.lng;
  const toLat = searchState.to?.lat;
  const toLng = searchState.to?.lng;

  let boardName = r.route['기점'];
  let alightName = r.route['종점'];

  if (coords.length) {
    let bI = -1, bD = 9999999;
    coords.forEach((c,i) => {
      if (!c.lat) return;
      const d = Math.sqrt((c.lat-fromLat)**2+(c.lng-fromLng)**2)*111000;
      if (d < bD) { bD = d; bI = i; }
    });
    if (bI >= 0) boardName = coords[bI].name;

    if (toLat) {
      let aI = -1, aD = 9999999;
      coords.forEach((c,i) => {
        if (!c.lat) return;
        const d = Math.sqrt((c.lat-toLat)**2+(c.lng-toLng)**2)*111000;
        if (d < aD) { aD = d; aI = i; }
      });
      if (aI >= 0) alightName = coords[aI].name;
    }
  }
  return { boardName, alightName };
}

function getRouteLineSummary(r) {
  // 노선 출발지, 탑승지(진하게), 주요분기점, 도착지(진하게)
  const { boardName, alightName } = getBoardAndAlight(r);
  const origin = r.route['기점'];
  const dest = r.route['종점'];

  // 탑승지가 출발지와 다르면 출발지 앞에 표시
  // 주요 분기점: 탑승~하차 사이 중간 정류장 1개
  const coords = r.coords || [];
  let midName = '';
  if (coords.length > 3) {
    const bI = coords.findIndex(c => c.name === boardName);
    const aI = coords.findIndex(c => c.name === alightName);
    if (bI >= 0 && aI >= 0 && aI - bI > 2) {
      const midI = Math.floor((bI + aI) / 2);
      midName = coords[midI]?.name || '';
    }
  }

  let parts = [];
  if (origin !== boardName) parts.push(`<span style="color:#888;font-size:11px">${origin}</span>`);
  parts.push(`<span style="font-weight:700;color:#185FA5">${boardName}</span>`);
  if (midName && midName !== boardName && midName !== alightName) {
    parts.push(`<span style="color:#555;font-size:11px">${midName}</span>`);
  }
  parts.push(`<span style="font-weight:700;color:#E24B4A">${alightName}</span>`);
  if (dest !== alightName) parts.push(`<span style="color:#888;font-size:11px">${dest}</span>`);

  return parts.join(`<span style="color:#999;margin:0 2px;font-size:11px">→</span>`);
}

// 환승 카드용: 2구간 허브에 제때 도착할 수 있는 1구간 이후 버스만 표시
// bus2HubMin: 2구간 버스 허브 탑승 시각(분), leg0Min: 기점→탑승지, leg1Min: 탑승지→허브
function makeTransferTimesRow(route, currentBus, bus2HubMin, leg1Min, leg0Min, dayType) {
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = route[countKey] || 0;
  const firstStr = route['첫차'], lastStr = route['막차'];
  if (!count || !firstStr || !lastStr) return '';

  const [fh,fm] = firstStr.split(':').map(Number);
  const [lh,lm] = lastStr.split(':').map(Number);
  const fMin = fh*60+fm, lMin = lh*60+lm;
  const interval = count > 1 ? Math.round((lMin-fMin)/(count-1)) : 0;
  const times = [];
  for (let i = 0; i < count; i++) {
    const t = fMin + interval*i;
    times.push(String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'));
  }

  const [ch,cm] = currentBus.split(':').map(Number);
  const currentMin = ch*60+cm;
  const deadline = bus2HubMin - 5;

  const upcoming = times.filter(t => {
    const [th,tm] = t.split(':').map(Number);
    const depMin = th*60+tm;
    if (depMin <= currentMin) return false;
    const boardMin = depMin + leg0Min;
    const hubArr = boardMin + leg1Min;
    return hubArr <= deadline;
  });

  if (upcoming.length === 0) return '';
  const chips = upcoming.map(t => `<div class="tt-chip"><div class="tt-chip-time">${t}</div></div>`).join('');
  return `<div style="display:flex;align-items:flex-start;gap:6px;margin-top:8px">
    <span style="font-size:10px;color:#aaa;flex-shrink:0;padding-top:4px">이후</span>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;flex:1">${chips}</div>
  </div>`;
}

function makeTimesRow(route, boardTime, dayType) {
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = route[countKey] || 0;
  const firstStr = route['첫차'], lastStr = route['막차'];
  if (!count || !firstStr || !lastStr) return '';

  const [fh,fm] = firstStr.split(':').map(Number);
  const [lh,lm] = lastStr.split(':').map(Number);
  const fMin = fh*60+fm, lMin = lh*60+lm;
  const interval = count > 1 ? Math.round((lMin-fMin)/(count-1)) : 0;
  const times = [];
  for (let i = 0; i < count; i++) {
    const t = fMin + interval*i;
    times.push(String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'));
  }

  const [bh, bm] = boardTime.split(':').map(Number);
  const boardMin = bh*60+bm;
  const upcoming = times.filter(t => {
    const [th,tm] = t.split(':').map(Number);
    return th*60+tm > boardMin;
  });
  if (upcoming.length === 0) return '';

  const chips = upcoming.map(t => `<div class="tt-chip"><div class="tt-chip-time">${t}</div></div>`).join('');
  return `<div style="display:flex;align-items:flex-start;gap:6px;margin-top:8px">
    <span style="font-size:10px;color:#aaa;flex-shrink:0;padding-top:4px">이후</span>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;flex:1">${chips}</div>
  </div>`;
}
// 타시도 노선이면 "번호(지역명)" 형식으로 표시
function getBusDisplayNum(route) {
  const group = route['노선군'] || '';
  if (group.includes('타시도')) {
    // "타시도 부여군" → "부여", "타시도 보령시" → "보령", "타시도 군산시" → "군산"
    const regionMatch = group.match(/타시도\s+(.+?)(?:시|군|구)?(?:\s|$)/);
    const region = regionMatch ? regionMatch[1].replace(/[시군구]$/, '') : '타지역';
    return `${route['번호']}(${region})`;
  }
  return `${route['번호']}번`;
}

function renderRouteCard(r, idx, isBest, dayType) {
  const boardTime = r.nextBus;
  const arriveTime = calcArrivalTime(r.nextBus, r.minutes);
  const zoneColor = getZoneColor(r.route);
  const isOutside = r.route['노선군'].includes('타시도');

  if (r.isTransfer) {
    // 2구간 소요시간 = 허브→도착지 구간만
    const r2Coords = getRouteCoords(r.route2);
    const r2HubIdx = findCoordIdx(r2Coords, ...((() => {
      const hs = STOPS.find(s => s.name.includes(r.transferHub.substring(0,3)));
      return hs ? [hs.lat, hs.lng] : [0, 0];
    })()));
    const r2ToIdx = findCoordIdx(r2Coords, searchState.to?.lat || 0, searchState.to?.lng || 0);
    const leg2TravelMin = (r2HubIdx !== -1 && r2ToIdx !== -1 && r2ToIdx > r2HubIdx)
      ? Math.round(routeTotalMin(r.route2) * (r2ToIdx - r2HubIdx) / Math.max(r2Coords.length - 1, 1))
      : estimateMinutes(r.route2['거리'] || 10);
    // 도착시각 = 허브 실제 탑승 시각 + 허브→도착지 소요시간
    const arriveTime2 = calcArrivalTime(r.hub2BoardTime || r.nextBus2, leg2TravelMin);
    const zoneColor2 = getZoneColor(r.route2);
    const timesRow = (typeof r.hub2BoardMin === 'number')
      ? makeTransferTimesRow(r.route, r.nextBus, r.hub2BoardMin, r.leg1Min || 0, r.leg0Min || 0, dayType)
      : makeTimesRow(r.route, r.nextBus, dayType);
    const busNum1 = getBusDisplayNum(r.route);
    const busNum2 = getBusDisplayNum(r.route2);
    const displayBoardTime = r.boardTime || r.nextBus;
    return `<div class="route-card transfer-card" onclick="showDetail(${idx})">
      <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px;flex-wrap:wrap">
        <span class="bus-pill" style="background:${zoneColor}">${busNum1}</span>
        <span style="color:#888;font-size:12px">→</span>
        <span style="color:#888;font-size:12px">${r.transferHub}에서</span>
        <span class="bus-pill" style="background:${zoneColor2}">${busNum2}</span>
        <span style="color:#888;font-size:12px">환승</span>
        <span class="rc-badge badge-transfer" style="margin-left:auto">1회 환승</span>
      </div>
      <div style="font-size:13px;color:#222">
        <span style="color:#185FA5;font-weight:700">${displayBoardTime}</span>
        <span style="color:#555;font-size:11px"> 출발</span>
        <span style="color:#888;font-size:12px"> → ${r.hub2BoardTime || r.nextBus2} 환승 →</span>
        <span style="color:#E24B4A;font-weight:700"> ${arriveTime2}</span>
        <span style="color:#555;font-size:11px"> 도착</span>
        <span style="color:#555;font-size:11px;float:right">${formatDuration(r.minutes)}</span>
      </div>
      ${timesRow}
    </div>`;
  }

  const lineSummary = getRouteLineSummary(r);
  const timesRow = makeTimesRow(r.route, boardTime, dayType);
  const busNum = getBusDisplayNum(r.route);

  return `<div class="route-card ${isBest ? 'best' : ''}" onclick="showDetail(${idx})">
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:6px;flex-wrap:wrap">
      <span class="bus-pill" style="background:${zoneColor}">${busNum}</span>
      <span style="font-size:11px;color:#444">${lineSummary}</span>
    </div>
    <div style="font-size:13px;color:#222">
      <span style="color:#185FA5;font-weight:700">${boardTime}</span>
      <span style="color:#555;font-size:11px"> 출발</span>
      <span style="margin:0 4px;color:#888">→</span>
      <span style="color:#E24B4A;font-weight:700">${arriveTime}</span>
      <span style="color:#555;font-size:11px"> 도착</span>
      <span style="color:#555;font-size:11px;float:right">${formatDuration(r.minutes)}</span>
    </div>
    ${timesRow}
  </div>`;
}
// 특정 분(min) 이후 첫 버스 시각 반환
function getNextBusAfter(route, baseMin, dayType) {
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = route[countKey] || 0;
  if (!count || !route['첫차'] || !route['막차']) return null;
  const [fh,fm] = route['첫차'].split(':').map(Number);
  const [lh,lm] = route['막차'].split(':').map(Number);
  const fMin=fh*60+fm, lMin=lh*60+lm;
  const interval = count > 1 ? Math.round((lMin-fMin)/(count-1)) : 0;
  for (let i = 0; i < count; i++) {
    const t = fMin + interval*i;
    if (t >= baseMin) return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
  }
  return null;
}

// baseMin 이후 시간표 표시
function buildTimetableHtmlAfter(route, baseMin, dayType, accentColor) {
  const color = accentColor || '#1D9E75';
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = route[countKey] || 0;
  if (!count || !route['첫차'] || !route['막차']) return '';
  const [fh,fm] = route['첫차'].split(':').map(Number);
  const [lh,lm] = route['막차'].split(':').map(Number);
  const fMin=fh*60+fm, lMin=lh*60+lm;
  const interval = count > 1 ? Math.round((lMin-fMin)/(count-1)) : 0;

  let chipsHtml = '';
  let isFirst = true;
  for (let i = 0; i < count; i++) {
    const t = fMin + interval*i;
    if (t < baseMin) continue;
    const tStr = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
    chipsHtml += `<div class="tt-chip ${isFirst ? 'next-dep' : ''}">
      <div class="tt-chip-time">${tStr}</div>
    </div>`;
    isFirst = false;
  }
  if (!chipsHtml) return '';

  return `<div class="tt-fill">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="background:${color};color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700">${getBusDisplayNum(route)}</span>
      <span style="font-size:12px;color:#555">${route['기점']} → ${route['종점']}</span>
    </div>
    <div class="tt-grid">${chipsHtml}</div>
  </div>`;
}

function buildTimetableHtml(route, nextBus, dayType, accentColor) {
  const color = accentColor || '#1D9E75';
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = route[countKey] || 0;
  const firstStr = route['첫차'];
  const lastStr = route['막차'];
  if (!count || !firstStr || !lastStr) return '';

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [fh, fm] = firstStr.split(':').map(Number);
  const [lh, lm] = lastStr.split(':').map(Number);
  const fMin = fh * 60 + fm, lMin = lh * 60 + lm;
  const interval = count > 1 ? Math.round((lMin - fMin) / (count - 1)) : 0;
  const times = [];
  for (let i = 0; i < count; i++) {
    const t = fMin + interval * i;
    times.push(String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0'));
  }

  let chipsHtml = '';
  times.forEach(t => {
    const [th, tm] = t.split(':').map(Number);
    const tMin = th * 60 + tm;
    if (tMin < nowMin) return; // 지난 시간 제외
    const isNext = nextBus ? t === nextBus : false;
    chipsHtml += `<div class="tt-chip ${isNext ? 'next-dep' : ''}">
      <div class="tt-chip-time">${t}</div>
    </div>`;
  });

  return `<div class="tt-fill">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="background:${color};color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700">${getBusDisplayNum(route)}</span>
      <span style="font-size:12px;color:#555">${route['기점']} → ${route['종점']}</span>
    </div>
    <div class="tt-grid">${chipsHtml}</div>
  </div>`;
}

function findReturnRoute(dayType, retBaseMin) {
  const retFromLat = searchState.to?.lat;
  const retFromLng = searchState.to?.lng;
  const retToLat   = searchState.from?.isGps ? myLocation.lat : searchState.from?.lat;
  const retToLng   = searchState.from?.isGps ? myLocation.lng : searchState.from?.lng;

  if (!retFromLat || !retToLat) return null;

  const retFromCoords = getNearbyCoords(retFromLat, retFromLng, 300);
  const retToCoords   = getNearbyCoords(retToLat,   retToLng,   300);
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';

  // ① 직행 탐색
  const directCandidates = [];
  ROUTES.forEach(route => {
    const coords = getRouteCoords(route);
    if (!coords.length) return;
    const fromIdx = findCoordIdxMulti(coords, retFromCoords, 300);
    const toIdx   = findCoordIdxMulti(coords, retToCoords,   300);
    if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) return;
    if (!(route[countKey] > 0) || !route['첫차'] || !route['막차']) return;
    directCandidates.push(route);
  });

  if (directCandidates.length > 0) {
    directCandidates.sort((a, b) => (b[countKey]||0) - (a[countKey]||0));
    return { route: directCandidates[0], isTransfer: false };
  }

  // ② 직행 없으면 환승 탐색
  const HUBS_LIST = [
    '서천터미널', '장항터미널', '한산공용터미널',
    '서천역', '장항읍내', '판교', '기산', '문산',
    '화양', '비인', '마산', '시초', '광암', '구동입구'
  ];

  const now = new Date();
  const searchBaseMin = now.getHours() * 60 + now.getMinutes();

  for (const hub of HUBS_LIST) {
    const hubStop = STOPS.find(s => s.name.includes(hub.substring(0,3)));
    if (!hubStop) continue;
    const hubLat = hubStop.lat, hubLng = hubStop.lng;

    // 허브 방향 체크
    const dFromTo = coordDist(retFromLat, retFromLng, retToLat, retToLng);
    const dHubTo  = coordDist(hubLat, hubLng, retToLat, retToLng);
    if (dHubTo >= dFromTo) continue;

    // 1구간: 복귀출발 → 허브
    const leg1Routes = ROUTES.filter(r => {
      const coords = getRouteCoords(r);
      const hi = findCoordIdx(coords, hubLat, hubLng);
      if (hi === -1) return false;
      const fi = findCoordIdxMulti(coords, retFromCoords, 300);
      return fi !== -1 && fi < hi && (r[countKey] > 0);
    });

    // 2구간: 허브 → 복귀도착
    const leg2Routes = ROUTES.filter(r => {
      const coords = getRouteCoords(r);
      const hi = findCoordIdx(coords, hubLat, hubLng);
      const ti = findCoordIdxMulti(coords, retToCoords, 300);
      return hi !== -1 && ti !== -1 && hi < ti && (r[countKey] > 0);
    });

    if (!leg1Routes.length || !leg2Routes.length) continue;

    // 가장 운행 많은 조합 반환
    leg1Routes.sort((a,b) => (b[countKey]||0) - (a[countKey]||0));
    leg2Routes.sort((a,b) => (b[countKey]||0) - (a[countKey]||0));

    return {
      route: leg1Routes[0],
      route2: leg2Routes[0],
      transferHub: hub,
      isTransfer: true
    };
  }

  return { notFound: true };
}

// ==================== 경로 상세 ====================
function showDetail(idx) {
  const results = window._searchResults || [];
  if (!results[idx]) return;
  detailRoute = results[idx];

  document.getElementById('live-bus-name').textContent =
    `${getBusDisplayNum(detailRoute.route)} ${detailRoute.route['노선군'].replace(/[0-9~번]/g,'').trim()} 운행중`;
  document.getElementById('live-bus-status').textContent =
    `2정류장 전 통과 · ${detailRoute.nextBus} 출발 (탑승 준비)`;

  renderStopList(detailRoute.stops, detailRoute.nextBus);
  showScreen('detail');

  setTimeout(() => initDetailMap(detailRoute), 100);
}

function renderStopList(stops, nextBus) {
  const now = new Date();
  const [nh, nm] = nextBus.split(':').map(Number);
  const departMin = nh * 60 + nm;
  const avgMinPerStop = detailRoute ? Math.round(detailRoute.minutes / stops.length) : 5;

  // 탑승 정류장 인덱스 (현재 위치 기준 = index 1)
  const boardIdx = 1;
  const lastIdx = stops.length - 1;

  // 표시할 인덱스 결정: 탑승 전 1개, 탑승, 탑승 후 3개, 도착
  const showSet = new Set();
  if (boardIdx > 0) showSet.add(boardIdx - 1); // 탑승 전 1개
  showSet.add(boardIdx);                        // 탑승 정류장
  for (let i = boardIdx + 1; i <= Math.min(boardIdx + 3, lastIdx - 1); i++) showSet.add(i); // 이후 3개
  showSet.add(lastIdx);                         // 도착

  let html = '';
  let prevShown = -1;

  stops.forEach((name, i) => {
    const isDone = i < boardIdx;
    const isBoard = i === boardIdx;
    const isEnd = i === lastIdx;
    const etaMin = departMin + i * avgMinPerStop;
    const etaH = Math.floor(etaMin / 60) % 24;
    const etaM = etaMin % 60;
    const etaStr = `${String(etaH).padStart(2,'0')}:${String(etaM).padStart(2,'0')}`;

    // 줄임표 삽입
    if (showSet.has(i) && prevShown !== -1 && i - prevShown > 1) {
      html += `<div class="stop-row">
        <div class="stop-track">
          <div class="stop-circle sc-skip"></div>
          <div class="stop-vline"></div>
        </div>
        <span class="stop-name" style="color:#ccc;font-size:11px">··· ${i - prevShown - 1}개 정류장</span>
      </div>`;
    }

    if (!showSet.has(i)) return;
    prevShown = i;

    let circleClass = isDone ? 'sc-done' : isBoard ? 'sc-current' : isEnd ? 'sc-end' : 'sc-upcoming';
    const hasLine = i < lastIdx;

    let etaEl = '';
    if (isDone) etaEl = `<span class="stop-eta" style="color:#ddd">통과</span>`;
    else if (isBoard) etaEl = `<span class="stop-current-tag">탑승</span>`;
    else if (isEnd) etaEl = `<span class="stop-eta" style="color:#1D9E75;font-weight:600">${etaStr} 도착</span>`;
    else etaEl = `<span class="stop-eta">${etaStr}</span>`;

    html += `<div class="stop-row ${isBoard ? 'current' : ''}">
      <div class="stop-track">
        <div class="stop-circle ${circleClass}"></div>
        ${hasLine ? '<div class="stop-vline"></div>' : ''}
      </div>
      <span class="stop-name ${isDone ? 'done' : isBoard ? 'current' : ''}">${name}</span>
      ${etaEl}
    </div>`;
  });

  document.getElementById('stop-list').innerHTML = html;
}

function initDetailMap(result) {
  const container = document.getElementById('map-detail');
  if (!container) return;

  if (mapDetail) { mapDetail = null; container.innerHTML = ''; }

  const fromStop = searchState.from?.lat ? searchState.from
    : STOPS.find(s => s.name.includes((searchState.from?.name||'서천터미널').substring(0,4)));
  const toStop = searchState.to?.lat ? searchState.to
    : STOPS.find(s => s.name.includes((searchState.to?.name||'').substring(0,4)));

  const centerLat = fromStop ? fromStop.lat : myLocation.lat;
  const centerLng = fromStop ? fromStop.lng : myLocation.lng;

  mapDetail = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(centerLat, centerLng),
    level: 9
  });

  // 출발/도착 마커
  const addMarker = (lat, lng, label, color) => {
    new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content: `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="background:${color};color:#fff;border-radius:10px;padding:2px 7px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 5px rgba(0,0,0,.2)">${label}</div>
        <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid ${color};margin-top:-1px"></div>
        <div style="width:8px;height:8px;background:${color};border:2px solid #fff;border-radius:50%"></div>
      </div>`,
      yAnchor: 1.1, zIndex: 5
    }).setMap(mapDetail);
  };

  // 노선 전체 coords에서 출발지~도착지 구간만 추출
  const allCoords = (result.coords || []).filter(c => c.lat);
  let segCoords = allCoords;

  if (fromStop && toStop && allCoords.length > 0) {
    // 출발지에 가장 가까운 인덱스
    let fromI = 0, fromD = 9999999;
    allCoords.forEach((c, i) => {
      const d = Math.sqrt((c.lat-fromStop.lat)**2+(c.lng-fromStop.lng)**2)*111000;
      if (d < fromD) { fromD = d; fromI = i; }
    });
    // 도착지에 가장 가까운 인덱스
    let toI = allCoords.length-1, toD = 9999999;
    allCoords.forEach((c, i) => {
      const d = Math.sqrt((c.lat-toStop.lat)**2+(c.lng-toStop.lng)**2)*111000;
      if (d < toD) { toD = d; toI = i; }
    });
    // 방향 보정 (fromI < toI)
    if (fromI > toI) { const tmp = fromI; fromI = toI; toI = tmp; }
    segCoords = allCoords.slice(fromI, toI + 1);
  }

  // 구간 폴리라인 — 노선 권역 색상으로
  const lineColor = result.route ? getZoneColor(result.route) : '#1D9E75';
  if (segCoords.length >= 2) {
    const path = segCoords.map(c => new kakao.maps.LatLng(c.lat, c.lng));
    new kakao.maps.Polyline({
      map: mapDetail, path,
      strokeWeight: 4, strokeColor: lineColor,
      strokeOpacity: 0.85, strokeStyle: 'solid'
    });
  }

  // 중간 정류장 점도 같은 색
  segCoords.forEach((c, i) => {
    if (i === 0 || i === segCoords.length - 1) return;
    new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(c.lat, c.lng),
      content: `<div style="width:6px;height:6px;background:${lineColor};border:1.5px solid #fff;border-radius:50%;opacity:0.7"></div>`,
      yAnchor: 0.5, zIndex: 3
    }).setMap(mapDetail);
  });

  // 출발/도착 마커
  if (fromStop) addMarker(fromStop.lat, fromStop.lng, '출발', '#185FA5');
  if (toStop)   addMarker(toStop.lat,   toStop.lng,   '도착', '#E24B4A');

  // 복귀 노선도 지도에 함께 표시 (점선 + 연한 색)
  const returnRoute = findReturnRoute(result.dayType || getDayType());
  if (returnRoute) {
    const retCoords = (getRouteCoords(returnRoute.route) || []).filter(c => c.lat);
    if (retCoords.length >= 2) {
      // 도착지→출발지 구간만 추출
      let retFrom = toStop, retTo = fromStop;
      let rfI = 0, rfD = 9999999, rtI = retCoords.length-1, rtD = 9999999;
      retCoords.forEach((c, i) => {
        if (retFrom) {
          const d = coordDist(c.lat, c.lng, retFrom.lat, retFrom.lng);
          if (d < rfD) { rfD = d; rfI = i; }
        }
        if (retTo) {
          const d = coordDist(c.lat, c.lng, retTo.lat, retTo.lng);
          if (d < rtD) { rtD = d; rtI = i; }
        }
      });
      if (rfI > rtI) { const tmp = rfI; rfI = rtI; rtI = tmp; }
      const retSeg = retCoords.slice(rfI, rtI + 1);
      if (retSeg.length >= 2) {
        new kakao.maps.Polyline({
          map: mapDetail,
          path: retSeg.map(c => new kakao.maps.LatLng(c.lat, c.lng)),
          strokeWeight: 3, strokeColor: '#E24B4A',
          strokeOpacity: 0.45, strokeStyle: 'shortdash'
        });
      }
    }
  }

  // 지도 범위 조정
  const bounds = new kakao.maps.LatLngBounds();
  if (fromStop) bounds.extend(new kakao.maps.LatLng(fromStop.lat, fromStop.lng));
  if (toStop)   bounds.extend(new kakao.maps.LatLng(toStop.lat,   toStop.lng));
  if (fromStop || toStop) mapDetail.setBounds(bounds, 80);
}

// 노선도 뒤로가기 — 시간표에서 왔으면 시간표로, 아니면 홈으로
function routesBack() {
  if (_timetableReturnScreen) {
    const target = _timetableReturnScreen;
    _timetableReturnScreen = null;
    showScreen(target);
  } else {
    showScreen('home');
  }
}

// ==================== 노선도 ====================
function initZoneTabs() {
  const container = document.getElementById('zone-tabs');
  if (!container) return;

  let html = '';
  ZONES.forEach(z => {
    html += `<div class="zone-tab ${z.id === 'all' ? 'active' : ''}"
      style="${z.id === 'all' ? `background:${z.color}` : `border-color:${z.color};color:${z.color}`}"
      onclick="selectZone('${z.id}')">${z.name}</div>`;
  });
  container.innerHTML = html;

  renderRouteList('all');
  renderLegend();
}

function selectZone(zoneId) {
  selectedZone = zoneId;
  document.querySelectorAll('.zone-tab').forEach((t, i) => {
    const z = ZONES[i];
    if (z.id === zoneId) {
      t.classList.add('active');
      t.style.background = z.color;
      t.style.color = '#fff';
      t.style.borderColor = z.color;
    } else {
      t.classList.remove('active');
      t.style.background = '';
      t.style.color = z.color;
      t.style.borderColor = z.color;
    }
  });
  renderRouteList(zoneId);
}

function getZoneColor(route) {
  const group = route['노선군'] || '';
  const num = route['번호'] || '';
  const numInt = parseInt(num) || 0;

  // 노선군 문자열로 먼저 매핑 (가장 정확)
  if (group.includes('장항') || group.includes('동백') ||
      group.includes('100번대') || group.includes('200번대') ||
      group.includes('북산') || group.includes('하구둑') ||
      group.includes('산내') || group.includes('장상')) {
    // 장항권 (파랑)
    if (group.includes('동백') && !group.includes('장항')) return ZONES[2].color;
    return ZONES[1].color;
  }
  if (group.includes('한산') || group.includes('300번대') || group.includes('400번대')) {
    return ZONES[3].color; // 한산 (주황)
  }
  if (group.includes('판교') || group.includes('40번대') ||
      group.includes('500번대') || group.includes('문산') || group.includes('50번대')) {
    return ZONES[4].color; // 판교 (보라)
  }
  if (group.includes('마서') || group.includes('700번대') ||
      group.includes('600번대') || group.includes('기산') || group.includes('종천')) {
    return ZONES[5].color; // 마서 (진녹)
  }
  if (group.includes('봉선') || group.includes('70번대')) {
    return '#888'; // 봉선리선 — 별도 권역 없음 (회색)
  }
  if (group.includes('화양') || group.includes('60번대') ||
      group.includes('800번대') || group.includes('당정') || group.includes('80번대') ||
      group.includes('비인') || group.includes('90번대')) {
    // 동백·서면 권역 (빨강)
    return ZONES[2].color;
  }
  if (group.includes('타시도')) return '#888';

  // fallback: 번호대 기반
  if (numInt >= 100 && numInt < 200) return ZONES[1].color; // 장항
  if (numInt >= 200 && numInt < 300) return ZONES[1].color; // 장항
  if (numInt >= 300 && numInt < 500) return ZONES[3].color; // 한산
  if (numInt >= 500 && numInt < 600) return ZONES[4].color; // 판교
  if (numInt >= 600 && numInt < 700) return ZONES[5].color; // 마서
  if (numInt >= 700 && numInt < 800) return '#888';          // 봉선리선 (회색)
  if (numInt >= 800 && numInt < 900) return ZONES[2].color; // 동백·서면
  if (numInt >= 10 && numInt < 30)   return ZONES[1].color; // 장항
  if (numInt >= 1  && numInt < 10)   return ZONES[2].color; // 동백
  if (numInt >= 30 && numInt < 40)   return ZONES[3].color; // 한산
  if (numInt >= 40 && numInt < 60)   return ZONES[4].color; // 판교
  if (numInt >= 60 && numInt < 80)   return ZONES[2].color; // 동백·서면
  if (numInt >= 80 && numInt < 100)  return ZONES[2].color; // 동백·서면
  return ZONES[1].color; // 기본: 장항
}

function renderRouteList(zoneId) {
  const container = document.getElementById('route-list');
  if (!container) return;

  let filtered = ROUTES;
  if (zoneId !== 'all') {
    const zone = ZONES.find(z => z.id === zoneId);
    if (zone && zone.keywords.length > 0) {
      filtered = ROUTES.filter(r => {
        const name = r['노선군'] + r['번호'];
        return zone.keywords.some(k => name.includes(k));
      });
    }
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="loading">해당 권역 노선이 없습니다</div>';
    return;
  }

  window._filteredRoutes = filtered;
  container.innerHTML = filtered.map((r, idx) => {
    const color = getZoneColor(r);
    return `<div class="route-list-item" onclick="showRouteTimetable('${r['번호']}', ${idx})">
      <span class="rli-num" style="background:${color}">${getBusDisplayNum(r)}</span>
      <div class="rli-info">
        <div class="rli-name">${r['노선군']}</div>
        <div class="rli-sub">${r['기점']} ↔ ${r['종점']} · ${r['거리']}km</div>
      </div>
      <span class="rli-count">평일 ${r['평일횟수']}회</span>
      <span class="rli-arr">›</span>
    </div>`;
  }).join('');
}

function renderLegend() {
  const container = document.getElementById('legend-bar');
  if (!container) return;
  container.innerHTML = ZONES.slice(1).map(z =>
    `<div class="legend-item"><div class="legend-line" style="background:${z.color}"></div>${z.name}</div>`
  ).join('');
}

// 버스시간표에서 노선번호 클릭 → 노선도 화면에서 해당 노선 표시
// 노선도 화면의 뒤로가기 버튼이 시간표 화면으로 복귀하도록 처리
let _timetableReturnScreen = null;

function showRouteFromTimetable(busNum, terminus) {
  // 현재 화면(timetable)을 기억
  _timetableReturnScreen = 'timetable';

  // 노선도 화면으로 이동
  showScreen('routes');

  // 해당 노선 찾아서 시간표 팝업 열기
  setTimeout(() => {
    const route = ROUTES.find(r =>
      getBusDisplayNum(r) === busNum ||
      r['번호'] === busNum.replace(/\(.*\)/,'').trim()
    );
    if (route) {
      const idx = window._filteredRoutes
        ? window._filteredRoutes.indexOf(route)
        : -1;
      showRouteTimetable(route['번호'], idx >= 0 ? idx : undefined);
      showRouteOnMap(route);
    }
  }, 150);
}

function showRouteTimetable(routeNum, idx) {
  const route = (window._filteredRoutes && idx !== undefined)
    ? window._filteredRoutes[idx]
    : ROUTES.find(r => r['번호'] === routeNum);
  if (!route) return;

  // 지도에 노선 표시 (지도 준비될 때까지 대기)
  const tryShowOnMap = () => {
    if (mapRoutes) showRouteOnMap(route);
    else setTimeout(tryShowOnMap, 200);
  };
  tryShowOnMap();

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dayType = getDayType();
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = route[countKey] || 0;
  const firstStr = route['첫차'];
  const lastStr = route['막차'];

  let timesHtml = '';
  if (count > 0 && firstStr && lastStr) {
    const [fh, fm] = firstStr.split(':').map(Number);
    const [lh, lm] = lastStr.split(':').map(Number);
    const firstMin = fh * 60 + fm;
    const lastMin = lh * 60 + lm;
    const interval = count > 1 ? Math.round((lastMin - firstMin) / (count - 1)) : 0;
    const times = [];
    for (let i = 0; i < count; i++) {
      const t = firstMin + interval * i;
      times.push(`${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`);
    }
    timesHtml = times.map(t => {
      const [th, tm] = t.split(':').map(Number);
      const tMin = th * 60 + tm;
      const passed = tMin < nowMin;
      const isNext = !passed && times.find(tt => { const [a,b]=tt.split(':').map(Number); return a*60+b>=nowMin; }) === t;
      return `<span class="tt-chip ${isNext?'next-dep':''} ${passed?'passed':''}" style="font-size:12px;padding:4px 8px">
        <div class="tt-chip-time ${passed?'passed-time':''}">${t}</div>
        <div class="tt-chip-lbl">${isNext?'다음':''}${t===lastStr?'막차':''}</div>
      </span>`;
    }).join('');
  }

  const color = getZoneColor(route);
  const bottom = document.getElementById('routes-bottom');
  if (!bottom) return;

  // 하단 패널에 직접 표시 (팝업 없음 → 지도 조작 자유)
  bottom.innerHTML = `
    <div style="padding:10px 14px 6px;display:flex;justify-content:space-between;align-items:center;border-bottom:.5px solid #f0f0f0">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="background:${color};color:#fff;border-radius:6px;padding:2px 10px;font-weight:700;font-size:14px">${getBusDisplayNum(route)}</span>
        <span style="font-size:12px;color:#555">${route['기점']} → ${route['종점']} · ${route['거리']}km</span>
      </div>
      <button onclick="closeRouteDetail()" style="background:none;border:none;font-size:16px;color:#aaa;cursor:pointer;padding:2px 4px">✕</button>
    </div>
    <div style="padding:6px 14px 4px;font-size:11px;color:#aaa">경유: ${route['경유']}</div>
    <div style="padding:2px 14px 6px;font-size:11px;color:#888">${dayType==='weekday'?'평일':dayType==='sat'?'토요일':'공휴일'} ${count}회 운행 ※ 추정</div>
    <div style="padding:4px 14px 10px;display:flex;flex-wrap:wrap;gap:4px">${timesHtml}</div>
  `;

  // 서브타이틀 업데이트
  const sub = document.getElementById('routes-sub');
  if (sub) sub.textContent = `${getBusDisplayNum(route)} · ${route['기점']} → ${route['종점']}`;
}

function closeRouteDetail() {
  const bottom = document.getElementById('routes-bottom');
  if (bottom) {
    bottom.innerHTML = `<div class="route-list" id="route-list"></div>`;
    renderRouteList(selectedZone);
  }
  const sub = document.getElementById('routes-sub');
  if (sub) sub.textContent = '권역 선택 → 노선 선택 → 시간표';
  // 지도 초기화
  if (routePolyline) { routePolyline.setMap(null); routePolyline = null; }
  routeMarkers.forEach(m => m.setMap(null));
  routeMarkers = [];
  if (mapRoutes) mapRoutes.setLevel(10);
}

function initRoutesMap() {
  const container = document.getElementById('map-routes');
  if (!container) return;
  if (typeof kakao === 'undefined' || !kakao.maps) {
    setTimeout(initRoutesMap, 300);
    return;
  }
  // ROUTE_COORDS 아직 미준비면 대기
  if (ROUTE_COORDS.size === 0) {
    setTimeout(initRoutesMap, 300);
    return;
  }
  kakao.maps.load(() => {
    if (mapRoutes) return;
    mapRoutes = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(36.0758, 126.6908),
      level: 10
    });
  });
}

let routeMarkers = [];
let routePolyline = null;

function showRouteOnMap(route) {
  if (!mapRoutes) return;
  routeMarkers.forEach(m => m.setMap(null));
  routeMarkers = [];
  if (routePolyline) { routePolyline.setMap(null); routePolyline = null; }

  const color = getZoneColor(route);

  // ROUTE_COORDS에서 전체 경유지 좌표 가져오기
  const allCoords = (getRouteCoords(route) || []).filter(c => c.lat);

  // 폴리라인 그리기
  if (allCoords.length >= 2) {
    routePolyline = new kakao.maps.Polyline({
      map: mapRoutes,
      path: allCoords.map(c => new kakao.maps.LatLng(c.lat, c.lng)),
      strokeWeight: 4,
      strokeColor: color,
      strokeOpacity: 0.85,
      strokeStyle: 'solid'
    });
  }

  // 중간 경유지 작은 점
  allCoords.forEach((c, i) => {
    if (i === 0 || i === allCoords.length - 1) return;
    const dot = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(c.lat, c.lng),
      content: `<div style="width:5px;height:5px;background:${color};border:1.5px solid #fff;border-radius:50%;opacity:0.7"></div>`,
      yAnchor: 0.5, zIndex: 2
    });
    dot.setMap(mapRoutes);
    routeMarkers.push(dot);
  });

  // 기점/종점 마커 — 간결하게 작은 원으로
  const addMarker = (lat, lng, isStart) => {
    const c = isStart ? '#185FA5' : '#E24B4A';
    const overlay = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content: `<div style="display:flex;flex-direction:column;align-items:center">
        <div style="width:10px;height:10px;background:${c};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>
      </div>`,
      yAnchor: 0.5, zIndex: 5
    });
    overlay.setMap(mapRoutes);
    routeMarkers.push(overlay);
  };

  if (allCoords.length > 0) {
    addMarker(allCoords[0].lat, allCoords[0].lng, true);
    addMarker(allCoords[allCoords.length-1].lat, allCoords[allCoords.length-1].lng, false);
  }

  // 지도 범위 조정
  if (allCoords.length > 0) {
    const bounds = new kakao.maps.LatLngBounds();
    allCoords.forEach(c => bounds.extend(new kakao.maps.LatLng(c.lat, c.lng)));
    mapRoutes.setBounds(bounds, 40);
  } else {
    // 좌표 없으면 서천 중심으로 유지
    mapRoutes.setCenter(new kakao.maps.LatLng(36.0758, 126.6908));
    mapRoutes.setLevel(10);
  }
}

// ==================== 시외버스·기차 ====================

const TAGO_API_KEY = '58b48b0d19a525cf18e98d85a1b68cc560700393a7ed41f7538cc0758386b039';

// 기차역 설정
const TRAIN_STATIONS = {
  pangyoStation:   { name:'판교역(충남)', depId:'NAT081240', cols:[
    { label:'상행↑', arrId:'NAT010032', arrName:'용산' },
    { label:'하행↓', arrId:'NAT030879', arrName:'익산' }
  ]},
  seocheonStation: { name:'서천역', depId:'NAT081343', cols:[
    { label:'상행↑', arrId:'NAT010032', arrName:'용산' },
    { label:'하행↓', arrId:'NAT030879', arrName:'익산' }
  ]},
  janghangStation: { name:'장항역', depId:'NAT081318', cols:[
    { label:'상행↑', arrId:'NAT010032', arrName:'용산' },
    { label:'하행↓', arrId:'NAT030879', arrName:'익산' }
  ]},
};

// 터미널 시간표 데이터
const SEOCHEON_TERMINAL_DATA = [
  { dest:'서울', via:'직통',           times:['07:40','09:20','11:00','12:40','14:20','16:00','17:40','19:10'], grade:'시외' },
  { dest:'대전', via:'부여·논산 경유', times:['07:05','08:35','10:25','12:15','13:55','15:45','17:25','19:15'], grade:'시외' },
  { dest:'세종', via:'부여·공주 경유', times:['08:15','12:50','16:35'], grade:'시외' },
  { dest:'천안', via:'홍성·예산 경유', times:['09:10','13:20','17:50'], grade:'시외' },
  { dest:'군산', via:'장항 경유',      times:['07:25','08:25','09:25','10:25','11:25','12:25','13:25','14:25','15:25','16:25','17:25','18:25'], grade:'시외' },
  { dest:'익산', via:'군산 경유',      times:['08:50','11:15','14:30','17:55'], grade:'시외' },
];

const JANGHANG_TERMINAL_DATA = [
  { dest:'서울', via:'서천 경유',           times:['07:20','09:00','10:40','12:20','14:00','15:40','17:20','18:50'], grade:'시외' },
  { dest:'대전', via:'서천 경유',           times:['06:45','08:15','10:05','11:55','13:35','15:25','17:05','18:55'], grade:'시외' },
  { dest:'세종', via:'서천·부여·공주 경유', times:['08:35','13:10','16:55'], grade:'시외' },
  { dest:'천안', via:'서천·홍성·예산 경유', times:['09:30','13:40','18:10'], grade:'시외' },
  { dest:'군산', via:'직통',                times:['07:45','08:45','09:45','10:45','11:45','12:45','13:45','14:45','15:45','16:45','17:45','18:45'], grade:'시외' },
  { dest:'익산', via:'서천·군산 경유',      times:['09:10','11:35','14:50','18:15'], grade:'시외' },
];

// 예약 링크
const BOOKING_LINKS = {
  train:    { name:'코레일 예약', url:'https://www.korail.com' },
  terminal: { name:'코버스 예약', url:'https://www.kobus.co.kr' },
};

let currentTransportTab = 'seocheonStation';
let _trainCache = {}; // API 결과 캐시

function initTransport() {
  showTransportTab('seocheonStation');
}

function showTransportTab(tabId) {
  currentTransportTab = tabId;
  document.querySelectorAll('.tr-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tr-tab-' + tabId);
  if (tab) tab.classList.add('active');

  const body = document.getElementById('transport-body');
  const sub  = document.getElementById('transport-sub');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;font-size:13px">불러오는 중...</div>';

  if (tabId === 'seocheonTerminal') {
    if (sub) sub.textContent = '서천터미널 시외버스';
    renderGridTimetable(body, SEOCHEON_TERMINAL_DATA, 'terminal', '서천터미널');
  } else if (tabId === 'janghangTerminal') {
    if (sub) sub.textContent = '장항터미널 시외버스';
    renderGridTimetable(body, JANGHANG_TERMINAL_DATA, 'terminal', '장항터미널');
  } else {
    const st = TRAIN_STATIONS[tabId];
    if (sub) sub.textContent = `${st.name} · 장항선`;
    fetchAndRenderTrain(body, st);
  }
}

// ── 기차 API 호출 후 격자 렌더링 ──
async function fetchAndRenderTrain(body, st) {
  const now   = new Date();
  const today = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const cacheKey = st.depId + today;

  try {
    let colData;
    if (_trainCache[cacheKey]) {
      colData = _trainCache[cacheKey];
    } else {
      const results = await Promise.all(st.cols.map(col =>
        fetch(`https://apis.data.go.kr/1613000/TrainInfo/GetStrtpntAlocFndTrainInfo?serviceKey=${TAGO_API_KEY}&_type=json&numOfRows=100&depPlaceId=${st.depId}&arrPlaceId=${col.arrId}&depPlandTime=${today}`)
          .then(r => r.json())
      ));
      colData = st.cols.map((col, i) => {
        const items = results[i]?.response?.body?.items?.item || [];
        const arr = Array.isArray(items) ? items : [items];
        return arr.map(t => ({
          dep:   `${t.depplandtime.slice(8,10)}:${t.depplandtime.slice(10,12)}`,
          depMin: parseInt(t.depplandtime.slice(8,10))*60 + parseInt(t.depplandtime.slice(10,12)),
          arr:   `${t.arrplandtime.slice(8,10)}:${t.arrplandtime.slice(10,12)}`,
          grade: t.traingradename,
          no:    t.trainno,
          arrName: col.arrName + '역',
          label: col.label,
          stName: st.name
        })).filter(t => t.depMin >= 5*60).sort((a,b) => a.depMin - b.depMin);
      });
      _trainCache[cacheKey] = colData;
    }

    // 격자 데이터 구성 (col당 배열)
    const cols = st.cols.map((col, i) => ({
      label: col.label,
      arrName: col.arrName,
      trains: colData[i]
    }));

    renderTrainGrid(body, cols, st.name);

  } catch(e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:#aaa;font-size:13px">
      시간표를 불러오지 못했어요<br><small>${e.message}</small>
    </div>`;
  }
}

// ── 기차 격자 렌더링 ──
function renderTrainGrid(body, cols, stName) {
  const now    = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const colColor = ['#185FA5','#E24B4A'];

  // 헤더
  let html = `
  <div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1.5px solid #eee">
    <div style="display:flex">
      <div style="width:32px;flex-shrink:0"></div>
      ${cols.map((col,i) => `
        <div style="flex:1;padding:7px 4px;text-align:center;color:${colColor[i]};font-size:12px;font-weight:700">
          ${col.label} <span style="font-weight:400;font-size:10px">${col.arrName}행</span>
        </div>`).join('')}
    </div>
  </div>`;

  // 05~23시 고정 행
  for (let h = 5; h <= 23; h++) {
    html += `<div style="display:flex;border-bottom:.5px solid #f0f0f0;min-height:36px;align-items:stretch">`;
    html += `<div style="width:32px;flex-shrink:0;text-align:center;font-size:11px;font-weight:700;color:#bbb;display:flex;align-items:center;justify-content:center">${String(h).padStart(2,'0')}</div>`;

    cols.forEach((col, ci) => {
      // 이 시간대(h) 열차 모두
      const trains = col.trains.filter(t => Math.floor(t.depMin/60) === h);
      const nowNextIdx = col.trains.findIndex(tr => tr.depMin >= nowMin);

      html += `<div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;padding:3px 4px;align-items:center;justify-content:center">`;
      trains.forEach(t => {
        const isPast = t.depMin < nowMin;
        const isNext = col.trains[nowNextIdx] === t;
        const bg = isNext ? '#FFF8E1' : '';
        const tc = isPast ? '#ccc' : colColor[ci];
        html += `<div onclick="showTrainDetail(${JSON.stringify(t).replace(/"/g,'&quot;')})"
          style="flex:0 0 auto;padding:3px 4px;cursor:pointer;background:${bg};border-radius:5px;text-align:center">
          <div style="font-size:12px;font-weight:700;color:${tc};${isPast?'text-decoration:line-through':''}">${t.dep}</div>
          <div style="font-size:9px;color:#aaa">${t.grade.replace('호','')}</div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  }

  html += `<div style="padding:12px 14px;border-top:1px solid #eee">
    <a href="${BOOKING_LINKS.train.url}" target="_blank"
      style="display:block;background:#185FA5;color:#fff;border-radius:10px;padding:10px;text-align:center;font-size:13px;font-weight:700;text-decoration:none">
      🚆 코레일 예약
    </a>
  </div>
  <div style="padding:0 14px 16px;font-size:10px;color:#ccc">코레일 API 실시간 데이터 · 출발 기준</div>`;

  body.innerHTML = html;
}

// ── 기차 세부 팝업 ──
function showTrainDetail(t) {
  if (typeof t === 'string') t = JSON.parse(t);
  const existing = document.getElementById('tr-detail-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'tr-detail-panel';
  panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.15);z-index:999;padding:16px';
  panel.innerHTML = `
    <div style="width:32px;height:3px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <span style="background:#185FA5;color:#fff;border-radius:6px;padding:3px 10px;font-weight:700;font-size:14px">${t.grade}</span>
        <span style="margin-left:8px;font-size:13px;color:#555">열차 ${t.no}</span>
      </div>
      <button onclick="document.getElementById('tr-detail-panel').remove()"
        style="background:none;border:none;font-size:18px;color:#aaa;cursor:pointer">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;color:#aaa">출발</div>
        <div style="font-size:22px;font-weight:800;color:#185FA5">${t.dep}</div>
        <div style="font-size:12px;color:#555">${t.stName || '해당역'}</div>
      </div>
      <div style="font-size:20px;color:#ddd">→</div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#aaa">도착(예정)</div>
        <div style="font-size:22px;font-weight:800;color:#E24B4A">${t.arr}</div>
        <div style="font-size:12px;color:#555">${t.arrName}</div>
      </div>
    </div>
    <div style="background:#f8f8f8;border-radius:10px;padding:10px 14px;font-size:12px;color:#666">
      장항선 · ${t.label?.includes('상') ? '대천 → 홍성 → 천안 경유' : '천안 → 홍성 → 대천 경유'}
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.2);z-index:998';
  overlay.onclick = () => { panel.remove(); overlay.remove(); };
  overlay.id = 'tr-detail-overlay';

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ── 버스 터미널 격자 렌더링 ──
function renderGridTimetable(body, data, type, terminalName) {
  const now    = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();

  const cols = data.filter(d => d.times.length > 0);
  const colColors = ['#EF9F27','#1D9E75','#7F77DD','#185FA5','#E24B4A','#3B6D11'];

  // 각 열의 시간을 분으로 변환
  const colTimes = cols.map(col => col.times.map(t => {
    const [th,tm] = t.split(':').map(Number);
    return { dep: t, depMin: th*60+tm, dest: col.dest, via: col.via, grade: col.grade };
  }));

  // 헤더
  let html = `
  <div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1.5px solid #eee">
    <div style="display:flex">
      <div style="width:32px;flex-shrink:0"></div>
      ${cols.map((col,i) => `
        <div style="flex:1;padding:6px 2px;text-align:center;color:${colColors[i%colColors.length]};font-size:11px;font-weight:700">
          ${col.dest}
        </div>`).join('')}
    </div>
  </div>`;

  // 06~19시 고정 행 (터미널 운영 시간대)
  for (let h = 6; h <= 19; h++) {
    html += `<div style="display:flex;border-bottom:.5px solid #f0f0f0;min-height:36px;align-items:stretch">`;
    html += `<div style="width:32px;flex-shrink:0;text-align:center;font-size:11px;font-weight:700;color:#bbb;display:flex;align-items:center;justify-content:center">${String(h).padStart(2,'0')}</div>`;

    colTimes.forEach((times, ci) => {
      const items = times.filter(t => Math.floor(t.depMin/60) === h);
      const nextMin = times.find(t => t.depMin >= nowMin)?.depMin;

      html += `<div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;padding:3px 4px;align-items:center;justify-content:center">`;
      items.forEach(t => {
        const isPast = t.depMin < nowMin;
        const isNext = t.depMin === nextMin;
        const bg = isNext ? '#FFF8E1' : '';
        const tc = isPast ? '#ccc' : isNext ? '#E24B4A' : colColors[ci%colColors.length];
        html += `<div onclick="showBusDetail(${JSON.stringify(t).replace(/"/g,'&quot;')})"
          style="flex:1;min-width:40px;padding:3px 1px;cursor:pointer;background:${bg};border-radius:5px;text-align:center">
          <div style="font-size:12px;font-weight:700;color:${tc};${isPast?'text-decoration:line-through':''}">${t.dep}</div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  }

  html += `<div style="padding:10px 14px;font-size:10px;color:#aaa;border-top:.5px solid #eee;line-height:1.8">
    익산행은 군산을 경유합니다<br>
    <span style="color:#ccc">※ 실제 시간표와 다를 수 있습니다</span>
  </div>
  <div style="padding:0 14px 14px">
    <a href="${BOOKING_LINKS.terminal.url}" target="_blank"
      style="display:block;background:#EF9F27;color:#fff;border-radius:10px;padding:10px;text-align:center;font-size:13px;font-weight:700;text-decoration:none">
      🚌 코버스 시외버스 예약
    </a>
  </div>`;

  body.innerHTML = html;
}

// ── 버스 세부 팝업 ──
function showBusDetail(t) {
  if (typeof t === 'string') t = JSON.parse(t);
  const existing = document.getElementById('tr-detail-panel');
  if (existing) existing.remove();
  const ex2 = document.getElementById('tr-detail-overlay');
  if (ex2) ex2.remove();

  const panel = document.createElement('div');
  panel.id = 'tr-detail-panel';
  panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.15);z-index:999;padding:16px';
  panel.innerHTML = `
    <div style="width:32px;height:3px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="background:#EF9F27;color:#fff;border-radius:6px;padding:3px 10px;font-weight:700;font-size:14px">시외버스</span>
      <button onclick="document.getElementById('tr-detail-panel').remove();document.getElementById('tr-detail-overlay').remove()"
        style="background:none;border:none;font-size:18px;color:#aaa;cursor:pointer">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;color:#aaa">출발</div>
        <div style="font-size:24px;font-weight:800;color:#EF9F27">${t.dep}</div>
      </div>
      <div style="font-size:20px;color:#ddd">→</div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#aaa">목적지</div>
        <div style="font-size:24px;font-weight:800;color:#E24B4A">${t.dest}</div>
      </div>
    </div>
    <div style="background:#f8f8f8;border-radius:10px;padding:10px 14px;font-size:12px;color:#666">
      ${t.via || '직통'}
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'tr-detail-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.2);z-index:998';
  overlay.onclick = () => { panel.remove(); overlay.remove(); };

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ==================== 정류장 시간표 ====================// ==================== 정류장 시간표 ====================

function onStopSearchInput(val) {
  const resultsEl = document.getElementById('stop-search-results');
  if (!val.trim()) {
    resultsEl.style.display = 'none';
    return;
  }
  const matches = STOPS.filter(s => s.name.includes(val.trim()))
    .filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i) // 중복 제거
    .slice(0, 15);

  if (matches.length === 0) {
    resultsEl.style.display = 'none';
    return;
  }

  resultsEl.innerHTML = matches.map(s => {
    const display = s.displayName || s.name;
    return `<div onclick="selectStopForTimetable('${s.name.replace(/'/g,"\\'")}', '${display.replace(/'/g,"\\'")}', ${s.lat}, ${s.lng})"
      style="padding:10px 14px;border-bottom:.5px solid #f5f5f5;cursor:pointer;font-size:13px;color:#222;display:flex;align-items:center;gap:8px">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="#EF9F27" stroke-width="1.3"/><path d="M7 4v3l2 2" stroke="#EF9F27" stroke-width="1.1" stroke-linecap="round"/></svg>
      ${display}
    </div>`;
  }).join('');
  resultsEl.style.display = 'block';
}

function clearStopSearch() {
  document.getElementById('stop-search-input').value = '';
  document.getElementById('stop-search-results').style.display = 'none';
  document.getElementById('timetable-body').innerHTML =
    '<div style="text-align:center;padding:40px 20px;color:#bbb;font-size:13px">정류장명을 검색하세요</div>';
}

function selectStopForTimetable(stopName, displayName, lat, lng) {
  document.getElementById('stop-search-input').value = displayName;
  document.getElementById('stop-search-results').style.display = 'none';
  renderStopTimetable(stopName, displayName, lat, lng);
}

function renderStopTimetable(stopName, displayName, lat, lng) {
  const dayType = getDayType();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const stopCoords = getNearbyCoords(lat, lng, 300);
  const MAIN_HUBS = ['서천터미널','한산공용터미널','장항터미널','서천역','판교','기산','문산','화양','비인','마서','종천','장항읍내'];

  // 모든 통과 시각을 단일 배열로 수집 (시간 기준 정렬)
  const allRows = [];
  let totalCount = 0;

  ROUTES.forEach(route => {
    const coords = getRouteCoords(route);
    if (!coords.length) return;

    // 순환선: 동일 정류장을 2번 통과할 수 있음 → 첫 번째 통과만 사용
    const isCircular = route['기점'] === route['종점'];
    const idx = findCoordIdxMulti(coords, stopCoords, 300);
    if (idx === -1) return;

    const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
    const countWeekday = route['평일횟수'] || 0;
    const countSat     = route['토요일횟수'] || 0;
    const countHol     = route['공휴일횟수'] || 0;
    const count = route[countKey] || 0;
    if (!count || !route['첫차'] || !route['막차']) return;

    const [fh,fm] = route['첫차'].split(':').map(Number);
    const [lh,lm] = route['막차'].split(':').map(Number);
    const fMin=fh*60+fm, lMin=lh*60+lm;
    const interval = count > 1 ? Math.round((lMin-fMin)/(count-1)) : 0;

    const totalMin = routeTotalMin(route);
    const len = Math.max(coords.length-1, 1);
    const leg0 = Math.round(totalMin * idx / len);

    // 주요 경유지 추출 (이 정류장 이후, 종점과 같은 허브는 제외)
    const viaList = [route['기점'], ...route['경유'].split('→').map(s=>s.trim()).filter(Boolean), route['종점']];
    const terminus = route['종점'];
    const afterHubs = [];
    let passedStop = false;
    for (const v of viaList) {
      if (v.includes(stopName.substring(0,3))) passedStop = true;
      if (passedStop && afterHubs.length < 4) {
        const hub = MAIN_HUBS.find(h => v.includes(h.substring(0,3)));
        if (hub && !afterHubs.includes(hub) && !terminus.includes(hub.substring(0,3))) {
          afterHubs.push(hub);
        }
      }
    }
    const viaStr = afterHubs.join(' → ');

    // 비고 구성
    const hasDiff = !(countWeekday === countSat && countSat === countHol);
    const remarkParts = [];
    if (isCircular) remarkParts.push('순환');
    if (hasDiff) remarkParts.push(`평${countWeekday}/토${countSat}/공${countHol}`);
    const remark = remarkParts.join(' ');

    const color = getZoneColor(route);
    const busNum = getBusDisplayNum(route);

    for (let i = 0; i < count; i++) {
      const depMin = fMin + interval*i;
      const passMin = depMin + leg0;
      const passStr = `${String(Math.floor(passMin/60)%24).padStart(2,'0')}:${String(passMin%60).padStart(2,'0')}`;
      allRows.push({
        passMin, passStr,
        isPast: passMin < nowMin,
        color, busNum, viaStr, terminus, remark,
        // 순환선 비고는 첫 행에만 표시
        showRemark: i === 0
      });
      totalCount++;
    }
  });

  // 통과 시각 기준 정렬
  allRows.sort((a, b) => a.passMin - b.passMin);

  if (allRows.length === 0) {
    document.getElementById('timetable-body').innerHTML =
      `<div style="text-align:center;padding:40px 20px;color:#bbb;font-size:13px">
        이 정류장을 지나는 버스가 없습니다
      </div>`;
    return;
  }

  // 다음 버스 인덱스
  const nextIdx = allRows.findIndex(r => !r.isPast);

  // 노선 수 계산 (중복 없이)
  const routeCount = new Set(allRows.map(r => r.busNum)).size;

  let html = `<div style="padding:10px 12px 6px;font-size:13px;font-weight:700;color:#222">
    📍 ${displayName}
    <span style="font-size:11px;font-weight:400;color:#888;margin-left:6px">총 ${routeCount}개 노선, ${totalCount}회</span>
  </div>`;

  // 헤더
  html += `<div style="display:grid;grid-template-columns:48px 62px 1fr 68px 48px;gap:0;background:#f8f8f8;border-top:.5px solid #e0e0e0;border-bottom:.5px solid #e0e0e0;padding:5px 10px;font-size:10px;font-weight:700;color:#888">
    <div>시간</div>
    <div>노선</div>
    <div>주요 경유지</div>
    <div>종점</div>
    <div style="text-align:right">비고</div>
  </div>`;

  allRows.forEach((r, i) => {
    const isNext = i === nextIdx;
    // 노란 배경 = 다음 버스, 흰 배경 = 앞으로 올 버스, 회색 배경 = 지난 버스
    const rowBg    = isNext ? '#FFF8E1' : r.isPast ? '#fafafa' : '#fff';
    const timeColor = r.isPast ? '#ccc' : isNext ? '#E24B4A' : '#185FA5';
    const textColor = r.isPast ? '#ccc' : '#444';

    html += `<div style="display:grid;grid-template-columns:48px 62px 1fr 68px 48px;gap:0;background:${rowBg};border-bottom:.5px solid #f0f0f0;padding:6px 10px;align-items:center">
      <div style="font-size:13px;font-weight:700;color:${timeColor};${r.isPast?'text-decoration:line-through':''}">${r.passStr}</div>
      <div><span onclick="showRouteFromTimetable('${r.busNum.replace(/'/g,"\'")}', '${r.terminus.replace(/'/g,"\'")}');event.stopPropagation()"
        style="background:${r.color};color:#fff;border-radius:5px;padding:2px 6px;font-size:10px;font-weight:700;cursor:pointer;display:inline-block">${r.busNum}</span></div>
      <div style="font-size:10px;color:${textColor};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:4px">${r.viaStr}</div>
      <div style="font-size:10px;color:${r.isPast?'#ccc':'#333'};font-weight:${isNext?'700':'400'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.terminus}</div>
      <div style="font-size:9px;color:#888;text-align:right;white-space:nowrap;line-height:1.3">${r.remark}</div>
    </div>`;
  });

  document.getElementById('timetable-body').innerHTML = html;
}

// ==================== 즐겨찾기 ====================
function saveSearchHistory(from, to) {
  const key = `${from}→${to}`;
  const existing = JSON.parse(localStorage.getItem('seocheon_route_history') || '[]');
  const idx = existing.findIndex(h => h.key === key);
  if (idx >= 0) {
    existing[idx].count++;
    existing[idx].lastTime = Date.now();
  } else {
    existing.push({ key, from, to, count: 1, lastTime: Date.now() });
  }
  existing.sort((a, b) => b.count - a.count);
  localStorage.setItem('seocheon_route_history', JSON.stringify(existing.slice(0, 20)));
}

function initFavorites() {
  renderFavorites();
}

function renderFavorites() {
  const body = document.getElementById('favorites-body');
  const routeHistory = JSON.parse(localStorage.getItem('seocheon_route_history') || '[]');

  let html = '';

  // 자주 이용한 경로 (상위 3개 자동)
  html += `<div class="fav-section-title">자주 이용한 경로</div>`;
  if (routeHistory.length === 0) {
    html += `<div class="fav-empty">검색 이력이 없습니다<br><small>경로를 검색하면 자동으로 기록됩니다</small></div>`;
  } else {
    routeHistory.slice(0, 3).forEach((h) => {
      const matchRoute = ROUTES.find(r =>
        (r['기점'].includes(h.from.substring(0,3)) || h.from === '현위치') &&
        r['종점'].includes(h.to.substring(0,3))
      );
      const nextBusText = matchRoute ? getNextBus(matchRoute, new Date(), getDayType()) || '' : '';
      html += `<div class="fav-item" onclick="quickSearch('${h.from}','${h.to}')">
        <div class="fav-icon" style="background:#E1F5EE">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 7h11M7 1.5l5.5 5.5-5.5 5.5" stroke="#0F6E56" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="flex:1">
          <div class="fav-main">${h.from} → ${h.to}</div>
          <div class="fav-sub">${matchRoute ? `${matchRoute['번호']}번 · ${matchRoute['거리']}km` : ''}${nextBusText ? ` · 다음 ${nextBusText}` : ''}</div>
          <div class="fav-count">${h.count}회 이용</div>
        </div>
        <span style="font-size:11px;color:#ccc">›</span>
      </div>`;
    });
  }

  // 저장된 장소
  html += `<div class="fav-divider"></div>`;
  html += `<div class="fav-section-title">저장된 장소</div>`;

  if (savedPlaces.length === 0) {
    html += `<div class="fav-empty">저장된 장소가 없습니다<br><small>홈 화면 도착지 옆 ☆ 버튼으로 추가하세요</small></div>`;
  } else {
    savedPlaces.forEach((p, idx) => {
      html += `<div class="fav-item">
        <div class="fav-icon" style="background:#E6F1FB">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#185FA5"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
        </div>
        <div style="flex:1">
          <div class="fav-main">${p.label}</div>
          <div class="fav-sub">${p.name}</div>
        </div>
        <div class="place-tags">
          <span class="place-action-tag pat-from" onclick="quickSearchFrom('${p.name}','${p.lat}','${p.lng}')">출발</span>
          <span class="place-action-tag pat-to" onclick="quickSearchTo('${p.name}','${p.lat}','${p.lng}')">도착</span>
          <span class="place-action-tag" style="background:#fff;border:1px solid #eee;color:#ccc" onclick="deletePlace(${idx})">✕</span>
        </div>
      </div>`;
    });
  }

  body.innerHTML = html;
}

function deletePlace(idx) {
  savedPlaces.splice(idx, 1);
  localStorage.setItem('seocheon_places', JSON.stringify(savedPlaces));
  renderFavorites();
}

function saveCurrentTo() {
  if (!searchState.to) {
    alert('도착지를 먼저 선택해주세요');
    return;
  }
  const place = searchState.to;
  const label = prompt(`"${place.name}" 저장\n별칭을 입력하세요 (예: 집, 직장, 학교)`);
  if (!label) return;
  const newPlace = { ...place, label, type: 'saved' };
  savedPlaces = [newPlace, ...savedPlaces.filter(p => p.name !== place.name)].slice(0, 10);
  localStorage.setItem('seocheon_places', JSON.stringify(savedPlaces));
  const btn = document.getElementById('save-star-btn');
  if (btn) { btn.textContent = '★'; btn.style.color = '#1D9E75'; }
  setTimeout(() => { if (btn) { btn.textContent = '☆'; btn.style.color = ''; } }, 2000);
}

function quickSearch(from, to) {
  document.getElementById('text-from').textContent = from;
  document.getElementById('text-from').classList.remove('loc-placeholder');
  document.getElementById('text-to').textContent = to;
  document.getElementById('text-to').classList.remove('loc-placeholder');

  // 출발지 좌표: GPS현위치 or stops에서 검색
  if (from === '현위치') {
    searchState.from = { name: '현위치', lat: myLocation.lat, lng: myLocation.lng, isGps: true };
  } else {
    const fromStop = STOPS.find(s => s.name === from) ||
                     STOPS.find(s => s.name.includes(from.substring(0,4)));
    searchState.from = fromStop
      ? { name: from, lat: fromStop.lat, lng: fromStop.lng }
      : { name: from, lat: myLocation.lat, lng: myLocation.lng };
  }

  // 도착지 좌표
  const toStop = STOPS.find(s => s.name === to) ||
                 STOPS.find(s => s.name.includes(to.substring(0,3)));
  searchState.to = toStop
    ? { name: to, lat: toStop.lat, lng: toStop.lng }
    : { name: to, lat: myLocation.lat, lng: myLocation.lng };

  showScreen('home');
  setTimeout(() => searchRoute(), 300);
}

function quickSearchFrom(name, lat, lng) {
  searchState.from = { name, lat: parseFloat(lat), lng: parseFloat(lng) };
  document.getElementById('text-from').textContent = name;
  document.getElementById('text-from').classList.remove('loc-placeholder');
  showScreen('home');
}

function quickSearchTo(name, lat, lng) {
  searchState.to = { name, lat: parseFloat(lat), lng: parseFloat(lng) };
  document.getElementById('text-to').textContent = name;
  document.getElementById('text-to').classList.remove('loc-placeholder');
  showScreen('home');
}
