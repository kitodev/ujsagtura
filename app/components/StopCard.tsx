"use client";
import { isHandled } from "@/lib/deliveries";
import type { Deliveries, Paper, Stop } from "@/lib/types";
import { PaperChip } from "./PaperChip";

type Props = {
  stop: Stop;
  /** Sorszám a listában (vagy null a keresési találatoknál). */
  index: number | null;
  /** Keresési találatnál a túra száma. */
  routeTag?: string;
  deliveries: Deliveries;
  since: Record<string, string>;
  isNext: boolean;
  selected: boolean;
  selectedNote: string;
  onCycle: (stop: Stop, paper: Paper) => void;
  onAllDone: (stop: Stop) => void;
  onEdit: (stop: Stop) => void;
  /** A kártyára (nem gombra) koppintva: a cím megmutatása a térképen. */
  onShowOnMap: (stop: Stop) => void;
  onClearSelection: () => void;
};

/** Egy cím kártyája a listában: cím, név, megjegyzés, újságok jelöléssel. */
export function StopCard(p: Props) {
  const { stop: s, deliveries: d } = p;
  const done = isHandled(s, d);
  const classes = ["card", done && "done", p.isNext && "nx", p.selected && "sel"].filter(Boolean).join(" ");

  return (
    <div
      id={"c" + s.id}
      className={classes}
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest("button, a, input, select")) p.onShowOnMap(s);
      }}
    >
      {p.selected && (
        <div className="selhd">
          <span>{p.selectedNote || "📍 A térképen kiválasztott cím"}</span>
          <button onClick={p.onClearSelection} aria-label="Kijelölés megszüntetése">
            ✕
          </button>
        </div>
      )}
      <div className="top">
        <div>
          <div className="ad">
            {p.index != null ? `${p.index + 1}. ` : ""}
            {s.address}
          </div>
          {(s.name || p.routeTag) && (
            <div className="nm">
              {s.name}
              {p.routeTag && ` · ${p.routeTag}. túra`}
            </div>
          )}
        </div>
        <div className="card-actions">
          <button className="all muted" onClick={() => p.onEdit(s)}>
            ✎ Szerkeszt
          </button>
          {!done && (
            <button className="all" onClick={() => p.onAllDone(s)}>
              Mind leadva
            </button>
          )}
        </div>
      </div>
      {s.note && <div className="sn">⚠ {s.note}</div>}
      <div className="chips">
        {s.stop_papers.map((paper) => (
          <PaperChip
            key={paper.id}
            paper={paper}
            status={d[paper.id]}
            since={p.since[paper.id]}
            onClick={() => p.onCycle(s, paper)}
          />
        ))}
      </div>
    </div>
  );
}
