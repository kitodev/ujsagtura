import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const route = u.searchParams.get("route"), day = u.searchParams.get("day");
  const sql = db();
  const stops = await sql`
    select s.id, s.position, s.address, s.name, s.note, s.lat, s.lon,
      coalesce(json_agg(json_build_object('id', p.id, 'paper', p.paper) order by p.ord) filter (where p.id is not null), '[]') as stop_papers
    from stops s left join stop_papers p on p.stop_id = s.id
    where s.route_id = ${route} group by s.id order by s.position`;
  const del = await sql`
    select d.stop_paper_id, d.status from deliveries d
    join stop_papers p on p.id = d.stop_paper_id join stops s on s.id = p.stop_id
    where s.route_id = ${route} and d.day = ${day}::date`;
  return Response.json({ stops, deliveries: Object.fromEntries(del.map((x) => [x.stop_paper_id, x.status])) });
}
export async function POST(req: Request) {
  const { route_id, address, name, note, papers } = await req.json();
  const sql = db();
  const [{ id }] = await sql`
    insert into stops(route_id, position, address, name, note)
    values (${route_id}, coalesce((select max(position) from stops where route_id = ${route_id}), 0) + 1, ${address}, ${name ?? ""}, ${note ?? ""})
    returning id`;
  await sql`insert into stop_papers(stop_id, paper) select ${id}::uuid, unnest(${papers}::text[])`;
  return Response.json({ ok: true });
}
