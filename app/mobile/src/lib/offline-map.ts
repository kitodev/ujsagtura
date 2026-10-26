// A térkép mentése internet nélküli használatra: a túrák környékének térképrészletei (csempéi) fájlokba
// (<dokumentumok>/tiles/{z}/{x}/{y} – ezt a formát olvassa a térkép UrlTile rétege), és az úthálózat.
// A részletek kiválasztása ugyanaz, mint a webes változatban (lib/offline-map.ts).
import { Directory, File, Paths } from "expo-file-system";
import type { LatLon } from "@shared/geo";
import { boundsOf, tilesWithinLimit, tileUrl, type Tile } from "@shared/offline-map";
import { loadRoadGraph } from "./road-store";
import { readJson, writeJson } from "./storage";

const STATUS_KEY = "ujsagtura-offline-map";
const PARALLEL = 2;
/** Az OpenStreetMap szabálya szerint az alkalmazás nevét el kell küldeni. */
const HEADERS = { "User-Agent": "Ujsagtura/1.0 (ujsagkezbesito alkalmazas)" };

export const OSM_TILE_TEMPLATE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

/** A térképrészletek mappája (a térkép is ide menti a megnézett részleteket). */
export const tileDir = () => new Directory(Paths.document, "tiles");

/** Egy térképrészlet fájlja: tiles/{z}/{x}/{y} (kiterjesztés nélkül). */
export const tilePath = (t: Tile) => `${t.z}/${t.x}/${t.y}`;

export type OfflineStatus = { savedAt: string; tiles: number; roads: boolean };

export const offlineStatus = () => readJson<OfflineStatus>(STATUS_KEY);

async function saveTile(t: Tile): Promise<boolean> {
  const dir = new Directory(tileDir(), String(t.z), String(t.x));
  const file = new File(dir, String(t.y));
  if (file.exists) return true;
  dir.create({ intermediates: true, idempotent: true });
  await File.downloadFileAsync(tileUrl(t), file, { headers: HEADERS, idempotent: true });
  return true;
}

/** A címek környékének térképe és az úthálózat mentése. `progress`: (kész, összes). */
export async function saveOfflineMap(
  points: LatLon[],
  progress: (done: number, total: number) => void,
): Promise<OfflineStatus> {
  const bounds = boundsOf(points);
  const tiles = bounds ? tilesWithinLimit(bounds) : [];
  let done = 0;
  let saved = 0;
  const queue = [...tiles];
  const worker = async () => {
    for (let t = queue.shift(); t; t = queue.shift()) {
      try {
        if (await saveTile(t)) saved++;
      } catch {
        /* egy-egy hiányzó részlet nem baj */
      }
      progress(++done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const roads = !!(await loadRoadGraph(true));
  const status: OfflineStatus = { savedAt: new Date().toISOString(), tiles: saved, roads };
  await writeJson(STATUS_KEY, status);
  return status;
}
