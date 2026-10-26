import { db } from "@/lib/db";
import { findAddress } from "@/lib/dupe";
import { handle, param } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Szerepel-e már ez a cím (bármelyik túrában)? ?address=…&except=<a szerkesztett cím azonosítója>
export const GET = handle(async (req: Request) => {
  const address = (param(req, "address") ?? "").trim();
  return { match: address ? await findAddress(db(), address, param(req, "except")) : null };
});
