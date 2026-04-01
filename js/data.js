'use strict';

// ==================== 상수 ====================
// 카카오맵 JS 키 (지도 표시용 — index.html의 SDK 로드에도 동일하게 사용)
const KAKAO_JS_KEY   = 'ea4bdbbdf5c627aba4db0a4b163c9b0d';
const KAKAO_REST_KEY = 'a0aa52b4b6223f8d5f132191663cac66';

const SEOCHEON_BOUNDS = { minLat:35.97, maxLat:36.22, minLng:126.49, maxLng:126.89 };

const ZONES = [
  { id:'dongbaek', name:'동백·비인선', color:'#1A5DAB' },
  { id:'janghang', name:'장항·군산선', color:'#41AEDF' },
  { id:'jongpan',  name:'종천·판교선', color:'#D63B3B' },
  { id:'munsan',   name:'문산선',      color:'#8B5A2B' },
  { id:'hanyang',  name:'한산·화양선', color:'#2E8B57' },
  { id:'outer',    name:'서천 외',     color:'#aaa'    },
];

// ── 노선군 → 권역 직접 매핑 테이블 ──────────────────────────────────
// 서천군 공식 노선색 기준으로 분류
const ZONE_BY_GUNNAME = {
  // 동백·비인선 (청색)
  '1~4번 동백선':                         'dongbaek',
  '100번대 장항.동백선':                  'dongbaek',
  '80번대 당정.다사리선':                 'dongbaek',
  '90번대 울리.비인선':                   'dongbaek',
  '800번대 종천.비인.서면권역 지선':      'dongbaek',
  // 장항·군산선 (하늘색)
  '10번 하구둑.군산선':                   'janghang',
  '20번대 장항선':                        'janghang',
  '20번대 장항선(옥산)':                  'janghang',
  '200번대 산내.장상선':                  'janghang',
  '600번대 마서.장항권역 지선(관광선)':   'janghang',
  '700번대 마서권역 지선(갈목선)':        'janghang',
  // 종천·판교선 (적색)
  '11~14번 북산선':                       'jongpan',
  '40번대 판교선':                        'jongpan',
  '500번대 종천.판교권역 지선':           'jongpan',
  // 문산선 (고동색)
  '50번대 문산선':                        'munsan',
  '70번대 봉선리선':                      'munsan',
  // 한산·화양선 (녹색)
  '30번대 한산선':                        'hanyang',
  '300번대 한산지선':                     'hanyang',
  '300번대 한산지선(마서)':               'hanyang',
  '400번대 기산.마산.한산권역 지선':      'hanyang',
  '60번대 화양선':                        'hanyang',
  // 타시도 — 색은 회색 유지, 권역 탭 시 함께 표시
  '타시도 보령시':                        'dongbaek',  // 동백·비인선과 함께
  '타시도 군산시':                        'janghang',  // 장항·군산선과 함께
  '타시도 부여군':                        'hanyang',   // 한산·화양선과 함께
};

// 권역 ID 반환 — 노선군 직접 조회 → 없으면 janghang 기본값
function getZoneId(route) {
  const gun = route['노선군'] || '';
  return ZONE_BY_GUNNAME[gun] ?? 'janghang';
}

// 권역 색상 반환 — 타시도 노선은 항상 회색
function getZoneColor(route) {
  const gun = route['노선군'] || '';
  if (gun.startsWith('타시도')) return '#aaa';
  const id = getZoneId(route);
  return ZONES.find(z => z.id === id)?.color ?? ZONES[0].color;
}

// 버스번호 표시 (타시도면 지역명 표기)
function getBusNum(route) {
  const g = route['노선군'] || '';
  if (g.includes('타시도')) {
    const m = g.match(/타시도\s+(.+?)(?:시|군)?(?:\s|$)/);
    const region = m ? m[1].replace(/[시군]$/, '') : '타지역';
    return `${route['번호']}(${region})`;
  }
  return `${route['번호']}번`;
}

