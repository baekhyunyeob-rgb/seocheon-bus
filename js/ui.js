// ================================================================
// ui.js — 화면 전환, 검색 UI, 이벤트 처리
// ================================================================

// ── 화면 전환 ──────────────────────────────────────────────────
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

  const screen = document.getElementById('screen-' + name);
  if (screen) { screen.style.display = 'flex'; screen.classList.add('active'); }
  const tab = document.getElementById('tab-' + name);
  if (tab) tab.classList.add('active');

  APP.currentScreen = name;

  // 탭바 항상 표시
  document.querySelector('.tabbar')?.classList.remove('hide');

  // 화면별 초기화
  if (name === 'routes') { if (!mapRoutes) initRoutesMap(); }
  if (name === 'favorites') renderFavorites();

  // history 관리
  if (name !== 'home') {
    history.pushState({ screen: name }, '', '');
  } else {
    history.replaceState({ screen: 'home' }, '', '');
    history.pushState({ screen: 'home_guard' }, '', '');
  }
}

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
  APP.currentScreen = name;
  document.querySelector('.tabbar')?.classList.remove('hide');
  if (name === 'routes' && !mapRoutes) initRoutesMap();
  if (name === 'favorites') renderFavorites();
}

// ── 폰 뒤로가기 ───────────────────────────────────────────────
function initBackHandler() {
  history.replaceState({ screen: 'home' }, '', '');
  history.pushState({ screen: 'home_guard' }, '', '');

  window.addEventListener('popstate', () => {
    switch (APP.currentScreen) {
      case 'detail':
        showScreenNoHistory('result');
        history.pushState({ screen: 'result' }, '', '');
        break;
      case 'routes':
        if (_timetableReturnScreen) {
          const t = _timetableReturnScreen;
          _timetableReturnScreen = null;
          showScreenNoHistory(t);
          history.pushState({ screen: t }, '', '');
        } else {
          showScreenNoHistory('home');
          history.replaceState({ screen: 'home' }, '', '');
          history.pushState({ screen: 'home_guard' }, '', '');
        }
        break;
      default:
        showScreenNoHistory('home');
        history.replaceState({ screen: 'home' }, '', '');
        history.pushState({ screen: 'home_guard' }, '', '');
    }
  });
}

// ── 탭바 스크롤 숨김 ───────────────────────────────────────────
function initTabbarScroll() {
  const tabbar = document.querySelector('.tabbar');
  if (!tabbar) return;
  const scrollIds = ['result-body','stop-list','timetable-body','route-list','transport-body','favorites-body'];
  let lastY = 0;

  scrollIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('scroll', () => {
      const y = el.scrollTop;
      if (y > lastY + 8)      tabbar.classList.add('hide');
      else if (y < lastY - 8) tabbar.classList.remove('hide');
      lastY = y;
    }, { passive: true });
  });
}

// ── 바텀시트 스와이프 닫기 ─────────────────────────────────────
function initSheetSwipe() {
  const sheet  = document.getElementById('search-sheet');
  const handle = sheet?.querySelector('.sheet-handle');
  if (!sheet || !handle) return;

  let startY = 0;
  handle.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  handle.addEventListener('touchmove',  e => {
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) { sheet.style.transform = `translateY(${dy}px)`; sheet.style.transition = 'none'; }
  }, { passive: true });
  handle.addEventListener('touchend', e => {
    sheet.style.transition = '';
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) {
      sheet.style.transform = 'translateY(100%)';
      setTimeout(() => { sheet.style.transform = ''; showScreen('home'); }, 250);
    } else {
      sheet.style.transform = '';
    }
  });
}

// ── 경로 검색 ──────────────────────────────────────────────────
function searchRoute() {
  const fromName = document.getElementById('text-from')?.textContent?.trim() || '현위치';
  const toName   = document.getElementById('text-to')?.textContent?.trim()   || '';

  if (!toName || toName === '도착지 입력 또는 선택') {
    alert('도착지를 입력해주세요');
    return;
  }

  const searchTime = getSearchTime();
  const dayType    = getDayType(searchTime);

  APP.searchState.from = (!fromName || fromName === '현위치')
    ? { name: '현위치', ...APP.myLocation }
    : (findStop(fromName) || { name: fromName, ...APP.myLocation });
  APP.searchState.to = findStop(toName) || { name: toName };

  const results = findRoutes(fromName, toName, searchTime, dayType);

  // 결과 제목
  const titleEl = document.getElementById('result-title');
  const subEl   = document.getElementById('result-sub');
  if (titleEl) titleEl.textContent = `${fromName} → ${toName}`;
  if (subEl)   subEl.textContent   = `${searchTime.getHours()}:${String(searchTime.getMinutes()).padStart(2,'0')} 출발 기준`;

  renderResults(results, fromName, toName, dayType);
  saveSearchHistory(fromName, toName);
  showScreen('result');
}

