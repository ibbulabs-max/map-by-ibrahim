import { Link, useRouterState } from "@tanstack/react-router";
import { Map, List, Settings, User, ShieldCheck } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/map", label: "Map", icon: Map },
  { to: "/records", label: "Records", icon: List },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function BottomNav() {
  const { isAdmin } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items = isAdmin
    ? [...ITEMS, { to: "/admin", label: "Admin", icon: ShieldCheck } as const]
    : ITEMS;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1000] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="glass-strong mx-auto flex max-w-md items-stretch justify-between gap-1 rounded-[1.75rem] p-1.5">
        {items.map((item) => {
          const active = pathname === item.to;
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
  );
}
