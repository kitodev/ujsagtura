// Külső szolgáltatások: OSRM (útvonal) és Nominatim (címkeresés) – OpenStreetMap alapon.
import type { LatLon } from "./geo";
import type { OsrmRoute } from "./navigation";
import { loadRoadGraph } from "./road-store";

const OSRM = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const KISKUNHALAS_BOX = "19.38,46.52,19.62,46.36";

const coordList = (pts: LatLon[]) => pts.map((p) => `${p.lon},${p.lat}`).join(";");

const ONLINE_TIMEOUT_MS = 8000;
const online = () => typeof navigator === "undefined" || navigator.onLine !== false;

async function osrm(url: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(ONLINE_TIMEOUT_MS);
  // AbortSignal.any régebbi telefonokon hiányzik: ott a külső megszakítás nélkül, csak időkorláttal
  const both = signal && "any" in AbortSignal ? AbortSignal.any([signal, timeout]) : (signal ?? timeout);
  const res = await fetch(url, { signal: both });
  if (!res.ok) throw new Error("Route request failed");
  return (await res.json()).routes?.[0] as OsrmRoute | undefined;
}

/**
 * Részletes útvonal két pont között, manőverekkel.
 * Internettel az online útvonaltervező (OSRM) adja; ha ismert a menetirány, előbb azzal próbálja
 * (így előre indul, és ha kell, a legközelebbi helyen fordít vissza).
 * Internet nélkül (vagy ha az online szolgáltatás nem válaszol) a telefonra mentett úthálózatból tervez.
 */
export async function routeBetween(from: LatLon, to: LatLon, heading: number | null): Promise<OsrmRoute | null> {
  if (online()) {
    const base = `${OSRM}/${coordList([from, to])}?overview=full&geometries=geojson&steps=true`;
    const urls = heading != null ? [`${base}&bearings=${Math.round(heading)},60;&radiuses=40;unlimited`, base] : [base];
    for (const url of urls) {
      try {
        const route = await osrm(url);
        if (route) return route;
      } catch {
        /* próbáljuk a következőt, végül az offline úthálózatot */
      }
    }
  }
  return (await loadRoadGraph())?.route(from, to) ?? null;
}

/** Útvonal-vonal több ponton át (lépések nélkül); internet nélkül a mentett úthálózatból. */
export async function routeThrough(
  pts: LatLon[],
  signal?: AbortSignal,
): Promise<{ line: [number, number][]; distance: number; duration: number; offline?: boolean }> {
  let route: OsrmRoute | null | undefined = null;
  let offline = false;
  if (online()) {
    try {
      route = await osrm(`${OSRM}/${coordList(pts)}?overview=full&geometries=geojson&steps=false`, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
    }
  }
  if (!route?.geometry?.coordinates?.length) {
    route = (await loadRoadGraph())?.routeThrough(pts);
    offline = true;
  }
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const coords = route?.geometry?.coordinates as [number, number][] | undefined;
  if (!coords?.length) throw new Error("No route geometry");
  return {
    line: coords.map(([lon, lat]) => [lat, lon]),
    distance: route!.distance,
    duration: route!.duration,
    offline,
  };
}

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
  address?: { house_number?: string; road?: string };
};

/** Cím keresése szabad szöveggel Kiskunhalason belül. */
export async function searchAddress(text: string): Promise<{ lat: number; lon: number; kind: string } | null> {
  try {
    const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=1&countrycodes=hu&viewbox=${KISKUNHALAS_BOX}&bounded=1&q=${encodeURIComponent(`${text}, Kiskunhalas`)}`;
    const hit = ((await (await fetch(url)).json()) as NominatimHit[])[0];
    return hit ? { lat: +hit.lat, lon: +hit.lon, kind: hit.address?.house_number ? "pontos" : "utca" } : null;
  } catch {
    return null;
  }
}

/** Pontos házszám keresése a hivatalos utcanévvel. */
export async function searchHouse(street: string, house: string): Promise<LatLon | null> {
  try {
    const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=5&countrycodes=hu&street=${encodeURIComponent(`${house} ${street}`)}&city=Kiskunhalas`;
    const hits = (await (await fetch(url)).json()) as NominatimHit[];
    const m = hits.find(
      (x) =>
        x.display_name.includes("Kiskunhalas") && (x.address?.house_number ?? "").toLowerCase() === house.toLowerCase(),
    );
    return m ? { lat: +m.lat, lon: +m.lon } : null;
  } catch {
    return null;
  }
}

/** A Nominatim használati szabálya: legfeljebb 1 kérés / mp. */
export const politePause = () => new Promise((r) => setTimeout(r, 1100));
