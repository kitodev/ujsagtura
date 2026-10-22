import { db } from "@/lib/db";
import { HIDDEN_ROUTES } from "@/lib/hidden";
export const dynamic = "force-dynamic";

export async function GET() {
  const sql = db();
  return Response.json(await sql`select * from routes where id <> all(${HIDDEN_ROUTES}::text[]) order by id`);
}
export async function POST(req: Request) {
  const { id, note } = await req.json();
  const sql = db();
  await sql`insert into routes(id, name, note) values (${id}, ${id + " túra"}, ${note ?? ""}) on conflict (id) do nothing`;
  return Response.json({ ok: true });
}
