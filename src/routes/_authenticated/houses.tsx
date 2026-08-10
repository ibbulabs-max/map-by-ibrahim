import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Home, Search } from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { EmptyState, GlassCard, ScreenShell } from "@/components/glass";
import { HouseDetailsSheet } from "@/components/houses/HouseDetailsSheet";
import { MembersView } from "@/components/houses/MembersView";
import { RecordsView } from "@/components/houses/RecordsView";
import { useAuth } from "@/hooks/useAuth";
import { useHouses } from "@/hooks/useHouses";
import { locationStatusLabel, matchesHouseSearch, type House } from "@/lib/houses";

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

type View = "all" | "unmapped" | "members" | "records";

function HousesScreen() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data: houses = [], isLoading } = useHouses();
  const [view, setView] = useState<View>("all");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<House | null>(null);

  const filtered = useMemo(() => {
    const base = view === "unmapped" ? houses.filter((h) => h.latitude === null) : houses;
    return base.filter((h) => matchesHouseSearch(h, term));
  }, [houses, view, term]);

  const unmappedCount = houses.filter((h) => h.latitude === null).length;
  const memberCount = houses.reduce((s, h) => s + (h.house_members?.length ?? 0), 0);

  return (
    <>
      <ScreenShell
        title="Houses"
        subtitle={`${houses.length} houses · ${memberCount} members · ${unmappedCount} unmapped`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-1.5">
            {([
              ["all", "All"],
              ["unmapped", `Unmapped (${unmappedCount})`],
              ["members", "Members"],
              ["records", "Records"],
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

          {view === "records" ? (
            <RecordsView />
          ) : (
            <>
              <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Search House ID, house number or member"
                  className="w-full bg-transparent text-[13px] outline-none"
                />
              </div>

              {view === "members" ? (
                <MembersView houses={filtered} onOpenHouse={setSelected} />
              ) : isLoading ? null : filtered.length === 0 ? (
                <EmptyState
                  icon={<Home className="size-7" />}
                  title="No houses yet"
                  description={
                    isAdmin
                      ? "Import survey spreadsheets from Settings → Data Management to create house records."
                      : "Houses assigned to you will appear here."
                  }
                />
              ) : (
                <div className="space-y-2 pb-4">
                  {filtered.slice(0, 300).map((house) => (
                    <GlassCard key={house.id} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelected(house)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold">
                            {house.house_id}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            House No. {house.house_number || "—"} ·{" "}
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
                  ))}
                  {filtered.length > 300 ? (
                    <p className="pb-2 text-center text-[11px] text-muted-foreground">
                      Showing first 300 of {filtered.length} houses — refine your search.
                    </p>
                  ) : null}
                </div>
              )}
            </>
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
