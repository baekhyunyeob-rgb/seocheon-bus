// ================================================================
// core.js — 데이터 로드, 공통 상수, 유틸리티
// ================================================================

'use strict';

// ── 전역 상태 ──────────────────────────────────────────────────
const APP = {
  routes:    [],      // 노선 데이터 (routes_fixed.json)
  stops:     [],      // 정류장 데이터 (stops.json)
  stopMap:   {},      // { name: stop } 빠른 조회
  routeCoords: new Map(), // 노선 좌표 캐시 key: '번호_기점'
  myLocation: { lat: 36.0758, lng: 126.6908 }, // 기본: 서천터미널
  searchState: { from: null, to: null, time: null },
  currentScreen: 'home',
  detailResult: null,
  savedPlaces: [],
};

// ── 권역 설정 ──────────────────────────────────────────────────
const ZONES = [
  { id: 'all', name: '전체',     color: '#1D9E75' },
  { id: 'sj',  name: '서천·장항', color: '#185FA5' },
  { id: 'hh',  name: '한산·화양', color: '#EF9F27' },
  { id: 'mp',  name: '문산·판교', color: '#7F77DD' },
  { id: 'sd',  name: '서면·동백', color: '#E24B4A' },
];

// 타시도 노선 pill 색상
const COLOR_OUTSIDE = '#999';

// 카카오 REST API 키
const KAKAO_REST_KEY = 'a0aa52b4b6223f8d5f132191663cac66';

// 서천군 위경도 범위
const SEOCHEON_BOUNDS = { minLat:35.97, maxLat:36.22, minLng:126.49, maxLng:126.89 };

// ── 데이터 로드 ────────────────────────────────────────────────
async function loadData() {
  try {
    const [rRes, sRes] = await Promise.all([
      fetch('data/routes_fixed.json'),
      fetch('data/stops.json'),
    ]);
    const rawRoutes = await rRes.json();
    const rawStops  = await sRes.json();

    // 타시도 노선 중 서천 경유 노선만 포함
    const HUBS = ['서천','장항','한산','비인','판교','기산','문산','화양','마서'];
    APP.routes = rawRoutes.filter(r => {
      if (!r['노선군'].includes('타시도')) return true;
      const txt = r['기점'] + r['종점'] + r['경유'];
      return HUBS.some(h => txt.includes(h));
    });

    // 정류장 displayName 생성 (내향/외향 정리)
    APP.stops = rawStops.map(s => ({
      ...s,
      displayName: s.name
        .replace('(내향)', '(서천읍 방향)')
        .replace('(외향)', '')
        .trim(),
    }));

    // 빠른 조회용 맵
    APP.stops.forEach(s => {
      APP.stopMap[s.name] = s;
      if (s.displayName !== s.name) APP.stopMap[s.displayName] = s;
    });

    // 저장된 장소 로드
    APP.savedPlaces = JSON.parse(localStorage.getItem('seocheon_places') || '[]');

    // 노선 좌표 사전 구축
    buildRouteCoords();

    console.log(`데이터 로드 완료: 노선 ${APP.routes.length}개, 정류장 ${APP.stops.length}개`);
  } catch(e) {
    console.error('데이터 로드 실패:', e);
  }
}

// ── 노선 좌표 사전 구축 ────────────────────────────────────────
function buildRouteCoords() {
  APP.routes.forEach(route => {
    const via = route['경유'] || '';
    const names = [route['기점']];
    via.replace(/[()]/g, '').split(/→|↔|,/).forEach(s => {
      const t = s.trim(); if (t) names.push(t);
    });
    names.push(route['종점']);

    const coords = names.map(name => {
      const s = APP.stopMap[name];
      return s ? { name, lat: s.lat, lng: s.lng } : { name, lat: null, lng: null };
    });

    // 좌표 없는 정류장 보간
    for (let i = 0; i < coords.length; i++) {
      if (!coords[i].lat) {
        const prev = coords.slice(0, i).reverse().find(c => c.lat);
        const next = coords.slice(i + 1).find(c => c.lat);
        if (prev && next) {
          coords[i].lat = (prev.lat + next.lat) / 2;
          coords[i].lng = (prev.lng + next.lng) / 2;
        } else if (prev) {
          coords[i].lat = prev.lat; coords[i].lng = prev.lng;
        } else if (next) {
          coords[i].lat = next.lat; coords[i].lng = next.lng;
        }
      }
    }

    APP.routeCoords.set(`${route['번호']}_${route['기점']}`, coords);
  });
  console.log(`노선 좌표 사전 구축 완료: ${APP.routeCoords.size}개`);
}

