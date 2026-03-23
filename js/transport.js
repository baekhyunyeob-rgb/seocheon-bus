const TAGO_API_KEY = '58b48b0d19a525cf18e98d85a1b68cc560700393a7ed41f7538cc0758386b039';

// 기차역 설정
const TRAIN_STATIONS = {
  pangyoStation:   { name:'판교역(충남)', depId:'NAT081240', cols:[
    { label:'상행↑', arrId:'NAT010032', arrName:'용산' },
    { label:'하행↓', arrId:'NAT030879', arrName:'익산' }
  ]},
  seocheonStation: { name:'서천역', depId:'NAT081343', cols:[
    { label:'상행↑', arrId:'NAT010032', arrName:'용산' },
    { label:'하행↓', arrId:'NAT030879', arrName:'익산' }
  ]},
  janghangStation: { name:'장항역', depId:'NAT081318', cols:[
    { label:'상행↑', arrId:'NAT010032', arrName:'용산' },
    { label:'하행↓', arrId:'NAT030879', arrName:'익산' }
  ]},
};

// 터미널 시간표 데이터
const SEOCHEON_TERMINAL_DATA = [
  { dest:'서울', via:'직통',           times:['07:40','09:20','11:00','12:40','14:20','16:00','17:40','19:10'], grade:'시외' },
  { dest:'대전', via:'부여·논산 경유', times:['07:05','08:35','10:25','12:15','13:55','15:45','17:25','19:15'], grade:'시외' },
  { dest:'세종', via:'부여·공주 경유', times:['08:15','12:50','16:35'], grade:'시외' },
  { dest:'천안', via:'홍성·예산 경유', times:['09:10','13:20','17:50'], grade:'시외' },
  { dest:'군산', via:'장항 경유',      times:['07:25','08:25','09:25','10:25','11:25','12:25','13:25','14:25','15:25','16:25','17:25','18:25'], grade:'시외' },
  { dest:'익산', via:'군산 경유',      times:['08:50','11:15','14:30','17:55'], grade:'시외' },
];

const JANGHANG_TERMINAL_DATA = [
  { dest:'서울', via:'서천 경유',           times:['07:20','09:00','10:40','12:20','14:00','15:40','17:20','18:50'], grade:'시외' },
  { dest:'대전', via:'서천 경유',           times:['06:45','08:15','10:05','11:55','13:35','15:25','17:05','18:55'], grade:'시외' },
  { dest:'세종', via:'서천·부여·공주 경유', times:['08:35','13:10','16:55'], grade:'시외' },
  { dest:'천안', via:'서천·홍성·예산 경유', times:['09:30','13:40','18:10'], grade:'시외' },
  { dest:'군산', via:'직통',                times:['07:45','08:45','09:45','10:45','11:45','12:45','13:45','14:45','15:45','16:45','17:45','18:45'], grade:'시외' },
  { dest:'익산', via:'서천·군산 경유',      times:['09:10','11:35','14:50','18:15'], grade:'시외' },
];

// 예약 링크
const BOOKING_LINKS = {
  train:    { name:'코레일 예약', url:'https://www.korail.com' },
  terminal: { name:'코버스 예약', url:'https://www.kobus.co.kr' },
};

let currentTransportTab = 'seocheonStation';
let _trainCache = {}; // API 결과 캐시

function initTransport() {
  showTransportTab('seocheonStation');
}

