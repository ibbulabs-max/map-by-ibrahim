import { useMemo, useState } from "react";
import { Check, MapPinned, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useAuth } from "@/hooks/useAuth";
import { useDeleteMember, useSaveMember, useUpdateHouse } from "@/hooks/useHouses";
import {
  displayValue,
  fieldLabel,
  locationStatusLabel,
  type House,
  type HouseMember,
} from "@/lib/houses";
import { pinTypeLabel } from "@/lib/pin-types";
import { houseRisk, memberRisk, RISK_META } from "@/lib/risk";


type Tab = "house" | "members" | "data";

type Props = {
  house: House | null;
  onOpenChange: (open: boolean) => void;
  onAddLocation?: (house: House) => void;
};

export function HouseDetailsSheet({ house, onOpenChange, onAddLocation }: Props) {
  const { isAdmin, isSupervisor, session } = useAuth();
  const [tab, setTab] = useState<Tab>("house");
  const [surveyMember, setSurveyMember] = useState<string>("__house__");
  const [editing, setEditing] = useState(false);

  const updateHouse = useUpdateHouse();
  const saveMember = useSaveMember();
  const deleteMember = useDeleteMember();

  const members = useMemo(
    () => [...(house?.house_members ?? [])].sort((a, b) => (a.member_id ?? "").localeCompare(b.member_id ?? "")),
    [house],
  );

  if (!house) return null;

  const canEdit =
    isAdmin ||
    isSupervisor ||
    house.assigned_csw_id === session?.user.id ||
    house.created_by === session?.user.id;
  const mapped = house.latitude !== null && house.longitude !== null;

  return (
    <Drawer open={Boolean(house)} onOpenChange={onOpenChange}>
      <DrawerContent className="glass-strong max-h-[90dvh] rounded-t-[2rem] border-none px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight">{house.house_id}</h2>
              <p className="text-[13px] text-muted-foreground">
                House No. {house.house_number || "—"} · {members.length} member
                {members.length === 1 ? "" : "s"} · {locationStatusLabel(house.location_status)}
              </p>
            </div>
            {canEdit ? (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={`press flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                  editing ? "bg-primary-gradient text-primary-foreground" : "bg-primary/10 text-primary"
                }`}
              >
                {editing ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
                {editing ? "Done" : "Edit"}
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-2xl bg-card/60 p-1">
            {(["house", "members", "data"] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`press rounded-xl py-2 text-[12px] font-semibold capitalize ${
                  tab === t ? "bg-primary-gradient text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {t === "data" ? "Survey data" : t}
              </button>
            ))}
          </div>

          <div className="mt-3 max-h-[58dvh] overflow-y-auto pr-1">
            {tab === "house" ? (
              <HouseTab
                house={house}
                editing={editing}
                saving={updateHouse.isPending}
                mapped={mapped}
                onSave={(patch) =>
                  updateHouse.mutate(
                    { house, patch },
                    {
                      onSuccess: () => toast.success("House updated"),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
                {...(onAddLocation ? { onAddLocation: () => onAddLocation(house) } : {})}
              />
            ) : null}

            {tab === "members" ? (
              <MembersTab
                members={members}
                editing={editing}
                onOpenSurvey={(member) => {
                  setSurveyMember(member.id);
                  setTab("data");
                }}
                onSave={(member, patch) =>
                  saveMember.mutate(
                    member ? { house, member, patch } : { house, patch },
                    {
                      onSuccess: () => toast.success("Member saved"),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
                onRemove={(member) =>
                  deleteMember.mutate(
                    { house, member },
                    {
                      onSuccess: () => toast.success("Member removed"),
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              />
            ) : null}

            {tab === "data" ? (
              <DataTab
                house={house}
                members={members}
                selected={surveyMember}
                onSelect={setSurveyMember}
              />
            ) : null}

          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3.5 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="break-words text-[13px] font-medium">{value}</dd>
    </div>
  );
}

function HouseTab({
  house,
  editing,
  saving,
  mapped,
  onSave,
  onAddLocation,
}: {
  house: House;
  editing: boolean;
  saving: boolean;
  mapped: boolean;
  onSave: (patch: Partial<House>) => void;
  onAddLocation?: () => void;
}) {
  const [houseNumber, setHouseNumber] = useState(house.house_number ?? "");
  const [status, setStatus] = useState(house.status ?? "");

  const risk = houseRisk(house);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card/70 px-3.5 py-2.5">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: RISK_META[risk.level].color }}
        />
        <span className="text-[13px] font-semibold">{RISK_META[risk.level].label}</span>
        {risk.reasons.length ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {risk.reasons.slice(0, 2).map((r) => r.label).join(" · ")}
          </span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-2">
        <Row label="House ID (protected)" value={house.house_id} />
        <Row label="House number" value={house.house_number || "—"} />
        <Row label="Status" value={house.status || "—"} />
        <Row label="Pin type" value={pinTypeLabel(house.pin_type ?? "house", house.custom_type ?? null)} />
        <Row label="Location" value={locationStatusLabel(house.location_status)} />
        <Row
          label="Latitude"
          value={house.latitude === null ? "—" : house.latitude.toFixed(6)}
        />
        <Row
          label="Longitude"
          value={house.longitude === null ? "—" : house.longitude.toFixed(6)}
        />
        <Row label="Accuracy" value={house.accuracy ? `±${Math.round(house.accuracy)} m` : "—"} />
        <Row
          label="Mapped at"
          value={house.mapped_at ? new Date(house.mapped_at).toLocaleString() : "—"}
        />
      </dl>


      {onAddLocation ? (
        <button
          type="button"
          onClick={onAddLocation}
          className="press flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-gradient py-3.5 text-sm font-semibold text-primary-foreground"
        >
          <MapPinned className="size-4" />
          {mapped ? "Edit location" : "Add location"}
        </button>
      ) : null}

      {editing ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card/70 p-3.5">
          <label className="block text-[11px] font-medium text-muted-foreground">
            House number
            <input
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground outline-none"
            />
          </label>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Status
            <input
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] font-medium text-foreground outline-none"
            />
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              onSave({ house_number: houseNumber.trim() || null, status: status.trim() || null })
            }
            className="press flex w-full items-center justify-center gap-2 rounded-xl bg-primary-gradient py-2.5 text-[13px] font-semibold text-primary-foreground disabled:opacity-70"
          >
            <Check className="size-4" />
            Save house
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MembersTab({
  members,
  editing,
  onSave,
  onRemove,
  onOpenSurvey,
}: {
  members: HouseMember[];
  editing: boolean;
  onSave: (member: HouseMember | undefined, patch: Partial<HouseMember>) => void;
  onRemove: (member: HouseMember) => void;
  onOpenSurvey: (member: HouseMember) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");

  return (
    <div className="space-y-2">
      {members.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card/70 px-4 py-6 text-center text-[13px] text-muted-foreground">
          No members recorded for this house yet.
        </p>
      ) : null}

      {members.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          editing={editing}
          onOpenSurvey={() => onOpenSurvey(member)}
          onSave={(patch) => onSave(member, patch)}
          onRemove={() => onRemove(member)}
        />
      ))}


      {editing ? (
        adding ? (
          <div className="space-y-2 rounded-2xl border border-border bg-card/70 p-3.5">
            <input
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="Member ID"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Member name"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="press rounded-xl bg-card py-2.5 text-[12px] font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(undefined, {
                    member_id: newId.trim() || null,
                    member_name: newName.trim() || null,
                  });
                  setNewId("");
                  setNewName("");
                  setAdding(false);
                }}
                className="press rounded-xl bg-primary-gradient py-2.5 text-[12px] font-semibold text-primary-foreground"
              >
                Add member
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/70 py-3 text-[13px] font-semibold"
          >
            <Plus className="size-4" />
            Add member
          </button>
        )
      ) : null}
    </div>
  );
}

function MemberCard({
  member,
  editing,
  onSave,
  onRemove,
  onOpenSurvey,
}: {
  member: HouseMember;
  editing: boolean;
  onSave: (patch: Partial<HouseMember>) => void;
  onRemove: () => void;
  onOpenSurvey: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [id, setId] = useState(member.member_id ?? "");
  const [name, setName] = useState(member.member_name ?? "");
  const extras = Object.entries(member.data ?? {});

  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onOpenSurvey}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[14px] font-semibold">
            {member.member_name || "Unnamed member"}
          </span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {member.member_id || "No member ID"} · {extras.length} survey field
            {extras.length === 1 ? "" : "s"}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenSurvey}
          className="press shrink-0 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary"
        >
          Details
        </button>
        {editing ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="press shrink-0 rounded-full bg-card px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            {open ? "Close" : "Edit"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2.5 space-y-2">
          {extras.length ? (
            <dl className="grid grid-cols-2 gap-2">
              {extras.map(([key, value]) => (
                <Row key={key} label={fieldLabel(key)} value={displayValue(value)} />
              ))}
            </dl>
          ) : null}


          {editing ? (
            <div className="space-y-2">
              <input
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="Member ID"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none"
              />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Member name"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[13px] outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onRemove}
                  className="press flex items-center justify-center gap-1.5 rounded-xl bg-destructive/10 py-2.5 text-[12px] font-semibold text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onSave({ member_id: id.trim() || null, member_name: name.trim() || null })
                  }
                  className="press rounded-xl bg-primary-gradient py-2.5 text-[12px] font-semibold text-primary-foreground"
                >
                  Save
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const HOUSE_SCOPE = "__house__";

/** Survey data is always shown for ONE selected member (or the house itself). */
function DataTab({
  house,
  members,
  selected,
  onSelect,
}: {
  house: House;
  members: HouseMember[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  const scope = members.some((m) => m.id === selected) ? selected : HOUSE_SCOPE;
  const member = members.find((m) => m.id === scope) ?? null;
  const entries = Object.entries((member ? member.data : house.data) ?? {});

  return (
    <div className="space-y-2.5">
      <label className="block text-[11px] font-medium text-muted-foreground">
        Survey data for
        <select
          value={scope}
          onChange={(e) => onSelect(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-semibold text-foreground outline-none"
        >
          <option value={HOUSE_SCOPE}>House-level data ({house.house_id})</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.member_name || "Unnamed member"}
              {m.member_id ? ` · ${m.member_id}` : ""}
            </option>
          ))}
        </select>
      </label>

      {member ? (
        <>
          <p className="rounded-2xl bg-primary/10 px-3.5 py-2 text-[11px] font-medium text-primary">
            Showing survey answers recorded for {member.member_name || "this member"}
            {member.member_id ? ` (${member.member_id})` : ""}.
          </p>
          <MemberRiskCard data={member.data ?? {}} />
        </>
      ) : null}


      {entries.length ? (
        <dl className="grid grid-cols-2 gap-2">
          {entries.map(([key, value]) => (
            <Row key={key} label={fieldLabel(key)} value={displayValue(value)} />
          ))}
        </dl>
      ) : (
        <p className="rounded-2xl border border-border bg-card/70 px-4 py-6 text-center text-[13px] text-muted-foreground">
          {member
            ? "No survey data recorded for this member yet."
            : "No extra imported fields for this house."}
        </p>
      )}
    </div>
  );
}


/** Risk read-out for the selected member, computed from their own readings. */
function MemberRiskCard({ data }: { data: Record<string, unknown> }) {
  const risk = memberRisk(data);
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ background: RISK_META[risk.level].color }}
        />
        <span className="text-[13px] font-semibold">{RISK_META[risk.level].label}</span>
      </div>
      {risk.reasons.length ? (
        <ul className="mt-1.5 space-y-0.5">
          {risk.reasons.map((r) => (
            <li key={r.label} className="text-[11px] text-muted-foreground">
              • {r.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
