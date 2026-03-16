'use strict';

// ==================== 데이터 ====================
let ROUTES = [];
let STOPS = [];
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
});

async function loadData() {
  try {
    const res = await fetch('data/routes.json');
    const all = await res.json();
    ROUTES = all.filter(r => !r['노선군'].includes('타시도'));
  } catch(e) {
    console.warn('routes.json 로드 실패, 내장 데이터 사용');
  }
  try {
    const res = await fetch('data/stops.json');
    STOPS = await res.json();
  } catch(e) {
    console.warn('stops.json 로드 실패');
  }
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
function initLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => {
        myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (mapHome) {
          const latlng = new kakao.maps.LatLng(myLocation.lat, myLocation.lng);
          mapHome.setCenter(latlng);
          addMyMarker(mapHome, latlng);
        }
      },
      () => { /* GPS 실패 시 기본값 사용 */ }
    );
  }
}

// ==================== 홈 지도 ====================
function initHomeMap() {
  const container = document.getElementById('map-home');
  if (!container) return;
  const options = {
    center: new kakao.maps.LatLng(myLocation.lat, myLocation.lng),
    level: 8
  };
  mapHome = new kakao.maps.Map(container, options);

  // 줌 컨트롤
  mapHome.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  // 내 위치 마커
  addMyMarker(mapHome, new kakao.maps.LatLng(myLocation.lat, myLocation.lng));
}

