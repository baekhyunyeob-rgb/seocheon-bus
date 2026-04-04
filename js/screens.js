'use strict';

// ==================== 장소 검색 모달 ====================
let _placeTarget = 'to';

function openPlaceSearch(target) {
  _placeTarget = target;
  const titles = { from:'출발지 선택', via:'경유지 선택', to:'도착지 선택' };
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
  const el = document.getElementById('modal-saved');
  let html = '';

  if (target === 'from' && STATE.gpsReady) {
    html += `<div class="modal-section-label">빠른 선택</div>
    <div class="modal-item" onclick="selectPlace('from',${JSON.stringify({name:'현위치',lat:STATE.myLocation.lat,lng:STATE.myLocation.lng,isGps:true}).replace(/"/g,'&quot;')})">
      <div class="modal-item-icon" style="background:var(--blue-l)">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3" fill="#185FA5"/><circle cx="7" cy="7" r="1.5" fill="#fff"/></svg>
      </div>
      <div><div class="modal-item-name">현위치</div><div class="modal-item-sub">GPS 자동 감지</div></div>
    </div>`;
  }

  if (STATE.savedPlaces.length) {
    html += `<div class="modal-section-label">저장된 장소</div>`;
    STATE.savedPlaces.forEach(p => {
      html += `<div class="modal-item" onclick="selectPlace('${target}',${JSON.stringify(p).replace(/"/g,'&quot;')})">
        <div class="modal-item-icon" style="background:var(--blue-l)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#185FA5"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
        </div>
        <div><div class="modal-item-name">${p.label||p.name}</div><div class="modal-item-sub">${p.name}</div></div>
      </div>`;
    });
  }
  el.innerHTML = html;
}

function onPlaceInput(val) {
  const el = document.getElementById('modal-results');
  if (!val.trim()) { el.innerHTML=''; return; }

  const results = STOPS.filter(s => s.name.includes(val.trim()) || (s.displayName||'').includes(val.trim())).slice(0,20);
  if (!results.length) {
    // 카카오 로컬 검색 fallback
    el.innerHTML='<div style="padding:10px;font-size:12px;color:var(--text-3)">정류장을 찾는 중...</div>';
    searchPlaceKakao(val.trim(), el);
    return;
  }
  renderStopResults(results, el);
}

function searchPlaceKakao(keyword, container) {
  if (typeof kakao==='undefined') return;
  const ps = new kakao.maps.services.Places();
  ps.keywordSearch(keyword+' 서천', (data, status) => {
    if (status!==kakao.maps.services.Status.OK||!data.length) {
      container.innerHTML='<div style="padding:10px;font-size:12px;color:var(--text-3)">결과 없음</div>';
      return;
    }
    const pLat=parseFloat(data[0].y), pLng=parseFloat(data[0].x);
    const nearest = STOPS.map(s=>({...s,d:distM(s.lat,s.lng,pLat,pLng)})).sort((a,b)=>a.d-b.d).slice(0,5);
    // place_name은 외부 API 값이므로 innerHTML 직접 삽입 금지 → textContent 사용
    const label = document.createElement('div');
    label.className = 'modal-section-label';
    label.textContent = `"${data[0].place_name}" 인근 정류장`;
    container.innerHTML = '';
    container.appendChild(label);
    renderStopResults(nearest, container, true);
  });
}

function renderStopResults(results, container, append=false) {
  const html = results.map(s => {
    const disp = s.displayName||s.name;
    const diffName = disp!==s.name ? `<div class="modal-item-sub">${s.name}</div>` : '';
    const placeData = JSON.stringify({name:s.name,displayName:disp,lat:s.lat,lng:s.lng}).replace(/"/g,'&quot;');
    const isSaved = STATE.savedPlaces.some(p => p.name===s.name);
    const starColor = isSaved ? '#EF9F27' : '#ccc';
    const starFill  = isSaved ? '#EF9F27' : 'none';
    return `<div class="modal-item" style="position:relative">
      <div class="modal-item-icon" style="background:var(--green-l)" onclick="selectPlace('${_placeTarget}',${placeData})">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#1D9E75"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
      </div>
      <div style="flex:1;min-width:0" onclick="selectPlace('${_placeTarget}',${placeData})">
        <div class="modal-item-name">${disp}</div>${diffName}
      </div>
      <button onclick="toggleSavePlace(${placeData},this)" style="background:none;border:none;padding:4px 6px;cursor:pointer;flex-shrink:0" title="즐겨찾기 ${isSaved?'해제':'등록'}">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="${starFill}" stroke="${starColor}" stroke-width="1.4">
          <path d="M9 1.5l2.09 4.24 4.68.68-3.39 3.3.8 4.67L9 12.02l-4.18 2.37.8-4.67L2.23 6.42l4.68-.68z" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>`;
  }).join('');
  if (append) container.innerHTML += html;
  else container.innerHTML = `<div class="modal-section-label">정류장 검색 결과</div>${html}`;
}

function toggleSavePlace(place, btn) {
  if (typeof place === 'string') place = JSON.parse(place);
  const idx = STATE.savedPlaces.findIndex(p => p.name === place.name);
  if (idx >= 0) {
    STATE.savedPlaces.splice(idx, 1);
  } else {
    STATE.savedPlaces.push({ name: place.name, displayName: place.displayName||place.name, lat: place.lat, lng: place.lng });
  }
  localStorage.setItem('sc_places', JSON.stringify(STATE.savedPlaces));
  const saved = STATE.savedPlaces.some(p => p.name === place.name);
  const svg = btn.querySelector('svg');
  if (svg) {
    svg.setAttribute('fill', saved ? '#EF9F27' : 'none');
    svg.setAttribute('stroke', saved ? '#EF9F27' : '#ccc');
  }
  btn.title = saved ? '즐겨찾기 해제' : '즐겨찾기 등록';
}

function selectPlace(target, place) {
  if (typeof place === 'string') place = JSON.parse(place);
  STATE.search[target] = place;
  renderHomeSheet();
  updateHomeMarkers();
  closePlaceModal();
}

// ==================== 버스시간표 화면 ====================
function onStopSearchInput(val) {
  const resEl = document.getElementById('stop-search-results');
  if (!val.trim()) { resEl.style.display='none'; return; }
  const v = val.trim();
  const matches = STOPS.filter(s=>s.name.includes(v)||(s.displayName||'').includes(v))
    .filter((s,i,arr)=>arr.findIndex(x=>x.name===s.name)===i).slice(0,15);
  if (!matches.length) { resEl.style.display='none'; return; }
  resEl.innerHTML = matches.map(s => {
    const disp=s.displayName||s.name;
    return `<div class="tt-result-item" onclick="selectStopForTimetable('${s.name.replace(/'/g,"\\'")}','${disp.replace(/'/g,"\\'")}',${s.lat},${s.lng})">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1C4.3 1 3 2.3 3 4c0 2.5 3 6 3 6s3-3.5 3-6c0-1.7-1.3-3-3-3z" fill="#EF9F27"/><circle cx="6" cy="4" r="1.2" fill="#fff"/></svg>
      ${disp}
    </div>`;
  }).join('');
  resEl.style.display='block';
}

function clearStopSearch() {
  document.getElementById('stop-search-input').value='';
  document.getElementById('stop-search-results').style.display='none';
  document.getElementById('timetable-body').innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-3);font-size:13px">정류장명을 검색하세요</div>`;
}

