// Beállítások: a szerver (a webes Újságtúra) címe, és az offline térkép állapota.
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { checkServer } from "@/lib/api";
import { normalizeBase } from "@/lib/net";
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
          ? `📥 Offline térkép: ${offline.tiles}${offline.complete === false && offline.required ? ` / ${offline.required} (nem teljes)` : ""} térképrészlet, úthálózat: ${offline.roads ? "van" : "nincs"} (${offline.savedAt.slice(0, 10)})` +
            (offline.errors?.length ? `\n⚠ ${offline.errors.join("\n⚠ ")}` : "")
          : "📥 Offline térkép még nincs mentve (⋯ Több → Térkép mentése offline)."}
      </Text>
    </Sheet>
  );
}

export function ServerField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function run() {
    const url = normalizeBase(value);
    if (!url) return;
    setTesting(true);
    const r = await checkServer(url);
    setTesting(false);
    setTest(
      r.ok
        ? { ok: true, text: `✅ Rendben: a szerver elérhető, ${r.routes} túra.` }
        : { ok: false, text: `❌ ${r.error}` },
    );
  }

  return (
    <>
      <Text style={s.label}>A szerver címe (ahol a webes Újságtúra fut):</Text>
      <Field
        value={value}
        onChangeText={(v) => {
          onChange(v);
          setTest(null);
        }}
        placeholder="pl. https://ujsagtura.vercel.app"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Btn
        small
        label={testing ? "Ellenőrzés…" : "🔌 Kapcsolat ellenőrzése"}
        onPress={run}
        disabled={testing || !value.trim()}
      />
      {test && <Text style={[s.result, { color: test.ok ? C.ok : C.ca }]}>{test.text}</Text>}
      <Text style={s.hint}>
        Csak a cím eleje kell (pl. https://valami.vercel.app), a végére semmi más. A telefonos alkalmazás ugyanazt az
        adatbázist használja, mint a weboldal: amit itt jelölsz, ott is látszik.
      </Text>
    </>
  );
}

const s = StyleSheet.create({
  label: { color: C.tx, fontWeight: "600" },
  hint: { color: C.mu, fontSize: 13 },
  result: { fontWeight: "600" },
});
