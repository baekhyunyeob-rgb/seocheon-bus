'use strict';

// ==================== 상수 ====================
// 카카오맵 JS 키 (지도 표시용 — index.html의 SDK 로드에도 동일하게 사용)
const KAKAO_JS_KEY   = 'ea4bdbbdf5c627aba4db0a4b163c9b0d';
const KAKAO_REST_KEY = 'a0aa52b4b6223f8d5f132191663cac66';

const SEOCHEON_BOUNDS = { minLat:35.97, maxLat:36.22, minLng:126.49, maxLng:126.89 };

const ZONES = [
  { id:'seojang', name:'서천·장항', color:'#185FA5' },
  { id:'hanyang', name:'한산·화양', color:'#1D9E75' },
  { id:'munpan',  name:'문산·판교', color:'#7F77DD' },
  { id:'seodon',  name:'서면·동백', color:'#E24B4A' },
  { id:'outer',   name:'서천 외',   color:'#aaa'    },
];

// ── 노선군 → 권역 직접 매핑 테이블 ──────────────────────────────────
// 노선군 문자열을 키로 사용하므로 정규식 오탐이 구조적으로 불가능.
// 새 노선군이 추가되면 이 테이블에 한 줄만 추가하면 됨.
const ZONE_BY_GUNNAME = {
  // 서천·장항 (남서권)
  '100번대 장항.동백선':                  'seojang',
  '10번 하구둑.군산선':                   'seojang',
  '20번대 장항선':                        'seojang',
  '20번대 장항선(옥산)':                  'seojang',
  '200번대 산내.장상선':                  'seojang',
  '600번대 마서.장항권역 지선(관광선)':   'seojang',
  '700번대 마서권역 지선(갈목선)':        'seojang',
  // 한산·화양 (남동권)
  '11~14번 북산선':                       'hanyang',
  '300번대 한산지선':                     'hanyang',
  '300번대 한산지선(마서)':               'hanyang',
  '30번대 한산선':                        'hanyang',
  '400번대 기산.마산.한산권역 지선':      'hanyang',
  '60번대 화양선':                        'hanyang',
  // 문산·판교 (북동권)
  '40번대 판교선':                        'munpan',
  '50번대 문산선':                        'munpan',
  '500번대 종천.판교권역 지선':           'munpan',
  '70번대 봉선리선':                      'munpan',  // 73~77번이 서천↔문산 주축
  // 서면·동백 (북서권)
  '1~4번 동백선':                         'seodon',
  '800번대 종천.비인.서면권역 지선':      'seodon',
  '80번대 당정.다사리선':                 'seodon',  // 81·85·86번이 서면·비인 방향
  '90번대 울리.비인선':                   'seodon',
  // 타시도
  '타시도 군산시':                        'outer',
  '타시도 보령시':                        'outer',
  '타시도 부여군':                        'outer',
};

// 권역 ID 반환 — 노선군 직접 조회 → 없으면 seojang 기본값
function getZoneId(route) {
  const gun = route['노선군'] || '';
  return ZONE_BY_GUNNAME[gun] ?? 'seojang';
}

// 권역 색상 반환
function getZoneColor(route) {
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
let ROUTES = [];
let STOPS  = [];

async function loadData() {
  try {
    const [rRes, sRes] = await Promise.all([
      fetch('data/routes.json'),
      fetch('data/stops.json'),
    ]);

    if (!rRes.ok || !sRes.ok) throw new Error('데이터 파일 응답 오류');

    ROUTES = await rRes.json();
    STOPS  = buildDisplayNames(await sRes.json());
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
  return Math.sqrt((lat1-lat2)**2+(lng1-lng2)**2)*111000;
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

// 노선 시간 배열 생성
function getRouteTimes(route, dayType){
  const count=route[getCountKey(dayType)]||0;
  if(!count||!route['첫차']||!route['막차']) return [];
  const fMin=timeToMin(route['첫차']), lMin=timeToMin(route['막차']);
  const interval=count>1?Math.round((lMin-fMin)/(count-1)):0;
  const times=[];
  for(let i=0;i<count;i++) times.push(fMin+interval*i);
  return times;
}

// 다음 버스 (분 단위 반환)
function getNextBusMin(route, baseMin, dayType){
  const times=getRouteTimes(route, dayType);
  return times.find(t=>t>=baseMin)??null;
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
