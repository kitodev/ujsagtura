// Kiskunhalas úthálózata az offline útvonaltervezéshez: egyszer letöltjük az OpenStreetMapből (Overpass),
// tömörítjük, és az adatbázisban tároljuk (30 napig nem töltjük újra).
import { OSM_BBOX, overpass } from "@/lib/osm";
import { buildCompactGraph, type CompactGraph, type OverpassWay } from "@/lib/road-graph";
import type { Sql } from "./sql";

const CACHE_KEY = "roads";
const FRESH_MS = 30 * 24 * 3600 * 1000;
const QUERY = `[out:json][timeout:60]; way["highway"]${OSM_BBOX}; out geom tags;`;

let memory: { at: number; graph: CompactGraph } | null = null;

async function cacheTable(sql: Sql) {
  await sql`create table if not exists osm_cache (key text primary key, data jsonb not null, t timestamptz default now())`;
}

/** Az úthálózat: memóriából, adatbázisból, vagy (ha régi / nincs) az Overpassról. */
export async function getRoadGraph(sql: Sql): Promise<CompactGraph> {
  if (memory && Date.now() - memory.at < FRESH_MS) return memory.graph;
  await cacheTable(sql);
  const [stored] = (await sql`select data, t from osm_cache where key = ${CACHE_KEY}`) as {
    data: CompactGraph;
    t: string;
  }[];
  if (stored && Date.now() - new Date(stored.t).getTime() < FRESH_MS) {
    memory = { at: new Date(stored.t).getTime(), graph: stored.data };
    return stored.data;
  }
  try {
    const graph = buildCompactGraph(await overpass<OverpassWay>(QUERY, 60_000, Date.now() + 90_000));
    if (graph.edges.length) {
      await sql`insert into osm_cache(key, data) values (${CACHE_KEY}, ${JSON.stringify(graph)}::jsonb)
        on conflict (key) do update set data = excluded.data, t = now()`;
      memory = { at: Date.now(), graph };
    }
    return graph;
  } catch (e) {
    if (stored) return stored.data; // régi úthálózat jobb, mint a semmi
    throw e;
  }
}
