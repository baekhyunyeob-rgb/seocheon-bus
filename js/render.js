// ================================================================
// render.js — 통일된 화면 렌더링
// ================================================================

// ── 공통 컴포넌트 ──────────────────────────────────────────────

// 노선 pill (번호 배지)
function pillHtml(route) {
  const color = getZoneColor(route);
  return `<span class="bus-pill" style="background:${color}">${getBusNum(route)}</span>`;
}

// 정류장 행 (통일 형식)
// dot: sc-current | sc-transfer | sc-end | sc-done | sc-upcoming
function stopRowHtml(dot, hasLine, name, rightHtml, isDone) {
  return `<div class="stop-row">
    <div class="stop-track">
      <div class="stop-circle ${dot}"></div>
      ${hasLine ? '<div class="stop-vline"></div>' : ''}
    </div>
    <span class="stop-name ${isDone ? 'done' : dot === 'sc-current' ? 'current' : ''}">${name}</span>
    <div class="stop-right">${rightHtml}</div>
  </div>`;
}

// 시각 + 액션 태그 (통일 형식)
// color: blue=탑승, orange=환승, red=도착
function timeTagHtml(time, label, color) {
  const colors = {
    blue:   { text: '#185FA5', bg: '#E6F1FB' },
    orange: { text: '#FF8C00', bg: '#FFF3E0' },
    red:    { text: '#E24B4A', bg: '#FDECEA' },
    gray:   { text: '#aaa',   bg: '#f0f0f0'  },
  };
  const c = colors[color] || colors.gray;
  return `<span style="color:${c.text};font-weight:700;font-size:12px">${time}</span>
          <span style="background:${c.bg};color:${c.text};font-size:10px;font-weight:700;padding:1px 6px;border-radius:4px;white-space:nowrap">${label}</span>`;
}

// ── 검색 결과 렌더링 ───────────────────────────────────────────
function renderResults(results, fromName, toName, dayType) {
  const body = document.getElementById('result-body');
  if (!body) return;

  if (!results.length) {
    body.innerHTML = `<div style="padding:40px 20px;text-align:center;color:#aaa">
      <div style="font-size:32px;margin-bottom:12px">🚌</div>
      <div style="font-size:14px;font-weight:600;color:#888">운행 버스가 없습니다</div>
      <div style="font-size:12px;margin-top:6px">출발지·시간을 변경하거나<br>환승 경로를 확인해보세요</div>
    </div>`;
    return;
  }

  window._searchResults = results; // 상세 화면용 저장

  let html = '';
  const best = results[0];
  const others = results.slice(1);

  html += `<div class="result-section-label">추천 경로</div>`;
  html += renderRouteCard(best, 0, true, dayType);

  if (others.length) {
    html += `<div class="result-section-label" style="margin-top:4px">기타 경로</div>`;
    others.forEach((r, i) => { html += renderRouteCard(r, i + 1, false, dayType); });
  }

  // 복귀시에는
  const retBaseMin = best.arriveMin + 30;
  const ret = findReturnRoute(toName, fromName, retBaseMin, dayType);
  if (ret) {
    html += `<div class="result-section-label" style="margin-top:4px">복귀시에는</div>`;
    html += renderReturnCard(ret, dayType);
  }

  body.innerHTML = html;
}

