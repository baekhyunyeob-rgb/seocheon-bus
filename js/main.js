// ================================================================
// main.js — 앱 초기화, 정류장별 시간표
// ================================================================

// ── 앱 초기화 ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initLocation();
  loadKakaoMap();
  initZoneTabs();
  renderFavorites();
  initBackHandler();
  initTabbarScroll();
  initSheetSwipe();
  initTransport();
  initStopSearch();
});

// ── 정류장별 버스 시간표 ───────────────────────────────────────
function initStopSearch() {
  // 시간표 화면 정류장 검색
  const input = document.getElementById('stop-search-input');
  if (input) {
    input.addEventListener('input', e => onStopSearchInput(e.target.value));
  }
}

function onStopSearchInput(val) {
  const container = document.getElementById('stop-search-results');
  if (!container) return;
  if (!val.trim()) { container.innerHTML = ''; return; }

  const matches = APP.stops
    .filter(s => s.displayName.includes(val) || s.name.includes(val))
    .slice(0, 15);

  if (!matches.length) {
    container.innerHTML = `<div class="stop-search-empty">검색 결과 없음</div>`;
    return;
  }

  container.innerHTML = matches.map(s =>
    `<div class="stop-search-item" onclick="selectStopForTimetable('${s.name}','${s.displayName}',${s.lat},${s.lng})">
      <span class="stop-search-icon">🚌</span>
      <span>${s.displayName}</span>
    </div>`
  ).join('');
}

function clearStopSearch() {
  const input = document.getElementById('stop-search-input');
  const results = document.getElementById('stop-search-results');
  if (input) input.value = '';
  if (results) results.innerHTML = '';
}

function selectStopForTimetable(stopName, displayName, lat, lng) {
  clearStopSearch();
  renderStopTimetable(stopName, displayName, lat, lng);
}

// ── 정류장별 시간표 렌더링 ─────────────────────────────────────
function renderStopTimetable(stopName, displayName, lat, lng) {
  const body = document.getElementById('timetable-body');
  if (!body) return;

  const dayType = getDayType();
  const nowMin  = new Date().getHours() * 60 + new Date().getMinutes();

  // 이 정류장을 경유하는 모든 노선 찾기
  const passing = [];
  APP.routes.forEach(route => {
    const coords = getRouteCoords(route);
    const idx = nearestCoordIdx(coords, Number(lat), Number(lng), 500);
    if (idx === -1) return;

    // 탑승 가능한 다음 버스 시각 추정
    const boardMin = estimateBoardMin(route, coords, idx, nowMin, dayType);
    if (boardMin === null) return; // 막차 지남

    passing.push({ route, stopIdx: idx, boardMin, coords });
  });

  if (!passing.length) {
    body.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#aaa">
      <div style="font-size:32px;margin-bottom:12px">🚌</div>
      <div style="font-size:14px;font-weight:600;color:#888">운행 버스가 없습니다</div>
      <div style="font-size:12px;margin-top:6px">오늘 이 정류장을 지나는 버스가 없거나<br>모든 버스가 종료됐습니다</div>
    </div>`;
    return;
  }

  // 다음 버스 시각 순 정렬
  passing.sort((a, b) => a.boardMin - b.boardMin);

  const stopTitle = document.getElementById('timetable-stop-title');
  if (stopTitle) stopTitle.textContent = displayName || stopName;

  let html = '';
  passing.forEach(({ route, stopIdx, boardMin, coords }) => {
    const color  = getZoneColor(route);
    const busNum = getBusNum(route);
    const timeStr = minToTime(boardMin);
    const waitMin = boardMin - nowMin;
    const waitStr = waitMin <= 0 ? '곧 출발' : fmtWait(waitMin);

    // 이후 버스 시각들 (현재 이후)
    const allMins  = allBusMins(route, dayType);
    const leg0Min  = segTravelMin(route, coords, 0, stopIdx);
    const futureTimes = allMins
      .map(m => m + leg0Min)
      .filter(m => m > boardMin)
      .slice(0, 5);

    const chips = futureTimes.map(m =>
      `<span class="tt-chip">${minToTime(m)}</span>`
    ).join('');

    const lineName = (route['노선군'] || '')
      .replace(/\d+번대?\s*/g, '')
      .replace(/타시도\s*/g, '')
      .trim();

    // 방향 요약 (이 정류장 이후 주요 정류장)
    const stopNames  = getStopNames(route);
    const totalStops = stopNames.length;
    const fromRatio  = stopIdx / Math.max(coords.length - 1, 1);
    const fromSIdx   = Math.round(fromRatio * (totalStops - 1));
    const remaining  = stopNames.slice(fromSIdx + 1);
    const dirSummary = remaining.length
      ? `→ ${remaining[Math.floor(remaining.length / 2)] || ''} → ${remaining[remaining.length - 1]}`
      : `→ ${route['종점']}`;

    html += `<div class="tt-card">
      <div class="tt-card-top">
        <span class="bus-pill" style="background:${color}">${busNum}</span>
        <span class="tt-dir">${dirSummary}</span>
        <span class="tt-wait ${waitMin <= 3 ? 'soon' : ''}">${waitStr}</span>
      </div>
      <div class="tt-card-time">
        <span class="tt-next-time">${timeStr}</span>
        <span class="tt-next-label">탑승</span>
      </div>
      ${chips ? `<div class="tt-row"><span class="tt-label">이후</span><div class="tt-chips">${chips}</div></div>` : ''}
    </div>`;
  });

  body.innerHTML = html;
}

// ── 노선번호 클릭 → 노선도 화면 ──────────────────────────────
function showRouteFromTimetable(busNum, terminus) {
  _timetableReturnScreen = 'timetable';
  showScreen('routes');
  setTimeout(() => {
    const route = APP.routes.find(r =>
      getBusNum(r) === busNum ||
      r['번호'] === busNum.replace(/\(.*\)/, '').trim()
    );
    if (route) {
      const idx = (window._filteredRoutes || APP.routes).indexOf(route);
      if (idx >= 0) showRouteTimetable(route['번호'], idx);
    }
  }, 300);
}
