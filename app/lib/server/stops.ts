// Címek (megállók) adatbázis-műveletei.
import { addPapers, findAddress } from "@/lib/dupe";
import { HIDDEN_ROUTES } from "@/lib/hidden";
import { papersOrDefault } from "@/lib/papers";
import type { Deliveries, Status, StopsResponse } from "@/lib/types";
import { HttpError } from "./http";
import { ensureSchema } from "./maintenance";
import type { Sql } from "./sql";

type StopInput = {
  address: string;
  name?: string;
  note?: string;
  papers?: unknown;
  lat?: number | null;
  lon?: number | null;
};

/**
 * Egy túra (vagy route = "all": minden túra) címei és az adott napi jelölések.
 * Ha aznapra nincs jelölés, a „Lemondva” egy korábbi napról öröklődik, amíg át nem állítják
 * (egy „none” sor jelzi, hogy egy adott naptól a lemondás megszűnt).
 */
export async function listStops(sql: Sql, route: string, day: string): Promise<StopsResponse> {
  await ensureSchema(sql);
  const stops = await sql`
    select s.id, s.route_id, s.position, s.address, s.name, s.note, s.lat, s.lon,
      coalesce(json_agg(json_build_object('id', p.id, 'paper', p.paper) order by p.ord)
        filter (where p.id is not null), '[]') as stop_papers
    from stops s left join stop_papers p on p.stop_id = s.id
    where (${route}::text = 'all' or s.route_id = ${route}::text) and s.route_id <> all(${HIDDEN_ROUTES}::text[])
    group by s.id order by s.route_id, s.position`;
  const marks = (await sql`
    select p.id as stop_paper_id,
      case when d.day = ${day}::date then nullif(d.status, 'none')
           when d.status = 'cancelled' then 'cancelled' end as status,
      case when d.day < ${day}::date and d.status = 'cancelled' then to_char(d.day, 'YYYY-MM-DD') end as since
    from stop_papers p join stops s on s.id = p.stop_id
    join lateral (
      select x.status, x.day from deliveries x
      where x.stop_paper_id = p.id and x.day <= ${day}::date order by x.day desc limit 1
    ) d on true
    where (${route}::text = 'all' or s.route_id = ${route}::text) and s.route_id <> all(${HIDDEN_ROUTES}::text[])`) as {
    stop_paper_id: string;
    status: Status | null;
    since: string | null;
  }[];
  const deliveries: Deliveries = {};
  const since: Record<string, string> = {};
  for (const m of marks) {
    if (!m.status) continue;
    deliveries[m.stop_paper_id] = m.status;
    if (m.since) since[m.stop_paper_id] = m.since;
  }
  return { stops: stops as StopsResponse["stops"], deliveries, since };
}

/**
 * Új cím felvétele. Egy cím csak egyszer szerepelhet: ha már megvan, 409-es hibát ad,
 * kivéve ha `merge` – ilyenkor csak az új újságokat adja a meglévő címhez.
 */
export async function createStop(sql: Sql, input: StopInput & { route_id: string; merge?: boolean }) {
  const { route_id, address, name = "", note = "", lat = null, lon = null, merge } = input;
  if (!route_id || !String(address ?? "").trim()) throw new HttpError(400, "Hiányzó túra vagy cím.");
  const papers = papersOrDefault(input.papers);
  await ensureSchema(sql);

  const match = await findAddress(sql, address);
  if (match) {
    if (!merge) throw new HttpError(409, "Erre a címre már viszel ki újságot.", { match });
    const added = await addPapers(sql, match.id, papers);
    if (note.trim()) {
      await sql`update stops set note = case
          when note = '' then ${note}
          when position(${note} in note) > 0 then note
          else note || ' · ' || ${note} end
        where id = ${match.id}::uuid`;
    }
    if (name.trim()) await sql`update stops set name = ${name} where id = ${match.id}::uuid and name = ''`;
    return { ok: true, merged: true, match, added };
  }

  const [{ id }] = await sql`
    insert into stops(route_id, position, address, name, note, lat, lon)
    values (${route_id}, coalesce((select max(position) from stops where route_id = ${route_id}), 0) + 1,
            ${address}, ${name}, ${note}, ${lat}::float8, ${lon}::float8)
    returning id`;
  await sql`insert into stop_papers(stop_id, paper)
    select ${id}::uuid, unnest(${papers}::text[]) on conflict do nothing`;
  return { ok: true };
}

/** Cím módosítása. Másik, már létező címre nem írható át (409). */
export async function updateStop(sql: Sql, id: string, input: StopInput) {
  const { address, name = "", note = "", lat = null, lon = null } = input;
  const papers = papersOrDefault(input.papers);
  await ensureSchema(sql);

  const clash = await findAddress(sql, address, id);
  if (clash) {
    throw new HttpError(
      409,
      `Ez a cím már szerepel (${clash.route_id}. túra: ${clash.address}). Egy cím csak egyszer szerepelhet.`,
      { match: clash },
    );
  }
  // cím változásakor a régi koordináta érvénytelen
  await sql`update stops set
      lat = case when ${lat}::float8 is not null then ${lat}::float8 when address = ${address} then lat else null end,
      lon = case when ${lon}::float8 is not null then ${lon}::float8 when address = ${address} then lon else null end,
      address = ${address}, name = ${name}, note = ${note}
    where id = ${id}::uuid`;
  const keys = papers.map((p) => p.toLowerCase());
  await sql`delete from stop_papers where stop_id = ${id}::uuid and lower(btrim(paper)) <> all(${keys}::text[])`;
  await sql`insert into stop_papers(stop_id, paper)
    select ${id}::uuid, x from unnest(${papers}::text[]) as x
    where lower(btrim(x)) not in (select lower(btrim(paper)) from stop_papers where stop_id = ${id}::uuid)
    on conflict do nothing`;
  return { ok: true };
}

export async function deleteStop(sql: Sql, id: string) {
  await sql`delete from stops where id = ${id}::uuid`;
  return { ok: true };
}

/** Több cím koordinátájának mentése egyszerre. */
export async function saveLocations(sql: Sql, items: { id: string; lat: number; lon: number }[]) {
  if (!items.length) return { ok: true };
  await sql`update stops s set lat = v.lat, lon = v.lon
    from (select unnest(${items.map((x) => x.id)}::uuid[]) as id,
                 unnest(${items.map((x) => x.lat)}::float8[]) as lat,
                 unnest(${items.map((x) => x.lon)}::float8[]) as lon) v
    where s.id = v.id`;
  return { ok: true };
}

/** A címek sorrendjének mentése (az azonosítók sorrendjében). */
export async function saveOrder(sql: Sql, order: string[]) {
  if (!order.length) return { ok: true };
  await sql`update stops s set position = v.position::int
    from unnest(${order}::uuid[]) with ordinality as v(id, position)
    where s.id = v.id`;
  return { ok: true };
}
