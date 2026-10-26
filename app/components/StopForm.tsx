"use client";
// Cím / név / újságok / megjegyzés űrlap. A cím beírható és a javaslatokból választható is (elgépelés ellen).
import { useEffect, useState } from "react";
import { splitPapers } from "@/lib/papers";
import type { Meta } from "@/lib/types";

export type StopFields = {
  address: string;
  name: string;
  /** Újságok vesszővel elválasztva. */
  papers: string;
  note: string;
  /** A választott javaslat helye (ha van). */
  lat: number | null;
  lon: number | null;
};

export const emptyStopFields: StopFields = { address: "", name: "", papers: "", note: "", lat: null, lon: null };

type Suggestion = { label: string; lat?: number; lon?: number; own?: boolean; approx?: boolean };
type OsmHit = { lat: string; lon: string; address?: { road?: string; house_number?: string } };

const MIN_QUERY = 3;
const MAX_OWN = 4;
const OSM_DEBOUNCE_MS = 700;

/** Javaslatok: a már felvett címek, majd az OpenStreetMap találatai Kiskunhalason. */
function useAddressSuggestions(query: string, open: boolean, known: string[]) {
  const [items, setItems] = useState<Suggestion[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < MIN_QUERY) {
      setItems([]);
      return;
    }
    const own: Suggestion[] = known
      .filter((a) => a.toLowerCase().includes(q.toLowerCase()))
      .slice(0, MAX_OWN)
      .map((label) => ({ label, own: true }));
    setItems(own);
    const typedHouse = q.match(/\s(\d[\w/-]*)\.?$/)?.[1];
    const timer = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=hu&q=${encodeURIComponent(q + ", Kiskunhalas")}`;
        const hits: OsmHit[] = await (await fetch(url)).json();
        const osm = hits
          .filter((x) => x.address?.road && JSON.stringify(x.address).includes("Kiskunhalas"))
          .map((x): Suggestion => {
            // a beírt házszám megmarad akkor is, ha a térképen nincs külön házszámos találat
            const house = x.address!.house_number ?? typedHouse;
            return {
              label: `${x.address!.road}${house ? " " + house : ""}`,
              lat: +x.lat,
              lon: +x.lon,
              approx: !x.address!.house_number && !!typedHouse,
            };
          });
        setItems([...own, ...osm.filter((o) => !own.some((w) => w.label === o.label))]);
      } catch {
        /* javaslat nélkül is használható */
      }
    }, OSM_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open, known]);
  return items;
}

const suggestionHint = (s: Suggestion) =>
  s.own ? "(már felvett)" : s.approx ? "(térkép – házszám nélkül, csak az utca helye)" : "(térkép)";

export default function StopForm({
  value,
  onChange,
  meta,
}: {
  value: StopFields;
  onChange: (v: StopFields) => void;
  meta: Meta;
}) {
  const [open, setOpen] = useState(false);
  const [newPaper, setNewPaper] = useState("");
  const suggestions = useAddressSuggestions(value.address, open, meta.addresses);
  const selected = splitPapers(value.papers);
  const set = (patch: Partial<StopFields>) => onChange({ ...value, ...patch });
  const setPapers = (list: string[]) => set({ papers: list.join(", ") });
  const toggle = (p: string) => setPapers(selected.includes(p) ? selected.filter((x) => x !== p) : [...selected, p]);
  const addPaper = () => {
    const p = newPaper.trim();
    if (p && !selected.some((x) => x.toLowerCase() === p.toLowerCase())) setPapers([...selected, p]);
    setNewPaper("");
  };
  const choose = (s: Suggestion) => {
    set({ address: s.label, lat: s.lat ?? null, lon: s.lon ?? null });
    setOpen(false);
  };
  const chips = [...meta.papers, ...selected.filter((s) => !meta.papers.includes(s))];

  return (
    <>
      <div style={{ position: "relative", display: "grid" }}>
        <input
          placeholder="Cím – kezdd el írni, és válassz a javaslatok közül"
          value={value.address}
          onChange={(e) => {
            set({ address: e.target.value, lat: null, lon: null });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 250)}
        />
        {open && suggestions.length > 0 && (
          <div className="sug">
            {suggestions.map((s) => (
              <button
                type="button"
                key={s.label + (s.own ? "o" : "m")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
              >
                {s.label} <small>{suggestionHint(s)}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      <input
        list="nevek"
        placeholder="Név (nem kötelező)"
        value={value.name}
        onChange={(e) => set({ name: e.target.value })}
      />
      <datalist id="nevek">
        {meta.names.slice(0, 400).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <small>Újságok – koppintással ki/be, vagy új név beírásával:</small>
      <div className="chips" style={{ marginTop: 0 }}>
        {chips.map((p) => (
          <button
            type="button"
            key={p}
            className={`chip ${selected.includes(p) ? "delivered" : ""}`}
            onClick={() => toggle(p)}
          >
            {selected.includes(p) ? "✓ " : ""}
            {p}
          </button>
        ))}
      </div>
      <div className="row">
        <input
          style={{ flex: 2 }}
          placeholder="Új újság neve"
          value={newPaper}
          onChange={(e) => setNewPaper(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPaper();
            }
          }}
        />
        <button type="button" onClick={addPaper}>
          Hozzáad
        </button>
      </div>
      <input
        placeholder="Megjegyzés (nem kötelező)"
        value={value.note}
        onChange={(e) => set({ note: e.target.value })}
      />
    </>
  );
}
