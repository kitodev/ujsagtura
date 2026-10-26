// Fejléc: túrák, nap és haladás, valamint a gombok (a ritkábbak a „⋯ Több” menüben).
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Route } from "@shared/types";
import { C } from "@/theme";
import { DayPicker } from "./DayPicker";
import { Btn } from "./ui";

export type MenuAction = "summary" | "sort" | "locate" | "relocate" | "offline" | "route" | "excel" | "settings";

const MENU: { key: MenuAction; label: string }[] = [
  { key: "summary", label: "📋 Összesítő" },
  { key: "sort", label: "↕ Közelség szerinti sorrend" },
  { key: "locate", label: "📍 Címek feltérképezése" },
  { key: "relocate", label: "🔁 Újraszámolás (minden cím helye)" },
  { key: "offline", label: "📥 Térkép mentése offline" },
  { key: "route", label: "+ Túra" },
  { key: "excel", label: "📊 Excel" },
  { key: "settings", label: "⚙ Beállítások" },
];

type Props = {
  routes: Route[];
  route: string;
  onRoute: (id: string) => void;
  done: number;
  total: number;
  day: string;
  today: string;
  onDay: (day: string) => void;
  showMap: boolean;
  busy: string;
  onToggleMap: () => void;
  onAddStop: () => void;
  onMenu: (action: MenuAction) => void;
};

export function Header(p: Props) {
  const [menu, setMenu] = useState(false);
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <View style={s.head}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
        {p.routes.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => p.onRoute(r.id)}
            style={[s.tab, p.route === r.id && s.tabOn]}
            accessibilityRole="tab"
            accessibilityState={{ selected: p.route === r.id }}
          >
            <Text style={[s.tabText, p.route === r.id && { color: "#fff" }]}>{r.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <DayPicker day={p.day} today={p.today} onChange={p.onDay} />

      <View style={s.progressRow}>
        <View style={s.bar}>
          <View style={[s.fill, { width: `${pct}%` }]} />
        </View>
        <Text style={s.count}>
          {p.done} / {p.total}
        </Text>
      </View>

      <View style={s.tools}>
        <Btn small variant={p.showMap ? "on" : "default"} label="🗺 Térkép" onPress={p.onToggleMap} />
        <Btn small label="+ Cím" onPress={p.onAddStop} />
        <Btn small label="⋯ Több" onPress={() => setMenu(true)} />
        {!!p.busy && <Text style={s.busy}>{p.busy}</Text>}
      </View>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={s.backdrop} onPress={() => setMenu(false)}>
          <View style={s.menu}>
            {MENU.map((m) => (
              <Pressable
                key={m.key}
                style={({ pressed }) => [s.item, pressed && { backgroundColor: C.bg }]}
                onPress={() => {
                  setMenu(false);
                  p.onMenu(m.key);
                }}
              >
                <Text style={s.itemText}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  head: { gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6, borderBottomWidth: 1, borderColor: C.bd },
  tabs: { gap: 6 },
  tab: {
    borderWidth: 1,
    borderColor: C.bd,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  tabOn: { backgroundColor: C.ac, borderColor: C.ac },
  tabText: { fontWeight: "700", color: C.tx },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  bar: { flex: 1, height: 8, backgroundColor: C.bd, borderRadius: 4, overflow: "hidden" },
  fill: { height: 8, backgroundColor: C.ok },
  count: { fontWeight: "700", color: C.tx },
  tools: { flexDirection: "row", gap: 6, alignItems: "center", flexWrap: "wrap" },
  busy: { color: C.mu, fontSize: 13 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  menu: {
    backgroundColor: C.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingBottom: 28,
  },
  item: { paddingVertical: 14, paddingHorizontal: 20 },
  itemText: { fontSize: 17, color: C.tx },
});
