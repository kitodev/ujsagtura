// Az Excelből beolvasott címek mentése: új cím csak akkor jön létre, ha még nem szerepel (minden túrát nézve);
// a meglévő címekhez legfeljebb új újságok kerülnek.
import { addrKey } from "@/lib/addr";
import { addressGroup } from "@/lib/fixed-routes";
import { addPapers } from "@/lib/dupe";
import { HIDDEN_ROUTES } from "@/lib/hidden";
import type { ImportStop } from "./excel-import";
import { ensureSchema } from "./maintenance";
import type { Sql } from "./sql";

/** Egy cím azonosítója a dupla címek csoportján belül. */
const groupKey = (routeId: string, address: string) => `${addressGroup(routeId)}|${addrKey(address)}`;

export type ImportResult = { added: number; merged: number; skipped: number; routes: string[] };

export async function importStops(
  sql: Sql,
  stops: ImportStop[],
  opts: { fallbackRoute: string; routeNote: string },
): Promise<ImportResult> {
  await ensureSchema(sql);
  const routes = [...new Set(stops.map((s) => s.route).filter(Boolean))];
  const result: ImportResult = { added: 0, merged: 0, skipped: 0, routes };

  const existingRows = (await sql`
    select id, route_id, address from stops where route_id <> all(${HIDDEN_ROUTES}::text[])`) as {
    id: string;
    route_id: string;
    address: string;
  }[];
  const existing = new Map(existingRows.map((x) => [groupKey(x.route_id, x.address), x.id]));

  for (const routeId of routes) {
    const note = routeId === opts.fallbackRoute ? opts.routeNote : "";
    await sql`insert into routes(id, name, note) values (${routeId}, ${routeId + " túra"}, ${note})
      on conflict (id) do nothing`;

    const inRoute = stops.filter((s) => s.route === routeId);
    for (const s of inRoute.filter((s) => existing.has(groupKey(routeId, s.address)))) {
      const fresh = await addPapers(sql, existing.get(groupKey(routeId, s.address))!, s.papers);
      if (fresh.length) result.merged++;
      else result.skipped++;
    }

    const fresh = inRoute.filter((s) => !existing.has(groupKey(routeId, s.address)));
    if (!fresh.length) continue;
    const [{ m: lastPos }] =
      await sql`select coalesce(max(position), 0)::int as m from stops where route_id = ${routeId}`;
    const inserted = (await sql`
      insert into stops(route_id, position, address, name, note)
      select ${routeId}, ${lastPos}::int + v.ord::int, v.a, v.n, v.o
      from unnest(${fresh.map((s) => s.address)}::text[], ${fresh.map((s) => s.name)}::text[],
                  ${fresh.map((s) => s.note)}::text[]) with ordinality as v(a, n, o, ord)
      returning id, position`) as { id: string; position: number }[];
    const idByPos = new Map(inserted.map((x) => [x.position, x.id]));

    const stopIds: string[] = [];
    const papers: string[] = [];
    fresh.forEach((s, i) => {
      const id = idByPos.get(lastPos + i + 1)!;
      for (const p of s.papers.length ? s.papers : ["Újság"]) {
        stopIds.push(id);
        papers.push(p);
      }
    });
    await sql`insert into stop_papers(stop_id, paper)
      select unnest(${stopIds}::uuid[]), unnest(${papers}::text[]) on conflict do nothing`;
    result.added += fresh.length;
  }
  return result;
}