function selectStopForTimetable(name, disp, lat, lng) {
  document.getElementById('stop-search-input').value=disp;
  document.getElementById('stop-search-results').style.display='none';
  renderStopTimetable(name, disp, lat, lng);
}

// 허브 정류장 목록 (환승 허브 + 이용 빈도 높은 곳)
const TT_HUB_STOPS = new Set([
  '서천터미널','한산공용터미널','장항터미널',
  '서천역','장항역','판교역',
  '판교','기산','문산','화양','비인','마서','종천','장항읍내',
  '서천시외버스터미널','장항시외버스터미널',
]);

function renderStopTimetable(stopName, displayName, lat, lng) {
  const dayType = getDayType();
  const nMin    = nowMin();

  const rows = [];
  ROUTES.forEach(route => {
    const coords = getRouteCoords(route);
    if (!coords.length) return;

    // 검색 정류장 인덱스
    let idx = findIdxByName(coords, stopName);
    if (idx === -1) idx = findIdxByCoord(coords, lat, lng, 300);
    if (idx === -1) return;

    const ck    = getCountKey(dayType);
    const count = route[ck] || 0;
    if (!count || !route['첫차'] || !route['막차']) return;

    // 기점→검색 정류장 소요시간 추정
    const fc = coords[0], sc = coords[idx];
    const leg0 = (fc?.lat && sc?.lat)
      ? Math.round(distM(fc.lat, fc.lng, sc.lat, sc.lng) / 1000 * 2.5)
      : Math.round((route['거리'] || 10) * 2.5 * idx / Math.max(coords.length - 1, 1));

    // ── 순환 노선 판별 ────────────────────────────────────
    // 종점이 경유 텍스트 중간에도 나타나면 순환 노선
    const terminus     = route['종점'];
    const viaStopsText = (route['경유'] || '').split('→').map(s => s.trim()).filter(Boolean);
    const terminusMidIdx = viaStopsText.indexOf(terminus);
    const isCircular   = terminusMidIdx !== -1 && terminusMidIdx < viaStopsText.length - 1;

    // ── 주요경유 3조건 ────────────────────────────────────
    // 조건 1: 검색 정류장(idx) 이후 구간만 (coords 기반)
    // 조건 2: 종점 제외, 중복 이름 제거
    // 조건 3: 허브 우선 2개 이상 확보, 부족하면 비허브로 채워 최대 3개
    const seenNames = new Set([terminus]);
    const hubList = [], nonHubList = [];
    for (let i = idx + 1; i < coords.length - 1; i++) {
      const name = coords[i].name;
      if (!name || seenNames.has(name)) continue;
      seenNames.add(name);
      (TT_HUB_STOPS.has(name) ? hubList : nonHubList).push(name);
    }
    let viaList = (hubList.length >= 2 ? hubList : [...hubList, ...nonHubList]).slice(0, 3);

    // coords 기반 via가 부족하면 route['경유'] 텍스트로 보완
    // 순환 노선은 terminusMidIdx 이후 구간, 일반 노선은 전체에서 탐색
    if (viaList.length < 2) {
      const textStart = isCircular ? terminusMidIdx + 1 : 0;
      const seenText  = new Set([...seenNames, ...viaList]);
      const hubExtra = [], nonHubExtra = [];
      for (let i = textStart; i < viaStopsText.length; i++) {
        const name = viaStopsText[i];
        if (!name || seenText.has(name) || name === terminus) continue;
        seenText.add(name);
        (TT_HUB_STOPS.has(name) ? hubExtra : nonHubExtra).push(name);
      }
      const extra = hubExtra.length ? hubExtra : nonHubExtra;
      viaList = [...viaList, ...extra].slice(0, 3);
    }
    // ─────────────────────────────────────────────────────

    // 통과 시각: timetable.json 실제 값 우선, 없으면 출발시각+소요시간 추정
    const color  = getZoneColor(route);
    const busNum = getBusNum(route);

    // timetable.json에서 해당 정류장 컬럼 찾기
    const ttKey   = route['번호'] + '_' + route['기점'];
    const tt      = TIMETABLE[ttKey];
    const ttStops = tt?.stops || [];
    // coords 상의 정류장명과 timetable stops 매칭
    let ttColIdx = -1;
    for (let ci = 0; ci < ttStops.length; ci++) {
      const ts = ttStops[ci];
      if (coords.some(c => c.name === ts || (stopName && ts === stopName))) {
        // 검색 정류장과 가장 가까운 컬럼 선택
        if (ts === stopName || ttStops[ci] === coords[idx]?.name) {
          ttColIdx = ci; break;
        }
        if (ttColIdx === -1) ttColIdx = ci;
      }
    }

    const ttRows = tt ? (tt[dayType] || tt['weekday'] || []) : [];
    const useTT  = ttColIdx !== -1 && ttRows.length > 0;

    if (useTT) {
      // timetable 실제 통과 시각 사용
      ttRows.forEach(row => {
        const cell = Array.isArray(row) ? row[ttColIdx] : null;
        if (!cell || typeof cell !== 'string' || !cell.includes(':')) return;
        const passMin = timeToMin(cell);
        rows.push({ passMin, busNum, color, via: viaList.join(' → '), terminus, isPast: passMin < nMin, route });
      });
    } else {
      // fallback: 출발시각 + 소요시간 추정
      const busTimes = getRouteTimes(route, dayType);
      busTimes.forEach(depMin => {
        const passMin = depMin + leg0;
        rows.push({ passMin, busNum, color, via: viaList.join(' → '), terminus, isPast: passMin < nMin, route });
      });
    }
  });

  rows.sort((a, b) => a.passMin - b.passMin);
  if (!rows.length) {
    document.getElementById('timetable-body').innerHTML =
      `<div style="text-align:center;padding:40px;color:var(--text-3);font-size:13px">이 정류장을 지나는 버스가 없습니다</div>`;
    return;
  }

  const routeCount = new Set(rows.map(r => r.busNum)).size;
  const nextIdx    = rows.findIndex(r => !r.isPast);

  let html = `<div class="tt-stop-info">
    <div><span class="tt-stop-name">📍 ${displayName}</span></div>
    <span class="tt-stop-meta">${routeCount}개 노선 · ${rows.length}대</span>
  </div>
  <div class="tt-grid-header">
    <div>시간</div><div>번호</div><div>주요경유</div><div>종점</div>
  </div>`;

  rows.forEach((r, i) => {
    const isNext = i === nextIdx;
    // 노선 객체를 안전하게 직렬화 (onclick 속성용)
    const rJson = JSON.stringify(r.route).replace(/"/g, '&quot;');
    const sName = stopName.replace(/'/g, "\\'");
    const sDisp = displayName.replace(/'/g, "\\'");
    html += `<div class="tt-row${r.isPast ? ' past' : isNext ? ' next-bus' : ''}">
      <div class="tt-time${r.isPast ? ' past' : isNext ? ' next' : ''}">${minToTime(r.passMin)}</div>
      <div class="tt-num-cell">
        <span class="bus-pill tt-bus-pill-btn"
          style="background:${r.color};font-size:10px;padding:1px 5px"
          onclick="openRouteFromTimetable(${rJson},'${sName}','${sDisp}',${lat},${lng})"
        >${r.busNum}</span>
      </div>
      <div class="tt-route">${r.via || '—'}</div>
      <div class="tt-dest">${r.terminus}</div>
    </div>`;
  });

  document.getElementById('timetable-body').innerHTML = html;
}

// ── 시간표 노선번호 탭 → 버스노선도 화면 전환 ────────────────────────
// stopName/displayName/lat/lng: 시간표에서 검색했던 정류장 정보
function openRouteFromTimetable(route, stopName, displayName, lat, lng) {
  if (typeof route === 'string') route = JSON.parse(route);

  // 진행 중인 tryShow 루프 취소 (이전 탭과 충돌 방지)
  if (STATE._tryShowTimer) { clearTimeout(STATE._tryShowTimer); STATE._tryShowTimer = null; }

  // 돌아올 화면을 timetable로 기억
  STATE.routesBackScreen = 'timetable';
  STATE._fromTimetable = true;

  // 노선·검색 정류장 상태 저장
  STATE.selectedRoute = route;
  STATE.timetableSearchStop = { name: stopName, displayName, lat, lng };

  // 권역 필터
  const zoneId = getZoneId(route);
  STATE.selectedZone = zoneId;

  // 노선도 화면 전환
  showScreen('routes');
  updateRoutesBackBtn();

  // 권역 배지 UI
  document.querySelectorAll('.zone-badge').forEach(p => p.classList.remove('active'));
  document.getElementById('zone-pill-' + zoneId)?.classList.add('active');

  // 목록 렌더 → 렌더 완료 후 해당 노선 강조 (requestAnimationFrame으로 DOM 완성 보장)
  renderRouteList(zoneId);
  requestAnimationFrame(() => {
    document.querySelectorAll('.route-list-item').forEach(el => el.classList.remove('active'));
    const key = `rli-${route['번호']}-${route['기점'].replace(/\s/g, '')}`;
    const item = document.getElementById(key);
    if (item) {
      item.classList.add('active');
      item.scrollIntoView({ block: 'nearest' });
    }
  });

  // 지도에 노선 표시 — mapRoutes 준비될 때까지 대기 (단일 루프 보장)
  const tryShow = () => {
    if (STATE.mapRoutes) {
      STATE._tryShowTimer = null;
      // 현재 STATE에 저장된 route/stop 사용 (클로저 캡처 값 아님 → 최신 상태 반영)
      showRouteOnMap(STATE.selectedRoute, STATE.timetableSearchStop);
    } else {
      STATE._tryShowTimer = setTimeout(tryShow, 200);
    }
  };
  tryShow();
}

// 노선도 화면 헤더의 뒤로가기 버튼 갱신
function updateRoutesBackBtn() {
  const btn = document.getElementById('routes-back-btn');
  if (!btn) return;
  if (STATE.routesBackScreen) {
    btn.style.display = 'flex';
  } else {
    btn.style.display = 'none';
  }
}

// 노선도에서 뒤로가기
function goBackFromRoutes() {
  // 진행 중인 tryShow 루프 취소
  if (STATE._tryShowTimer) { clearTimeout(STATE._tryShowTimer); STATE._tryShowTimer = null; }

  const target = STATE.routesBackScreen || 'home';
  STATE.routesBackScreen = null;
  STATE.timetableSearchStop = null;
  if (STATE.searchStopMarker) {
    STATE.searchStopMarker.setMap(null);
    STATE.searchStopMarker = null;
  }
  showScreen(target);
}

// ==================== 버스노선도 화면 ====================
function initRoutesScreen() {
  // zone-legend(권역 배지)만 미리 렌더링.
  // renderRouteList는 showScreen('routes') 호출 시(display:flex 확정 후)
  // requestAnimationFrame 안에서 실행되므로 여기서는 호출하지 않는다.
  // (display:none 상태에서 renderRouteList를 호출하면 .routes-list의
  //  scrollHeight가 0으로 고정되어 모바일에서 스크롤이 안 되는 버그 발생)
  renderZoneLegend();
}

function renderZoneLegend() {
  const el = document.getElementById('zone-pills');
  if (!el) return;
  el.innerHTML = ZONES.slice(0,4).map(z =>
    `<div class="zone-badge" id="zone-pill-${z.id}" onclick="filterByZone('${z.id}')"
      style="background:${z.color}">
      <span>${z.name}</span>
    </div>`
  ).join('');
}

function filterByZone(zoneId) {
  const isActive = STATE.selectedZone === zoneId;
  STATE.selectedZone = isActive ? null : zoneId;

  document.querySelectorAll('.zone-badge').forEach(p => p.classList.remove('active'));
  if (!isActive) document.getElementById('zone-pill-'+zoneId)?.classList.add('active');

  renderRouteList(STATE.selectedZone);
  clearRouteMap();
  STATE.selectedRoute = null;
}

// ── 경유지 텍스트 파싱 ──────────────────────────────────────
// 괄호·특수기호 제거 후 정류장 배열 반환
function parseViaStops(viaText) {
  const text = (viaText || '').replace(/\([^)]*\)/g, '');
  return text.split(/[→↔/←]/).map(s => s.trim()).filter(Boolean);
}

// 노선그룹 내 공통 앞부분 길이 계산 (캐시)
const _viaCommonCache = new Map();
function getCommonPrefixLen(routes) {
  const key = routes.map(r => r['번호']).join(',');
  if (_viaCommonCache.has(key)) return _viaCommonCache.get(key);
  const lists = routes.map(r => parseViaStops(r['경유']));
  let len = 0;
  outer: for (let i = 0; i < Math.min(...lists.map(l => l.length)); i++) {
    const val = lists[0][i];
    for (const l of lists) { if (l[i] !== val) break outer; }
    len++;
  }
  _viaCommonCache.set(key, len);
  return len;
}

// 노선의 "차이 경유지" 1~2개 반환
function getDiffVia(route, sameGroupRoutes) {
  const via = parseViaStops(route['경유']);
  if (sameGroupRoutes.length <= 1) {
    // 단독 노선: 중간 경유지 1~2개
    const mid = via.filter(v => v !== route['기점'] && v !== route['종점']);
    return mid.slice(1, 3);
  }
  const commonLen = getCommonPrefixLen(sameGroupRoutes);
  const diff = via.slice(commonLen).filter(v => v !== route['종점']);
  return diff.slice(0, 2);
}

// 전체 경유지 팝업 표시
function showViaPopup(route) {
  // 기존 팝업 제거
  const existing = document.getElementById('via-popup');
  if (existing) { existing.remove(); return; }

  const via = parseViaStops(route['경유']);
  const allStops = [route['기점'], ...via, route['종점']];
  // 중복 제거
  const unique = allStops.filter((v,i,a) => a.indexOf(v) === i);

  const popup = document.createElement('div');
  popup.id = 'via-popup';
  popup.style.cssText = [
    'position:absolute', 'top:8px', 'left:8px', 'z-index:50',
    'background:rgba(255,255,255,0.96)', 'border-radius:10px',
    'padding:10px 12px', 'max-width:calc(100% - 16px)',
    'box-shadow:0 2px 12px rgba(0,0,0,.18)',
    'font-size:11px', 'line-height:1.7', 'color:var(--text-1)',
    'pointer-events:auto',
  ].join(';');

  const color = getZoneColor(route);
  const num   = getBusNum(route);
  popup.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:6px">
        <span class="bus-pill" style="background:${color};font-size:10px;padding:2px 6px">${num}</span>
        <span style="font-weight:600;font-size:12px">${route['기점']} → ${route['종점']}</span>
      </div>
      <button onclick="document.getElementById('via-popup')?.remove()"
        style="background:none;border:none;padding:2px 4px;cursor:pointer;color:var(--text-3);font-size:14px;line-height:1">✕</button>
    </div>
    <div style="color:var(--text-2)">${unique.join(' → ')}</div>`;

  // 지도 컨테이너 위에 절대 위치
  const mapEl = document.getElementById('map-routes');
  if (mapEl) {
    mapEl.style.position = 'relative';
    mapEl.appendChild(popup);
  }
}

function renderRouteList(zoneId) {
  const el = document.getElementById('route-list');
  if (!el) return;

  let filtered = [...ROUTES].sort((a,b) => {
    const na=parseInt(a['번호'])||999, nb=parseInt(b['번호'])||999;
    return na-nb;
  });

  if (zoneId) {
    const zone = ZONES.find(z=>z.id===zoneId);
    if (zone) filtered = filtered.filter(r => getZoneId(r) === zoneId);
  }

  // 기점+종점+노선군 기준 그룹 미리 계산
  const groupMap = new Map();
  ROUTES.forEach(r => {
    const gk = r['기점'] + '||' + r['종점'] + '||' + (r['노선군']||'');
    if (!groupMap.has(gk)) groupMap.set(gk, []);
    groupMap.get(gk).push(r);
  });

  el.innerHTML = filtered.map(r => {
    const color  = getZoneColor(r);
    const num    = getBusNum(r);
    const ttKey  = r['번호'] + '_' + r['기점'];
    const tt     = TIMETABLE[ttKey];
    const ttDay  = getDayType();
    const cnt    = tt
      ? (tt[ttDay] || tt['weekday'] || []).length
      : (r[getCountKey(getDayType())] || 0);
    const isActive = STATE.selectedRoute?.['번호']===r['번호'] && STATE.selectedRoute?.['기점']===r['기점'];

    // 기점+종점+노선군 그룹 내 차이 경유지
    const gk = r['기점'] + '||' + r['종점'] + '||' + (r['노선군']||'');
    const grp  = groupMap.get(gk) || [r];
    const diff = getDiffVia(r, grp);
    const diffStr = diff.length ? `<span style="color:var(--text-3);font-size:10px">[${diff.join('→')}]</span>` : '';

    const rJson = JSON.stringify(r).replace(/"/g,'&quot;');
    return `<div class="route-list-item${isActive?' active':''}" id="rli-${r['번호']}-${r['기점'].replace(/\s/g,'')}">
      <span class="bus-pill" style="background:${color};font-size:10px;padding:2px 5px;cursor:pointer" onclick="selectRoute(${rJson})">${num}</span>
      <div class="rli-route" style="cursor:pointer" onclick="selectRoute(${rJson})">${r['기점']}${diffStr ? ' → ' + diffStr + ' → ' : ' → '}${r['종점']}</div>
      <div class="rli-count" style="cursor:pointer;color:var(--text-3);font-size:10px" onclick="showViaPopup(${rJson})">📍</div>
    </div>`;
  }).join('');
}

function selectRoute(route) {
  if (typeof route==='string') route=JSON.parse(route);

  // 진행 중인 tryShow 루프 취소
  if (STATE._tryShowTimer) { clearTimeout(STATE._tryShowTimer); STATE._tryShowTimer = null; }

  STATE.selectedRoute = route;

  // 목록 강조
  document.querySelectorAll('.route-list-item').forEach(el=>el.classList.remove('active'));
  document.getElementById(`rli-${route['번호']}-${route['기점'].replace(/\s/g,'')}`)?.classList.add('active');

  // 노선 목록에서 직접 선택하면 검색 정류장 마커 제거
  if (STATE.searchStopMarker) {
    STATE.searchStopMarker.setMap(null);
    STATE.searchStopMarker = null;
  }
  STATE.timetableSearchStop = null;

  // 지도에 노선 표시
  if (STATE.mapRoutes) {
    showRouteOnMap(route, null);
  } else {
    const tryShow = () => {
      if (STATE.mapRoutes) { STATE._tryShowTimer = null; showRouteOnMap(route, null); }
      else STATE._tryShowTimer = setTimeout(tryShow, 200);
    };
    tryShow();
  }
}

// ==================== 시외버스·기차 화면 ====================
const TAGO_KEY = '58b48b0d19a525cf18e98d85a1b68cc560700393a7ed41f7538cc0758386b039';

const TRAIN_STATIONS = {
  pangyoStation:   { name:'판교역', depId:'NAT081240', cols:[{ label:'상행 ↑', arrId:'NAT010032', arrName:'용산' },{ label:'하행 ↓', arrId:'NAT030879', arrName:'익산' }]},
  seocheonStation: { name:'서천역', depId:'NAT081343', cols:[{ label:'상행 ↑', arrId:'NAT010032', arrName:'용산' },{ label:'하행 ↓', arrId:'NAT030879', arrName:'익산' }]},
  janghangStation: { name:'장항역', depId:'NAT081318', cols:[{ label:'상행 ↑', arrId:'NAT010032', arrName:'용산' },{ label:'하행 ↓', arrId:'NAT030879', arrName:'익산' }]},
};

const TERMINAL_DATA = {
  seocheonTerminal: {
    name: '서천터미널',
    cols: [
      { dest:'서울', color:'#E24B4A', via:'홍성·장항 경유',
        times:['07:40','09:20','11:00','13:00','15:00','17:40','19:10'], arr:['09:40','11:20','13:00','15:00','17:00','19:40','21:10'] },
      { dest:'대전', color:'#185FA5', via:'부여·논산 경유',
        times:['07:05','08:35','10:25','12:15','13:55','15:45','17:25','19:15'], arr:['08:05','09:35','11:25','13:15','14:55','16:45','18:25','20:15'] },
      { dest:'세종', color:'#1D9E75', via:'부여·공주 경유',
        times:['08:15','12:50','16:35'], arr:['09:30','14:05','17:50'] },
      { dest:'천안', color:'#EF9F27', via:'홍성·예산 경유',
        times:['09:10','13:20','17:50'], arr:['10:40','14:50','19:20'] },
      { dest:'군산', color:'#7F77DD', via:'장항 경유',
        times:['07:25','08:25','09:25','10:25','11:25','12:25','13:25','14:25','15:25','16:25','17:25','18:25'], arr:['08:25','09:25','10:25','11:25','12:25','13:25','14:25','15:25','16:25','17:25','18:25','19:25'] },
      { dest:'익산', color:'#888', via:'군산 경유',
        times:['08:50','11:15','14:30','17:55'], arr:['10:20','12:45','16:00','19:25'] },
    ],
    bookUrl:'https://www.kobus.co.kr', bookLabel:'코버스 예약',
  },
  janghangTerminal: {
    name: '장항터미널',
    cols: [
      { dest:'서울', color:'#E24B4A', via:'서천·홍성 경유',
        times:['07:20','09:00','10:40','12:20','14:00','15:40','17:20','18:50'], arr:['09:20','11:00','12:40','14:20','16:00','17:40','19:20','20:50'] },
      { dest:'대전', color:'#185FA5', via:'서천·부여·논산 경유',
        times:['06:45','08:15','10:05','11:55','13:35','15:25','17:05','18:55'], arr:['07:55','09:25','11:15','13:05','14:45','16:35','18:15','20:05'] },
      { dest:'세종', color:'#1D9E75', via:'서천·부여·공주 경유',
        times:['08:35','13:10','16:55'], arr:['10:05','14:35','18:20'] },
      { dest:'천안', color:'#EF9F27', via:'서천·홍성·예산 경유',
        times:['09:30','13:40','18:10'], arr:['11:10','15:20','19:50'] },
      { dest:'군산', color:'#7F77DD', via:'직통',
        times:['07:45','08:45','09:45','10:45','11:45','12:45','13:45','14:45','15:45','16:45','17:45','18:45'], arr:['08:45','09:45','10:45','11:45','12:45','13:45','14:45','15:45','16:45','17:45','18:45','19:45'] },
      { dest:'익산', color:'#888', via:'서천·군산 경유',
        times:['09:10','11:35','14:50','18:15'], arr:['10:50','13:15','16:30','19:55'] },
    ],
    bookUrl:'https://www.kobus.co.kr', bookLabel:'코버스 예약',
  },
};

let _currentTransportTab = 'seocheonStation';
let _trainCache = {};

function initTransportScreen() {
  showTransportTab(_currentTransportTab);
}

function showTransportTab(tabId) {
  _currentTransportTab = tabId;
  document.querySelectorAll('.tr-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tr-tab-'+tabId);
  if (tab) {
    tab.classList.add('active');
    if (tabId.includes('Terminal')) tab.classList.add('terminal');
  }

  const body = document.getElementById('transport-body');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-3);font-size:13px">불러오는 중...</div>';

  if (TERMINAL_DATA[tabId]) {
    renderTerminalGrid(body, TERMINAL_DATA[tabId]);
  } else {
    const st = TRAIN_STATIONS[tabId];
    if (st) fetchAndRenderTrain(body, st);
  }
}

async function fetchAndRenderTrain(body, st) {
  const now   = new Date();
  const today = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const cKey  = st.depId+today;

  try {
    let colData;
    if (_trainCache[cKey]) {
      colData = _trainCache[cKey];
    } else {
      const results = await Promise.all(st.cols.map(col =>
        fetch(`https://apis.data.go.kr/1613000/TrainInfo/GetStrtpntAlocFndTrainInfo?serviceKey=${TAGO_KEY}&_type=json&numOfRows=100&depPlaceId=${st.depId}&arrPlaceId=${col.arrId}&depPlandTime=${today}`)
          .then(r=>r.json()).catch(()=>null)
      ));
      colData = st.cols.map((col,i) => {
        const items = results[i]?.response?.body?.items?.item||[];
        const arr   = Array.isArray(items)?items:[items];
        return arr.filter(t=>t.depplandtime).map(t=>({
          dep:    `${t.depplandtime.slice(8,10)}:${t.depplandtime.slice(10,12)}`,
          depMin: parseInt(t.depplandtime.slice(8,10))*60+parseInt(t.depplandtime.slice(10,12)),
          arr:    `${t.arrplandtime.slice(8,10)}:${t.arrplandtime.slice(10,12)}`,
          grade:  t.traingradename,
          no:     t.trainno,
          arrName:col.arrName+'역',
          stName: st.name,
          via:    col.label.includes('상')? '장항·천안·대전 경유':'천안·대전·장항 경유',
        })).filter(t=>t.depMin>=5*60).sort((a,b)=>a.depMin-b.depMin);
      });
      _trainCache[cKey] = colData;
    }
    renderTrainGrid(body, st.cols.map((col,i)=>({label:col.label,arrName:col.arrName,trains:colData[i]})), st.name);
  } catch(e) {
    body.innerHTML=`<div style="padding:20px;text-align:center;color:var(--text-3);font-size:13px">시간표를 불러오지 못했어요</div>`;
  }
}

