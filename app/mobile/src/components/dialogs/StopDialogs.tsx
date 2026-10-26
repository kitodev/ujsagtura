// Új cím felvétele, cím szerkesztése, új túra.
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import type { LatLon } from "@shared/geo";
import { papersOrDefault } from "@shared/papers";
import type { AddressMatch, Meta, Route, Stop } from "@shared/types";
import { useAddressCheck } from "@/hooks/useAddressCheck";
import { api, ApiError, type CreateResult } from "@/lib/api";
import { ask } from "@/lib/ask";
import { locateAddress } from "@/lib/geocode";
import { C } from "@/theme";
import { emptyStopFields, StopForm, type StopFields } from "../StopForm";
import { Btn, Field } from "../ui";
import { DuplicateBlock, DuplicateWarning, newPapersFor } from "./DuplicateNotice";
import { Sheet } from "./Sheet";

const NOT_FOUND =
  "Ez a cím nem található Kiskunhalason (vagy nincs internet). Csak kiskunhalasi cím vehető fel. Mentsem pontos hely nélkül?";

/** A cím helye: a választott javaslatból, vagy a szerver utcaadataiból. undefined = a felhasználó megszakította. */
async function resolveLocation(f: StopFields): Promise<LatLon | null | undefined> {
  if (f.lat != null && f.lon != null) return { lat: f.lat, lon: f.lon };
  const found = await locateAddress(f.address);
  if (!found && !(await ask("Cím nem található", NOT_FOUND, "Mentés"))) return undefined;
  return found;
}

const conflict = (e: unknown) =>
  e instanceof ApiError && e.status === 409 ? ((e.body.match as AddressMatch) ?? null) : null;

const errorText = (e: unknown) => (e instanceof Error ? e.message : "A mentés nem sikerült.");

type AddProps = {
  routes: Route[];
  defaultRoute: string;
  meta: Meta;
  onClose: () => void;
  onSaved: (result: CreateResult, routeId: string) => void;
};

export function AddStopDialog({ routes, defaultRoute, meta, onClose, onSaved }: AddProps) {
  const [fields, setFields] = useState<StopFields>(emptyStopFields);
  const [routeId, setRouteId] = useState(defaultRoute);
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useAddressCheck(fields.address, routeId);
  const canMerge = !!match && newPapersFor(match, fields.papers).length > 0;

  async function save() {
    if (!fields.address.trim() || !routeId || saving) return;
    setSaving(true);
    try {
      let at: LatLon | null | undefined = null;
      if (!match) {
        at = await resolveLocation(fields);
        if (at === undefined) return;
      }
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
      if (m) setMatch(m);
      else Alert.alert("Hiba", errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      title="Új cím felvétele"
      onClose={onClose}
      footer={
        <>
          <Btn label="Mégse" onPress={onClose} />
          {match ? (
            <Btn
              variant="primary"
              label="➕ Hozzáadás a meglévő címhez"
              onPress={save}
              disabled={!canMerge || saving}
            />
          ) : (
            <Btn variant="primary" label={saving ? "Mentés…" : "Mentés"} onPress={save} disabled={saving} />
          )}
        </>
      }
    >
      <View style={s.routes}>
        {routes.map((r) => (
          <Pressable key={r.id} onPress={() => setRouteId(r.id)} style={[s.route, routeId === r.id && s.routeOn]}>
            <Text style={[s.routeText, routeId === r.id && { color: "#fff" }]}>{r.name}</Text>
          </Pressable>
        ))}
      </View>
      <StopForm value={fields} onChange={setFields} meta={meta} />
      {match && <DuplicateWarning match={match} papers={fields.papers} />}
    </Sheet>
  );
}

type EditProps = { stop: Stop; meta: Meta; onClose: () => void; onSaved: () => void };

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
      else Alert.alert("Hiba", errorText(e));
    }
  }

  async function remove() {
    if (!(await ask("Cím törlése", `Biztosan törlöd: ${stop.address}?`, "Törlés"))) return;
    try {
      await api.deleteStop(stop.id);
      onSaved();
    } catch (e) {
      Alert.alert("Hiba", errorText(e));
    }
  }

  return (
    <Sheet
      title="Cím szerkesztése"
      onClose={onClose}
      footer={
        <>
          <Btn variant="danger" label="Cím törlése" onPress={remove} />
          <Btn label="Mégse" onPress={onClose} />
          <Btn variant="primary" label="Mentés" onPress={save} disabled={!!match} />
        </>
      }
    >
      <StopForm value={fields} onChange={setFields} meta={meta} />
      {match && <DuplicateBlock match={match} />}
    </Sheet>
  );
}

export function RouteDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [id, setId] = useState("");
  const [note, setNote] = useState("");
  async function save() {
    const routeId = id.trim();
    if (!routeId) return;
    try {
      await api.createRoute(routeId, note.trim());
      onSaved(routeId);
    } catch (e) {
      Alert.alert("Hiba", errorText(e));
    }
  }
  return (
    <Sheet
      title="Új túra felvétele"
      onClose={onClose}
      footer={
        <>
          <Btn label="Mégse" onPress={onClose} />
          <Btn variant="primary" label="Mentés" onPress={save} />
        </>
      }
    >
      <Field placeholder="Túra száma (pl. 255)" value={id} onChangeText={setId} />
      <Field placeholder="Megjegyzés (nem kötelező)" value={note} onChangeText={setNote} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  routes: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  route: {
    borderWidth: 1,
    borderColor: C.bd,
    backgroundColor: C.card,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  routeOn: { backgroundColor: C.ac, borderColor: C.ac },
  routeText: { fontWeight: "700", color: C.tx },
});
