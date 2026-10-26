import { db } from "@/lib/db";
import { handle, HttpError, param } from "@/lib/server/http";
import { createStop, deleteStop, listStops, saveLocations, saveOrder, updateStop } from "@/lib/server/stops";

export const dynamic = "force-dynamic";

// Címek: listázás (?route=&day=), felvétel, módosítás / törlés (?id=), koordináták és sorrend mentése.

export const GET = handle(async (req: Request) =>
  listStops(db(), param(req, "route") ?? "all", param(req, "day") ?? new Date().toLocaleDateString("sv-SE")),
);

export const POST = handle(async (req: Request) => createStop(db(), await req.json()));

export const PUT = handle(async (req: Request) => updateStop(db(), requireId(req), await req.json()));

export const DELETE = handle(async (req: Request) => deleteStop(db(), requireId(req)));

export const PATCH = handle(async (req: Request) => {
  const body = await req.json();
  const sql = db();
  if (Array.isArray(body.order)) return saveOrder(sql, body.order);
  if (Array.isArray(body.items)) return saveLocations(sql, body.items);
  return saveLocations(sql, [{ id: requireId(req), lat: body.lat, lon: body.lon }]);
});

function requireId(req: Request): string {
  const id = param(req, "id");
  if (!id) throw new HttpError(400, "Hiányzó azonosító.");
  return id;
}
