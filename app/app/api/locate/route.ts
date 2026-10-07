import { findStreet, getIndex, loadAddresses, locateIn, norm, parseAddr, toks, type Found } from "@/lib/osm";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { addresses } = (await req.json()) as { addresses: string[] };
  try {
    const ix = await getIndex();
    if (!ix.streets.size) return Response.json({ error: "Nem érkezett utcaadat az OpenStreetMaptől" }, { status: 502 });
    // házszám-adatok csak azokra az utcákra, amelyekre kell és még nincs betöltve
    const wanted = new Set<string>();
    for (const a of addresses) {
      const { street, house } = parseAddr(a);
      const st = house ? findStreet(ix, toks(street)) : null;
      if (st && !ix.loaded.has(norm(st.name))) wanted.add(norm(st.name));
    }
    const houses = wanted.size ? await loadAddresses(ix, [...wanted], Date.now() + 22000) : true;
    const results: Record<string, Found | null> = {};
    for (const a of new Set(addresses)) results[a] = locateIn(ix, a);
    return Response.json({ results, houses });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
