// Navigáció közben: felül a következő manőver, alul az idő / távolság, a cél újságjai és a gombok.
import { StyleSheet, Text, View } from "react-native";
import { distanceM, type LatLon } from "@shared/geo";
import { formatDistance, stepIcon, stepText, type Nav, type Snap } from "@shared/navigation";
import type { Deliveries, Paper, Stop } from "@shared/types";
import { clockHu } from "@/lib/time";
import { PaperChip } from "./PaperChip";
import { Btn } from "./ui";

type Props = {
  nav: Nav;
  stepIndex: number;
  snap: Snap | null;
  onRoute: boolean;
  rerouting: boolean;
  gps: LatLon | null;
  target: Stop;
  deliveries: Deliveries;
  since: Record<string, string>;
  voice: boolean;
  onCycle: (stop: Stop, paper: Paper) => void;
  onReroute: () => void;
  onToggleVoice: () => void;
  onStop: () => void;
};

export function NavTop({ nav, stepIndex, snap, onRoute, gps, rerouting }: Props) {
  const step = nav.steps[stepIndex];
  if (!step) return null;
  const following = nav.steps[stepIndex + 1];
  const target = stepIndex === 0 && nav.steps.length > 1 ? 1 : stepIndex;
  const [lon, lat] = step.maneuver.location;
  const toStep = gps ? (onRoute && snap ? nav.stepAt[target] - snap.along : distanceM(gps, { lat, lon })) : null;
  return (
    <View style={s.top}>
      <Text style={s.icon}>{stepIcon(step)}</Text>
      <View style={{ flex: 1 }}>
        {toStep != null && <Text style={s.dist}>{formatDistance(toStep)}</Text>}
        <Text style={s.text}>{rerouting ? "Újratervezés…" : stepText(step)}</Text>
        {following && stepIndex > 0 && (
          <Text style={s.then}>
            Utána: {stepIcon(following)} {stepText(following)}
          </Text>
        )}
      </View>
    </View>
  );
}

export function NavBottom(p: Props) {
  const { nav, snap, onRoute, gps } = p;
  const remaining = onRoute && snap ? Math.max(0, nav.dist - snap.along) : nav.dist;
  const remainingSec = nav.dist ? (nav.dur * remaining) / nav.dist : nav.dur;
  const eta = clockHu(new Date(Date.now() + remainingSec * 1000));
  return (
    <View style={s.bottom}>
      <Text style={s.white}>
        <Text style={s.b}>{Math.max(1, Math.round(remainingSec / 60))} perc</Text> · {formatDistance(remaining)} ·
        érkezés {eta}
      </Text>
      <Text style={s.white}>
        <Text style={s.b}>📍 {nav.to.address}</Text>
        {nav.to.name ? ` · ${nav.to.name}` : ""}
        {!onRoute && gps ? " · letértél az útvonalról" : ""}
      </Text>
      {p.target.stop_papers.length > 0 && (
        <View style={s.papers}>
          <Text style={s.white}>Leadandó:</Text>
          {p.target.stop_papers.map((paper) => (
            <PaperChip
              key={paper.id}
              paper={paper}
              status={p.deliveries[paper.id]}
              since={p.since[paper.id]}
              highlightTodo
              onPress={() => p.onCycle(p.target, paper)}
            />
          ))}
        </View>
      )}
      {!!p.target.note && <Text style={s.note}>⚠ {p.target.note}</Text>}
      <View style={s.row}>
        <Btn small label="Újratervezés" onPress={p.onReroute} />
        <Btn small variant={p.voice ? "on" : "default"} label="🔊 Hang" onPress={p.onToggleVoice} />
        <Btn small variant="danger" label="Leállítás" onPress={p.onStop} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "#1b5e20",
    borderRadius: 14,
    padding: 12,
    elevation: 6,
  },
  icon: { fontSize: 34, color: "#fff" },
  dist: { fontSize: 24, fontWeight: "800", color: "#fff" },
  text: { fontSize: 17, color: "#fff", fontWeight: "600" },
  then: { fontSize: 13, color: "#d7f0d8", marginTop: 2 },
  bottom: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(29,29,27,0.92)",
    borderRadius: 14,
    padding: 12,
    gap: 4,
    elevation: 6,
  },
  white: { color: "#fff", fontSize: 15 },
  b: { fontWeight: "700" },
  papers: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 4 },
  note: { color: "#ffb4a8", fontWeight: "600" },
  row: { flexDirection: "row", gap: 8, marginTop: 6 },
});