function showTransportTab(tabId) {
  currentTransportTab = tabId;
  document.querySelectorAll('.tr-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('tr-tab-' + tabId);
  if (tab) tab.classList.add('active');

  const body = document.getElementById('transport-body');
  const sub  = document.getElementById('transport-sub');
  body.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;font-size:13px">불러오는 중...</div>';

  if (tabId === 'seocheonTerminal') {
    if (sub) sub.textContent = '서천터미널 시외버스';
    renderGridTimetable(body, SEOCHEON_TERMINAL_DATA, 'terminal', '서천터미널');
  } else if (tabId === 'janghangTerminal') {
    if (sub) sub.textContent = '장항터미널 시외버스';
    renderGridTimetable(body, JANGHANG_TERMINAL_DATA, 'terminal', '장항터미널');
  } else {
    const st = TRAIN_STATIONS[tabId];
    if (sub) sub.textContent = `${st.name} · 장항선`;
    fetchAndRenderTrain(body, st);
  }
}

// ── 기차 API 호출 후 격자 렌더링 ──
async function fetchAndRenderTrain(body, st) {
  const now   = new Date();
  const today = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const cacheKey = st.depId + today;

  try {
    let colData;
    if (_trainCache[cacheKey]) {
      colData = _trainCache[cacheKey];
    } else {
      const results = await Promise.all(st.cols.map(col =>
        fetch(`https://apis.data.go.kr/1613000/TrainInfo/GetStrtpntAlocFndTrainInfo?serviceKey=${TAGO_API_KEY}&_type=json&numOfRows=100&depPlaceId=${st.depId}&arrPlaceId=${col.arrId}&depPlandTime=${today}`)
          .then(r => r.json())
      ));
      colData = st.cols.map((col, i) => {
        const items = results[i]?.response?.body?.items?.item || [];
        const arr = Array.isArray(items) ? items : [items];
        return arr.map(t => ({
          dep:   `${t.depplandtime.slice(8,10)}:${t.depplandtime.slice(10,12)}`,
          depMin: parseInt(t.depplandtime.slice(8,10))*60 + parseInt(t.depplandtime.slice(10,12)),
          arr:   `${t.arrplandtime.slice(8,10)}:${t.arrplandtime.slice(10,12)}`,
          grade: t.traingradename,
          no:    t.trainno,
          arrName: col.arrName + '역',
          label: col.label,
          stName: st.name
        })).filter(t => t.depMin >= 5*60).sort((a,b) => a.depMin - b.depMin);
      });
      _trainCache[cacheKey] = colData;
    }

    // 격자 데이터 구성 (col당 배열)
    const cols = st.cols.map((col, i) => ({
      label: col.label,
      arrName: col.arrName,
      trains: colData[i]
    }));

    renderTrainGrid(body, cols, st.name);

  } catch(e) {
    body.innerHTML = `<div style="padding:20px;text-align:center;color:#aaa;font-size:13px">
      시간표를 불러오지 못했어요<br><small>${e.message}</small>
    </div>`;
  }
}

// ── 기차 격자 렌더링 ──
function renderTrainGrid(body, cols, stName) {
  const now    = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();
  const colColor = ['#185FA5','#E24B4A'];

  // 헤더
  let html = `
  <div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1.5px solid #eee">
    <div style="display:flex">
      <div style="width:32px;flex-shrink:0"></div>
      ${cols.map((col,i) => `
        <div style="flex:1;padding:7px 4px;text-align:center;color:${colColor[i]};font-size:12px;font-weight:700">
          ${col.label} <span style="font-weight:400;font-size:10px">${col.arrName}행</span>
        </div>`).join('')}
    </div>
  </div>`;

  // 05~23시 고정 행
  for (let h = 5; h <= 23; h++) {
    html += `<div style="display:flex;border-bottom:.5px solid #f0f0f0;min-height:36px;align-items:stretch">`;
    html += `<div style="width:32px;flex-shrink:0;text-align:center;font-size:11px;font-weight:700;color:#bbb;display:flex;align-items:center;justify-content:center">${String(h).padStart(2,'0')}</div>`;

    cols.forEach((col, ci) => {
      // 이 시간대(h) 열차 모두
      const trains = col.trains.filter(t => Math.floor(t.depMin/60) === h);
      const nowNextIdx = col.trains.findIndex(tr => tr.depMin >= nowMin);

      html += `<div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;padding:3px 4px;align-items:center;justify-content:center">`;
      trains.forEach(t => {
        const isPast = t.depMin < nowMin;
        const isNext = col.trains[nowNextIdx] === t;
        const bg = isNext ? '#FFF8E1' : '';
        const tc = isPast ? '#ccc' : colColor[ci];
        html += `<div onclick="showTrainDetail(${JSON.stringify(t).replace(/"/g,'&quot;')})"
          style="flex:0 0 auto;padding:3px 4px;cursor:pointer;background:${bg};border-radius:5px;text-align:center">
          <div style="font-size:12px;font-weight:700;color:${tc};${isPast?'text-decoration:line-through':''}">${t.dep}</div>
          <div style="font-size:9px;color:#aaa">${t.grade.replace('호','')}</div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  }

  html += `<div style="padding:12px 14px;border-top:1px solid #eee">
    <a href="${BOOKING_LINKS.train.url}" target="_blank"
      style="display:block;background:#185FA5;color:#fff;border-radius:10px;padding:10px;text-align:center;font-size:13px;font-weight:700;text-decoration:none">
      🚆 코레일 예약
    </a>
  </div>
  <div style="padding:0 14px 16px;font-size:10px;color:#ccc">코레일 API 실시간 데이터 · 출발 기준</div>`;

  body.innerHTML = html;
}

// ── 기차 세부 팝업 ──
function showTrainDetail(t) {
  if (typeof t === 'string') t = JSON.parse(t);
  const existing = document.getElementById('tr-detail-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'tr-detail-panel';
  panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.15);z-index:999;padding:16px';
  panel.innerHTML = `
    <div style="width:32px;height:3px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div>
        <span style="background:#185FA5;color:#fff;border-radius:6px;padding:3px 10px;font-weight:700;font-size:14px">${t.grade}</span>
        <span style="margin-left:8px;font-size:13px;color:#555">열차 ${t.no}</span>
      </div>
      <button onclick="document.getElementById('tr-detail-panel').remove()"
        style="background:none;border:none;font-size:18px;color:#aaa;cursor:pointer">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;color:#aaa">출발</div>
        <div style="font-size:22px;font-weight:800;color:#185FA5">${t.dep}</div>
        <div style="font-size:12px;color:#555">${t.stName || '해당역'}</div>
      </div>
      <div style="font-size:20px;color:#ddd">→</div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#aaa">도착(예정)</div>
        <div style="font-size:22px;font-weight:800;color:#E24B4A">${t.arr}</div>
        <div style="font-size:12px;color:#555">${t.arrName}</div>
      </div>
    </div>
    <div style="background:#f8f8f8;border-radius:10px;padding:10px 14px;font-size:12px;color:#666">
      장항선 · ${t.label?.includes('상') ? '대천 → 홍성 → 천안 경유' : '천안 → 홍성 → 대천 경유'}
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.2);z-index:998';
  overlay.onclick = () => { panel.remove(); overlay.remove(); };
  overlay.id = 'tr-detail-overlay';

  document.body.appendChild(overlay);
  document.body.appendChild(panel);
}

// ── 버스 터미널 격자 렌더링 ──
function renderGridTimetable(body, data, type, terminalName) {
  const now    = new Date();
  const nowMin = now.getHours()*60 + now.getMinutes();

  const cols = data.filter(d => d.times.length > 0);
  const colColors = ['#EF9F27','#1D9E75','#7F77DD','#185FA5','#E24B4A','#3B6D11'];

  // 각 열의 시간을 분으로 변환
  const colTimes = cols.map(col => col.times.map(t => {
    const [th,tm] = t.split(':').map(Number);
    return { dep: t, depMin: th*60+tm, dest: col.dest, via: col.via, grade: col.grade };
  }));

  // 헤더
  let html = `
  <div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1.5px solid #eee">
    <div style="display:flex">
      <div style="width:32px;flex-shrink:0"></div>
      ${cols.map((col,i) => `
        <div style="flex:1;padding:6px 2px;text-align:center;color:${colColors[i%colColors.length]};font-size:11px;font-weight:700">
          ${col.dest}
        </div>`).join('')}
    </div>
  </div>`;

  // 06~19시 고정 행 (터미널 운영 시간대)
  for (let h = 6; h <= 19; h++) {
    html += `<div style="display:flex;border-bottom:.5px solid #f0f0f0;min-height:36px;align-items:stretch">`;
    html += `<div style="width:32px;flex-shrink:0;text-align:center;font-size:11px;font-weight:700;color:#bbb;display:flex;align-items:center;justify-content:center">${String(h).padStart(2,'0')}</div>`;

    colTimes.forEach((times, ci) => {
      const items = times.filter(t => Math.floor(t.depMin/60) === h);
      const nextMin = times.find(t => t.depMin >= nowMin)?.depMin;

      html += `<div style="flex:1;display:flex;flex-wrap:wrap;gap:3px;padding:3px 4px;align-items:center;justify-content:center">`;
      items.forEach(t => {
        const isPast = t.depMin < nowMin;
        const isNext = t.depMin === nextMin;
        const bg = isNext ? '#FFF8E1' : '';
        const tc = isPast ? '#ccc' : isNext ? '#E24B4A' : colColors[ci%colColors.length];
        html += `<div onclick="showBusDetail(${JSON.stringify(t).replace(/"/g,'&quot;')})"
          style="flex:1;min-width:40px;padding:3px 1px;cursor:pointer;background:${bg};border-radius:5px;text-align:center">
          <div style="font-size:12px;font-weight:700;color:${tc};${isPast?'text-decoration:line-through':''}">${t.dep}</div>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;
  }

  html += `<div style="padding:10px 14px;font-size:10px;color:#aaa;border-top:.5px solid #eee;line-height:1.8">
    익산행은 군산을 경유합니다<br>
    <span style="color:#ccc">※ 실제 시간표와 다를 수 있습니다</span>
  </div>
  <div style="padding:0 14px 14px">
    <a href="${BOOKING_LINKS.terminal.url}" target="_blank"
      style="display:block;background:#EF9F27;color:#fff;border-radius:10px;padding:10px;text-align:center;font-size:13px;font-weight:700;text-decoration:none">
      🚌 코버스 시외버스 예약
    </a>
  </div>`;

  body.innerHTML = html;
}

// ── 버스 세부 팝업 ──
function showBusDetail(t) {
  if (typeof t === 'string') t = JSON.parse(t);
  const existing = document.getElementById('tr-detail-panel');
  if (existing) existing.remove();
  const ex2 = document.getElementById('tr-detail-overlay');
  if (ex2) ex2.remove();

  const panel = document.createElement('div');
  panel.id = 'tr-detail-panel';
  panel.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.15);z-index:999;padding:16px';
  panel.innerHTML = `
    <div style="width:32px;height:3px;background:#e0e0e0;border-radius:2px;margin:0 auto 14px"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <span style="background:#EF9F27;color:#fff;border-radius:6px;padding:3px 10px;font-weight:700;font-size:14px">시외버스</span>
      <button onclick="document.getElementById('tr-detail-panel').remove();document.getElementById('tr-detail-overlay').remove()"
        style="background:none;border:none;font-size:18px;color:#aaa;cursor:pointer">✕</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px;margin-bottom:14px">
      <div>
        <div style="font-size:11px;color:#aaa">출발</div>
        <div style="font-size:24px;font-weight:800;color:#EF9F27">${t.dep}</div>
      </div>
      <div style="font-size:20px;color:#ddd">→</div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#aaa">목적지</div>
        <div style="font-size:24px;font-weight:800;color:#E24B4A">${t.dest}</div>
      </div>
    </div>
    <div style="background:#f8f8f8;border-radius:10px;padding:10px 14px;font-size:12px;color:#666">
      ${t.via || '직통'}
    </div>
  `;

  const overlay = document.createElement('div');
  overlay.id = 'tr-detail-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.2);z-index:998';
  overlay.onclick = () => { panel.remove(); overlay.remove(); };

  const ov2 = document.createElement('div');
  ov2.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.2);z-index:998';
  ov2.onclick = () => { panel.remove(); ov2.remove(); };
  ov2.id = 'tr-detail-overlay';
  document.body.appendChild(ov2);
  document.body.appendChild(panel);
}
