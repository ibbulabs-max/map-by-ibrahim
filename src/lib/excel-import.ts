/** Dynamic Excel/CSV parsing + mapping + preview analysis for the House importer. */

export type AppField =
  | "house_id"
  | "house_number"
  | "member_id"
  | "member_name"
  | "status"
  | "latitude"
  | "longitude"
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
  latitude: ["lat", "latitude", "ycoordinate", "ycoord"],
  longitude: ["lon", "lng", "long", "longitude", "xcoordinate", "xcoord"],
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
  data: Record<string, unknown>;
  members: PreparedMember[];
  rowCount: number;
};

export type PreparedImport = {
  houses: PreparedHouse[];
  totalRows: number;
  missingHouseId: number;
  missingHouseNumber: number;
  duplicateHouseIds: number;
  totalMembers: number;
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
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Collapses rows into ONE house per House ID with many members. */
export function prepareImport(rows: Record<string, unknown>[], columns: DetectedColumn[]): PreparedImport {
  const by = (field: AppField) => columns.filter((c) => c.field === field).map((c) => c.name);
  const houseIdCol = by("house_id")[0];
  const houseNumberCol = by("house_number")[0];
  const memberIdCol = by("member_id")[0];
  const memberNameCol = by("member_name")[0];
  const statusCol = by("status")[0];
  const latCol = by("latitude")[0];
  const lngCol = by("longitude")[0];
  const extraCols = by("extra");

  const map = new Map<string, PreparedHouse>();
  let missingHouseId = 0;
  let missingHouseNumber = 0;
  let duplicateHouseIds = 0;
  let totalMembers = 0;
  const conflicts: string[] = [];

  for (const row of rows) {
    const houseId = houseIdCol ? str(row[houseIdCol]) : null;
    if (!houseId) {
      missingHouseId += 1;
      continue;
    }
    const key = houseId.toUpperCase();
    const houseNumber = houseNumberCol ? str(row[houseNumberCol]) : null;
    if (!houseNumber) missingHouseNumber += 1;

    const extra: Record<string, unknown> = {};
    for (const col of extraCols) {
      const v = str(row[col]);
      if (v !== null) extra[canonicalExtraKey(col)] = v;
    }

    let house = map.get(key);
    if (!house) {
      house = {
        house_id: houseId,
        house_number: houseNumber,
        status: statusCol ? str(row[statusCol]) : null,
        latitude: latCol ? num(row[latCol]) : null,
        longitude: lngCol ? num(row[lngCol]) : null,
        data: extra,
        members: [],
        rowCount: 0,
      };
      map.set(key, house);
    } else {
      duplicateHouseIds += 1;
      if (houseNumber && house.house_number && houseNumber !== house.house_number) {
        conflicts.push(`${houseId}: house number "${house.house_number}" vs "${houseNumber}"`);
      }
      if (!house.house_number && houseNumber) house.house_number = houseNumber;
    }
    house.rowCount += 1;

    const memberId = memberIdCol ? str(row[memberIdCol]) : null;
    const memberName = memberNameCol ? str(row[memberNameCol]) : null;
    if (memberId || memberName) {
      const exists = house.members.some(
        (m) =>
          (memberId && m.member_id && m.member_id.toUpperCase() === memberId.toUpperCase()) ||
          (!memberId && m.member_name === memberName),
      );
      if (!exists) {
        house.members.push({ member_id: memberId, member_name: memberName, data: extra });
        totalMembers += 1;
      }
    }
  }

  return {
    houses: [...map.values()],
    totalRows: rows.length,
    missingHouseId,
    missingHouseNumber,
    duplicateHouseIds,
    totalMembers,
    conflicts: conflicts.slice(0, 50),
  };
}
