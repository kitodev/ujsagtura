// Hálózati segédfüggvények (tiszta, tesztelhető): szervercím, időkorlátos letöltés.

/** A szerver címének egységesítése: https:// elé, a záró perjel le. */
export function normalizeBase(url: string): string {
  let s = url.trim().replace(/\/+$/, "");
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

/** Időtúllépés: hálózati hibának számít (TypeError), így a jelölés várólistára kerül. */
export class TimeoutError extends TypeError {
  constructor() {
    super("Időtúllépés");
  }
}

/**
 * fetch időkorláttal. (Az AbortSignal.timeout / AbortSignal.any nem minden telefonon van meg, ezért kézzel.)
 * Egy külső `signal` is megszakíthatja.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number,
  signal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (timedOut) throw new TimeoutError();
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Megszakított kérés (pl. újabb kérés indult helyette). */
export const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";
