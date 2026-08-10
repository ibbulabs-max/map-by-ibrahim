import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSpreadsheet, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { useApplyImport } from "@/hooks/useImportData";
import { useHouses } from "@/hooks/useHouses";
import {
  APP_FIELDS,
  parseSpreadsheet,
  type AppField,
  type DetectedColumn,
  type SheetData,
} from "@/lib/excel-import";
import { mergeFiles, type FileInput } from "@/lib/import-merge";
import { teamPeople } from "@/lib/team.functions";
import { fieldLabel } from "@/lib/houses";

type LoadedFile = {
  id: string;
  file: File;
  sheet: SheetData;
  columns: DetectedColumn[];
  assignedTo: string | null;
};

type Person = { id: string; name: string; kind: "supervisor" | "csw" | "self" };

export function ExcelImportPanel() {
  const { session, profile, role, isAdmin, isSupervisor, supervisorId } = useAuth();
  const { data: houses = [] } = useHouses();
  const apply = useApplyImport();
  const fetchPeople = useServerFn(teamPeople);

  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [parsing, setParsing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [perFile, setPerFile] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const canAssignOthers = isAdmin || isSupervisor;

  const { data: team } = useQuery({
    queryKey: ["team-people"],
    queryFn: () => fetchPeople(),
    enabled: canAssignOthers,
  });

  const people = useMemo<Person[]>(() => {
    const self: Person = {
      id: session?.user.id ?? "",
      name: `${profile?.full_name || profile?.username || "Me"} (me)`,
      kind: "self",
    };
    if (!canAssignOthers) return [self];
    const list: Person[] = [self];
    for (const s of team?.supervisors ?? []) list.push({ id: s.id, name: s.name, kind: "supervisor" });
    for (const p of team?.people ?? []) list.push({ id: p.id, name: p.name, kind: "csw" });
    return list.filter((p, i, arr) => p.id && arr.findIndex((x) => x.id === p.id) === i);
  }, [team, session?.user.id, profile, canAssignOthers]);

  useEffect(() => {
    if (!owner && session?.user.id) setOwner(session.user.id);
  }, [owner, session?.user.id]);

  async function addFiles(list: FileList) {
    setParsing(true);
    try {
      for (const file of Array.from(list)) {
        const sheet = await parseSpreadsheet(file);
        setFiles((prev) => [
          ...prev,
          {
            id: `${file.name}-${file.size}-${prev.length}`,
            file,
            sheet,
            columns: sheet.columns,
            assignedTo: null,
          },
        ]);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  }

  function setField(fileId: string, column: string, field: AppField) {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === fileId
          ? { ...f, columns: f.columns.map((c) => (c.name === column ? { ...c, field } : c)) }
          : f,
      ),
    );
  }

  const inputs = useMemo<FileInput[]>(
    () =>
      files.map((f) => ({
        name: f.file.name,
        rows: f.sheet.rows,
        columns: f.columns,
        assignedTo: perFile ? f.assignedTo : owner,
      })),
    [files, perFile, owner],
  );

  const merged = useMemo(() => (inputs.length ? mergeFiles(inputs) : null), [inputs]);

  const existingIds = useMemo(
    () => new Set(houses.map((h) => h.house_id.toUpperCase())),
    [houses],
  );

  const knownFields = useMemo(() => {
    const set = new Set<string>();
    for (const h of houses) {
      for (const k of Object.keys(h.data ?? {})) set.add(k);
      for (const m of h.house_members ?? []) for (const k of Object.keys(m.data ?? {})) set.add(k);
    }
    return set;
  }, [houses]);

  const existingPinKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const p of pins) {
      if (p.import_key) keys.add(p.import_key);
      if (p.house_id) keys.add(`house:${p.house_id.trim().toUpperCase()}`);
    }
    return keys;
  }, [pins]);

  const stats = useMemo(() => {
    if (!merged) return null;
    let existing = 0;
    for (const h of merged.houses) if (existingIds.has(h.house_id.toUpperCase())) existing += 1;

    const housesWithCoords = merged.houses.filter((h) => h.location !== null);
    let locationUpdates = 0;
    let locationConflicts = 0;
    let existingMapRecords = 0;
    let newMapRecords = 0;

    for (const h of housesWithCoords) {
      const current = houseByKey.get(h.house_id.toUpperCase());
      if (current && current.latitude !== null && current.longitude !== null) {
        if (
          Math.abs(current.latitude - h.location!.latitude) > 0.000015 ||
          Math.abs(current.longitude - h.location!.longitude) > 0.000015
        )
          locationConflicts += 1;
      } else {
        locationUpdates += 1;
      }
      if (existingPinKeys.has(`house:${h.house_id.toUpperCase()}`)) existingMapRecords += 1;
      else newMapRecords += 1;
    }
    for (const p of merged.places) {
      if (existingPinKeys.has(`place:${p.key}`)) existingMapRecords += 1;
      else newMapRecords += 1;
    }

    return {
      files: files.length,
      rows: merged.totalRows,
      uniqueHouses: merged.houses.length,
      existing,
      newHouses: merged.houses.length - existing,
      members: merged.totalMembers,
      mergedRecords: merged.mergedRecords,
      duplicates: merged.duplicateRows,
      conflicts: merged.conflicts.length,
      missingHouseId: merged.missingHouseId,
      unmapped: merged.houses.filter((h) => h.location === null).length,
      newFields: merged.fields.filter((f) => !knownFields.has(f)),
      possibleDuplicateMembers: merged.possibleDuplicateMembers,
      withCoords: merged.rowsWithCoords,
      withoutCoords: merged.rowsWithoutCoords,
      invalidCoords: merged.invalidCoords,
      housesWithCoords: housesWithCoords.length,
      genericPins: merged.places.length,
      newMapRecords,
      existingMapRecords,
      locationUpdates,
      locationConflicts,
      typeCounts: merged.typeCounts,
    };
  }, [merged, existingIds, files.length, knownFields, houseByKey, existingPinKeys]);


  const missingHouseId = files.filter((f) => !f.columns.some((c) => c.field === "house_id"));
  const ownerName = people.find((p) => p.id === owner)?.name ?? "—";

  function runImport() {
    if (!merged) return;
    apply.mutate(
      {
        merged,
        fileNames: files.map((f) => f.file.name),
        assignedTo: owner,
        assignedToName: ownerName,
        supervisorId: isSupervisor ? (session?.user.id ?? null) : supervisorId,
        onProgress: (done, total) => setProgress({ done, total }),
      },
      {
        onSuccess: (r) => {
          setProgress(null);
          setFiles([]);
          toast.success(
            `Imported — ${r.housesAdded} new houses, ${r.housesUpdated} updated, ${r.membersAdded} members added, ${r.conflicts} conflicts`,
          );
        },
        onError: (e) => {
          setProgress(null);
          toast.error(e.message);
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <label className="press flex cursor-pointer items-center gap-3 rounded-3xl border border-dashed border-border bg-card/70 px-4 py-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-gradient text-primary-foreground">
          {parsing ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">Upload Excel files</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            One or many .xlsx, .xls or .csv files — they all merge into one dataset
          </span>
        </span>
        <input
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.map((f) => (
        <div key={f.id} className="rounded-3xl border border-border bg-card/70 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold">{f.file.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {(f.file.size / 1024).toFixed(0)} KB · {f.sheet.rows.length} rows ·{" "}
                {f.columns.length} columns
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFiles((prev) => prev.filter((x) => x.id !== f.id))}
              className="press grid size-8 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive"
              aria-label={`Remove ${f.file.name}`}
            >
              <X className="size-4" />
            </button>
          </div>

          {f.sheet.sheetNames.length > 1 ? (
            <select
              value={f.sheet.sheet}
              onChange={async (e) => {
                const sheet = await parseSpreadsheet(f.file, e.target.value);
                setFiles((prev) =>
                  prev.map((x) => (x.id === f.id ? { ...x, sheet, columns: sheet.columns } : x)),
                );
              }}
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-[12px] font-medium outline-none"
            >
              {f.sheet.sheetNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : null}

          {perFile ? (
            <select
              value={f.assignedTo ?? ""}
              onChange={(e) =>
                setFiles((prev) =>
                  prev.map((x) => (x.id === f.id ? { ...x, assignedTo: e.target.value || null } : x)),
                )
              }
              className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-[12px] font-medium outline-none"
            >
              <option value="">Assign to…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : null}

          <button
            type="button"
            onClick={() => setExpanded((v) => (v === f.id ? null : f.id))}
            className="press mt-2 w-full rounded-xl bg-background/70 py-2 text-[12px] font-semibold"
          >
            {expanded === f.id ? "Hide column mapping" : "Review column mapping"}
          </button>

          {expanded === f.id ? (
            <div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">
              {f.columns.map((col) => (
                <div key={col.name} className="rounded-2xl bg-background/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">{col.name}</p>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      {col.type}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {col.samples.length ? col.samples.join(" · ") : "No sample values"}
                  </p>
                  <select
                    value={col.field}
                    onChange={(e) => setField(f.id, col.name, e.target.value as AppField)}
                    className="mt-1.5 w-full rounded-xl border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium outline-none"
                  >
                    {APP_FIELDS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ))}

      {files.length ? (
        <div className="rounded-3xl border border-border bg-card/70 p-3.5">
          <h3 className="text-[14px] font-semibold">Whose data is this?</h3>
          {canAssignOthers ? (
            <>
              <select
                value={owner ?? ""}
                onChange={(e) => setOwner(e.target.value || null)}
                className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[13px] font-medium outline-none"
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.kind === "supervisor" ? " — Supervisor" : p.kind === "csw" ? " — CSW" : ""}
                  </option>
                ))}
              </select>
              {files.length > 1 ? (
                <label className="mt-2 flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={perFile}
                    onChange={(e) => setPerFile(e.target.checked)}
                  />
                  Assign each file separately
                </label>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Assigned to <span className="font-semibold text-foreground">{ownerName}</span> — imported
              houses appear under your assigned houses.
            </p>
          )}
          <p className="mt-2 text-[12px] text-muted-foreground">
            Uploaded by{" "}
            <span className="font-semibold text-foreground">
              {profile?.full_name || profile?.username || "You"}
            </span>
            {role ? ` · ${role.replace("_", " ")}` : ""}
          </p>
        </div>
      ) : null}

      {stats ? (
        <div className="rounded-3xl border border-border bg-card/70 p-3.5">
          <h3 className="text-[14px] font-semibold">Import summary</h3>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            {[
              ["Files", stats.files],
              ["Rows", stats.rows],
              ["Unique houses", stats.uniqueHouses],
              ["New houses", stats.newHouses],
              ["Existing", stats.existing],
              ["Members", stats.members],
              ["Merged records", stats.mergedRecords],
              ["Duplicate rows", stats.duplicates],
              ["Conflicts", stats.conflicts],
              ["Missing house ID", stats.missingHouseId],
              ["Unmapped", stats.unmapped],
              ["New fields", stats.newFields.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-background/70 px-2 py-2">
                <p className="text-[15px] font-semibold tabular-nums">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {stats.newFields.length ? (
            <p className="mt-2 rounded-2xl bg-primary/10 px-3 py-2 text-[11px] text-primary">
              New fields detected: {stats.newFields.map(fieldLabel).join(", ")}
            </p>
          ) : null}

          {stats.possibleDuplicateMembers ? (
            <p className="mt-2 rounded-2xl bg-amber-500/15 px-3 py-2 text-[11px] text-amber-700">
              {stats.possibleDuplicateMembers} possible duplicate members flagged for review.
            </p>
          ) : null}

          {merged?.conflicts.length ? (
            <div className="mt-2 rounded-2xl bg-destructive/10 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-destructive">
                {merged.conflicts.length} data conflicts — existing values are kept until reviewed
              </p>
              <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-[11px] text-destructive/90">
                {merged.conflicts.slice(0, 40).map((c, i) => (
                  <li key={`${c.house_id}-${c.field}-${i}`}>
                    {c.house_id} · {fieldLabel(c.field)}: “{c.existing_value}” vs “{c.new_value}”
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFiles([])}
              className="press flex items-center justify-center gap-1.5 rounded-2xl bg-background/70 py-3 text-[13px] font-semibold"
            >
              <Trash2 className="size-4" />
              Cancel
            </button>
            <button
              type="button"
              disabled={apply.isPending || missingHouseId.length > 0 || stats.uniqueHouses === 0}
              onClick={runImport}
              className="press flex items-center justify-center gap-2 rounded-2xl bg-primary-gradient py-3 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
            >
              {apply.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {apply.isPending && progress ? `Importing ${progress.done}/${progress.total}…` : "Import data"}
            </button>
          </div>

          {missingHouseId.length ? (
            <p className="mt-1.5 text-center text-[11px] text-destructive">
              Map a House ID column in: {missingHouseId.map((f) => f.file.name).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
