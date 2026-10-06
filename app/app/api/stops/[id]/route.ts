import { db } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lat, lon } = await req.json();
  const sql = db();
  await sql`update stops set lat = ${lat}, lon = ${lon} where id = ${id}::uuid`;
  return Response.json({ ok: true });
}
