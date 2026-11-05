// Érthető hibaüzenet a szerverhívások hibáiból (mi a baj, és mit lehet tenni).
import { isNetworkError } from "@shared/outbox";

/** A szerver válaszhibája (HTTP-állapot és a válasz törzse). */
export class ApiError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(typeof body.error === "string" ? body.error : `HTTP ${status}`);
  }
}

/** Nem az Újságtúra API-ja válaszolt (pl. bejelentkező- vagy hibaoldal jött JSON helyett). */
export class NotApiError extends Error {
  constructor(public status: number) {
    super(`A szerver nem az Újságtúra adatait küldte (HTTP ${status}, weboldal jött).`);
  }
}

export class NoServerError extends Error {
  constructor() {
    super("Nincs beállítva a szerver címe (⋯ Több → ⚙ Beállítások).");
  }
}

/** Hibaüzenet a felhasználónak; `server`: a beállított szervercím. */
export function describeError(e: unknown, server: string): string {
  if (e instanceof NoServerError) return e.message;
  if (isNetworkError(e))
    return `Nem érem el a szervert (${server}). Nincs internet, vagy hibás a cím – ⋯ Több → ⚙ Beállítások.`;
  const status = e instanceof ApiError || e instanceof NotApiError ? e.status : 0;
  if (status === 401 || status === 403)
    return (
      `A szerver elutasította a hozzáférést (HTTP ${status}). Vercelen ez általában azt jelenti, hogy ` +
      "nem az éles címet adtad meg (hanem egy előnézetit), vagy be van kapcsolva a „Deployment Protection”."
    );
  if (status === 404) return `Ezen a címen nincs Újságtúra (HTTP 404): ${server} – ellenőrizd a címet.`;
  if (e instanceof NotApiError) return `${e.message} Ellenőrizd a szerver címét: ${server}`;
  if (e instanceof ApiError && status >= 500)
    return `A szerver hibát jelzett (HTTP ${status}): ${e.message}. Valószínűleg az adatbázis-kapcsolat (DATABASE_URL) hibás a szerveren.`;
  return `Hiba: ${e instanceof Error ? e.message : String(e)}`;
}
