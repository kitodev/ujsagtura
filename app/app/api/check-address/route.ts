import { db } from "@/lib/db";
import { findAddress } from "@/lib/dupe";
import { handle, param } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Szerepel-e már ez a cím? ?address=…&route=<a túra, amelybe kerülne>&except=<a szerkesztett cím azonosítója>
export const GET = handle(async (req: Request) => {
  const address = (param(req, "address") ?? "").trim();
  return {
    match: address
      ? await findAddress(db(), address, { route: param(req, "route"), except: param(req, "except") })
      : null,
  };
});
