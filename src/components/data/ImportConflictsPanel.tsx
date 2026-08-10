import { useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/glass";
import { useImportConflicts, useResolveConflict, type Resolution } from "@/hooks/useImportData";
import { CONFLICT_STATUS_LABEL } from "@/lib/imports";
import { fieldLabel } from "@/lib/houses";

export function ImportConflictsPanel() {
  const { data: conflicts = [], isLoading } = useImportConflicts();
  const resolve = useResolveConflict();
  const [showResolved, setShowResolved] = useState(false);

  const rows = useMemo(
    () =>
      conflicts.filter((c) =>
        showResolved ? true : c.status === "pending" || c.status === "review_later",
      ),
    [conflicts, showResolved],
  );

  if (isLoading) return <p className="py-8 text-center text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
        Show resolved conflicts
      </label>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ShieldAlert className="size-7" />}
          title="No conflicts to review"
          description="Conflicting values between imported files will appear here for a decision."
        />
      ) : (
        rows.map((c) => (
          <div key={c.id} className="rounded-3xl border border-border bg-card/70 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">
                  {c.house_id} · {fieldLabel(c.field)}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {c.entity === "assignment" ? "Assignment conflict" : c.entity === "member" ? `Member ${c.member_ref ?? ""}` : "House field"}
                  {c.source_file ? ` · ${c.source_file}` : ""} ·{" "}
                  {new Date(c.created_at).toLocaleDateString()}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-[10px] font-semibold text-amber-600">
                {CONFLICT_STATUS_LABEL[c.status] ?? c.status}
              </span>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-background/70 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">Existing value</p>
                <p className="break-words text-[13px] font-medium">{c.existing_value || "—"}</p>
              </div>
              <div className="rounded-2xl bg-background/70 px-3 py-2">
                <p className="text-[10px] text-muted-foreground">New value</p>
                <p className="break-words text-[13px] font-medium">{c.new_value || "—"}</p>
              </div>
            </div>

            {c.status === "pending" || c.status === "review_later" ? (
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["kept_existing", "Keep existing"],
                    ["used_new", "Use new"],
                    ["review_later", "Review later"],
                  ] as [Resolution, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    disabled={resolve.isPending}
                    onClick={() =>
                      resolve.mutate(
                        { conflict: c, resolution: value },
                        {
                          onSuccess: () => toast.success(label),
                          onError: (e) => toast.error(e.message),
                        },
                      )
                    }
                    className={`press rounded-xl py-2.5 text-[11px] font-semibold disabled:opacity-60 ${
                      value === "used_new"
                        ? "bg-primary-gradient text-primary-foreground"
                        : "bg-background/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}
