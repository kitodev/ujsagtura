// A térképen egyszer megérintett cím kis ablaka: adatok, újságok (jelölhetők), ugrás a listához, navigálás.
import { StyleSheet, Text, View } from "react-native";
import type { Deliveries, Paper, Stop } from "@shared/types";
import { C } from "@/theme";
import { PaperChip } from "./PaperChip";
import { Btn } from "./ui";

type Props = {
  stop: Stop;
  deliveries: Deliveries;
  since: Record<string, string>;
  onCycle: (stop: Stop, paper: Paper) => void;
  onOpen: () => void;
  onNavigate: () => void;
  onClose: () => void;
};

export function PinInfo({ stop, deliveries, since, onCycle, onOpen, onNavigate, onClose }: Props) {
  const sub = [stop.name, stop.route_id && `${stop.route_id}. túra`].filter(Boolean).join(" · ");
  return (
    <View style={s.box}>
      <Text style={s.title}>{stop.address}</Text>
      {!!sub && <Text style={s.sub}>{sub}</Text>}
      {!!stop.note && <Text style={s.note}>⚠ {stop.note}</Text>}
      <View style={s.chips}>
        {stop.stop_papers.map((p) => (
          <PaperChip
            key={p.id}
            paper={p}
            status={deliveries[p.id]}
            since={since[p.id]}
            onPress={() => onCycle(stop, p)}
          />
        ))}
      </View>
      <View style={s.row}>
        <Btn small variant="primary" label="↓ A listában" onPress={onOpen} />
        <Btn small label="➤ Navigálás" onPress={onNavigate} />
        <Btn small variant="muted" label="✕" onPress={onClose} accessibilityLabel="Bezárás" />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: {
    position: "absolute",
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 12,
    gap: 4,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  title: { fontSize: 17, fontWeight: "800", color: C.tx },
  sub: { color: C.mu },
  note: { color: C.ca, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
});
