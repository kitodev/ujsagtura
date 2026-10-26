// Napválasztó: előző / következő nap, „Ma”. Jövőbeli nap nem választható.
import { StyleSheet, Text, View } from "react-native";
import { addDays } from "@shared/dates";
import { longDayHu, shortDayHu } from "@/lib/time";
import { C } from "@/theme";
import { Btn } from "./ui";

type Props = { day: string; today: string; onChange: (day: string) => void };

export function DayPicker({ day, today, onChange }: Props) {
  const shift = (n: number) => {
    const next = addDays(day, n);
    if (next <= today) onChange(next);
  };
  return (
    <View>
      <View style={s.row}>
        <Btn small label="◀" onPress={() => shift(-1)} accessibilityLabel="Előző nap" />
        <Text style={s.day}>{day === today ? `Ma · ${shortDayHu(day)}` : shortDayHu(day)}</Text>
        <Btn small label="▶" onPress={() => shift(1)} disabled={day >= today} accessibilityLabel="Következő nap" />
        {day !== today && <Btn small variant="on" label="Ma" onPress={() => onChange(today)} />}
      </View>
      {day !== today && <Text style={s.past}>📅 {longDayHu(day)} – a jelölések erre a napra kerülnek</Text>}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  day: { fontSize: 15, fontWeight: "600", color: C.tx, minWidth: 110, textAlign: "center" },
  past: {
    marginTop: 6,
    backgroundColor: "#fff4e0",
    borderColor: C.mi,
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
    color: C.tx,
  },
});
