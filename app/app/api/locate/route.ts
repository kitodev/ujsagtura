import { getIndex, locateIn, type Found } from "@/lib/osm";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { addresses } = (await req.json()) as { addresses: string[] };
  try {
    const ix = await getIndex();
    if (!ix.streets.size) return Response.json({ error: "Nem érkezett utcaadat az OpenStreetMaptől" }, { status: 502 });
    const results: Record<string, Found | null> = {};
    for (const a of new Set(addresses)) results[a] = locateIn(ix, a);
    return Response.json({ results });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
