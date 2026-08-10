/** Dynamic Excel/CSV parsing + mapping + preview analysis for the House importer. */
import { normalizePinType } from "@/lib/pin-types";

export type AppField =
  | "house_id"
  | "house_number"
  | "member_id"
  | "member_name"
  | "status"
  | "latitude"
  | "longitude"
  | "accuracy"
  | "type"
  | "owner_name"
  | "notes"
  | "surveyor"
  | "created_at"
  | "ignore"
  | "extra";

export const APP_FIELDS: { value: AppField; label: string }[] = [
  { value: "house_id", label: "House ID" },
  { value: "house_number", label: "House Number" },
  { value: "member_id", label: "Member ID" },
  { value: "member_name", label: "Member Name" },
  { value: "status", label: "House Status" },
  { value: "latitude", label: "Latitude" },
  { value: "longitude", label: "Longitude" },
  { value: "accuracy", label: "GPS Accuracy (m)" },
  { value: "type", label: "Pin Type" },
  { value: "owner_name", label: "Owner Name" },
  { value: "notes", label: "Notes" },
  { value: "surveyor", label: "Surveyor" },
  { value: "created_at", label: "Captured At" },
  { value: "extra", label: "Keep as extra field" },
  { value: "ignore", label: "Ignore" },
];

export type DetectedColumn = {
  name: string;
  type: "text" | "number" | "date" | "empty";
  samples: string[];
  field: AppField;
};

export type SheetData = {
  sheetNames: string[];
  sheet: string;
  rows: Record<string, unknown>[];
  columns: DetectedColumn[];
};

/** Collapses "House ID", "HOUSE_ID", "house id" … to one comparable token. */
export function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Stable snake_case key used to store an extra column, so files union cleanly. */
export function canonicalExtraKey(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

/** Known aliases per logical field — matched on the normalized token. */
const ALIASES: Record<Exclude<AppField, "ignore" | "extra">, string[]> = {
  house_id: ["houseid", "hid", "householdid", "housecode", "hhid", "houseidno", "houseidnumber"],
  house_number: [
    "housenumber",
    "houseno",
    "housenum",
    "doorno",
    "doornumber",
    "doornum",
    "hno",
    "hhno",
    "housedoorno",
    "address",
    "houseaddress",
  ],
  member_id: ["memberid", "mid", "personid", "membercode", "individualid", "patientid"],
  member_name: ["membername", "personname", "name", "fullname", "individualname", "patientname"],
  status: ["status", "housestatus", "surveystatus"],
  latitude: ["lat", "latitude", "ycoordinate", "ycoord", "gpslat", "gpslatitude"],
  longitude: ["lon", "lng", "long", "longitude", "xcoordinate", "xcoord", "gpslng", "gpslongitude"],
  accuracy: ["accuracy", "accuracym", "gpsaccuracy", "accuracymeters", "acc", "accm"],
  type: ["type", "pintype", "placetype", "recordtype", "category", "structuretype", "locationtype"],
  owner_name: ["ownername", "owner", "headofhousehold", "hohname", "householdhead"],
  notes: ["notes", "note", "remarks", "remark", "comment", "comments", "description"],
  surveyor: ["surveyor", "surveyedby", "collectedby", "enumerator", "cswname", "fieldworker", "username"],
  created_at: ["createdat", "created", "capturedat", "capturedon", "surveydatetime", "timestamp", "datetime", "recordedat"],
};

/** Detects the logical field for a raw spreadsheet column name. */
export function detectField(name: string): AppField | null {
  const key = normalizeKey(name);
  if (!key) return null;
  for (const [field, aliases] of Object.entries(ALIASES)) {
    if (aliases.includes(key)) return field as AppField;
  }
  if (/^house.*id$/.test(key) || /^hh.*id$/.test(key)) return "house_id";
  if (/^member.*id$/.test(key)) return "member_id";
  if (/^member.*name$/.test(key)) return "member_name";
  if (/house.*(no|num)/.test(key) || /door.*(no|num)/.test(key)) return "house_number";
  return null;
}

function guessField(name: string, used: Set<AppField>): AppField {
  const detected = detectField(name);
  if (detected && !used.has(detected)) {
    used.add(detected);
    return detected;
  }
  return "extra";
}

function detectType(values: unknown[]): DetectedColumn["type"] {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!present.length) return "empty";
  if (present.every((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)))))
    return "number";
  if (present.every((v) => v instanceof Date)) return "date";
  return "text";
}

