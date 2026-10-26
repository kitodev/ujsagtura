import { db } from "@/lib/db";
import { setStatus } from "@/lib/server/deliveries";
import { handle } from "@/lib/server/http";

// Jelölés: { ids, day, status } – status = null a jelölés törlése.
export const PUT = handle(async (req: Request) => {
  const { ids, day, status } = await req.json();
  return setStatus(db(), ids, day, status);
});
