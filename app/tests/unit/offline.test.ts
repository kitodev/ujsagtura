import { describe, expect, it, vi } from "vitest";
import { boundsOf, tilesFor, tilesWithinLimit, tileUrl } from "@/lib/offline-map";
import { Outbox, type Mark } from "@/lib/outbox";

describe("offline térkép", () => {
  const b = boundsOf([
    { lat: 46.43, lon: 19.48 },
    { lat: 46.44, lon: 19.49 },
  ])!;

  it("befoglaló téglalap ráhagyással", () => {
    expect(b.south).toBeCloseTo(46.426);
    expect(b.east).toBeCloseTo(19.494);
    expect(boundsOf([])).toBeNull();
  });

  it("a nagyobb nagyításon több térképrészlet kell", () => {
    const z16 = tilesFor(b, 16, 16).length;
    const z17 = tilesFor(b, 17, 17).length;
    expect(z17).toBeGreaterThan(z16 * 3);
    expect(tileUrl({ z: 17, x: 1, y: 2 })).toBe("https://tile.openstreetmap.org/17/1/2.png");
  });

  it("a korlát fölött kisebb a legnagyobb nagyítás", () => {
    expect(tilesWithinLimit(b, 100000).some((t) => t.z === 17)).toBe(true);
    const limited = tilesWithinLimit(b, 60);
    expect(limited.length).toBeLessThanOrEqual(60);
    expect(Math.max(...limited.map((t) => t.z))).toBeLessThan(17);
  });
});

describe("Outbox", () => {
  const memory = () => {
    let v: string | null = null;
    return { get: () => v, set: (x: string) => (v = x) };
  };
  const mark = (id: string): Mark => ({ ids: [id], day: "2026-10-26", status: "delivered" });
  const offline = () => Promise.reject(new TypeError("Failed to fetch"));

  it("internettel azonnal elküldi", async () => {
    const send = vi.fn().mockResolvedValue({});
    expect(await new Outbox(send, memory()).submit(mark("a"))).toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it("hálózati hibánál várólistára teszi, majd sorban elküldi", async () => {
    const send = vi.fn<(m: Mark) => Promise<unknown>>(offline);
    const box = new Outbox(send, memory());
    expect(await box.submit(mark("a"))).toBe(true);
    expect(await box.submit(mark("b"))).toBe(true); // a sorrend miatt az újat is mögé teszi
    expect(box.pending().map((m) => m.ids[0])).toEqual(["a", "b"]);

    expect(await box.flush()).toBe(2); // még mindig nincs internet

    const sent: string[] = [];
    send.mockImplementation(async (m: Mark) => void sent.push(m.ids[0]));
    expect(await box.flush()).toBe(0);
    expect(sent).toEqual(["a", "b"]);
    expect(box.pending()).toEqual([]);
  });

  it("a szerver elutasítását nem ismétli, a többit elküldi", async () => {
    const box = new Outbox(vi.fn(offline), memory());
    await box.submit(mark("bad"));
    await box.submit(mark("ok"));
    const send = vi.fn(async (m: Mark) => {
      if (m.ids[0] === "bad") throw new Error("404");
    });
    const box2 = new Outbox(send, { get: () => JSON.stringify(box.pending()), set: () => {} });
    expect(await box2.flush()).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("szerverhibát (nem hálózatit) továbbad", async () => {
    const box = new Outbox(() => Promise.reject(new Error("500")), memory());
    await expect(box.submit(mark("a"))).rejects.toThrow("500");
    expect(box.pending()).toEqual([]);
  });
});
