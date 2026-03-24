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
    container.innerHTML = `<div class="modal-section-label">"${data[0].place_name}" 인근 정류장</div>`;
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
