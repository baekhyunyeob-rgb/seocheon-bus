'use strict';

// ==================== 화면 전환 ====================
function showScreen(name, pushHistory = true) {
  document.querySelectorAll('.screen').forEach(s => { s.classList.remove('active'); s.style.display='none'; });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

  const el = document.getElementById('screen-'+name);
  if (el) { el.style.display='flex'; el.classList.add('active'); }
  const tab = document.getElementById('tab-'+name);
  if (tab) tab.classList.add('active');

  STATE.currentScreen = name;

  if (name==='routes' && !STATE.mapRoutes) setTimeout(initRoutesMap, 100);
  if (name==='transport') initTransportScreen();
  if (name==='favorites') renderFavorites();

  if (pushHistory) {
    if (name !== 'home') history.pushState({ screen:name }, '', '');
    else history.replaceState({ screen:'home' }, '', '');
  }
}

// ==================== GPS 위치 ====================
function initLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    STATE.myLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    STATE.gpsReady = true;
    if (STATE.mapHome) {
      const ll = new kakao.maps.LatLng(STATE.myLocation.lat, STATE.myLocation.lng);
      STATE.mapHome.setCenter(ll);
      updateMyMarker(STATE.mapHome, ll);
    }
    if (!isInSeocheon(STATE.myLocation.lat, STATE.myLocation.lng)) showOutOfArea();
  }, () => {});
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
  const viaRow = document.getElementById('via-row');
  const viaBtn = document.getElementById('via-btn');
  const visible = viaRow.style.display !== 'none';
  if (visible) {
    viaRow.style.display = 'none';
    STATE.search.via = null;
    if (viaBtn) { viaBtn.textContent='+ 경유지'; viaBtn.classList.remove('remove'); }
  } else {
    viaRow.style.display = '';
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
  const fromState  = STATE.search.from || { isGps:true, lat:STATE.myLocation.lat, lng:STATE.myLocation.lng };
  const results    = searchRoutes(fromState, STATE.search.to, searchTime);
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
    const color2 = getZoneColor(r.route2);
    const num2   = getBusNum(r.route2);
    return `<div class="route-card${isBest?' best':''}" onclick="showDetail(${idx})">
      <div class="rc-top">
        <div class="rc-pills">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6M6 3l2 2-2 2" stroke="#aaa" stroke-width="1.2" stroke-linecap="round"/></svg>
          <span class="bus-pill" style="background:${color2}">${num2}</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
        <span class="rc-duration">${r.minutes}분</span>
      </div>
      <div class="rc-journey">
        <div class="rc-row">
          <span class="rc-time blue">${minToTime(r.boardMin)}</span>
          <div class="rc-dot blue"></div>
          <span class="rc-label">${r.route['기점']} 탑승</span>
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
          <span class="rc-label">${r.route2['종점']} 도착</span>
        </div>
      </div>
      ${nextChips ? `<div class="rc-next"><span class="rc-next-label">이후 버스</span>${nextChips}</div>` : ''}
    </div>`;
  }

  // 직행
  const boardStop  = r.route['기점'];
  const alightStop = r.route['종점'];
  return `<div class="route-card${isBest?' best':''}" onclick="showDetail(${idx})">
    <div class="rc-top">
      <div class="rc-pills">
        <span class="bus-pill" style="background:${color}">${num}</span>
        <span style="font-size:11px;color:var(--text-2)">직행</span>
      </div>
      <span class="rc-duration">${r.minutes}분</span>
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
    const color2 = getZoneColor(r.route2);
    const num2   = getBusNum(r.route2);
    return `<div class="route-card return-card">
      <div class="rc-top">
        <div class="rc-pills">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6M6 3l2 2-2 2" stroke="#aaa" stroke-width="1.2" stroke-linecap="round"/></svg>
          <span class="bus-pill" style="background:${color2}">${num2}</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
      </div>
      <div class="rc-journey">
        <div class="rc-row">
          <span class="rc-time blue">${minToTime(r.nextMin)}</span>
          <div class="rc-dot blue"></div>
          <span class="rc-label">${r.route['기점']} 탑승</span>
        </div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row">
          <span class="rc-time orange">환승</span>
          <div class="rc-dot orange"></div>
          <span class="rc-label">${r.transferHub}</span>
        </div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row">
          <span class="rc-time red">도착</span>
          <div class="rc-dot red"></div>
          <span class="rc-label">${r.route2['종점']}</span>
        </div>
      </div>
    </div>`;
  }

  return `<div class="route-card return-card">
    <div class="rc-top">
      <div class="rc-pills">
        <span class="bus-pill" style="background:${color}">${num}</span>
        <span style="font-size:11px;color:var(--text-2)">직행</span>
      </div>
    </div>
    <div class="rc-journey">
      <div class="rc-row">
        <span class="rc-time blue">${minToTime(r.nextMin)}</span>
        <div class="rc-dot blue"></div>
        <span class="rc-label">${r.route['기점']} 탑승</span>
      </div>
      <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
      <div class="rc-row">
        <span class="rc-time red">도착</span>
        <div class="rc-dot red"></div>
        <span class="rc-label">${r.route['종점']}</span>
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
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6M6 3l2 2-2 2" stroke="#aaa" stroke-width="1.2" stroke-linecap="round"/></svg>
          <span class="bus-pill" style="background:${color2}">${num2}</span>
          <span class="rc-badge badge-transfer">1회 환승</span>
        </div>
        <span class="rc-duration">${result.minutes}분</span>
      </div>
      <div class="rc-journey">
        <div class="rc-row"><span class="rc-time blue">${minToTime(result.boardMin)}</span><div class="rc-dot blue"></div><span class="rc-label">${result.route['기점']} 탑승</span></div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row"><span class="rc-time orange">${minToTime(result.hub2BoardMin)}</span><div class="rc-dot orange"></div><span class="rc-label">${result.transferHub} 환승</span></div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row"><span class="rc-time red">${minToTime(result.arriveMin)}</span><div class="rc-dot red"></div><span class="rc-label">${result.route2['종점']} 도착</span></div>
      </div>`;
  } else {
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
        <div style="display:flex;align-items:center;gap:5px">
          <span class="bus-pill" style="background:${color}">${num}</span>
          <span style="font-size:11px;color:var(--text-2)">직행</span>
        </div>
        <span class="rc-duration">${result.minutes}분</span>
      </div>
      <div class="rc-journey">
        <div class="rc-row"><span class="rc-time blue">${minToTime(result.boardMin)}</span><div class="rc-dot blue"></div><span class="rc-label">${result.route['기점']} 탑승</span></div>
        <div class="rc-vline-wrap"><div class="rc-vline"></div></div>
        <div class="rc-row"><span class="rc-time red">${minToTime(result.arriveMin)}</span><div class="rc-dot red"></div><span class="rc-label">${result.route['종점']} 도착</span></div>
      </div>`;
  }
}

