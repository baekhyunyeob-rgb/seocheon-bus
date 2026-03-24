'use strict';

// ==================== 노선 좌표 구축 ====================
// 카카오 Directions API로 실제 도로 경로를 받아
// 그 위에 stops.json 정류장을 50m 이내 스냅하여
// 각 노선의 완전한 정류장 순서를 만든다.
//
// 캐시: localStorage 'sc_route_coords' 에 저장
// 앱 첫 실행 시 한 번 구축 후 재사용

const SNAP_RADIUS_M  = 50;   // 정류장 스냅 반경 (m)
const DEDUP_DIST_M   = 200;  // 동일 이름 양방향 정류장 중복 제거 거리 (m)
const CONCURRENCY    = 4;    // 동시 API 요청 수

// polyline 위 한 점의 수직투영 계산
function _snapToSegment(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dlat = bLat-aLat, dlng = bLng-aLng;
  const seg2 = dlat*dlat+dlng*dlng;
  if (seg2 === 0) return null;
  const t = Math.max(0, Math.min(1,
    ((pLat-aLat)*dlat+(pLng-aLng)*dlng)/seg2
  ));
  const projLat = aLat+t*dlat, projLng = aLng+t*dlng;
  const perp = distM(pLat,pLng,projLat,projLng);
  return { t, tGlobal: 0, perp, projLat, projLng };
}

// polyline 전체에서 stop의 최근접 세그먼트 찾기
function _snapStopToPolyline(stop, polyline) {
  let best = null;
  for (let i = 0; i < polyline.length-1; i++) {
    const a=polyline[i], b=polyline[i+1];
    const snap=_snapToSegment(stop.lat,stop.lng,a.lat,a.lng,b.lat,b.lng);
    if (!snap) continue;
    snap.tGlobal = i + snap.t;
    if (!best || snap.perp < best.perp) best = snap;
  }
  return best;
}

// 카카오 Directions API 호출 → polyline 좌표 배열
// 앵커가 5개 초과면 앞뒤 겹치며 분할 호출
async function fetchRoadPolyline(anchors) {
  if (!anchors || anchors.length < 2) return anchors || [];

  const CHUNK = 5; // 출발+경유3+도착
  const segments = [];
  for (let i = 0; i < anchors.length-1; i += CHUNK-1) {
    segments.push(anchors.slice(i, Math.min(i+CHUNK, anchors.length)));
    if (i+CHUNK >= anchors.length) break;
  }

  let polyline = [];
  for (const seg of segments) {
    const origin = `${seg[0].lng},${seg[0].lat}`;
    const dest   = `${seg[seg.length-1].lng},${seg[seg.length-1].lat}`;
    const wps    = seg.slice(1,-1).map(a=>`${a.lng},${a.lat}`).join('|');
    let url = `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin}&destination=${dest}&priority=RECOMMEND`;
    if (wps) url += `&waypoints=${wps}`;

    try {
      // REST 키: localStorage 우선 → APP_CONFIG → 에러
      const restKey = getKakaoRestKey();
      const res  = await fetch(url, { headers: { Authorization: `KakaoAK ${restKey}` } });
      const data = await res.json();
      const pts  = [];
      for (const section of data?.routes?.[0]?.sections || []) {
        for (const road of section.roads || []) {
          const vx = road.vertexes || [];
          for (let i = 0; i < vx.length-1; i += 2) {
            pts.push({ lat: vx[i+1], lng: vx[i] });
          }
        }
      }
      if (polyline.length > 0 && pts.length > 0) pts.shift(); // 중복 제거
      polyline = polyline.concat(pts);
    } catch {
      // fallback: 앵커 직선
      for (const a of seg) {
        if (!polyline.length || polyline[polyline.length-1].lat !== a.lat) {
          polyline.push({ lat: a.lat, lng: a.lng });
        }
      }
    }
  }
  return polyline;
}

// polyline 위에 stops 스냅 → 순서 정렬 → 중복 제거
function snapStopsToPolyline(polyline, stops) {
  if (polyline.length < 2) return [];

  const snapped = [];
  for (const stop of stops) {
    const snap = _snapStopToPolyline(stop, polyline);
    if (snap && snap.perp <= SNAP_RADIUS_M) {
      // source: 'stops_data' = stops.json에서 찾은 정류장 (도로 스냅 성공)
      snapped.push({ name: stop.name, displayName: stop.displayName||stop.name, lat: stop.lat, lng: stop.lng, tGlobal: snap.tGlobal, source: 'stops_data' });
    }
  }

  snapped.sort((a,b) => a.tGlobal - b.tGlobal);

  // 같은 이름 + 가까운 거리 → 중복 제거
  const result = [];
  for (const s of snapped) {
    const prev = result[result.length-1];
    if (prev && prev.name === s.name && distM(prev.lat,prev.lng,s.lat,s.lng) < DEDUP_DIST_M) continue;
    result.push({ name: s.name, displayName: s.displayName, lat: s.lat, lng: s.lng, source: s.source });
  }
  return result;
}

// 앵커를 결과에 삽입 (스냅 반경 밖이어도 기점/종점은 반드시 포함)
function insertAnchors(stops, anchors, polyline) {
  const result = [...stops];
  for (const anchor of anchors) {
    const already = result.some(s => s.name === anchor.name);
    if (already) continue;
    const snap = _snapStopToPolyline(anchor, polyline);
    const tGlobal = snap ? snap.tGlobal : (result.length > 0 ? result[result.length-1]._t+0.001 : 0);
    let insertIdx = result.findIndex(s => (s._t||0) > tGlobal);
    if (insertIdx === -1) insertIdx = result.length;
    // source: 'snapped' = 카카오 도로 경로에서만 찾아진 정류장 (stops.json에 없거나 반경 밖)
    result.splice(insertIdx, 0, { name: anchor.name, displayName: anchor.name, lat: anchor.lat, lng: anchor.lng, _t: tGlobal, source: 'snapped' });
  }
  return result.map(({ name, displayName, lat, lng, source }) => ({ name, displayName, lat, lng, source: source||'stops_data' }));
}

