import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Crosshair,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { PinDetailsSheet } from "@/components/PinDetailsSheet";
import { PinFormSheet } from "@/components/PinFormSheet";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useDeletePin, usePins, useSavePin, type PinDraft } from "@/hooks/usePins";
import { supabase } from "@/integrations/supabase/client";
import { PIN_TYPES, distanceMeters, pinTypeDef, pinTypeLabel, type Pin } from "@/lib/pin-types";
import { teamPeople } from "@/lib/team.functions";

const LeafletMap = lazy(() => import("@/components/map/LeafletMap"));

type MapSearch = { user?: string; supervisor?: string };

export const Route = createFileRoute("/_authenticated/map")({
  validateSearch: (search: Record<string, unknown>): MapSearch => {
    const out: MapSearch = {};
    if (typeof search["user"] === "string") out.user = search["user"];
    if (typeof search["supervisor"] === "string") out.supervisor = search["supervisor"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Survey Map — Smart Survey Map" },
      { name: "description", content: "Live GPS map with every surveyed household and place." },
      { property: "og:title", content: "Survey Map — Smart Survey Map" },
      { property: "og:description", content: "Live GPS map with every surveyed household and place." },
    ],
  }),
  component: MapScreen,
});

function MapScreen() {
  const { session, profile, role, isAdmin, isSupervisor } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const fetchPeople = useServerFn(teamPeople);
  const peopleQuery = useQuery({
    queryKey: ["team", "people"],
    queryFn: () => fetchPeople({ data: undefined }),
    enabled: isAdmin || isSupervisor,
  });
  const people = peopleQuery.data?.people ?? [];
  const { position, heading, error: geoError, retry } = useGeolocation();
  const { data: allPins = [] } = usePins();

  // ---- scope (person / team) ----
  const teamIds = search.supervisor
    ? new Set(people.filter((p) => p.supervisor_id === search.supervisor).map((p) => p.id))
    : null;
  const scopedPins = useMemo(
    () =>
      allPins.filter((pin) => {
        if (search.user) return pin.user_id === search.user;
        if (teamIds) return teamIds.has(pin.user_id);
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPins, search.user, search.supervisor, peopleQuery.data],
  );

  // ---- pin type filter ----
  const [types, setTypes] = useState<string[]>([]); // empty = all pins
  const [showPins, setShowPins] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pins = useMemo(
    () => (types.length ? scopedPins.filter((p) => types.includes(p.pin_type)) : scopedPins),
    [scopedPins, types],
  );

  const countOf = useCallback(
    (list: Pin[], type: string) => list.filter((p) => p.pin_type === type).length,
    [],
  );
  const filtered = types.length > 0;
  const counterSource = filtered ? pins : scopedPins;
  const counters = {
    total: counterSource.length,
    house: countOf(counterSource, "house"),
    shop: countOf(counterSource, "shop"),
    locked: countOf(counterSource, "locked_house"),
    refused: countOf(counterSource, "refused"),
    empty: countOf(counterSource, "empty_land"),
  };

  const focusPerson = people.find((p) => p.id === search.user);
  const savePin = useSavePin();
  const deletePin = useDeletePin();

  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Pin | null>(null);
  const [selected, setSelected] = useState<Pin | null>(null);
  const [stack, setStack] = useState<Pin[] | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [move, setMove] = useState<{ pin: Pin; lat: number; lng: number } | null>(null);

  const canMove = useCallback(
    (pin: Pin) => isAdmin || isSupervisor || pin.user_id === session?.user.id,
    [isAdmin, isSupervisor, session],
  );

  // In Add Pin Mode a tap drops / moves the temporary marker.
  const handleTap = useCallback(
    (latlng: { lat: number; lng: number }) => {
      if (editMode) return;
      setEditing(null);
      setDraft(latlng);
      setPlacing(true);
      setFormOpen(true);
    },
    [editMode],
  );

  const handleSelect = useCallback((pin: Pin) => setSelected(pin), []);
  const handleSelectMany = useCallback((group: Pin[]) => setStack(group), []);
  const handleDragged = useCallback((pin: Pin, latlng: { lat: number; lng: number }) => {
    setMove({ pin, lat: latlng.lat, lng: latlng.lng });
  }, []);

  function resetPlacing() {
    setFormOpen(false);
    setPlacing(false);
    setDraft(null);
    setEditing(null);
  }

  function startPlacing() {
    setEditMode(false);
    setEditing(null);
    setPlacing(true);
    if (position) {
      setDraft({ lat: position.lat, lng: position.lng });
      setFormOpen(true);
    } else {
      toast.info("Tap the map to drop a pin");
    }
  }

  function handleSave(pinDraft: PinDraft) {
    if (!session || !profile) return;
    savePin.mutate(
      {
        draft: pinDraft,
        userId: session.user.id,
        username: profile.username,
        ...(editing ? { id: editing.id } : {}),
      },
      {
        onSuccess: () => {
          toast.success(editing ? "Pin updated" : "Pin saved");
          void logActivity(editing ? "pin_edited" : "pin_created", {
            pin_id: editing?.id ?? null,
          });
          resetPlacing();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  async function logActivity(action: string, details: Record<string, unknown>) {
    if (!session || !profile) return;
    await supabase.from("activity_logs").insert({
      user_id: session.user.id,
      username: profile.username,
      action,
      details: { role, ...details },
    });
  }

  function confirmMove() {
    if (!move) return;
    const { pin, lat, lng } = move;
    savePin.mutate(
      {
        id: pin.id,
        userId: pin.user_id,
        username: pin.username,
        draft: {
          latitude: lat,
          longitude: lng,
          accuracy: pin.accuracy,
          pin_type: pin.pin_type,
          custom_type: pin.custom_type,
          house_id: pin.house_id,
          house_number: pin.house_number,
          owner_name: pin.owner_name,
          notes: pin.notes,
        },
      },
      {
        onSuccess: () => {
          toast.success("Location updated");
          void logActivity("pin_moved", {
            pin_id: pin.id,
            old_latitude: pin.latitude,
            old_longitude: pin.longitude,
            new_latitude: lat,
            new_longitude: lng,
          });
          setMove(null);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-muted md:pl-60">
      <div className="absolute inset-0 z-0">
        <Suspense
          fallback={
            <div className="grid h-full place-items-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          }
        >
          <LeafletMap
            pins={pins}
            showPins={showPins}
            position={position}
            heading={heading}
            draft={draft}
            focus={focus}
            addMode={placing}
            editMode={editMode}
            canMove={canMove}
            onMapTap={handleTap}
            onDraftMove={setDraft}
            onSelectPin={handleSelect}
            onSelectMany={handleSelectMany}
            onPinDragged={handleDragged}
          />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 max-h-dvh overflow-y-auto px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-40">
        <div className="glass pointer-events-auto flex items-center justify-between rounded-3xl px-4 py-3">
          <div>
            <p className="text-[15px] font-semibold leading-tight">Survey Map</p>
            <p className="text-[12px] text-muted-foreground">
              {position
                ? `GPS accuracy ±${Math.round(position.accuracy)} m · ${pins.length} pins`
                : geoError
                  ? "Location unavailable"
                  : "Locating…"}
            </p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary">
            <MapPin className="size-3.5" />
            {pins.length}
          </span>
        </div>

        {isAdmin || isSupervisor ? (
          <div className="glass pointer-events-auto mt-2 flex items-center gap-2 rounded-2xl px-3 py-2.5">
            <Users className="size-4 shrink-0 text-muted-foreground" />
            <select
              value={search.user ?? ""}
              onChange={(e) =>
                void navigate({
                  to: "/map",
                  search: e.target.value ? { user: e.target.value } : {},
                })
              }
              className="w-full bg-transparent text-[13px] font-medium outline-none"
            >
              <option value="">All team members</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username.toUpperCase()} — {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {search.user || search.supervisor ? (
          <div className="glass pointer-events-auto mt-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
            <p className="truncate text-[12px] font-medium">
              Viewing: {focusPerson ? `${focusPerson.name} (${focusPerson.username.toUpperCase()})` : "Team"}
            </p>
            <button
              type="button"
              onClick={() => void navigate({ to: "/map", search: {} })}
              className="press shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary"
            >
              Clear Filter
            </button>
          </div>
        ) : null}

        {/* pin type filter + show/hide */}
        <div className="glass pointer-events-auto mt-2 rounded-2xl px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              className="press min-w-0 flex-1 truncate rounded-xl bg-card/70 px-3 py-2 text-left text-[12px] font-semibold"
            >
              {types.length === 0
                ? "All Pins"
                : types.length === 1
                  ? pinTypeDef(types[0]!).label
                  : `${types.length} pin types`}
            </button>
            <button
              type="button"
              onClick={() => setShowPins((v) => !v)}
              className={`press flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold ${
                showPins ? "bg-primary/10 text-primary" : "bg-card/70 text-muted-foreground"
              }`}
            >
              {showPins ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {showPins ? "Show Pins" : "Hide Pins"}
            </button>
          </div>

          {filtersOpen ? (
            <div className="mt-2.5 max-h-56 overflow-y-auto pr-1">
              <button
                type="button"
                onClick={() => setTypes([])}
                className={`press mb-1.5 w-full rounded-xl px-3 py-2 text-left text-[12px] font-semibold ${
                  types.length === 0 ? "bg-primary/15 text-primary" : "bg-card/70"
                }`}
              >
                All Pins · {scopedPins.length}
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                {PIN_TYPES.map((t) => {
                  const on = types.includes(t.value);
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() =>
                        setTypes((prev) =>
                          prev.includes(t.value)
                            ? prev.filter((v) => v !== t.value)
                            : [...prev, t.value],
                        )
                      }
                      className={`press flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-[11px] font-medium ${
                        on ? "bg-primary/15 text-primary" : "bg-card/70"
                      }`}
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: t.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{t.label}</span>
                      <span className="shrink-0 tabular-nums opacity-70">
                        {countOf(scopedPins, t.value)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="glass pointer-events-auto mt-2 rounded-2xl px-3 py-2">
          <p className="mb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {filtered ? "Filtered data" : "All data"}
          </p>
          <div className="grid grid-cols-6 gap-1 text-center">
            {[
              ["Houses", counters.house],
              ["Shops", counters.shop],
              ["Locked", counters.locked],
              ["Refused", counters.refused],
              ["Land", counters.empty],
              ["Total", counters.total],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-[13px] font-semibold">{value}</p>
                <p className="text-[9px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {geoError && !position ? (
          <div className="glass pointer-events-auto mt-2 flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5">
            <p className="text-[12px] font-medium text-muted-foreground">{geoError}</p>
            <button
              type="button"
              onClick={retry}
              className="press flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-[12px] font-semibold text-primary"
            >
              <RefreshCw className="size-3.5" />
              Retry
            </button>
          </div>
        ) : null}

        {editMode ? (
          <div className="glass pointer-events-auto mt-2 flex items-center justify-between rounded-2xl px-4 py-2.5">
            <p className="text-[13px] font-medium">Edit mode — drag a pin to move it</p>
            <button
              type="button"
              onClick={() => {
                setEditMode(false);
                setMove(null);
              }}
              className="press grid size-7 place-items-center rounded-full bg-card"
              aria-label="Exit edit mode"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {move ? (
          <div className="glass pointer-events-auto mt-2 rounded-2xl px-4 py-3">
            <p className="text-[13px] font-semibold">
              Move {pinTypeLabel(move.pin.pin_type, move.pin.custom_type)}
              {move.pin.house_id ? ` · ${move.pin.house_id}` : ""}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Original: {move.pin.latitude.toFixed(6)}, {move.pin.longitude.toFixed(6)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              New: {move.lat.toFixed(6)}, {move.lng.toFixed(6)}
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMove(null)}
                className="press rounded-xl bg-card/70 py-2.5 text-[12px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savePin.isPending}
                onClick={confirmMove}
                className="press flex items-center justify-center gap-1.5 rounded-xl bg-primary-gradient py-2.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-70"
              >
                <Check className="size-3.5" />
                Save Location
              </button>
            </div>
          </div>
        ) : null}

        {placing && !formOpen ? (
          <div className="glass pointer-events-auto mt-2 flex items-center justify-between rounded-2xl px-4 py-2.5">
            <p className="text-[13px] font-medium">Tap the map to place your pin</p>
            <button
              type="button"
              onClick={resetPlacing}
              className="press grid size-7 place-items-center rounded-full bg-card"
              aria-label="Exit add pin mode"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => {
          setPlacing(false);
          setEditMode((v) => !v);
          setMove(null);
        }}
        className={`press glass absolute bottom-60 right-4 z-30 grid size-12 place-items-center rounded-2xl ${
          editMode ? "text-primary-foreground [background:var(--primary-gradient,theme(colors.primary.DEFAULT))]" : "text-primary"
        }`}
        aria-label="Edit pin locations"
      >
        <Pencil className="size-5" />
      </button>

      <button
        type="button"
        onClick={() => position && setFocus({ lat: position.lat, lng: position.lng })}
        className="press glass absolute bottom-44 right-4 z-30 grid size-12 place-items-center rounded-2xl text-primary"
        aria-label="Center on my location"
      >
        <Crosshair className="size-5" />
      </button>

      <button
        type="button"
        onClick={startPlacing}
        className="press glass-strong absolute bottom-28 right-4 z-30 grid size-16 place-items-center rounded-full text-primary shadow-[var(--shadow-float)]"
        aria-label="Add pin"
      >
        <Plus className="size-7" strokeWidth={2.6} />
      </button>

      <PinFormSheet
        open={formOpen}
        onOpenChange={(open) => {
          if (open) setFormOpen(true);
          else resetPlacing();
        }}
        coords={draft}
        accuracy={position?.accuracy ?? null}
        editing={editing}
        saving={savePin.isPending}
        onSave={handleSave}
      />

      <Drawer open={Boolean(stack)} onOpenChange={(open) => !open && setStack(null)}>
        <DrawerContent className="glass-strong max-h-[70dvh] rounded-t-[2rem] border-none px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-md overflow-y-auto">
            <h2 className="text-lg font-semibold tracking-tight">Multiple pins found</h2>
            <p className="mb-3 text-[12px] text-muted-foreground">
              {stack?.length ?? 0} pins at this location — select one to see its details.
            </p>
            <div className="space-y-2">
              {(stack ?? []).map((p) => {
                const def = pinTypeDef(p.pin_type);
                const Icon = def.icon;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setStack(null);
                      setSelected(p);
                    }}
                    className="press flex w-full items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-left"
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-2xl text-white"
                      style={{ background: def.color }}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">
                        {pinTypeLabel(p.pin_type, p.custom_type)}
                        {p.house_id ? ` — ${p.house_id}` : ""}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        by {p.username} · {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <PinDetailsSheet
        pin={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        distance={
          position && selected
            ? distanceMeters(position, { lat: selected.latitude, lng: selected.longitude })
            : null
        }
        onEdit={(pin) => {
          setSelected(null);
          setEditing(pin);
          setDraft({ lat: pin.latitude, lng: pin.longitude });
          setFormOpen(true);
        }}
        onDelete={(pin) => {
          deletePin.mutate(pin.id, {
            onSuccess: () => {
              toast.success("Pin deleted");
              void logActivity("pin_deleted", { pin_id: pin.id });
              setSelected(null);
            },
            onError: (e) => toast.error(e.message),
          });
        }}
        onOpenMap={(pin) => {
          setFocus({ lat: pin.latitude, lng: pin.longitude });
          setSelected(null);
        }}
      />

      <BottomNav />
    </div>
  );
}
