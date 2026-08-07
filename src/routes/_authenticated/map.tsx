import { createFileRoute } from "@tanstack/react-router";
import { Crosshair, Loader2, MapPin, Plus, RefreshCw, X } from "lucide-react";
import { Suspense, lazy, useCallback, useState } from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { PinDetailsSheet } from "@/components/PinDetailsSheet";
import { PinFormSheet } from "@/components/PinFormSheet";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useDeletePin, usePins, useSavePin, type PinDraft } from "@/hooks/usePins";
import { distanceMeters, type Pin } from "@/lib/pin-types";

const LeafletMap = lazy(() => import("@/components/map/LeafletMap"));

export const Route = createFileRoute("/_authenticated/map")({
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
  const { session, profile } = useAuth();
  const { position, error: geoError, retry } = useGeolocation();
  const { data: pins = [] } = usePins();
  const savePin = useSavePin();
  const deletePin = useDeletePin();

  const [placing, setPlacing] = useState(false);
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Pin | null>(null);
  const [selected, setSelected] = useState<Pin | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number } | null>(null);

  // Any tap on the map drops a temporary draggable marker and opens the sheet.
  const handleTap = useCallback((latlng: { lat: number; lng: number }) => {
    setEditing(null);
    setDraft(latlng);
    setPlacing(true);
    setFormOpen(true);
  }, []);

  const handleSelect = useCallback((pin: Pin) => setSelected(pin), []);

  function resetPlacing() {
    setFormOpen(false);
    setPlacing(false);
    setDraft(null);
    setEditing(null);
  }

  function startPlacing() {
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
          resetPlacing();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-muted">
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
            position={position}
            draft={draft}
            focus={focus}
            onMapTap={handleTap}
            onDraftMove={setDraft}
            onSelectPin={handleSelect}
          />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="glass pointer-events-auto flex items-center justify-between rounded-3xl px-4 py-3">
          <div>
            <p className="text-[15px] font-semibold leading-tight">Survey Map</p>
            <p className="text-[12px] text-muted-foreground">
              {position
                ? `±${Math.round(position.accuracy)} m · ${pins.length} pins`
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