function renderTrainGrid(body, cols, stName) {
  const nMin = nowMin();
  const colColors = ['#185FA5','#E24B4A'];

  // 다음 편 인덱스
  const nextIdxes = cols.map(col => col.trains.findIndex(t=>t.depMin>=nMin));

  let html = `<div class="timetable-wrap">
    <div class="tg-header">
      <div class="tg-head-row">
        <div class="tg-hour-col"></div>
        ${cols.map((col,ci)=>`<div class="tg-col-head" style="color:${colColors[ci]}">${col.label}<br><span style="font-weight:400;font-size:9px">${col.arrName}행</span></div>`).join('')}
      </div>
    </div>`;

  for (let h=5;h<=23;h++) {
    html+=`<div class="tg-row"><div class="tg-hour">${String(h).padStart(2,'0')}</div>`;
    cols.forEach((col,ci)=>{
      const trains=col.trains.filter(t=>Math.floor(t.depMin/60)===h);
      html+=`<div class="tg-cell">`;
      if (trains.length) {
        trains.forEach(t=>{
          const isPast = t.depMin<nMin;
          const isNext = col.trains[nextIdxes[ci]]===t;
          const data   = JSON.stringify(t).replace(/"/g,'&quot;');
          html+=`<button class="tg-btn${isPast?' past':isNext?' next-train':''}" style="color:${isPast?'#ccc':colColors[ci]}" onclick="showTransportDetail(${data})">${t.dep}</button>`;
        });
      }
      html+=`</div>`;
    });
    html+=`</div>`;
  }
  html+=`</div>
  <div style="padding:10px 12px">
    <button class="book-btn" style="background:var(--blue)" onclick="window.open('https://www.korail.com')">코레일 예약 바로가기</button>
  </div>
  <div style="padding:0 12px 14px;font-size:10px;color:var(--text-3)">코레일 API 실시간 · 출발 기준</div>`;

  body.innerHTML = html;
}

function renderTerminalGrid(body, data) {
  const nMin = nowMin();
  const { cols, bookUrl, bookLabel } = data;

  // 각 열의 시간 파싱
  const colTimes = cols.map(col=>col.times.map((t,i)=>({
    dep:t, depMin:timeToMin(t),
    arr:col.arr?.[i]||'', dest:col.dest, via:col.via
  })));
  const nextIdxes = colTimes.map(times=>times.findIndex(t=>t.depMin>=nMin));

  let html = `<div class="timetable-wrap">
    <div class="tg-header">
      <div class="tg-head-row">
        <div class="tg-hour-col"></div>
        ${cols.map(col=>`<div class="tg-col-head" style="color:${col.color}">${col.dest}</div>`).join('')}
      </div>
    </div>`;

  // 첫차~막차 시간대 계산
  const allMins = colTimes.flat().map(t=>t.depMin);
  const startH  = Math.floor(Math.min(...allMins)/60);
  const endH    = Math.floor(Math.max(...allMins)/60);

  for (let h=startH;h<=endH;h++) {
    html+=`<div class="tg-row"><div class="tg-hour">${String(h).padStart(2,'0')}</div>`;
    colTimes.forEach((times,ci)=>{
      const items=times.filter(t=>Math.floor(t.depMin/60)===h);
      html+=`<div class="tg-cell">`;
      if (items.length) {
        items.forEach(t=>{
          const isPast=t.depMin<nMin;
          const isNext=times[nextIdxes[ci]]===t;
          const data=JSON.stringify({dep:t.dep,arr:t.arr,dest:t.dest,via:t.via,grade:''}).replace(/"/g,'&quot;');
          html+=`<button class="tg-btn${isPast?' past':isNext?' next-train':''}" style="color:${isPast?'#ccc':cols[ci].color}" onclick="showTransportDetail(${data})">${t.dep}</button>`;
        });
      }
      html+=`</div>`;
    });
    html+=`</div>`;
  }
  html+=`</div>
  <div style="padding:10px 12px 4px;font-size:10px;color:var(--text-3);line-height:1.6">
    ⚠️ 실제 운행 시간표와 다를 수 있습니다. 이용 전 터미널에 직접 확인하세요.
  </div>
  <div style="padding:2px 12px 10px;font-size:10px;color:var(--text-3)">익산행은 군산 경유</div>
  <div style="padding:0 12px 14px">
    <button class="book-btn" style="background:var(--amber)" onclick="window.open('${bookUrl}')">${bookLabel} 바로가기</button>
  </div>`;

  body.innerHTML = html;
}

function showTransportDetail(t) {
  if (typeof t==='string') t=JSON.parse(t);
  const existing = document.getElementById('tr-popup');
  if (existing) existing.remove();
  const ov = document.getElementById('tr-popup-ov');
  if (ov) ov.remove();

  const gradeHtml = t.grade ? `<div class="popup-row"><span class="popup-key">등급</span><span class="popup-val">${t.grade}</span></div>` : '';
  const stHtml    = t.stName? `<div class="popup-row"><span class="popup-key">출발역</span><span class="popup-val">${t.stName}</span></div>` : '';

  const panel = document.createElement('div');
  panel.id = 'tr-popup';
  panel.className = 'popup-overlay';
  panel.innerHTML = `<div class="popup-box">
    <div class="popup-handle"></div>
    <div class="popup-times">
      <span class="popup-dep">${t.dep}</span>
      <span style="color:var(--text-3)">→</span>
      <span class="popup-arr">${t.arr||'?'}</span>
    </div>
    <div>
      ${gradeHtml}${stHtml}
      <div class="popup-row"><span class="popup-key">종점</span><span class="popup-val">${t.dest||t.arrName||''}</span></div>
      <div class="popup-row"><span class="popup-key">주요 경유</span><span class="popup-val">${t.via||'-'}</span></div>
    </div>
    <button class="popup-close-btn" onclick="document.getElementById('tr-popup').remove()">닫기</button>
  </div>`;
  panel.onclick = (e)=>{ if(e.target===panel) panel.remove(); };
  document.body.appendChild(panel);
}

// ==================== 즐겨찾기 ====================
function saveRouteHistory(from, to) {
  const key=`${from}→${to}`;
  const idx=STATE.routeHistory.findIndex(h=>h.key===key);
  if (idx>=0) { STATE.routeHistory[idx].count++; STATE.routeHistory[idx].lastTime=Date.now(); }
  else STATE.routeHistory.push({key,from,to,count:1,lastTime:Date.now()});
  STATE.routeHistory.sort((a,b)=>b.count-a.count);
  STATE.routeHistory=STATE.routeHistory.slice(0,20);
  localStorage.setItem('sc_route_history', JSON.stringify(STATE.routeHistory));
}

function renderFavorites() {
  const body = document.getElementById('favorites-body');
  if (!body) return;

  let html='<div class="fav-section">';
  html+=`<div class="fav-section-title">자주 이용한 경로</div>`;
  if (!STATE.routeHistory.length) {
    html+=`<div class="fav-empty">검색 이력이 없습니다<br><small>경로를 검색하면 자동으로 기록됩니다</small></div>`;
  } else {
    STATE.routeHistory.slice(0,3).forEach(h=>{
      html+=`<div class="fav-item" onclick="quickSearch('${h.from.replace(/'/g,"\\'")}','${h.to.replace(/'/g,"\\'")}')">
        <div class="fav-icon" style="background:var(--green-l)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 7h11M7 1.5l5.5 5.5-5.5 5.5" stroke="#0F6E56" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div class="fav-main">${h.from} → ${h.to}</div>
          <div class="fav-count">${h.count}회 이용</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="var(--text-3)" stroke-width="1.3" stroke-linecap="round"/></svg>
      </div>`;
    });
  }
  html+=`</div><div class="fav-divider"></div><div class="fav-section">`;
  html+=`<div class="fav-section-title">저장된 장소</div>`;
  if (!STATE.savedPlaces.length) {
    html+=`<div class="fav-empty">저장된 장소가 없습니다<br><small>홈 화면 도착지 검색 시 저장할 수 있어요</small></div>`;
  } else {
    STATE.savedPlaces.forEach((p,i)=>{
      html+=`<div class="fav-item">
        <div class="fav-icon" style="background:var(--blue-l)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1C4.8 1 3 2.8 3 5c0 3.2 4 8 4 8s4-4.8 4-8c0-2.2-1.8-4-4-4z" fill="#185FA5"/><circle cx="7" cy="5" r="1.5" fill="#fff"/></svg>
        </div>
        <div style="flex:1;min-width:0">
          <div class="fav-main">${p.label||p.name}</div>
          <div class="fav-sub">${p.name}</div>
        </div>
        <div class="fav-actions">
          <button class="fav-action-btn from" onclick="quickSearchFrom('${p.name.replace(/'/g,"\\'")}',${p.lat},${p.lng})">출발</button>
          <button class="fav-action-btn to"   onclick="quickSearchTo('${p.name.replace(/'/g,"\\'")}',${p.lat},${p.lng})">도착</button>
          <button class="fav-action-btn del"  onclick="deletePlace(${i})">✕</button>
        </div>
      </div>`;
    });
  }
  html+=`</div>`;
  body.innerHTML=html;
}

function deletePlace(idx) {
  STATE.savedPlaces.splice(idx,1);
  localStorage.setItem('sc_places', JSON.stringify(STATE.savedPlaces));
  renderFavorites();
}

function quickSearch(from, to) {
  const frStop=STOPS.find(s=>s.name===from)||STOPS.find(s=>s.name.includes(from.substring(0,4)));
  const toStop=STOPS.find(s=>s.name===to)||STOPS.find(s=>s.name.includes(to.substring(0,4)));
  if (from==='현위치') STATE.search.from={name:'현위치',lat:STATE.myLocation.lat,lng:STATE.myLocation.lng,isGps:true};
  else STATE.search.from=frStop?{name:from,lat:frStop.lat,lng:frStop.lng}:{name:from,lat:STATE.myLocation.lat,lng:STATE.myLocation.lng};
  STATE.search.to=toStop?{name:to,lat:toStop.lat,lng:toStop.lng}:{name:to,lat:STATE.myLocation.lat,lng:STATE.myLocation.lng};
  showScreen('home');
  renderHomeSheet();
  setTimeout(doSearch, 300);
}

function quickSearchFrom(name,lat,lng) {
  STATE.search.from={name,lat:parseFloat(lat),lng:parseFloat(lng)};
  renderHomeSheet(); showScreen('home');
}

function quickSearchTo(name,lat,lng) {
  STATE.search.to={name,lat:parseFloat(lat),lng:parseFloat(lng)};
  renderHomeSheet(); showScreen('home');
}

// ==================== 앱 설정 모달 ====================
function openSettingsModal() {
  document.getElementById('settings-rest-key').value = localStorage.getItem('sc_kakao_rest_key') || '';
  document.getElementById('settings-msg').style.display = 'none';
  document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
  document.getElementById('settings-modal').style.display = 'none';
}

function saveSettings() {
  const restKey = document.getElementById('settings-rest-key').value.trim();
  if (restKey) {
    localStorage.setItem('sc_kakao_rest_key', restKey);
    window._kakaoRestKey = restKey;
  }
  const msg = document.getElementById('settings-msg');
  msg.textContent = '✅ 저장되었습니다.';
  msg.style.display = 'block';
  setTimeout(closeSettingsModal, 1000);
}
