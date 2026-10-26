type Props = {
  full: boolean;
  drive: boolean;
  hasGps: boolean;
  onToggleFull: () => void;
  onToggleDrive: () => void;
  onLocate: () => void;
};

/** A térkép kerek gombjai: teljes képernyő, 3D (vezetés) nézet, saját helyzet. */
export function MapControls({ full, drive, hasGps, onToggleFull, onToggleDrive, onLocate }: Props) {
  return (
    <div className="mapctl">
      <button title={full ? "Kicsinyítés" : "Teljes képernyő"} onClick={onToggleFull}>
        {full ? "✕" : "⛶"}
      </button>
      <button title="Vezetés nézet (menetirány szerint, döntve)" className={drive ? "on" : ""} onClick={onToggleDrive}>
        {drive ? "2D" : "3D"}
      </button>
      {!hasGps && (
        <button title="Saját helyzet" onClick={onLocate}>
          ⌖
        </button>
      )}
    </div>
  );
}
