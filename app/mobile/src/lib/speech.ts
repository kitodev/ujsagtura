// Hangos bemondás magyarul.
import * as Speech from "expo-speech";

/** Szöveg felolvasása. `interrupt`: az éppen futó bemondás megszakítása. */
export function say(text: string, interrupt = true) {
  if (interrupt) Speech.stop();
  Speech.speak(text, { language: "hu-HU" });
}