function renderStopList(result) {
  const el = document.getElementById('stop-list');
  if (!el) return;

  const coords   = result.coords || getRouteCoords(result.route);
  const dayType  = result.dayType || getDayType();
  const avgMin   = Math.round(result.minutes / Math.max(coords.length,1));

  // 현재 내 위치에서 가장 가까운 정류장 인덱스
  const myLat = STATE.myLocation.lat, myLng = STATE.myLocation.lng;
  let myI=0,myD=9e9;
  coords.forEach((c,i)=>{if(!c.lat)return;const d=distM(c.lat,c.lng,myLat,myLng);if(d<myD){myD=d;myI=i;}});

  // 표시할 인덱스: 출발, 이전1, 현재, 이후1, 환승(있으면), 도착
  const showSet = new Set([0, Math.max(0,myI-1), myI, Math.min(coords.length-1,myI+1), coords.length-1]);

  // 환승 정류장 인덱스 추가
  let hubIdx = -1;
  if (result.type === 'transfer') {
    const hs = STOPS.find(s=>s.name.includes(result.transferHub.substring(0,3)));
    if (hs) { hubIdx = findSnapIdx(coords, hs.lat, hs.lng, 1000); if(hubIdx>=0) showSet.add(hubIdx); }
  }

  let html = '';
  let prevShown = -1;

  coords.forEach((stop,i) => {
    if (!showSet.has(i)) return;

    // 줄임표
    if (prevShown >= 0 && i - prevShown > 1) {
      html += `<div class="stop-row" style="opacity:.5">
        <div class="stop-track"><div style="width:6px;height:6px;border-radius:50%;background:var(--text-3)"></div><div class="stop-vline"></div></div>
        <span class="stop-name" style="color:var(--text-3);font-size:11px">··· ${i-prevShown-1}개 정류장</span>
      </div>`;
    }
    prevShown = i;

    const isDone     = i < myI;
    const isCurrent  = i === myI;
    const isHub      = i === hubIdx;
    const isStart    = i === 0;
    const isEnd      = i === coords.length-1;
    const hasLine    = i < coords.length-1;

    const etaMin = result.boardMin + i * avgMin;
    const etaStr = minToTime(etaMin);

    let circleClass = 'sc-normal';
    if (isStart)   circleClass = 'sc-start';
    if (isEnd)     circleClass = 'sc-end';
    if (isCurrent) circleClass = 'sc-current';
    if (isHub)     circleClass = 'sc-transfer';
    if (isDone && !isStart) circleClass = 'sc-done';

    let nameClass = '';
    if (isDone)    nameClass = 'done';
    if (isCurrent) nameClass = 'current';
    if (isHub)     nameClass = 'transfer';
    if (isEnd)     nameClass = 'end';

    let timeEl = '';
    if (isStart)   timeEl = `<span class="stop-time" style="color:var(--blue)">${etaStr} 출발</span>`;
    else if (isEnd) timeEl = `<span class="stop-time end">${etaStr} 도착</span>`;
    else if (isHub) timeEl = `<span class="stop-time transfer">${etaStr} 환승</span>`;
    else if (isCurrent) timeEl = `<span class="stop-time current">${etaStr}<span class="here-tag">현위치</span></span>`;
    else            timeEl = `<span class="stop-time" style="color:${isDone?'var(--text-3)':'var(--text-2)'}">${etaStr}</span>`;

    const rowClass = isCurrent ? 'stop-row current' : isHub ? 'stop-row transfer-row' : 'stop-row';
    const opacity  = isDone && !isStart ? 'opacity:.4;' : '';

    html += `<div class="${rowClass}" style="${opacity}">
      <div class="stop-track">
        <div class="stop-circle ${circleClass}"></div>
        ${hasLine ? '<div class="stop-vline"></div>' : ''}
      </div>
      <span class="stop-name ${nameClass}">${stop.displayName||stop.name}</span>
      ${timeEl}
    </div>`;
  });

  el.innerHTML = html;
}
