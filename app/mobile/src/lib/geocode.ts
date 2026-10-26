// Címek elhelyezése a térképen a szerver utcaadataiból (OpenStreetMap), majd mentés.
import type { LatLon } from "@shared/geo";
import type { Stop } from "@shared/types";
import { api } from "./api";

/** A megadott címek elhelyezése és mentése. Visszaadja az összegző üzenetet. */
export async function geocodeStops(list: Stop[]): Promise<string> {
  const { results, houses } = await api.locate([...new Set(list.map((s) => s.address))]);
  const found = list.flatMap((s) => {
    const r = results[s.address];
    return r ? [{ id: s.id, lat: r.lat, lon: r.lon }] : [];
  });
  if (found.length) await api.saveLocations(found);
  const count: Record<string, number> = {};
  for (const s of list) {
    const k = results[s.address]?.kind ?? "nincs";
    count[k] = (count[k] ?? 0) + 1;
  }
  const missing = [...new Set(list.filter((s) => !results[s.address]).map((s) => s.address))];
  const street = (count["utca"] ?? 0) + (count["terület"] ?? 0);
  return (
    `Kész: ${count["pontos"] ?? 0} pontos, ${count["becsült"] ?? 0} becsült, ${street} utcaszintű, ` +
    `${missing.length} nem található${missing.length ? ": " + missing.slice(0, 10).join("; ") : ""}.` +
    (houses === false ? " A házszám-adatok most nem töltődtek le: próbáld újra később az Újraszámolással." : "")
  );
}

/** Egy cím helye a szerver utcaadataiból (null, ha nem található vagy nincs internet). */
export async function locateAddress(address: string): Promise<LatLon | null> {
  try {
    const r = (await api.locate([address])).results[address];
    return r ? { lat: r.lat, lon: r.lon } : null;
  } catch {
    return null;
  }
}
