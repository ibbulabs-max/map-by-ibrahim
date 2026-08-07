import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { LOCKOUT_MINUTES, MAX_LOGIN_ATTEMPTS, USER_EMAIL_DOMAIN } from "./auth.shared";

function publishableClient(): SupabaseClient {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function findProfileByUsername(username: string) {
  const db = await admin();
  const { data } = await db
    .from("profiles")
    .select("id, username, is_active")
    .eq("username", username)
    .maybeSingle();
  return data;
}

export async function lockoutCheck(username: string) {
  const db = await admin();
  const { data } = await db
    .from("login_attempts")
    .select("locked_until")
    .eq("username", username)
    .maybeSingle();
  if (data?.locked_until) {
    const until = new Date(data.locked_until).getTime();
    if (until > Date.now()) {
      return { locked: true as const, minutes: Math.max(1, Math.ceil((until - Date.now()) / 60000)) };
    }
  }
  return { locked: false as const, minutes: 0 };
}

/** Returns how many attempts remain before lockout (0 means now locked). */
export async function registerFailure(username: string): Promise<number> {
  const db = await admin();
  const { data } = await db
    .from("login_attempts")
    .select("fail_count")
    .eq("username", username)
    .maybeSingle();
  const count = (data?.fail_count ?? 0) + 1;
  const locked = count >= MAX_LOGIN_ATTEMPTS;
  await db.from("login_attempts").upsert({
    username,
    fail_count: locked ? 0 : count,
    locked_until: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString() : null,
    updated_at: new Date().toISOString(),
  });
  return locked ? 0 : MAX_LOGIN_ATTEMPTS - count;
}

export async function clearFailures(username: string) {
  const db = await admin();
  await db.from("login_attempts").delete().eq("username", username);
}

export async function signIn(email: string, password: string) {
  const client = publishableClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  return data.session;
}

const SEED_USERS = [
  { username: "admin1", pin: "950534", role: "admin" as const, full_name: "Admin User" },
  { username: "chw1", pin: "950534", role: "survey_user" as const, full_name: "Survey User" },
];

export async function ensureSeedUsers() {
  const db = await admin();
  let created = 0;
  for (const seed of SEED_USERS) {
    const { data: existing } = await db
      .from("profiles")
      .select("id")
      .eq("username", seed.username)
      .maybeSingle();
    if (existing) continue;

    const { data, error } = await db.auth.admin.createUser({
      email: `${seed.username}${USER_EMAIL_DOMAIN}`,
      password: seed.pin,
      email_confirm: true,
      user_metadata: { username: seed.username },
    });
    if (error || !data.user) continue;

    await db.from("profiles").insert({
      id: data.user.id,
      username: seed.username,
      full_name: seed.full_name,
      is_active: true,
    });
    await db.from("user_roles").insert({ user_id: data.user.id, role: seed.role });
    created += 1;
  }
  return { created };
}
