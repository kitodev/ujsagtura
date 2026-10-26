// Az adatbázis rendbetétele szerverindításonként egyszer (párhuzamos kérések ugyanazt a futást várják meg).
import { FIXED_ROUTES } from "@/lib/fixed-routes";
import { splitPapers } from "@/lib/papers";
import type { Sql } from "./sql";

let ready: Promise<void> | null = null;

/**
 * 1. „none” jelölés engedélyezése (a korábbi lemondás egy naptól megszűnt – lásd api/deliveries)
 * 2. duplikált újságok törlése (címenként ugyanaz az újság egyszer; a jelölések a megmaradóra kerülnek)
 * 3. adatbázis-szabály: egy címen ugyanaz az újság nem szerepelhet kétszer
 * 4. a régi összevont tételek („PE + SPORT + VAS”) szétbontása külön újságokra
 * 5. az állandó túrák (lib/fixed-routes.ts) létrehozása, ha még nincsenek
 */
export function ensureSchema(sql: Sql): Promise<void> {
  if (!ready) {
    ready = run(sql).catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

async function run(sql: Sql) {
  await sql`alter table deliveries drop constraint if exists deliveries_status_check`;
  await sql`alter table deliveries add constraint deliveries_status_check
    check (status in ('delivered','missing','cancelled','none'))`;
  await removeDuplicatePapers(sql);
  await sql`create unique index if not exists stop_papers_uniq on stop_papers (stop_id, lower(btrim(paper)))`;
  await splitCombinedPapers(sql);
  await createFixedRoutes(sql);
}

async function createFixedRoutes(sql: Sql) {
  for (const r of FIXED_ROUTES) {
    await sql`insert into routes(id, name, note) values (${r.id}, ${r.name}, ${r.note ?? ""}) on conflict (id) do nothing`;
  }
}

async function removeDuplicatePapers(sql: Sql) {
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

type Row = { id: string; stop_id: string; paper: string };

async function splitCombinedPapers(sql: Sql) {
  const rows = (await sql`select id, stop_id, paper from stop_papers where paper ~ '[+,;]' order by ord`) as Row[];
  for (const r of rows) {
    const parts = splitPapers(r.paper);
    if (!parts.length) continue;
    for (const p of parts) {
      // ha már van ilyen újság a címen, nem kerül be újra – a jelölést akkor is átvisszük rá
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
