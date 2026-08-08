import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Search, UserRound, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { BottomNav } from "@/components/BottomNav";
import { EmptyState, GlassCard, ScreenShell } from "@/components/glass";
import { useAuth } from "@/hooks/useAuth";
import { usePinsRealtime } from "@/hooks/usePins";
import { teamOverview } from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team/")({
  head: () => ({
    meta: [
      { title: "Team — Smart Survey Map" },
      { name: "description", content: "Supervisors, survey users and their live field activity." },
      { property: "og:title", content: "Team — Smart Survey Map" },
      { property: "og:description", content: "Supervisors, survey users and their field activity." },
    ],
  }),
  component: TeamScreen,
});

function TeamScreen() {
  const { isAdmin } = useAuth();
  usePinsRealtime();
  const fetchTeam = useServerFn(teamOverview);
  const team = useQuery({ queryKey: ["team", "overview"], queryFn: () => fetchTeam({ data: undefined }) });
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const match = (...values: (string | null | undefined)[]) =>
    !q || values.filter(Boolean).some((v) => String(v).toLowerCase().includes(q));

  const supervisors = useMemo(
    () => (team.data?.supervisors ?? []).filter((s) => match(s.full_name, s.username, s.phone)),
    [team.data, q],
  );
  const members = useMemo(
    () => (team.data?.members ?? []).filter((m) => match(m.full_name, m.username, m.phone)),
    [team.data, q],
  );
  const unassigned = useMemo(
    () => (team.data?.unassigned ?? []).filter((m) => match(m.full_name, m.username, m.phone)),
    [team.data, q],
  );

  return (
    <>
      <ScreenShell
        title="Team"
        subtitle={
          isAdmin
            ? `${team.data?.supervisors.length ?? 0} supervisors`
            : `${team.data?.members.length ?? 0} connected survey users`
        }
      >
        <div className="glass flex items-center gap-2 rounded-2xl px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, username or phone"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        {team.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading team…</p>
        ) : null}

        {isAdmin ? (
          <>
            <SectionLabel icon={<Users className="size-4" />}>Supervisors</SectionLabel>
            <div className="space-y-2.5">
              {supervisors.length === 0 && !team.isLoading ? (
                <EmptyState
                  icon={<Users className="size-7" />}
                  title="No supervisors yet"
                  description="Create a supervisor from the Admin panel, then connect survey users to them."
                />
              ) : null}
              {supervisors.map((s) => (
                <Link
                  key={s.id}
                  to="/team/supervisor/$supervisorId"
                  params={{ supervisorId: s.id }}
                  className="block"
                >
                  <GlassCard className="press flex items-center gap-3 px-4 py-3.5">
                    <Avatar name={s.full_name || s.username} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold">{s.full_name || s.username}</p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {s.memberCount} CSWs · {s.teamPins} pins · {s.is_active ? "Active" : "Disabled"}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </GlassCard>
                </Link>
              ))}
            </div>

            {unassigned.length ? (
              <>
                <SectionLabel icon={<UserRound className="size-4" />}>Unassigned survey users</SectionLabel>
                <div className="space-y-2.5">
                  {unassigned.map((m) => (
                    <CswCard key={m.id} person={m} />
                  ))}
                </div>
              </>
            ) : null}
          </>
        ) : (
          <>
            <SectionLabel icon={<UserRound className="size-4" />}>My survey users</SectionLabel>
            <div className="space-y-2.5">
              {members.length === 0 && !team.isLoading ? (
                <EmptyState
                  icon={<UserRound className="size-7" />}
                  title="No team members yet"
                  description="An admin needs to connect survey users to you before they appear here."
                />
              ) : null}
              {members.map((m) => (
                <CswCard key={m.id} person={m} />
              ))}
            </div>
          </>
        )}
      </ScreenShell>
      <BottomNav />
    </>
  );
}

type Person = {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  supervisor_name: string | null;
  stats: { total: number; house: number; lastActivity: string | null };
};

function CswCard({ person }: { person: Person }) {
  return (
    <GlassCard className="px-4 py-4">
      <div className="flex items-center gap-3">
        <Avatar name={person.full_name || person.username} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{person.full_name || person.username}</p>
          <p className="truncate text-[12px] text-muted-foreground">
            CSW ID: {person.username.toUpperCase()}
            {person.phone ? ` · ${person.phone}` : ""}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            person.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {person.is_active ? "Active" : "Disabled"}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Houses" value={person.stats.house} />
        <Metric label="Pins" value={person.stats.total} />
        <Metric
          label="Last active"
          text={
            person.stats.lastActivity
              ? new Date(person.stats.lastActivity).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                })
              : "—"
          }
        />
      </dl>

      {person.supervisor_name ? (
        <p className="mt-2 text-[12px] text-muted-foreground">Supervisor: {person.supervisor_name}</p>
      ) : null}

      <Link
        to="/team/csw/$cswId"
        params={{ cswId: person.id }}
        className="press mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-gradient py-3 text-sm font-semibold text-primary-foreground"
      >
        View Details
      </Link>
    </GlassCard>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-gradient text-[15px] font-semibold text-primary-foreground">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Metric({ label, value, text }: { label: string; value?: number; text?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-3 py-2.5 text-center">
      <dd className="text-[15px] font-semibold">{text ?? value ?? 0}</dd>
      <dt className="mt-0.5 text-[11px] text-muted-foreground">{label}</dt>
    </div>
  );
}

function SectionLabel({ children, icon }: { children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <p className="mt-5 mb-2 flex items-center gap-2 px-1 text-[13px] font-medium text-muted-foreground">
      {icon}
      {children}
    </p>
  );
}