// ── 경로 카드 ──────────────────────────────────────────────────
function renderRouteCard(r, idx, isBest, dayType) {
  const color1 = getZoneColor(r.route);
  const busNum1 = getBusNum(r.route);

  if (r.type === 'transfer') {
    const color2  = getZoneColor(r.route2);
    const busNum2 = getBusNum(r.route2);

    // 경유 요약
    const summary = getLineSummary(r.route, r.fromIdx);

    return `<div class="route-card ${isBest ? 'best' : ''}" onclick="showDetail(${idx})">
      <div class="rc-top">
        <span class="bus-pill" style="background:${color1}">${busNum1}</span>
        <span class="rc-arrow">→</span>
        <span class="rc-hub">${r.hubName}</span>
        <span class="rc-arrow">→</span>
        <span class="bus-pill" style="background:${color2}">${busNum2}</span>
        <span class="rc-badge badge-transfer" style="margin-left:auto">환승 1회</span>
      </div>
      <div class="rc-times">
        <span class="rc-depart">${r.boardTime}</span>
        <span class="rc-sep">→</span>
        <span class="rc-transfer-info">${r.hubArrTime} 환승</span>
        <span class="rc-sep">→</span>
        <span class="rc-arrive">${r.arriveTime}</span>
        <span class="rc-duration">${fmtDuration(r.travelMin)}</span>
      </div>
      ${renderTimesRow(r.route, r.boardTime, dayType, color1)}
    </div>`;
  }

  // 직행
  const summary = getLineSummary(r.route, r.fromIdx);

  return `<div class="route-card ${isBest ? 'best' : ''}" onclick="showDetail(${idx})">
    <div class="rc-top">
      <span class="bus-pill" style="background:${color1}">${busNum1}</span>
      <span class="rc-route-summary">${summary}</span>
    </div>
    <div class="rc-times">
      <span class="rc-depart">${r.boardTime}</span>
      <span class="rc-sep">→</span>
      <span class="rc-arrive">${r.arriveTime}</span>
      <span class="rc-duration">${fmtDuration(r.travelMin)}</span>
    </div>
    ${renderTimesRow(r.route, r.boardTime, dayType, color1)}
  </div>`;
}

// 복귀 카드
function renderReturnCard(r, dayType) {
  const color = getZoneColor(r.route);
  const busNum = getBusNum(r.route);
  const retTime = r.boardTime;
  const timesHtml = renderTimesRow(r.route, retTime, dayType, color);
  return `<div class="route-card ret" style="border:1px solid #d0d0d0">
    <div class="rc-top">
      <span class="bus-pill" style="background:${color}">${busNum}</span>
      <span class="rc-route-summary">${getLineSummary(r.route, r.fromIdx)}</span>
    </div>
    <div class="rc-times">
      <span class="rc-depart">${retTime}</span>
      <span class="rc-sep">→</span>
      <span class="rc-arrive">${r.arriveTime}</span>
      <span class="rc-duration">${fmtDuration(r.travelMin)}</span>
    </div>
    ${timesHtml}
  </div>`;
}

// 이후 버스 시각 행
function renderTimesRow(route, currentTime, dayType, color) {
  const currentMin = timeToMin(currentTime);
  const allMins = allBusMins(route, dayType);
  const future = allMins.filter(m => m > currentMin).slice(0, 8);
  if (!future.length) return '';

  const chips = future.map(m => {
    const t = minToTime(m);
    const isNext = future.indexOf(m) === 0;
    return `<span class="tt-chip ${isNext ? 'next' : ''}" style="${isNext ? `border-color:${color};color:${color}` : ''}">${t}</span>`;
  }).join('');

  return `<div class="tt-row">
    <span class="tt-label">이후</span>
    <div class="tt-chips">${chips}</div>
  </div>`;
}

// 노선 경유 요약 (탑승지 기준)
function getLineSummary(route, fromIdx) {
  const stops = getStopNames(route);
  const total = stops.length;
  const fromStop = stops[Math.round((fromIdx / Math.max(getRouteCoords(route).length - 1, 1)) * (total - 1))] || stops[0];
  const toStop   = stops[total - 1];
  const mid      = stops[Math.floor(total / 2)];

  if (fromStop === toStop) return toStop;
  if (total <= 4) return stops.join(' → ');

  // 출발지(진하게) → 중간 → 도착지(진하게)
  return `<b>${fromStop}</b> → ${mid} → <b>${toStop}</b>`;
}

// ── 경로 상세 정류장 목록 ──────────────────────────────────────
function renderDetailStops(result) {
  const container = document.getElementById('stop-list');
  if (!container) return;

  if (result.type === 'transfer') {
    renderTransferStops(result, container);
  } else {
    renderDirectStops(result, container);
  }
}