export async function parseSpreadsheet(file: File, sheetName?: string): Promise<SheetData> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheet]!, {
    defval: "",
    raw: false,
  });

  const names: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!names.includes(key)) names.push(key);

  const used = new Set<AppField>();
  const columns: DetectedColumn[] = names.map((name) => {
    const values = rows.slice(0, 200).map((r) => r[name]);
    return {
      name,
      type: detectType(values),
      samples: values
        .filter((v) => v !== null && v !== undefined && v !== "")
        .slice(0, 3)
        .map((v) => String(v)),
      field: guessField(name, used),
    };
  });

  return { sheetNames: wb.SheetNames, sheet, rows, columns };
}

export type LocationInfo = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  pin_type: string;
  custom_type: string | null;
  owner_name: string | null;
  notes: string | null;
  surveyor: string | null;
  external_created_at: string | null;
};

export type PreparedMember = {
  member_id: string | null;
  member_name: string | null;
  data: Record<string, unknown>;
};

export type PreparedHouse = {
  house_id: string;
  house_number: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Canonical pin type from the sheet — set even when the row has no coordinates. */
  pin_type: string | null;
  custom_type: string | null;
  data: Record<string, unknown>;
  members: PreparedMember[];
  rowCount: number;
  location: LocationInfo | null;
};


/** A map record that carries coordinates but no House ID (Empty Land, Shop, …). */
export type PreparedPlace = {
  key: string;
  house_number: string | null;
  location: LocationInfo;
  data: Record<string, unknown>;
};

