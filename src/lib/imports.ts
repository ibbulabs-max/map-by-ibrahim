export type ImportBatch = {
  id: string;
  file_names: string[];
  uploaded_by: string;
  uploaded_by_name: string | null;
  uploaded_role: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  supervisor_id: string | null;
  total_rows: number;
  unique_houses: number;
  houses_added: number;
  houses_updated: number;
  members_added: number;
  members_merged: number;
  merged_records: number;
  conflicts: number;
  unmapped_houses: number;
  new_fields: string[];
  status: string;
  created_at: string;
};

export type ImportConflict = {
  id: string;
  batch_id: string | null;
  house_uuid: string | null;
  house_id: string;
  entity: string;
  member_ref: string | null;
  field: string;
  existing_value: string | null;
  new_value: string | null;
  source_file: string | null;
  status: "pending" | "kept_existing" | "used_new" | "review_later" | string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const CONFLICT_STATUS_LABEL: Record<string, string> = {
  pending: "Needs review",
  kept_existing: "Kept existing",
  used_new: "Used new value",
  review_later: "Review later",
};