// 직행 정류장 목록
function renderDirectStops(r, container) {
  const stops = getStopNames(r.route);
  const coords = getRouteCoords(r.route);
  const totalCoords = coords.length - 1;

  // 탑승 인덱스 (coords 비율 → stops 인덱스)
  const boardStopIdx = Math.round((r.fromIdx / Math.max(totalCoords, 1)) * (stops.length - 1));
  const lastIdx = stops.length - 1;
  const color = getZoneColor(r.route);
  const busNum = getBusNum(r.route);

  // 표시할 정류장 인덱스 결정
  const showSet = new Set();
  if (boardStopIdx > 0) showSet.add(boardStopIdx - 1);
  showSet.add(boardStopIdx);
  for (let i = boardStopIdx + 1; i <= Math.min(boardStopIdx + 3, lastIdx - 1); i++) showSet.add(i);
  showSet.add(lastIdx);

  let html = '';
  let prevShown = -1;
  const avgMin = r.travelMin / Math.max(lastIdx - boardStopIdx, 1);

  stops.forEach((name, i) => {
    const isDone   = i < boardStopIdx;
    const isBoard  = i === boardStopIdx;
    const isEnd    = i === lastIdx;
    const etaMin   = r.boardMin + (i - boardStopIdx) * avgMin;
    const etaStr   = i >= boardStopIdx ? minToTime(Math.round(etaMin)) : '';

    if (showSet.has(i) && prevShown !== -1 && i - prevShown > 1) {
      html += `<div class="stop-row">
        <div class="stop-track"><div class="stop-circle sc-skip"></div><div class="stop-vline"></div></div>
        <span class="stop-name" style="color:#ccc;font-size:11px">··· ${i - prevShown - 1}개 정류장</span>
        <div class="stop-right"></div>
      </div>`;
    }
    if (!showSet.has(i)) return;
    prevShown = i;

    const dot = isDone ? 'sc-done' : isBoard ? 'sc-current' : isEnd ? 'sc-end' : 'sc-upcoming';
    let right = '';
    if (isDone) {
      right = `<span style="color:#ddd;font-size:11px">통과</span>`;
    } else if (isBoard) {
      right = `<span class="bus-pill" style="background:${color};font-size:10px">${busNum}</span>
               ${timeTagHtml(etaStr, '탑승', 'blue')}`;
    } else if (isEnd) {
      right = timeTagHtml(etaStr, '도착', 'red');
    } else {
      right = `<span class="stop-eta">${etaStr}</span>`;
    }
    html += stopRowHtml(dot, i < lastIdx, name, right, isDone);
  });

  container.innerHTML = html;
}

// 환승 정류장 목록 (3행으로 간결하게)
function renderTransferStops(r, container) {
  const color1 = getZoneColor(r.route);
  const color2 = getZoneColor(r.route2);
  const busNum1 = getBusNum(r.route);
  const busNum2 = getBusNum(r.route2);
  const fromName = APP.searchState.from?.name || '';
  const toName   = APP.searchState.to?.name || '';
  const hubName  = r.hubName || '';

  let html = '';

  // 출발
  html += stopRowHtml('sc-current', true, fromName,
    `<span class="bus-pill" style="background:${color1};font-size:10px">${busNum1}</span>
     ${timeTagHtml(r.boardTime, '탑승', 'blue')}`, false);

  // 환승지
  html += stopRowHtml('sc-transfer', true, hubName,
    `${timeTagHtml(r.hubArrTime, '도착', 'orange')}
     <span class="bus-pill" style="background:${color2};font-size:10px;margin-left:4px">${busNum2}</span>
     ${timeTagHtml(r.bus2Time, '환승', 'orange')}`, false);

  // 도착
  html += stopRowHtml('sc-end', false, toName,
    timeTagHtml(r.arriveTime, '도착', 'red'), false);

  container.innerHTML = html;
}

// ── LIVE 배너 업데이트 ─────────────────────────────────────────
function updateLiveBanner(result) {
  const nameEl   = document.getElementById('live-bus-name');
  const statusEl = document.getElementById('live-bus-status');
  if (!nameEl || !statusEl) return;

  const lineName = (result.route['노선군'] || '')
    .replace(/\d+번대?\s*/g, '')
    .replace(/타시도\s*/g, '')
    .trim();
  nameEl.textContent  = `${getBusNum(result.route)} ${lineName} 운행중`;
  statusEl.textContent = `2정류장 전 통과`;
}

