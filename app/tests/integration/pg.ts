// Valódi PostgreSQL a szerveroldali tesztekhez (TEST_DATABASE_URL). A Neon kliens helyett a `pg` csomagot
// használjuk ugyanazzal a „tagged template” felülettel, amit a kód a `db()`-től vár.
import { readFileSync } from "node:fs";
import pg from "pg";

export const TEST_DB = process.env.TEST_DATABASE_URL;

let pool: pg.Pool | null = null;
const getPool = () => (pool ??= new pg.Pool({ connectionString: TEST_DB }));

/** `sql\`select … ${x}\`` → paraméterezett lekérdezés. */
export const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
  const text = strings.reduce((q, part, i) => q + part + (i < values.length ? `$${i + 1}` : ""), "");
  return (await getPool().query(text, values)).rows;
};

/** Üres adatbázis a db/schema.sql szerint, két túrával. */
export async function resetDatabase() {
  await getPool().query("drop table if exists deliveries, stop_papers, stops, routes, osm_cache cascade");
  await getPool().query(readFileSync("db/schema.sql", "utf8"));
  await getPool().query("insert into routes(id, name, note) values ('253', '253 túra', ''), ('255', '255 túra', '')");
}

export async function closeDatabase() {
  await pool?.end();
  pool = null;
}
