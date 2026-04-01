'use strict';

// ==================== 경로 검색 ====================
// BIS 공식 데이터 기반: 정류장 순서가 정확하므로 이름 매칭만으로 충분합니다.
//
// 동일명 복수 정류장 처리:
//   같은 이름의 정류장이 방향별로 2개 있을 수 있습니다 (예: '가덕' 상행/하행).
//   BIS 데이터에서는 각 노선의 coords에 해당 방향의 정류장만 포함되어 있으므로
//   이름으로 찾으면 자동으로 올바른 방향의 정류장이 선택됩니다.

const TRANSFER_HUBS = [
  // 주요 터미널
  '서천터미널', '장항터미널', '한산공용터미널',
  // 역
  '서천역', '장항역', '판교역',
  // 군청·읍면사무소
  '서천군청신청사', '장항읍행정복지센터', '마서면행정복지센터',
  '기산면행정복지센터', '시초면행정복지센터.시초초등학교', '판교면행정복지센터',
  '종천면행정복지센터', '화양면행정복지센터', '비인면행정복지센터',
  // 지선 분기점
  '한산모시관', '동자북', '단상리입구.가그말',
  '문산정류소', '판교정류소.판교삼거리',
];

// coords에서 정류장 이름으로 인덱스 반환
// 1순위: 정확 매칭 / 2순위: 포함 매칭 (짧은 이름 우선)
function findIdxByName(coords, name) {
  if (!name || !coords.length) return -1;
  let idx = coords.findIndex(c => c.name === name);
  if (idx !== -1) return idx;
  const candidates = coords
    .map((c, i) => ({ i, n: c.name || '' }))
    .filter(c => c.n.includes(name) || name.includes(c.n))
    .sort((a, b) => a.n.length - b.n.length);
  return candidates.length ? candidates[0].i : -1;
}

// 환승 허브 인덱스: 이름으로만 찾음 (BIS 데이터는 정확하므로 좌표 보조 불필요)
function findHubIdx(coords, hubName) {
  return findIdxByName(coords, hubName);
}

// 구간 소요시간 계산 (직선거리 기반 추정)
function segMin(coords, fromIdx, toIdx, routeDist) {
  const fc = coords[fromIdx], tc = coords[toIdx];
  const km = (fc?.lat && tc?.lat)
    ? distM(fc.lat, fc.lng, tc.lat, tc.lng) / 1000
    : (routeDist || 10);
  return Math.round(km * 2.5 + 3);
}

// ── 직행 탐색 ──
function searchDirect(fromName, toName, baseMin, dayType) {
  const results = [];
  for (const route of ROUTES) {
    const coords = getRouteCoords(route);
    if (coords.length < 2) continue;

    const toIdx = findIdxByName(coords, toName);
    if (toIdx === -1) continue;

    const fromIdx = fromName ? findIdxByName(coords, fromName) : 0;
    if (fromName && fromIdx === -1) continue;
    if (fromIdx >= toIdx) continue;

    const nextMin = getNextBusMin(route, baseMin, dayType);
    if (nextMin === null) continue;

    const mins = segMin(coords, fromIdx, toIdx, route['거리']);
    results.push({
      type: 'direct', route, coords,
      nextMin, boardMin: nextMin, arriveMin: nextMin + mins, minutes: mins,
      boardStop:  coords[fromIdx]?.name || route['기점'],
      alightStop: coords[toIdx]?.name   || route['종점'],
      fromIdx, toIdx, dayType,
    });
  }
  return results;
}

