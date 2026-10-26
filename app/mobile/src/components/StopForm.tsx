// Cím / név / újságok / megjegyzés űrlap. A cím beírható és a javaslatokból választható is (elgépelés ellen).
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { splitPapers } from "@shared/papers";
import type { Meta } from "@shared/types";
import { C } from "@/theme";
import { Btn, Field } from "./ui";

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
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

const plainLower = (x: string) => x.toLowerCase();

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
      .filter((a) => plainLower(a).includes(plainLower(q)))
      .slice(0, MAX_OWN)
      .map((label) => ({ label, own: true }));
    setItems(own);
    const typedHouse = q.match(/\s(\d[\w/-]*)\.?$/)?.[1];
    const timer = setTimeout(async () => {
      try {
        const url = `${NOMINATIM}?format=jsonv2&addressdetails=1&limit=6&countrycodes=hu&q=${encodeURIComponent(q + ", Kiskunhalas")}`;
        const hits: OsmHit[] = await (await fetch(url, { headers: { "User-Agent": "Ujsagtura/1.0" } })).json();
        const osm = hits
          .filter((x) => x.address?.road && JSON.stringify(x.address).includes("Kiskunhalas"))
          .map((x): Suggestion => {
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
  s.own ? "(már felvett)" : s.approx ? "(térkép – csak az utca helye)" : "(térkép)";

export function StopForm({
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
  const chips = [...meta.papers, ...selected.filter((x) => !meta.papers.includes(x))];
  const nameKey = value.name.trim().toLowerCase();
  const names =
    nameKey.length >= 2
      ? meta.names.filter((n) => n.toLowerCase().includes(nameKey) && n !== value.name).slice(0, 4)
      : [];

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Field
          placeholder="Cím – kezdd el írni, és válassz a javaslatok közül"
          value={value.address}
          onChangeText={(address) => {
            set({ address, lat: null, lon: null });
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoCorrect={false}
        />
        {open && suggestions.length > 0 && (
          <View style={s.sug}>
            {suggestions.map((x) => (
              <Pressable
                key={x.label + (x.own ? "o" : "m")}
                style={s.sugItem}
                onPress={() => {
                  set({ address: x.label, lat: x.lat ?? null, lon: x.lon ?? null });
                  setOpen(false);
                }}
              >
                <Text style={s.sugText}>
                  {x.label} <Text style={s.hint}>{suggestionHint(x)}</Text>
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      <Field placeholder="Név (nem kötelező)" value={value.name} onChangeText={(name) => set({ name })} />
      {names.length > 0 && (
        <View style={s.chips}>
          {names.map((n) => (
            <Btn key={n} small variant="muted" label={n} onPress={() => set({ name: n })} />
          ))}
        </View>
      )}
      <Text style={s.label}>Újságok – koppintással ki/be, vagy új név beírásával:</Text>
      <View style={s.chips}>
        {chips.map((p) => (
          <Pressable key={p} onPress={() => toggle(p)} style={[s.chip, selected.includes(p) && s.chipOn]}>
            <Text style={[s.chipText, selected.includes(p) && { color: "#fff" }]}>
              {selected.includes(p) ? "✓ " : ""}
              {p}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={s.row}>
        <Field
          style={{ flex: 1 }}
          placeholder="Új újság neve"
          value={newPaper}
          onChangeText={setNewPaper}
          onSubmitEditing={addPaper}
          returnKeyType="done"
        />
        <Btn label="Hozzáad" onPress={addPaper} />
      </View>
      <Field placeholder="Megjegyzés (nem kötelező)" value={value.note} onChangeText={(note) => set({ note })} />
    </View>
  );
}

const s = StyleSheet.create({
  sug: { borderWidth: 1, borderColor: C.bd, borderRadius: 10, backgroundColor: C.card, marginTop: 4 },
  sugItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: C.bg },
  sugText: { color: C.tx, fontSize: 15 },
  hint: { color: C.mu, fontSize: 12 },
  label: { color: C.mu, fontSize: 13 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 2,
    borderColor: C.bd,
    backgroundColor: C.card,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  chipOn: { backgroundColor: C.ok, borderColor: C.ok },
  chipText: { fontWeight: "600", color: C.tx },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
});
