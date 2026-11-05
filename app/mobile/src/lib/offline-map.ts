// A térkép mentése internet nélküli használatra: a túrák környékének térképrészletei (a MapLibre offline
// csomagjaként) és az úthálózat. A megnézett részleteket a térkép magától is megőrzi (gyorsítótár).
// A terület és a nagyítások kiválasztása ugyanaz, mint a webes változatban (lib/offline-map.ts).
//
// Minden lépés jelzi, hol tart (`report`), és mindegyiknek van időkorlátja: ha valami elakad (pl. a térképszerver
// nem válaszol vagy letiltja a letöltést), nem pörög a végtelenségig, hanem hibaüzenettel leáll.
import { OfflineManager, type OfflinePack } from "@maplibre/maplibre-react-native";
import type { LatLon } from "@shared/geo";
import { boundsOf, MAX_TILES, tilesWithinLimit } from "@shared/offline-map";
import { fetchWithTimeout } from "./net";
import { apiBase } from "./settings";
import { loadRoadGraph } from "./road-store";
import { readJson, writeJson } from "./storage";

const STATUS_KEY = "ujsagtura-offline-map";
const PACK_NAME = "ujsagtura";
const MIN_ZOOM = 13;
/** A megnézett részletek tárolója (bájt): bőven elég a város többszöri bejárásához. */
const AMBIENT_CACHE_BYTES = 150 * 1024 * 1024;
/** Ha ennyi ideig egyetlen új térképrészlet sem jön le, a letöltés elakadt. */
const STALL_MS = 45_000;
/** A térképletöltés teljes időkorlátja. */
const PACK_MAX_MS = 10 * 60_000;
/** Az előkészítő lépések (régi mentés törlése, stílus) időkorlátja. */
const STEP_MS = 20_000;

export type OfflineStatus = {
  savedAt: string;
  /** Letöltött térképrészletek. */
  tiles: number;
  /** Ennyi kellett volna (ha ismert). */
  required?: number;
  /** Minden térképrészlet lejött. */
  complete?: boolean;
  roads: boolean;
  /** Mi ment félre (üres = minden rendben). */
  errors?: string[];
};

export const offlineStatus = () => readJson<OfflineStatus>(STATUS_KEY);

/** A megnézett térképrészletek tárolójának mérete (induláskor egyszer). */
export function setupMapCache() {
  OfflineManager.setMaximumAmbientCacheSize(AMBIENT_CACHE_BYTES).catch(() => {});
}

/**
 * Az offline letöltés stílusa. FONTOS: a MapLibre offline letöltése csak http(s) címről tudja betölteni a stílust
 * (a telefonra írt `file://` stílussal el sem indul – 0 térképrészlet, örök várakozás). Ezért a webes alkalmazás
 * adja: `public/offline-style.json`. A térképrészletek címe ugyanaz, mint a térkép stílusában (map-style.ts),
 * így a térkép internet nélkül ezekből rajzol.
 */
