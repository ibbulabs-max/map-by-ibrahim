import type { House, HouseMember } from "./houses";
import { memberRisk, worstRisk, type RiskLevel, type RiskResult } from "./risk";

/* ------------------------------------------------------------------ *
 * Configuration — every clinical option lives here, never inline in UI
 * ------------------------------------------------------------------ */

export type Option<T extends string = string> = { value: T; label: string };

export const USE_OPTIONS: Option[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
  { value: "past", label: "Used in past" },
];

export const FREQUENCY_OPTIONS: Option[] = [
  { value: "less_frequently", label: "Less Frequently" },
  { value: "frequently", label: "Frequently" },
  { value: "daily", label: "Daily" },
];

export const KNOWN_HISTORY_OPTIONS: Option[] = [
  { value: "diabetes", label: "Diabetes" },
  { value: "hypertension", label: "Hypertension" },
  { value: "others", label: "Others" },
];

/** Known-history entries that ask a follow-up medication question. */
export const MEDICATION_QUESTIONS: Record<string, string> = {
  diabetes: "Taking tablets for Diabetes?",
  hypertension: "Taking tablets for Hypertension?",
};

export const WAIST_OPTIONS: Record<"female" | "male" | "unknown", Option[]> = {
  female: [
    { value: "lt80", label: "Less than 80 cm" },
    { value: "81_90", label: "81–90 cm" },
    { value: "gt90", label: "Above 90 cm" },
  ],
  male: [
    { value: "lt90", label: "Less than 90 cm" },
    { value: "91_100", label: "91–100 cm" },
    { value: "gt100", label: "Above 100 cm" },
  ],
  unknown: [
    { value: "lt90", label: "Less than 90 cm" },
    { value: "91_100", label: "91–100 cm" },
    { value: "gt100", label: "Above 100 cm" },
  ],
};

/** Waist bands considered raised / high risk (shared by risk engine + UI). */
export const WAIST_RAISED = ["81_90", "91_100"];
export const WAIST_HIGH = ["gt90", "gt100"];

export const PHYSICAL_ACTIVITY_OPTIONS: Option[] = [
  { value: "lt150", label: "Less than 150 min/week" },
  { value: "gte150", label: "150+ min/week" },
];

export const GENDER_OPTIONS: Option[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
];

export const BP_SYMPTOMS = [
  "Headache",
  "Dizziness",
  "Blurred Vision",
  "Chest Discomfort",
  "Shortness of Breath",
  "Other",
];

export const SUGAR_SYMPTOMS = [
  "Excessive Thirst",
  "Frequent Urination",
  "Excessive Hunger",
  "Unexplained Weight Loss",
  "Blurred Vision",
  "Slow Healing Wounds",
  "Other",
];

export const REFERRAL_STATUS_OPTIONS: Option[] = [
  { value: "pending", label: "Pending" },
  { value: "referred", label: "Referred" },
  { value: "completed", label: "Completed" },
];

export const BMI_CATEGORIES: { max: number; label: string; level: RiskLevel }[] = [
  { max: 18.5, label: "Underweight", level: "moderate" },
  { max: 25, label: "Normal", level: "low" },
  { max: 30, label: "Overweight", level: "moderate" },
  { max: 35, label: "Obesity Class 1", level: "high" },
  { max: 40, label: "Obesity Class 2", level: "high" },
  { max: Infinity, label: "Obesity Class 3", level: "high" },
];

/** Age from which a member enters the assessment queue. */
export const ASSESSMENT_MIN_AGE = 30;

/** Follow-up interval in days by resulting risk level. */
export const FOLLOW_UP_DAYS: Record<RiskLevel, number | null> = {
  high: 7,
  moderate: 30,
  low: 180,
  unknown: null,
};

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export type Assessment = {
  id?: string;
  house_uuid: string;
  member_uuid: string;
  available: boolean;
  known_history: string[];
  medication: Record<string, unknown>;
  medical_details: string | null;
  alcohol: string | null;
  alcohol_frequency: string | null;
  smoking: string | null;
  smoking_frequency: string | null;
  tobacco: string | null;
  tobacco_frequency: string | null;
  waist: string | null;
  physical_activity: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  bmi_category: string | null;
  systolic: number | null;
  diastolic: number | null;
  bp_symptoms: string[];
  blood_sugar: number | null;
  sugar_symptoms: string[];
  referral_needed: boolean;
  referral: Record<string, unknown>;
  notes: string | null;
  risk_level: RiskLevel;
  risk_reasons: unknown[];
  extra: Record<string, unknown>;
  assessed_at?: string;
};

