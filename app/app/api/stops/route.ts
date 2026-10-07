import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const route = u.searchParams.get("route"), day = u.searchParams.get("day");
  const sql = db();
  const stops = await sql`
    select s.id, s.route_id, s.position, s.address, s.name, s.note, s.lat, s.lon,
      coalesce(json_agg(json_build_object('id', p.id, 'paper', p.paper) order by p.ord) filter (where p.id is not null), '[]') as stop_papers
    from stops s left join stop_papers p on p.stop_id = s.id
    where (${route}::text = 'all' or s.route_id = ${route}::text) group by s.id order by s.route_id, s.position`;
  const del = await sql`
    select d.stop_paper_id, d.status from deliveries d
    join stop_papers p on p.id = d.stop_paper_id join stops s on s.id = p.stop_id
    where (${route}::text = 'all' or s.route_id = ${route}::text) and d.day = ${day}::date`;
  return Response.json({ stops, deliveries: Object.fromEntries(del.map((x) => [x.stop_paper_id, x.status])) });
}
export async function POST(req: Request) {
  const { route_id, address, name, note, papers, lat, lon } = await req.json();
  const sql = db();
  const [{ id }] = await sql`
    insert into stops(route_id, position, address, name, note, lat, lon)
    values (${route_id}, coalesce((select max(position) from stops where route_id = ${route_id}), 0) + 1, ${address}, ${name ?? ""}, ${note ?? ""}, ${lat ?? null}::float8, ${lon ?? null}::float8)
    returning id`;
  await sql`insert into stop_papers(stop_id, paper) select ${id}::uuid, unnest(${papers}::text[])`;
  return Response.json({ ok: true });
}

// Módosítás / törlés: az azonosító a ?id=... paraméterben érkezik (nincs külön [id] mappa)
const idOf = (req: Request) => new URL(req.url).searchParams.get("id");

export async function PATCH(req: Request) {
  const body = await req.json();
  const sql = db();
  if (Array.isArray(body.items)) {
    // több cím koordinátájának egyszerre történő mentése
    const items = body.items as { id: string; lat: number; lon: number }[];
    await sql`update stops s set lat = v.lat, lon = v.lon
      from (select unnest(${items.map((x) => x.id)}::uuid[]) as id, unnest(${items.map((x) => x.lat)}::float8[]) as lat, unnest(${items.map((x) => x.lon)}::float8[]) as lon) v
      where s.id = v.id`;
  } else {
    await sql`update stops set lat = ${body.lat}, lon = ${body.lon} where id = ${idOf(req)}::uuid`;
  }
  return Response.json({ ok: true });
}

export async function PUT(req: Request) {
  const id = idOf(req);
  const { address, name, note, papers, lat, lon } = await req.json();
  const sql = db();
  // cím változásakor a régi koordináta érvénytelen
  await sql`update stops set
      lat = case when ${lat ?? null}::float8 is not null then ${lat ?? null}::float8 when address = ${address} then lat else null end,
      lon = case when ${lon ?? null}::float8 is not null then ${lon ?? null}::float8 when address = ${address} then lon else null end,
      address = ${address}, name = ${name ?? ""}, note = ${note ?? ""}
    where id = ${id}::uuid`;
  await sql`delete from stop_papers where stop_id = ${id}::uuid and paper <> all(${papers}::text[])`;
  await sql`insert into stop_papers(stop_id, paper)
    select ${id}::uuid, x from unnest(${papers}::text[]) as x
    where x not in (select paper from stop_papers where stop_id = ${id}::uuid)`;
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const id = idOf(req);
  const sql = db();
  await sql`delete from stops where id = ${id}::uuid`;
  return Response.json({ ok: true });
}