async function offlineStyleUrl(): Promise<string> {
  const base = apiBase();
  if (!base) throw new Error("nincs beállítva a szerver címe (⋯ Több → ⚙ Beállítások)");
  const url = `${base}/offline-style.json`;
  const res = await fetchWithTimeout(url, {}, STEP_MS);
  const json = res.ok ? await res.json().catch(() => null) : null;
  if (!json?.sources)
    throw new Error(
      `a szerveren nincs meg a térképstílus (${url}, HTTP ${res.status}) – tedd ki újra a webes változatot (Vercel)`,
    );
  return url;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Ígéret időkorláttal: lejártakor hibát dob a lépés nevével. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what}: nem válaszolt ${Math.round(ms / 1000)} mp alatt`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function removeOldPacks() {
  const packs: OfflinePack[] = await OfflineManager.getPacks().catch(() => []);
  for (const p of packs) if (p.metadata?.name === PACK_NAME) await OfflineManager.deletePack(p.id).catch(() => {});
}

/** Gyakori térképletöltési hibák érthetően. */
function explainPackError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("tile count limit") || m.includes("limit exceeded"))
    return "túl nagy terület (túllépte a térképrészletek korlátját)";
  if (/\b(403|418|429)\b/.test(m) || m.includes("forbidden") || m.includes("too many"))
    return `a térképszerver (OpenStreetMap) elutasította a tömeges letöltést (${message})`;
  if (m.includes("unknownhost") || m.includes("unable to resolve") || m.includes("connection"))
    return `nincs internet, vagy nem érhető el a térképszerver (${message})`;
  return message;
}

type PackResult = { tiles: number; required: number; complete: boolean; error?: string };

/** A térképrészletek letöltése; figyeli, ha elakad, és akkor leállítja. */
async function downloadPack(
  mapStyle: string,
  bounds: [number, number, number, number],
  maxZoom: number,
  planned: number,
  report: (text: string) => void,
): Promise<PackResult> {
  return new Promise<PackResult>((resolve) => {
    let tiles = 0;
    let required = planned;
    let lastChange = Date.now();
    let lastError = "";
    let pack: OfflinePack | null = null;
    let finished = false;
    const started = Date.now();

    const finish = (r: PackResult) => {
      if (finished) return;
      finished = true;
      clearInterval(watchdog);
      if (!r.complete) pack?.pause().catch(() => {});
      resolve(r);
    };

    const watchdog = setInterval(() => {
      const idle = Date.now() - lastChange;
      if (idle > STALL_MS) {
        finish({
          tiles,
          required,
          complete: false,
          error:
            (lastError ? explainPackError(lastError) + " – " : "") +
            `a letöltés elakadt (${Math.round(idle / 1000)} mp óta nem jött új térképrészlet)`,
        });
      } else if (Date.now() - started > PACK_MAX_MS) {
        finish({ tiles, required, complete: false, error: "a letöltés túl sokáig tartott (10 perc)" });
      } else if (!tiles) {
        report(
          `Térkép letöltése… várakozás a térképszerverre (${Math.round(idle / 1000)} / ${STALL_MS / 1000} mp, utána hibaüzenettel leáll)`,
        );
      }
    }, 3000);

    OfflineManager.createPack(
      { mapStyle, bounds, minZoom: MIN_ZOOM, maxZoom, metadata: { name: PACK_NAME } },
      (p, s) => {
        pack = p;
        if (s.completedTileCount !== tiles) lastChange = Date.now();
        tiles = s.completedTileCount;
        if (s.requiredResourceCount) required = Math.max(planned, s.requiredResourceCount);
        const pct = Math.round(s.percentage ?? (tiles / Math.max(1, required)) * 100);
        report(`Térkép letöltése: ${tiles} / ${required} térképrészlet (${pct}%)…`);
        if (s.state === "complete") finish({ tiles, required, complete: true });
      },
      (_p, e) => {
        // a MapLibre egy-egy részlet hibája után újrapróbál; megjegyezzük, és ha elakad, ezt írjuk ki
        lastError = e?.message || "ismeretlen hiba";
        report(`Térkép letöltése: ${tiles} / ${required} – hiba: ${explainPackError(lastError)}`);
        if (/limit/i.test(lastError)) finish({ tiles, required, complete: false, error: explainPackError(lastError) });
      },
    )
      .then((p) => {
        pack = p;
      })
      .catch((e) => finish({ tiles, required, complete: false, error: "a letöltés nem indult el: " + errText(e) }));
  });
}

/**
 * A címek környékének térképe és az úthálózat mentése. `report`: hol tart (szöveg a képernyőre).
 * Nem dob hibát: az eredményben jelzi, mi sikerült és mi nem.
 */
export async function saveOfflineMap(points: LatLon[], report: (text: string) => void): Promise<OfflineStatus> {
  const errors: string[] = [];
  const b = boundsOf(points);
  let pack: PackResult = { tiles: 0, required: 0, complete: false };

  if (b) {
    try {
      // legfeljebb annyi nagyítás, amennyivel a részletek száma a korláton belül marad (OpenStreetMap kímélése)
      const plan = tilesWithinLimit(b);
      const maxZoom = Math.max(...plan.map((t) => t.z));
      report("Térkép mentése: a régi mentés törlése…");
      await withTimeout(removeOldPacks(), STEP_MS, "A régi mentés törlése");
      OfflineManager.setTileCountLimit(MAX_TILES + 100);
      report("Térkép mentése: előkészítés…");
      const mapStyle = await withTimeout(offlineStyleUrl(), STEP_MS + 5000, "A térképstílus letöltése");
      report(`Térkép letöltése: 0 / ${plan.length} térképrészlet…`);
      pack = await downloadPack(mapStyle, [b.west, b.south, b.east, b.north], maxZoom, plan.length, report);
      if (pack.error) errors.push("Térkép: " + pack.error);
    } catch (e) {
      errors.push("Térkép: " + errText(e));
    }
  }

  report("Úthálózat letöltése (az offline útvonaltervezéshez)…");
  let roads = false;
  try {
    roads = !!(await withTimeout(loadRoadGraph(true), 150_000, "Az úthálózat letöltése"));
    if (!roads) errors.push("Úthálózat: a szerver nem adta vissza (próbáld újra internettel).");
  } catch (e) {
    errors.push("Úthálózat: " + errText(e));
  }

  const status: OfflineStatus = {
    savedAt: new Date().toISOString(),
    tiles: pack.tiles,
    required: pack.required,
    complete: pack.complete,
    roads,
    errors,
  };
  await writeJson(STATUS_KEY, status);
  return status;
}
