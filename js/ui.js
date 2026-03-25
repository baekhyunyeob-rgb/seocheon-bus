'use strict';

// ==================== 탭바 ====================
const TABS = [
  {
    id: 'home',
    label: '홈',
    onclick: "showScreen('home')",
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 11L11 3L19 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="7" y="12" width="8" height="7" rx="1.2" stroke="currentColor" stroke-width="1.5"/></svg>`,
    activeColor: '#1D9E75',
  },
  {
    id: 'timetable',
    label: '버스시간표',
    onclick: "showScreen('timetable')",
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="3" y="4" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 9h16M8 4V8M14 4V8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    activeColor: '#EF9F27',
  },
  {
    id: 'routes',
    label: '버스노선도',
    onclick: "showScreen('routes')",
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="6" width="18" height="11" rx="2.5" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="14" r="2" fill="currentColor"/><circle cx="16" cy="14" r="2" fill="currentColor"/><path d="M2 10h18" stroke="currentColor" stroke-width="1.3"/></svg>`,
    activeColor: '#185FA5',
  },
  {
    id: 'transport',
    label: '시외버스·기차',
    onclick: "showScreen('transport')",
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="5" width="18" height="10" rx="2" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="16.5" r="2" fill="currentColor"/><circle cx="16" cy="16.5" r="2" fill="currentColor"/><path d="M2 19h18" stroke="currentColor" stroke-width="1.3"/></svg>`,
    activeColor: '#7F77DD',
  },
  {
    id: 'favorites',
    label: '즐겨찾기',
    onclick: "showScreen('favorites')",
    icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8L5.6 18.7l1-6L2.2 8.4l6.1-.9z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
    activeColor: '#EF9F27',
    activeIcon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8L5.6 18.7l1-6L2.2 8.4l6.1-.9z" fill="#EF9F27" stroke="#EF9F27" stroke-width="0.5" stroke-linejoin="round"/></svg>`,
  },
];

function renderAllTabbars() {
  document.querySelectorAll('nav.tabbar[id^="tabbar-"]').forEach(nav => {
    const screenName = nav.id.replace('tabbar-', '');
    nav.innerHTML = TABS.map(tab => {
      const isActive = tab.id === screenName ||
        (screenName === 'result' && tab.id === 'home') ||
        (screenName === 'detail' && tab.id === 'home');
      const color = isActive ? tab.activeColor : 'currentColor';
      const icon  = (isActive && tab.activeIcon) ? tab.activeIcon
        : tab.icon.replace(/stroke="currentColor"/g, `stroke="${color}"`).replace(/fill="currentColor"/g, `fill="${color}"`);
      const tabId = (tab.id === 'home') ? `id="tab-${screenName}"` : `id="tab-${tab.id}"`;
      return `<div class="tab${isActive ? ' active' : ''}" ${tabId} onclick="${tab.onclick}" style="color:${color}">
        ${icon}
        <span>${tab.label}</span>
      </div>`;
    }).join('');
  });
}

// ==================== 화면 전환 ====================
function showScreen(name, pushHistory = true) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display='none'; });

  const el = document.getElementById('screen-'+name);
  if (el) { el.style.display='flex'; el.classList.add('active'); }

  // 탭바 전체를 현재 화면 기준으로 다시 렌더링
  renderAllTabbars();

  STATE.currentScreen = name;

  if (name==='routes' && !STATE.mapRoutes) setTimeout(initRoutesMap, 100);
  if (name==='routes') {
    // 탭바 직접 탭이면 뒤로가기 버튼 숨김 (openRouteFromTimetable 경유가 아닐 때)
    // openRouteFromTimetable에서 이미 STATE.routesBackScreen을 설정하므로
    // 그 외 경로(탭바 탭)에서는 초기화
    if (!STATE._fromTimetable) {
      STATE.routesBackScreen = null;
      if (STATE.searchStopMarker) { STATE.searchStopMarker.setMap(null); STATE.searchStopMarker = null; }
      STATE.timetableSearchStop = null;
    }
    STATE._fromTimetable = false;
    setTimeout(updateRoutesBackBtn, 0);
  }
  if (name==='transport') initTransportScreen();
  if (name==='favorites') renderFavorites();

  if (pushHistory) {
    if (name !== 'home') history.pushState({ screen:name }, '', '');
    else history.replaceState({ screen:'home' }, '', '');
  }
}

