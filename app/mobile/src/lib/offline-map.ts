// A térkép mentése internet nélküli használatra: a túrák környékének térképrészletei (a MapLibre offline
// csomagjaként) és az úthálózat. A megnézett részleteket a térkép magától is megőrzi (gyorsítótár).
// A terület és a nagyítások kiválasztása ugyanaz, mint a webes változatban (lib/offline-map.ts).
import { OfflineManager, type OfflinePack } from "@maplibre/maplibre-react-native";
import type { LatLon } from "@shared/geo";
import { boundsOf, MAX_TILES, tilesWithinLimit } from "@shared/offline-map";
import { styleFileUri } from "./map-style";
import { loadRoadGraph } from "./road-store";
import { readJson, writeJson } from "./storage";

const STATUS_KEY = "ujsagtura-offline-map";
const PACK_NAME = "ujsagtura";
const MIN_ZOOM = 13;
/** A megnézett részletek tárolója (bájt): bőven elég a város többszöri bejárásához. */
const AMBIENT_CACHE_BYTES = 150 * 1024 * 1024;

export type OfflineStatus = { savedAt: string; tiles: number; roads: boolean };

export const offlineStatus = () => readJson<OfflineStatus>(STATUS_KEY);

/** A megnézett térképrészletek tárolójának mérete (induláskor egyszer). */
export function setupMapCache() {
  OfflineManager.setMaximumAmbientCacheSize(AMBIENT_CACHE_BYTES).catch(() => {});
}

async function removeOldPacks() {
  const packs: OfflinePack[] = await OfflineManager.getPacks().catch(() => []);
  for (const p of packs) if (p.metadata?.name === PACK_NAME) await OfflineManager.deletePack(p.id).catch(() => {});
}

/** A címek környékének térképe és az úthálózat mentése. `progress`: (kész, összes) térképrészlet. */
export async function saveOfflineMap(
  points: LatLon[],
  progress: (done: number, total: number) => void,
): Promise<OfflineStatus> {
  const b = boundsOf(points);
  let tiles = 0;
  if (b) {
    // legfeljebb annyi nagyítás, amennyivel a részletek száma a korláton belül marad (OpenStreetMap kímélése)
    const plan = tilesWithinLimit(b);
    const maxZoom = Math.max(...plan.map((t) => t.z));
    await removeOldPacks();
    OfflineManager.setTileCountLimit(MAX_TILES + 100);
    const mapStyle = await styleFileUri();
    tiles = await new Promise<number>((resolve) => {
      let last = 0;
      OfflineManager.createPack(
        {
          mapStyle,
          bounds: [b.west, b.south, b.east, b.north],
          minZoom: MIN_ZOOM,
          maxZoom,
          metadata: { name: PACK_NAME },
        },
        (_pack, s) => {
          last = s.completedTileCount;
          progress(s.completedTileCount, plan.length);
          if (s.state === "complete") resolve(s.completedTileCount);
        },
        () => resolve(last),
      ).catch(() => resolve(0));
    });
  }
  const roads = !!(await loadRoadGraph(true));
  const status: OfflineStatus = { savedAt: new Date().toISOString(), tiles, roads };
  await writeJson(STATUS_KEY, status);
  return status;
}
