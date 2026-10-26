"use client";
// Címlista beolvasása papírról (fotó → szövegfelismerés) vagy Excelből. A sorok mentés előtt javíthatók.
import { useRef, useState } from "react";
import { parseOcrLine, parseScanText, toScanLine, type ScanRow } from "@/lib/scan-text";
import type { Route } from "@/lib/types";
import { Dialog } from "./dialogs/Dialog";

type Props = {
  routes: Route[];
  route: string;
  onSave: (rows: ScanRow[]) => Promise<void>;
  onClose: () => void;
};

type PreviewRow = { route: string; address: string; name: string; note: string; papers: string[] };

const MAX_IMAGE_SIDE = 2000;
const XLSX_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A fotó előkészítése a felismeréshez: kicsinyítés, szürkeárnyalat, kontraszt. */
async function prepareImage(file: File) {
  const image = await createImageBitmap(file);
  const k = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = image.width * k;
  canvas.height = image.height * k;
  const g = canvas.getContext("2d")!;
  g.filter = "grayscale(1) contrast(1.3)";
  g.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export default function Scan({ routes, route, onSave, onClose }: Props) {
  const [text, setText] = useState("");
  const [chosenRoute, setChosenRoute] = useState(route);
  const [busy, setBusy] = useState(false);
  const [newRoute, setNewRoute] = useState(""); // az Excelben szereplő, még nem létező túra
  const [status, setStatus] = useState("Fotózd le a címlistát (soronként egy cím, jó fényben, egyenesen).");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const excelInput = useRef<HTMLInputElement>(null);

  const options = [
    ...routes,
    ...(newRoute && !routes.some((r) => r.id === newRoute)
      ? [{ id: newRoute, name: `${newRoute} túra (új)`, note: "" }]
      : []),
  ];
  // ha a kiválasztott érték nincs a listában, az első túra számít (különben üres túrába mentene)
  const target = options.some((r) => r.id === chosenRoute) ? chosenRoute : (options[0]?.id ?? "");
  const append = (lines: string[]) => setText((t) => (t ? t + "\n" : "") + lines.join("\n"));

  async function recognize(file: File) {
    setBusy(true);
    setStatus("Betöltés…");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("hun", 1, {
        logger: (m) =>
          setStatus(m.status === "recognizing text" ? `Olvasás: ${Math.round(m.progress * 100)}%` : "Betöltés…"),
      });
      const { data } = await worker.recognize(await prepareImage(file));
      await worker.terminate();
      const lines = data.text
        .split("\n")
        .map(parseOcrLine)
        .filter((l): l is string => !!l);
      append(lines);
      setStatus(`${lines.length} sor felismerve. Javítsd a hibákat (cím | név | újságok), majd Hozzáadás.`);
    } catch {
      setStatus("Az OCR nem sikerült (internet kell az első betöltéshez).");
    }
    setBusy(false);
  }

  async function readExcel(file: File) {
    setBusy(true);
    setStatus("Excel beolvasása…");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("dry", "1");
      const res = await fetch("/api/import", { method: "POST", body: form });
      const json = await res.json().catch(() => ({ error: "Hibás válasz a szervertől." }));
      if (!res.ok) throw new Error(json.error ?? "Az Excel beolvasása nem sikerült.");
      const rows = json.rows as PreviewRow[];
      append(rows.map(toScanLine));

      const tours = [...new Set(rows.map((r) => r.route).filter(Boolean))];
      let hint = "";
      if (tours.length === 1) {
        const isNew = !routes.some((r) => r.id === tours[0]);
        if (isNew) setNewRoute(tours[0]);
        setChosenRoute(tours[0]);
        hint = ` A túra az Excel alapján: ${tours[0]}${isNew ? " (új túra, mentéskor létrejön)" : ""}.`;
      } else if (tours.length) {
        hint = ` Az Excelben szereplő túra(k): ${tours.join(", ")} – válaszd ki lent, melyikbe kerüljenek.`;
      }
      setStatus(
        `${rows.length} cím beolvasva az Excelből.${hint} Ellenőrizd (cím | név | újságok | megjegyzés), majd Hozzáadás.`,
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  }

  async function save() {
    if (!target) {
      setStatus("Válassz túrát, vagy vegyél fel egyet a „+ Túra” gombbal.");
      return;
    }
    const rows = parseScanText(text, target);
    if (rows.length) await onSave(rows);
    else onClose();
  }

  const onFile = (read: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) read(file);
    e.target.value = "";
  };

  return (
    <Dialog onClose={onClose}>
      <b>Beolvasás papírról</b>
      <div className="row">
        <button disabled={busy} onClick={() => camera.current?.click()}>
          📷 Fotó
        </button>
        <button disabled={busy} onClick={() => gallery.current?.click()}>
          🖼 Kép
        </button>
        <button disabled={busy} onClick={() => excelInput.current?.click()}>
          📊 Excel
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={onFile(recognize)} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={onFile(recognize)} />
      <input ref={excelInput} type="file" accept={XLSX_ACCEPT} hidden onChange={onFile(readExcel)} />
      <small>
        {status}{" "}
        <a href="/api/import" style={{ color: "var(--ac)" }}>
          Excel minta
        </a>
      </small>
      <select value={target} onChange={(e) => setChosenRoute(e.target.value)}>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <textarea
        className="scan-text"
        rows={9}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="cím | név | újságok | megjegyzés"
      />
      <div className="row">
        <button onClick={onClose}>Bezár</button>
        <button className="p" disabled={busy} onClick={save}>
          Hozzáadás
        </button>
      </div>
    </Dialog>
  );
}
