import { useMemo, useState } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useHouses, useImportHouses, type ImportMode } from "@/hooks/useHouses";
import {
  APP_FIELDS,
  parseSpreadsheet,
  prepareImport,
  type AppField,
  type DetectedColumn,
  type SheetData,
} from "@/lib/excel-import";

export function ImportPanel() {
  const { data: houses = [] } = useHouses();
  const importHouses = useImportHouses();
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [columns, setColumns] = useState<DetectedColumn[]>([]);
  const [mode, setMode] = useState<ImportMode>("skip");
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const existingIds = useMemo(
    () => new Set(houses.map((h) => h.house_id.toUpperCase())),
    [houses],
  );

  const prepared = useMemo(
    () => (sheet ? prepareImport(sheet.rows, columns) : null),
    [sheet, columns],
  );

  const stats = useMemo(() => {
    if (!prepared) return null;
    let existing = 0;
    let unmapped = 0;
    for (const h of prepared.houses) {
      if (existingIds.has(h.house_id.toUpperCase())) existing += 1;
      if (h.latitude === null || h.longitude === null) unmapped += 1;
    }
    return {
      totalRows: prepared.totalRows,
      uniqueHouses: prepared.houses.length,
      members: prepared.totalMembers,
      duplicates: prepared.duplicateHouseIds,
      missingHouseId: prepared.missingHouseId,
      missingHouseNumber: prepared.missingHouseNumber,
      existing,
      newHouses: prepared.houses.length - existing,
      unmapped,
      conflicts: prepared.conflicts.length,
    };
  }, [prepared, existingIds]);

  async function handleFile(next: File, sheetName?: string) {
    setParsing(true);
    try {
      const data = await parseSpreadsheet(next, sheetName);
      setFile(next);
      setSheet(data);
      setColumns(data.columns);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  }

  function setField(name: string, field: AppField) {
    setColumns((prev) => prev.map((c) => (c.name === name ? { ...c, field } : c)));
  }

  function runImport() {
    if (!prepared) return;
    importHouses.mutate(
      {
        houses: prepared.houses,
        mode,
        onProgress: (done, total) => setProgress({ done, total }),
      },
      {
        onSuccess: (r) => {
          setProgress(null);
          toast.success(
            `Imported — ${r.created} new, ${r.updated} updated, ${r.skipped} skipped, ${r.members} members`,
          );
        },
        onError: (e) => {
          setProgress(null);
          toast.error(e.message);
        },
      },
    );
  }

  const hasHouseId = columns.some((c) => c.field === "house_id");

  return (
    <div className="space-y-3">
      <label className="press flex cursor-pointer items-center gap-3 rounded-3xl border border-dashed border-border bg-card/70 px-4 py-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary-gradient text-primary-foreground">
          {parsing ? <Loader2 className="size-5 animate-spin" /> : <FileSpreadsheet className="size-5" />}
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">Import Excel</span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {file ? file.name : "Choose an .xlsx, .xls or .csv file"}
          </span>
        </span>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>

      {sheet && sheet.sheetNames.length > 1 ? (
        <select
          value={sheet.sheet}
          onChange={(e) => file && void handleFile(file, e.target.value)}
          className="w-full rounded-2xl border border-border bg-card/70 px-3.5 py-2.5 text-[13px] font-medium outline-none"
        >
          {sheet.sheetNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      ) : null}

      {sheet ? (
        <div className="rounded-3xl border border-border bg-card/70 p-3.5">
          <h3 className="text-[14px] font-semibold">Detected columns</h3>
          <p className="mb-2 text-[11px] text-muted-foreground">
            Check the mapping before importing — unmapped columns are kept as extra fields.
          </p>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {columns.map((col) => (
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
                  onChange={(e) => setField(col.name, e.target.value as AppField)}
                  className="mt-1.5 w-full rounded-xl border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium outline-none"
                >
                  {APP_FIELDS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {stats ? (
        <div className="rounded-3xl border border-border bg-card/70 p-3.5">
          <h3 className="text-[14px] font-semibold">Import preview</h3>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            {[
              ["Rows", stats.totalRows],
              ["Unique houses", stats.uniqueHouses],
              ["Members", stats.members],
              ["New houses", stats.newHouses],
              ["Existing", stats.existing],
              ["Unmapped", stats.unmapped],
              ["Duplicate rows", stats.duplicates],
              ["Missing house ID", stats.missingHouseId],
              ["Missing house no.", stats.missingHouseNumber],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-background/70 px-2 py-2">
                <p className="text-[15px] font-semibold tabular-nums">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {prepared?.conflicts.length ? (
            <div className="mt-2.5 rounded-2xl bg-destructive/10 px-3 py-2.5">
              <p className="text-[12px] font-semibold text-destructive">
                {prepared.conflicts.length} potential conflicts
              </p>
              <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto text-[11px] text-destructive/90">
                {prepared.conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-2">House ID</th>
                  <th className="py-1 pr-2">House no.</th>
                  <th className="py-1 pr-2">Members</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {prepared?.houses.slice(0, 25).map((h) => {
                  const exists = existingIds.has(h.house_id.toUpperCase());
                  return (
                    <tr key={h.house_id} className="border-t border-border/60">
                      <td className="py-1.5 pr-2 font-medium">{h.house_id}</td>
                      <td className="py-1.5 pr-2">{h.house_number || "—"}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{h.members.length}</td>
                      <td className="py-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            exists
                              ? "bg-amber-500/15 text-amber-600"
                              : "bg-primary/10 text-primary"
                          }`}
                        >
                          {exists ? (mode === "update" ? "Update" : "Skip") : "New"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {prepared && prepared.houses.length > 25 ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Showing first 25 of {prepared.houses.length} houses.
              </p>
            ) : null}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["skip", "update"] as ImportMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`press rounded-xl py-2.5 text-[12px] font-semibold ${
                  mode === m ? "bg-primary-gradient text-primary-foreground" : "bg-background/70"
                }`}
              >
                {m === "skip" ? "Skip existing houses" : "Update existing houses"}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!hasHouseId || importHouses.isPending || stats.uniqueHouses === 0}
            onClick={runImport}
            className="press mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-gradient py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {importHouses.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            {importHouses.isPending && progress
              ? `Importing ${progress.done}/${progress.total}…`
              : `Confirm import of ${stats.uniqueHouses} houses`}
          </button>
          {!hasHouseId ? (
            <p className="mt-1.5 text-center text-[11px] text-destructive">
              Map one column to House ID before importing.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
