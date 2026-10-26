type Props = {
  full: boolean;
  drive: boolean;
  restOnly: boolean;
  onToggleFull: () => void;
  onToggleDrive: () => void;
  onLocate: () => void;
  onToggleRest: () => void;
};

/** A térkép gombjai: teljes képernyő, 3D (vezetés) nézet, saját helyzet; bal felül a hátralévő útvonal kapcsolója. */
export function MapControls({ full, drive, restOnly, onToggleFull, onToggleDrive, onLocate, onToggleRest }: Props) {
  return (
    <>
      <div className="mapctl">
        <button aria-label={full ? "Kicsinyítés" : "Teljes képernyő"} onClick={onToggleFull}>
          {full ? "✕" : "⛶"}
        </button>
        <button
          aria-label="Vezetés nézet (menetirány szerint, döntve)"
          className={drive ? "on" : ""}
          onClick={onToggleDrive}
        >
          {drive ? "2D" : "3D"}
        </button>
        <button aria-label="Saját helyzet" onClick={onLocate}>
          ⌖
        </button>
      </div>
      <button className={`map-rest${restOnly ? " on" : ""}`} onClick={onToggleRest}>
        {restOnly ? "Teljes útvonal" : "Hátralévő útvonal"}
      </button>
    </>
  );
}
