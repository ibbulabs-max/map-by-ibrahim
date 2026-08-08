import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MapPinned } from "lucide-react";

import { BottomNav } from "@/components/BottomNav";
import { GlassCard, ScreenShell } from "@/components/glass";
import { usePinsRealtime } from "@/hooks/usePins";
import { supervisorDetails } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team/supervisor/$supervisorId")({
  head: () => ({
    meta: [
      { title: "Supervisor details — Smart Survey Map" },
      { name: "description", content: "Supervisor profile, team members and combined field statistics." },
      { property: "og:title", content: "Supervisor details — Smart Survey Map" },
      { property: "og:description", content: "Supervisor profile, team members and statistics." },
    ],
  }),
  component: SupervisorDetailsScreen,
});

function SupervisorDetailsScreen() {
  const { supervisorId } = Route.useParams();
  const navigate = useNavigate();
  usePinsRealtime();
  const fetchSupervisor = useServerFn(supervisorDetails);
  const detail = useQuery({
    queryKey: ["team", "supervisor", supervisorId],
    queryFn: () => fetchSupervisor({ data: { userId: supervisorId } }),
  });

  const person = detail.data?.person;
  const members = detail.data?.members ?? [];
  const teamPins = members.reduce((sum, m) => sum + m.stats.total, 0);

  return (
    <>
      <ScreenShell
        title={person?.full_name || person?.username || "Supervisor"}
        subtitle={person ? `@${person.username} · Supervisor` : "Loading…"}
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
          onClick={() => void navigate({ to: "/map", search: { supervisor: supervisorId } })}
          className="press flex w-full items-center justify-center gap-2 rounded-3xl bg-primary-gradient py-4 text-[15px] font-semibold text-primary-foreground shadow-[var(--shadow-float)]"
        >
          <MapPinned className="size-5" />
          OPEN TEAM MAP
        </button>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          <Stat label="CSWs" value={members.length} />
          <Stat label="Team pins" value={teamPins} />
          <Stat label="Today" value={members.reduce((s, m) => s + m.stats.today, 0)} />
        </div>

        {person ? (
          <GlassCard className="mt-4 px-5 py-5">
            <p className="text-[15px] font-semibold">Supervisor information</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Row label="Name" value={person.full_name || "—"} />
              <Row label="Username" value={person.username} />
              <Row label="Phone" value={person.phone || "—"} />
              <Row label="Email" value={person.email || "—"} />
              <Row label="Status" value={person.is_active ? "Active" : "Disabled"} />
              <Row label="Created" value={new Date(person.created_at).toLocaleDateString()} />
            </dl>
          </GlassCard>
        ) : null}

        <p className="mt-5 mb-2 px-1 text-[13px] font-medium text-muted-foreground">
          Team members ({members.length})
        </p>
        <div className="space-y-2.5">
          {members.map((m) => (
            <Link key={m.id} to="/team/csw/$cswId" params={{ cswId: m.id }} className="block">
              <GlassCard className="press flex items-center gap-3 px-4 py-3.5">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-gradient text-[15px] font-semibold text-primary-foreground">
                  {(m.full_name || m.username).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{m.full_name || m.username}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    CSW ID: {m.username.toUpperCase()} · {m.stats.total} pins · {m.stats.house} houses
                  </p>
                </div>
              </GlassCard>
            </Link>
          ))}
          {members.length === 0 && !detail.isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No survey users connected to this supervisor yet.
            </p>
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
