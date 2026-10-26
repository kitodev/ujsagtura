"use client";
import type { ReactNode } from "react";

/** Párbeszédablak sötét háttérrel; a háttérre kattintva bezárul. */
export function Dialog({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="ov" onClick={onClose}>
      <div className="dlg" role="dialog" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
