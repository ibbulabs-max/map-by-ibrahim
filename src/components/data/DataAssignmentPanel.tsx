import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/glass";
import { useAuth } from "@/hooks/useAuth";
import { useHouses, useUpdateHouse } from "@/hooks/useHouses";
import { matchesHouseSearch } from "@/lib/houses";
import { teamPeople } from "@/lib/team.functions";

export function DataAssignmentPanel() {
  const { isAdmin, isSupervisor, session, profile } = useAuth();
  const { data: houses = [] } = useHouses();
  const updateHouse = useUpdateHouse();
  const fetchPeople = useServerFn(teamPeople);
  const [term, setTerm] = useState("");

  const canAssign = isAdmin || isSupervisor;
  const { data: team } = useQuery({
    queryKey: ["team-people"],
    queryFn: () => fetchPeople(),
    enabled: canAssign,
  });

  const names = useMemo(() => {
    const map = new Map<string, string>();
    if (session?.user.id) map.set(session.user.id, profile?.full_name || profile?.username || "Me");
    for (const s of team?.supervisors ?? []) map.set(s.id, s.name);
    for (const p of team?.people ?? []) map.set(p.id, p.name);
    return map;
  }, [team, session?.user.id, profile]);

  const rows = useMemo(
    () => houses.filter((h) => matchesHouseSearch(h, term)).slice(0, 200),
    [houses, term],
  );

  return (
    <div className="space-y-2">
      <div className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search House ID, house number or member"
          className="w-full bg-transparent text-[13px] outline-none"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Users className="size-7" />}
          title="No houses"
          description="Imported houses and their owners will be listed here."
        />
      ) : (
        rows.map((house) => (
          <div key={house.id} className="rounded-3xl border border-border bg-card/70 p-3.5">
            <p className="truncate text-[13px] font-semibold">{house.house_id}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              House No. {house.house_number || "—"} · owner{" "}
              {house.assigned_csw_id ? (names.get(house.assigned_csw_id) ?? "Assigned user") : "Unassigned"}
              {house.uploaded_at ? ` · uploaded ${new Date(house.uploaded_at).toLocaleDateString()}` : ""}
            </p>
            {(house.source_files ?? []).length ? (
              <p className="truncate text-[11px] text-muted-foreground">
                Source: {(house.source_files ?? []).join(", ")}
              </p>
            ) : null}

            {canAssign ? (
              <select
                value={house.assigned_csw_id ?? ""}
                onChange={(e) => {
                  const next = e.target.value || null;
                  updateHouse.mutate(
                    {
                      house,
                      patch: { assigned_csw_id: next },
                      action: "house_owner_changed",
                    },
                    {
                      onSuccess: () => toast.success("Assignment updated"),
                      onError: (err) => toast.error(err.message),
                    },
                  );
                }}
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-[12px] font-medium outline-none"
              >
                <option value="">Unassigned</option>
                {[...names.entries()].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