function addMyMarker(map, latlng) {
  const markerImage = new kakao.maps.MarkerImage(
    'https://t1.daumcdn.net/localimg/localimages/07/mapapidoc/markerStar.png',
    new kakao.maps.Size(24, 35)
  );
  new kakao.maps.Marker({ position: latlng, map, zIndex: 10 });
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

  // 현위치 옵션 (출발지만)
  if (target === 'from') {
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

  const q = val.trim().toLowerCase();
  const results = STOPS.filter(s => s.name.includes(val.trim())).slice(0, 20);

  if (results.length === 0) {
    container.innerHTML = '<div class="loading">검색 결과가 없습니다</div>';
    return;
  }

  container.innerHTML = '<div class="modal-section-label">정류장 검색결과</div>' +
    results.map(s => `
    <div class="modal-item" style="display:flex;align-items:center">
      <div style="flex:1;display:flex;align-items:center;gap:8px" onclick="selectPlace('${placeSearchTarget}', {name:'${s.name}', lat:${s.lat}, lng:${s.lng}})">
        <div class="modal-item-icon">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#1D9E75"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
        </div>
        <div class="modal-item-name">${s.name}</div>
      </div>
      <button onclick="savePlace({name:'${s.name}',lat:${s.lat},lng:${s.lng}})" style="background:none;border:1px solid #ddd;border-radius:6px;padding:3px 8px;font-size:10px;color:#888;cursor:pointer;flex-shrink:0">저장</button>
    </div>`).join('');
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

  if (target === 'from') {
    const textEl = document.getElementById('text-from');
    const tagEl = document.getElementById('tag-from');
    textEl.textContent = place.name;
    textEl.classList.remove('loc-placeholder');
    if (place.isGps) {
      tagEl.style.display = '';
    } else {
      tagEl.style.display = 'none';
    }
    if (mapHome && !place.isGps) {
      mapHome.panTo(new kakao.maps.LatLng(place.lat, place.lng));
      updateHomeMarkers();
    }
  } else if (target === 'via') {
    const el = document.getElementById('text-via');
    el.textContent = place.name;
    el.classList.remove('loc-placeholder');
  } else if (target === 'to') {
    const el = document.getElementById('text-to');
    el.textContent = place.name;
    el.classList.remove('loc-placeholder');
    if (mapHome) {
      mapHome.panTo(new kakao.maps.LatLng(place.lat, place.lng));
      updateHomeMarkers();
    }
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

  // 기존 마커 제거
  if (homeFromMarker) homeFromMarker.setMap(null);
  if (homeToMarker) homeToMarker.setMap(null);
  if (homeFromLabel) homeFromLabel.setMap(null);
  if (homeToLabel) homeToLabel.setMap(null);

  const from = searchState.from;
  const to = searchState.to;

  if (from && from.lat && !from.isGps) {
    homeFromMarker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(from.lat, from.lng),
      map: mapHome, zIndex: 5
    });
    homeFromLabel = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(from.lat, from.lng),
      content: `<div style="background:#185FA5;color:#fff;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:600;white-space:nowrap;margin-bottom:4px">출발</div>`,
      yAnchor: 2.8
    });
    homeFromLabel.setMap(mapHome);
  }

  if (to && to.lat) {
    homeToMarker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(to.lat, to.lng),
      map: mapHome, zIndex: 5
    });
    homeToLabel = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(to.lat, to.lng),
      content: `<div style="background:#1D9E75;color:#fff;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:600;white-space:nowrap;margin-bottom:4px">도착</div>`,
      yAnchor: 2.8
    });
    homeToLabel.setMap(mapHome);
  }

  // 두 지점 모두 있으면 범위 맞춤
  if (from?.lat && to?.lat) {
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(new kakao.maps.LatLng(from.lat, from.lng));
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

function findRoutes(fromName, toName, searchTime, dayType) {
  const results = [];
  const fromKey = fromName.replace('현위치', '서천');

  // 직행 탐색
  ROUTES.forEach(route => {
    const stops = getRouteStops(route);
    const fromIdx = stops.findIndex(s => s.includes(fromKey));
    const toIdx = stops.findIndex(s => s.includes(toName));

    if (toIdx === -1) return;
    if (fromName !== '현위치' && fromIdx === -1) return;
    if (fromIdx !== -1 && fromIdx >= toIdx) return;

    const nextBus = getNextBus(route, searchTime, dayType);
    if (!nextBus) return;

    results.push({
      route, stops, nextBus,
      transferCount: 0,
      minutes: estimateMinutes(route['거리'] || 0),
      distanceKm: route['거리'] || 0,
      dayType, isTransfer: false
    });
  });

  // 환승 탐색 (직행 결과 없을 때)
  if (results.length === 0) {
    const HUBS_LIST = ['서천터미널', '장항터미널', '한산공용터미널'];
    HUBS_LIST.forEach(hub => {
      // 1구간: from → hub
      const leg1Routes = ROUTES.filter(r => {
        const stops = getRouteStops(r);
        const fi = stops.findIndex(s => s.includes(fromKey));
        const ti = stops.findIndex(s => s.includes(hub));
        return ti !== -1 && (fromName === '현위치' || fi !== -1) && (fi === -1 || fi < ti);
      });
      // 2구간: hub → to
      const leg2Routes = ROUTES.filter(r => {
        const stops = getRouteStops(r);
        const fi = stops.findIndex(s => s.includes(hub));
        const ti = stops.findIndex(s => s.includes(toName));
        return fi !== -1 && ti !== -1 && fi < ti;
      });

      if (leg1Routes.length > 0 && leg2Routes.length > 0) {
        const r1 = leg1Routes[0];
        const r2 = leg2Routes[0];
        const bus1 = getNextBus(r1, searchTime, dayType);
        if (!bus1) return;
        // 환승 후 다음 버스 (30분 여유)
        const [h, m] = bus1.split(':').map(Number);
        const transferTime = new Date(searchTime);
        transferTime.setHours(h, m + 30, 0);
        const bus2 = getNextBus(r2, transferTime, dayType);
        if (!bus2) return;

        results.push({
          route: r1, route2: r2,
          stops: getRouteStops(r1),
          stops2: getRouteStops(r2),
          nextBus: bus1, nextBus2: bus2,
          transferHub: hub,
          transferCount: 1,
          minutes: estimateMinutes((r1['거리']||0) + (r2['거리']||0)) + 15,
          distanceKm: (r1['거리']||0) + (r2['거리']||0),
          dayType, isTransfer: true
        });
      }
    });
  }

  results.sort((a, b) => a.minutes - b.minutes);
  return results.slice(0, 3);
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
function renderResults(results, toName, fromName, timeStr, dayType) {
  const body = document.getElementById('result-body');

  if (results.length === 0) {
    body.innerHTML = `<div class="no-result">
      <div class="no-result-icon">🚌</div>
      <div class="no-result-text">검색된 경로가 없습니다</div>
      <div class="no-result-sub">${timeStr} 이후 운행하는 버스가 없거나<br>직접 연결 노선이 없습니다</div>
    </div>`;
    return;
  }

  let html = '';

  results.forEach((r, i) => {
    const isBest = i === 0;
    const waitMin = getMinutesUntil(r.nextBus);
    const waitText = formatWaitTime(waitMin);
    const stops = r.stops;
    const routePreview = stops.slice(0,4).join(' → ') + (stops.length > 4 ? ' ...' : '');

    if (r.isTransfer) {
      html += `<div class="route-card" onclick="showDetail(${i})">
        <div class="rc-top">
          <span class="rc-time">${r.minutes}분</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
        <div class="rc-route">
          <span class="bus-pill">${r.route['번호']}번</span>
          <span class="route-arrow">→ ${r.transferHub} 환승 →</span>
          <span class="bus-pill">${r.route2['번호']}번</span>
        </div>
        <div class="rc-info">${r.transferHub}에서 환승 · ${r.nextBus2} 출발</div>
        <div class="rc-next">첫 버스 <strong>${r.nextBus}</strong> 출발 · <span style="color:#1D9E75">${waitText}</span></div>
      </div>`;
      return;
    }

    html += `<div class="route-card ${isBest ? 'best' : ''}" onclick="showDetail(${i})">
      <div class="rc-top">
        <span class="rc-time">${r.minutes}분</span>
        <span class="rc-badge ${isBest ? 'badge-best' : 'badge-transfer'}">${isBest ? '최단 직행' : '직행'}</span>
      </div>
      <div class="rc-route">
        <span class="bus-pill">${r.route['번호']}번 ${r.route['노선군'].replace(/[0-9~번]/g,'').trim().substring(0,4)}</span>
        <span class="route-arrow">직행 ${r.distanceKm}km</span>
      </div>
      <div class="rc-info">${routePreview}</div>
      <div class="rc-next">다음 버스 <strong>${r.nextBus}</strong> 출발 · <span style="color:#1D9E75">${waitText}</span></div>
    </div>`;
  });

  // 시간표 채우기
  const bestRoute = results[0].route;
  const countKey = dayType === 'weekday' ? '평일횟수' : dayType === 'sat' ? '토요일횟수' : '공휴일횟수';
  const count = bestRoute[countKey] || 0;
  const firstStr = bestRoute['첫차'];
  const lastStr = bestRoute['막차'];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (count > 0 && firstStr && lastStr) {
    const [fh, fm] = firstStr.split(':').map(Number);
    const [lh, lm] = lastStr.split(':').map(Number);
    const firstMin = fh * 60 + fm;
    const lastMin = lh * 60 + lm;
    const interval = count > 1 ? Math.round((lastMin - firstMin) / (count - 1)) : 0;
    const times = [];
    for (let i = 0; i < count; i++) {
      const t = firstMin + interval * i;
      const h = Math.floor(t / 60);
      const m = t % 60;
      times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
    }
    const nextBusTime = results[0].nextBus;

    html += `<div class="tt-fill">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="background:#1D9E75;color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700">${bestRoute['번호']}번</span>
        <span style="font-size:13px;font-weight:600;color:#333">${bestRoute['기점']} → ${bestRoute['종점']}</span>
      </div>
      <div style="font-size:11px;color:#aaa;margin-bottom:10px;padding:0 2px">※ 추정 시간표 · 실제와 다를 수 있음</div>
      <div class="tt-grid">`;
    times.forEach(t => {
      const [th, tm] = t.split(':').map(Number);
      const tMin = th * 60 + tm;
      const isPassed = tMin < nowMin;
      const isNext = t === nextBusTime;
      html += `<div class="tt-chip ${isNext ? 'next-dep' : ''} ${isPassed ? 'passed' : ''}">
        <div class="tt-chip-time ${isPassed ? 'passed-time' : ''}">${t}</div>
        <div class="tt-chip-lbl">${isNext ? '다음 출발' : isPassed ? '지나침' : t === lastStr ? '막차' : ''}</div>
      </div>`;
    });
    html += `</div></div>`;
  }

  // 복귀 배너
  const returnRoute = findReturnRoute(results[0], dayType);
  if (returnRoute) {
    html += `<div class="return-banner">
      <div class="ret-title">복귀 추천 (${returnRoute.route['번호']}번)</div>
      <div class="ret-row">
        <span class="ret-info">${toName} → ${fromName}</span>
        <span class="ret-time">막차 ${returnRoute.route['막차']}</span>
      </div>
    </div>`;
  }

  body.innerHTML = html;

  // 상세 보기 위해 데이터 저장
  window._searchResults = results;
}

function findReturnRoute(forwardResult, dayType) {
  const from = forwardResult.route['종점'];
  const to = forwardResult.route['기점'];
  const matching = ROUTES.filter(r => {
    return r['기점'].includes(from.substring(0,3)) || r['종점'].includes(from.substring(0,3));
  });
  return matching.length > 0 ? { route: matching[0] } : null;
}

// ==================== 경로 상세 ====================
function showDetail(idx) {
  const results = window._searchResults || [];
  if (!results[idx]) return;
  detailRoute = results[idx];

  document.getElementById('live-bus-name').textContent =
    `${detailRoute.route['번호']}번 ${detailRoute.route['노선군'].replace(/[0-9~번]/g,'').trim()} 운행중`;
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

  let html = '';
  stops.forEach((name, i) => {
    const isDone = i < 1;
    const isCurrent = i === 1;
    const isEnd = i === stops.length - 1;
    const etaMin = departMin + i * avgMinPerStop;
    const etaH = Math.floor(etaMin / 60) % 24;
    const etaM = etaMin % 60;
    const etaStr = `${String(etaH).padStart(2,'0')}:${String(etaM).padStart(2,'0')} 도착`;

    let circleClass = 'sc-upcoming';
    if (isDone) circleClass = 'sc-done';
    if (isCurrent) circleClass = 'sc-current';
    if (isEnd) circleClass = 'sc-end';

    let nameClass = isDone ? 'done' : isCurrent ? 'current' : '';
    const hasLine = i < stops.length - 1;

    let etaEl = '';
    if (isDone) etaEl = `<span class="stop-eta" style="color:#ccc">통과</span>`;
    else if (isCurrent) etaEl = `<span class="stop-current-tag">6분 후 도착</span>`;
    else etaEl = `<span class="stop-eta">${etaStr}</span>`;

    html += `<div class="stop-row ${isCurrent ? 'current' : ''}">
      <div class="stop-track">
        <div class="stop-circle ${circleClass}"></div>
        ${hasLine ? '<div class="stop-vline"></div>' : ''}
      </div>
      <span class="stop-name ${nameClass}">${name}</span>
      ${etaEl}
    </div>`;
  });

  document.getElementById('stop-list').innerHTML = html;
}

function initDetailMap(result) {
  const container = document.getElementById('map-detail');
  if (!container) return;

  // 기존 지도 초기화
  if (mapDetail) {
    mapDetail = null;
    container.innerHTML = '';
  }

  // 출발지·도착지 좌표 찾기
  const fromName = searchState.from ? searchState.from.name : '서천터미널';
  const toName = searchState.to ? searchState.to.name : '';

  const fromStop = searchState.from?.lat
    ? searchState.from
    : STOPS.find(s => s.name.includes(fromName.substring(0,4)));
  const toStop = searchState.to?.lat
    ? searchState.to
    : STOPS.find(s => s.name.includes(toName.substring(0,4)));

  const centerLat = fromStop ? fromStop.lat : myLocation.lat;
  const centerLng = fromStop ? fromStop.lng : myLocation.lng;

  mapDetail = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(centerLat, centerLng),
    level: 9
  });

  // 출발지 마커 (파란색)
  if (fromStop) {
    const fromMarker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(fromStop.lat, fromStop.lng),
      map: mapDetail
    });
    const fromLabel = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(fromStop.lat, fromStop.lng),
      content: `<div style="background:#185FA5;color:#fff;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:600;white-space:nowrap;margin-bottom:4px">출발</div>`,
      yAnchor: 2.8
    });
    fromLabel.setMap(mapDetail);
  }

  // 도착지 마커 (초록색)
  if (toStop) {
    const toMarker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(toStop.lat, toStop.lng),
      map: mapDetail
    });
    const toLabel = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(toStop.lat, toStop.lng),
      content: `<div style="background:#1D9E75;color:#fff;border-radius:6px;padding:2px 7px;font-size:11px;font-weight:600;white-space:nowrap;margin-bottom:4px">도착</div>`,
      yAnchor: 2.8
    });
    toLabel.setMap(mapDetail);
  }

  // 두 지점이 모두 있으면 지도 범위 자동 조정
  if (fromStop && toStop) {
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(new kakao.maps.LatLng(fromStop.lat, fromStop.lng));
    bounds.extend(new kakao.maps.LatLng(toStop.lat, toStop.lng));
    mapDetail.setBounds(bounds, 80);
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
  const name = route['노선군'] + route['번호'];
  for (let i = 1; i < ZONES.length; i++) {
    const z = ZONES[i];
    if (z.keywords.some(k => name.includes(k))) return z.color;
  }
  // 번호 기반 매핑
  const num = parseInt(route['번호']) || 0;
  if (num >= 10 && num < 30) return ZONES[1].color; // 장항
  if (num >= 1 && num < 10) return ZONES[2].color;  // 동백
  if (num >= 30 && num < 40) return ZONES[3].color; // 한산
  if (num >= 40 && num < 60) return ZONES[4].color; // 판교
  return '#888';
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

  container.innerHTML = filtered.map(r => {
    const color = getZoneColor(r);
    const countKey = getDayType() === 'weekday' ? '평일횟수' : '토요일횟수';
    return `<div class="route-list-item" onclick="showRouteTimetable('${r['번호']}'); showRouteOnMap(${JSON.stringify({기점:r['기점'],종점:r['종점']})})">
      <span class="rli-num" style="background:${color}">${r['번호']}</span>
      <div class="rli-info">
        <div class="rli-name">${r['노선군'].replace('~','~')}</div>
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

function showRouteTimetable(routeNum) {
  const route = ROUTES.find(r => r['번호'] === routeNum);
  if (!route) return;

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
      return `<span class="tt-chip ${isNext?'next-dep':''} ${passed?'passed':''}" style="font-size:13px;padding:6px 10px">
        <div class="tt-chip-time ${passed?'passed-time':''}">${t}</div>
        <div class="tt-chip-lbl">${isNext?'다음':''}${t===lastStr?'막차':''}</div>
      </span>`;
    }).join('');
  }

  const panel = document.createElement('div');
  panel.id = 'route-tt-panel';
  panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:20px 20px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,0.15);z-index:999;padding:16px;max-height:70vh;overflow-y:auto';
  panel.innerHTML = `
    <div style="width:40px;height:4px;background:#e0e0e0;border-radius:2px;margin:0 auto 16px"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <span style="background:#1D9E75;color:#fff;border-radius:6px;padding:3px 10px;font-weight:600;font-size:15px">${route['번호']}번</span>
        <span style="margin-left:8px;font-size:14px;color:#333">${route['노선군']}</span>
      </div>
      <button onclick="document.getElementById('route-tt-panel').remove();document.getElementById('route-tt-overlay').remove()" style="background:none;border:none;font-size:20px;color:#999;cursor:pointer">✕</button>
    </div>
    <div style="font-size:13px;color:#666;margin-bottom:8px">${route['기점']} → ${route['종점']} · ${route['거리']}km</div>
    <div style="font-size:12px;color:#aaa;margin-bottom:12px">경유: ${route['경유']}</div>
    <div style="font-size:12px;color:#888;margin-bottom:8px">오늘 시간표 (${dayType==='weekday'?'평일':dayType==='sat'?'토요일':'공휴일'} ${count}회) ※ 추정</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px">${timesHtml}</div>
    <div style="height:20px"></div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'route-tt-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:998';
  overlay.onclick = () => { panel.remove(); overlay.remove(); };

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

function initRoutesMap() {
  const container = document.getElementById('map-routes');
  if (!container) return;
  mapRoutes = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(36.0758, 126.6908),
    level: 10
  });
}

let routeMarkers = [];
function showRouteOnMap(route) {
  if (!mapRoutes) return;
  routeMarkers.forEach(m => m.setMap(null));
  routeMarkers = [];

  // 기점·종점 stops에서 좌표 찾기
  const fromStop = STOPS.find(s => s.name.includes(route['기점'].substring(0,4)));
  const toStop = STOPS.find(s => s.name.includes(route['종점'].substring(0,4)));

  if (fromStop) {
    const marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(fromStop.lat, fromStop.lng),
      map: mapRoutes
    });
    routeMarkers.push(marker);
  }
  if (toStop) {
    const marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(toStop.lat, toStop.lng),
      map: mapRoutes
    });
    routeMarkers.push(marker);
  }
  if (fromStop && toStop) {
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(new kakao.maps.LatLng(fromStop.lat, fromStop.lng));
    bounds.extend(new kakao.maps.LatLng(toStop.lat, toStop.lng));
    mapRoutes.setBounds(bounds);
  }
}

