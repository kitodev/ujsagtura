// Hálózati segédfüggvények (tiszta, tesztelhető): szervercím, időkorlátos letöltés.

/** A szerver címének egységesítése: https:// elé, a záró perjel le. */
export function normalizeBase(url: string): string {
  let s = url.trim().replace(/\/+$/, "");
  if (s && !/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

/**
 * Hálózati hiba (nincs internet, nem található a szerver, megszakadt kapcsolat).
 * TypeError, így a közös `isNetworkError` felismeri, és a jelölés várólistára kerül.
 * (Az újabb React Native a fetch hibáját nem mindig TypeError-ként dobja, hanem pl. „fetch failed:
 * java.net.UnknownHostException …” üzenetű sima Error-ként – ezért csomagoljuk át.)
 */
export class NetworkError extends TypeError {
  constructor(message = "Nincs hálózat") {
    super(message);
    this.name = "NetworkError";
  }
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
    if (isAbort(e) || ctrl.signal.aborted) throw e;
    // maga a fetch hiúsult meg (nem a szerver válaszolt hibával): ez mindig hálózati hiba
    throw new NetworkError(e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Megszakított kérés (pl. újabb kérés indult helyette). */
export const isAbort = (e: unknown) => e instanceof Error && e.name === "AbortError";
