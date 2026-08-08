import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const idSchema = z.object({ userId: z.string().uuid() });

/** Role-aware team overview: admins get supervisors, supervisors get their CSWs. */
export const teamOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t = await import("./team.server");
    const role = await t.roleOf(context.userId);
    if (role === "admin" || role === "super_admin") {
      const [supervisors, unassigned] = await Promise.all([
        t.fetchSupervisors(),
        t.fetchUnassignedCsws(),
      ]);
      return { scope: "admin" as const, supervisors, unassigned, members: [] };
    }
    if (role === "supervisor") {
      const members = await t.fetchTeamMembers(context.userId);
      return { scope: "supervisor" as const, supervisors: [], unassigned: [], members };
    }
    throw new Error("Forbidden");
  });

export const supervisorDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const t = await import("./team.server");
    await t.assertCanViewSupervisor(context.userId, data.userId);
    const [person, members] = await Promise.all([
      t.fetchPerson(data.userId),
      t.fetchTeamMembers(data.userId),
    ]);
    return { person, members };
  });

export const cswDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const t = await import("./team.server");
    await t.assertCanViewCsw(context.userId, data.userId);
    const [person, pins, activity] = await Promise.all([
      t.fetchPerson(data.userId),
      t.fetchPinsOf(data.userId),
      t.fetchActivityOf(data.userId),
    ]);
    return { person, pins, activity };
  });

/** Active supervisors, for the "Connect to Supervisor" dropdown. */
export const listSupervisors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t = await import("./team.server");
    await t.assertAdminLike(context.userId);
    const supervisors = await t.fetchSupervisors();
    return supervisors.filter((s) => s.is_active);
  });

export const assignSupervisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ cswId: z.string().uuid(), supervisorId: z.string().uuid().nullable() })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const t = await import("./team.server");
    await t.assertAdminLike(context.userId);
    return t.setSupervisor(data.cswId, data.supervisorId);
  });

/** People the caller may filter maps/records by (admins: everyone, supervisors: their team). */
export const teamPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const t = await import("./team.server");
    const role = await t.roleOf(context.userId);
    if (role === "admin" || role === "super_admin") {
      const [supervisors, all] = await Promise.all([t.fetchSupervisors(), t.fetchAllPeople()]);
      return {
        scope: "admin" as const,
        supervisors: supervisors.map((s) => ({ id: s.id, name: s.full_name || s.username })),
        people: all
          .filter((p) => p.role === "survey_user")
          .map((p) => ({
            id: p.id,
            name: p.full_name || p.username,
            username: p.username,
            supervisor_id: p.supervisor_id,
          })),
      };
    }
    if (role === "supervisor") {
      const members = await t.fetchTeamMembers(context.userId);
      return {
        scope: "supervisor" as const,
        supervisors: [],
        people: members.map((p) => ({
          id: p.id,
          name: p.full_name || p.username,
          username: p.username,
          supervisor_id: p.supervisor_id,
        })),
      };
    }
    return { scope: "csw" as const, supervisors: [], people: [] };
  });
