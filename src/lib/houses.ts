export type HouseMember = {
  id: string;
  house_uuid: string;
  member_id: string | null;
  member_name: string | null;
  data: Record<string, unknown>;
  source_files?: string[];
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  possible_duplicate?: boolean;
  created_at: string;
  updated_at: string;
};

export type House = {
  id: string;
  house_id: string;
  house_number: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  location_status: string;
  mapped_by: string | null;
  mapped_at: string | null;
  location_source: string | null;
  assigned_csw_id: string | null;
  supervisor_id: string | null;
  pin_id: string | null;
  data: Record<string, unknown>;
  created_by: string | null;
  uploaded_by?: string | null;
  uploaded_at?: string | null;
  source_files?: string[];
  created_at: string;
  updated_at: string;
  house_members?: HouseMember[];
};

export const LOCATION_STATUS = {
  mapped: "mapped",
  not_mapped: "not_mapped",
  needs_verification: "needs_verification",
} as const;

export function locationStatusLabel(status: string | null | undefined) {
  if (status === LOCATION_STATUS.mapped) return "Mapped";
  if (status === LOCATION_STATUS.needs_verification) return "Needs verification";
  return "Not mapped";
}

/** Human label for a raw imported column key. */
export function fieldLabel(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function matchesHouseSearch(house: House, term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  if (house.house_id.toLowerCase().includes(q)) return true;
  if ((house.house_number ?? "").toLowerCase().includes(q)) return true;
  return (house.house_members ?? []).some(
    (m) =>
      (m.member_name ?? "").toLowerCase().includes(q) ||
      (m.member_id ?? "").toLowerCase().includes(q),
  );
}
