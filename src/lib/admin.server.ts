import type { SupabaseClient } from "@supabase/supabase-js";

import { USER_EMAIL_DOMAIN } from "./auth.shared";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

export type AdminUser = {
  id: string;
  username: string;
  full_name: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  role: "admin" | "survey_user";
  pin_count: number;
};

export async function fetchUsers(): Promise<AdminUser[]> {
  const db = await admin();
  const [{ data: profiles }, { data: roles }, { data: pins }] = await Promise.all([
    db.from("profiles").select("*").order("created_at", { ascending: true }),
    db.from("user_roles").select("user_id, role"),
    db.from("pins").select("user_id"),
  ]);
  const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r.role]));
  const counts = new Map<string, number>();
  for (const p of pins ?? []) counts.set(p.user_id, (counts.get(p.user_id) ?? 0) + 1);

  return (profiles ?? []).map((p) => ({
    id: p.id,
    username: p.username,
    full_name: p.full_name,
    phone: p.phone,
    is_active: p.is_active,
    created_at: p.created_at,
    role: (roleMap.get(p.id) ?? "survey_user") as AdminUser["role"],
    pin_count: counts.get(p.id) ?? 0,
  }));
}

export async function fetchStats() {
  const db = await admin();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ data: profiles }, { data: pins }] = await Promise.all([
    db.from("profiles").select("id, is_active"),
    db.from("pins").select("id, pin_type, created_at, username"),
  ]);

  const byType: Record<string, number> = {};
  let todayPins = 0;
  for (const pin of pins ?? []) {
    byType[pin.pin_type] = (byType[pin.pin_type] ?? 0) + 1;
    if (new Date(pin.created_at) >= startOfDay) todayPins += 1;
  }

  return {
    totalUsers: profiles?.length ?? 0,
    activeUsers: (profiles ?? []).filter((p) => p.is_active).length,
    inactiveUsers: (profiles ?? []).filter((p) => !p.is_active).length,
    totalPins: pins?.length ?? 0,
    todayPins,
    byType,
  };
}

export async function createSurveyUser(input: {
  username: string;
  pin: string;
  fullName?: string | undefined;
  phone?: string | undefined;
  role: "admin" | "survey_user";
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
    full_name: input.fullName ?? null,
    phone: input.phone ?? null,
    is_active: true,
  });
  await db.from("user_roles").insert({ user_id: data.user.id, role: input.role });
  return { ok: true as const, id: data.user.id };
}

export async function updateSurveyUser(input: {
  userId: string;
  fullName?: string | null | undefined;
  phone?: string | null | undefined;
  isActive?: boolean | undefined;
  role?: "admin" | "survey_user" | undefined;
}) {
  const db = await admin();
  const patch: {
    full_name?: string | null;
    phone?: string | null;
    is_active?: boolean;
  } = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.isActive !== undefined) patch.is_active = input.isActive;

  if (Object.keys(patch).length) {
    const { error } = await db.from("profiles").update(patch).eq("id", input.userId);
    if (error) return { ok: false as const, error: error.message };
  }
  if (input.role) {
    await db.from("user_roles").delete().eq("user_id", input.userId);
    await db.from("user_roles").insert({ user_id: input.userId, role: input.role });
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
