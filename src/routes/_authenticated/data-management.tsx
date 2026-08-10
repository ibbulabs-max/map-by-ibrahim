import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { BottomNav } from "@/components/BottomNav";
import { ScreenShell } from "@/components/glass";
import { DataAssignmentPanel } from "@/components/data/DataAssignmentPanel";
import { ExcelImportPanel } from "@/components/data/ExcelImportPanel";
import { ImportConflictsPanel } from "@/components/data/ImportConflictsPanel";
import { ImportHistoryPanel } from "@/components/data/ImportHistoryPanel";

export const Route = createFileRoute("/_authenticated/data-management")({
  head: () => ({
    meta: [
      { title: "Data Management — Smart Survey Map" },
      {
        name: "description",
        content: "Import and merge Excel survey files, assign ownership and resolve data conflicts.",
      },
      { property: "og:title", content: "Data Management — Smart Survey Map" },
      {
        property: "og:description",
        content: "Excel import, import history, data assignment and conflict review.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataManagementScreen,
});

type Tab = "import" | "history" | "assignment" | "conflicts";

const TABS: [Tab, string][] = [
  ["import", "Excel Import"],
  ["history", "History"],
  ["assignment", "Assignment"],
  ["conflicts", "Conflicts"],
];

function DataManagementScreen() {
  const [tab, setTab] = useState<Tab>("import");

  return (
    <>
      <ScreenShell title="Data Management" subtitle="Excel import, ownership and conflicts">
        <div className="grid grid-cols-4 gap-1.5">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`press rounded-2xl px-1.5 py-2.5 text-[11px] font-semibold ${
                tab === value ? "bg-primary-gradient text-primary-foreground" : "glass"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 pb-4">
          {tab === "import" ? <ExcelImportPanel /> : null}
          {tab === "history" ? <ImportHistoryPanel /> : null}
          {tab === "assignment" ? <DataAssignmentPanel /> : null}
          {tab === "conflicts" ? <ImportConflictsPanel /> : null}
        </div>
      </ScreenShell>
      <BottomNav />
    </>
  );
}
