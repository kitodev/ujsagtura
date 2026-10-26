// A szerver címe: alapból az EXPO_PUBLIC_API_URL, az alkalmazásban átírható (⋯ Több → Beállítások).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeBase } from "./net";

const KEY = "ujsagtura-api-url";
let base = normalizeBase(process.env.EXPO_PUBLIC_API_URL ?? "");

export const apiBase = () => base;

export async function loadApiBase(): Promise<string> {
  const stored = await AsyncStorage.getItem(KEY).catch(() => null);
  if (stored) base = normalizeBase(stored);
  return base;
}

export async function saveApiBase(url: string): Promise<string> {
  base = normalizeBase(url);
  await AsyncStorage.setItem(KEY, base).catch(() => {});
  return base;
}