// ==================== 전역 상태 ====================
const STATE = {
  // 지도 인스턴스
  mapHome: null, mapDetail: null, mapRoutes: null,
  // 화면
  currentScreen: 'home',
  // 검색
  search: { from: null, to: null, via: null, timeMode: 'now', customTime: null },
  searchResults: [],
  detailResult: null,
  // 위치
  myLocation: { lat: 36.0758, lng: 126.6908 },
  gpsReady: false,
  myMarker: null,
  // 노선 좌표 캐시
  routeCoords: new Map(),
  roadPolylineCache: new Map(),  // 도로 polyline lazy 캐시
  // 지도 마커 캐시
  homeFromMarker: null, homeToMarker: null,
  routePolyline: null, routeMarkers: [],
  detailPolyline: null, detailPolyline2: null, detailMarkers: [],
  // 노선도
  selectedZone: null,
  selectedRoute: null,
  // 즐겨찾기
  savedPlaces: JSON.parse(localStorage.getItem('sc_places') || '[]'),
  routeHistory: JSON.parse(localStorage.getItem('sc_route_history') || '[]'),
};

// ==================== 데이터 ====================
let ROUTES    = [];
let STOPS     = [];
let TIMETABLE = {};  // { "번호_기점": { stops, weekday, sat?, hol? } }

async function loadData() {
  try {
    const [rRes, sRes, ttRes] = await Promise.all([
      fetch('data/routes.json'),
      fetch('data/stops.json'),
      fetch('data/timetable.json?v=1', { cache: 'no-cache' }),
    ]);

    if (!rRes.ok || !sRes.ok) throw new Error('데이터 파일 응답 오류');

    ROUTES    = await rRes.json();
    STOPS     = buildDisplayNames(await sRes.json());
    TIMETABLE = ttRes.ok ? await ttRes.json() : {};
    console.log('시간표 로드 완료: ' + Object.keys(TIMETABLE).length + '개 노선');
  } catch(e) {
    console.warn('데이터 로드 실패', e);
    // 사용자에게 오류 안내 표시
    const app = document.getElementById('app');
    if (app) {
      const banner = document.createElement('div');
      banner.id = 'data-error-banner';
      banner.style.cssText = [
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
        'background:#FCEBEB', 'color:#A32D2D',
        'font-size:13px', 'text-align:center',
        'padding:10px 16px', 'line-height:1.5',
      ].join(';');
      banner.innerHTML = '⚠️ 데이터를 불러오지 못했습니다. 네트워크 연결을 확인하거나 새로고침해 주세요.';
      document.body.prepend(banner);
    }
  }
}

// 동일 이름 정류장에 방향 구분 표시 이름 추가
function buildDisplayNames(stops) {
  const CENTERS = {
    '서천읍':[36.0758,126.6908], '장항읍':[36.0197,126.6996],
    '한산면':[36.1132,126.7803], '판교면':[36.1489,126.8303],
    '마서면':[36.0631,126.7074], '비인면':[36.0170,126.5923],
    '서면':  [36.0380,126.5761], '종천면':[36.0897,126.6433],
    '기산면':[36.1053,126.7442], '문산면':[36.0542,126.8108],
    '화양면':[36.0925,126.8492], '시초면':[36.1308,126.7197],
  };
  const SEOCHEON = [36.0758,126.6908];
  const d2=(a,b)=>Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2);
  const nearestRegion=(lat,lng)=>{
    let best='서천읍',bestD=999;
    for(const[name,c] of Object.entries(CENTERS)){
      const d=d2([lat,lng],c); if(d<bestD){bestD=d;best=name;}
    }
    return best;
  };
  const groups={};
  stops.forEach((s,i)=>{
    if(!groups[s.name]) groups[s.name]=[];
    groups[s.name].push(i);
  });
  const result=stops.map(s=>({...s}));
  for(const[name,idxs] of Object.entries(groups)){
    if(idxs.length<2) continue;
    const regions=idxs.map(i=>nearestRegion(stops[i].lat,stops[i].lng));
    if(new Set(regions).size>1){
      idxs.forEach((idx,j)=>{ result[idx].displayName=`${name}(${regions[j]})`; });
    } else {
      const dists=idxs.map(i=>d2([stops[i].lat,stops[i].lng],SEOCHEON));
      const sorted=[...idxs].sort((a,b)=>dists[idxs.indexOf(a)]-dists[idxs.indexOf(b)]);
      result[sorted[0]].displayName=`${name}(서천읍 방향)`;
      result[sorted[1]].displayName=name;
      for(let k=2;k<sorted.length;k++) result[sorted[k]].displayName=`${name}(${k+1})`;
    }
  }
  return result;
}

