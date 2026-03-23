'use strict';

// ==================== 경로 검색 ====================

const TRANSFER_HUBS = [
  '서천터미널','장항터미널','한산공용터미널',
  '서천역','장항읍내','판교','기산','문산',
  '화양','비인','마산','시초','광암',
];

function searchRoutes(fromState, toState, searchTime) {
  const dayType   = getDayType();
  const baseMin   = searchTime.getHours()*60 + searchTime.getMinutes();
  const results   = [];

  // 출발/도착 좌표
  const fromLat = fromState?.isGps ? STATE.myLocation.lat : fromState?.lat;
  const fromLng = fromState?.isGps ? STATE.myLocation.lng : fromState?.lng;
  const toLat   = toState?.lat;
  const toLng   = toState?.lng;

  if (!toLat) return [];

  const toCoords   = getNearbyCoords(toLat, toLng, 300);
  const fromCoords = (fromLat && !fromState?.isGps) ? getNearbyCoords(fromLat, fromLng, 300) : null;

  // ── 직행 탐색 ──
  for (const route of ROUTES) {
    const coords = getRouteCoords(route);
    if (!coords.length) continue;

    const toIdx = findSnapIdxMulti(coords, toCoords, 500);
    if (toIdx === -1) continue;

    let fromIdx = -1;
    if (fromLat) {
      fromIdx = fromCoords
        ? findSnapIdxMulti(coords, fromCoords, 1500)
        : findSnapIdx(coords, fromLat, fromLng, 1500);
    }
    if (!fromState?.isGps && fromIdx === -1) continue;
    if (fromIdx !== -1 && fromIdx >= toIdx) continue;

    const nextMin = getNextBusMin(route, baseMin, dayType);
    if (nextMin === null) continue;

    const fromC = (fromIdx>=0&&coords[fromIdx]) ? coords[fromIdx] : (fromLat?{lat:fromLat,lng:fromLng}:null);
    const toC   = coords[toIdx];
    const segKm = (fromC?.lat&&toC?.lat) ? distM(fromC.lat,fromC.lng,toC.lat,toC.lng)/1000 : (route['거리']||10);
    const mins  = Math.round(segKm*2.5+3);

    results.push({
      type: 'direct',
      route, coords,
      nextMin,
      boardMin: nextMin,
      arriveMin: nextMin + mins,
      minutes: mins,
      fromIdx, toIdx, dayType,
    });
  }

  // ── 환승 탐색 ──
  const ck = getCountKey(dayType);

  for (const hubName of TRANSFER_HUBS) {
    const hubStop = STOPS.find(s => s.name.includes(hubName.substring(0,3)));
    if (!hubStop) continue;
    const { lat:hLat, lng:hLng } = hubStop;

    // 허브 방향 체크 (되돌아가는 허브 제거)
    if (fromLat && toLat) {
      if (distM(hLat,hLng,toLat,toLng) >= distM(fromLat,fromLng,toLat,toLng)) continue;
    }

    // 1구간 후보: from → hub
    const leg1 = ROUTES.filter(r => {
      const c = getRouteCoords(r);
      const hi = findSnapIdx(c, hLat, hLng, 1000);
      if (hi === -1) return false;
      if (!fromLat) return true;
      const fi = fromCoords ? findSnapIdxMulti(c, fromCoords, 1500) : findSnapIdx(c, fromLat, fromLng, 1500);
      return (fromState?.isGps || fi !== -1) && (fi === -1 || fi < hi) && (r[ck] > 0);
    });

    // 2구간 후보: hub → to
    const leg2 = ROUTES.filter(r => {
      const c = getRouteCoords(r);
      const hi = findSnapIdx(c, hLat, hLng, 1000);
      const ti = findSnapIdxMulti(c, toCoords, 500);
      return hi !== -1 && ti !== -1 && hi < ti && (r[ck] > 0);
    });

    if (!leg1.length || !leg2.length) continue;

    // 2구간 각각에 대해 1구간 매칭
    for (const r2 of leg2) {
      const c2     = getRouteCoords(r2);
      const r2hub  = findSnapIdx(c2, hLat, hLng, 1000);
      const r2to   = findSnapIdxMulti(c2, toCoords, 500);
      const leg2km = (c2[r2hub]&&c2[r2to]) ? distM(c2[r2hub].lat,c2[r2hub].lng,c2[r2to].lat,c2[r2to].lng)/1000 : 5;
      const leg2min= Math.round(leg2km*2.5+3);

      const r2times = getRouteTimes(r2, dayType).filter(t=>t>=baseMin);
      if (!r2times.length) continue;

      for (const r1 of leg1) {
        const c1    = getRouteCoords(r1);
        const r1hub = findSnapIdx(c1, hLat, hLng, 1000);
        const r1fr  = fromLat ? (fromCoords ? findSnapIdxMulti(c1, fromCoords, 1500) : findSnapIdx(c1, fromLat, fromLng, 1500)) : 0;
        if (r1hub === -1) continue;

        const leg0km = (r1fr>0&&c1[0]&&c1[r1fr]) ? distM(c1[0].lat,c1[0].lng,c1[r1fr].lat,c1[r1fr].lng)/1000 : 0;
        const leg1km = (c1[r1fr]&&c1[r1hub]) ? distM(c1[r1fr]?.lat||0,c1[r1fr]?.lng||0,c1[r1hub].lat,c1[r1hub].lng)/1000 : 3;
        const leg0min= Math.round(leg0km*2.5);
        const leg1min= Math.round(leg1km*2.5+3);

        const r1times = getRouteTimes(r1, dayType);

        for (const bus2dep of r2times) {
          const needHubBy = bus2dep - 5; // 환승까지 5분 여유

          let bestBus1 = null;
          for (const dep of r1times) {
            const boardMin  = dep + leg0min;
            if (boardMin < baseMin) continue;
            const hubArrMin = boardMin + leg1min;
            if (hubArrMin <= needHubBy) { bestBus1 = { dep, boardMin, hubArrMin }; break; }
          }
          if (!bestBus1) continue;

          const hub2boardMin = bus2dep; // 2구간 실제 탑승
          const arriveMin    = hub2boardMin + leg2min;
          const totalMin     = arriveMin - bestBus1.boardMin;

          const dup = results.some(res =>
            res.type === 'transfer' &&
            res.route['번호'] === r1['번호'] &&
            res.route2['번호'] === r2['번호'] &&
            res.nextMin === bestBus1.dep
          );
          if (dup) continue;

          results.push({
            type: 'transfer',
            route: r1, route2: r2,
            coords: c1, coords2: c2,
            nextMin: bestBus1.dep,
            boardMin: bestBus1.boardMin,
            hubArrMin: bestBus1.hubArrMin,
            hub2BoardMin: hub2boardMin,
            arriveMin,
            minutes: totalMin,
            transferHub: hubName,
            dayType,
          });
          break;
        }
      }
    }
  }

  // ── 정렬 ──
  results.sort((a, b) => {
    // 직행 우선 (단, 직행 대기 > 환승 대기 + 30분이면 환승 우선)
    if (a.type !== b.type) {
      const directWait  = a.type==='direct' ? a.boardMin : b.boardMin;
      const transferWait= a.type==='direct' ? b.boardMin : a.boardMin;
      if (directWait - transferWait > 30) return a.type==='direct' ? 1 : -1;
      return a.type==='direct' ? -1 : 1;
    }
    if (Math.abs(a.boardMin - b.boardMin) > 3) return a.boardMin - b.boardMin;
    return a.minutes - b.minutes;
  });

  return results.slice(0, 3);
}

