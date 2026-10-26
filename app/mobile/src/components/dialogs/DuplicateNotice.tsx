// Dupla cím: figyelmeztetés új cím felvételekor, tiltás szerkesztéskor.
import { StyleSheet, Text, View } from "react-native";
import { splitPapers } from "@shared/papers";
import type { AddressMatch } from "@shared/types";
import { C } from "@/theme";

const where = (m: AddressMatch) => `${m.route_id}. túra${m.name ? ` · ${m.name}` : ""}`;

/** Az új újságok, amelyek még nincsenek a meglévő címen. */
export const newPapersFor = (match: AddressMatch, papers: string) => {
  const have = new Set(match.papers.map((p) => p.toLowerCase()));
  return splitPapers(papers).filter((p) => !have.has(p.toLowerCase()));
};

export function DuplicateWarning({ match, papers }: { match: AddressMatch; papers: string }) {
  const fresh = newPapersFor(match, papers);
  return (
    <View style={s.box} accessibilityRole="alert">
      <Text style={s.b}>⚠ Erre a címre már viszel ki újságot!</Text>
      <Text style={s.t}>
        {match.address} – {where(match)}
      </Text>
      <Text style={s.t}>Jelenleg: {match.papers.join(", ") || "–"}</Text>
      <Text style={s.t}>
        {fresh.length
          ? `Új cím nem jön létre, csak ezek kerülnek hozzá: ${fresh.join(", ")}`
          : "A kiválasztott újságok már mind rajta vannak ezen a címen – jelölj ki újat."}
      </Text>
    </View>
  );
}

export function DuplicateBlock({ match }: { match: AddressMatch }) {
  return (
    <View style={[s.box, s.bad]} accessibilityRole="alert">
      <Text style={s.t}>
        ⛔ Ez a cím már szerepel: <Text style={s.b}>{match.address}</Text> ({where(match)}). Egy cím csak egyszer
        szerepelhet – az újságokat annál a címnél add hozzá.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderWidth: 2, borderColor: C.mi, backgroundColor: "#fff4e0", borderRadius: 10, padding: 10, gap: 3 },
  bad: { borderColor: C.ca, backgroundColor: "#fdecea" },
  b: { fontWeight: "800", color: C.tx },
  t: { color: C.tx },
});
