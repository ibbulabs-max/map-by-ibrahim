import { Link, useRouterState } from "@tanstack/react-router";
import { Map, List, Settings, User, ShieldCheck, Users, Home } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { ROLE_SHORT } from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon };

const MAP: NavItem = { to: "/map", label: "Map", icon: Map };
const TEAM: NavItem = { to: "/team", label: "Team", icon: Users };
const HOUSES: NavItem = { to: "/houses", label: "Houses", icon: Home };
const RECORDS: NavItem = { to: "/records", label: "Records", icon: List };
const ADMIN: NavItem = { to: "/admin", label: "Admin", icon: ShieldCheck };
const SETTINGS: NavItem = { to: "/settings", label: "Settings", icon: Settings };
const PROFILE: NavItem = { to: "/profile", label: "Profile", icon: User };

function itemsFor(isAdmin: boolean, isSupervisor: boolean): NavItem[] {
  if (isAdmin) return [MAP, HOUSES, ADMIN, TEAM, RECORDS, SETTINGS, PROFILE];
  if (isSupervisor) return [MAP, HOUSES, TEAM, RECORDS, SETTINGS, PROFILE];
  return [MAP, HOUSES, RECORDS, SETTINGS, PROFILE];
}

/**
 * Responsive app navigation: liquid-glass bottom bar on mobile,
 * fixed left sidebar on tablet and desktop.
 */
export function BottomNav() {
  const { isAdmin, isSupervisor, role, profile } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = itemsFor(isAdmin, isSupervisor);
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <>
      {/* Mobile: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-[1000] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="glass-strong mx-auto flex max-w-md items-stretch justify-between gap-1 rounded-[1.75rem] p-1.5">
          {items.map((item) => {
            const active = isActive(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "press relative flex flex-1 flex-col items-center gap-1 rounded-[1.35rem] px-1 py-2.5 text-[10px] font-medium",
                  active ? "text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {active ? (
                  <span className="absolute inset-0 rounded-[1.35rem] bg-primary-gradient shadow-[var(--shadow-glass)]" />
                ) : null}
                <Icon className="relative size-[18px]" strokeWidth={active ? 2.4 : 2} />
                <span className="relative">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Tablet / desktop: fixed sidebar */}
      <aside className="fixed inset-y-0 left-0 z-[1000] hidden w-60 flex-col p-3 md:flex">
        <div className="glass-strong flex h-full flex-col rounded-[1.75rem] p-3">
          <div className="px-3 py-4">
            <p className="text-lg font-semibold tracking-tight">Survey Map</p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {profile?.full_name || profile?.username || "Signed in"}
              {role ? ` · ${ROLE_SHORT[role]}` : ""}
            </p>
          </div>
          <div className="mt-2 flex flex-1 flex-col gap-1">
            {items.map((item) => {
              const active = isActive(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "press relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[14px] font-medium",
                    active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active ? (
                    <span className="absolute inset-0 rounded-2xl bg-primary-gradient shadow-[var(--shadow-glass)]" />
                  ) : null}
                  <Icon className="relative size-[18px]" strokeWidth={active ? 2.4 : 2} />
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
