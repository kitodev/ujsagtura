// Útvonaltervezés: internettel az online OSRM, internet nélkül (vagy ha az nem válaszol) a telefonra mentett
// úthálózat (lásd road-store). Ugyanaz a logika, mint a webes változatban (lib/external.ts).
import type { LatLon } from "@shared/geo";
import type { OsrmRoute } from "@shared/navigation";
import { fetchWithTimeout, isAbort } from "./net";
import { loadRoadGraph } from "./road-store";

const OSRM = "https://router.project-osrm.org/route/v1/driving";
const ONLINE_TIMEOUT_MS = 8000;

const coordList = (pts: LatLon[]) => pts.map((p) => `${p.lon},${p.lat}`).join(";");

async function osrm(url: string, signal?: AbortSignal) {
  const res = await fetchWithTimeout(url, {}, ONLINE_TIMEOUT_MS, signal);
  if (!res.ok) throw new Error("Route request failed");
  return (await res.json()).routes?.[0] as OsrmRoute | undefined;
}

/** Részletes útvonal két pont között, manőverekkel (ha ismert a menetirány, előre indul). */
export async function routeBetween(
  from: LatLon,
  to: LatLon,
  heading: number | null,
  online = true,
): Promise<OsrmRoute | null> {
  if (online) {
    const base = `${OSRM}/${coordList([from, to])}?overview=full&geometries=geojson&steps=true`;
    const urls = heading != null ? [`${base}&bearings=${Math.round(heading)},60;&radiuses=40;unlimited`, base] : [base];
    for (const url of urls) {
      try {
        const route = await osrm(url);
        if (route) return route;
      } catch {
        /* a következő, végül az offline úthálózat */
      }
    }
  }
  return (await loadRoadGraph())?.route(from, to) ?? null;
}

export type RouteLine = { line: [number, number][]; distance: number; duration: number; offline: boolean };

/** Útvonal-vonal több ponton át (lépések nélkül); internet nélkül a mentett úthálózatból. */
export async function routeThrough(pts: LatLon[], signal?: AbortSignal, online = true): Promise<RouteLine> {
  let route: OsrmRoute | null | undefined = null;
  let offline = false;
  if (online) {
    try {
      route = await osrm(`${OSRM}/${coordList(pts)}?overview=full&geometries=geojson&steps=false`, signal);
    } catch (e) {
      if (signal?.aborted || isAbort(e)) throw e;
    }
  }
  if (!route?.geometry?.coordinates?.length) {
    route = (await loadRoadGraph())?.routeThrough(pts);
    offline = true;
  }
  if (signal?.aborted) {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  }
  const coords = route?.geometry?.coordinates as [number, number][] | undefined;
  if (!route || !coords?.length) throw new Error("No route geometry");
  return { line: coords.map(([lon, lat]) => [lat, lon]), distance: route.distance, duration: route.duration, offline };
}
