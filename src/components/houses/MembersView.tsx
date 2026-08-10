import { useMemo } from "react";
import { Users } from "lucide-react";

import { EmptyState, GlassCard } from "@/components/glass";
import type { House } from "@/lib/houses";

type Props = {
  houses: House[];
  onOpenHouse: (house: House) => void;
};

/** Member-centric view of the SAME canonical house data. */
export function MembersView({ houses, onOpenHouse }: Props) {
  const members = useMemo(
    () =>
      houses
        .flatMap((house) => (house.house_members ?? []).map((member) => ({ house, member })))
        .sort((a, b) => (a.member.member_name ?? "").localeCompare(b.member.member_name ?? "")),
    [houses],
  );

  if (!members.length)
    return (
      <EmptyState
        icon={<Users className="size-7" />}
        title="No members yet"
        description="Members imported or added to houses appear here."
      />
    );

  return (
    <div className="space-y-2 pb-4">
      {members.slice(0, 300).map(({ house, member }) => (
        <GlassCard key={member.id} className="px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenHouse(house)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold">
                {member.member_name || "Unnamed member"}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {member.member_id || "No member ID"} · House {house.house_id}
                {house.house_number ? ` · No. ${house.house_number}` : ""}
              </span>
            </span>
            {member.possible_duplicate ? (
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-600">
                Possible duplicate
              </span>
            ) : null}
          </button>
        </GlassCard>
      ))}
      {members.length > 300 ? (
        <p className="pb-2 text-center text-[11px] text-muted-foreground">
          Showing first 300 of {members.length} members — refine your search.
        </p>
      ) : null}
    </div>
  );
}
