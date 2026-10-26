import { db } from "@/lib/db";
import { handle } from "@/lib/server/http";
import { deleteStop, saveLocations, updateStop } from "@/lib/server/stops";

// Ugyanazok a műveletek, mint az /api/stops?id=… útvonalon, az azonosítóval az útvonalban.
type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  const { lat, lon } = await req.json();
  return saveLocations(db(), [{ id, lat, lon }]);
});

export const PUT = handle(async (req: Request, { params }: Ctx) =>
  updateStop(db(), (await params).id, await req.json()),
);

export const DELETE = handle(async (_req: Request, { params }: Ctx) => deleteStop(db(), (await params).id));
