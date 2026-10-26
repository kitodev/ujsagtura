import { db } from "@/lib/db";
import { handle } from "@/lib/server/http";

export const dynamic = "force-dynamic";

// Választólisták az űrlaphoz: ismert újságok (gyakoriság szerint), már felvett címek és nevek.
export const GET = handle(async () => {
  const sql = db();
  const [papers, addresses, names] = await Promise.all([
    sql`select paper from stop_papers where paper not like 'Újság%' group by paper order by count(*) desc, paper`,
    sql`select distinct address from stops order by address`,
    sql`select distinct name from stops where name <> '' order by name`,
  ]);
  return {
    papers: papers.map((x) => x.paper),
    addresses: addresses.map((x) => x.address),
    names: names.map((x) => x.name),
  };
});
