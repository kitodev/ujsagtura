// „Elintézve – indulás a következő címre N mp múlva” sáv.
import { StyleSheet, Text, View } from "react-native";
import type { Advance } from "@/hooks/useAutoAdvance";
import { C } from "@/theme";
import { Btn } from "./ui";

type Props = { advance: Advance; secondsLeft: number; onGoNow: () => void; onStay: () => void };

export function AdvanceBanner({ advance, secondsLeft, onGoNow, onStay }: Props) {
  return (
    <View style={s.box} accessibilityLiveRegion="polite">
      <Text style={s.text}>
        ✅ <Text style={s.b}>{advance.from.address}</Text> elintézve
      </Text>
      {advance.to ? (
        <Text style={s.text}>
          ➡️ Következő: <Text style={s.b}>{advance.to.address}</Text> – indulás {secondsLeft} mp múlva
        </Text>
      ) : (
        <Text style={s.text}>🎉 Ez volt az utolsó cím.</Text>
      )}
      <View style={s.row}>
        <Btn small variant="on" label={advance.to ? "Indulás most" : "Befejezés"} onPress={onGoNow} />
        <Btn small label="Maradok" onPress={onStay} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 16,
    backgroundColor: C.dark,
    borderRadius: 14,
    padding: 12,
    gap: 4,
    elevation: 8,
  },
  text: { color: "#fff", fontSize: 15 },
  b: { fontWeight: "700" },
  row: { flexDirection: "row", gap: 8, marginTop: 6 },
});
