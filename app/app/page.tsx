"use client";
// Újságtúra – a kézbesítő napi listája, térképe és navigációja.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdvanceBanner } from "@/components/AdvanceBanner";
import { ExcelDialog } from "@/components/dialogs/ExcelDialog";
import { AddStopDialog, EditStopDialog, RouteDialog } from "@/components/dialogs/StopDialogs";
import { FilterBar } from "@/components/FilterBar";
import { Header } from "@/components/Header";
import type { MapFocus, PinInfo } from "@/components/Map";
import { MapControls } from "@/components/MapControls";
import { NavPanel } from "@/components/NavPanel";
import Scan from "@/components/Scan";
import { StopCard } from "@/components/StopCard";
import { useAutoAdvance } from "@/hooks/useAutoAdvance";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useNavigation } from "@/hooks/useNavigation";
import { useRouteLine } from "@/hooks/useRouteLine";
import { useFullscreen } from "@/hooks/useScreen";
import { useScrolledDown } from "@/hooks/useScrolledDown";
import { useSearch } from "@/hooks/useSearch";
import { useSelection } from "@/hooks/useSelection";
import { useToast } from "@/hooks/useToast";
import { useTourData } from "@/hooks/useTourData";
import { api, type CreateResult } from "@/lib/api";
import { todayISO } from "@/lib/dates";
import {
  countByStatus,
  isHandled,
  isPending,
  matchesFilter,
  nextStatus,
  nextStopAfter,
  orderedStops,
  summaryText,
  withStatus,
} from "@/lib/deliveries";
import { distanceM } from "@/lib/geo";
import { geocodeStops } from "@/lib/geocode";
import { buildPins } from "@/lib/pins";
import { bestOrder } from "@/lib/route-order";
import { say } from "@/lib/speech";
import type { ScanRow } from "@/lib/scan-text";
import { isLocated, type Deliveries, type Paper, type StatusFilter, type Stop } from "@/lib/types";

const MapView = dynamic(() => import("@/components/Map"), { ssr: false });

