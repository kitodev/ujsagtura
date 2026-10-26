// Újságlisták kezelése (kliens és szerver).

/**
 * Újságlista szétszedése külön újságokra: „+”, vessző, pontosvessző vagy sortörés választja el őket.
 * A szóközöket rendbe teszi, az ismétlődéseket (kis-/nagybetűtől függetlenül) kiszűri.
 * Pl. „PE + SPORT, Vas” → ["PE", "SPORT", "Vas"].
 */
export function splitPapers(...src: (string | string[] | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of src.flat()) {
    for (const part of String(s ?? "").split(/[+,;\n]/)) {
      const paper = part.replace(/\s+/g, " ").trim();
      const key = paper.toLowerCase();
      if (paper && !seen.has(key)) {
        seen.add(key);
        out.push(paper);
      }
    }
  }
  return out;
}

/** Újságlista mentéshez: ha üres, egy általános „Újság” tétel. */
export const papersOrDefault = (raw: unknown): string[] => {
  const list = splitPapers(raw as string | string[]);
  return list.length ? list : ["Újság"];
};
