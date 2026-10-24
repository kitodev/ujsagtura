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
let ready: Promise<void> | null = null;

/**
 * Az újságtételek rendbetétele, szerverindításonként egyszer. Párhuzamos kérések ugyanazt a futást várják meg
 * (korábban két egyszerre érkező kérés kétszer bontotta szét ugyanazt → duplikált újságok).
 *  1. duplikátumok törlése (címenként ugyanaz az újság csak egyszer; a jelölések a megmaradóra kerülnek)
 *  2. adatbázis-szabály: egy címen ugyanaz az újság nem szerepelhet kétszer
 *  3. a régi „PE + SPORT + VAS” jellegű tételek szétbontása
 */
export function ensurePapers(sql: Sql): Promise<void> {
  if (!ready) ready = run(sql).catch((e) => { ready = null; throw e; });
  return ready;
}

async function run(sql: Sql) {
  await removeDuplicates(sql);
  await sql`create unique index if not exists stop_papers_uniq on stop_papers (stop_id, lower(btrim(paper)))`;
  const rows = (await sql`select id, stop_id, paper from stop_papers where paper ~ '[+,;]' order by ord`) as { id: string; stop_id: string; paper: string }[];
  for (const r of rows) {
    const parts = splitPapers(r.paper);
    if (!parts.length) continue;
    for (const p of parts) {
      // ha már van ilyen újság a címen, nem kerül be újra (on conflict) – a jelölést akkor is átvisszük rá
      await sql`insert into stop_papers(stop_id, paper) values (${r.stop_id}::uuid, ${p}) on conflict do nothing`;
      await sql`insert into deliveries(stop_paper_id, day, status, updated_at)
        select sp.id, d.day, d.status, d.updated_at from deliveries d
        join stop_papers sp on sp.stop_id = ${r.stop_id}::uuid and lower(btrim(sp.paper)) = lower(btrim(${p}))
        where d.stop_paper_id = ${r.id}::uuid
        on conflict do nothing`;
    }
    await sql`delete from stop_papers where id = ${r.id}::uuid`;
  }
}

async function removeDuplicates(sql: Sql) {
  // címenként és újságonként a legelső tétel marad meg
  await sql`insert into deliveries(stop_paper_id, day, status, updated_at)
    select x.keep, d.day, d.status, d.updated_at from deliveries d
    join (select id, first_value(id) over (partition by stop_id, lower(btrim(paper)) order by ord) as keep from stop_papers) x
      on x.id = d.stop_paper_id and x.id <> x.keep
    on conflict do nothing`;
  await sql`delete from stop_papers where id in (
    select id from (select id, first_value(id) over (partition by stop_id, lower(btrim(paper)) order by ord) as keep from stop_papers) x
    where x.id <> x.keep)`;
}
