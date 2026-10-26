// Hangos bemondás (magyarul), ha a böngésző támogatja.

/** Szöveg felolvasása. `interrupt`: az éppen futó bemondás megszakítása. */
export function say(text: string, interrupt = true) {
  if (typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "hu-HU";
  if (interrupt) speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
