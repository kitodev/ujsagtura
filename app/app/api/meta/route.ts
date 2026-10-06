import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

// Választólisták az űrlaphoz: ismert újságok, már felvett címek és nevek
export async function GET() {
  const sql = db();
  const [p, a, n] = await Promise.all([
    sql`select paper from stop_papers where paper not like 'Újság%' group by paper order by count(*) desc, paper`,
    sql`select distinct address from stops order by address`,
    sql`select distinct name from stops where name <> '' order by name`,
  ]);
  return Response.json({ papers: p.map((x) => x.paper), addresses: a.map((x) => x.address), names: n.map((x) => x.name) });
}