// ── 노선 좌표 조회 ─────────────────────────────────────────────
function getRouteCoords(route) {
  return APP.routeCoords.get(`${route['번호']}_${route['기점']}`) || [];
}

// ── 권역 ID 결정 ───────────────────────────────────────────────
function getZoneId(route) {
  const g = route['노선군'] || '';
  const num = parseInt(route['번호']) || 0;

  if (g.includes('타시도')) {
    if (g.includes('군산')) return 'sj';
    if (g.includes('부여')) return 'hh';
    if (g.includes('보령')) return 'sd';
    return 'sj';
  }
  // 서면·동백: 동백선(1~4번) + 80~99번 + 800번대
  if (g.includes('동백') || g.includes('1~4번')) return 'sd';
  if (num >= 80  && num <= 99)  return 'sd';
  if (num >= 800 && num <= 899) return 'sd';
  if (g.includes('서면') || g.includes('당정') || g.includes('비인')) return 'sd';

  // 서천·장항: 10~29번, 100~299번, 600~799번
  if (num >= 10  && num <= 29)  return 'sj';
  if (num >= 100 && num <= 299) return 'sj';
  if (num >= 600 && num <= 799) return 'sj';
  if (g.includes('북산') || g.includes('하구둑') || g.includes('산내') ||
      g.includes('장항') || g.includes('장상')) return 'sj';

  // 한산·화양: 30~39번, 60~64번, 300~499번
  if (num >= 30  && num <= 39)  return 'hh';
  if (num >= 60  && num <= 64)  return 'hh';
  if (num >= 300 && num <= 499) return 'hh';
  if (g.includes('한산') || g.includes('화양')) return 'hh';

  // 문산·판교: 40~59번, 50번대, 500~599번, 70번대(봉선리)
  if (num >= 40  && num <= 59)  return 'mp';
  if (num >= 500 && num <= 599) return 'mp';
  if (num >= 70  && num <= 79)  return 'mp';
  if (g.includes('판교') || g.includes('문산') || g.includes('봉선')) return 'mp';

  return 'sj';
}

// ── 노선 pill 색상 ─────────────────────────────────────────────
function getZoneColor(route) {
  if ((route['노선군'] || '').includes('타시도')) return COLOR_OUTSIDE;
  const zone = ZONES.find(z => z.id === getZoneId(route));
  return zone ? zone.color : ZONES[1].color;
}

// ── 노선 표시 번호 ─────────────────────────────────────────────
function getBusNum(route) {
  const num = route['번호'] || '';
  if ((route['노선군'] || '').includes('타시도')) {
    const m = route['업체']?.match(/([가-힣]+)(?:여객|버스|운수)/);
    const region = m ? m[1] : '타지역';
    return `${num}(${region})`;
  }
  return `${num}번`;
}

// ── 좌표 거리 (미터) ───────────────────────────────────────────
function coordDist(lat1, lng1, lat2, lng2) {
  return Math.sqrt((lat1 - lat2) ** 2 + (lng1 - lng2) ** 2) * 111000;
}

// ── 소요시간 포맷 ──────────────────────────────────────────────
function fmtDuration(min) {
  if (!min || min < 0) return '-';
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60), m = min % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// ── 시각 문자열 → 분 ───────────────────────────────────────────
function timeToMin(str) {
  if (!str || !str.includes(':')) return -1;
  const [h, m] = str.split(':').map(Number);
  return h * 60 + m;
}

