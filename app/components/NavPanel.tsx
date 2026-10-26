"use client";
// Navigáció közben: felül a következő manőver, alul az idő / távolság, a cél újságjai és a gombok.
import { formatDistance, stepIcon, stepText, type Nav, type Snap } from "@/lib/navigation";
import { distanceM, type LatLon } from "@/lib/geo";
import type { Deliveries, Paper, Stop } from "@/lib/types";
import { PaperChip } from "./PaperChip";

type Props = {
  nav: Nav;
  stepIndex: number;
  snap: Snap | null;
  onRoute: boolean;
  rerouting: boolean;
  gps: LatLon | null;
  /** A cél aktuális adatai (jelölésekkel). */
  target: Stop;
  deliveries: Deliveries;
  since: Record<string, string>;
  voice: boolean;
  onCycle: (stop: Stop, paper: Paper) => void;
  onReroute: () => void;
  onToggleVoice: () => void;
  onStop: () => void;
};

export function NavPanel(p: Props) {
  const { nav, stepIndex, snap, onRoute, gps } = p;
  const step = nav.steps[stepIndex];
  const following = nav.steps[stepIndex + 1];
  // az indulás után a következő manőverig mérünk
  const target = stepIndex === 0 && nav.steps.length > 1 ? 1 : stepIndex;
  const [lon, lat] = step.maneuver.location;
  const toStep = gps ? (onRoute && snap ? nav.stepAt[target] - snap.along : distanceM(gps, { lat, lon })) : null;
  const remaining = onRoute && snap ? Math.max(0, nav.dist - snap.along) : nav.dist;
  const remainingSec = nav.dist ? (nav.dur * remaining) / nav.dist : nav.dur;
  const eta = new Date(Date.now() + remainingSec * 1000).toLocaleTimeString("hu-HU", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div className="navtop">
        <div className="navic">{stepIcon(step)}</div>
        <div style={{ minWidth: 0 }}>
          {toStep != null && <div className="navd">{formatDistance(toStep)}</div>}
          <div className="navt">{p.rerouting ? "Újratervezés…" : stepText(step)}</div>
          {following && stepIndex > 0 && (
            <div className="navn">
              Utána: {stepIcon(following)} {stepText(following)}
            </div>
          )}
        </div>
      </div>
      <div className="navbot">
        <div>
          <b>{Math.max(1, Math.round(remainingSec / 60))} perc</b> · {formatDistance(remaining)} · érkezés {eta}
        </div>
        <div className="navdest">
          <b>📍 {nav.to.address}</b>
          {nav.to.name ? ` · ${nav.to.name}` : ""}
          {!onRoute && gps ? " · letértél az útvonalról" : ""}
        </div>
        {p.target.stop_papers.length > 0 && (
          <div className="navpap">
            <span>Leadandó:</span>
            {p.target.stop_papers.map((paper) => (
              <PaperChip
                key={paper.id}
                paper={paper}
                status={p.deliveries[paper.id]}
                since={p.since[paper.id]}
                highlightTodo
                onClick={() => p.onCycle(p.target, paper)}
              />
            ))}
          </div>
        )}
        {p.target.note && <div className="sn">⚠ {p.target.note}</div>}
        <div className="mt" style={{ marginTop: 6 }}>
          <button onClick={p.onReroute}>Újratervezés</button>
          <button className={p.voice ? "on" : ""} onClick={p.onToggleVoice}>
            🔊 Hang
          </button>
          <button onClick={p.onStop}>Leállítás</button>
        </div>
      </div>
    </>
  );
}