// 복귀 경로 찾기
function findReturnRoute(toState, fromState, baseMin, dayType) {
  const retFromLat = toState?.lat, retFromLng = toState?.lng;
  const retToLat   = fromState?.isGps ? STATE.myLocation.lat : fromState?.lat;
  const retToLng   = fromState?.isGps ? STATE.myLocation.lng : fromState?.lng;
  if (!retFromLat || !retToLat) return null;

  const ck = getCountKey(dayType);
  const retFromCoords = getNearbyCoords(retFromLat, retFromLng, 300);
  const retToCoords   = getNearbyCoords(retToLat, retToLng, 300);

  // 직행
  const directs = ROUTES.filter(r => {
    const c = getRouteCoords(r);
    const fi = findSnapIdxMulti(c, retFromCoords, 300);
    const ti = findSnapIdxMulti(c, retToCoords, 300);
    return fi !== -1 && ti !== -1 && fi < ti && (r[ck]>0);
  });
  if (directs.length) {
    directs.sort((a,b)=>(b[ck]||0)-(a[ck]||0));
    const r = directs[0];
    const nextMin = getNextBusMin(r, baseMin, dayType);
    return nextMin !== null ? { type:'direct', route:r, nextMin } : null;
  }

  // 환승
  for (const hubName of TRANSFER_HUBS) {
    const hs = STOPS.find(s=>s.name.includes(hubName.substring(0,3)));
    if (!hs) continue;
    const leg1 = ROUTES.filter(r=>{
      const c=getRouteCoords(r);
      const hi=findSnapIdx(c,hs.lat,hs.lng,1000);
      const fi=findSnapIdxMulti(c,retFromCoords,300);
      return fi!==-1&&hi!==-1&&fi<hi&&(r[ck]>0);
    });
    const leg2 = ROUTES.filter(r=>{
      const c=getRouteCoords(r);
      const hi=findSnapIdx(c,hs.lat,hs.lng,1000);
      const ti=findSnapIdxMulti(c,retToCoords,300);
      return hi!==-1&&ti!==-1&&hi<ti&&(r[ck]>0);
    });
    if (leg1.length && leg2.length) {
      leg1.sort((a,b)=>(b[ck]||0)-(a[ck]||0));
      leg2.sort((a,b)=>(b[ck]||0)-(a[ck]||0));
      const r1=leg1[0], r2=leg2[0];
      const nextMin=getNextBusMin(r1,baseMin,dayType);
      return nextMin!==null ? { type:'transfer', route:r1, route2:r2, nextMin, transferHub:hubName } : null;
    }
  }
  return null;
}
