// Jelölések internet nélkül: ha a mentés nem sikerül (nincs hálózat), a jelölés egy várólistára kerül
// (a böngésző tárolójában), és amint újra van internet, sorban elküldjük.

export type Mark = { ids: string[]; day: string; status: string | null };
type Store = { get: () => string | null; set: (v: string) => void };

const KEY = "ujsagtura-outbox";
const browserStore: Store = {
  get: () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set: (v) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* tároló nélkül csak a memóriában marad */
    }
  },
};

export class Outbox {
  constructor(
    private send: (m: Mark) => Promise<unknown>,
    private store: Store = browserStore,
  ) {}

  /** A még el nem küldött jelölések. */
  pending(): Mark[] {
    try {
      return JSON.parse(this.store.get() ?? "[]");
    } catch {
      return [];
    }
  }

  private save(list: Mark[]) {
    this.store.set(JSON.stringify(list));
  }

  /**
   * Jelölés küldése. Ha van még várakozó jelölés, a sorrend miatt ez is mögé kerül.
   * Hálózati hibánál a várólistára teszi (true = várólistára került). Szerverhibánál továbbdobja.
   */
  async submit(m: Mark): Promise<boolean> {
    if (this.pending().length) {
      this.save([...this.pending(), m]);
      void this.flush();
      return true;
    }
    try {
      await this.send(m);
      return false;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      this.save([...this.pending(), m]);
      return true;
    }
  }

  /** A várakozó jelölések elküldése sorban; az első hálózati hibánál abbahagyja. Visszaadja, hány maradt. */
  async flush(): Promise<number> {
    let list = this.pending();
    while (list.length) {
      try {
        await this.send(list[0]);
      } catch (e) {
        if (isNetworkError(e)) return list.length;
        // a szerver elutasította (pl. törölt cím): eldobjuk, hogy ne akassza meg a többit
      }
      list = list.slice(1);
      this.save(list);
    }
    return 0;
  }
}

/** Hálózati hiba (nincs internet / nem érhető el a szerver), nem a szerver válasza. */
export const isNetworkError = (e: unknown) =>
  e instanceof TypeError || (e instanceof DOMException && e.name === "TimeoutError");
