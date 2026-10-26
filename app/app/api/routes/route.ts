import { db } from "@/lib/db";
import { HIDDEN_ROUTES } from "@/lib/hidden";
import { handle, HttpError } from "@/lib/server/http";
import { ensureSchema } from "@/lib/server/maintenance";

export const dynamic = "force-dynamic";

// Túrák listája (az elrejtettek nélkül) és új túra felvétele.
export const GET = handle(async () => {
  const sql = db();
  await ensureSchema(sql); // az állandó túrák (pl. „253-as napi”) már az első betöltéskor látszódjanak
  return Response.json(await sql`select * from routes where id <> all(${HIDDEN_ROUTES}::text[]) order by id`);
});

export const POST = handle(async (req: Request) => {
  const { id, note } = await req.json();
  if (!String(id ?? "").trim()) throw new HttpError(400, "Hiányzó túraszám.");
  const sql = db();
  await sql`insert into routes(id, name, note) values (${id}, ${id + " túra"}, ${note ?? ""}) on conflict (id) do nothing`;
  return { ok: true };
});
