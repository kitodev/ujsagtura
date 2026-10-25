import { db } from "@/lib/db";
import { findAddress } from "@/lib/dupe";
export const dynamic = "force-dynamic";

// Szerepel-e már ez a cím (bármelyik túrában)? ?address=...&except=<szerkesztett cím azonosítója>
export async function GET(req: Request) {
  const u = new URL(req.url);
  const address = (u.searchParams.get("address") ?? "").trim();
  if (!address) return Response.json({ match: null });
  return Response.json({ match: await findAddress(db(), address, u.searchParams.get("except")) });
}