// ==================== 고속·기차 ====================
function initHubGrid() {
  const container = document.getElementById('hub-grid');
  if (!container) return;

  let html = '';
  HUBS.forEach((hub, i) => {
    const isNearest = i === 0;
    const dist = isNearest ? '도보 8분' : i === 1 ? '차 12분' : i === 2 ? '차 18분' : '차 20분';
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // 기차(상행/하행) vs 버스(destinations) 구분
    const destList = hub.direction ? hub.upward : hub.destinations;
    const nextDest = destList[0];
    const nextTime = nextDest.times.find(t => {
      const [th, tm] = t.split(':').map(Number);
      return th * 60 + tm >= nowMin;
    }) || '운행종료';
    const nextDest2 = destList.length > 1 ? destList[1] : null;
    const nextTime2 = nextDest2 ? (nextDest2.times.find(t => {
      const [th,tm] = t.split(':').map(Number); return th*60+tm >= nowMin;
    }) || '') : '';

    const iconColor = hub.type === 'train' ? '#3B6D11' : '#0F6E56';
    const iconBg = hub.type === 'train' ? '#EAF3DE' : '#E1F5EE';
    const icon = hub.type === 'train'
      ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="2" width="11" height="8" rx="1.2" stroke="${iconColor}" stroke-width="1.1"/><line x1="1.5" y1="5.5" x2="12.5" y2="5.5" stroke="${iconColor}" stroke-width=".9"/><line x1="4" y1="10" x2="3" y2="12.5" stroke="${iconColor}" stroke-width=".9" stroke-linecap="round"/><line x1="10" y1="10" x2="11" y2="12.5" stroke="${iconColor}" stroke-width=".9" stroke-linecap="round"/></svg>`
      : `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="4" width="12" height="7" rx="1.5" stroke="${iconColor}" stroke-width="1.1"/><circle cx="3.5" cy="11" r="1" fill="${iconColor}"/><circle cx="10.5" cy="11" r="1" fill="${iconColor}"/></svg>`;

    html += `<div class="hub-card ${isNearest ? 'nearest' : ''}" onclick="showHubDetail(${i})">
      <div class="hub-top">
        <div class="hub-icon" style="background:${iconBg}">${icon}</div>
        <div>
          <div class="hub-name">${hub.name}</div>
          ${isNearest ? '<span class="hub-nearest-tag">가장 가까움</span>' : ''}
        </div>
      </div>
      <div class="hub-dist">현위치에서 ${dist}</div>
      <div class="hub-divider"></div>
      <div class="hub-next">다음 ${nextTime} → ${nextDest.name.split('(')[0]}</div>
      <div class="hub-more">${nextDest2 && nextTime2 ? `이후 ${nextTime2} · ${nextDest2.name.split('(')[0]}` : ''}</div>
    </div>`;
  });

  container.innerHTML = html;
  document.getElementById('hub-grid').insertAdjacentHTML('afterend',
    '<div class="hub-hint">탭하면 전체 시간표 · 예매 링크</div>');
}

function showHubDetail(idx) {
  const hub = HUBS[idx];
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const grid = document.getElementById('hub-grid');
  const hint = grid.nextElementSibling;
  const detail = document.getElementById('hub-detail');

  grid.style.display = 'none';
  if (hint) hint.style.display = 'none';
  detail.style.display = 'block';

  let html = `<div class="hub-detail-back" onclick="closeHubDetail()">
    <span class="hub-detail-back-btn">‹</span>
    <div>
      <div class="hub-detail-title">${hub.name}</div>
      <div class="hub-detail-sub">오늘 ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')} 기준 · 지난 시간 제외</div>
    </div>
  </div>`;

  // 기차: 상행/하행 탭으로 렌더링
  if (hub.direction && hub.upward && hub.downward) {
    html += `
    <div style="display:flex;gap:0;margin:0 0 12px;border-bottom:2px solid #eee">
      <button id="dir-up-btn" onclick="switchDirection('up','${hub.id}')"
        style="flex:1;padding:10px;border:none;background:none;font-size:13px;font-weight:700;color:#1D9E75;border-bottom:2px solid #1D9E75;margin-bottom:-2px;cursor:pointer">
        ↑ 상행 (서울·대전 방면)
      </button>
      <button id="dir-down-btn" onclick="switchDirection('down','${hub.id}')"
        style="flex:1;padding:10px;border:none;background:none;font-size:13px;font-weight:500;color:#999;cursor:pointer">
        ↓ 하행 (익산·군산 방면)
      </button>
    </div>
    <div id="dir-up">`;
    hub.upward.forEach((dest, di) => {
      html += renderDestSection(dest, di, nowMin);
    });
    html += `</div>
    <div id="dir-down" style="display:none">`;
    hub.downward.forEach((dest, di) => {
      html += renderDestSection(dest, di, nowMin);
    });
    html += `</div>`;
  } else {
    hub.destinations.forEach((dest, di) => {
      html += renderDestSection(dest, di, nowMin);
    });
  }

  html += `<a class="book-link" href="${hub.bookUrl}" target="_blank">
    <span class="book-link-text">${hub.bookLabel}</span>
    <span class="book-link-arr">→</span>
  </a>
  <div style="font-size:11px;color:#aaa;text-align:center;padding:10px 0 4px">※ 시간표는 참고용이며 실제와 다를 수 있습니다. 예매 전 반드시 확인하세요.</div>
  <div style="height:16px"></div>`;

  detail.innerHTML = html;
}

function renderDestSection(dest, di, nowMin) {
  const remainTimes = dest.times.filter(t => {
    const [th, tm] = t.split(':').map(Number);
    return th * 60 + tm >= nowMin;
  });
  let html = `<div class="dest-section ${di === 0 ? 'featured' : ''}">`;
  if (di === 0) {
    html += `<div class="dest-header"><span class="dest-name">${dest.name}</span><span class="dest-duration">${dest.duration}</span></div>`;
  } else {
    html += `<div class="dest-header-plain"><span class="dest-name-plain">${dest.name}</span><span class="dest-duration" style="font-size:10px;color:#888">${dest.duration}</span></div>`;
  }
  html += `<div class="dest-body"><div class="dest-times">`;
  if (remainTimes.length === 0) {
    html += `<span class="dest-time" style="color:#ccc">오늘 운행 종료</span>`;
  } else {
    remainTimes.forEach((t, ti) => {
      const isLast = t === dest.times[dest.times.length - 1];
      html += `<span class="dest-time ${ti === 0 ? 'next' : ''} ${isLast ? 'last' : ''}">${t}${ti === 0 ? ' 출발' : ''}${isLast ? ' 막차' : ''}</span>`;
    });
  }
  html += `</div>`;
  if (di === 0 && dest.lastReturn) {
    html += `<div class="return-box"><div class="return-box-label">복귀 막차</div><div class="return-box-value">${dest.lastReturn}</div></div>`;
  }
  html += `</div></div>`;
  return html;
}

function switchDirection(dir, hubId) {
  document.getElementById('dir-up').style.display = dir === 'up' ? 'block' : 'none';
  document.getElementById('dir-down').style.display = dir === 'down' ? 'block' : 'none';
  document.getElementById('dir-up-btn').style.color = dir === 'up' ? '#1D9E75' : '#999';
  document.getElementById('dir-up-btn').style.borderBottom = dir === 'up' ? '2px solid #1D9E75' : 'none';
  document.getElementById('dir-down-btn').style.color = dir === 'down' ? '#1D9E75' : '#999';
  document.getElementById('dir-down-btn').style.borderBottom = dir === 'down' ? '2px solid #1D9E75' : 'none';
}

function transportBack() {
  const detail = document.getElementById('hub-detail');
  if (detail && detail.style.display !== 'none') {
    closeHubDetail();
  } else {
    showScreen('home');
  }
}

function closeHubDetail() {
  const grid = document.getElementById('hub-grid');
  const hint = grid.nextElementSibling;
  const detail = document.getElementById('hub-detail');
  grid.style.display = 'grid';
  if (hint) hint.style.display = 'block';
  detail.style.display = 'none';
  detail.innerHTML = '';
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

  // 자주 이용한 경로
  html += `<div class="fav-section-title">자주 이용한 경로</div>`;
  if (routeHistory.length === 0) {
    html += `<div class="fav-empty">검색 이력이 없습니다<br><small>경로를 검색하면 자동으로 기록됩니다</small></div>`;
  } else {
    routeHistory.slice(0, 5).forEach((h, i) => {
      const matchRoute = ROUTES.find(r =>
        (r['기점'].includes(h.from.substring(0,3)) || h.from === '현위치') &&
        r['종점'].includes(h.to.substring(0,3))
      );
      const nextBusText = matchRoute ? getNextBus(matchRoute, new Date(), getDayType()) || '시간표 확인' : '';

      html += `<div class="fav-item" onclick="quickSearch('${h.from}','${h.to}')">
        <div class="fav-icon" style="background:#E1F5EE">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 7h11M7 1.5l5.5 5.5-5.5 5.5" stroke="#0F6E56" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="flex:1">
          <div class="fav-main">${h.from} → ${h.to}</div>
          <div class="fav-sub">${matchRoute ? `${matchRoute['번호']}번 · ${matchRoute['거리']}km` : ''}${nextBusText ? ` · 다음 ${nextBusText}` : ''}</div>
          <div class="fav-count">이번달 ${h.count}회 이용</div>
        </div>
        <span class="fav-star ${i < 2 ? '' : 'off'}">${i < 2 ? '★' : '★'}</span>
      </div>`;
    });
  }

  // 저장된 장소
  html += `<div class="fav-divider"></div>`;
  html += `<div class="fav-section-title">저장된 장소</div>`;

  if (savedPlaces.length === 0) {
    html += `<div class="fav-empty">저장된 장소가 없습니다<br><small>장소 검색 시 저장 버튼으로 추가하세요</small></div>`;
  } else {
    savedPlaces.forEach(p => {
      const iconBg = p.type === 'home' ? '#E6F1FB' : '#FFF3E0';
      const icon = p.type === 'home'
        ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7l5-5 5 5" stroke="#185FA5" stroke-width="1.3"/><rect x="4" y="8" width="6" height="5" rx=".5" stroke="#185FA5" stroke-width="1.1"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="5" width="10" height="8" rx="1" stroke="#E65100" stroke-width="1.1"/><path d="M5 5V3.5a2 2 0 014 0V5" stroke="#E65100" stroke-width="1.1"/></svg>`;

      html += `<div class="fav-item">
        <div class="fav-icon" style="background:${iconBg}">${icon}</div>
        <div style="flex:1">
          <div class="fav-main">${p.label}</div>
          <div class="fav-sub">${p.name}</div>
        </div>
        <div class="place-tags">
          <span class="place-action-tag pat-from" onclick="quickSearchFrom('${p.name}','${p.lat}','${p.lng}')">출발</span>
          <span class="place-action-tag pat-to" onclick="quickSearchTo('${p.name}','${p.lat}','${p.lng}')">도착</span>
        </div>
      </div>`;
    });
  }

  body.innerHTML = html;
}

function quickSearch(from, to) {
  document.getElementById('text-from').textContent = from;
  document.getElementById('text-from').classList.remove('loc-placeholder');
  document.getElementById('text-to').textContent = to;
  document.getElementById('text-to').classList.remove('loc-placeholder');
  searchState.from = { name: from, lat: myLocation.lat, lng: myLocation.lng };
  const toStop = STOPS.find(s => s.name.includes(to.substring(0,3)));
  searchState.to = toStop || { name: to, lat: myLocation.lat, lng: myLocation.lng };
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
