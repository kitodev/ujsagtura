// Excel-kimutatás letöltése (a szerver készíti; a telefon böngészője tölti le).
import { useState } from "react";
import { Alert, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { addDays, monthStart } from "@shared/dates";
import type { Route } from "@shared/types";
import { api } from "@/lib/api";
import { shortDayHu } from "@/lib/time";
import { C } from "@/theme";
import { Btn } from "../ui";
import { Sheet } from "./Sheet";

type Props = { day: string; today: string; routes: Route[]; onClose: () => void };

export function ExcelDialog({ day, today, routes, onClose }: Props) {
  const [from, setFrom] = useState(day);
  const [to, setTo] = useState(day);
  const [route, setRoute] = useState("all");

  const shift = (which: "from" | "to", n: number) => {
    if (which === "from") {
      const next = addDays(from, n);
      if (next <= to) setFrom(next);
    } else {
      const next = addDays(to, n);
      if (next >= from && next <= today) setTo(next);
    }
  };

  async function download() {
    const url = api.exportUrl(from, to, route);
    try {
      await Linking.openURL(url);
      onClose();
    } catch {
      Alert.alert("Hiba", "A letöltés nem indítható el.");
    }
  }

  const row = (label: string, which: "from" | "to", value: string) => (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <Btn small label="◀" onPress={() => shift(which, -1)} />
      <Text style={s.day}>{shortDayHu(value)}</Text>
      <Btn small label="▶" onPress={() => shift(which, 1)} />
    </View>
  );

  return (
    <Sheet
      title="📊 Excel-kimutatás"
      onClose={onClose}
      footer={
        <>
          <Btn label="Mégse" onPress={onClose} />
          <Btn variant="primary" label="Letöltés" onPress={download} />
        </>
      }
    >
      {row("Ettől:", "from", from)}
      {row("Eddig:", "to", to)}
      <View style={s.quick}>
        <Btn small variant="muted" label="Csak ez a nap" onPress={() => (setFrom(day), setTo(day))} />
        <Btn small variant="muted" label="E hónap" onPress={() => (setFrom(monthStart(day)), setTo(day))} />
        <Btn small variant="muted" label="Utolsó 7 nap" onPress={() => (setFrom(addDays(today, -6)), setTo(today))} />
      </View>
      <View style={s.quick}>
        {[{ id: "all", name: "Minden túra" }, ...routes].map((r) => (
          <Pressable key={r.id} onPress={() => setRoute(r.id)} style={[s.route, route === r.id && s.routeOn]}>
            <Text style={[s.routeText, route === r.id && { color: "#fff" }]}>{r.name}</Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { width: 52, color: C.tx, fontWeight: "600" },
  day: { minWidth: 120, textAlign: "center", color: C.tx, fontWeight: "600" },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  route: {
    borderWidth: 1,
    borderColor: C.bd,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  routeOn: { backgroundColor: C.ac, borderColor: C.ac },
  routeText: { fontWeight: "700", color: C.tx },
});
