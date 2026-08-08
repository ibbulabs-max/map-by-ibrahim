import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pinSchema, usernameSchema } from "./auth.shared";

const roleSchema = z.enum(["super_admin", "admin", "supervisor", "survey_user"]);

export const listUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, fetchUsers } = await import("./admin.server");
    await assertAdmin(context.supabase, context.userId);
    return fetchUsers();
  });

export const adminStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, fetchStats } = await import("./admin.server");
    await assertAdmin(context.supabase, context.userId);
    return fetchStats();
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        username: usernameSchema,
        pin: pinSchema,
        fullName: z.string().trim().max(80).optional(),
        phone: z.string().trim().max(24).optional(),
        email: z.string().trim().email().max(255).optional().or(z.literal("")),
        role: roleSchema,
        supervisorId: z.string().uuid().nullable().optional(),
        isActive: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, assertCanManageRole, createSurveyUser } = await import("./admin.server");
    const actor = await assertAdmin(context.supabase, context.userId);
    assertCanManageRole(actor, data.role);
    return createSurveyUser(data);
  });

export const updateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        fullName: z.string().trim().max(80).nullable().optional(),
        phone: z.string().trim().max(24).nullable().optional(),
        email: z.string().trim().max(255).nullable().optional(),
        isActive: z.boolean().optional(),
        role: roleSchema.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, assertCanManageRole, updateSurveyUser } = await import("./admin.server");
    const actor = await assertAdmin(context.supabase, context.userId);
    if (data.role) assertCanManageRole(actor, data.role);
    return updateSurveyUser(data);
  });

export const resetUserPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), pin: pinSchema }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { assertAdmin, resetPin } = await import("./admin.server");
    await assertAdmin(context.supabase, context.userId);
    return resetPin(data.userId, data.pin);
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { assertAdmin, removeUser } = await import("./admin.server");
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      return { ok: false as const, error: "You cannot delete your own account." };
    }
    return removeUser(data.userId);
  });
