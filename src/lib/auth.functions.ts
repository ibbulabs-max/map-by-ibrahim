import { createServerFn } from "@tanstack/react-start";

import { USER_EMAIL_DOMAIN, loginInputSchema } from "./auth.shared";


export const pinLogin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => loginInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { signIn, lockoutCheck, registerFailure, clearFailures, findProfileByUsername } =
      await import("./auth.server");

    const username = data.username.trim().toLowerCase();

    const lock = await lockoutCheck(username);
    if (lock.locked) {
      return { ok: false as const, error: `Too many attempts. Try again in ${lock.minutes} min.` };
    }

    const profile = await findProfileByUsername(username);
    if (!profile) {
      await registerFailure(username);
      return { ok: false as const, error: "Invalid username or PIN" };
    }
    if (!profile.is_active) {
      return { ok: false as const, error: "This account is disabled. Contact an admin." };
    }

    const session = await signIn(`${username}${USER_EMAIL_DOMAIN}`, data.pin);
    if (!session) {
      const remaining = await registerFailure(username);
      return {
        ok: false as const,
        error:
          remaining > 0
            ? `Invalid PIN. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
            : "Account locked for 5 minutes.",
      };
    }

    await clearFailures(username);
    return {
      ok: true as const,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    };
  });

/** Development convenience: creates the two default accounts once. */
export const seedDefaultUsers = createServerFn({ method: "POST" }).handler(async () => {
  const { ensureSeedUsers } = await import("./auth.server");
  return ensureSeedUsers();
});

export const changeOwnPin = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ currentPin: z.string().regex(/^\d{6}$/), newPin: z.string().regex(/^\d{6}$/) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { requireSupabaseAuth } = await import("@/integrations/supabase/auth-middleware");
    void requireSupabaseAuth;
    return { ok: false as const, error: "unsupported" };
  });