// ---- 진행상태 오버레이 ----
function _showBuildProgress(msg) {
  let el = document.getElementById('build-progress');
  if (!el) {
    el = document.createElement('div');
    el.id = 'build-progress';
    el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.75);color:#fff;border-radius:20px;padding:8px 18px;font-size:12px;z-index:999;white-space:nowrap;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}
function _hideBuildProgress() {
  const el = document.getElementById('build-progress');
  if (el) el.remove();
}

// ---- 메인 진입점 ----
async function buildRouteCoords() {
  // 1순위: route_coords.json 파일 (배포 시 미리 구축된 데이터)
  try {
    const res = await fetch('data/route_coords.json');
    if (res.ok) {
      const data = await res.json();
      for (const [key, val] of Object.entries(data)) {
        STATE.routeCoords.set(key, val);
      }
      console.log(`노선 좌표 파일 로드: ${STATE.routeCoords.size}개`);
      _showBuildProgress(`✅ 노선 데이터 로드 완료 (${STATE.routeCoords.size}개)`);
      setTimeout(_hideBuildProgress, 2000);
      return;
    }
  } catch {}

  // 2순위: localStorage 캐시
  try {
    const cached = localStorage.getItem('sc_route_coords_v4');
    if (cached) {
      const data = JSON.parse(cached);
      for (const [key, val] of Object.entries(data)) {
        STATE.routeCoords.set(key, val);
      }
      console.log(`노선 좌표 캐시 로드: ${STATE.routeCoords.size}개`);
      _showBuildProgress(`✅ 노선 데이터 로드 완료 (${STATE.routeCoords.size}개)`);
      setTimeout(_hideBuildProgress, 2000);
      return;
    }
  } catch {}

  // 3순위: 카카오 API로 실시간 구축 (route_coords.json 없을 때 fallback)
  console.log('노선 좌표 구축 시작...');
  const total = ROUTES.length;
  let done = 0;

  async function processOne(route) {
    const key = route['번호'] + '_' + route['기점'];
    const anchorData = STATE.routeAnchors.find(a => a.id === key);

    if (!anchorData || anchorData.anchors.length < 2) {
      STATE.routeCoords.set(key, anchorData?.anchors || []);
      done++;
      return;
    }

    try {
      const polyline = await fetchRoadPolyline(anchorData.anchors);
      if (polyline.length < 2) {
        STATE.routeCoords.set(key, anchorData.anchors);
      } else {
        const snapped = snapStopsToPolyline(polyline, STOPS);
        const final   = insertAnchors(snapped, anchorData.anchors, polyline);
        STATE.routeCoords.set(key, final);
      }
    } catch (e) {
      STATE.routeCoords.set(key, anchorData?.anchors || []);
    }

    done++;
    if (done % 5 === 0 || done === total) {
      _showBuildProgress(`노선 좌표 구축 중... (${done} / ${total})`);
      console.log(`노선 좌표 구축 중... ${done}/${total}`);
    }
  }

  // CONCURRENCY 개씩 병렬 처리
  for (let i = 0; i < ROUTES.length; i += CONCURRENCY) {
    await Promise.all(ROUTES.slice(i, i + CONCURRENCY).map(processOne));
  }

  // localStorage 저장 — name, lat, lng만 저장해서 용량 최소화
  try {
    const obj = {};
    STATE.routeCoords.forEach((v, k) => {
      obj[k] = v.map(c => ({ name: c.name, lat: c.lat, lng: c.lng, source: c.source||'stops_data' }));
    });
    localStorage.setItem('sc_route_coords_v4', JSON.stringify(obj));
  } catch (e) {
    console.warn('localStorage 저장 실패 (용량 초과 가능성):', e);
    // 용량 초과 시 정류장 5개 이상 노선만 저장
    try {
      const obj = {};
      STATE.routeCoords.forEach((v, k) => {
        if (v.length >= 2) obj[k] = v.map(c => ({ name: c.name, lat: c.lat, lng: c.lng }));
      });
      localStorage.setItem('sc_route_coords_v4', JSON.stringify(obj));
      console.log('부분 저장 완료');
    } catch (e2) {
      console.warn('부분 저장도 실패:', e2);
    }
  }

  _showBuildProgress(`✅ 노선 좌표 구축 완료 (${STATE.routeCoords.size}개)`);
  setTimeout(_hideBuildProgress, 3000);
  console.log(`✅ 노선 좌표 구축 완료: ${STATE.routeCoords.size}개`);
}

// 노선 좌표 가져오기
function getRouteCoords(route) {
  return STATE.routeCoords.get(route['번호']+'_'+route['기점']) || [];
}

// ── 외부에서 사용하는 좌표 유틸 (maps.js, ui.js용) ──
// 현재위치 같은 GPS 좌표 → 가장 가까운 coords 인덱스 (maps.js 전용)
function findNearestIdx(coords, lat, lng) {
  let best = -1, bestD = Infinity;
  coords.forEach((c, i) => {
    if (!c.lat) return;
    const d = distM(c.lat, c.lng, lat, lng);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