export function emptyAssessment(houseUuid: string, memberUuid: string): Assessment {
  return {
    house_uuid: houseUuid,
    member_uuid: memberUuid,
    available: true,
    known_history: [],
    medication: {},
    medical_details: null,
    alcohol: null,
    alcohol_frequency: null,
    smoking: null,
    smoking_frequency: null,
    tobacco: null,
    tobacco_frequency: null,
    waist: null,
    physical_activity: null,
    height_cm: null,
    weight_kg: null,
    bmi: null,
    bmi_category: null,
    systolic: null,
    diastolic: null,
    bp_symptoms: [],
    blood_sugar: null,
    sugar_symptoms: [],
    referral_needed: false,
    referral: {},
    notes: null,
    risk_level: "unknown",
    risk_reasons: [],
    extra: {},
  };
}

/* ------------------------------------------------------------------ *
 * Derived values
 * ------------------------------------------------------------------ */

export function calcBmi(heightCm: number | null, weightKg: number | null): number | null {
  if (!heightCm || !weightKg || heightCm < 50 || weightKg <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(bmi: number | null) {
  if (bmi === null) return null;
  return BMI_CATEGORIES.find((c) => bmi < c.max) ?? null;
}

function norm(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Reads a member field from the dynamic `data` bag (import-safe). */
export function memberField(member: Pick<HouseMember, "data">, candidates: string[]): string {
  const wanted = candidates.map(norm);
  for (const [k, v] of Object.entries(member.data ?? {})) {
    if (v === null || v === undefined || v === "") continue;
    if (wanted.includes(norm(k))) return String(v);
  }
  return "";
}

export const MEMBER_FIELD_KEYS = {
  age: ["age", "memberage", "years"],
  gender: ["gender", "sex"],
  phone: ["mobile_number", "mobile", "phone", "contact", "phonenumber"],
  occupation: ["occupation", "job", "work", "profession"],
};

export function memberAge(member: Pick<HouseMember, "data">): number | null {
  const raw = memberField(member, MEMBER_FIELD_KEYS.age);
  const n = Number(raw.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export function memberGender(member: Pick<HouseMember, "data">): "female" | "male" | "unknown" {
  const g = memberField(member, MEMBER_FIELD_KEYS.gender).toLowerCase();
  if (g.startsWith("f") || g.startsWith("w")) return "female";
  if (g.startsWith("m")) return "male";
  return "unknown";
}

/** Members eligible for the 30+ assessment queue. */
export function eligibleMembers(house: Pick<House, "house_members">): HouseMember[] {
  return (house.house_members ?? []).filter((m) => (memberAge(m) ?? 0) >= ASSESSMENT_MIN_AGE);
}

/* ------------------------------------------------------------------ *
 * Bridge to the single centralized risk engine (src/lib/risk.ts)
 * ------------------------------------------------------------------ */

/**
 * Flattens an assessment into the same key/value shape the risk engine and
 * Excel exports already understand, so one engine serves manual assist, edit
 * and Smart Upload without a second set of rules.
 */
export function assessmentToData(a: Assessment): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.height_cm !== null) out["height_cm"] = a.height_cm;
  if (a.weight_kg !== null) out["weight_kg"] = a.weight_kg;
  const bmi = a.bmi ?? calcBmi(a.height_cm, a.weight_kg);
  if (bmi !== null) {
    out["bmi"] = bmi;
    out["bmi_category"] = bmiCategory(bmi)?.label ?? null;
  }
  if (a.systolic !== null) out["systolic"] = a.systolic;
  if (a.diastolic !== null) out["diastolic"] = a.diastolic;
  if (a.blood_sugar !== null) out["rbs"] = a.blood_sugar;
  out["diabetes"] = a.known_history.includes("diabetes") ? "yes" : "no";
  out["hypertension"] = a.known_history.includes("hypertension") ? "yes" : "no";
  if (a.waist) out["waist"] = a.waist;
  if (a.physical_activity) out["physical_activity"] = a.physical_activity;
  if (a.alcohol) out["alcohol"] = a.alcohol;
  if (a.smoking) out["smoking"] = a.smoking;
  if (a.tobacco) out["tobacco"] = a.tobacco;
  if (a.medical_details) out["medical_details"] = a.medical_details;
  if (a.bp_symptoms.length) out["bp_symptoms"] = a.bp_symptoms.join(", ");
  if (a.sugar_symptoms.length) out["sugar_symptoms"] = a.sugar_symptoms.join(", ");
  out["referral_needed"] = a.referral_needed ? "yes" : "no";
  if (a.referral_needed) {
    for (const [k, v] of Object.entries(a.referral)) out[`referral_${k}`] = v;
  }
  if (a.notes) out["assessment_notes"] = a.notes;
  return out;
}

/** Risk for one assessment — delegates to the shared engine. */
export function assessmentRisk(a: Assessment): RiskResult {
  return memberRisk(assessmentToData(a));
}

export function overallRisk(levels: RiskLevel[]): RiskLevel {
  return worstRisk(levels);
}