// ── 분 → 시각 문자열 ───────────────────────────────────────────
function minToTime(min) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ── 도착 시각 계산 ─────────────────────────────────────────────
function calcArrival(departStr, addMin) {
  const base = timeToMin(departStr);
  if (base < 0) return '?';
  return minToTime(base + addMin);
}

// ── 서천 지역 여부 ─────────────────────────────────────────────
function isInSeocheon(lat, lng) {
  return lat >= SEOCHEON_BOUNDS.minLat && lat <= SEOCHEON_BOUNDS.maxLat &&
         lng >= SEOCHEON_BOUNDS.minLng && lng <= SEOCHEON_BOUNDS.maxLng;
}

// ── 요일 타입 ──────────────────────────────────────────────────
function getDayType(date) {
  const d = date || new Date();
  const day = d.getDay();
  if (day === 0 || day === 6) return day === 6 ? 'sat' : 'hol';
  return 'weekday';
}

// ── 노선 전체 소요시간 추정 (분) ───────────────────────────────
function routeTotalMin(route) {
  const km = route['거리'] || 10;
  return Math.round(km * 2.5 + 5);
}

// ── 정류장 검색 (이름 기반) ────────────────────────────────────
function findStop(name) {
  if (!name) return null;
  return APP.stopMap[name]
    || APP.stops.find(s => s.name === name)
    || APP.stops.find(s => s.displayName === name)
    || APP.stops.find(s => s.name.includes(name.substring(0, 4)));
}

// ── 좌표 기반 가장 가까운 정류장 ──────────────────────────────
function nearestStop(lat, lng, maxDistM = 500) {
  let best = null, bestD = maxDistM;
  APP.stops.forEach(s => {
    const d = coordDist(lat, lng, s.lat, s.lng);
    if (d < bestD) { bestD = d; best = s; }
  });
  return best;
}

// ── 노선 coords에서 좌표와 가장 가까운 인덱스 ─────────────────
function nearestCoordIdx(coords, lat, lng, thresholdM = 1500) {
  let best = -1, bestD = thresholdM;
  coords.forEach((c, i) => {
    if (!c.lat) return;
    const d = coordDist(c.lat, c.lng, lat, lng);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

// ── 다음 버스 시각 (분) ────────────────────────────────────────
function nextBusMin(route, baseMin, dayType) {
  const key = dayType === 'weekday' ? '평일횟수'
             : dayType === 'sat'    ? '토요일횟수' : '공휴일횟수';
  const count = Number(route[key]) || 0;
  if (!count || !route['첫차'] || !route['막차']) return null;
  const fMin = timeToMin(route['첫차']);
  const lMin = timeToMin(route['막차']);
  if (fMin < 0 || lMin < 0) return null;
  const interval = count > 1 ? Math.round((lMin - fMin) / (count - 1)) : 0;
  for (let i = 0; i < count; i++) {
    const t = fMin + interval * i;
    if (t >= baseMin) return t;
  }
  return null; // 막차 지남
}

// ── 노선의 모든 버스 시각 배열 (분) ───────────────────────────
function allBusMins(route, dayType) {
  const key = dayType === 'weekday' ? '평일횟수'
             : dayType === 'sat'    ? '토요일횟수' : '공휴일횟수';
  const count = Number(route[key]) || 0;
  if (!count || !route['첫차'] || !route['막차']) return [];
  const fMin = timeToMin(route['첫차']);
  const lMin = timeToMin(route['막차']);
  if (fMin < 0 || lMin < 0) return [];
  const interval = count > 1 ? Math.round((lMin - fMin) / (count - 1)) : 0;
  return Array.from({ length: count }, (_, i) => fMin + interval * i);
}

// ── 대기시간 포맷 ──────────────────────────────────────────────
function fmtWait(min) {
  if (min <= 0) return '곧 출발';
  if (min < 60) return `${min}분 후`;
  return `${Math.floor(min / 60)}시간 ${min % 60}분 후`;
}
