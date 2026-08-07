import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useAuth } from "@/hooks/useAuth";
import { formatDistance, pinTypeDef, pinTypeLabel, type Pin } from "@/lib/pin-types";
import { Compass, Crosshair, Pencil, Share2, Trash2 } from "lucide-react";

type Props = {
  pin: Pin | null;
  onOpenChange: (open: boolean) => void;
  distance?: number | null;
  onEdit: (pin: Pin) => void;
  onDelete: (pin: Pin) => void;
  onOpenMap: (pin: Pin) => void;
};

export function PinDetailsSheet({ pin, onOpenChange, distance, onEdit, onDelete, onOpenMap }: Props) {
  const { isAdmin, session } = useAuth();
  if (!pin) return null;
  const def = pinTypeDef(pin.pin_type);
  const Icon = def.icon;
  const canManage = isAdmin || pin.user_id === session?.user.id;

  return (
    <Drawer open={Boolean(pin)} onOpenChange={onOpenChange}>
      <DrawerContent className="glass-strong max-h-[88dvh] rounded-t-[2rem] border-none px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md overflow-y-auto">
          <div className="flex items-center gap-3">
            <span
              className="grid size-12 place-items-center rounded-2xl text-white"
              style={{ background: def.color }}
            >
              <Icon className="size-5" />
            </span>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                {pin.house_id || pinTypeLabel(pin.pin_type, pin.custom_type)}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {pinTypeLabel(pin.pin_type, pin.custom_type)} · by {pin.username}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2">
            <Row label="Latitude" value={pin.latitude.toFixed(6)} />
            <Row label="Longitude" value={pin.longitude.toFixed(6)} />
            <Row label="Accuracy" value={pin.accuracy ? `±${Math.round(pin.accuracy)} m` : "—"} />
            <Row
              label="Distance"
              value={distance == null ? "—" : formatDistance(distance)}
            />
            {pin.house_number ? <Row label="House number" value={pin.house_number} /> : null}
            {pin.owner_name ? <Row label="Owner" value={pin.owner_name} /> : null}
            <Row label="Created" value={new Date(pin.created_at).toLocaleString()} />
            <Row label="Updated" value={new Date(pin.updated_at).toLocaleString()} />
            {pin.device_id ? <Row label="Device" value={pin.device_id.slice(0, 8)} /> : null}
          </dl>

          {pin.notes ? (
            <p className="mt-3 rounded-2xl border border-border bg-card/70 px-4 py-3 text-sm">
              {pin.notes}
            </p>
          ) : null}

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Action icon={<Crosshair className="size-4" />} label="Open on map" onClick={() => onOpenMap(pin)} />
            <Action
              icon={<Compass className="size-4" />}
              label="Navigate"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${pin.latitude},${pin.longitude}`,
                  "_blank",
                  "noopener",
                )
              }
            />
            <Action
              icon={<Share2 className="size-4" />}
              label="Share"
              onClick={() => {
                const text = `${pinTypeLabel(pin.pin_type, pin.custom_type)}${pin.house_id ? ` ${pin.house_id}` : ""} — https://www.openstreetmap.org/?mlat=${pin.latitude}&mlon=${pin.longitude}`;
                if (navigator.share) void navigator.share({ text });
                else void navigator.clipboard.writeText(text);
              }}
            />
            <Action icon={<Pencil className="size-4" />} label="Edit" onClick={() => onEdit(pin)} />
          </div>

          {canDelete ? (
            <button
              type="button"
              onClick={() => onDelete(pin)}
              className="press mt-2.5 flex w-full items-center justify-center gap-2 rounded-2xl bg-destructive/10 py-3.5 text-sm font-semibold text-destructive"
            >
              <Trash2 className="size-4" />
              Delete pin
            </button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3.5 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="text-[13px] font-medium">{value}</dd>
    </div>
  );
}

function Action({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex items-center justify-center gap-2 rounded-2xl border border-border bg-card/70 py-3.5 text-sm font-semibold"
    >
      {icon}
      {label}
    </button>
  );
}
