import { describe, expect, it } from "vitest";
import { addrKey, houseNumber, searchableAddress } from "@/lib/addr";
import { addDays, daysInclusive, isISODay, monthStart } from "@/lib/dates";
import { papersOrDefault, splitPapers } from "@/lib/papers";
import { parseOcrLine, parseScanText, toScanLine } from "@/lib/scan-text";

describe("splitPapers", () => {
  it("„+”, vessző, pontosvessző és sortörés mentén bont", () => {
    expect(splitPapers("PE + Magyar N + HVG + HVG BE + SPORT")).toEqual(["PE", "Magyar N", "HVG", "HVG BE", "SPORT"]);
    expect(splitPapers("Petőfi Népe, Nemzeti Sport;Vas\nHOT")).toEqual(["Petőfi Népe", "Nemzeti Sport", "Vas", "HOT"]);
  });
  it("kiszűri az ismétlődést és az üres részeket, több forrásból is", () => {
    expect(splitPapers(["PE + SPORT", "pe", " ", "VAS"])).toEqual(["PE", "SPORT", "VAS"]);
    expect(splitPapers("", null, undefined)).toEqual([]);
  });
  it("üres listánál általános „Újság”", () => {
    expect(papersOrDefault("")).toEqual(["Újság"]);
    expect(papersOrDefault(["PE"])).toEqual(["PE"]);
  });
});

describe("addrKey", () => {
  it.each([
    ["Kossuth utca 5.", "kossuth u. 5"],
    ["Kossuth Utca 5", "Kossuth utca 5."],
    ["Dr. Nagy Mór utca 38.", "dr nagy mór u 38"],
    ["Petőfi utca 5/A", "Petofi utca 5 a"],
    ["Bajai út 12", "Bajai ut 12."],
    ["Fő utca 3. (hátsó kapu)", "Fő utca 3"],
  ])("„%s” = „%s”", (a, b) => expect(addrKey(a)).toBe(addrKey(b)));
  it.each([
    ["Petőfi utca 5/A", "Petőfi utca 5/B"],
    ["Kossuth utca 5.", "Kossuth utca 15."],
    ["Kossuth tér 1", "Kossuth utca 1"],
  ])("„%s” ≠ „%s”", (a, b) => expect(addrKey(a)).not.toBe(addrKey(b)));
});

describe("searchableAddress / houseNumber", () => {
  it("megjegyzés és záró pont nélkül", () => {
    expect(searchableAddress("Fő utca 3. (hátsó kapu)")).toBe("Fő utca 3");
    expect(searchableAddress("Fő utca 3 – emelet")).toBe("Fő utca 3");
  });
  it("házszám a cím végéről", () => {
    expect(houseNumber("Kossuth utca 5/A.")).toBe("5/A");
    expect(houseNumber("Kossuth utca")).toBeNull();
  });
});

describe("dates", () => {
  it("napok léptetése hónap- és évhatáron át", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // óraátállítás
  });
  it("hónap eleje, napok száma, formátum", () => {
    expect(monthStart("2026-10-25")).toBe("2026-10-01");
    expect(daysInclusive("2026-10-19", "2026-10-25")).toBe(7);
    expect(isISODay("2026-10-25")).toBe(true);
    expect(isISODay("25.10.2026")).toBe(false);
  });
});

describe("scan-text", () => {
  it("felismert sor: cím | név | ismert újságok", () => {
    expect(parseOcrLine("Kossuth utca 5. Kiss Anna Petőfi Népe Blikk")).toBe(
      "Kossuth utca 5. | Kiss Anna | Petőfi Népe, Blikk",
    );
    expect(parseOcrLine("ab")).toBeNull();
  });
  it("oda-vissza: sor ↔ menthető adat", () => {
    const line = toScanLine({ address: "Fő utca 1", name: "Nagy | Béla", papers: ["PE", "VAS"], note: "" });
    expect(line).toBe("Fő utca 1 | Nagy / Béla | PE, VAS");
    expect(parseScanText(`${line}\n\n | x`, "253")).toEqual([
      { route_id: "253", address: "Fő utca 1", name: "Nagy / Béla", papers: ["PE", "VAS"], note: "" },
    ]);
  });
});

describe("addressGroup", () => {
  it("az önálló túra saját csoport, a többi közös", async () => {
    const { addressGroup } = await import("@/lib/fixed-routes");
    expect(addressGroup("253-napi")).toBe("route:253-napi");
    expect(addressGroup("253")).toBe("common");
    expect(addressGroup("255")).toBe(addressGroup(undefined));
  });
});
