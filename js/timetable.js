'use strict';

// ==================== 버스시간표 화면 ====================

// 시간표에서 주요경유 표시에 사용할 허브 목록
// 종점은 포함하지 않고 중간 경유 허브만 나열 (많을수록 좋음)
const TT_HUBS = [
  '서천터미널','장항터미널','한산공용터미널','서천역','장항역','판교역',
  '판교','기산','문산','화양','비인','마서','종천','장항읍내',
  '시초','한산','서면','동백','마량','홍원','신산','비인터미널',
  '춘장대','서울','대전','군산','홍성','보령','부여','논산',
];

function onStopSearchInput(val) {
  const resEl = document.getElementById('stop-search-results');
  if (!val.trim()) { resEl.style.display='none'; return; }
  const matches = STOPS.filter(s=>s.name.includes(val.trim()))
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

function renderStopTimetable(stopName, displayName, lat, lng) {
  const dayType = getDayType();
  const nMin    = nowMin();

  const rows = [];
  ROUTES.forEach(route => {
    const coords = getRouteCoords(route);
    if (!coords.length) return;

    let idx = findIdxByName(coords, stopName);
    if (idx === -1) idx = findIdxByCoord(coords, lat, lng, 300);
    if (idx === -1) return;

    const ck    = getCountKey(dayType);
    const count = route[ck]||0;
    if (!count||!route['첫차']||!route['막차']) return;

    // 기점에서 이 정류장까지 소요시간 추정
    const fc = coords[0], sc = coords[idx];
    const leg0 = (fc?.lat && sc?.lat)
      ? Math.round(distM(fc.lat, fc.lng, sc.lat, sc.lng) / 1000 * 2.5)
      : Math.round((route['거리']||10) * 2.5 * idx / Math.max(coords.length-1,1));

    // ── 주요경유 수집 (종점 제외, 허브 최대 4개) ──
    // 1차: coords 순서대로 허브 이름과 일치하는 정류장
    const afterHubs = [];
    const terminus = route['종점'];
    for (let i = idx+1; i < coords.length && afterHubs.length < 4; i++) {
      const cName = coords[i].name || '';
      // 종점과 동일하거나 포함하는 정류장은 제외
      if (cName === terminus || terminus.includes(cName) || cName.includes(terminus)) continue;
      const matched = TT_HUBS.find(h => cName.includes(h) || h.includes(cName.substring(0,3)));
      if (matched && !afterHubs.includes(matched)) afterHubs.push(matched);
    }
    // 2차: coords에 허브가 없을 경우 경유 필드 파싱으로 보완
    if (afterHubs.length === 0 && route['경유']) {
      const viaTokens = route['경유'].split(/[→·,]/).map(s=>s.trim()).filter(Boolean);
      for (const tok of viaTokens) {
        if (afterHubs.length >= 4) break;
        if (tok === terminus || terminus.includes(tok)) continue;
        const matched = TT_HUBS.find(h => tok.includes(h) || h.includes(tok.substring(0,3)));
        if (matched && !afterHubs.includes(matched)) afterHubs.push(matched);
      }
    }

    const color  = getZoneColor(route);
    const busNum = getBusNum(route);
    const fMin   = timeToMin(route['첫차']), lMin = timeToMin(route['막차']);
    const interval = count > 1 ? Math.round((lMin-fMin)/(count-1)) : 0;

    for (let i = 0; i < count; i++) {
      const depMin  = fMin + interval * i;
      const passMin = depMin + leg0;
      rows.push({
        passMin, isPast: passMin < nMin, color, busNum,
        via: afterHubs.join('→'),
        remark: '',
      });
    }
  });

  rows.sort((a,b)=>a.passMin-b.passMin);
  if (!rows.length) {
    document.getElementById('timetable-body').innerHTML=`<div style="text-align:center;padding:40px;color:var(--text-3);font-size:13px">이 정류장을 지나는 버스가 없습니다</div>`;
    return;
  }

  const routeCount = new Set(rows.map(r=>r.busNum)).size;
  const nextIdx    = rows.findIndex(r=>!r.isPast);

  // ── 헤더 레이아웃: 시간(15%) 번호(18%) 주요경유(67%) ──
  let html=`<div class="tt-stop-info">
    <div>
      <span class="tt-stop-name">📍 ${displayName}</span>
    </div>
    <span class="tt-stop-meta">${routeCount}개 노선 · ${rows.length}대</span>
  </div>
  <div class="tt-grid-header">
    <div class="tt-col-time">시간</div>
    <div class="tt-col-num">번호</div>
    <div class="tt-col-via">주요경유</div>
  </div>`;

  rows.forEach((r,i) => {
    const isNext = i===nextIdx;
    html+=`<div class="tt-row${r.isPast?' past':isNext?' next-bus':''}">
      <div class="tt-col-time tt-time${r.isPast?' past':isNext?' next':''}">${minToTime(r.passMin)}</div>
      <div class="tt-col-num"><span class="bus-pill" style="background:${r.color};font-size:10px;padding:1px 5px">${r.busNum}</span></div>
      <div class="tt-col-via tt-route">${r.via||'—'}</div>
    </div>`;
  });

  document.getElementById('timetable-body').innerHTML=html;
}
