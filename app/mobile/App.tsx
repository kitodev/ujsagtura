// Indulás: a beállítások és a várólista betöltése; ha még nincs megadva a szerver címe, előbb azt kérjük.
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ServerField } from "@/components/dialogs/SettingsDialog";
import { Btn } from "@/components/ui";
import { initApi } from "@/lib/api";
import { loadApiBase, saveApiBase } from "@/lib/settings";
import { MainScreen } from "@/MainScreen";
import { C } from "@/theme";

export default function App() {
  const [server, setServer] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadApiBase(), initApi()]).then(([base]) => setServer(base));
  }, []);

  const change = async (url: string) => setServer(await saveApiBase(url));

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {server == null ? (
        <View style={s.center}>
          <ActivityIndicator color={C.ac} />
        </View>
      ) : server ? (
        // szerverváltáskor minden adat újratöltődik
        <MainScreen key={server} onServerChange={change} />
      ) : (
        <FirstRun onSave={change} />
      )}
    </SafeAreaProvider>
  );
}

function FirstRun({ onSave }: { onSave: (url: string) => void }) {
  const [url, setUrl] = useState("");
  return (
    <SafeAreaView style={s.first}>
      <Text style={s.title}>🗞 Újságtúra</Text>
      <ServerField value={url} onChange={setUrl} />
      <Btn variant="primary" label="Tovább" onPress={() => url.trim() && onSave(url)} disabled={!url.trim()} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
  first: { flex: 1, backgroundColor: C.bg, padding: 20, gap: 12, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: "800", color: C.tx, marginBottom: 8 },
});
