import { useMemo, useState } from "react";
import { ArrowUpDown, CalendarDays, Filter, SlidersHorizontal, X } from "lucide-react";

import { PIN_TYPES, pinTypeLabel, pinTypeDef } from "@/lib/pin-types";
import { RISK_META, houseRisk, type RiskLevel } from "@/lib/risk";
import { matchesHouseSearch, type House } from "@/lib/houses";
import { cn } from "@/lib/utils";

export type HouseSort = "newest" | "oldest" | "house";
export type MappedFilter = "all" | "mapped" | "unmapped";

export type HouseFilters = {
  mineOnly: boolean;
  /** canonical pin_type values — empty means every type */
  types: string[];
  riskFilter: RiskLevel | null;
  mapped: MappedFilter;
  /** yyyy-mm-dd bounds on the record date */
  from: string;
  to: string;
  sort: HouseSort;
};

export const DEFAULT_HOUSE_FILTERS: HouseFilters = {
  mineOnly: false,
  types: [],
  riskFilter: null,
  mapped: "all",
  from: "",
  to: "",
  sort: "newest",
};

const SORT_LABEL: Record<HouseSort, string> = {
  newest: "Newest",
  oldest: "Oldest",
  house: "House ID",
};

const MAPPED_LABEL: Record<MappedFilter, string> = {
  all: "Any location",
  mapped: "Mapped",
  unmapped: "Unmapped",
};

const RISKS: RiskLevel[] = ["high", "moderate", "low"];

export function houseType(house: House) {
  return house.pin_type ?? "house";
}

/** Canonical record date used by the date filter and sorting. */
export function houseDate(house: House) {
  return (house.mapped_at ?? house.uploaded_at ?? house.created_at) || house.created_at;
}

export function activeFilterCount(f: HouseFilters) {
  return (
    (f.mineOnly ? 1 : 0) +
    f.types.length +
    (f.riskFilter ? 1 : 0) +
    (f.mapped !== "all" ? 1 : 0) +
    (f.from ? 1 : 0) +
    (f.to ? 1 : 0)
  );
}

/** One canonical filter+sort pipeline, shared by every Houses view. */
export function filterHouses({
  houses,
  term,
  filters,
  userId,
}: {
  houses: House[];
  term: string;
  filters: HouseFilters;
  userId?: string | null;
}): House[] {
  const list = houses.filter((h) => {
    if (!matchesHouseSearch(h, term)) return false;
    if (filters.mineOnly && h.assigned_csw_id !== userId) return false;
    if (filters.types.length && !filters.types.includes(houseType(h))) return false;
    if (filters.mapped === "mapped" && h.latitude === null) return false;
    if (filters.mapped === "unmapped" && h.latitude !== null) return false;
    if (filters.riskFilter && houseRisk(h).level !== filters.riskFilter) return false;
    if (filters.from || filters.to) {
      const d = houseDate(h).slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
    }
    return true;
  });
  return [...list].sort((a, b) => {
    if (filters.sort === "house") return a.house_id.localeCompare(b.house_id);
    if (filters.sort === "oldest") return houseDate(a).localeCompare(houseDate(b));
    return houseDate(b).localeCompare(houseDate(a));
  });
}

