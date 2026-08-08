import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { isAdminRole, type AppRole } from "@/lib/roles";

export type Profile = {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  avatar_url: string | null;
  is_active: boolean;
};

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  /** true for admin AND super admin */
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isSupervisor: boolean;
  isCsw: boolean;
  /** for a CSW: the id of their connected supervisor */
  supervisorId: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDetails(userId: string) {
    const [{ data: p }, { data: r }, { data: t }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle(),
      supabase.from("team_memberships").select("supervisor_id").eq("csw_id", userId).maybeSingle(),
    ]);
    setProfile((p as Profile) ?? null);
    setRole((r?.role as AppRole) ?? "survey_user");
    setSupervisorId(t?.supervisor_id ?? null);
  }

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        setRole(null);
        setSupervisorId(null);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadDetails(data.session.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user.id) void loadDetails(session.user.id);
  }, [session?.user.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      role,
      isAdmin: isAdminRole(role),
      isSuperAdmin: role === "super_admin",
      isSupervisor: role === "supervisor",
      isCsw: role === "survey_user",
      supervisorId,
      loading,
      refresh: async () => {
        if (session?.user.id) await loadDetails(session.user.id);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setRole(null);
        setSupervisorId(null);
      },
    }),
    [session, profile, role, supervisorId, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