// ── 환승 탐색 ──
function searchTransfer(fromName, toName, baseMin, dayType) {
  const results = [];
  const ck = getCountKey(dayType);

  for (const hubName of TRANSFER_HUBS) {
    // 1구간: from → hub
    const leg1 = ROUTES.filter(r => {
      if (!(r[ck] > 0)) return false;
      const c = getRouteCoords(r);
      if (c.length < 2) return false;
      const hi = findHubIdx(c, hubName);
      if (hi === -1) return false;
      const fi = fromName ? findIdxByName(c, fromName) : 0;
      if (fromName && fi === -1) return false;
      return fi < hi;
    });

    // 2구간: hub → to
    const leg2 = ROUTES.filter(r => {
      if (!(r[ck] > 0)) return false;
      const c = getRouteCoords(r);
      if (c.length < 2) return false;
      const hi = findHubIdx(c, hubName);
      if (hi === -1) return false;
      const ti = findIdxByName(c, toName);
      return ti !== -1 && hi < ti;
    });

    if (!leg1.length || !leg2.length) continue;

    for (const r2 of leg2) {
      const c2   = getRouteCoords(r2);
      const r2hi = findHubIdx(c2, hubName);
      const r2ti = findIdxByName(c2, toName);
      if (r2hi === -1 || r2ti === -1) continue;

      const leg2min = segMin(c2, r2hi, r2ti, r2['거리']);
      const r2times = getRouteTimes(r2, dayType).filter(t => t >= baseMin);
      if (!r2times.length) continue;

      for (const r1 of leg1) {
        const c1   = getRouteCoords(r1);
        const r1hi = findHubIdx(c1, hubName);
        if (r1hi === -1) continue;
        const r1fi = fromName ? findIdxByName(c1, fromName) : 0;
        if (fromName && r1fi === -1) continue;

        const leg1min = segMin(c1, r1fi, r1hi, r1['거리']);
        const r1times = getRouteTimes(r1, dayType);

        for (const bus2dep of r2times) {
          const needHubBy = bus2dep - 5;
          let bestBus1 = null;
          for (const dep of r1times) {
            if (dep < baseMin) continue;
            const hubArrMin = dep + leg1min;
            if (hubArrMin <= needHubBy && bus2dep - hubArrMin <= 60) {
              bestBus1 = { dep, boardMin: dep, hubArrMin };
              break;
            }
          }
          if (!bestBus1) continue;

          const arriveMin = bus2dep + leg2min;
          const totalMin  = arriveMin - bestBus1.boardMin;
          const dup = results.some(res =>
            res.type === 'transfer' &&
            res.route['번호']  === r1['번호'] &&
            res.route2['번호'] === r2['번호'] &&
            res.nextMin        === bestBus1.dep
          );
          if (dup) continue;

          results.push({
            type: 'transfer',
            route: r1, route2: r2, coords: c1, coords2: c2,
            nextMin:      bestBus1.dep,
            boardMin:     bestBus1.boardMin,
            hubArrMin:    bestBus1.hubArrMin,
            hub2BoardMin: bus2dep,
            arriveMin, minutes: totalMin,
            transferHub:  hubName,
            boardStop:    c1[r1fi]?.name || r1['기점'],
            alightStop:   c2[r2ti]?.name || r2['종점'],
            fromIdx: r1fi, toIdx: r2ti, toIdx2: r2ti, dayType,
          });
          break;
        }
      }
    }
  }
  return results;
}

// ── 메인 진입점 ──
function searchRoutes(fromState, toState, searchTime) {
  const dayType = getDayType();
  const baseMin = searchTime.getHours() * 60 + searchTime.getMinutes();
  const fromName = fromState?.isGps ? null : (fromState?.name || null);
  const toName   = toState?.name || null;
  if (!toName) return [];

  const all = [
    ...searchDirect(fromName, toName, baseMin, dayType),
    ...searchTransfer(fromName, toName, baseMin, dayType),
  ];

  all.sort((a, b) => {
    if (a.type !== b.type) {
      const gap = (a.type === 'direct' ? a.boardMin : b.boardMin)
                - (a.type === 'direct' ? b.boardMin : a.boardMin);
      if (Math.abs(gap) > 30) return a.type === 'direct' ? -1 : 1;
      return a.type === 'direct' ? -1 : 1;
    }
    if (Math.abs(a.boardMin - b.boardMin) > 3) return a.boardMin - b.boardMin;
    return a.minutes - b.minutes;
  });

  return all.slice(0, 3);
}

