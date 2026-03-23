// ================================================================
// search.js — 경로 탐색 (직행 + 환승)
// ================================================================

// ── 환승 허브 목록 ─────────────────────────────────────────────
const TRANSFER_HUBS = [
  '서천터미널', '장항터미널', '한산공용터미널',
  '서천역', '장항읍행정복지센터', '판교정류소.판교삼거리',
  '기산면행정복지센터', '문산정류소',
  '화양면행정복지센터', '비인면행정복지센터',
  '마산리', '시초면행정복지센터.시초초등학교',
  '광암삼거리', '구동리입구',
];

// ── 메인 경로 탐색 ─────────────────────────────────────────────
function findRoutes(fromName, toName, searchTime, dayType) {
  const results = [];
  const baseMin = searchTime.getHours() * 60 + searchTime.getMinutes();

  // 출발지/도착지 정류장
  const fromStop = findStop(fromName);
  const toStop   = findStop(toName);
  if (!toStop) return [];

  const fromLat = fromStop?.lat || APP.myLocation.lat;
  const fromLng = fromStop?.lng || APP.myLocation.lng;
  const toLat   = toStop.lat;
  const toLng   = toStop.lng;

  // ── 직행 탐색 ──────────────────────────────────────────────
  APP.routes.forEach(route => {
    const coords = getRouteCoords(route);
    if (coords.length < 2) return;

    // 도착지 인덱스
    const toIdx = nearestCoordIdx(coords, toLat, toLng, 800);
    if (toIdx === -1) return;

    // 출발지 인덱스
    const fromIdx = nearestCoordIdx(coords, fromLat, fromLng, 1500);
    if (fromIdx === -1) return;
    if (fromIdx >= toIdx) return; // 방향 불일치

    // 탑승 시각 (출발지 통과 시각 추정)
    const boardMin = estimateBoardMin(route, coords, fromIdx, baseMin, dayType);
    if (boardMin === null) return; // 막차 지남

    // 소요시간: 좌표 비율 기반
    const travelMin = segTravelMin(route, coords, fromIdx, toIdx);

    results.push({
      type: 'direct',
      route,
      fromIdx,
      toIdx,
      boardMin,
      boardTime: minToTime(boardMin),
      travelMin,
      arriveMin: boardMin + travelMin,
      arriveTime: minToTime(boardMin + travelMin),
      waitMin: boardMin - baseMin,
      totalMin: (boardMin - baseMin) + travelMin,
      dayType,
    });
  });

  // ── 환승 탐색 ──────────────────────────────────────────────
  TRANSFER_HUBS.forEach(hubName => {
    const hubStop = findStop(hubName);
    if (!hubStop) return;

    const hubLat = hubStop.lat, hubLng = hubStop.lng;

    // 출발지→허브 1구간 노선
    const leg1Routes = [];
    APP.routes.forEach(r1 => {
      const c1 = getRouteCoords(r1);
      if (c1.length < 2) return;
      const hubIdx1 = nearestCoordIdx(c1, hubLat, hubLng, 800);
      if (hubIdx1 === -1) return;
      const fromIdx1 = nearestCoordIdx(c1, fromLat, fromLng, 1500);
      if (fromIdx1 === -1 || fromIdx1 >= hubIdx1) return;
      const boardMin1 = estimateBoardMin(r1, c1, fromIdx1, baseMin, dayType);
      if (boardMin1 === null) return;
      const travel1 = segTravelMin(r1, c1, fromIdx1, hubIdx1);
      leg1Routes.push({ route: r1, coords: c1, fromIdx: fromIdx1, hubIdx: hubIdx1, boardMin: boardMin1, travel: travel1 });
    });
    if (!leg1Routes.length) return;

    // 허브→도착지 2구간 노선
    APP.routes.forEach(r2 => {
      const c2 = getRouteCoords(r2);
      if (c2.length < 2) return;
      const hubIdx2 = nearestCoordIdx(c2, hubLat, hubLng, 800);
      if (hubIdx2 === -1) return;
      const toIdx2 = nearestCoordIdx(c2, toLat, toLng, 800);
      if (toIdx2 === -1 || hubIdx2 >= toIdx2) return;

      // 이 2구간의 버스 시각들
      const busMins2 = allBusMins(r2, dayType);
      if (!busMins2.length) return;

      // 각 1구간 후보와 매칭
      leg1Routes.forEach(l1 => {
        const hubArrMin = l1.boardMin + l1.travel; // 허브 도착 시각

        // 허브 도착 후 탈 수 있는 2구간 첫 버스
        const bus2Min = busMins2.find(t => t >= hubArrMin + 3); // 3분 환승 여유
        if (!bus2Min) return;

        // 탑승지 통과 시각으로 조정
        const leg2TravelMin = segTravelMin(r2, c2, hubIdx2, toIdx2);
        const boardMin2Adj = adjustBoardMin(r2, c2, hubIdx2, bus2Min);

        // 중복 제거
        const dup = results.find(x =>
          x.type === 'transfer' &&
          x.route['번호'] === l1.route['번호'] &&
          x.route2['번호'] === r2['번호']
        );
        if (dup) return;

        results.push({
          type: 'transfer',
          route: l1.route,
          route2: r2,
          fromIdx: l1.fromIdx,
          toIdx: toIdx2,
          boardMin: l1.boardMin,
          boardTime: minToTime(l1.boardMin),
          hubName,
          hubStop,
          hubArrMin,
          hubArrTime: minToTime(hubArrMin),
          bus2Min: boardMin2Adj,
          bus2Time: minToTime(boardMin2Adj),
          travelMin: l1.travel + leg2TravelMin,
          arriveMin: boardMin2Adj + leg2TravelMin,
          arriveTime: minToTime(boardMin2Adj + leg2TravelMin),
          waitMin: l1.boardMin - baseMin,
          totalMin: (boardMin2Adj + leg2TravelMin) - baseMin,
          dayType,
        });
      });
    });
  });

  return rankResults(results, baseMin);
}

