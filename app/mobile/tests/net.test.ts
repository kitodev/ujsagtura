import { afterEach, describe, expect, it, vi } from "vitest";
import { isNetworkError } from "@shared/outbox";
import { fetchWithTimeout, isAbort, NetworkError, normalizeBase, TimeoutError } from "@/lib/net";

describe("normalizeBase", () => {
  it("https:// elé, záró perjel nélkül", () => {
    expect(normalizeBase(" ujsagtura.vercel.app/ ")).toBe("https://ujsagtura.vercel.app");
    expect(normalizeBase("http://192.168.1.10:3000//")).toBe("http://192.168.1.10:3000");
    expect(normalizeBase("")).toBe("");
  });
});

describe("fetchWithTimeout", () => {
  afterEach(() => vi.unstubAllGlobals());

  const hanging = () =>
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          }),
        ),
    );

  it("„fetch failed: UnknownHostException” (nincs internet) hálózati hiba – a jelölés várólistára kerül", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.reject(
          new Error(
            'fetch failed: java.net.UnknownHostException: Unable to resolve host "ujsagtura.vercel.app": No address associated with hostname',
          ),
        ),
      ),
    );
    const err = await fetchWithTimeout("https://x", {}, 5000).catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(isNetworkError(err)).toBe(true);
    // a közös felismerés a csomagolás nélkül is
    expect(isNetworkError(new Error("fetch failed: java.net.UnknownHostException"))).toBe(true);
    expect(isNetworkError(new Error("HTTP 500"))).toBe(false);
  });

  it("időtúllépéskor hálózati hibát dob (a jelölés várólistára kerülhet)", async () => {
    vi.stubGlobal("fetch", hanging());
    const err = await fetchWithTimeout("https://x", {}, 20).catch((e) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect(isNetworkError(err)).toBe(true);
  });

  it("a külső megszakítás AbortError marad", async () => {
    vi.stubGlobal("fetch", hanging());
    const ctrl = new AbortController();
    const p = fetchWithTimeout("https://x", {}, 5000, ctrl.signal);
    ctrl.abort();
    const err = await p.catch((e) => e);
    expect(isAbort(err)).toBe(true);
    expect(isNetworkError(err)).toBe(false);
  });

  it("sikeres válasz átmegy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 200 })),
    );
    expect((await fetchWithTimeout("https://x", {}, 1000)).status).toBe(200);
  });
});
