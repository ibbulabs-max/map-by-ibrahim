export type AppRole = "super_admin" | "admin" | "supervisor" | "survey_user";

export const ALL_ROLES: AppRole[] = ["super_admin", "admin", "supervisor", "survey_user"];

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  survey_user: "CSW / Survey User",
};

export const ROLE_SHORT: Record<AppRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  supervisor: "Supervisor",
  survey_user: "CSW",
};

export const ROLE_RANK: Record<AppRole, number> = {
  super_admin: 4,
  admin: 3,
  supervisor: 2,
  survey_user: 1,
};

export function isAdminRole(role: AppRole | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export function canCreateRole(actor: AppRole | null, target: AppRole): boolean {
  if (actor === "super_admin") return true;
  if (actor === "admin") return target === "supervisor" || target === "survey_user";
  return false;
}
