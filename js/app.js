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

  // 초기 history 상태 설정
  history.replaceState({ screen: 'home' }, '', '');

  // 폰 뒤로가기 처리
  window.addEventListener('popstate', (e) => {
    const screen = e.state?.screen || 'home';
    if (screen === 'home') {
      // 홈이면 그냥 앱 종료 허용 (브라우저 기본 동작)
      if (currentScreen !== 'home') {
        showScreenNoHistory('home');
        history.replaceState({ screen: 'home' }, '', '');
      }
    } else {
      showScreenNoHistory(screen);
    }
  });
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
    const raw = await res.json();
    STOPS = buildDisplayNames(raw); // 원본 불변, 메모리에서 구분명 계산
  } catch(e) {
    console.warn('stops.json 로드 실패');
  }
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
      result[sorted[0]].displayName = `${name}(내향)`;
      result[sorted[1]].displayName = `${name}(외향)`;
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
          updateMyMarker(mapHome, latlng); // 기존 마커 지우고 새로 찍기
        }
      },
      () => { /* GPS 실패 시 기본값(서천) 유지 */ }
    );
  }
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

function findRoutes(fromName, toName, searchTime, dayType) {
  const results = [];

  // 현위치인 경우 GPS 좌표로 가장 가까운 정류장 찾기
  let fromKey = fromName;
  if (fromName === '현위치' || searchState.from?.isGps) {
    const nearest = STOPS.map(s => ({
      ...s,
      dist: Math.sqrt((s.lat - myLocation.lat)**2 + (s.lng - myLocation.lng)**2)
    })).sort((a,b) => a.dist - b.dist)[0];
    fromKey = nearest ? nearest.name.substring(0,4) : '서천터미널';
  }

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
    body.innerHTML = `<div class="no-result">
      <div class="no-result-icon">🚌</div>
      <div class="no-result-text">검색된 경로가 없습니다</div>
      <div class="no-result-sub">${timeStr} 이후 운행하는 버스가 없거나<br>직접 연결 노선이 없습니다</div>
    </div>`;
    window._searchResults = [];
    return;
  }

  let html = '';

  // 섹션1: 경로 카드
  html += '<div class="result-section-label">경로 검색 결과</div>';
  results.forEach((r, i) => {
    const isBest = i === 0;
    const waitMin = getMinutesUntil(r.nextBus);
    const waitText = formatWaitTime(waitMin);

    if (r.isTransfer) {
      html += `<div class="route-card transfer-card" onclick="showDetail(${i})">
        <div class="rc-top">
          <span class="rc-time">${r.minutes}분</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
        <div class="rc-route">
          <span class="bus-pill">${r.route['번호']}번</span>
          <span class="route-arrow">→ ${r.transferHub} →</span>
          <span class="bus-pill">${r.route2['번호']}번</span>
        </div>
        <div class="rc-info">${r.transferHub}에서 환승 · 2번째 ${r.nextBus2} 출발</div>
        <div class="rc-next">첫 버스 <strong>${r.nextBus}</strong> · <span style="color:#1D9E75">${waitText}</span></div>
      </div>`;
      return;
    }

    html += `<div class="route-card ${isBest ? 'best' : ''}" onclick="showDetail(${i})">
      ${isBest ? '<div class="best-label">추천</div>' : ''}
      <div class="rc-top">
        <span class="rc-time">${r.minutes}분</span>
        <span class="rc-badge ${isBest ? 'badge-best' : 'badge-alt'}">${isBest ? '최단 직행' : '직행'}</span>
      </div>
      <div class="rc-route">
        <span class="bus-pill">${r.route['번호']}번</span>
        <span class="route-arrow">${r.route['노선군'].replace(/[0-9~]/g,'').trim().substring(0,6)}</span>
        <span style="font-size:11px;color:#aaa">${r.distanceKm}km</span>
      </div>
      <div class="rc-info">${r.stops.slice(0,4).join(' → ')}${r.stops.length > 4 ? ' ...' : ''}</div>
      <div class="rc-next">다음 버스 <strong>${r.nextBus}</strong> · <span style="color:#1D9E75">${waitText}</span></div>
    </div>`;
  });

  // 섹션2: 추천 노선 시간표
  const best = results[0];
  if (!best.isTransfer) {
    const bestRoute = best.route;
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
        times.push(String(Math.floor(t/60)).padStart(2,'0') + ':' + String(t%60).padStart(2,'0'));
      }

      html += '<div class="result-section-label" style="margin-top:4px">오늘 시간표</div>';
      html += `<div class="tt-fill">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="background:#1D9E75;color:#fff;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700">${bestRoute['번호']}번</span>
          <span style="font-size:12px;color:#555">${bestRoute['기점']} → ${bestRoute['종점']}</span>
        </div>
        <div style="font-size:11px;color:#bbb;margin-bottom:8px">※ 추정 시간표 · 실제와 다를 수 있음</div>
        <div class="tt-grid">`;
      times.forEach(t => {
        const [th, tm] = t.split(':').map(Number);
        const tMin = th * 60 + tm;
        const isPassed = tMin < nowMin;
        const isNext = t === best.nextBus;
        html += `<div class="tt-chip ${isNext ? 'next-dep' : ''} ${isPassed ? 'passed' : ''}">
          <div class="tt-chip-time ${isPassed ? 'passed-time' : ''}">${t}</div>
          <div class="tt-chip-lbl">${isNext ? '다음' : t === lastStr ? '막차' : ''}</div>
        </div>`;
      });
      html += '</div></div>';
    }
  }

  // 섹션3: 복귀 정보
  const returnRoute = findReturnRoute(best, dayType);
  if (returnRoute) {
    html += '<div class="result-section-label" style="margin-top:4px">복귀 정보</div>';
    html += `<div class="return-banner">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="background:#E1F5EE;color:#0F6E56;border-radius:6px;padding:2px 8px;font-size:12px;font-weight:700">${returnRoute.route['번호']}번</span>
        <span style="font-size:13px;font-weight:600;color:#333">${toName} → ${fromName}</span>
      </div>
      <div class="ret-row">
        <span class="ret-info">첫차 ${returnRoute.route['첫차']} · 막차 ${returnRoute.route['막차']}</span>
        <span class="ret-time">하루 ${returnRoute.route['평일횟수']}회</span>
      </div>
    </div>`;
  }

  body.innerHTML = html;
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

  if (mapDetail) {
    mapDetail = null;
    container.innerHTML = '';
  }

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

  // 경유 정류장 좌표 수집
  const routeStops = result.stops || [];
  const coordList = [];

  routeStops.forEach((stopName, i) => {
    const matched = STOPS.find(s => s.name.includes(stopName.substring(0,4)));
    if (!matched) return;
    const latlng = new kakao.maps.LatLng(matched.lat, matched.lng);
    coordList.push(latlng);

    const isFirst = i === 0;
    const isLast = i === routeStops.length - 1;
    const isBoard = i === 1;

    if (isFirst || isLast || isBoard) {
      // 주요 정류장만 마커+라벨
      const color = isFirst ? '#185FA5' : isLast ? '#1D9E75' : '#EF9F27';
      const label = isFirst ? '출발' : isLast ? '도착' : '탑승';
      new kakao.maps.CustomOverlay({
        position: latlng,
        content: `<div style="background:${color};color:#fff;border-radius:20px;padding:3px 8px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.2);margin-bottom:2px">${label}</div>`,
        yAnchor: 2.2
      }).setMap(mapDetail);
      new kakao.maps.CustomOverlay({
        position: latlng,
        content: `<div style="width:10px;height:10px;background:${color};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
        yAnchor: 0.5
      }).setMap(mapDetail);
    } else {
      // 중간 정류장은 작은 점
      new kakao.maps.CustomOverlay({
        position: latlng,
        content: `<div style="width:6px;height:6px;background:#1D9E75;border:1.5px solid #fff;border-radius:50%;opacity:0.7"></div>`,
        yAnchor: 0.5
      }).setMap(mapDetail);
    }
  });

  // 노선 폴리라인 그리기
  if (coordList.length >= 2) {
    new kakao.maps.Polyline({
      map: mapDetail,
      path: coordList,
      strokeWeight: 4,
      strokeColor: '#1D9E75',
      strokeOpacity: 0.8,
      strokeStyle: 'solid'
    });
  }

  // 지도 범위 자동 조정
  if (coordList.length >= 2) {
    const bounds = new kakao.maps.LatLngBounds();
    coordList.forEach(ll => bounds.extend(ll));
    mapDetail.setBounds(bounds, 60);
  } else if (fromStop && toStop) {
    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(new kakao.maps.LatLng(fromStop.lat, fromStop.lng));
    bounds.extend(new kakao.maps.LatLng(toStop.lat, toStop.lng));
    mapDetail.setBounds(bounds, 60);
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

  window._filteredRoutes = filtered;
  container.innerHTML = filtered.map((r, idx) => {
    const color = getZoneColor(r);
    return `<div class="route-list-item" onclick="showRouteTimetable('${r['번호']}', ${idx})">
      <span class="rli-num" style="background:${color}">${r['번호']}</span>
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

function showRouteTimetable(routeNum, idx) {
  const route = (window._filteredRoutes && idx !== undefined)
    ? window._filteredRoutes[idx]
    : ROUTES.find(r => r['번호'] === routeNum);
  if (!route) return;

  // 지도에 기점/종점 표시
  if (mapRoutes) showRouteOnMap(route);

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
