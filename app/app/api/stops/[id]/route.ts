import { db } from "@/lib/db";
import { splitPapers, ensurePapers } from "@/lib/papers";
import { findAddress } from "@/lib/dupe";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lat, lon } = await req.json();
  const sql = db();
  await sql`update stops set lat = ${lat}, lon = ${lon} where id = ${id}::uuid`;
  return Response.json({ ok: true });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { address, name, note, papers: raw, lat, lon } = await req.json();
  const papers = splitPapers(raw).length ? splitPapers(raw) : ["Újság"];
  const sql = db();
  await ensurePapers(sql);
  const clash = await findAddress(sql, address, id);
  if (clash) return Response.json({ error: `Ez a cím már szerepel (${clash.route_id}. túra: ${clash.address}). Egy cím csak egyszer szerepelhet.`, match: clash }, { status: 409 });
  // cím változásakor a régi koordináta érvénytelen
  await sql`update stops set
      lat = case when ${lat ?? null}::float8 is not null then ${lat ?? null}::float8 when address = ${address} then lat else null end,
      lon = case when ${lon ?? null}::float8 is not null then ${lon ?? null}::float8 when address = ${address} then lon else null end,
      address = ${address}, name = ${name ?? ""}, note = ${note ?? ""}
    where id = ${id}::uuid`;
  await sql`delete from stop_papers where stop_id = ${id}::uuid and lower(btrim(paper)) <> all(${papers.map((p: string) => p.toLowerCase())}::text[])`;
  await sql`insert into stop_papers(stop_id, paper)
    select ${id}::uuid, x from unnest(${papers}::text[]) as x
    where lower(btrim(x)) not in (select lower(btrim(paper)) from stop_papers where stop_id = ${id}::uuid)
    on conflict do nothing`;
  return Response.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sql = db();
  await sql`delete from stops where id = ${id}::uuid`;
  return Response.json({ ok: true });
}
