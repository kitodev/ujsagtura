// Közös kezelőelemek: gomb, szövegmező, jelvény.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, type TextInputProps, type ViewStyle } from "react-native";
import { C } from "@/theme";

type Variant = "default" | "primary" | "on" | "muted" | "danger" | "dark";

type BtnProps = {
  label: ReactNode;
  onPress: () => void;
  variant?: Variant;
  small?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

const BG: Record<Variant, string> = {
  default: C.card,
  primary: C.ac,
  on: C.ac,
  muted: C.bg,
  danger: C.card,
  dark: "rgba(29,29,27,0.85)",
};
const FG: Record<Variant, string> = {
  default: C.tx,
  primary: "#fff",
  on: "#fff",
  muted: C.mu,
  danger: C.ca,
  dark: "#fff",
};

export function Btn({ label, onPress, variant = "default", small, disabled, style, accessibilityLabel }: BtnProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={4}
      style={({ pressed }) => [
        s.btn,
        small && s.small,
        {
          backgroundColor: BG[variant],
          borderColor: variant === "default" || variant === "danger" ? C.bd : BG[variant],
        },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.7 },
        style,
      ]}
    >
      <Text style={[s.label, small && s.smallLabel, { color: FG[variant] }]}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={C.mu} {...props} style={[s.field, props.style]} />;
}

const s = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  small: { paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8 },
  label: { fontSize: 15, fontWeight: "600" },
  smallLabel: { fontSize: 13 },
  field: {
    borderWidth: 1,
    borderColor: C.bd,
    borderRadius: 10,
    backgroundColor: C.card,
    color: C.tx,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
