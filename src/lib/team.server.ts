import type { AppRole } from "./roles";
import type { Pin } from "./pin-types";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ */
/* authorization                                                       */
/* ------------------------------------------------------------------ */

export async function roleOf(userId: string): Promise<AppRole | null> {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return (data?.role as AppRole) ?? null;
}

export async function assertAdminLike(userId: string) {
  const role = await roleOf(userId);
  if (role !== "admin" && role !== "super_admin") throw new Error("Forbidden");
  return role;
}

export async function assertCanViewCsw(userId: string, cswId: string) {
  if (userId === cswId) return;
  const role = await roleOf(userId);
  if (role === "admin" || role === "super_admin") return;
  if (role === "supervisor") {
    const db = await admin();
    const { data } = await db
      .from("team_memberships")
      .select("id")
      .eq("supervisor_id", userId)
      .eq("csw_id", cswId)
      .eq("status", "active")
      .maybeSingle();
    if (data) return;
  }
  throw new Error("Forbidden");
}

export async function assertCanViewSupervisor(userId: string, supervisorId: string) {
  if (userId === supervisorId) return;
  await assertAdminLike(userId);
}

/* ------------------------------------------------------------------ */
/* stats                                                               */
/* ------------------------------------------------------------------ */

export type PinStats = {
  total: number;
  house: number;
  shop: number;
  locked_house: number;
  refused: number;
  other: number;
  today: number;
  week: number;
  month: number;
  lastActivity: string | null;
};

type PinRow = { pin_type: string; created_at: string };

export function summarise(rows: PinRow[]): PinStats {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const monthAgo = new Date(now.getTime() - 30 * 864e5);

  const stats: PinStats = {
    total: rows.length,
    house: 0,
    shop: 0,
    locked_house: 0,
    refused: 0,
    other: 0,
    today: 0,
    week: 0,
    month: 0,
    lastActivity: null,
  };

  for (const row of rows) {
    const created = new Date(row.created_at);
    if (row.pin_type === "house") stats.house += 1;
    else if (row.pin_type === "shop") stats.shop += 1;
    else if (row.pin_type === "locked_house") stats.locked_house += 1;
    else if (row.pin_type === "refused") stats.refused += 1;
    else stats.other += 1;
    if (created >= startOfDay) stats.today += 1;
    if (created >= weekAgo) stats.week += 1;
    if (created >= monthAgo) stats.month += 1;
    if (!stats.lastActivity || row.created_at > stats.lastActivity) stats.lastActivity = row.created_at;
  }
  return stats;
}

/* ------------------------------------------------------------------ */
/* queries                                                             */
/* ------------------------------------------------------------------ */

export type TeamPerson = {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  role: AppRole;
  supervisor_id: string | null;
  supervisor_name: string | null;
  stats: PinStats;
};

async function profileMap() {
  const db = await admin();
  const { data } = await db.from("profiles").select("*").order("created_at", { ascending: true });
  return data ?? [];
}

async function roleMap() {
  const db = await admin();
  const { data } = await db.from("user_roles").select("user_id, role");
  return new Map((data ?? []).map((r) => [r.user_id, r.role as AppRole]));
}

async function pinRowsByUser() {
  const db = await admin();
  const { data } = await db.from("pins").select("user_id, pin_type, created_at");
  const map = new Map<string, PinRow[]>();
  for (const p of data ?? []) {
    const list = map.get(p.user_id) ?? [];
    list.push({ pin_type: p.pin_type, created_at: p.created_at });
    map.set(p.user_id, list);
  }
  return map;
}

async function memberships() {
  const db = await admin();
  const { data } = await db.from("team_memberships").select("supervisor_id, csw_id, status");
  return (data ?? []).filter((m) => m.status === "active");
}

/** Every person with role + team + stats, ready for filtering. */
export async function fetchAllPeople(): Promise<TeamPerson[]> {
  const [profiles, roles, pins, links] = await Promise.all([
    profileMap(),
    roleMap(),
    pinRowsByUser(),
    memberships(),
  ]);
  const supOf = new Map(links.map((l) => [l.csw_id, l.supervisor_id]));
  const nameOf = new Map(profiles.map((p) => [p.id, p.full_name || p.username]));

  return profiles.map((p) => {
    const supervisorId = supOf.get(p.id) ?? null;
    return {
      id: p.id,
      username: p.username,
      full_name: p.full_name,
      phone: p.phone,
      email: p.email ?? null,
      is_active: p.is_active,
      created_at: p.created_at,
      role: roles.get(p.id) ?? "survey_user",
      supervisor_id: supervisorId,
      supervisor_name: supervisorId ? (nameOf.get(supervisorId) ?? null) : null,
      stats: summarise(pins.get(p.id) ?? []),
    };
  });
}

export type SupervisorSummary = TeamPerson & {
  memberCount: number;
  teamPins: number;
};

export async function fetchSupervisors(): Promise<SupervisorSummary[]> {
  const people = await fetchAllPeople();
  return people
    .filter((p) => p.role === "supervisor")
    .map((s) => {
      const members = people.filter((p) => p.supervisor_id === s.id);
      return {
        ...s,
        memberCount: members.length,
        teamPins: members.reduce((sum, m) => sum + m.stats.total, 0),
      };
    });
}

export async function fetchTeamMembers(supervisorId: string): Promise<TeamPerson[]> {
  const people = await fetchAllPeople();
  return people.filter((p) => p.supervisor_id === supervisorId);
}

export async function fetchUnassignedCsws(): Promise<TeamPerson[]> {
  const people = await fetchAllPeople();
  return people.filter((p) => p.role === "survey_user" && !p.supervisor_id);
}

export async function fetchPerson(userId: string): Promise<TeamPerson | null> {
  const people = await fetchAllPeople();
  return people.find((p) => p.id === userId) ?? null;
}

export async function fetchPinsOf(userId: string): Promise<Pin[]> {
  const db = await admin();
  const { data } = await db
    .from("pins")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Pin[];
}

export async function fetchActivityOf(userId: string, limit = 20) {
  const db = await admin();
  const { data } = await db
    .from("activity_logs")
    .select("id, action, details, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function setSupervisor(cswId: string, supervisorId: string | null) {
  const db = await admin();
  if (!supervisorId) {
    const { error } = await db.from("team_memberships").delete().eq("csw_id", cswId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  }
  const role = await roleOf(supervisorId);
  if (role !== "supervisor") return { ok: false as const, error: "Selected user is not a supervisor." };
  await db.from("team_memberships").delete().eq("csw_id", cswId);
  const { error } = await db
    .from("team_memberships")
    .insert({ csw_id: cswId, supervisor_id: supervisorId, status: "active" });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
