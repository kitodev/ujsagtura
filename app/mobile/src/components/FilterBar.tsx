// Szűrés állapot szerint, az újságok számával. Újra koppintva a szűrő kikapcsol.
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { StatusCounts } from "@shared/deliveries";
import type { StatusFilter } from "@shared/types";
import { C, STATUS_COLOR } from "@/theme";

const FILTERS: { key: StatusFilter; label: string; color: string }[] = [
  { key: "", label: "Mind", color: C.ac },
  { key: "todo", label: "Hátralévő", color: C.ac },
  { key: "delivered", label: "Leadva", color: STATUS_COLOR.delivered },
  { key: "missing", label: "Hiányzik", color: STATUS_COLOR.missing },
  { key: "cancelled", label: "Lemondva", color: STATUS_COLOR.cancelled },
];

type Props = { value: StatusFilter; counts: StatusCounts; total: number; onChange: (f: StatusFilter) => void };

export function FilterBar({ value, counts, total, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {FILTERS.map(({ key, label, color }) => {
        const on = value === key;
        return (
          <Pressable
            key={key || "all"}
            onPress={() => onChange(on ? "" : key)}
            style={[s.btn, on && { backgroundColor: color, borderColor: color }]}
          >
            <Text style={[s.text, on && { color: "#fff" }]}>
              {label} <Text style={s.count}>{key ? counts[key] : total}</Text>
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { gap: 6, paddingVertical: 6 },
  btn: {
    borderWidth: 1,
    borderColor: C.bd,
    backgroundColor: C.card,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  text: { fontSize: 14, color: C.tx },
  count: { fontWeight: "700" },
});