export type PreparedImport = {
  houses: PreparedHouse[];
  places: PreparedPlace[];
  totalRows: number;
  missingHouseId: number;
  missingHouseNumber: number;
  duplicateHouseIds: number;
  totalMembers: number;
  rowsWithCoords: number;
  rowsWithoutCoords: number;
  invalidCoords: number;
  typeCounts: Record<string, number>;
  conflicts: string[];
};

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function num(value: unknown): number | null {
  const s = str(value);
  if (s === null) return null;
  const n = Number(s.replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function validLatitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && Math.abs(value) <= 90;
}

export function validLongitude(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && Math.abs(value) <= 180;
}

/** Both coordinates present, in range, and not the null island. */
export function validCoords(lat: number | null, lng: number | null): boolean {
  if (!validLatitude(lat) || !validLongitude(lng)) return false;
  return !(lat === 0 && lng === 0);
}

function toIso(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Deterministic identity for a map record without a House ID. */
export function placeKey(type: string, lat: number, lng: number): string {
  return `${type}@${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Collapses rows into ONE house per House ID with many members, plus map-only places. */
export function prepareImport(rows: Record<string, unknown>[], columns: DetectedColumn[]): PreparedImport {
  const by = (field: AppField) => columns.filter((c) => c.field === field).map((c) => c.name);
  const houseIdCol = by("house_id")[0];
  const houseNumberCol = by("house_number")[0];
  const memberIdCol = by("member_id")[0];
  const memberNameCol = by("member_name")[0];
  const statusCol = by("status")[0];
  const latCol = by("latitude")[0];
  const lngCol = by("longitude")[0];
  const accCol = by("accuracy")[0];
  const typeCol = by("type")[0];
  const ownerCol = by("owner_name")[0];
  const notesCol = by("notes")[0];
  const surveyorCol = by("surveyor")[0];
  const createdCol = by("created_at")[0];
  const extraCols = by("extra");

  const map = new Map<string, PreparedHouse>();
  const places = new Map<string, PreparedPlace>();
  let missingHouseId = 0;
  let missingHouseNumber = 0;
  let duplicateHouseIds = 0;
  let totalMembers = 0;
  let rowsWithCoords = 0;
  let rowsWithoutCoords = 0;
  let invalidCoords = 0;
  const typeCounts: Record<string, number> = {};
  const conflicts: string[] = [];

  for (const row of rows) {
    const houseId = houseIdCol ? str(row[houseIdCol]) : null;
    const houseNumber = houseNumberCol ? str(row[houseNumberCol]) : null;

    const lat = latCol ? num(row[latCol]) : null;
    const lng = lngCol ? num(row[lngCol]) : null;
    const hasAnyCoord = lat !== null || lng !== null;
    const coordsOk = validCoords(lat, lng);
    if (coordsOk) rowsWithCoords += 1;
    else {
      rowsWithoutCoords += 1;
      if (hasAnyCoord) invalidCoords += 1;
    }

    // The PID/Pin Type is read whether or not the row carries coordinates, so a
    // "House ID + PID Type" file still contributes the type to the same record.
    const rawType = typeCol ? str(row[typeCol]) : null;
    const { pin_type, custom_type } = normalizePinType(rawType);
    const typed = rawType ? { pin_type, custom_type } : null;
    if (coordsOk) typeCounts[pin_type] = (typeCounts[pin_type] ?? 0) + 1;


    const location: LocationInfo | null = coordsOk
      ? {
          latitude: lat as number,
          longitude: lng as number,
          accuracy: accCol ? num(row[accCol]) : null,
          pin_type,
          custom_type,
          owner_name: ownerCol ? str(row[ownerCol]) : null,
          notes: notesCol ? str(row[notesCol]) : null,
          surveyor: surveyorCol ? str(row[surveyorCol]) : null,
          external_created_at: createdCol ? toIso(row[createdCol]) : null,
        }
      : null;

    const extra: Record<string, unknown> = {};
    for (const col of extraCols) {
      const v = str(row[col]);
      if (v !== null) extra[canonicalExtraKey(col)] = v;
    }

    const memberId = memberIdCol ? str(row[memberIdCol]) : null;
    const memberName = memberNameCol ? str(row[memberNameCol]) : null;
    const rowHasMember = Boolean(memberId || memberName);

    // ---- rows without a House ID are still valid map records ----
    if (!houseId) {
      missingHouseId += 1;
      if (location) {
        const key = placeKey(location.pin_type, location.latitude, location.longitude);
        const existing = places.get(key);
        if (existing) {
          existing.data = { ...existing.data, ...extra };
        } else {
          places.set(key, { key, house_number: houseNumber, location, data: extra });
        }
      }
      continue;
    }

    const key = houseId.toUpperCase();
    if (!houseNumber) missingHouseNumber += 1;

    let house = map.get(key);
    if (!house) {
      house = {
        house_id: houseId,
        house_number: houseNumber,
        status: statusCol ? str(row[statusCol]) : null,
        latitude: coordsOk ? (lat as number) : null,
        longitude: coordsOk ? (lng as number) : null,
        pin_type: typed?.pin_type ?? null,
        custom_type: typed?.custom_type ?? null,
        data: {},
        members: [],
        rowCount: 0,
        location,
      };
      map.set(key, house);
    } else {
      duplicateHouseIds += 1;
      if (houseNumber && house.house_number && houseNumber !== house.house_number) {
        conflicts.push(`${houseId}: house number "${house.house_number}" vs "${houseNumber}"`);
      }
      if (!house.house_number && houseNumber) house.house_number = houseNumber;
      if (!house.status && statusCol) house.status = str(row[statusCol]);
      if (house.latitude === null && coordsOk) {
        house.latitude = lat as number;
        house.longitude = lng as number;
      }
      if (!house.location && location) house.location = location;
      // A more specific type from a later row wins over a plain "house".
      if (typed && (house.pin_type === null || (house.pin_type === "house" && typed.pin_type !== "house"))) {
        house.pin_type = typed.pin_type;
        house.custom_type = typed.custom_type;
      }
    }
    house.rowCount += 1;

    if (typed && !house.data['type']) house.data['type'] = typed.custom_type ?? typed.pin_type;

    // House-level descriptive fields coming from the location columns.
    if (location) {
      if (location.owner_name && !house.data['owner_name']) house.data['owner_name'] = location.owner_name;
      if (location.notes && !house.data['notes']) house.data['notes'] = location.notes;
      if (location.surveyor && !house.data['surveyor']) house.data['surveyor'] = location.surveyor;
      if (location.external_created_at && !house.data['captured_at'])
        house.data['captured_at'] = location.external_created_at;
    }


    // Row extras belong to the member on that row; only member-less rows
    // contribute house-level extras. This keeps survey values per member.
    if (rowHasMember) {
      const exists = house.members.find(
        (m) =>
          (memberId && m.member_id && m.member_id.toUpperCase() === memberId.toUpperCase()) ||
          (!memberId && !m.member_id && m.member_name === memberName),
      );
      if (exists) {
        exists.data = { ...exists.data, ...extra };
        if (!exists.member_name && memberName) exists.member_name = memberName;
      } else {
        house.members.push({ member_id: memberId, member_name: memberName, data: extra });
        totalMembers += 1;
      }
    } else {
      house.data = { ...house.data, ...extra };
    }
  }

  return {
    houses: [...map.values()],
    places: [...places.values()],
    totalRows: rows.length,
    missingHouseId,
    missingHouseNumber,
    duplicateHouseIds,
    totalMembers,
    rowsWithCoords,
    rowsWithoutCoords,
    invalidCoords,
    typeCounts,
    conflicts: conflicts.slice(0, 50),
  };
}