// ==================== 유틸리티 ====================
function distM(lat1,lng1,lat2,lng2){
  const cosLat=Math.cos((lat1+lat2)/2*Math.PI/180); return Math.sqrt((lat1-lat2)**2+((lng1-lng2)*cosLat)**2)*111000;
}

function timeToMin(t){
  const [h,m]=t.split(':').map(Number); return h*60+m;
}

function minToTime(m){
  const hh=String(Math.floor((m/60)%24)).padStart(2,'0');
  const mm=String(m%60).padStart(2,'0');
  return `${hh}:${mm}`;
}

function nowMin(){
  const n=new Date(); return n.getHours()*60+n.getMinutes();
}

function getDayType(){
  const d=new Date().getDay();
  return d===0?'hol':d===6?'sat':'weekday';
}

function getCountKey(dayType){
  return dayType==='weekday'?'평일횟수':dayType==='sat'?'토요일횟수':'공휴일횟수';
}

// 노선 시간 배열 생성 (timetable.json 우선, 없으면 균등분할 fallback)
function getRouteTimes(route, dayType) {
  const key = route['번호'] + '_' + route['기점'];
  const tt  = TIMETABLE[key];
  if (tt) {
    // timetable.json: times 배열의 첫 번째 열(기점 출발시각)을 분으로 변환
    const times = (tt[dayType] || tt['weekday'] || [])
      .map(row => {
        const t = Array.isArray(row) ? row[0] : row;
        return (t && typeof t === 'string' && t.includes(':')) ? timeToMin(t) : null;
      })
      .filter(t => t !== null);
    if (times.length) return times;
  }
  // fallback: 첫차~막차 균등 분할
  const count = route[getCountKey(dayType)] || 0;
  if (!count || !route['첫차'] || !route['막차']) return [];
  const fMin = timeToMin(route['첫차']), lMin = timeToMin(route['막차']);
  const interval = count > 1 ? Math.round((lMin - fMin) / (count - 1)) : 0;
  const times = [];
  for (let i = 0; i < count; i++) times.push(fMin + interval * i);
  return times;
}

// timetable.json에서 특정 정류장의 통과 시각 배열 반환
// stopName: 시간표상 정류장 이름, returns: [분, ...] 배열 (null 제외)
function getStopPassTimes(route, stopName, dayType) {
  const key = route['번호'] + '_' + route['기점'];
  const tt  = TIMETABLE[key];
  if (!tt) return null;
  const stops = tt.stops || [];
  const idx   = stops.indexOf(stopName);
  if (idx === -1) return null;
  const rows = tt[dayType] || tt['weekday'] || [];
  const times = rows
    .map(row => {
      const t = Array.isArray(row) ? row[idx] : null;
      return (t && typeof t === 'string' && t.includes(':')) ? timeToMin(t) : null;
    })
    .filter(t => t !== null);
  return times.length ? times : null;
}

// 다음 버스 (분 단위 반환)
function getNextBusMin(route, baseMin, dayType) {
  const times = getRouteTimes(route, dayType);
  return times.find(t => t >= baseMin) ?? null;
}

function isInSeocheon(lat,lng){
  return lat>=SEOCHEON_BOUNDS.minLat&&lat<=SEOCHEON_BOUNDS.maxLat&&
         lng>=SEOCHEON_BOUNDS.minLng&&lng<=SEOCHEON_BOUNDS.maxLng;
}

function formatDuration(min) {
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// 정류장명 → 가장 가까운 stop 반환
function findStopByName(name){
  name=(name||'').replace(/[()↔→]/g,' ').trim();
  if(!name) return null;
  const exact=STOPS.find(s=>s.name===name);
  if(exact) return exact;
  const partial=STOPS.filter(s=>s.name.includes(name)||name.includes(s.name));
  if(partial.length===1) return partial[0];
  if(partial.length>1) return partial.sort((a,b)=>a.name.length-b.name.length)[0];
  return null;
}

// coords 배열에서 주어진 좌표와 가장 가까운 인덱스 반환
// radiusM: 허용 반경(미터), 범위 밖이면 -1
function findIdxByCoord(coords, lat, lng, radiusM = 300) {
  let best = -1, bestD = Infinity;
  coords.forEach((c, i) => {
    if (!c.lat) return;
    const d = distM(c.lat, c.lng, lat, lng);
    if (d < bestD && d <= radiusM) { bestD = d; best = i; }
  });
  return best;
}
