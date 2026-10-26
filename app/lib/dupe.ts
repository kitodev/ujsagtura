// Dupla címek kiszűrése a szerveren: egy cím csoportonként csak egyszer szerepelhet
// (a közös csoport minden túrát együtt néz, az önálló túrák – lib/fixed-routes.ts – külön csoportot alkotnak).
import { addrKey } from "@/lib/addr";
import { addressGroup } from "@/lib/fixed-routes";
import { HIDDEN_ROUTES } from "@/lib/hidden";
import type { Sql } from "@/lib/server/sql";
import type { AddressMatch } from "@/lib/types";

type FindOptions = {
  /** A túra, amelybe a címet felvennék (ettől függ, mely címekkel ütközhet). */
  route?: string | null;
  /** A most szerkesztett cím azonosítója (önmagával nem ütközik). */
  except?: string | null;
};

/** A megadott címmel egyező, már felvett cím ugyanabban a csoportban (vagy null). */
export async function findAddress(sql: Sql, address: string, opts: FindOptions = {}): Promise<AddressMatch | null> {
  const key = addrKey(address);
  if (!key) return null;
  const group = addressGroup(opts.route);
  // az ideiglenesen elrejtett túrák címei nem számítanak (oda nem tennénk láthatatlanul újságot)
  const rows = (await sql`
    select id, route_id, address, name from stops
    where route_id <> all(${HIDDEN_ROUTES}::text[])`) as Omit<AddressMatch, "papers">[];
  const match = rows.find(
    (r) => r.id !== opts.except && addressGroup(r.route_id) === group && addrKey(r.address) === key,
  );
  if (!match) return null;
  const papers = (await sql`select paper from stop_papers where stop_id = ${match.id}::uuid order by ord`) as {
    paper: string;
  }[];
  return { ...match, papers: papers.map((p) => p.paper) };
}

/** Újságok hozzáadása egy meglévő címhez (a már rajta lévők nem duplázódnak). Visszaadja a ténylegesen újakat. */
export async function addPapers(sql: Sql, stopId: string, papers: string[]): Promise<string[]> {
  const rows = (await sql`select paper from stop_papers where stop_id = ${stopId}::uuid`) as { paper: string }[];
  const have = new Set(rows.map((p) => p.paper.trim().toLowerCase()));
  const fresh = papers.filter((p) => !have.has(p.trim().toLowerCase()));
  if (fresh.length) {
    await sql`insert into stop_papers(stop_id, paper)
      select ${stopId}::uuid, unnest(${fresh}::text[]) on conflict do nothing`;
  }
  return fresh;
}