// ── 버스노선도 목록 ────────────────────────────────────────────
function renderRouteList(zoneId) {
  const container = document.getElementById('route-list');
  if (!container) return;

  const filtered = zoneId === 'all'
    ? APP.routes
    : APP.routes.filter(r => getZoneId(r) === zoneId);

  if (!filtered.length) {
    container.innerHTML = `<div class="loading">해당 권역 노선이 없습니다</div>`;
    return;
  }

  window._filteredRoutes = filtered;
  container.innerHTML = filtered.map((r, idx) => {
    const color = getZoneColor(r);
    const lineName = (r['노선군'] || '')
      .replace(/\d+번대?\s*/g, '')
      .replace(/타시도\s*/g, '')
      .trim();
    return `<div class="route-list-item" onclick="showRouteTimetable('${r['번호']}', ${idx})">
      <span class="rli-num" style="background:${color}">${getBusNum(r)}</span>
      <div class="rli-info">
        ${lineName ? `<div class="rli-name">${lineName}</div>` : ''}
        <div class="rli-sub">${r['기점']} ↔ ${r['종점']} · ${r['거리']}km</div>
      </div>
      <span class="rli-count">평일 ${r['평일횟수']}회</span>
      <span class="rli-arr">›</span>
    </div>`;
  }).join('');
}

// ── 범례 렌더링 ────────────────────────────────────────────────
function renderLegend() {
  const container = document.getElementById('legend-bar');
  if (!container) return;
  const items = [
    ...ZONES.slice(1).map(z => ({ color: z.color, name: z.name })),
    { color: COLOR_OUTSIDE, name: '타시도' },
  ];
  container.innerHTML = items.map(z =>
    `<div class="legend-item">
      <div class="legend-line" style="background:${z.color}"></div>
      <span>${z.name}</span>
    </div>`
  ).join('');
}

// ── 즐겨찾기 렌더링 ────────────────────────────────────────────
function renderFavorites() {
  const body = document.getElementById('favorites-body');
  if (!body) return;

  const history = JSON.parse(localStorage.getItem('seocheon_route_history') || '[]');
  let html = '';

  // 자주 이용한 경로
  html += `<div class="fav-section-title">자주 이용한 경로</div>`;
  if (!history.length) {
    html += `<div class="fav-empty">검색 이력이 없습니다<br><small>경로를 검색하면 자동으로 기록됩니다</small></div>`;
  } else {
    history.slice(0, 3).forEach(h => {
      html += `<div class="fav-item" onclick="quickSearch('${h.from}','${h.to}')">
        <div class="fav-icon" style="background:#E1F5EE">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 7h11M7 1.5l5.5 5.5-5.5 5.5" stroke="#0F6E56" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="flex:1">
          <div class="fav-main">${h.from} → ${h.to}</div>
          <div class="fav-count">${h.count}회 이용</div>
        </div>
        <span style="font-size:11px;color:#ccc">›</span>
      </div>`;
    });
  }

  // 저장된 장소
  html += `<div class="fav-divider"></div>`;
  html += `<div class="fav-section-title">저장된 장소</div>`;
  if (!APP.savedPlaces.length) {
    html += `<div class="fav-empty">저장된 장소가 없습니다<br><small>홈 화면 도착지 옆 ☆ 버튼으로 추가하세요</small></div>`;
  } else {
    APP.savedPlaces.forEach((p, idx) => {
      html += `<div class="fav-item">
        <div class="fav-icon" style="background:#E6F1FB">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#185FA5"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
        </div>
        <div style="flex:1">
          <div class="fav-main">${p.label}</div>
          <div class="fav-sub">${p.name}</div>
        </div>
        <div class="place-tags">
          <span class="place-action-tag pat-from" onclick="quickSearchFrom('${p.name}',${p.lat},${p.lng})">출발</span>
          <span class="place-action-tag pat-to"   onclick="quickSearchTo('${p.name}',${p.lat},${p.lng})">도착</span>
          <span class="place-action-tag pat-del"  onclick="deletePlace(${idx})">✕</span>
        </div>
      </div>`;
    });
  }

  body.innerHTML = html;
}
