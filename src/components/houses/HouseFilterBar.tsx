import { ArrowUpDown, Filter } from "lucide-react";

import { PIN_TYPES, pinTypeLabel } from "@/lib/pin-types";
import { RISK_META, type RiskLevel } from "@/lib/risk";
import { cn } from "@/lib/utils";

export type HouseSort = "newest" | "oldest" | "house";

export type HouseFilters = {
  mineOnly: boolean;
  typeFilter: string | null;
  riskFilter: RiskLevel | null;
  sort: HouseSort;
};

export const DEFAULT_HOUSE_FILTERS: HouseFilters = {
  mineOnly: false,
  typeFilter: null,
  riskFilter: null,
  sort: "newest",
};

const SORT_LABEL: Record<HouseSort, string> = {
  newest: "Newest",
  oldest: "Oldest",
  house: "House ID",
};

const RISKS: RiskLevel[] = ["high", "moderate", "low"];

/** Filter chips shared by the Houses list — one place, one behaviour. */
export function HouseFilterBar({
  value,
  onChange,
  availableTypes,
}: {
  value: HouseFilters;
  onChange: (next: HouseFilters) => void;
  availableTypes: string[];
}) {
  const types = PIN_TYPES.filter((t) => availableTypes.includes(t.value));

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
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

      <Chip active={value.typeFilter === null} onClick={() => onChange({ ...value, typeFilter: null })}>
        All types
      </Chip>
      {types.map((t) => (
        <Chip
          key={t.value}
          active={value.typeFilter === t.value}
          onClick={() => onChange({ ...value, typeFilter: value.typeFilter === t.value ? null : t.value })}
        >
          {pinTypeLabel(t.value, null)}
        </Chip>
      ))}
    </div>
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
