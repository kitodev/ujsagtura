// A térkép mentése internet nélküli használatra: a túrák környékének térképrészletei (csempéi) és az úthálózat.
// A csempéket a böngésző tárolja (a service worker gyorsítótárában); a térkép offline is ezekből rajzol.
import type { LatLon } from "./geo";
import { loadRoadGraph } from "./road-store";

export const TILE_URL = "https://tile.openstreetmap.org";
export const TILE_CACHE = "ujsagtura-tiles-v1";
const MIN_ZOOM = 13;
const MAX_ZOOM = 17;
/** Legfeljebb ennyi térképrészletet töltünk le egyszerre (kíméljük az OpenStreetMap ingyenes szerverét). */
export const MAX_TILES = 1500;
const MARGIN_DEG = 0.004; // ~400 m ráhagyás a címek körül
const PARALLEL = 2;
const STATUS_KEY = "ujsagtura-offline-map";

export type Bounds = { south: number; west: number; north: number; east: number };
export type Tile = { z: number; x: number; y: number };

/** A pontokat befoglaló téglalap, ráhagyással. */
export function boundsOf(points: LatLon[], margin = MARGIN_DEG): Bounds | null {
  if (!points.length) return null;
  return {
    south: Math.min(...points.map((p) => p.lat)) - margin,
    north: Math.max(...points.map((p) => p.lat)) + margin,
    west: Math.min(...points.map((p) => p.lon)) - margin,
    east: Math.max(...points.map((p) => p.lon)) + margin,
  };
}

const tileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

/** A téglalapot lefedő térképrészletek a megadott nagyításokon. */
export function tilesFor(b: Bounds, minZoom = MIN_ZOOM, maxZoom = MAX_ZOOM): Tile[] {
  const out: Tile[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const [x0, x1] = [tileX(b.west, z), tileX(b.east, z)];
    const [y0, y1] = [tileY(b.north, z), tileY(b.south, z)];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push({ z, x, y });
  }
  return out;
}

/** A legnagyobb nagyítás, amellyel a részletek száma a korláton belül marad. */
export function tilesWithinLimit(b: Bounds, limit = MAX_TILES): Tile[] {
  for (let max = MAX_ZOOM; max > MIN_ZOOM; max--) {
    const tiles = tilesFor(b, MIN_ZOOM, max);
    if (tiles.length <= limit) return tiles;
  }
  return tilesFor(b, MIN_ZOOM, MIN_ZOOM);
}

export const tileUrl = (t: Tile) => `${TILE_URL}/${t.z}/${t.x}/${t.y}.png`;

export type OfflineStatus = { savedAt: string; tiles: number; roads: boolean };

export function offlineStatus(): OfflineStatus | null {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) ?? "null");
  } catch {
    return null;
  }
}

/**
 * A térkép mentése: a címek környékének térképrészletei és az úthálózat.
 * A már elmentett részleteket nem tölti le újra. `progress`: (kész, összes).
 */
export async function saveOfflineMap(points: LatLon[], progress: (done: number, total: number) => void) {
  const bounds = boundsOf(points);
  const tiles = bounds ? tilesWithinLimit(bounds) : [];
  const cache = typeof caches !== "undefined" ? await caches.open(TILE_CACHE) : null;
  let done = 0;
  let saved = 0;
  const queue = [...tiles];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      const url = tileUrl(t);
      try {
        if (cache && (await cache.match(url))) saved++;
        else {
          const res = await fetch(url, { mode: "cors" });
          if (res.ok) {
            await cache?.put(url, res);
            saved++;
          }
        }
      } catch {
        /* egy-egy hiányzó részlet nem baj */
      }
      progress(++done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const roads = !!(await loadRoadGraph(true));
  const status: OfflineStatus = { savedAt: new Date().toISOString(), tiles: saved, roads };
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch {
    /* a tároló hiánya nem baj */
  }
  return status;
}
