// Jelölések mentése.
import type { Status } from "@/lib/types";
import { ensureSchema } from "./maintenance";
import type { Sql } from "./sql";

/**
 * Jelölés beállítása (status = null: törlés) egy napra.
 * A „Lemondva” a beállítás napjától érvényes, amíg egy későbbi napon át nem állítják. Ha egy napon a jelölést
 * törlik, de egy korábbi lemondás öröklődne, egy „none” sor kerül be: ettől a naptól nincs lemondva.
 */
export async function setStatus(sql: Sql, ids: string[], day: string, status: Status | null) {
  await ensureSchema(sql);
  if (status) {
    await sql`
      insert into deliveries(stop_paper_id, day, status)
      select unnest(${ids}::uuid[]), ${day}::date, ${status}
      on conflict (stop_paper_id, day) do update set status = excluded.status, updated_at = now()`;
    return { ok: true };
  }
  await sql`delete from deliveries where stop_paper_id = any(${ids}::uuid[]) and day = ${day}::date`;
  await sql`
    insert into deliveries(stop_paper_id, day, status)
    select i, ${day}::date, 'none' from unnest(${ids}::uuid[]) as i
    where (select x.status from deliveries x
           where x.stop_paper_id = i and x.day < ${day}::date order by x.day desc limit 1) = 'cancelled'
    on conflict (stop_paper_id, day) do update set status = 'none', updated_at = now()`;
  return { ok: true };
}