// ==================== GPS 위치 ====================
function initLocation() {
  if (!navigator.geolocation) {
    showGpsUnavailable('이 브라우저는 위치 기능을 지원하지 않습니다');
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    STATE.myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    STATE.gpsReady = true;
    if (STATE.mapHome) {
      const ll = new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng);
      STATE.mapHome.setCenter(ll);
      updateMyMarker(STATE.mapHome, ll);
    }
    if (!isInSeocheon(STATE.myLocation.lat, STATE.myLocation.lng)) showOutOfArea();
  }, err => {
    // 1: PERMISSION_DENIED, 2: POSITION_UNAVAILABLE, 3: TIMEOUT
    const msg = err.code === 1
      ? 'GPS 권한이 거부되어 현위치를 사용할 수 없습니다\n(출발지를 직접 입력하면 경로 검색은 가능합니다)'
      : 'GPS 위치를 가져오지 못했습니다\n(출발지를 직접 입력해 주세요)';
    showGpsUnavailable(msg);
  });
}

function showGpsUnavailable(msg) {
  const ex = document.getElementById('gps-unavailable-banner');
  if (ex) return;
  const el = document.createElement('div');
  el.id = 'gps-unavailable-banner';
  el.style.cssText = [
    'position:fixed', 'bottom:72px', 'left:12px', 'right:12px', 'z-index:9000',
    'background:#fff3cd', 'color:#664d03',
    'font-size:12px', 'line-height:1.5',
    'padding:10px 14px', 'border-radius:10px',
    'box-shadow:0 2px 10px rgba(0,0,0,.12)',
    'white-space:pre-line',
  ].join(';');
  el.textContent = '📍 ' + msg;
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'float:right;background:none;border:none;font-size:13px;cursor:pointer;color:#664d03;margin-left:8px;padding:0';
  closeBtn.onclick = () => el.remove();
  el.prepend(closeBtn);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

function showOutOfArea() {
  const ex = document.getElementById('out-of-area');
  if (ex) ex.remove();
  const el = document.createElement('div');
  el.id = 'out-of-area';
  el.className = 'out-of-area';
  el.textContent = '📍 현재 서천 서비스 지역 밖입니다';
  document.getElementById('screen-home')?.appendChild(el);
}

// 경로 상세 화면 현위치 버튼 — GPS 재요청 + 마커 갱신
function goToMyLocationDetail() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    STATE.myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (STATE.mapDetail) {
      const ll = new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng);
      STATE.mapDetail.panTo(ll);
      updateMyMarker(STATE.mapDetail, ll);
    }
  }, () => {
    if (STATE.mapDetail && STATE.myLocation) {
      STATE.mapDetail.panTo(new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng));
    }
  });
}

// ==================== 홈 화면 ====================
function renderHomeSheet() {
  const fr  = STATE.search.from;
  const to  = STATE.search.to;
  const via = STATE.search.via;

  // 출발지
  const frText = document.getElementById('text-from');
  const frTag  = document.getElementById('tag-gps');
  if (fr) {
    frText.textContent = fr.displayName || fr.name || '현위치';
    frText.classList.remove('placeholder');
    frTag.style.display = fr.isGps ? '' : 'none';
  } else {
    frText.textContent = '현위치';
    frText.classList.remove('placeholder');
    frTag.style.display = STATE.gpsReady ? '' : 'none';
  }

  // 도착지
  const toText = document.getElementById('text-to');
  if (to) {
    toText.textContent = to.displayName || to.name;
    toText.classList.remove('placeholder');
  } else {
    toText.textContent = '도착지 입력';
    toText.classList.add('placeholder');
  }

  // 경유지
  const viaRow = document.getElementById('via-row');
  const viaText= document.getElementById('text-via');
  const viaBtn = document.getElementById('via-btn');
  if (via) {
    viaRow.style.display = '';
    viaText.textContent = via.displayName || via.name;
    viaText.classList.remove('placeholder');
    if (viaBtn) { viaBtn.textContent='− 경유지'; viaBtn.classList.add('remove'); }
  }
}

