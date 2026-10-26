// Újságtúra – a kézbesítő napi listája, térképe és navigációja (telefonos alkalmazás).
// Felül a térkép, alatta a fejléc (túrák, nap, gombok) és a címek listája – mint a webes változatban.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { todayISO } from "@shared/dates";
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
} from "@shared/deliveries";
import { distanceM } from "@shared/geo";
import { buildPins } from "@shared/pins";
import { bestOrder } from "@shared/route-order";
import { isLocated, type Deliveries, type Paper, type StatusFilter, type Stop } from "@shared/types";
import { AdvanceBanner } from "@/components/AdvanceBanner";
import { ExcelDialog } from "@/components/dialogs/ExcelDialog";
import { SettingsDialog } from "@/components/dialogs/SettingsDialog";
import { AddStopDialog, EditStopDialog, RouteDialog } from "@/components/dialogs/StopDialogs";
import { FilterBar } from "@/components/FilterBar";
import { Header, type MenuAction } from "@/components/Header";
import { MapButtons } from "@/components/MapButtons";
import { NavBottom, NavTop } from "@/components/NavPanel";
import { PinInfo } from "@/components/PinInfo";
import { StopCard } from "@/components/StopCard";
import { TourMap, type MapFocus, type TourMapHandle } from "@/components/TourMap";
import { Btn, Field } from "@/components/ui";
import { useAutoAdvance } from "@/hooks/useAutoAdvance";
import { useConnection } from "@/hooks/useConnection";
import { useLocation } from "@/hooks/useLocation";
import { useNavigation } from "@/hooks/useNavigation";
import { useRouteLine } from "@/hooks/useRouteLine";
import { useSearch } from "@/hooks/useSearch";
import { useSelection } from "@/hooks/useSelection";
import { useToast } from "@/hooks/useToast";
import { useTourData } from "@/hooks/useTourData";
import { api, type CreateResult } from "@/lib/api";
import { ask } from "@/lib/ask";
import { geocodeStops } from "@/lib/geocode";
import { saveOfflineMap } from "@/lib/offline-map";
import { loadRoadGraph } from "@/lib/road-store";
import { say } from "@/lib/speech";
import { C } from "@/theme";

type DialogState =
  { kind: "add" } | { kind: "edit"; stop: Stop } | { kind: "route" } | { kind: "excel" } | { kind: "settings" } | null;

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SHOW_TOP_AFTER = 700;

