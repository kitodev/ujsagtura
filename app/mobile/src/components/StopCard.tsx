// Egy cím kártyája a listában: cím, név, megjegyzés, újságok jelöléssel.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isHandled } from "@shared/deliveries";
import type { Deliveries, Paper, Stop } from "@shared/types";
import { C } from "@/theme";
import { PaperChip } from "./PaperChip";
import { Btn } from "./ui";

type Props = {
  stop: Stop;
  index: number | null;
  routeTag?: string;
  deliveries: Deliveries;
  since: Record<string, string>;
  isNext: boolean;
  selected: boolean;
  selectedNote: string;
  onCycle: (stop: Stop, paper: Paper) => void;
  onAllDone: (stop: Stop) => void;
  onEdit: (stop: Stop) => void;
  onShowOnMap: (stop: Stop) => void;
  onClearSelection: () => void;
  onLayoutY?: (y: number) => void;
};

export function StopCard(p: Props) {
  const { stop: s, deliveries: d } = p;
  const done = isHandled(s, d);
  return (
    <Pressable
      onPress={() => p.onShowOnMap(s)}
      onLayout={(e) => p.onLayoutY?.(e.nativeEvent.layout.y)}
      style={[st.card, done && st.done, p.isNext && st.next, p.selected && st.selected]}
    >
      {p.selected && (
        <View style={st.selhd}>
          <Text style={st.selText}>{p.selectedNote || "📍 A térképen kiválasztott cím"}</Text>
          <Pressable onPress={p.onClearSelection} hitSlop={10} accessibilityLabel="Kijelölés megszüntetése">
            <Text style={st.selText}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={st.top}>
        <View style={{ flex: 1 }}>
          <Text style={st.address}>
            {p.index != null ? `${p.index + 1}. ` : ""}
            {s.address}
          </Text>
          {(s.name || p.routeTag) && (
            <Text style={st.name}>
              {s.name}
              {p.routeTag && `${s.name ? " · " : ""}${p.routeTag}. túra`}
            </Text>
          )}
        </View>
        <View style={st.actions}>
          <Btn small variant="muted" label="✎ Szerkeszt" onPress={() => p.onEdit(s)} />
          {!done && <Btn small variant="primary" label="Mind leadva" onPress={() => p.onAllDone(s)} />}
        </View>
      </View>
      {!!s.note && <Text style={st.note}>⚠ {s.note}</Text>}
      <View style={st.chips}>
        {s.stop_papers.map((paper) => (
          <PaperChip
            key={paper.id}
            paper={paper}
            status={d[paper.id]}
            since={p.since[paper.id]}
            onPress={() => p.onCycle(s, paper)}
          />
        ))}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.bd,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  done: { opacity: 0.6 },
  next: { borderWidth: 2, borderColor: C.mi },
  selected: { borderWidth: 3, borderColor: C.ac },
  selhd: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: C.ac,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
  },
  selText: { color: "#fff", fontWeight: "600" },
  top: { flexDirection: "row", gap: 8 },
  address: { fontSize: 18, fontWeight: "700", color: C.tx },
  name: { fontSize: 14, color: C.mu, marginTop: 2 },
  actions: { gap: 6, alignItems: "flex-end" },
  note: { color: C.ca, marginTop: 6, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
});
