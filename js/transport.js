'use strict';

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