function toggleVia() {
  const viaRow    = document.getElementById('via-row');
  const viaDotWrap= document.getElementById('via-dot-wrap');
  const viaBtn    = document.getElementById('via-btn');
  const visible   = viaRow.style.display !== 'none';
  if (visible) {
    viaRow.style.display = 'none';
    if (viaDotWrap) viaDotWrap.style.display = 'none';
    STATE.search.via = null;
    if (viaBtn) { viaBtn.textContent='+ 경유지'; viaBtn.classList.remove('remove'); }
  } else {
    viaRow.style.display = '';
    if (viaDotWrap) viaDotWrap.style.display = 'flex';
    if (viaBtn) { viaBtn.textContent='− 경유지'; viaBtn.classList.add('remove'); }
  }
}

function setTimeChip(mode) {
  document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('chip-'+mode)?.classList.add('active');
  STATE.search.timeMode = mode;
  const customInput = document.getElementById('custom-time');
  if (mode === 'custom') {
    customInput.style.display = 'block';
    const n = new Date();
    customInput.value = `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
    STATE.search.customTime = customInput.value;
  } else {
    customInput.style.display = 'none';
  }
}

function getSearchTime() {
  const now = new Date();
  if (STATE.search.timeMode === '1h') { const d=new Date(now); d.setHours(d.getHours()+1); return d; }
  if (STATE.search.timeMode === '2h') { const d=new Date(now); d.setHours(d.getHours()+2); return d; }
  if (STATE.search.timeMode === 'custom' && STATE.search.customTime) {
    const [h,m]=STATE.search.customTime.split(':').map(Number);
    const d=new Date(now); d.setHours(h,m,0); return d;
  }
  return now;
}

function doSearch() {
  if (!STATE.search.to) { alert('도착지를 선택해주세요'); return; }
  const searchTime = getSearchTime();
  let fromState = STATE.search.from || { isGps:true, lat:STATE.myLocation.lat, lng:STATE.myLocation.lng };

  // GPS 출발 시 가장 가까운 정류장 이름을 붙여줌 (복귀 경로용)
  if (fromState.isGps && !fromState.name) {
    const myLat = STATE.myLocation.lat, myLng = STATE.myLocation.lng;
    let bestStop = null, bestD = Infinity;
    STOPS.forEach(s => {
      const d = distM(s.lat, s.lng, myLat, myLng);
      if (d < bestD) { bestD = d; bestStop = s; }
    });
    if (bestStop) fromState = { ...fromState, name: bestStop.name, nearestStop: bestStop.name };
  }

  const results = searchRoutes(fromState, STATE.search.to, searchTime);
  STATE.searchResults = results;

  // 이력 저장
  const fromName = fromState.name || '현위치';
  const toName   = STATE.search.to.name;
  saveRouteHistory(fromName, toName);

  renderResults(results, fromState, STATE.search.to, searchTime);
  showScreen('result');
}

// ==================== 검색결과 화면 ====================
function renderResults(results, fromState, toState, searchTime) {
  const timeStr = `${String(searchTime.getHours()).padStart(2,'0')}:${String(searchTime.getMinutes()).padStart(2,'0')}`;
  document.getElementById('result-title').textContent = `${fromState.name||'현위치'} → ${toState.name}`;
  document.getElementById('result-sub').textContent   = `오늘 ${timeStr} 기준`;

  const body = document.getElementById('result-body');

  // 범위 체크
  if (!isInSeocheon(toState.lat, toState.lng)) {
    body.innerHTML = `<div class="no-result">
      <div class="no-result-icon">🗺️</div>
      <div class="no-result-title">서천 버스가 못 가는 곳이에요</div>
      <div class="no-result-sub">"${toState.name}"은 서천 관할 밖입니다.<br>서천군 내 목적지를 입력해 주세요.</div>
    </div>`; return;
  }

  if (!results.length) {
    body.innerHTML = `<div class="no-result">
      <div class="no-result-icon">🚌</div>
      <div class="no-result-title">경로를 찾을 수 없어요</div>
      <div class="no-result-sub">${timeStr} 이후 운행 버스가 없거나<br>직접 연결 노선이 없습니다.</div>
    </div>`; return;
  }

  const dayType = getDayType();
  let html = '';

  // 추천 경로
  html += `<div class="result-label">추천 경로</div>`;
  html += renderRouteCard(results[0], 0, true, dayType);

  // 기타 경로
  if (results.length > 1) {
    html += `<div class="result-label" style="margin-top:4px">기타 경로</div>`;
    results.slice(1).forEach((r,i) => { html += renderRouteCard(r, i+1, false, dayType); });
  }

  // 복귀 경로
  const bestArr  = results[0].arriveMin;
  const retBase  = bestArr + 30;
  const retRoute = findReturnRoute(toState, fromState, retBase, dayType);
  const arrStr   = minToTime(bestArr);
  const retStr   = minToTime(retBase);

  html += `<div class="result-label" style="margin-top:4px">복귀 경로 <span style="font-size:10px;color:var(--text-3)">${arrStr} 도착 후 기준</span></div>`;
  if (retRoute) {
    html += renderReturnCard(retRoute, dayType);
  } else {
    html += `<div style="padding:12px;text-align:center;font-size:13px;color:var(--text-3)">복귀 노선을 찾을 수 없습니다</div>`;
  }

  body.innerHTML = html;
}

function renderRouteCard(r, idx, isBest, dayType) {
  const color = getZoneColor(r.route);
  const num   = getBusNum(r.route);
  const nextTimes = getRouteTimes(r.route, dayType).filter(t => t > r.boardMin).slice(0,3);
  const nextChips = nextTimes.map(t=>`<span class="next-chip">${minToTime(t)}</span>`).join('');

  if (r.type === 'transfer') {
    const color2     = getZoneColor(r.route2);
    const num2       = getBusNum(r.route2);
    const boardStop  = (r.fromIdx >= 0 && r.coords?.[r.fromIdx]?.name) ? r.coords[r.fromIdx].name : r.route['기점'];
    const alightStop = (r.toIdx2  >= 0 && r.coords2?.[r.toIdx2]?.name) ? r.coords2[r.toIdx2].name : r.route2['종점'];
    return `<div class="route-card${isBest?' best':''}" onclick="showDetail(${idx})">
      <div class="rc-top">
        <div class="rc-pills">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6M6 3l2 2-2 2" stroke="#aaa" stroke-width="1.2" stroke-linecap="round"/></svg>
          <span class="bus-pill" style="background:${color2}">${num2}</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
        <span class="rc-duration">${formatDuration(r.minutes)}</span>
      </div>
      <div class="rc-journey">
        <div class="rc-row">
          <span class="rc-time blue">${minToTime(r.boardMin)}</span>
          <div class="rc-dot blue"></div>
          <span class="rc-label">${boardStop} 탑승</span>
        </div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row">
          <span class="rc-time orange">${minToTime(r.hub2BoardMin)}</span>
          <div class="rc-dot orange"></div>
          <span class="rc-label">${r.transferHub} 환승</span>
        </div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row">
          <span class="rc-time red">${minToTime(r.arriveMin)}</span>
          <div class="rc-dot red"></div>
          <span class="rc-label">${alightStop} 도착</span>
        </div>
      </div>
      ${nextChips ? `<div class="rc-next"><span class="rc-next-label">이후 버스</span>${nextChips}</div>` : ''}
    </div>`;
  }

  // 직행
  const boardStop  = (r.fromIdx >= 0 && r.coords[r.fromIdx]?.name) ? r.coords[r.fromIdx].name : r.route['기점'];
  const alightStop = (r.toIdx   >= 0 && r.coords[r.toIdx]?.name)   ? r.coords[r.toIdx].name   : r.route['종점'];
  return `<div class="route-card${isBest?' best':''}" onclick="showDetail(${idx})">
    <div class="rc-top">
      <div class="rc-pills">
        <span class="bus-pill" style="background:${color}">${num}</span>
        <span style="font-size:11px;color:var(--text-2)">직행</span>
      </div>
      <span class="rc-duration">${formatDuration(r.minutes)}</span>
    </div>
    <div class="rc-journey">
      <div class="rc-row">
        <span class="rc-time blue">${minToTime(r.boardMin)}</span>
        <div class="rc-dot blue"></div>
        <span class="rc-label">${boardStop} 탑승</span>
      </div>
      <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
      <div class="rc-row">
        <span class="rc-time red">${minToTime(r.arriveMin)}</span>
        <div class="rc-dot red"></div>
        <span class="rc-label">${alightStop} 도착</span>
      </div>
    </div>
    ${nextChips ? `<div class="rc-next"><span class="rc-next-label">이후 버스</span>${nextChips}</div>` : ''}
  </div>`;
}

function renderReturnCard(r, dayType) {
  const color = getZoneColor(r.route);
  const num   = getBusNum(r.route);
  const nextTimes = getRouteTimes(r.route, dayType).filter(t=>t>r.nextMin).slice(0,3);
  const nextChips = nextTimes.map(t=>`<span class="next-chip return">${minToTime(t)}</span>`).join('');

  if (r.type === 'transfer') {
    const color2   = getZoneColor(r.route2);
    const num2     = getBusNum(r.route2);
    // 환승·도착 시각 추정 (search.js에 없으면 분 단위로 추산)
    const hubMin   = r.hub2BoardMin || (r.nextMin + 20);
    const arrMin   = r.arriveMin   || (hubMin + 20);
    const totalMin = arrMin - r.nextMin;
    return `<div class="route-card return-card">
      <div class="rc-top">
        <div class="rc-pills">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6M6 3l2 2-2 2" stroke="#aaa" stroke-width="1.2" stroke-linecap="round"/></svg>
          <span class="bus-pill" style="background:${color2}">${num2}</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
        <span class="rc-duration">${formatDuration(totalMin)}</span>
      </div>
      <div class="rc-journey">
        <div class="rc-row">
          <span class="rc-time blue">${minToTime(r.nextMin)}</span>
          <div class="rc-dot blue"></div>
          <span class="rc-label">${r.boardStop || r.route['기점']} 탑승</span>
        </div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row">
          <span class="rc-time orange">${minToTime(hubMin)}</span>
          <div class="rc-dot orange"></div>
          <span class="rc-label">${r.transferHub} 환승</span>
        </div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row">
          <span class="rc-time red">${minToTime(arrMin)}</span>
          <div class="rc-dot red"></div>
          <span class="rc-label">${r.alightStop || r.route2['종점']} 도착</span>
        </div>
      </div>
      ${nextChips ? `<div class="rc-next"><span class="rc-next-label">이후 버스</span>${nextChips}</div>` : ''}
    </div>`;
  }

  // 직행 복귀
  const retKm  = (r.route['거리'] || 10);
  const retMin = Math.round(retKm * 2.5 + 3);
  const arrMin = r.nextMin + retMin;
  return `<div class="route-card return-card">
    <div class="rc-top">
      <div class="rc-pills">
        <span class="bus-pill" style="background:${color}">${num}</span>
        <span style="font-size:11px;color:var(--text-2)">직행</span>
      </div>
      <span class="rc-duration">${formatDuration(retMin)}</span>
    </div>
    <div class="rc-journey">
      <div class="rc-row">
        <span class="rc-time blue">${minToTime(r.nextMin)}</span>
        <div class="rc-dot blue"></div>
        <span class="rc-label">${r.boardStop || r.route['기점']} 탑승</span>
      </div>
      <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
      <div class="rc-row">
        <span class="rc-time red">${minToTime(arrMin)}</span>
        <div class="rc-dot red"></div>
        <span class="rc-label">${r.alightStop || r.route['종점']} 도착</span>
      </div>
    </div>
    ${nextChips ? `<div class="rc-next"><span class="rc-next-label">이후 버스</span>${nextChips}</div>` : ''}
  </div>`;
}

// ==================== 경로 상세 화면 ====================
function showDetail(idx) {
  const result = STATE.searchResults[idx];
  if (!result) return;
  STATE.detailResult = result;

  renderDetailCard(result);
  renderStopList(result);
  showScreen('detail');
  setTimeout(() => initDetailMap(result), 100);
}

function renderDetailCard(result) {
  const container = document.getElementById('detail-card');
  if (!container) return;

  // 검색결과 카드 그대로 (이후 버스 없이)
  const color = getZoneColor(result.route);
  const num   = getBusNum(result.route);
  const dayType = result.dayType || getDayType();

  if (result.type === 'transfer') {
    const color2 = getZoneColor(result.route2);
    const num2   = getBusNum(result.route2);
    // 결과 카드와 동일하게 coords 인덱스 기반으로 실제 탑승·하차 정류장 표시
    const boardStop  = (result.fromIdx >= 0 && result.coords?.[result.fromIdx]?.name)
                       ? result.coords[result.fromIdx].name : result.boardStop || result.route['기점'];
    const alightStop = (result.toIdx2  >= 0 && result.coords2?.[result.toIdx2]?.name)
                       ? result.coords2[result.toIdx2].name : result.alightStop || result.route2['종점'];
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6M6 3l2 2-2 2" stroke="#aaa" stroke-width="1.2" stroke-linecap="round"/></svg>
          <span class="bus-pill" style="background:${color2}">${num2}</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
        <span class="rc-duration">${formatDuration(result.minutes)}</span>
      </div>
      <div class="rc-journey">
        <div class="rc-row"><span class="rc-time blue">${minToTime(result.boardMin)}</span><div class="rc-dot blue"></div><span class="rc-label">${boardStop} 탑승</span></div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row"><span class="rc-time orange">${minToTime(result.hub2BoardMin)}</span><div class="rc-dot orange"></div><span class="rc-label">${result.transferHub} 환승</span></div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row"><span class="rc-time red">${minToTime(result.arriveMin)}</span><div class="rc-dot red"></div><span class="rc-label">${alightStop} 도착</span></div>
      </div>`;
  } else {
    // 결과 카드와 동일하게 coords 인덱스 기반으로 실제 탑승·하차 정류장 표시
    const boardStop  = (result.fromIdx >= 0 && result.coords?.[result.fromIdx]?.name)
                       ? result.coords[result.fromIdx].name : result.boardStop || result.route['기점'];
    const alightStop = (result.toIdx   >= 0 && result.coords?.[result.toIdx]?.name)
                       ? result.coords[result.toIdx].name   : result.alightStop || result.route['종점'];
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:5px">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <span style="font-size:11px;color:var(--text-2)">직행</span>
        </div>
        <span class="rc-duration">${formatDuration(result.minutes)}</span>
      </div>
      <div class="rc-journey">
        <div class="rc-row"><span class="rc-time blue">${minToTime(result.boardMin)}</span><div class="rc-dot blue"></div><span class="rc-label">${boardStop} 탑승</span></div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row"><span class="rc-time red">${minToTime(result.arriveMin)}</span><div class="rc-dot red"></div><span class="rc-label">${alightStop} 도착</span></div>
      </div>`;
  }
}

function renderStopList(result) {
  const el = document.getElementById('stop-list');
  if (!el) return;

  const allCoords = result.coords || getRouteCoords(result.route);

  // ── 선택한 경로 구간(fromIdx ~ toIdx)만 잘라서 사용 ──
  const segStart = result.fromIdx >= 0 ? result.fromIdx : 0;
  const segEnd   = result.toIdx   >= 0 ? result.toIdx   : allCoords.length - 1;
  const coords   = allCoords.slice(segStart, segEnd + 1);
  const last     = coords.length - 1;

  const avgMin = Math.round(result.minutes / Math.max(coords.length, 1));

  // ── 현위치를 경로 구간 내 정류장 기준으로만 추적 ──
  const myLat = STATE.myLocation.lat, myLng = STATE.myLocation.lng;
  const OFFROUTE_M = 500; // 500m 초과 시 이탈 판정

  let myI = 0, minDist = Infinity;
  coords.forEach((c, i) => {
    if (!c.lat) return;
    const d = distM(c.lat, c.lng, myLat, myLng);
    if (d < minDist) { minDist = d; myI = i; }
  });
  const isOffRoute = STATE.gpsReady && minDist > OFFROUTE_M;

  // ── 환승 정류장 인덱스 (구간 내 상대 인덱스로 변환) ──
  let hubIdx = -1;
  if (result.type === 'transfer') {
    let absIdx = findIdxByName(allCoords, result.transferHub);
    if (absIdx === -1) {
      const hs = STOPS.find(s => s.name === result.transferHub)
              || STOPS.find(s => s.name.includes(result.transferHub.substring(0, 3)));
      if (hs) absIdx = findIdxByCoord(allCoords, hs.lat, hs.lng, 300);
    }
    if (absIdx >= segStart && absIdx <= segEnd) hubIdx = absIdx - segStart;
  }

  // ── 표시할 인덱스: 출발, 현위치±1, 환승, 도착 ──
  const showSet = new Set([
    0,
    Math.max(0, myI - 1),
    myI,
    Math.min(last, myI + 1),
    last,
  ]);
  if (hubIdx >= 0) showSet.add(hubIdx);

  // ── 이탈 배너 ──
  let html = '';
  if (isOffRoute) {
    html += `<div style="margin:8px 12px 4px;padding:9px 12px;background:#fff3cd;border-radius:10px;font-size:12px;color:#664d03;line-height:1.5">
      ⚠️ 현재 위치가 선택한 경로에서 벗어났습니다
    </div>`;
  }

  let prevShown = -1;

  coords.forEach((stop, i) => {
    if (!showSet.has(i)) return;

    if (prevShown >= 0 && i - prevShown > 1) {
      html += `<div class="stop-row" style="opacity:.5">
        <div class="stop-track"><div style="width:6px;height:6px;border-radius:50%;background:var(--text-3)"></div><div class="stop-vline"></div></div>
        <span class="stop-name" style="color:var(--text-3);font-size:11px">··· ${i - prevShown - 1}개 정류장</span>
      </div>`;
    }
    prevShown = i;

    const isDone    = !isOffRoute && i < myI;
    const isCurrent = !isOffRoute && i === myI;
    const isHub     = i === hubIdx;
    const isStart   = i === 0;
    const isEnd     = i === last;
    const hasLine   = i < last;

    const etaMin = result.boardMin + i * avgMin;
    const etaStr = minToTime(etaMin);

    let circleClass = 'sc-normal';
    if (isStart)            circleClass = 'sc-start';
    if (isEnd)              circleClass = 'sc-end';
    if (isCurrent)          circleClass = 'sc-current';
    if (isHub)              circleClass = 'sc-transfer';
    if (isDone && !isStart) circleClass = 'sc-done';

    let nameClass = '';
    if (isDone)    nameClass = 'done';
    if (isCurrent) nameClass = 'current';
    if (isHub)     nameClass = 'transfer';
    if (isEnd)     nameClass = 'end';

    let timeEl = '';
    if (isStart)        timeEl = `<span class="stop-time" style="color:var(--blue)">${etaStr} 출발</span>`;
    else if (isEnd)     timeEl = `<span class="stop-time end">${etaStr} 도착</span>`;
    else if (isHub)     timeEl = `<span class="stop-time transfer">${etaStr} 환승</span>`;
    else if (isCurrent) timeEl = `<span class="stop-time current">${etaStr}<span class="here-tag">현위치</span></span>`;
    else                timeEl = `<span class="stop-time" style="color:${isDone ? 'var(--text-3)' : 'var(--text-2)'}">${etaStr}</span>`;

    const rowClass = isCurrent ? 'stop-row current' : isHub ? 'stop-row transfer-row' : 'stop-row';
    const opacity  = isDone && !isStart ? 'opacity:.4;' : '';

    html += `<div class="${rowClass}" style="${opacity}">
      <div class="stop-track">
        <div class="stop-circle ${circleClass}"></div>
        ${hasLine ? '<div class="stop-vline"></div>' : ''}
      </div>
      <span class="stop-name ${nameClass}">${stop.displayName || stop.name}</span>
      ${timeEl}
    </div>`;
  });

  el.innerHTML = html;
}
