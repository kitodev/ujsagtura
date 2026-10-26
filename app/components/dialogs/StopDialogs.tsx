"use client";
// Új cím felvétele és cím szerkesztése.
import { useState } from "react";
import { api, ApiError, type CreateResult } from "@/lib/api";
import { locateAddress } from "@/lib/geocode";
import type { LatLon } from "@/lib/geo";
import { papersOrDefault } from "@/lib/papers";
import type { AddressMatch, Meta, Route, Stop } from "@/lib/types";
import { useAddressCheck } from "@/hooks/useAddressCheck";
import StopForm, { emptyStopFields, type StopFields } from "../StopForm";
import { Dialog } from "./Dialog";
import { DuplicateBlock, DuplicateWarning, newPapersFor } from "./DuplicateNotice";

const NOT_FOUND =
  "Ez a cím nem található Kiskunhalason (vagy nincs internet). Csak kiskunhalasi cím vehető fel. Mentsem pontos hely nélkül?";

/** A cím helye: a választott javaslatból, vagy a szerver utcaadataiból. undefined = a felhasználó megszakította. */
async function resolveLocation(f: StopFields): Promise<LatLon | null | undefined> {
  if (f.lat != null && f.lon != null) return { lat: f.lat, lon: f.lon };
  const found = await locateAddress(f.address);
  if (!found && !confirm(NOT_FOUND)) return undefined;
  return found;
}

const conflict = (e: unknown) =>
  e instanceof ApiError && e.status === 409 ? ((e.body.match as AddressMatch) ?? null) : null;

type AddProps = {
  routes: Route[];
  defaultRoute: string;
  meta: Meta;
  onClose: () => void;
  onSaved: (result: CreateResult, routeId: string) => void;
  onMessage: (text: string) => void;
};

export function AddStopDialog({ routes, defaultRoute, meta, onClose, onSaved, onMessage }: AddProps) {
  const [fields, setFields] = useState<StopFields>(emptyStopFields);
  const [routeId, setRouteId] = useState(defaultRoute);
  const [match, setMatch] = useAddressCheck(fields.address, routeId);
  const canMerge = !!match && newPapersFor(match, fields.papers).length > 0;

  async function save() {
    if (!fields.address.trim() || !routeId) return;
    let at: LatLon | null | undefined = null;
    if (!match) {
      onMessage("Cím ellenőrzése…");
      at = await resolveLocation(fields);
      onMessage("");
      if (at === undefined) return;
    }
    try {
      const result = await api.createStop({
        route_id: routeId,
        address: fields.address.trim(),
        name: fields.name.trim(),
        note: fields.note.trim(),
        papers: papersOrDefault(fields.papers),
        lat: at?.lat ?? null,
        lon: at?.lon ?? null,
        merge: !!match,
      });
      onSaved(result, result.merged ? result.match!.route_id : routeId);
    } catch (e) {
      const m = conflict(e);
      if (m)
        setMatch(m); // közben derült ki, hogy már megvan: figyelmeztetés a párbeszédben
      else alert(e instanceof Error ? e.message : "A mentés nem sikerült.");
    }
  }

  return (
    <Dialog onClose={onClose}>
      <b>Új cím felvétele</b>
      <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
        {routes.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <StopForm value={fields} onChange={setFields} meta={meta} />
      {match && <DuplicateWarning match={match} papers={fields.papers} />}
      <div className="row">
        <button onClick={onClose}>Mégse</button>
        {match ? (
          <button className="p" onClick={save} disabled={!canMerge}>
            ➕ Hozzáadás a meglévő címhez
          </button>
        ) : (
          <button className="p" onClick={save}>
            Mentés
          </button>
        )}
      </div>
    </Dialog>
  );
}

type EditProps = {
  stop: Stop;
  meta: Meta;
  onClose: () => void;
  onSaved: () => void;
};

export function EditStopDialog({ stop, meta, onClose, onSaved }: EditProps) {
  const [fields, setFields] = useState<StopFields>({
    address: stop.address,
    name: stop.name,
    note: stop.note,
    papers: stop.stop_papers.map((p) => p.paper).join(", "),
    lat: null,
    lon: null,
  });
  const [match, setMatch] = useAddressCheck(fields.address, stop.route_id ?? "", stop.id);

  async function save() {
    const address = fields.address.trim();
    if (!address || match) return;
    let at: LatLon | null | undefined = null;
    if (address !== stop.address) {
      at = await resolveLocation(fields);
      if (at === undefined) return;
    }
    try {
      await api.updateStop(stop.id, {
        address,
        name: fields.name.trim(),
        note: fields.note.trim(),
        papers: papersOrDefault(fields.papers),
        lat: at?.lat ?? null,
        lon: at?.lon ?? null,
      });
      onSaved();
    } catch (e) {
      const m = conflict(e);
      if (m) setMatch(m);
      else alert("A mentés nem sikerült.");
    }
  }

  async function remove() {
    if (!confirm("Biztosan törlöd ezt a címet?")) return;
    await api.deleteStop(stop.id);
    onSaved();
  }

  return (
    <Dialog onClose={onClose}>
      <b>Cím szerkesztése</b>
      <StopForm value={fields} onChange={setFields} meta={meta} />
      {match && <DuplicateBlock match={match} />}
      <div className="row">
        <button onClick={remove} style={{ color: "var(--ca)" }}>
          Cím törlése
        </button>
        <button onClick={onClose}>Mégse</button>
        <button className="p" onClick={save} disabled={!!match}>
          Mentés
        </button>
      </div>
    </Dialog>
  );
}

export function RouteDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  async function save() {
    const routeId = id.trim();
    if (!routeId) return;
    await api.createRoute(routeId, note.trim());
    onSaved(routeId);
  }
  return (
    <Dialog onClose={onClose}>
      <b>Új túra felvétele</b>
      <input placeholder="Túra száma (pl. 255)" value={id} onChange={(e) => setId(e.target.value)} />
      <input placeholder="Megjegyzés (nem kötelező)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button onClick={onClose}>Mégse</button>
        <button className="p" onClick={save}>
          Mentés
        </button>
      </div>
    </Dialog>
  );
}
