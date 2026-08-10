/**
 * Multi-file merge engine.
 *
 * Every uploaded spreadsheet is prepared with the existing dynamic column
 * detection, then folded into ONE canonical house map keyed by House ID.
 * Non-empty values always win over blanks; two different non-empty values
 * never overwrite each other silently — they become a conflict for review.
 * Map-only rows (no House ID) fold into a canonical set of places keyed by
 * pin type + coordinates, so re-importing the same file never duplicates them.
 */
import {
  prepareImport,
  type DetectedColumn,
  type LocationInfo,
  type PreparedHouse,
  type PreparedPlace,
} from "@/lib/excel-import";

export type ConflictDraft = {
  house_id: string;
  entity: "house" | "member" | "assignment" | "location";
  member_ref: string | null;
  field: string;
  existing_value: string | null;
  new_value: string | null;
  source_file: string | null;
};

export type MergedMember = {
  key: string;
  member_id: string | null;
  member_name: string | null;
  data: Record<string, unknown>;
  sources: string[];
  possibleDuplicate: boolean;
};

export type MergedHouse = {
  house_id: string;
  house_number: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  data: Record<string, unknown>;
  members: MergedMember[];
  sources: string[];
  rowCount: number;
  assignedTo: string | null;
  location: LocationInfo | null;
};

export type MergedPlace = PreparedPlace & { sources: string[]; assignedTo: string | null };

export type FileInput = {
  name: string;
  rows: Record<string, unknown>[];
  columns: DetectedColumn[];
  assignedTo: string | null;
};

export type MergeResult = {
  houses: MergedHouse[];
  places: MergedPlace[];
  totalRows: number;
  totalMembers: number;
  mergedRecords: number;
  missingHouseId: number;
  missingHouseNumber: number;
  duplicateRows: number;
  possibleDuplicateMembers: number;
  rowsWithCoords: number;
  rowsWithoutCoords: number;
  invalidCoords: number;
  typeCounts: Record<string, number>;
  conflicts: ConflictDraft[];
  fields: string[];
};

export function isBlank(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}

/** Keeps the existing value unless it is blank; reports non-empty disagreements. */
export function pickValue<T>(
  existing: T | null,
  incoming: T | null,
  ctx: Omit<ConflictDraft, "existing_value" | "new_value">,
  conflicts: ConflictDraft[],
): T | null {
  if (isBlank(incoming)) return existing;
  if (isBlank(existing)) return incoming;
  if (String(existing).trim() === String(incoming).trim()) return existing;
  conflicts.push({
    ...ctx,
    existing_value: String(existing),
    new_value: String(incoming),
  });
  return existing;
}

export function mergeData(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  ctx: Omit<ConflictDraft, "field" | "existing_value" | "new_value">,
  conflicts: ConflictDraft[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (isBlank(value)) continue;
    const current = out[key];
    if (isBlank(current)) {
      out[key] = value;
      continue;
    }
    if (String(current).trim() !== String(value).trim()) {
      conflicts.push({
        ...ctx,
        field: key,
        existing_value: String(current),
        new_value: String(value),
      });
    }
  }
  return out;
}

export function sameCoords(a: LocationInfo, b: LocationInfo): boolean {
  return (
    Math.abs(a.latitude - b.latitude) < 0.000015 && Math.abs(a.longitude - b.longitude) < 0.000015
  );
}

/** Folds a second location for the same house: fills blanks, flags real moves. */
function foldLocation(
  target: MergedHouse,
  incoming: LocationInfo,
  fileName: string,
  conflicts: ConflictDraft[],
) {
  if (!target.location) {
    target.location = { ...incoming };
    target.latitude = incoming.latitude;
    target.longitude = incoming.longitude;
    return;
  }
  const current = target.location;
  if (!sameCoords(current, incoming)) {
    conflicts.push({
      house_id: target.house_id,
      entity: "location",
      member_ref: null,
      field: "location",
      existing_value: `${current.latitude.toFixed(6)}, ${current.longitude.toFixed(6)}`,
      new_value: `${incoming.latitude.toFixed(6)}, ${incoming.longitude.toFixed(6)}`,
      source_file: fileName,
    });
    return;
  }
  current.accuracy = current.accuracy ?? incoming.accuracy;
  current.notes = current.notes ?? incoming.notes;
  current.owner_name = current.owner_name ?? incoming.owner_name;
  current.surveyor = current.surveyor ?? incoming.surveyor;
  current.external_created_at = current.external_created_at ?? incoming.external_created_at;
  if (current.pin_type === "house" && incoming.pin_type !== "house") {
    current.pin_type = incoming.pin_type;
    current.custom_type = incoming.custom_type;
  }
}

