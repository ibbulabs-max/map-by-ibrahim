import { useNavigate } from "@tanstack/react-router";
import { ArrowUpDown, Filter, Inbox, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState, GlassCard } from "@/components/glass";
import { PinDetailsSheet } from "@/components/PinDetailsSheet";
import { PinFormSheet } from "@/components/PinFormSheet";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useDeletePin, usePins, useSavePin, type PinDraft } from "@/hooks/usePins";
import { PIN_TYPES, distanceMeters, formatDistance, pinTypeDef, pinTypeLabel, type Pin } from "@/lib/pin-types";
import { cn } from "@/lib/utils";

type SortKey = "newest" | "oldest" | "distance" | "house";

export function RecordsView() {
  const navigate = useNavigate();
  const { session, profile } = useAuth();
  const { position } = useGeolocation();
  const { data: pins = [], isLoading } = usePins();
  const deletePin = useDeletePin();
  const savePin = useSavePin();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Pin | null>(null);
  const [editing, setEditing] = useState<Pin | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = pins.filter((pin) => {
      if (typeFilter && pin.pin_type !== typeFilter) return false;
      if (mineOnly && pin.user_id !== session?.user.id) return false;
      if (!q) return true;
      return [pin.house_id, pin.house_number, pin.owner_name, pin.username, pin.custom_type, pinTypeLabel(pin.pin_type, pin.custom_type), `${pin.latitude},${pin.longitude}`]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => {
      if (sort === "newest") return b.created_at.localeCompare(a.created_at);
      if (sort === "oldest") return a.created_at.localeCompare(b.created_at);
      if (sort === "house") return (a.house_id ?? "~").localeCompare(b.house_id ?? "~");
      if (!position) return 0;
      return (
        distanceMeters(position, { lat: a.latitude, lng: a.longitude }) -
        distanceMeters(position, { lat: b.latitude, lng: b.longitude })
      );
    });
    return list;
  }, [pins, query, typeFilter, mineOnly, sort, position, session?.user.id]);

  return (
    <>
      <div>
        <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="House ID, user, type, location"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          <Chip active={mineOnly} onClick={() => setMineOnly((v) => !v)} icon={<Filter className="size-3.5" />}>
            Mine
          </Chip>
          <Chip
            active={false}
            onClick={() =>
              setSort((s) =>
                s === "newest" ? "oldest" : s === "oldest" ? "distance" : s === "distance" ? "house" : "newest",
              )
            }
            icon={<ArrowUpDown className="size-3.5" />}
          >
            {sort === "newest" ? "Newest" : sort === "oldest" ? "Oldest" : sort === "distance" ? "Nearest" : "House ID"}
          </Chip>
          <Chip active={typeFilter === null} onClick={() => setTypeFilter(null)}>
            All types
          </Chip>
          {PIN_TYPES.map((t) => (
            <Chip key={t.value} active={typeFilter === t.value} onClick={() => setTypeFilter(t.value)}>
              {t.label}
            </Chip>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading records…</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-7" />}
              title="No records yet"
              description="Pins you drop on the map will appear here, searchable and sortable."
            />
          ) : (
            rows.map((pin) => {
              const def = pinTypeDef(pin.pin_type);
              const Icon = def.icon;
              const dist = position
                ? distanceMeters(position, { lat: pin.latitude, lng: pin.longitude })
                : null;
              return (
                <GlassCard key={pin.id} className="press overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSelected(pin)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-2xl text-white"
                      style={{ background: def.color }}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {pin.house_id || pinTypeLabel(pin.pin_type, pin.custom_type)}
                      </span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {pinTypeLabel(pin.pin_type, pin.custom_type)} · {pin.username} ·{" "}
                        {new Date(pin.created_at).toLocaleDateString()}{" "}
                        {new Date(pin.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                    {dist != null ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                        {formatDistance(dist)}
                      </span>
                    ) : null}
                  </button>
                </GlassCard>
              );
            })
          )}
        </div>
      </div>

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
        }}
        onDelete={(pin) =>
          deletePin.mutate(pin.id, {
            onSuccess: () => {
              toast.success("Pin deleted");
              setSelected(null);
            },
            onError: (e) => toast.error(e.message),
          })
        }
        onOpenMap={() => void navigate({ to: "/map" })}
      />

      <PinFormSheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        coords={editing ? { lat: editing.latitude, lng: editing.longitude } : null}
        accuracy={editing?.accuracy ?? null}
        editing={editing}
        saving={savePin.isPending}
        onSave={(draft: PinDraft) => {
          if (!session || !profile || !editing) return;
          savePin.mutate(
            { draft, userId: session.user.id, username: profile.username, id: editing.id },
            {
              onSuccess: () => {
                toast.success("Pin updated");
                setEditing(null);
              },
              onError: (e) => toast.error(e.message),
            },
          );
        }}
      />

    </>
  );
}

function Chip({
  children,
  active,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12px] font-semibold",
        active
          ? "border-primary bg-primary-gradient text-primary-foreground"
          : "border-border bg-card/70 text-muted-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
