import { z } from "zod";

export const USER_EMAIL_DOMAIN = "@survey.local";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(32)
  .regex(/^[a-zA-Z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only");

export const pinSchema = z.string().regex(/^\d{6}$/, "PIN must be exactly 6 digits");

export const loginInputSchema = z.object({
  username: usernameSchema,
  pin: pinSchema,
});

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 5;
