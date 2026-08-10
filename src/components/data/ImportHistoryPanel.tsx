import { useState } from "react";
import { History } from "lucide-react";

import { EmptyState } from "@/components/glass";
import { useImportBatches } from "@/hooks/useImportData";
import { fieldLabel } from "@/lib/houses";

export function ImportHistoryPanel() {
  const { data: batches = [], isLoading } = useImportBatches();
  const [open, setOpen] = useState<string | null>(null);

  if (isLoading) return <p className="py-8 text-center text-[13px] text-muted-foreground">Loading…</p>;
  if (!batches.length)
    return (
      <EmptyState
        icon={<History className="size-7" />}
        title="No imports yet"
        description="Every Excel import will be listed here with its files, owner and results."
      />
    );

  return (
    <div className="space-y-2">
      {batches.map((b) => (
        <div key={b.id} className="rounded-3xl border border-border bg-card/70 p-3.5">
          <button
            type="button"
            onClick={() => setOpen((v) => (v === b.id ? null : b.id))}
            className="flex w-full items-start justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-semibold">
                {(b.file_names ?? []).join(", ") || "Import"}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {new Date(b.created_at).toLocaleString()} · by {b.uploaded_by_name || "—"}
                {b.uploaded_role ? ` (${b.uploaded_role.replace("_", " ")})` : ""} · for{" "}
                {b.assigned_to_name || "—"}
              </span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                b.conflicts ? "bg-amber-500/15 text-amber-600" : "bg-primary/10 text-primary"
              }`}
            >
              {b.conflicts ? `${b.conflicts} conflicts` : "Clean"}
            </span>
          </button>

          {open === b.id ? (
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
              {[
                ["Rows", b.total_rows],
                ["Houses", b.unique_houses],
                ["Added", b.houses_added],
                ["Updated", b.houses_updated],
                ["Members added", b.members_added],
                ["Members merged", b.members_merged],
                ["Merged records", b.merged_records],
                ["Unmapped", b.unmapped_houses],
                ["Conflicts", b.conflicts],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-background/70 px-2 py-2">
                  <p className="text-[15px] font-semibold tabular-nums">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
              {(b.new_fields ?? []).length ? (
                <p className="col-span-3 rounded-xl bg-primary/10 px-3 py-2 text-left text-[11px] text-primary">
                  Fields: {(b.new_fields ?? []).map(fieldLabel).join(", ")}
                </p>
              ) : null}
              <p className="col-span-3 text-left text-[11px] text-muted-foreground">
                Status: {b.status.replace(/_/g, " ")}
              </p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
