// Az úthálózat betöltése a telefonra: egyszer letölti, elmenti a böngésző tárolójába (Cache Storage),
// és internet nélkül onnan olvassa. Egy munkameneten belül a memóriában is megmarad.
import { RoadGraph, type CompactGraph } from "./road-graph";

const URL_ROADS = "/api/roads";
export const DATA_CACHE = "ujsagtura-data-v1";

let loading: Promise<RoadGraph | null> | null = null;

const hasCacheStorage = () => typeof caches !== "undefined";

async function fromNetwork(): Promise<CompactGraph | null> {
  const res = await fetch(URL_ROADS, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) return null;
  if (hasCacheStorage()) {
    await caches
      .open(DATA_CACHE)
      .then((c) => c.put(URL_ROADS, res.clone()))
      .catch(() => {});
  }
  return res.json();
}

async function fromStorage(): Promise<CompactGraph | null> {
  if (!hasCacheStorage()) return null;
  const hit = await caches.match(URL_ROADS).catch(() => undefined);
  return hit ? hit.json() : null;
}

/** Az úthálózat (null, ha sem a szerverről, sem a tárolóból nem érhető el). `refresh`: mindenképp letölti újra. */
export function loadRoadGraph(refresh = false): Promise<RoadGraph | null> {
  if (!loading || refresh) {
    loading = (async () => {
      const stored = refresh ? null : await fromStorage();
      const data = stored ?? (await fromNetwork().catch(() => null)) ?? (await fromStorage());
      return data?.edges?.length ? new RoadGraph(data) : null;
    })();
    loading.then((g) => {
      if (!g) loading = null; // legközelebb újra próbálja
    });
  }
  return loading;
}
