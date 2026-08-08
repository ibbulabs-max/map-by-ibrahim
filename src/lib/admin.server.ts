import type { SupabaseClient } from "@supabase/supabase-js";

import { USER_EMAIL_DOMAIN } from "./auth.shared";
import type { AppRole } from "./roles";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function roleOf(userId: string): Promise<AppRole | null> {
  const db = await admin();
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  return (data?.role as AppRole) ?? null;
}

/** Admin or Super Admin. Returns the actor's role. */
export async function assertAdmin(_supabase: SupabaseClient, userId: string): Promise<AppRole> {
  const role = await roleOf(userId);
  if (role !== "admin" && role !== "super_admin") throw new Error("Forbidden");
  return role;
}

/** Only a Super Admin may create or modify Admin / Super Admin accounts. */
export function assertCanManageRole(actor: AppRole, target: AppRole) {
  if (actor === "super_admin") return;
  if (target === "admin" || target === "super_admin") throw new Error("Forbidden");
}

export type AdminUser = {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  role: AppRole;
  pin_count: number;
  supervisor_id: string | null;
  supervisor_name: string | null;
};

export async function fetchUsers(): Promise<AdminUser[]> {
  const db = await admin();
  const [{ data: profiles }, { data: roles }, { data: pins }, { data: links }] = await Promise.all([
    db.from("profiles").select("*").order("created_at", { ascending: true }),
    db.from("user_roles").select("user_id, role"),
    db.from("pins").select("user_id"),
    db.from("team_memberships").select("supervisor_id, csw_id, status"),
  ]);
  const roleLookup = new Map((roles ?? []).map((r) => [r.user_id, r.role as AppRole]));
  const counts = new Map<string, number>();
  for (const p of pins ?? []) counts.set(p.user_id, (counts.get(p.user_id) ?? 0) + 1);
  const supOf = new Map(
    (links ?? []).filter((l) => l.status === "active").map((l) => [l.csw_id, l.supervisor_id]),
  );
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));

  return (profiles ?? []).map((p) => {
    const supervisorId = supOf.get(p.id) ?? null;
    return {
      id: p.id,
      username: p.username,
      full_name: p.full_name,
      phone: p.phone,
      email: p.email ?? null,
      is_active: p.is_active,
      created_at: p.created_at,
      role: roleLookup.get(p.id) ?? "survey_user",
      pin_count: counts.get(p.id) ?? 0,
      supervisor_id: supervisorId,
      supervisor_name: supervisorId ? (nameOf.get(supervisorId) ?? null) : null,
    };
  });
}

export async function fetchStats() {
  const db = await admin();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ data: profiles }, { data: pins }, { data: roles }] = await Promise.all([
    db.from("profiles").select("id, is_active"),
    db.from("pins").select("id, pin_type, created_at, username"),
    db.from("user_roles").select("user_id, role"),
  ]);

  const byType: Record<string, number> = {};
  let todayPins = 0;
  for (const pin of pins ?? []) {
    byType[pin.pin_type] = (byType[pin.pin_type] ?? 0) + 1;
    if (new Date(pin.created_at) >= startOfDay) todayPins += 1;
  }
  const byRole: Record<string, number> = {};
  for (const r of roles ?? []) byRole[r.role] = (byRole[r.role] ?? 0) + 1;

  return {
    totalUsers: profiles?.length ?? 0,
    activeUsers: (profiles ?? []).filter((p) => p.is_active).length,
    inactiveUsers: (profiles ?? []).filter((p) => !p.is_active).length,
    totalPins: pins?.length ?? 0,
    todayPins,
    byType,
    supervisors: byRole["supervisor"] ?? 0,
    csws: byRole["survey_user"] ?? 0,
    admins: (byRole["admin"] ?? 0) + (byRole["super_admin"] ?? 0),
  };
}

export async function createSurveyUser(input: {
  username: string;
  pin: string;
  fullName?: string | undefined;
  phone?: string | undefined;
  email?: string | undefined;
  role: AppRole;
  supervisorId?: string | null | undefined;
  isActive?: boolean | undefined;
}) {
  const db = await admin();
  const username = input.username.trim().toLowerCase();

  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (existing) return { ok: false as const, error: "That username is already taken." };

  const { data, error } = await db.auth.admin.createUser({
    email: `${username}${USER_EMAIL_DOMAIN}`,
    password: input.pin,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) return { ok: false as const, error: error?.message ?? "Could not create user" };

  await db.from("profiles").insert({
    id: data.user.id,
    username,
    full_name: input.fullName || null,
    phone: input.phone || null,
    email: input.email || null,
    is_active: input.isActive ?? true,
  });
  await db.from("user_roles").insert({ user_id: data.user.id, role: input.role });

  if (input.role === "survey_user" && input.supervisorId) {
    await db.from("team_memberships").insert({
      csw_id: data.user.id,
      supervisor_id: input.supervisorId,
      status: "active",
    });
  }

  return { ok: true as const, id: data.user.id };
}

export async function updateSurveyUser(input: {
  userId: string;
  fullName?: string | null | undefined;
  phone?: string | null | undefined;
  email?: string | null | undefined;
  isActive?: boolean | undefined;
  role?: AppRole | undefined;
}) {
  const db = await admin();
  const patch: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    is_active?: boolean;
  } = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.email !== undefined) patch.email = input.email;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (Object.keys(patch).length) {
    const { error } = await db.from("profiles").update(patch).eq("id", input.userId);
    if (error) return { ok: false as const, error: error.message };
  }
  if (input.role) {
    await db.from("user_roles").delete().eq("user_id", input.userId);
    await db.from("user_roles").insert({ user_id: input.userId, role: input.role });
    if (input.role !== "survey_user") {
      await db.from("team_memberships").delete().eq("csw_id", input.userId);
    }
  }
  return { ok: true as const };
}

export async function resetPin(userId: string, pin: string) {
  const db = await admin();
  const { error } = await db.auth.admin.updateUserById(userId, { password: pin });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function removeUser(userId: string) {
  const db = await admin();
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}