/** Filter chips + full filter panel shared by the Houses list. */
export function HouseFilterBar({
  value,
  onChange,
  houses,
}: {
  value: HouseFilters;
  onChange: (next: HouseFilters) => void;
  houses: House[];
}) {
  const [open, setOpen] = useState(false);

  // Every canonical pin type, plus any extra type already present in the data.
  const typeOptions = useMemo(() => {
    const known = new Set(PIN_TYPES.map((t) => t.value));
    const extra = [...new Set(houses.map(houseType))].filter((t) => !known.has(t));
    return [...PIN_TYPES.map((t) => t.value), ...extra];
  }, [houses]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const h of houses) {
      const t = houseType(h);
      out[t] = (out[t] ?? 0) + 1;
    }
    return out;
  }, [houses]);

  const toggleType = (t: string) =>
    onChange({
      ...value,
      types: value.types.includes(t) ? value.types.filter((v) => v !== t) : [...value.types, t],
    });

  const active = activeFilterCount(value);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip
          active={open || active > 0}
          onClick={() => setOpen((v) => !v)}
          icon={<SlidersHorizontal className="size-3.5" />}
        >
          Filters{active ? ` · ${active}` : ""}
        </Chip>
        <Chip
          active={value.mineOnly}
          onClick={() => onChange({ ...value, mineOnly: !value.mineOnly })}
          icon={<Filter className="size-3.5" />}
        >
          Mine
        </Chip>
        <Chip
          active={false}
          onClick={() =>
            onChange({
              ...value,
              sort: value.sort === "newest" ? "oldest" : value.sort === "oldest" ? "house" : "newest",
            })
          }
          icon={<ArrowUpDown className="size-3.5" />}
        >
          {SORT_LABEL[value.sort]}
        </Chip>
        <Chip
          active={value.mapped !== "all"}
          onClick={() =>
            onChange({
              ...value,
              mapped: value.mapped === "all" ? "mapped" : value.mapped === "mapped" ? "unmapped" : "all",
            })
          }
        >
          {MAPPED_LABEL[value.mapped]}
        </Chip>
        <Chip active={value.riskFilter === null} onClick={() => onChange({ ...value, riskFilter: null })}>
          Any risk
        </Chip>
        {RISKS.map((r) => (
          <Chip
            key={r}
            active={value.riskFilter === r}
            onClick={() => onChange({ ...value, riskFilter: value.riskFilter === r ? null : r })}
          >
            <span className="size-2 rounded-full" style={{ background: RISK_META[r].color }} />
            {RISK_META[r].label.replace(" risk", "")}
          </Chip>
        ))}
      </div>

      {/* active pin-type chips, removable one by one */}
      {value.types.length ? (
        <div className="flex flex-wrap gap-1.5">
          {value.types.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className="press flex items-center gap-1.5 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary"
            >
              <span className="size-2 rounded-full" style={{ background: pinTypeDef(t).color }} />
              {pinTypeLabel(t, null)}
              <X className="size-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...value, types: [] })}
            className="press rounded-full border border-border bg-card/70 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            Clear types
          </button>
        </div>
      ) : null}

      {open ? (
        <div className="glass space-y-3 rounded-2xl p-3">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pin type
              </p>
              <div className="flex gap-1.5">
                <MiniButton onClick={() => onChange({ ...value, types: [...typeOptions] })}>
                  Select all
                </MiniButton>
                <MiniButton onClick={() => onChange({ ...value, types: [] })}>Clear all</MiniButton>
              </div>
            </div>
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {typeOptions.map((t) => {
                const on = value.types.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleType(t)}
                    className={cn(
                      "press flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-left text-[11px] font-medium",
                      on ? "bg-primary/15 text-primary" : "bg-card/70",
                    )}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: pinTypeDef(t).color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{pinTypeLabel(t, null)}</span>
                    <span className="shrink-0 tabular-nums opacity-70">{counts[t] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2 text-[11px] font-medium">
              <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-muted-foreground">From</span>
              <input
                type="date"
                value={value.from}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
                className="w-full bg-transparent text-[12px] outline-none"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2 text-[11px] font-medium">
              <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="shrink-0 text-muted-foreground">To</span>
              <input
                type="date"
                value={value.to}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
                className="w-full bg-transparent text-[12px] outline-none"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <MiniButton onClick={() => onChange({ ...DEFAULT_HOUSE_FILTERS })}>Clear all filters</MiniButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="press rounded-full bg-primary-gradient px-4 py-2 text-[11px] font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press rounded-full border border-border bg-card/70 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
    >
      {children}
    </button>
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
