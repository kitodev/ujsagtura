// Az összevont újságok („PE + SPORT + VAS”) szétszedése külön újságokra, hogy egyenként lehessen
// leadottnak / hiányzónak / lemondottnak jelölni őket.

/** Újságlista szétszedése: „+”, vessző, pontosvessző vagy sortörés választja el őket. Ismétlődéseket kiszűri. */
export function splitPapers(...src: (string | string[] | null | undefined)[]): string[] {
  const seen = new Set<string>(), out: string[] = [];
  for (const s of src.flat()) {
    for (const p of String(s ?? "").split(/[+,;\n]/)) {
      const x = p.replace(/\s+/g, " ").trim();
      if (x && !seen.has(x.toLowerCase())) { seen.add(x.toLowerCase()); out.push(x); }
    }
  }
  return out;
}

type Sql = ReturnType<typeof import("@/lib/db").db>;
let migrated = false;

/**
 * A már elmentett összevont tételek egyszeri szétbontása az adatbázisban.
 * Minden részújság külön sort kap; az eddigi jelölések (pl. „Leadva”) mindegyikre átkerülnek,
 * majd az összevont sor törlődik. Ha a cím már külön tartalmazza az adott újságot, azt nem duplázza.
 */
export async function splitCombinedPapers(sql: Sql) {
  if (migrated) return;
  const rows = (await sql`select id, stop_id, paper from stop_papers where paper ~ '[+,;]' order by ord`) as { id: string; stop_id: string; paper: string }[];
  for (const r of rows) {
    const parts = splitPapers(r.paper);
    if (!parts.length) continue;
    const have = new Set(((await sql`select paper from stop_papers where stop_id = ${r.stop_id}::uuid and id <> ${r.id}::uuid`) as { paper: string }[]).map((x) => x.paper.toLowerCase()));
    const add = parts.filter((p) => !have.has(p.toLowerCase()));
    for (const p of add) {
      const [{ id }] = (await sql`insert into stop_papers(stop_id, paper) values (${r.stop_id}::uuid, ${p}) returning id`) as { id: string }[];
      await sql`insert into deliveries(stop_paper_id, day, status, updated_at)
        select ${id}::uuid, day, status, updated_at from deliveries where stop_paper_id = ${r.id}::uuid
        on conflict do nothing`;
    }
    await sql`delete from stop_papers where id = ${r.id}::uuid`;
  }
  migrated = true;
}
