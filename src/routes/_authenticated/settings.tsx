import { createFileRoute, Link } from "@tanstack/react-router";
import Papa from "papaparse";
import { Database, Download, Info, LocateFixed, LogOut, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { GlassCard, ScreenShell } from "@/components/glass";
import { useAuth } from "@/hooks/useAuth";
import { useGeolocation } from "@/hooks/useGeolocation";
import { usePins } from "@/hooks/usePins";
import { pinTypeLabel } from "@/lib/pin-types";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Smart Survey Map" },
      { name: "description", content: "Export survey data, check GPS accuracy and manage your session." },
      { property: "og:title", content: "Settings — Smart Survey Map" },
      { property: "og:description", content: "Export survey data and manage your session." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const { signOut } = useAuth();
  const { position, error } = useGeolocation();
  const { data: pins = [], refetch, isFetching } = usePins();
  const [exporting, setExporting] = useState(false);

  function exportCsv() {
    setExporting(true);
    try {
      const csv = Papa.unparse(
        pins.map((pin) => ({
          house_id: pin.house_id ?? "",
          house_number: pin.house_number ?? "",
          owner_name: pin.owner_name ?? "",
          type: pinTypeLabel(pin.pin_type, pin.custom_type),
          latitude: pin.latitude,
          longitude: pin.longitude,
          accuracy_m: pin.accuracy ?? "",
          notes: pin.notes ?? "",
          surveyor: pin.username,
          created_at: pin.created_at,
        })),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `survey-records-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${pins.length} records`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <ScreenShell title="Settings" subtitle="Data, location and session">
        <GlassCard className="divide-y divide-border">
          <Row
            icon={<LocateFixed className="size-[18px]" />}
            title="GPS accuracy"
            value={error ? "Unavailable" : position ? `±${Math.round(position.accuracy)} m` : "Locating…"}
          />
          <Row icon={<Info className="size-[18px]" />} title="Records stored" value={String(pins.length)} />
          <Row icon={<Info className="size-[18px]" />} title="App version" value="1.0.0" />
        </GlassCard>

        <div className="mt-4 space-y-2.5">
          <Link
            to="/data-management"
            className="press glass flex w-full items-center gap-3 rounded-3xl px-4 py-3.5 text-left"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Database className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">Data Management</span>
              <span className="block truncate text-[12px] text-muted-foreground">
                Excel import, import history, data assignment and conflicts
              </span>
            </span>
          </Link>
          <ActionRow
            icon={<Download className="size-[18px]" />}
            label={exporting ? "Exporting…" : "Export records as CSV"}
            onClick={exportCsv}
          />
          <ActionRow
            icon={<RefreshCw className={isFetching ? "size-[18px] animate-spin" : "size-[18px]"} />}
            label="Sync records now"
            onClick={() => {
              void refetch();
              toast.success("Syncing latest records");
            }}
          />
          <ActionRow
            icon={<Trash2 className="size-[18px]" />}
            label="Clear local cache"
            onClick={() => {
              localStorage.removeItem("ssm.device");
              toast.success("Local cache cleared");
            }}
          />
          <ActionRow
            icon={<LogOut className="size-[18px]" />}
            label="Sign out"
            destructive
            onClick={() => void signOut()}
          />
        </div>
      </ScreenShell>
      <BottomNav />
    </>
  );
}

function Row({ icon, title, value }: { icon: React.ReactNode; title: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">{icon}</span>
      <span className="flex-1 text-[15px] font-medium">{title}</span>
      <span className="text-[13px] text-muted-foreground">{value}</span>
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press glass flex w-full items-center gap-3 rounded-3xl px-4 py-3.5 text-left"
    >
      <span
        className={
          destructive
            ? "grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
            : "grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"
        }
      >
        {icon}
      </span>
      <span className={destructive ? "text-[15px] font-semibold text-destructive" : "text-[15px] font-medium"}>
        {label}
      </span>
    </button>
  );
}
