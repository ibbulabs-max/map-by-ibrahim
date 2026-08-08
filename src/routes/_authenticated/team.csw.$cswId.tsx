import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MapPinned } from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { GlassCard, ScreenShell } from "@/components/glass";
import { usePinsRealtime } from "@/hooks/usePins";
import { pinTypeDef, pinTypeLabel } from "@/lib/pin-types";
import { cswDetails } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team/csw/$cswId")({
  head: () => ({
    meta: [
      { title: "Survey user details — Smart Survey Map" },
      { name: "description", content: "Profile, statistics and every pin captured by a survey user." },
      { property: "og:title", content: "Survey user details — Smart Survey Map" },
      { property: "og:description", content: "Profile, statistics and pins for one survey user." },
    ],
  }),
  component: CswDetailsScreen,
});

function CswDetailsScreen() {
  const { cswId } = Route.useParams();
  const navigate = useNavigate();
  usePinsRealtime();
  const fetchCsw = useServerFn(cswDetails);
  const detail = useQuery({
    queryKey: ["team", "csw", cswId],
    queryFn: () => fetchCsw({ data: { userId: cswId } }),
  });

  const person = detail.data?.person;
  const pins = detail.data?.pins ?? [];
  const activity = detail.data?.activity ?? [];

  return (
    <>
      <ScreenShell
        title={person?.full_name || person?.username || "Survey user"}
        subtitle={person ? `CSW ID: ${person.username.toUpperCase()}` : "Loading…"}
        action={
          <Link
            to="/team"
            className="press grid size-11 place-items-center rounded-2xl bg-card/70"
            aria-label="Back to team"
          >
            <ArrowLeft className="size-5" />
          </Link>
        }
      >
        <button
          type="button"
          onClick={() => void navigate({ to: "/map", search: { user: cswId } })}
          className="press flex w-full items-center justify-center gap-2 rounded-3xl bg-primary-gradient py-4 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-float)]"
        >
          <MapPinned className="size-5" />
          OPEN IN MAP
        </button>

        {detail.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading details…</p>
        ) : null}

        {person ? (
          <>
            <GlassCard className="mt-4 px-5 py-5">
              <p className="text-[15px] font-semibold">Profile</p>
              <dl className="mt-3 grid grid-cols-2 gap-2">
                <Row label="Name" value={person.full_name || "—"} />
                <Row label="Username" value={person.username} />
                <Row label="CSW ID" value={person.username.toUpperCase()} />
                <Row label="Phone" value={person.phone || "—"} />
                <Row label="Email" value={person.email || "—"} />
                <Row label="Status" value={person.is_active ? "Active" : "Disabled"} />
                <Row label="Supervisor" value={person.supervisor_name || "Unassigned"} />
                <Row label="Created" value={new Date(person.created_at).toLocaleDateString()} />
                <Row
                  label="Last active"
                  value={
                    person.stats.lastActivity
                      ? new Date(person.stats.lastActivity).toLocaleString()
                      : "—"
                  }
                />
              </dl>
            </GlassCard>

            <p className="mt-5 mb-2 px-1 text-[13px] font-medium text-muted-foreground">Statistics</p>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Total pins" value={person.stats.total} />
              <Stat label="Houses" value={person.stats.house} />
              <Stat label="Shops" value={person.stats.shop} />
              <Stat label="Locked" value={person.stats.locked_house} />
              <Stat label="Refused" value={person.stats.refused} />
              <Stat label="Other" value={person.stats.other} />
              <Stat label="Today" value={person.stats.today} />
              <Stat label="This week" value={person.stats.week} />
              <Stat label="This month" value={person.stats.month} />
            </div>
          </>
        ) : null}

        {activity.length ? (
          <>
            <p className="mt-5 mb-2 px-1 text-[13px] font-medium text-muted-foreground">Recent activity</p>
            <div className="space-y-2">
              {activity.map((a) => (
                <GlassCard key={a.id} className="px-4 py-3">
                  <p className="text-[14px] font-medium">{a.action}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {new Date(a.created_at).toLocaleString()}
                  </p>
                </GlassCard>
              ))}
            </div>
          </>
        ) : null}

        <p className="mt-5 mb-2 px-1 text-[13px] font-medium text-muted-foreground">
          All pins ({pins.length})
        </p>
        <div className="space-y-2.5">
          {pins.map((pin) => {
            const def = pinTypeDef(pin.pin_type);
            const Icon = def.icon;
            return (
              <GlassCard key={pin.id} className="flex items-center gap-3 px-4 py-3.5">
                <span
                  className="grid size-11 shrink-0 place-items-center rounded-2xl text-white"
                  style={{ background: def.color }}
                >
                  <Icon className="size-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">
                    {pinTypeLabel(pin.pin_type, pin.custom_type)}
                    {pin.house_id ? ` · ${pin.house_id}` : ""}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {pin.latitude.toFixed(6)}, {pin.longitude.toFixed(6)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-medium">
                    {new Date(pin.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(pin.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </GlassCard>
            );
          })}
          {pins.length === 0 && !detail.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No pins captured yet.</p>
          ) : null}
        </div>
      </ScreenShell>
      <BottomNav />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3.5 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] font-medium">{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <GlassCard className="px-3 py-4 text-center">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{label}</p>
    </GlassCard>
  );
}
