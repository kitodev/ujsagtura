import { splitPapers } from "@/lib/papers";
import type { AddressMatch } from "@/lib/types";

const where = (m: AddressMatch) => `${m.route_id}. túra${m.name ? ` · ${m.name}` : ""}`;

/** Az új újságok, amelyek még nincsenek a meglévő címen. */
export const newPapersFor = (match: AddressMatch, papers: string) => {
  const have = new Set(match.papers.map((p) => p.toLowerCase()));
  return splitPapers(papers).filter((p) => !have.has(p.toLowerCase()));
};

/** Új cím felvételekor: a cím már szerepel, az új újságok hozzáadhatók. */
export function DuplicateWarning({ match, papers }: { match: AddressMatch; papers: string }) {
  const fresh = newPapersFor(match, papers);
  return (
    <div className="dupe" role="alert">
      ⚠ <b>Erre a címre már viszel ki újságot!</b>
      <br />
      {match.address} – {where(match)}
      <br />
      Jelenleg: {match.papers.join(", ") || "–"}
      <br />
      {fresh.length ? (
        <>
          Új cím nem jön létre, csak ezek kerülnek hozzá: <b>{fresh.join(", ")}</b>
        </>
      ) : (
        <>A kiválasztott újságok már mind rajta vannak ezen a címen – jelölj ki újat.</>
      )}
    </div>
  );
}

/** Szerkesztéskor: másik, már létező címre nem írható át. */
export function DuplicateBlock({ match }: { match: AddressMatch }) {
  return (
    <div className="dupe bad" role="alert">
      ⛔ Ez a cím már szerepel: <b>{match.address}</b> ({where(match)}). Egy cím csak egyszer szerepelhet – az újságokat
      annál a címnél add hozzá.
    </div>
  );
}
