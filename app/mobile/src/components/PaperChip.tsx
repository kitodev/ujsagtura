// Egy újság gombja a jelölésével (koppintásra a jelölés körbe jár).
import { Pressable, StyleSheet, Text } from "react-native";
import { sinceLabel, STATUS_LABEL } from "@shared/deliveries";
import type { Paper, Status } from "@shared/types";
import { C, STATUS_COLOR } from "@/theme";

type Props = {
  paper: Paper;
  status?: Status;
  since?: string;
  /** Kiemelés, ha még le kell adni (navigáció alsó sávja). */
  highlightTodo?: boolean;
  onPress: () => void;
};

export function PaperChip({ paper, status, since, highlightTodo, onPress }: Props) {
  const label = status ? ` · ${STATUS_LABEL[status]}${status === "cancelled" ? sinceLabel(since) : ""}` : "";
  const color = status ? STATUS_COLOR[status] : undefined;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={3}
      accessibilityRole="button"
      style={({ pressed }) => [
        s.chip,
        color ? { backgroundColor: color, borderColor: color } : null,
        highlightTodo && !status ? s.todo : null,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[s.text, color ? { color: "#fff" } : null]}>
        {paper.paper}
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: {
    borderWidth: 2,
    borderColor: C.bd,
    backgroundColor: C.card,
    borderRadius: 18,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  todo: { borderColor: C.mi, backgroundColor: "#fff4e0" },
  text: { fontSize: 15, fontWeight: "600", color: C.tx },
});
