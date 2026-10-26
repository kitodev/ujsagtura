// Címek elhelyezése a térképen: először a szerver utcaadatai (OpenStreetMap), majd házszám-pontosítás.
import { houseNumber, searchableAddress } from "./addr";
import { api, type Located } from "./api";
import { politePause, searchAddress, searchHouse } from "./external";
import type { LatLon } from "./geo";
import type { Stop } from "./types";

type Progress = (message: string) => void;

/** A címek helye: elsőként a szerverről, ha az nem érhető el, címenként a Nominatimról (lassabb). */
async function locateAll(addresses: string[], progress: Progress) {
  try {
    return await api.locate(addresses);
  } catch {
    const results: Record<string, Located> = {};
    let i = 0;
    for (const a of addresses) {
      progress(`Az utcaadat-szerver most nem érhető el, címenként keresem: ${++i}/${addresses.length} – ${a}`);
      results[a] = await searchAddress(searchableAddress(a));
      await politePause();
    }
    return { results, houses: undefined };
  }
}

/** Pontosítás: utcaszintű / becsült találatoknál a hivatalos utcanév + házszám keresése. */
async function refineHouses(list: Stop[], results: Record<string, Located>, progress: Progress) {
  const todo = list.filter((s) => {
    const r = results[s.address];
    return r && r.kind !== "pontos" && r.street && houseNumber(s.address);
  });
  const cache = new Map<string, LatLon | null>();
  const updates: { id: string; lat: number; lon: number }[] = [];
  let n = 0;
  for (const s of todo) {
    const r = results[s.address]!;
    const house = houseNumber(s.address)!;
    progress(`Pontosítás ${++n}/${todo.length}: ${r.street} ${house}`);
    if (!cache.has(s.address)) {
      cache.set(s.address, await searchHouse(r.street!, house));
      await politePause();
    }
    const hit = cache.get(s.address);
    if (hit) {
      updates.push({ id: s.id, ...hit });
      r.kind = "pontos";
    }
  }
  if (updates.length) await api.saveLocations(updates);
}

function summary(list: Stop[], results: Record<string, Located>, houses: boolean | undefined): string {
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
    (houses === false
      ? " A házszám-adatok most nem töltődtek le, ezért a címek utcaszintűek: próbáld újra később az Újraszámolással."
      : "")
  );
}

/** A megadott címek elhelyezése és mentése. Visszaadja az összegző üzenetet. */
export async function geocodeStops(list: Stop[], progress: Progress): Promise<string> {
  const { results, houses } = await locateAll([...new Set(list.map((s) => s.address))], progress);
  const found = list.flatMap((s) => {
    const r = results[s.address];
    return r ? [{ id: s.id, lat: r.lat, lon: r.lon }] : [];
  });
  if (found.length) await api.saveLocations(found);
  await refineHouses(list, results, progress);
  return summary(list, results, houses);
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