// ── 복귀 경로 ──
function findReturnRoute(toState, fromState, baseMin, dayType) {
  const retFromName = toState?.name   || null;
  const retToName   = fromState?.isGps ? null : (fromState?.name || null);
  if (!retFromName) return null;

  const ck = getCountKey(dayType);

  // 직행 복귀
  const directs = ROUTES.filter(r => {
    if (!(r[ck] > 0)) return false;
    const c  = getRouteCoords(r);
    if (c.length < 2) return false;
    const fi = findIdxByName(c, retFromName);
    if (fi === -1) return false;
    if (retToName) {
      const ti = findIdxByName(c, retToName);
      return ti !== -1 && fi < ti;
    }
    return fi < c.length - 1;
  });

  if (directs.length) {
    const withNext = directs
      .map(r => ({ r, next: getNextBusMin(r, baseMin, dayType) }))
      .filter(x => x.next !== null)
      .sort((a, b) => a.next - b.next);

    if (withNext.length) {
      const { r, next: nextMin } = withNext[0];
      const c  = getRouteCoords(r);
      const fi = findIdxByName(c, retFromName);
      const ti = retToName ? findIdxByName(c, retToName) : c.length - 1;
      const mins = segMin(c, fi, ti, r['거리']);
      return {
        type: 'direct', route: r, coords: c,
        nextMin, boardMin: nextMin, arriveMin: nextMin + mins, minutes: mins,
        boardStop:  c[fi]?.name || r['기점'],
        alightStop: c[ti]?.name || r['종점'],
        fromIdx: fi, toIdx: ti, dayType,
      };
    }
  }

  // 환승 복귀
  for (const hubName of TRANSFER_HUBS) {
    const leg1 = ROUTES.filter(r => {
      if (!(r[ck] > 0)) return false;
      const c  = getRouteCoords(r);
      const fi = findIdxByName(c, retFromName);
      if (fi === -1) return false;
      const hi = findHubIdx(c, hubName);
      return hi !== -1 && fi < hi;
    });
    const leg2 = ROUTES.filter(r => {
      if (!(r[ck] > 0)) return false;
      const c  = getRouteCoords(r);
      const hi = findHubIdx(c, hubName);
      if (hi === -1) return false;
      if (retToName) {
        const ti = findIdxByName(c, retToName);
        return ti !== -1 && hi < ti;
      }
      return hi < c.length - 1;
    });
    if (!leg1.length || !leg2.length) continue;

    leg1.sort((a, b) => (b[ck] || 0) - (a[ck] || 0));
    leg2.sort((a, b) => (b[ck] || 0) - (a[ck] || 0));
    const r1 = leg1[0], r2 = leg2[0];
    const c1 = getRouteCoords(r1), c2 = getRouteCoords(r2);
    const fi  = findIdxByName(c1, retFromName);
    const hi1 = findHubIdx(c1, hubName);
    const hi2 = findHubIdx(c2, hubName);
    const ti  = retToName ? findIdxByName(c2, retToName) : c2.length - 1;
    const nextMin = getNextBusMin(r1, baseMin, dayType);
    if (nextMin === null) continue;
    const l1min = segMin(c1, fi, hi1, r1['거리']);
    const l2min = segMin(c2, hi2, ti,  r2['거리']);
    const hubMin = nextMin + l1min;
    const arrMin = hubMin  + l2min;
    return {
      type: 'transfer', route: r1, route2: r2, coords: c1, coords2: c2,
      nextMin, boardMin: nextMin, hub2BoardMin: hubMin, arriveMin: arrMin,
      minutes: arrMin - nextMin, transferHub: hubName,
      boardStop:  c1[fi]?.name  || r1['기점'],
      alightStop: c2[ti]?.name  || r2['종점'],
      fromIdx: fi, toIdx: ti, toIdx2: ti, dayType,
    };
  }
  return null;
}
