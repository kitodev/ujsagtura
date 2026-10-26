// Földrajzi segédfüggvények (méter, fok).

export type LatLon = { lat: number; lon: number };

const RAD = Math.PI / 180;
const EARTH_DIAMETER_M = 12_742_000;

/** Két pont távolsága méterben (haversine). */
export function distanceM(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return EARTH_DIAMETER_M * Math.asin(Math.sqrt(h));
}

/** Irányszög a-ból b-be fokban (0 = észak, óramutató járása szerint). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
  const x =
    Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) -
    Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Két irány különbsége fokban (0–180). */
export function angleDiff(a: number, b: number): number {
  return Math.abs(((a - b + 540) % 360) - 180);
}

/** Méter / fok átváltás egy adott szélességen (kis távolságokra elég pontos síkvetület). */
export function metersPerDegree(lat: number): { x: number; y: number } {
  return { x: 111_320 * Math.cos(lat * RAD), y: 110_540 };
}

/** Kör alakú sokszög (pl. a GPS pontosságának megjelenítéséhez), [lon, lat] pontokkal. */
export function circlePolygon(center: LatLon, radiusM: number, segments = 40): number[][] {
  const k = metersPerDegree(center.lat);
  const ring: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    ring.push([center.lon + (radiusM * Math.sin(a)) / k.x, center.lat + (radiusM * Math.cos(a)) / k.y]);
  }
  return ring;
}