export function MainScreen({ onServerChange }: { onServerChange: (url: string) => void }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

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
  const [showMap, setShowMap] = useState(true);
  const [full, setFull] = useState(false);
  const [drive, setDrive] = useState(false);
  const [voice, setVoice] = useState(false);
  const [restOnly, setRestOnly] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState("");
  const [last, setLast] = useState<Stop | null>(null);
  const [infoId, setInfoId] = useState("");
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const [showTop, setShowTop] = useState(false);
  const [rootHeight, setRootHeight] = useState(height);
  const scroll = useRef<ScrollViewInstance>(null);
  const mapRef = useRef<TourMapHandle>(null);
  /** A lista helye a görgethető tartalomban (a kártyákhoz görgetéshez): a fő rész és azon belül a lista. */
  const mainY = useRef(0);
  const listY = useRef(0);
  const placeList = () => selection.placeList(mainY.current + listY.current);
  const selection = useSelection(scroll, stops);
  const found = useSearch(query, day, data.version, data.absorb);

  const pending = (s: Stop) => isPending(s, deliveries);

  // ——— Helyzet, kapcsolat, útvonal, navigáció ———
  const { gps, heading, watch } = useLocation();
  const connection = useConnection();
  const onQueued = () => {
    connection.refreshPending();
    showToast("📴 Nincs internet – a jelölés elmentve, amint lesz hálózat, elküldöm.");
  };

  // a helymeghatározás induláskor (a következő cím távolságához, és a térképhez)
  useEffect(() => {
    void watch();
  }, [watch]);
  // az úthálózat a háttérben betöltődik (és elmentődik) az offline útvonaltervezéshez
  useEffect(() => {
    if (showMap) void loadRoadGraph();
  }, [showMap]);

  const routeLine = useRouteLine({
    enabled: showMap,
    stops,
    restOnly,
    isPending: pending,
    gps,
    online: connection.online,
  });
  const tour = useRef(false);

  const leaveMapMode = () => {
    setFull(false);
    setDrive(false);
  };
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
    online: connection.online,
    watch,
    onMessage: setMessage,
    onStarted: () => {
      setInfoId("");
      setFull(true);
      setDrive(true);
    },
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

  function afterMark(s: Stop, d: Deliveries) {
    if (!isHandled(s, d)) {
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

  async function saveMark(ids: string[], status: Parameters<typeof api.mark>[2]) {
    try {
      if (await api.mark(ids, day, status)) onQueued();
    } catch (e) {
      Alert.alert("A jelölés nem mentődött", errorText(e));
    }
  }

  function cyclePaper(s: Stop, p: Paper) {
    const current = deliveries[p.id];
    const status = nextStatus(current);
    const next = withStatus(deliveries, p.id, status);
    data.setDeliveries((d) => withStatus(d, p.id, status));
    data.setSince((old) => {
      if (!old[p.id]) return old;
      const { [p.id]: _, ...rest } = old;
      return rest;
    });
    if (status === "cancelled") showToast(`🚫 ${p.paper} – ${s.address}: lemondva mától, amíg át nem állítod.`);
    else if (current === "cancelled") showToast(`✔ ${p.paper} – ${s.address}: a lemondás mától megszűnt.`);
    setLast(s);
    afterMark(s, next);
    void saveMark([p.id], status);
  }

  function markAllDelivered(s: Stop) {
    const ids = s.stop_papers.filter((p) => !deliveries[p.id]).map((p) => p.id);
    const marks = Object.fromEntries(ids.map((id) => [id, "delivered" as const]));
    data.setDeliveries((d) => ({ ...d, ...marks }));
    setLast(s);
    afterMark(s, { ...deliveries, ...marks });
    if (ids.length) void saveMark(ids, "delivered");
  }

  // ——— Címek helye és sorrendje ———

  async function geocodeRoute(all = false, target = route) {
    try {
      setBusy("Címek keresése…");
      const list = (await api.stops(target, day)).stops.filter((s) => all || !isLocated(s));
      if (!list.length) {
        setMessage("Minden címnek megvan a helye.");
        return;
      }
      setMessage(await geocodeStops(list));
      await data.loadRoute(target);
      await data.loadAll();
    } catch (e) {
      setMessage("A címek helyének keresése nem sikerült: " + errorText(e));
    } finally {
      setBusy("");
    }
  }

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

  async function mapAndSort(all = false) {
    if (busy) return;
    await geocodeRoute(all, route);
    await sortByProximity(true);
  }

  async function saveMapOffline() {
    if (busy) return;
    setBusy("Térkép mentése…");
    setShowMap(true);
    try {
      const points =
        (await api.stops("all", day).catch(() => null))?.stops.filter(isLocated) ?? allStops.filter(isLocated);
      if (!points.length) {
        setMessage("Előbb a címek helye kell (Címek feltérképezése), utána menthető a térkép.");
        return;
      }
      const status = await saveOfflineMap(points, (done, total) =>
        setMessage(`Térkép mentése offline használatra: ${done} / ${total} térképrészlet…`),
      );
      setMessage(
        `📥 Offline térkép mentve: ${status.tiles} térképrészlet` +
          (status.roads
            ? " és az úthálózat (útvonaltervezés internet nélkül is)."
            : ". Az úthálózat most nem töltődött le – próbáld újra."),
      );
    } finally {
      setBusy("");
    }
  }

  // a térkép megnyitásakor: minden túra címei
  useEffect(() => {
    if (showMap) data.loadAll().catch(() => setMessage("A címek betöltése a térképhez nem sikerült."));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- térkép megnyitásakor / napváltáskor
  }, [showMap, day]);

  // ——— Térkép és lista kapcsolata ———

  const findStop = (id: string) => stops.find((s) => s.id === id) ?? allStops.find((s) => s.id === id);

  /** Koppintás egy címre a térképen: elsőre kis ablak, másodszorra ugrás a listában a címhez. */
  function onPinPick(id: string) {
    if (infoId !== id) {
      setInfoId(id);
      return;
    }
    openInList(id);
  }

  function openInList(id: string) {
    const stop = findStop(id);
    if (!stop) return;
    setInfoId("");
    if (stop.route_id && stop.route_id !== route) setRoute(stop.route_id);
    if (full) leaveMapMode();
    setFilter("");
    setQuery("");
    setFocus(null);
    selection.select(id);
  }

  /** Koppintás egy kártyára: fel a térképhez, és a cím megmutatása. */
  function showOnMap(s: Stop) {
    selection.select(s.id, "🗺️ A térképen mutatott cím", false);
    if (isLocated(s))
      setFocus({ lat: s.lat, lon: s.lon, label: `${s.address}${s.name ? " – " + s.name : ""}`, k: Date.now() });
    else {
      setFocus(null);
      setMessage(`„${s.address}” helye még nincs meg a térképen (Címek feltérképezése).`);
    }
    setShowMap(true);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  function onMenu(action: MenuAction) {
    switch (action) {
      case "summary":
        setSummary(summaryText(stops, deliveries, day, route));
        break;
      case "sort":
        void sortByProximity();
        break;
      case "locate":
        setShowMap(true);
        void mapAndSort();
        break;
      case "relocate":
        void ask(
          "Újraszámolás",
          "A túra minden címének helyét újraszámolja, a kézzel javítottakat is. Folytatod?",
        ).then((ok) => {
          if (ok) void mapAndSort(true);
        });
        break;
      case "offline":
        void saveMapOffline();
        break;
      case "route":
      case "excel":
      case "settings":
        setDialog({ kind: action });
        break;
    }
  }

  function onStopAdded(result: CreateResult, routeId: string) {
    setDialog(null);
    if (result.merged && result.match) {
      setMessage(
        result.added?.length
          ? `${result.match.address}: hozzáadva ${result.added.join(", ")}`
          : `${result.match.address}: ezek az újságok már rajta voltak.`,
      );
    }
    if (routeId === route) void data.loadRoute(route);
    else setRoute(routeId);
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
  const pins = useMemo(
    () =>
      buildPins(allStops, {
        deliveries,
        route,
        nextId: next?.stop.id,
        restOrder: routeLine.restOrder,
        restOnly,
        hideDone,
        keepId: selection.selected,
      }),
    [allStops, deliveries, route, next?.stop.id, routeLine.restOrder, restOnly, hideDone, selection.selected],
  );
  const fitIds = useMemo(() => stops.filter(isLocated).map((s) => s.id), [stops]);
  const navTarget = (to: Stop) => findStop(to.id) ?? to;
  const infoStop = infoId ? findStop(infoId) : undefined;
  const locatedCount = allStops.filter(isLocated).length;
  const routeNote = routes.find((r) => r.id === route)?.note;

  // a térkép magassága: teljes képernyőn az egész kijelző, különben a nagyobbik része
  const mapHeight = full ? rootHeight : Math.round(rootHeight * 0.55);

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
      onLayoutY={routeTag ? undefined : (y) => selection.placeCard(s.id, y)}
    />
  );

  const banner = (!connection.online || connection.pendingMarks > 0) && (
    <View style={s.offline}>
      <Text style={s.offlineText}>
        {!connection.online
          ? "📴 Nincs internet – a térkép és az útvonal a mentett adatokból működik."
          : "🔄 Küldés folyamatban…"}
        {connection.pendingMarks > 0 && ` ${connection.pendingMarks} jelölés vár küldésre.`}
      </Text>
    </View>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {banner}
      <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setRootHeight(e.nativeEvent.layout.height)}>
        <ScrollView
          ref={scroll}
          scrollEnabled={!full}
          keyboardShouldPersistTaps="handled"
          onScroll={(e) => setShowTop(e.nativeEvent.contentOffset.y > SHOW_TOP_AFTER)}
          scrollEventThrottle={200}
          contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        >
          {/* a térkép a legfelül, utána a fejléc (túrák, nap, gombok) és a lista */}
          {showMap && (
            <View style={{ height: mapHeight }}>
              <TourMap
                ref={mapRef}
                pins={pins}
                fitIds={fitIds}
                me={navigation.shownPosition}
                heading={navigation.shownHeading}
                line={nav?.coords ?? routeLine.line}
                cut={
                  nav && navigation.onRoute && navigation.snap ? { i: navigation.snap.i, pt: navigation.snap.pt } : null
                }
                follow={!!nav}
                drive={drive}
                online={connection.online}
                focus={focus}
                onPick={onPinPick}
                onMapPress={() => setInfoId("")}
              />
              <MapButtons
                full={full}
                drive={drive}
                restOnly={restOnly}
                navigating={!!nav}
                onToggleFull={() => {
                  setFull(!full);
                  scroll.current?.scrollTo({ y: 0, animated: false });
                }}
                onToggleDrive={() => {
                  void watch();
                  setDrive(!drive);
                }}
                onLocate={() => {
                  void watch();
                  if (gps) mapRef.current?.center(gps);
                  else setMessage("Helyzet meghatározása…");
                }}
                onToggleRest={() => setRestOnly(!restOnly)}
              />
              {nav && (
                <>
                  <NavTop {...navProps()} />
                  <NavBottom {...navProps()} />
                </>
              )}
              {!nav && infoStop && (
                <PinInfo
                  stop={infoStop}
                  deliveries={deliveries}
                  since={since}
                  onCycle={cyclePaper}
                  onOpen={() => openInList(infoStop.id)}
                  onNavigate={() => startTour(infoStop)}
                  onClose={() => setInfoId("")}
                />
              )}
            </View>
          )}

          {!full && (
            <>
              {showMap && (
                <View style={s.mapInfo}>
                  <Text style={s.meta}>
                    {locatedCount} / {allStops.length} cím helye ismert
                    {hideDone ? ` · az elintézett címek rejtve (${pins.length} látható)` : ""}
                  </Text>
                  {!!routeLine.message && <Text style={s.meta}>{routeLine.message}</Text>}
                  {next && !nav && (
                    <View style={s.next}>
                      <Text style={s.nextText}>
                        Következő: <Text style={{ fontWeight: "800" }}>{next.stop.address}</Text>
                        {next.distance != null && ` (${Math.round(next.distance)} m)`}
                      </Text>
                      <Btn small variant="on" label="➤ Navigálás" onPress={() => startTour(next.stop)} />
                    </View>
                  )}
                </View>
              )}

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
                busy={busy}
                onToggleMap={() => setShowMap(!showMap)}
                onAddStop={() => setDialog({ kind: "add" })}
                onMenu={onMenu}
              />

              <View
                style={s.main}
                onLayout={(e) => {
                  mainY.current = e.nativeEvent.layout.y;
                  placeList();
                }}
              >
                {!!message && (
                  <Pressable onPress={() => setMessage("")} style={s.message}>
                    <Text style={s.messageText}>{message}</Text>
                    <Text style={s.close}>✕</Text>
                  </Pressable>
                )}
                <Field
                  placeholder="🔎 Keresés: utca, házszám vagy név (minden túrában)"
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                {!query.trim() && (
                  <FilterBar value={filter} counts={counts} total={papers.length} onChange={setFilter} />
                )}
                {!!summary && (
                  <View style={s.summary}>
                    <Text selectable style={s.summaryText}>
                      {summary}
                    </Text>
                    <View style={s.row}>
                      <Btn small label="Megosztás" onPress={() => Share.share({ message: summary })} />
                      <Btn small variant="muted" label="Bezár" onPress={() => setSummary("")} />
                    </View>
                  </View>
                )}
                {!!routeNote && <Text style={s.note}>{routeNote}</Text>}

                {query.trim() ? (
                  <>
                    <Text style={[s.meta, { marginVertical: 6 }]}>{found.length} találat (minden túrában)</Text>
                    {found.map((x) => card(x, null, x.route_id))}
                  </>
                ) : (
                  <View
                    onLayout={(e) => {
                      listY.current = e.nativeEvent.layout.y;
                      placeList();
                    }}
                  >
                    {stops.map((x, i) => (matchesFilter(x, deliveries, filter) ? card(x, i) : null))}
                    {!stops.length && <Text style={s.meta}>Ebben a túrában még nincs cím.</Text>}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>

      {!!toast && (
        <Pressable style={[s.toast, { bottom: insets.bottom + 20 }]} onPress={hideToast}>
          <Text style={s.toastText}>{toast}</Text>
        </Pressable>
      )}
      {advance.advance && (
        <AdvanceBanner
          advance={advance.advance}
          secondsLeft={advance.secondsLeft}
          onGoNow={advance.goNow}
          onStay={advance.cancel}
        />
      )}
      {showTop && !full && (
        <Pressable
          style={[s.top, { bottom: insets.bottom + 20 }]}
          onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })}
          accessibilityLabel="Az oldal tetejére"
        >
          <Text style={s.topText}>↑</Text>
        </Pressable>
      )}

      {dialog?.kind === "add" && (
        <AddStopDialog
          routes={routes}
          defaultRoute={route}
          meta={meta}
          onClose={() => setDialog(null)}
          onSaved={onStopAdded}
        />
      )}
      {dialog?.kind === "edit" && (
        <EditStopDialog
          stop={dialog.stop}
          meta={meta}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void data.loadRoute(route);
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
      {dialog?.kind === "settings" && (
        <SettingsDialog
          onClose={() => setDialog(null)}
          onSave={(url) => {
            setDialog(null);
            onServerChange(url);
          }}
        />
      )}
    </View>
  );

  function navProps() {
    return {
      nav: nav!,
      stepIndex: navigation.stepIndex,
      snap: navigation.snap,
      onRoute: navigation.onRoute,
      rerouting: navigation.rerouting,
      gps,
      target: navTarget(nav!.to),
      deliveries,
      since,
      voice,
      onCycle: cyclePaper,
      onReroute: () => navigation.start(nav!.to, true),
      onToggleVoice: () => setVoice(!voice),
      onStop: stopTour,
    };
  }
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  offline: { backgroundColor: "#5d4037", paddingVertical: 6, paddingHorizontal: 12 },
  offlineText: { color: "#fff", fontSize: 13 },
  mapInfo: { paddingHorizontal: 12, paddingTop: 6, gap: 4 },
  meta: { color: C.mu, fontSize: 13 },
  next: {
    backgroundColor: C.dark,
    borderRadius: 12,
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  nextText: { color: "#fff", flex: 1, fontSize: 15 },
  main: { paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  message: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: "#e8eef5",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#c5d3e3",
  },
  messageText: { flex: 1, color: C.tx },
  close: { color: C.mu, fontWeight: "700" },
  summary: { backgroundColor: C.card, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: C.bd, gap: 8 },
  summaryText: { fontFamily: "monospace", fontSize: 13, color: C.tx },
  row: { flexDirection: "row", gap: 8 },
  note: { backgroundColor: "#fff8e1", borderRadius: 8, padding: 8, color: C.tx },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: C.dark,
    borderRadius: 12,
    padding: 12,
    elevation: 8,
  },
  toastText: { color: "#fff", fontSize: 15 },
  top: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.ac,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
  topText: { color: "#fff", fontSize: 22, fontWeight: "800" },
});
