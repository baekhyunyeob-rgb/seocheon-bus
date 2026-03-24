'use strict';

// ==================== 버스노선도 화면 ====================

function initRoutesScreen() {
  renderZoneLegend();
  renderRouteList(null);
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

function renderRouteList(zoneId) {
  const el = document.getElementById('route-list');
  if (!el) return;

  let filtered = [...ROUTES].sort((a,b) => {
    const na=parseInt(a['번호'])||999, nb=parseInt(b['번호'])||999;
    return na-nb;
  });

  if (zoneId) {
    const zone = ZONES.find(z=>z.id===zoneId);
    if (zone) filtered = filtered.filter(r => zone.test(r));
  }

  el.innerHTML = filtered.map(r => {
    const color = getZoneColor(r);
    const num   = getBusNum(r);
    const via   = [r['기점'], ...r['경유'].split('→').filter(Boolean).slice(0,2), r['종점']].join('→');
    const ck    = getCountKey(getDayType());
    const cnt   = r[ck]||0;
    const isActive = STATE.selectedRoute?.['번호']===r['번호'] && STATE.selectedRoute?.['기점']===r['기점'];
    return `<div class="route-list-item${isActive?' active':''}" id="rli-${r['번호']}-${r['기점'].replace(/\s/g,'')}" onclick="selectRoute(${JSON.stringify(r).replace(/"/g,'&quot;')})">
      <span class="bus-pill" style="background:${color};font-size:10px;padding:2px 5px">${num}</span>
      <div class="rli-route">${via}</div>
      <div class="rli-count">${cnt}회</div>
    </div>`;
  }).join('');
}

function selectRoute(route) {
  if (typeof route==='string') route=JSON.parse(route);
  STATE.selectedRoute = route;

  document.querySelectorAll('.route-list-item').forEach(el=>el.classList.remove('active'));
  document.getElementById(`rli-${route['번호']}-${route['기점'].replace(/\s/g,'')}`)?.classList.add('active');

  const tryShow = () => {
    if (STATE.mapRoutes) showRouteOnMap(route);
    else setTimeout(tryShow, 200);
  };
  tryShow();
}