type DialogState =
  | { kind: "add" }
  | { kind: "edit"; stop: Stop }
  | { kind: "route" }
  | { kind: "excel" }
  | { kind: "scan" }
  | null;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export default function Page() {
  // ——— Nap, üzenetek ———
  const today = todayISO();
  const [day, setDay] = useState(today);
  const [message, setMessage] = useState("");
  const { toast, showToast, hideToast } = useToast();

  // ——— Adatok ———
  const data = useTourData(day, setMessage);
  const { routes, route, setRoute, stops, allStops, deliveries, since, meta } = data;

  // ——— Nézet ———
  const [filter, setFilter] = useState<StatusFilter>("");
  const [query, setQuery] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [full, setFull] = useState(false);
  const [drive, setDrive] = useState(false);
  const [voice, setVoice] = useState(false);
  const [restOnly, setRestOnly] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [summary, setSummary] = useState("");
  const [mapping, setMapping] = useState(false);
  /** A legutóbb jelölt cím (a „Következő” ehhez képest). */
  const [last, setLast] = useState<Stop | null>(null);
  /** A térképen egyszer rábökött cím (kis ablak). */
  const [infoId, setInfoId] = useState("");
  /** A listában rábökött cím a térképen. */
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const selection = useSelection(stops);
  const scrolledDown = useScrolledDown();
  const found = useSearch(query, day, data.version, data.absorb);
  useFullscreen(full, () => setFull(false));

  const pending = (s: Stop) => isPending(s, deliveries);

  // ——— Helyzet, útvonal, navigáció ———
  const { gps, heading, watch } = useGeolocation();
  const routeLine = useRouteLine({ enabled: showMap, stops, restOnly, isPending: pending, gps });
  /** Navigációs „menet” fut: egy cím elintézése után jön a következő. */
  const tour = useRef(false);

  const leaveMapMode = () => {
    setFull(false);
    setDrive(false);
  };
  /** A cím kiemelése a listában (a szűrő és a keresés ne rejtse el). */
  const revealInList = (s: Stop, note: string) => {
    leaveMapMode();
    setFilter("");
    setQuery("");
    selection.select(s.id, note);
  };

  const navigation = useNavigation({
    gps,
    heading,
    voice,
    watch,
    onMessage: setMessage,
    onStarted: () => {
      setFull(true);
      setDrive(true);
    },
    // a cél közelében a térkép kicsire vált, és a lista a cél címére görget, hogy látszódjon, mit kell leadni
    onNear: (to) => {
      revealInList(to, "🎯 A célhoz értél – ezeket kell leadni");
      if (voice) {
        const todo = (navTarget(to)?.stop_papers ?? []).filter((p) => !deliveries[p.id]).map((p) => p.paper);
        say(`Közel vagy: ${to.address}.${todo.length ? " Leadandó: " + todo.join(", ") : ""}`);
      }
    },
    onArrive: leaveMapMode,
  });
  const { nav } = navigation;

  const startTour = (to: Stop) => {
    tour.current = true;
    navigation.start(to);
  };
  const stopTour = () => {
    tour.current = false;
    advance.cancel();
    navigation.stop();
    leaveMapMode();
  };

  /** A lista sorrendje: „Hátralévő útvonal” módban az újraszámolt sorrend. */
  const order = () => (restOnly ? orderedStops(stops, routeLine.restOrder) : stops);
  const advance = useAutoAdvance(
    (to) => {
      selection.select(to.id, "➡️ Következő cím");
      navigation.start(to);
    },
    () => {
      tour.current = false;
      navigation.stop();
      leaveMapMode();
      setMessage("🎉 Minden cím elintézve!");
    },
  );

  // ——— Jelölés ———

  /** Jelölés után: ha a cím minden újsága jelölve van, navigáció közben indul a következő címre. */
  function afterMark(s: Stop, d: Deliveries) {
    const done = isHandled(s, d);
    if (!done) {
      if (advance.advance?.from.id === s.id) advance.cancel();
      return;
    }
    const isTarget =
      nav?.to.id === s.id ||
      advance.advance?.from.id === s.id ||
      last?.id === s.id ||
      navigation.nearTargetId() === s.id;
    if (!tour.current || (nav && !isTarget)) return;
    advance.schedule(s, nextStopAfter(order(), s.id, d));
  }

  async function cyclePaper(s: Stop, p: Paper) {
    const current = deliveries[p.id];
    const status = nextStatus(current);
    const next = withStatus(deliveries, p.id, status);
    data.setDeliveries((d) => withStatus(d, p.id, status));
    data.setSince((old) => {
      if (!old[p.id]) return old;
      const { [p.id]: _, ...rest } = old; // mától saját jelölés
      return rest;
    });
    if (status === "cancelled") showToast(`🚫 ${p.paper} – ${s.address}: lemondva mától, amíg át nem állítod.`);
    else if (current === "cancelled") showToast(`✔ ${p.paper} – ${s.address}: a lemondás mától megszűnt.`);
    setLast(s);
    afterMark(s, next);
    await api.mark([p.id], day, status);
  }

  async function markAllDelivered(s: Stop) {
    const ids = s.stop_papers.filter((p) => !deliveries[p.id]).map((p) => p.id);
    const marks = Object.fromEntries(ids.map((id) => [id, "delivered" as const]));
    data.setDeliveries((d) => ({ ...d, ...marks }));
    setLast(s);
    afterMark(s, { ...deliveries, ...marks });
    if (ids.length) await api.mark(ids, day, "delivered");
  }

  // ——— Címek helye és sorrendje ———

  /** A túra címeinek elhelyezése a térképen (all: a már elhelyezetteké is). */
  async function geocodeRoute(all = false, target = route) {
    try {
      setMessage("Címek keresése a térképadatokban… (első alkalommal akár fél percig is eltarthat)");
      const list = (await api.stops(target, day)).stops.filter((s) => all || !isLocated(s));
      if (!list.length) {
        setMessage("Minden címnek megvan a helye.");
        return;
      }
      setMessage(await geocodeStops(list, setMessage));
      await data.loadRoute(target);
      await data.loadAll();
    } catch (e) {
      setMessage("A térképadatok lekérése nem sikerült: " + errorText(e));
    }
  }

  /** Közelség szerinti sorrend mentése (a helyadat nélküli címek a végére). */
  async function sortByProximity(skipGeocode = false) {
    try {
      let source = (await api.stops(route, day)).stops;
      if (!skipGeocode && source.some((s) => !isLocated(s))) {
        await geocodeRoute(false, route);
        source = (await api.stops(route, day)).stops;
      }
      const located = source.filter(isLocated);
      const missing = source.filter((s) => !isLocated(s));
      if (!located.length) {
        setMessage("A közelség szerinti rendezéshez előbb helyadat kell a címekhez.");
        return;
      }
      const ordered = bestOrder(located, gps);
      await api.saveOrder([...ordered, ...missing].map((s) => s.id));
      await data.loadRoute(route);
      await data.loadAll();
      setMessage(
        `A ${ordered.length} helyadattal rendelkező cím közelség szerint sorba rendezve.` +
          (missing.length ? ` ${missing.length} koordináta nélküli cím a lista végére került.` : ""),
      );
    } catch (e) {
      setMessage("A címek rendezése nem sikerült: " + errorText(e));
    }
  }

  /** „Címek feltérképezése”: helyek megkeresése, majd közelség szerinti sorrend. */
  async function mapAndSort(all = false) {
    if (mapping) return;
    setMapping(true);
    try {
      await geocodeRoute(all, route);
      await sortByProximity(true);
    } finally {
      setMapping(false);
    }
  }

  // a térkép megnyitásakor: minden túra címei, és egyszer a hiányzó helyek keresése
  useEffect(() => {
    if (showMap) data.loadAll().catch(() => setMessage("A címek betöltése a térképhez nem sikerült."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- térkép megnyitásakor / napváltáskor
  }, [showMap, day]);
  const autoGeocoded = useRef(false);
  useEffect(() => {
    if (!showMap) {
      autoGeocoded.current = false;
      return;
    }
    if (autoGeocoded.current || !allStops.length) return;
    autoGeocoded.current = true;
    if (stops.some((s) => !isLocated(s))) mapAndSort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- egyszer, a térkép adatainak betöltése után
  }, [showMap, allStops.length]);

  // ——— Térkép és lista kapcsolata ———

  /** Koppintás a térképen egy címre: elsőre kis ablak, másodszorra ugrás a listában a címhez. */
  function onPinPick(id: string) {
    const stop = allStops.find((s) => s.id === id);
    if (!stop) return;
    if (infoId !== id) {
      setInfoId(id);
      return;
    }
    setInfoId("");
    if (stop.route_id && stop.route_id !== route) setRoute(stop.route_id);
    if (full) leaveMapMode();
    setFilter("");
    setQuery("");
    setFocus(null);
    selection.select(id);
  }

  /** Koppintás a lista egy kártyájára: fel a térképhez, és a cím megmutatása. */
  function showOnMap(s: Stop) {
    selection.select(s.id, "🗺️ A térképen mutatott cím", false);
    if (isLocated(s))
      setFocus({ lat: s.lat, lon: s.lon, label: `${s.address}${s.name ? " – " + s.name : ""}`, k: Date.now() });
    else {
      setFocus(null);
      setMessage(`„${s.address}” helye még nincs meg a térképen (Címek feltérképezése).`);
    }
    setShowMap(true);
    setTimeout(() => {
      const map = document.querySelector<HTMLElement>(".mapwrap");
      const header = document.querySelector<HTMLElement>("header")?.offsetHeight ?? 0;
      const top = map ? map.getBoundingClientRect().top + window.scrollY - header - 8 : 0;
      window.scrollTo({ top, behavior: "smooth" });
    }, 60);
  }

  // ——— Párbeszédek ———

  function onStopAdded(result: CreateResult, routeId: string) {
    setDialog(null);
    if (result.merged && result.match) {
      setMessage(
        result.added?.length
          ? `${result.match.address}: hozzáadva ${result.added.join(", ")}`
          : `${result.match.address}: ezek az újságok már rajta voltak.`,
      );
    }
    if (routeId === route) data.loadRoute(route);
    else setRoute(routeId);
  }

  async function saveScan(rows: ScanRow[]) {
    // a még nem létező túrák létrehozása (pl. Excelből érkező új túraszám)
    const fresh = [...new Set(rows.map((r) => r.route_id))].filter((id) => id && !routes.some((r) => r.id === id));
    for (const id of fresh) await api.createRoute(id);
    if (fresh.length) await data.reloadRoutes();
    // a már meglévő címeknél nem lesz új cím, csak az új újságok kerülnek hozzá (a szerver dönti el)
    let merged = 0;
    for (const r of rows) {
      if (!r.route_id) continue;
      if ((await api.createStop({ ...r, merge: true })).merged) merged++;
    }
    if (merged) setMessage(`${merged} cím már szerepelt – ezeknél csak az új újságok kerültek hozzá.`);
    setDialog(null);
    setRoute(rows[0].route_id);
    await data.loadRoute(rows[0].route_id);
    geocodeRoute(false, rows[0].route_id);
  }

  // ——— Származtatott adatok ———

  const papers = stops.flatMap((s) => s.stop_papers);
  const counts = countByStatus(stops, deliveries);
  const doneCount = papers.length - counts.todo;
  const here = gps ?? (last && isLocated(last) ? { lat: last.lat, lon: last.lon } : null);
  const next = useMemo(() => {
    const s = nextStopAfter(order(), last?.id ?? null, deliveries);
    return s ? { stop: s, distance: here && isLocated(s) ? distanceM(here, s) : null } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `order` a felsoroltaktól függ
  }, [stops, deliveries, here, last, restOnly, routeLine.restOrder]);

  const hideDone = restOnly || filter === "todo";
  const pins = buildPins(allStops, {
    deliveries,
    route,
    nextId: next?.stop.id,
    restOrder: routeLine.restOrder,
    restOnly,
    hideDone,
    keepId: selection.selected,
  });
  const navTarget = (to: Stop) => stops.find((s) => s.id === to.id) ?? allStops.find((s) => s.id === to.id) ?? to;
  const infoStop = infoId ? (stops.find((s) => s.id === infoId) ?? allStops.find((s) => s.id === infoId)) : undefined;
  const info: PinInfo | null =
    infoStop && isLocated(infoStop)
      ? {
          id: infoStop.id,
          lat: infoStop.lat,
          lon: infoStop.lon,
          title: infoStop.address,
          sub: [infoStop.name, infoStop.route_id && `${infoStop.route_id}. túra`].filter(Boolean).join(" · "),
          note: infoStop.note,
          papers: infoStop.stop_papers.map((p) => ({ name: p.paper, status: deliveries[p.id] })),
        }
      : null;
  const locatedCount = allStops.filter(isLocated).length;
  const routeNote = routes.find((r) => r.id === route)?.note;

  const card = (s: Stop, index: number | null, routeTag?: string) => (
    <StopCard
      key={s.id}
      stop={s}
      index={index}
      routeTag={routeTag}
      deliveries={deliveries}
      since={since}
      isNext={!routeTag && showMap && next?.stop.id === s.id}
      selected={selection.selected === s.id}
      selectedNote={selection.note}
      onCycle={cyclePaper}
      onAllDone={markAllDelivered}
      onEdit={(stop) => setDialog({ kind: "edit", stop })}
      onShowOnMap={showOnMap}
      onClearSelection={() => {
        selection.clear();
        setFocus(null);
      }}
    />
  );

  return (
    <>
      <Header
        routes={routes}
        route={route}
        onRoute={setRoute}
        done={doneCount}
        total={papers.length}
        day={day}
        today={today}
        onDay={setDay}
        showMap={showMap}
        canSort={stops.length > 0}
        onSummary={() => setSummary(summaryText(stops, deliveries, day, route))}
        onToggleMap={() => setShowMap(!showMap)}
        onSort={() => sortByProximity()}
        onAddStop={() => setDialog({ kind: "add" })}
        onAddRoute={() => setDialog({ kind: "route" })}
        onScan={() => setDialog({ kind: "scan" })}
        onExcel={() => setDialog({ kind: "excel" })}
      />

      <main>
        <input
          className="srch"
          placeholder="🔎 Keresés: utca, házszám vagy név (minden túrában)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {!query.trim() && <FilterBar value={filter} counts={counts} total={papers.length} onChange={setFilter} />}

        {showMap && (
          <>
            <div className={`mapwrap${full ? " full" : ""}${nav ? "" : " nonav"}`}>
              <MapView
                pins={pins}
                me={navigation.shownPosition}
                heading={navigation.shownHeading}
                line={nav?.coords ?? routeLine.line}
                cut={
                  nav && navigation.onRoute && navigation.snap ? { i: navigation.snap.i, pt: navigation.snap.pt } : null
                }
                follow={!!nav}
                drive={drive}
                full={full}
                focus={focus}
                info={info}
                onInfoClose={() => setInfoId("")}
                onPick={onPinPick}
              />
              <MapControls
                full={full}
                drive={drive}
                hasGps={!!gps}
                onToggleFull={() => setFull(!full)}
                onToggleDrive={() => {
                  if (!drive) watch();
                  setDrive(!drive);
                }}
                onLocate={watch}
              />
              {nav && (
                <NavPanel
                  nav={nav}
                  stepIndex={navigation.stepIndex}
                  snap={navigation.snap}
                  onRoute={navigation.onRoute}
                  rerouting={navigation.rerouting}
                  gps={gps}
                  target={navTarget(nav.to)}
                  deliveries={deliveries}
                  since={since}
                  voice={voice}
                  onCycle={cyclePaper}
                  onReroute={() => navigation.start(nav.to, true)}
                  onToggleVoice={() => setVoice(!voice)}
                  onStop={stopTour}
                />
              )}
            </div>

            <div className="meta" style={{ marginTop: 6 }}>
              {locatedCount} / {allStops.length} cím helye ismert
              {locatedCount < allStops.length
                ? ` · ${allStops.length - locatedCount} hely keresése folyamatban vagy sikertelen`
                : " · minden túra"}
              {hideDone ? ` · a már elintézett címek el vannak rejtve (${pins.length} látható)` : ""}
            </div>
            {routeLine.message && (
              <div className="meta" style={{ marginTop: 6 }}>
                {routeLine.message}
              </div>
            )}
            <div className="mt" style={{ margin: "8px 0" }}>
              <button disabled={mapping} onClick={() => mapAndSort()}>
                {mapping ? "Feltérképezés…" : "Címek feltérképezése"}
              </button>
              <button
                disabled={mapping}
                onClick={() =>
                  confirm("A túra minden címének helyét újraszámolja, a kézzel javítottakat is. Folytatod?") &&
                  mapAndSort(true)
                }
              >
                Újraszámolás
              </button>
              <button onClick={watch}>Saját helyzet</button>
              <button className={restOnly ? "on" : ""} onClick={() => setRestOnly(!restOnly)}>
                {restOnly ? "Teljes útvonal" : "Hátralévő útvonal"}
              </button>
            </div>
            {message && <div className="meta">{message}</div>}
            {next && !nav && (
              <div className="nxb">
                Következő: <b>{next.stop.address}</b>
                {next.distance != null && ` (${Math.round(next.distance)} m)`} ·{" "}
                <button className="all on-dark" onClick={() => startTour(next.stop)}>
                  Navigálás
                </button>
              </div>
            )}
          </>
        )}

        {summary && (
          <pre>
            {summary}
            <br />
            <button onClick={() => navigator.clipboard.writeText(summary)}>Másolás</button>{" "}
            <button onClick={() => setSummary("")}>Bezár</button>
          </pre>
        )}
        {routeNote && <div className="note">{routeNote}</div>}

        {query.trim() ? (
          <>
            <div className="meta" style={{ margin: "6px 0" }}>
              {found.length} találat (minden túrában)
            </div>
            {found.map((s) => card(s, null, s.route_id))}
          </>
        ) : (
          !full && stops.map((s, i) => (matchesFilter(s, deliveries, filter) ? card(s, i) : null))
        )}
      </main>

      {dialog?.kind === "add" && (
        <AddStopDialog
          routes={routes}
          defaultRoute={route}
          meta={meta}
          onClose={() => setDialog(null)}
          onSaved={onStopAdded}
          onMessage={setMessage}
        />
      )}
      {dialog?.kind === "edit" && (
        <EditStopDialog
          stop={dialog.stop}
          meta={meta}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            data.loadRoute(route);
          }}
        />
      )}
      {dialog?.kind === "route" && (
        <RouteDialog
          onClose={() => setDialog(null)}
          onSaved={async (id) => {
            await data.reloadRoutes();
            setRoute(id);
            setDialog(null);
          }}
        />
      )}
      {dialog?.kind === "excel" && (
        <ExcelDialog day={day} today={today} routes={routes} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === "scan" && (
        <Scan routes={routes} route={route} onSave={saveScan} onClose={() => setDialog(null)} />
      )}

      {toast && (
        <div className="toast" onClick={hideToast}>
          {toast}
        </div>
      )}
      {advance.advance && (
        <AdvanceBanner
          advance={advance.advance}
          secondsLeft={advance.secondsLeft}
          onGoNow={advance.goNow}
          onStay={advance.cancel}
        />
      )}
      {scrolledDown && !full && (
        <button
          className="totop"
          aria-label="Az oldal tetejére"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          ↑
        </button>
      )}
    </>
  );
}