function normName(name: string | null): string {
  return (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Cheap similarity for "possible duplicate member" detection. */
function similar(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const at = new Set(a.split(" ").filter(Boolean));
  const bt = new Set(b.split(" ").filter(Boolean));
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared += 1;
  return shared > 0 && shared >= Math.min(at.size, bt.size);
}

function memberKey(m: { member_id: string | null; member_name: string | null }): string {
  if (m.member_id) return `id:${m.member_id.trim().toUpperCase()}`;
  return `name:${normName(m.member_name)}`;
}

function foldHouse(
  target: MergedHouse,
  incoming: PreparedHouse,
  fileName: string,
  assignedTo: string | null,
  conflicts: ConflictDraft[],
  counters: { merged: number; possibleDuplicates: number },
) {
  const base = { house_id: target.house_id, entity: "house" as const, member_ref: null, source_file: fileName };
  target.house_number = pickValue(target.house_number, incoming.house_number, { ...base, field: "house_number" }, conflicts);
  target.status = pickValue(target.status, incoming.status, { ...base, field: "status" }, conflicts);
  if (incoming.location) foldLocation(target, incoming.location, fileName, conflicts);
  target.latitude = target.location?.latitude ?? target.latitude;
  target.longitude = target.location?.longitude ?? target.longitude;
  target.data = mergeData(target.data, incoming.data, base, conflicts);
  target.rowCount += incoming.rowCount;
  if (!target.sources.includes(fileName)) target.sources.push(fileName);
  if (!target.assignedTo) target.assignedTo = assignedTo;
  counters.merged += 1;

  for (const member of incoming.members) {
    const key = memberKey(member);
    const exact = target.members.find((m) => m.key === key);
    if (exact) {
      const ctx = {
        house_id: target.house_id,
        entity: "member" as const,
        member_ref: exact.member_id ?? exact.member_name,
        source_file: fileName,
      };
      exact.member_name = pickValue(exact.member_name, member.member_name, { ...ctx, field: "member_name" }, conflicts);
      exact.member_id = exact.member_id ?? member.member_id;
      exact.data = mergeData(exact.data, member.data, ctx, conflicts);
      if (!exact.sources.includes(fileName)) exact.sources.push(fileName);
      counters.merged += 1;
      continue;
    }
    const fuzzy = !member.member_id
      ? target.members.find((m) => similar(normName(m.member_name), normName(member.member_name)))
      : undefined;
    const next: MergedMember = {
      key,
      member_id: member.member_id,
      member_name: member.member_name,
      data: { ...member.data },
      sources: [fileName],
      possibleDuplicate: Boolean(fuzzy),
    };
    if (fuzzy) counters.possibleDuplicates += 1;
    target.members.push(next);
  }
}

/** Folds every uploaded file into ONE canonical set of houses + places. */
export function mergeFiles(files: FileInput[]): MergeResult {
  const map = new Map<string, MergedHouse>();
  const placeMap = new Map<string, MergedPlace>();
  const conflicts: ConflictDraft[] = [];
  const counters = { merged: 0, possibleDuplicates: 0 };
  let totalRows = 0;
  let missingHouseId = 0;
  let missingHouseNumber = 0;
  let duplicateRows = 0;
  let rowsWithCoords = 0;
  let rowsWithoutCoords = 0;
  let invalidCoords = 0;
  const typeCounts: Record<string, number> = {};

  for (const file of files) {
    const prepared = prepareImport(file.rows, file.columns);
    totalRows += prepared.totalRows;
    missingHouseId += prepared.missingHouseId;
    missingHouseNumber += prepared.missingHouseNumber;
    duplicateRows += prepared.duplicateHouseIds;
    rowsWithCoords += prepared.rowsWithCoords;
    rowsWithoutCoords += prepared.rowsWithoutCoords;
    invalidCoords += prepared.invalidCoords;
    for (const [k, v] of Object.entries(prepared.typeCounts)) typeCounts[k] = (typeCounts[k] ?? 0) + v;

    for (const house of prepared.houses) {
      const key = house.house_id.toUpperCase();
      const found = map.get(key);
      if (!found) {
        map.set(key, {
          house_id: house.house_id,
          house_number: house.house_number,
          status: house.status,
          latitude: house.latitude,
          longitude: house.longitude,
          data: { ...house.data },
          members: house.members.map((m) => ({
            key: memberKey(m),
            member_id: m.member_id,
            member_name: m.member_name,
            data: { ...m.data },
            sources: [file.name],
            possibleDuplicate: false,
          })),
          sources: [file.name],
          rowCount: house.rowCount,
          assignedTo: file.assignedTo,
          location: house.location ? { ...house.location } : null,
        });
        continue;
      }
      foldHouse(found, house, file.name, file.assignedTo, conflicts, counters);
    }

    for (const place of prepared.places) {
      const found = placeMap.get(place.key);
      if (!found) {
        placeMap.set(place.key, { ...place, sources: [file.name], assignedTo: file.assignedTo });
        continue;
      }
      found.data = { ...found.data, ...place.data };
      found.location.accuracy = found.location.accuracy ?? place.location.accuracy;
      found.location.notes = found.location.notes ?? place.location.notes;
      found.location.owner_name = found.location.owner_name ?? place.location.owner_name;
      found.location.surveyor = found.location.surveyor ?? place.location.surveyor;
      if (!found.sources.includes(file.name)) found.sources.push(file.name);
      counters.merged += 1;
    }
  }

  const houses = [...map.values()];
  const fields = new Set<string>();
  for (const h of houses) {
    for (const k of Object.keys(h.data)) fields.add(k);
    for (const m of h.members) for (const k of Object.keys(m.data)) fields.add(k);
  }

  return {
    houses,
    places: [...placeMap.values()],
    totalRows,
    totalMembers: houses.reduce((s, h) => s + h.members.length, 0),
    mergedRecords: counters.merged,
    missingHouseId,
    missingHouseNumber,
    duplicateRows,
    possibleDuplicateMembers: counters.possibleDuplicates,
    rowsWithCoords,
    rowsWithoutCoords,
    invalidCoords,
    typeCounts,
    conflicts,
    fields: [...fields].sort(),
  };
}
