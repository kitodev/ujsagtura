// Beállítások: a szerver (a webes Újságtúra) címe, és az offline térkép állapota.
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { offlineStatus, type OfflineStatus } from "@/lib/offline-map";
import { apiBase } from "@/lib/settings";
import { C } from "@/theme";
import { Btn, Field } from "../ui";
import { Sheet } from "./Sheet";

type Props = { onClose: () => void; onSave: (url: string) => void };

export function SettingsDialog({ onClose, onSave }: Props) {
  const [url, setUrl] = useState(apiBase());
  const [offline, setOffline] = useState<OfflineStatus | null>(null);
  useEffect(() => {
    offlineStatus().then(setOffline);
  }, []);
  return (
    <Sheet
      title="⚙ Beállítások"
      onClose={onClose}
      footer={
        <>
          <Btn label="Mégse" onPress={onClose} />
          <Btn variant="primary" label="Mentés" onPress={() => url.trim() && onSave(url)} />
        </>
      }
    >
      <ServerField value={url} onChange={setUrl} />
      <Text style={s.hint}>
        {offline
          ? `📥 Offline térkép: ${offline.tiles} térképrészlet, úthálózat: ${offline.roads ? "van" : "nincs"} (${offline.savedAt.slice(0, 10)})`
          : "📥 Offline térkép még nincs mentve (⋯ Több → Térkép mentése offline)."}
      </Text>
    </Sheet>
  );
}

export function ServerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <>
      <Text style={s.label}>A szerver címe (ahol a webes Újságtúra fut):</Text>
      <Field
        value={value}
        onChangeText={onChange}
        placeholder="pl. https://ujsagtura.vercel.app"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Text style={s.hint}>
        A telefonos alkalmazás ugyanazt az adatbázist használja, mint a weboldal: amit itt jelölsz, ott is látszik.
      </Text>
    </>
  );
}

const s = StyleSheet.create({
  label: { color: C.tx, fontWeight: "600" },
  hint: { color: C.mu, fontSize: 13 },
});
