// Az úthálózat a telefonon: egyszer letölti a szerverről (/api/roads), fájlba menti,
// és internet nélkül onnan tervez útvonalat. Egy futáson belül a memóriában is megmarad.
import { File, Paths } from "expo-file-system";
import { RoadGraph, type CompactGraph } from "@shared/road-graph";
import { api } from "./api";
import { fetchWithTimeout } from "./net";

const roadsFile = () => new File(Paths.document, "roads.json");
let loading: Promise<RoadGraph | null> | null = null;

async function fromNetwork(): Promise<CompactGraph | null> {
  const res = await fetchWithTimeout(api.roadsUrl(), {}, 90_000);
  if (!res.ok) return null;
  const text = await res.text();
  try {
    await roadsFile().write(text);
  } catch {
    /* mentés nélkül is használható */
  }
  return JSON.parse(text);
}

async function fromStorage(): Promise<CompactGraph | null> {
  try {
    const f = roadsFile();
    return f.exists ? JSON.parse(await f.text()) : null;
  } catch {
    return null;
  }
}

/** Az úthálózat (null, ha sem a szerverről, sem a telefonról nem érhető el). `refresh`: mindenképp újra letölti. */
export function loadRoadGraph(refresh = false): Promise<RoadGraph | null> {
  if (!loading || refresh) {
    loading = (async () => {
      const stored = refresh ? null : await fromStorage();
      const data = stored ?? (await fromNetwork().catch(() => null)) ?? (await fromStorage());
      return data?.edges?.length ? new RoadGraph(data) : null;
    })();
    loading.then((g) => {
      if (!g) loading = null;
    });
  }
  return loading;
}