// ── 경로 상세 ──────────────────────────────────────────────────
function showDetail(idx) {
  const results = window._searchResults || [];
  if (!results[idx]) return;
  APP.detailResult = results[idx];

  updateLiveBanner(APP.detailResult);
  renderDetailStops(APP.detailResult);
  showScreen('detail');
  setTimeout(() => initDetailMap(APP.detailResult), 100);
}

// ── 시간 선택 ──────────────────────────────────────────────────
let _searchTimeMode = 'now';
let _customTime = null;

function setTimeChip(mode) {
  _searchTimeMode = mode;
  document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
  document.getElementById('chip-' + mode)?.classList.add('active');
  const customInput = document.getElementById('custom-time');
  if (customInput) customInput.style.display = mode === 'custom' ? 'block' : 'none';
}

function onCustomTime(val) {
  _customTime = val;
}

function getSearchTime() {
  const now = new Date();
  if (_searchTimeMode === '1h') return new Date(now.getTime() + 3600000);
  if (_searchTimeMode === '2h') return new Date(now.getTime() + 7200000);
  if (_searchTimeMode === 'custom' && _customTime) {
    const [h, m] = _customTime.split(':').map(Number);
    const t = new Date(now);
    t.setHours(h, m, 0, 0);
    return t;
  }
  return now;
}

// ── 장소 검색 모달 ─────────────────────────────────────────────
let _placeTarget = 'to';

