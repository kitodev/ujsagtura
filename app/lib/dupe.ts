// Dupla címek kiszűrése a szerveren: egy cím (minden túrát együtt nézve) csak egyszer szerepelhet.
import { addrKey } from "@/lib/addr";
import { HIDDEN_ROUTES } from "@/lib/hidden";
type Sql = ReturnType<typeof import("@/lib/db").db>;
export type Match = { id: string; route_id: string; address: string; name: string; papers: string[] };

/** A megadott címmel egyező, már felvett cím (vagy null). `except`: a most szerkesztett cím azonosítója. */
export async function findAddress(sql: Sql, address: string, except?: string | null): Promise<Match | null> {
  const k = addrKey(address);
  if (!k) return null;
  // az ideiglenesen elrejtett túrák címei nem számítanak (oda nem tennénk láthatatlanul újságot)
  const rows = (await sql`select id, route_id, address, name from stops where route_id <> all(${HIDDEN_ROUTES}::text[])`) as Omit<Match, "papers">[];
  const m = rows.find((r) => r.id !== except && addrKey(r.address) === k);
  if (!m) return null;
  const ps = (await sql`select paper from stop_papers where stop_id = ${m.id}::uuid order by ord`) as { paper: string }[];
  return { ...m, papers: ps.map((p) => p.paper) };
}

/** Újságok hozzáadása egy meglévő címhez (a már rajta lévők nem duplázódnak). Visszaadja a ténylegesen újakat. */
export async function addPapers(sql: Sql, stopId: string, papers: string[]): Promise<string[]> {
  const have = new Set(((await sql`select paper from stop_papers where stop_id = ${stopId}::uuid`) as { paper: string }[]).map((p) => p.paper.trim().toLowerCase()));
  const fresh = papers.filter((p) => !have.has(p.trim().toLowerCase()));
  if (fresh.length) await sql`insert into stop_papers(stop_id, paper) select ${stopId}::uuid, unnest(${fresh}::text[]) on conflict do nothing`;
  return fresh;
}
