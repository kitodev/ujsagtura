// Az adatbázis-kapcsolat típusa a szerveroldali segédfüggvényekhez.
import type { db } from "@/lib/db";

export type Sql = ReturnType<typeof db>;
