import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Home, Search } from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { EmptyState, GlassCard, ScreenShell } from "@/components/glass";
import { HouseDetailsSheet } from "@/components/houses/HouseDetailsSheet";
import {
  DEFAULT_HOUSE_FILTERS,
  HouseFilterBar,
  type HouseFilters,
} from "@/components/houses/HouseFilterBar";
import { MembersView } from "@/components/houses/MembersView";
import { useAuth } from "@/hooks/useAuth";
import { useHouses } from "@/hooks/useHouses";
import { locationStatusLabel, matchesHouseSearch, type House } from "@/lib/houses";
import { pinTypeLabel } from "@/lib/pin-types";
import { houseRisk, RISK_META } from "@/lib/risk";

export const Route = createFileRoute("/_authenticated/houses")({
  head: () => ({
    meta: [
      { title: "Houses — Smart Survey Map" },
      {
        name: "description",
        content: "Canonical household records, members and mapping status for the survey team.",
      },
      { property: "og:title", content: "Houses — Smart Survey Map" },
      {
        property: "og:description",
        content: "Canonical household records, members and mapping status for the survey team.",
      },
    ],
  }),
  component: HousesScreen,
});

type View = "all" | "unmapped" | "members";

function HousesScreen() {
  const { isAdmin, session } = useAuth();
  const navigate = useNavigate();
  const { data: houses = [], isLoading } = useHouses();
  const [view, setView] = useState<View>("all");
  const [term, setTerm] = useState("");
  const [filters, setFilters] = useState<HouseFilters>(DEFAULT_HOUSE_FILTERS);
  const [selected, setSelected] = useState<House | null>(null);

  const riskById = useMemo(() => {
    const out = new Map<string, ReturnType<typeof houseRisk>>();
    for (const h of houses) out.set(h.id, houseRisk(h));
    return out;
  }, [houses]);

  const availableTypes = useMemo(
    () => [...new Set(houses.map((h) => h.pin_type ?? "house"))],
    [houses],
  );

  const filtered = useMemo(() => {
    const base = view === "unmapped" ? houses.filter((h) => h.latitude === null) : houses;
    const list = base.filter((h) => {
      if (!matchesHouseSearch(h, term)) return false;
      if (filters.mineOnly && h.assigned_csw_id !== session?.user.id) return false;
      if (filters.typeFilter && (h.pin_type ?? "house") !== filters.typeFilter) return false;
      if (filters.riskFilter && riskById.get(h.id)?.level !== filters.riskFilter) return false;
      return true;
    });
    return [...list].sort((a, b) => {
      if (filters.sort === "house") return a.house_id.localeCompare(b.house_id);
      if (filters.sort === "oldest") return a.created_at.localeCompare(b.created_at);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [houses, view, term, filters, riskById, session?.user.id]);

  const unmappedCount = houses.filter((h) => h.latitude === null).length;
  const memberCount = houses.reduce((s, h) => s + (h.house_members?.length ?? 0), 0);

  return (
    <>
      <ScreenShell
        title="Houses"
        subtitle={`${houses.length} houses · ${memberCount} members · ${unmappedCount} unmapped`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {([
              ["all", "All"],
              ["unmapped", `Unmapped (${unmappedCount})`],
              ["members", "Members"],
            ] as [View, string][]).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setView(value)}
                className={`press rounded-2xl px-1.5 py-2.5 text-[11px] font-semibold ${
                  view === value ? "bg-primary-gradient text-primary-foreground" : "glass"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search House ID, house number or member"
              className="w-full bg-transparent text-[13px] outline-none"
            />
          </div>

          <HouseFilterBar value={filters} onChange={setFilters} availableTypes={availableTypes} />

          {view === "members" ? (
            <MembersView houses={filtered} onOpenHouse={setSelected} />
          ) : isLoading ? null : filtered.length === 0 ? (
            <EmptyState
              icon={<Home className="size-7" />}
              title="No houses match"
              description={
                isAdmin
                  ? "Import survey spreadsheets from Settings → Data Management, or clear the filters above."
                  : "Houses assigned to you will appear here."
              }
            />
          ) : (
            <div className="space-y-2 pb-4">
              {filtered.slice(0, 300).map((house) => {
                const risk = riskById.get(house.id);
                return (
                  <GlassCard key={house.id} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelected(house)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          {risk && risk.level !== "unknown" ? (
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ background: RISK_META[risk.level].color }}
                              aria-label={RISK_META[risk.level].label}
                            />
                          ) : null}
                          <span className="block truncate text-[14px] font-semibold">
                            {house.house_id}
                          </span>
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          House No. {house.house_number || "—"} ·{" "}
                          {pinTypeLabel(house.pin_type ?? "house", house.custom_type ?? null)} ·{" "}
                          {house.house_members?.length ?? 0} members ·{" "}
                          {locationStatusLabel(house.location_status)}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          house.latitude === null
                            ? "bg-amber-500/15 text-amber-600"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {house.latitude === null ? "Not mapped" : "Mapped"}
                      </span>
                    </button>
                  </GlassCard>
                );
              })}
              {filtered.length > 300 ? (
                <p className="pb-2 text-center text-[11px] text-muted-foreground">
                  Showing first 300 of {filtered.length} houses — refine your search.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </ScreenShell>

      <HouseDetailsSheet
        house={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onAddLocation={(house) => {
          setSelected(null);
          void navigate({ to: "/map", search: { house: house.house_id } });
        }}
      />

      <BottomNav />
    </>
  );
}