// ── 결과 정렬 및 추천 선정 ─────────────────────────────────────
function rankResults(results, baseMin) {
  if (!results.length) return [];

  // 정렬: 총소요(대기+이동) → 환승횟수 → 이동시간
  results.sort((a, b) => {
    if (a.totalMin !== b.totalMin) return a.totalMin - b.totalMin;
    const ta = a.type === 'transfer' ? 1 : 0;
    const tb = b.type === 'transfer' ? 1 : 0;
    if (ta !== tb) return ta - tb;
    return a.travelMin - b.travelMin;
  });

  // 중복 제거 (같은 노선 다른 시간대)
  const seen = new Set();
  const unique = results.filter(r => {
    const key = r.type === 'transfer'
      ? `${r.route['번호']}+${r.route2['번호']}+${r.boardMin}`
      : `${r.route['번호']}+${r.boardMin}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 직행이 있으면 최대 6개, 없으면 환승 최대 4개
  const directs  = unique.filter(r => r.type === 'direct');
  const transfers = unique.filter(r => r.type === 'transfer');

  if (directs.length) {
    return [...directs.slice(0, 4), ...transfers.slice(0, 2)].slice(0, 6);
  }
  return transfers.slice(0, 4);
}

// ── 탑승 시각 추정 ─────────────────────────────────────────────
// 기점 출발 시각 + 기점→탑승지 비례 시간
function estimateBoardMin(route, coords, fromIdx, baseMin, dayType) {
  const leg0Min = segTravelMin(route, coords, 0, fromIdx);
  const bMin = nextBusMinFromOrigin(route, dayType, baseMin - leg0Min);
  if (bMin === null) return null;
  return bMin + leg0Min;
}

// 기점 기준 다음 버스 (분)
function nextBusMinFromOrigin(route, dayType, baseMin) {
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
  return null;
}

// 2구간 탑승지 통과 시각 조정 (허브 출발 시각 + 허브→탑승지 시간)
function adjustBoardMin(route, coords, hubIdx, busOriginMin) {
  const leg = segTravelMin(route, coords, 0, hubIdx);
  return busOriginMin + leg;
}

// ── 구간 소요시간 추정 (좌표 비율 기반) ───────────────────────
function segTravelMin(route, coords, startIdx, endIdx) {
  const s = Math.max(0, startIdx);
  const e = Math.min(endIdx, coords.length - 1);
  if (s >= e) return 2;
  const cs = coords[s], ce = coords[e];
  if (cs?.lat && ce?.lat) {
    const km = coordDist(cs.lat, cs.lng, ce.lat, ce.lng) / 1000;
    return Math.max(2, Math.round(km * 2.5 + 2));
  }
  const ratio = (e - s) / Math.max(coords.length - 1, 1);
  return Math.max(2, Math.round(routeTotalMin(route) * ratio));
}

// ── 정류장 목록 추출 ───────────────────────────────────────────
function getStopNames(route) {
  const via = route['경유'] || '';
  const names = [route['기점']];
  via.replace(/[()]/g, '').split(/→|↔|,/).forEach(s => {
    const t = s.trim(); if (t) names.push(t);
  });
  names.push(route['종점']);
  return [...new Set(names)]; // 순환선 중복 제거
}

// ── 복귀 경로 탐색 ─────────────────────────────────────────────
function findReturnRoute(toName, fromName, baseMin, dayType) {
  const results = findRoutes(toName, fromName, {
    getHours: () => Math.floor(baseMin / 60),
    getMinutes: () => baseMin % 60,
  }, dayType);
  return results[0] || null;
}
