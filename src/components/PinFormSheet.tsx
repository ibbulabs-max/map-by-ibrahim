import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { PIN_TYPES } from "@/lib/pin-types";
import type { Pin } from "@/lib/pin-types";
import type { PinDraft } from "@/hooks/usePins";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coords: { lat: number; lng: number } | null;
  accuracy: number | null;
  editing?: Pin | null;
  saving?: boolean;
  onSave: (draft: PinDraft) => void;
};

const HOUSE_TYPES = ["house", "locked_house", "refused", "apartment"];

export function PinFormSheet({
  open,
  onOpenChange,
  coords,
  accuracy,
  editing,
  saving,
  onSave,
}: Props) {
  const [type, setType] = useState("house");
  const [customType, setCustomType] = useState("");
  const [houseId, setHouseId] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setType(editing?.pin_type ?? "house");
    setCustomType(editing?.custom_type ?? "");
    setHouseId(editing?.house_id ?? "");
    setHouseNumber(editing?.house_number ?? "");
    setOwnerName(editing?.owner_name ?? "");
    setNotes(editing?.notes ?? "");
  }, [open, editing]);

  const isHouse = HOUSE_TYPES.includes(type);
  const lat = coords?.lat ?? editing?.latitude ?? 0;
  const lng = coords?.lng ?? editing?.longitude ?? 0;

  function submit() {
    onSave({
      latitude: lat,
      longitude: lng,
      accuracy: accuracy ?? editing?.accuracy ?? null,
      pin_type: type,
      custom_type: type === "other" ? customType.trim().slice(0, 60) || null : null,
      house_id: isHouse ? houseId.trim().slice(0, 40) || null : null,
      house_number: isHouse ? houseNumber.trim().slice(0, 40) || null : null,
      owner_name: isHouse ? ownerName.trim().slice(0, 80) || null : null,
      notes: notes.trim().slice(0, 500) || null,
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="glass-strong max-h-[88dvh] rounded-t-[2rem] border-none px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto w-full max-w-md overflow-y-auto">
          <h2 className="mt-1 text-xl font-semibold tracking-tight">
            {editing ? "Edit pin" : "New pin"}
          </h2>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Readout label="Latitude" value={lat.toFixed(6)} />
            <Readout label="Longitude" value={lng.toFixed(6)} />
          </div>
          {accuracy ? (
            <p className="mt-2 text-[12px] text-muted-foreground">
              GPS accuracy ±{Math.round(accuracy)} m
            </p>
          ) : null}

          <p className="mt-5 mb-2 text-[13px] font-medium text-muted-foreground">Pin type</p>
          <div className="grid grid-cols-4 gap-2">
            {PIN_TYPES.map((def) => {
              const Icon = def.icon;
              const active = type === def.value;
              return (
                <button
                  key={def.value}
                  type="button"
                  onClick={() => setType(def.value)}
                  className={cn(
                    "press flex flex-col items-center gap-1 rounded-2xl border px-1 py-2.5 text-[10px] font-medium leading-tight",
                    active
                      ? "border-primary bg-primary-gradient text-primary-foreground"
                      : "border-border bg-card/70 text-muted-foreground",
                  )}
                >
                  <Icon className="size-[18px]" />
                  <span className="line-clamp-2 text-center">{def.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            {type === "other" ? (
              <Field label="Custom type" value={customType} onChange={setCustomType} placeholder="Describe this place" />
            ) : null}
            {isHouse ? (
              <>
                <Field label="House ID" value={houseId} onChange={setHouseId} placeholder="e.g. H-1042" />
                <Field label="House number" value={houseNumber} onChange={setHouseNumber} placeholder="e.g. 12/B" />
                <Field label="Owner name (optional)" value={ownerName} onChange={setOwnerName} placeholder="Optional" />
              </>
            ) : null}
            <Field label="Notes (optional)" value={notes} onChange={setNotes} placeholder="Anything worth remembering" />
          </div>

          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="press h-13 flex-1 rounded-2xl border border-border bg-card/70 py-3.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={submit}
              className="press grid h-13 flex-[1.6] place-items-center rounded-2xl bg-primary-gradient py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : "Save pin"}
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3.5 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-mono text-[13px] font-medium">{value}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-12 w-full rounded-2xl border border-border bg-card/70 px-4 text-base outline-none transition-all focus:border-primary focus:ring-4 focus:ring-ring/20"
      />
    </label>
  );
}
