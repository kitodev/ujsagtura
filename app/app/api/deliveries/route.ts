import { db } from "@/lib/db";

// status = null -> a jelölés törlése
export async function PUT(req: Request) {
  const { ids, day, status } = await req.json();
  const sql = db();
  if (status) {
    await sql`
      insert into deliveries(stop_paper_id, day, status)
      select unnest(${ids}::uuid[]), ${day}::date, ${status}
      on conflict (stop_paper_id, day) do update set status = excluded.status, updated_at = now()`;
  } else {
    await sql`delete from deliveries where stop_paper_id = any(${ids}::uuid[]) and day = ${day}::date`;
  }
  return Response.json({ ok: true });
}
