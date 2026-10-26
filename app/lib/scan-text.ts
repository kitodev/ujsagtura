// A beolvasott (fotóról felismert vagy Excelből betöltött) címlista szöveges formája:
// soronként „cím | név | újságok | megjegyzés”. Ezt a felhasználó még javíthatja mentés előtt.
import { papersOrDefault } from "./papers";

/** Ismert újságnevek, amelyeket a felismert sorból kiemelünk (a hosszabbak előre, hogy ne darabolódjanak). */
export const KNOWN_PAPERS = [
  "Vas. Nemzeti Sport",
  "Vasárnap Reggel",
  "Petőfi Népe",
  "Magyar Nemzet",
  "Nemzeti Sport",
  "10 SzerencseMix",
  "Vidék Íze",
  "Lakáskultúra",
  "Autó-Motor",
  "Autó Motor",
  "Szabad Föld",
  "SZAKMa",
  "Fanny",
  "Blikk",
  "HVG",
  "Hot!",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Egy felismert sor → „cím | név | újságok” (vagy null, ha túl rövid). */
export function parseOcrLine(raw: string): string | null {
  let rest = raw.replace(/\s+/g, " ").trim();
  if (rest.length < 4) return null;
  const papers: string[] = [];
  for (const p of KNOWN_PAPERS) {
    const re = new RegExp(escapeRe(p), "i");
    if (re.test(rest)) {
      papers.push(p);
      rest = rest.replace(re, " ");
    }
  }
  rest = rest.replace(/\s+/g, " ").trim();
  // cím = szöveg + házszám az elején, utána a név
  const m = rest.match(/^(\D+?\s\d+[/\-\w]*\.?)\s*(.*)$/);
  return `${m ? m[1] : rest} | ${m ? m[2] : ""} | ${papers.join(", ")}`;
}

const cleanField = (x: string) => x.replace(/\|/g, "/").replace(/\s+/g, " ").trim();

/** Egy cím szöveges sora (a záró üres mezők nélkül). */
export function toScanLine(x: { address: string; name: string; papers: string[]; note: string }): string {
  const fields = [x.address, x.name, x.papers.join(", "), x.note].map(cleanField);
  while (fields.length > 1 && !fields[fields.length - 1]) fields.pop();
  return fields.join(" | ");
}

export type ScanRow = { route_id: string; address: string; name: string; papers: string[]; note: string };

/** A szövegmező tartalma → menthető sorok (üres cím nélküli sorok kimaradnak). */
export function parseScanText(text: string, routeId: string): ScanRow[] {
  return text.split("\n").flatMap((line) => {
    const [address, name, papers, note] = line.split("|").map((x) => x.trim());
    if (!address) return [];
    return [{ route_id: routeId, address, name: name ?? "", papers: papersOrDefault(papers), note: note ?? "" }];
  });
}
