// Külső szolgáltatások: OSRM (útvonal) és Nominatim (címkeresés) – OpenStreetMap alapon.
import type { LatLon } from "./geo";
import type { OsrmRoute } from "./navigation";

const OSRM = "https://router.project-osrm.org/route/v1/driving";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const KISKUNHALAS_BOX = "19.38,46.52,19.62,46.36";

const coordList = (pts: LatLon[]) => pts.map((p) => `${p.lon},${p.lat}`).join(";");

/**
 * Részletes útvonal két pont között, manőverekkel.
 * Ha ismert a menetirány, előbb azzal próbálja (így előre indul, és ha kell, a legközelebbi helyen fordít vissza).
 */
export async function routeBetween(from: LatLon, to: LatLon, heading: number | null): Promise<OsrmRoute | null> {
  const base = `${OSRM}/${coordList([from, to])}?overview=full&geometries=geojson&steps=true`;
  const urls = heading != null ? [`${base}&bearings=${Math.round(heading)},60;&radiuses=40;unlimited`, base] : [base];
  for (const url of urls) {
    try {
      const json = await (await fetch(url)).json();
      if (json.routes?.[0]) return json.routes[0] as OsrmRoute;
    } catch {
      /* próbáljuk a következőt */
    }
  }
  return null;
}

/** Útvonal-vonal több ponton át (lépések nélkül). */
export async function routeThrough(
  pts: LatLon[],
  signal?: AbortSignal,
): Promise<{ line: [number, number][]; distance: number; duration: number }> {
  const res = await fetch(`${OSRM}/${coordList(pts)}?overview=full&geometries=geojson&steps=false`, { signal });
  if (!res.ok) throw new Error("Route request failed");
  const route = (await res.json()).routes?.[0];
  const coords = route?.geometry?.coordinates as [number, number][] | undefined;
  if (!coords?.length) throw new Error("No route geometry");
  return { line: coords.map(([lon, lat]) => [lat, lon]), distance: route.distance, duration: route.duration };
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
