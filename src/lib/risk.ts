import type { House, HouseMember } from "./houses";

export type RiskLevel = "high" | "moderate" | "low" | "unknown";

export type RiskReason = { label: string; level: Exclude<RiskLevel, "unknown"> };

export type RiskResult = {
  level: RiskLevel;
  reasons: RiskReason[];
};

const ORDER: Record<RiskLevel, number> = { unknown: 0, low: 1, moderate: 2, high: 3 };

export function worstRisk(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>((acc, l) => (ORDER[l] > ORDER[acc] ? l : acc), "unknown");
}

export const RISK_META: Record<RiskLevel, { label: string; color: string; badgeClass: string }> = {
  high: { label: "High risk", color: "var(--destructive)", badgeClass: "bg-destructive text-destructive-foreground" },
  moderate: { label: "Moderate risk", color: "var(--warning)", badgeClass: "bg-warning text-warning-foreground" },
  low: { label: "Low risk", color: "var(--success)", badgeClass: "bg-success text-success-foreground" },
  unknown: { label: "No health data", color: "var(--muted-foreground)", badgeClass: "bg-muted text-muted-foreground" },
};

function norm(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Reads the first value in `data` whose normalized key matches any candidate. */
function pick(data: Record<string, unknown>, candidates: string[]): unknown {
  const wanted = candidates.map(norm);
  for (const [k, v] of Object.entries(data)) {
    if (v === null || v === undefined || v === "") continue;
    if (wanted.includes(norm(k))) return v;
  }
  return undefined;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isYes(value: unknown): boolean {
  const s = String(value ?? "").trim().toLowerCase();
  return ["yes", "y", "true", "1", "positive", "present", "known"].includes(s);
}

/** Parses "140/90", "140 / 90" or separate systolic + diastolic values. */
function bloodPressure(data: Record<string, unknown>): { sys: number; dia: number } | null {
  const combined = pick(data, ["bp", "bloodpressure", "bpmmhg", "bloodpressuremmhg"]);
  if (combined !== undefined) {
    const parts = String(combined).split(/[/\\|-]/).map((p) => num(p));
    if (parts.length >= 2 && parts[0] !== null && parts[1] !== null) {
      return { sys: parts[0] as number, dia: parts[1] as number };
    }
  }
  const sys = num(pick(data, ["systolic", "systolicbp", "sbp", "bpsystolic"]));
  const dia = num(pick(data, ["diastolic", "diastolicbp", "dbp", "bpdiastolic"]));
  if (sys !== null && dia !== null) return { sys, dia };
  return null;
}

/**
 * Risk for a single member, derived from their own survey values only.
 * High = red, Moderate = yellow, Low = green, unknown = no usable readings.
 */
export function memberRisk(data: Record<string, unknown>): RiskResult {
  const reasons: RiskReason[] = [];
  let measured = false;

  const bmi = num(pick(data, ["bmi", "bodymassindex"]));
  if (bmi !== null && bmi > 0) {
    measured = true;
    if (bmi >= 30) reasons.push({ label: `BMI ${bmi} (obese)`, level: "high" });
    else if (bmi >= 25) reasons.push({ label: `BMI ${bmi} (overweight)`, level: "moderate" });
    else if (bmi < 18.5) reasons.push({ label: `BMI ${bmi} (underweight)`, level: "moderate" });
  }

  const bp = bloodPressure(data);
  if (bp && bp.sys > 0 && bp.dia > 0) {
    measured = true;
    if (bp.sys >= 140 || bp.dia >= 90) {
      reasons.push({ label: `BP ${bp.sys}/${bp.dia} (hypertensive)`, level: "high" });
    } else if (bp.sys >= 130 || bp.dia >= 80) {
      reasons.push({ label: `BP ${bp.sys}/${bp.dia} (elevated)`, level: "moderate" });
    }
  }

  const rbs = num(pick(data, ["rbs", "randombloodsugar", "bloodsugar", "sugar", "glucose", "rbsmgdl"]));
  if (rbs !== null && rbs > 0) {
    measured = true;
    if (rbs >= 200) reasons.push({ label: `RBS ${rbs} mg/dL (high)`, level: "high" });
    else if (rbs >= 140) reasons.push({ label: `RBS ${rbs} mg/dL (raised)`, level: "moderate" });
  }

  const fbs = num(pick(data, ["fbs", "fastingbloodsugar", "fastingsugar", "fbsmgdl"]));
  if (fbs !== null && fbs > 0) {
    measured = true;
    if (fbs >= 126) reasons.push({ label: `FBS ${fbs} mg/dL (high)`, level: "high" });
    else if (fbs >= 100) reasons.push({ label: `FBS ${fbs} mg/dL (raised)`, level: "moderate" });
  }

  for (const [key, label] of [
    ["diabetes", "Diabetes"],
    ["hypertension", "Hypertension"],
    ["tb", "TB"],
    ["tuberculosis", "Tuberculosis"],
    ["cancer", "Cancer"],
    ["heartdisease", "Heart disease"],
  ] as const) {
    const v = pick(data, [key]);
    if (v !== undefined) {
      measured = true;
      if (isYes(v)) reasons.push({ label: `${label}: yes`, level: "high" });
    }
  }

  if (!measured) return { level: "unknown", reasons: [] };
  const level = worstRisk(reasons.map((r) => r.level));
  return { level: level === "unknown" ? "low" : level, reasons };
}

/** House risk is the worst risk across its members. */
export function houseRisk(house: Pick<House, "house_members">): RiskResult {
  const members = (house.house_members ?? []) as HouseMember[];
  const results = members.map((m) => memberRisk(m.data ?? {}));
  const level = worstRisk(results.map((r) => r.level));
  const reasons = results.flatMap((r) => r.reasons).filter((r) => r.level === level);
  return { level, reasons };
}