function openPlaceSearch(target) {
  _placeTarget = target;
  const modal = document.getElementById('place-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('place-input')?.focus();
  renderModalSaved(target);
}

function closePlaceModal() {
  const modal = document.getElementById('place-modal');
  if (modal) modal.style.display = 'none';
  const input = document.getElementById('place-input');
  if (input) input.value = '';
  const results = document.getElementById('place-results');
  if (results) results.innerHTML = '';
}

function renderModalSaved(target) {
  const container = document.getElementById('place-results');
  if (!container) return;

  let html = '';
  // 저장된 장소
  APP.savedPlaces.forEach(p => {
    html += `<div class="place-item" onclick="selectPlace('${target}',${JSON.stringify(p).replace(/"/g,'&quot;')})">
      <span class="place-icon">📍</span>
      <div><div class="place-name">${p.label}</div><div class="place-sub">${p.name}</div></div>
    </div>`;
  });
  // 가까운 정류장
  APP.stops
    .map(s => ({ ...s, d: coordDist(s.lat, s.lng, APP.myLocation.lat, APP.myLocation.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 10)
    .forEach(s => {
      html += `<div class="place-item" onclick="selectPlace('${target}',${JSON.stringify({name:s.displayName,lat:s.lat,lng:s.lng}).replace(/"/g,'&quot;')})">
        <span class="place-icon">🚌</span>
        <div><div class="place-name">${s.displayName}</div><div class="place-sub">${Math.round(s.d)}m</div></div>
      </div>`;
    });
  container.innerHTML = html || '<div class="place-empty">주변 정류장이 없습니다</div>';
}

function onPlaceInput(val) {
  if (!val.trim()) { renderModalSaved(_placeTarget); return; }

  const keyword = val.trim().toLowerCase();
  const matches = APP.stops
    .filter(s => s.displayName.includes(val) || s.name.includes(val))
    .slice(0, 20);

  const container = document.getElementById('place-results');
  if (!container) return;

  if (!matches.length) {
    container.innerHTML = `<div class="place-empty">"${val}" 결과 없음</div>`;
    return;
  }

  container.innerHTML = matches.map(s =>
    `<div class="place-item" onclick="selectPlace('${_placeTarget}',${JSON.stringify({name:s.displayName,lat:s.lat,lng:s.lng}).replace(/"/g,'&quot;')})">
      <span class="place-icon">🚌</span>
      <div><div class="place-name">${s.displayName}</div></div>
    </div>`
  ).join('');
}

function selectPlace(target, place) {
  if (typeof place === 'string') place = JSON.parse(place);
  const name = place.label || place.displayName || place.name;

  if (target === 'from') {
    APP.searchState.from = place;
    const el = document.getElementById('text-from');
    if (el) { el.textContent = name; el.classList.remove('loc-placeholder'); }
    document.getElementById('tag-from')?.style.setProperty('display', 'none');
  } else {
    APP.searchState.to = place;
    const el = document.getElementById('text-to');
    if (el) { el.textContent = name; el.classList.remove('loc-placeholder'); }
  }
  closePlaceModal();
}

// ── 빠른 검색 (즐겨찾기) ──────────────────────────────────────
function quickSearch(from, to) {
  const fromEl = document.getElementById('text-from');
  const toEl   = document.getElementById('text-to');
  if (fromEl) { fromEl.textContent = from; fromEl.classList.remove('loc-placeholder'); }
  if (toEl)   { toEl.textContent = to;     toEl.classList.remove('loc-placeholder'); }

  const fromStop = from === '현위치' ? { name: '현위치', ...APP.myLocation } : findStop(from);
  const toStop   = findStop(to);
  APP.searchState.from = fromStop || { name: from, ...APP.myLocation };
  APP.searchState.to   = toStop   || { name: to };

  showScreen('home');
  setTimeout(searchRoute, 100);
}

function quickSearchFrom(name, lat, lng) {
  APP.searchState.from = { name, lat: Number(lat), lng: Number(lng) };
  const el = document.getElementById('text-from');
  if (el) { el.textContent = name; el.classList.remove('loc-placeholder'); }
  const tag = document.getElementById('tag-from');
  if (tag) tag.style.display = 'none';
  showScreen('home');
}

function quickSearchTo(name, lat, lng) {
  APP.searchState.to = { name, lat: Number(lat), lng: Number(lng) };
  const el = document.getElementById('text-to');
  if (el) { el.textContent = name; el.classList.remove('loc-placeholder'); }
  showScreen('home');
}

// ── 저장된 장소 관리 ───────────────────────────────────────────
function saveCurrentTo() {
  if (!APP.searchState.to?.name) { alert('도착지를 먼저 선택해주세요'); return; }
  const place = APP.searchState.to;
  const label = prompt(`"${place.name}" 저장\n별칭을 입력하세요 (예: 집, 직장, 학교)`);
  if (!label) return;
  const newPlace = { ...place, label };
  APP.savedPlaces = [newPlace, ...APP.savedPlaces.filter(p => p.name !== place.name)].slice(0, 10);
  localStorage.setItem('seocheon_places', JSON.stringify(APP.savedPlaces));
  const btn = document.getElementById('save-star-btn');
  if (btn) { btn.textContent = '★'; btn.style.color = '#1D9E75'; }
  setTimeout(() => { if (btn) { btn.textContent = '☆'; btn.style.color = ''; } }, 2000);
}

function deletePlace(idx) {
  APP.savedPlaces.splice(idx, 1);
  localStorage.setItem('seocheon_places', JSON.stringify(APP.savedPlaces));
  renderFavorites();
}

// ── 검색 이력 저장 ─────────────────────────────────────────────
function saveSearchHistory(from, to) {
  const key = 'seocheon_route_history';
  const hist = JSON.parse(localStorage.getItem(key) || '[]');
  const idx = hist.findIndex(h => h.from === from && h.to === to);
  if (idx >= 0) { hist[idx].count++; hist.unshift(hist.splice(idx, 1)[0]); }
  else hist.unshift({ from, to, count: 1 });
  localStorage.setItem(key, JSON.stringify(hist.slice(0, 20)));
}

// ── 권역 탭 ────────────────────────────────────────────────────
let selectedZone = 'all';

function initZoneTabs() {
  const container = document.getElementById('zone-tabs');
  if (!container) return;
  container.innerHTML = ZONES.map(z =>
    `<div class="zone-tab ${z.id === 'all' ? 'active' : ''}"
          style="${z.id === 'all' ? `background:${z.color}` : `border-color:${z.color};color:${z.color}`}"
          onclick="selectZone('${z.id}')">${z.name}</div>`
  ).join('');
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

// ── 노선 시간표 팝업 ───────────────────────────────────────────
let _timetableReturnScreen = null;

function showRouteFromTimetable(busNum, terminus) {
  _timetableReturnScreen = 'timetable';
  showScreen('routes');
  setTimeout(() => {
    const route = APP.routes.find(r =>
      getBusNum(r) === busNum || r['번호'] === busNum.replace(/\(.*\)/, '').trim()
    );
    if (route) {
      const idx = (window._filteredRoutes || APP.routes).indexOf(route);
      if (idx >= 0) showRouteTimetable(route['번호'], idx);
    }
  }, 300);
}

function showRouteTimetable(routeNum, idx) {
  const routes = window._filteredRoutes || APP.routes;
  const route = routes[idx] || APP.routes.find(r => r['번호'] === routeNum);
  if (!route) return;

  document.querySelectorAll('.route-list-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });

  if (mapRoutes) showRouteOnMap(route);

  // 시간표 패널
  const panel = document.getElementById('route-timetable-panel');
  if (!panel) return;
  panel.style.display = 'flex';

  const dayType = getDayType();
  const allMins = allBusMins(route, dayType);
  const nowMin  = new Date().getHours() * 60 + new Date().getMinutes();
  const color   = getZoneColor(route);

  const chips = allMins.map(m => {
    const t = minToTime(m);
    const isPast = m < nowMin;
    const isNext = !isPast && allMins.find(x => x >= nowMin) === m;
    return `<span class="tt-chip ${isNext ? 'next' : ''} ${isPast ? 'past' : ''}"
                  style="${isNext ? `border-color:${color};color:${color}` : ''}">${t}</span>`;
  }).join('');

  const lineName = (route['노선군'] || '').replace(/\d+번대?\s*/g, '').replace(/타시도\s*/g, '').trim();

  panel.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid #f0f0f0">
    <span class="bus-pill" style="background:${color}">${getBusNum(route)}</span>
    <div style="flex:1">
      ${lineName ? `<div style="font-size:12px;font-weight:700">${lineName}</div>` : ''}
      <div style="font-size:11px;color:#888">${route['기점']} ↔ ${route['종점']} · ${route['거리']}km</div>
    </div>
    <button onclick="closeRouteTimetable()" style="border:none;background:none;font-size:18px;color:#aaa;cursor:pointer">✕</button>
  </div>
  <div style="padding:10px 12px;font-size:11px;color:#888">
    평일 ${route['평일횟수']}회 · 첫차 ${route['첫차']} · 막차 ${route['막차']}
  </div>
  <div style="padding:0 10px 12px;display:flex;flex-wrap:wrap;gap:4px">${chips}</div>`;
}

function closeRouteTimetable() {
  const panel = document.getElementById('route-timetable-panel');
  if (panel) panel.style.display = 'none';
}

function routesBack() {
  if (_timetableReturnScreen) {
    const t = _timetableReturnScreen;
    _timetableReturnScreen = null;
    showScreen(t);
  } else {
    showScreen('home');
  }
}

// ── 경유지 토글 ────────────────────────────────────────────────
function toggleVia() {
  const row = document.getElementById('via-row');
  const btn = document.getElementById('add-via-btn');
  if (!row) return;
  const visible = row.style.display !== 'none';
  row.style.display = visible ? 'none' : 'flex';
  if (btn) btn.textContent = visible ? '+ 경유지 추가' : '− 경유지 제거';
}

// ── GPS 위치 이동 ──────────────────────────────────────────────
function goToMyLocation() {
  if (mapHome) mapHome.setCenter(new kakao.maps.LatLng(APP.myLocation.lat, APP.myLocation.lng));
}


// 출발/도착 교환
function swapFromTo() {
  const fromEl = document.getElementById('text-from');
  const toEl   = document.getElementById('text-to');
  if (!fromEl || !toEl) return;

  // 텍스트 교환
  const fromVal = fromEl.textContent;
  const toVal   = toEl.textContent;
  fromEl.textContent = toVal;
  toEl.textContent   = fromVal;

  // placeholder 클래스 처리
  const placeholder = '도착지 입력 또는 선택';
  fromEl.classList.toggle('loc-placeholder', fromEl.textContent === placeholder);
  toEl.classList.toggle('loc-placeholder',   toEl.textContent   === placeholder);

  // GPS 태그 처리
  const tagFrom = document.getElementById('tag-from');
  if (tagFrom) tagFrom.style.display = (fromVal === '현위치') ? 'none' : '';

  // state 교환
  const tmp = APP.searchState.from;
  APP.searchState.from = APP.searchState.to || { name: toVal };
  APP.searchState.to   = tmp || { name: fromVal };
}

// 외부 클릭 시 자동완성 닫기
document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-panel')) {
    document.getElementById('autocomplete-from')?.style.setProperty('display','none');
    document.getElementById('autocomplete-to')?.style.setProperty('display','none');
  }
});
