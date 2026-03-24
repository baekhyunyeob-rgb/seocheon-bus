'use strict';

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
