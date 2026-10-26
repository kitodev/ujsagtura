import { db } from "@/lib/db";
import { handle, HttpError } from "@/lib/server/http";
import { getRoadGraph } from "@/lib/server/roads";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Kiskunhalas úthálózata tömör formában, az offline útvonaltervezéshez (a telefon elmenti).
export const GET = handle(async () => {
  try {
    const graph = await getRoadGraph(db());
    return Response.json(graph, { headers: { "Cache-Control": "public, max-age=86400" } });
  } catch (e) {
    throw new HttpError(502, "Az úthálózat most nem tölthető le: " + (e instanceof Error ? e.message : String(e)));
  }
});
