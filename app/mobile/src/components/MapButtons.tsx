// A térkép gombjai: teljes képernyő, 3D (menetirányba forgatott) nézet, saját helyzet, hátralévő útvonal.
import { Pressable, StyleSheet, Text, View } from "react-native";

type Props = {
  full: boolean;
  drive: boolean;
  restOnly: boolean;
  /** Navigáció közben a nav-panelek miatt lejjebb kerülnek a gombok. */
  navigating: boolean;
  onToggleFull: () => void;
  onToggleDrive: () => void;
  onLocate: () => void;
  onToggleRest: () => void;
};

function RoundBtn({ label, on, onPress, a11y }: { label: string; on?: boolean; onPress: () => void; a11y: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [s.round, on && s.on, pressed && { opacity: 0.7 }]}
    >
      <Text style={[s.roundText, on && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export function MapButtons(p: Props) {
  return (
    <>
      <View style={[s.column, p.navigating && { top: 120 }]}>
        <RoundBtn label="⛶" on={p.full} onPress={p.onToggleFull} a11y="Teljes képernyő" />
        <RoundBtn label="3D" on={p.drive} onPress={p.onToggleDrive} a11y="Menetirány nézet" />
        <RoundBtn label="⌖" onPress={p.onLocate} a11y="Saját helyzet" />
      </View>
      {!p.navigating && (
        <Pressable onPress={p.onToggleRest} style={[s.rest, p.restOnly && s.on]} accessibilityRole="button">
          <Text style={[s.restText, p.restOnly && { color: "#fff" }]}>
            {p.restOnly ? "Teljes útvonal" : "Hátralévő útvonal"}
          </Text>
        </Pressable>
      )}
    </>
  );
}

const s = StyleSheet.create({
  column: { position: "absolute", right: 10, top: 10, gap: 8 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  on: { backgroundColor: "#1f4e79" },
  roundText: { fontSize: 18, fontWeight: "800", color: "#1d1d1b" },
  rest: {
    position: "absolute",
    left: 10,
    top: 10,
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingVertical: 8,
    paddingHorizontal: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  restText: { fontWeight: "700", color: "#1d1d1b" },
});
