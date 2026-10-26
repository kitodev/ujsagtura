// Tartós tárolás a telefonon (AsyncStorage), JSON-ként.
import AsyncStorage from "@react-native-async-storage/async-storage";

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* betelt tároló: a működést nem akasztja meg */
  }
}

/**
 * Szinkron olvasható tároló (a közös Outbox ezt várja): a memóriában tartja az értéket,
 * és a háttérben menti a telefonra. Induláskor a `load()` tölti be.
 */
export function mirroredStore(key: string) {
  let value: string | null = null;
  return {
    get: () => value,
    set: (v: string) => {
      value = v;
      AsyncStorage.setItem(key, v).catch(() => {});
    },
    async load() {
      const stored = await AsyncStorage.getItem(key).catch(() => null);
      // ha betöltés előtt már került bele valami, az ne vesszen el
      if (stored && value) value = JSON.stringify([...JSON.parse(stored), ...JSON.parse(value)]);
      else if (stored) value = stored;
    },
  };
}
