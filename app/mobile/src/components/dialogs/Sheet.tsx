// Alulról felcsúszó párbeszédablak (görgethető, a billentyűzet nem takarja).
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { C } from "@/theme";

type Props = { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode };

export function Sheet({ title, onClose, children, footer }: Props) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={s.sheet}>
          <Text style={s.title}>{title}</Text>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.body}>
            {children}
          </ScrollView>
          {footer && <View style={s.footer}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "flex-end" },
  backdrop: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: C.bg,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "92%",
    paddingTop: 14,
  },
  title: { fontSize: 18, fontWeight: "800", color: C.tx, paddingHorizontal: 16, marginBottom: 6 },
  body: { padding: 16, paddingTop: 6, gap: 10 },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderColor: C.bd,
  },
});
