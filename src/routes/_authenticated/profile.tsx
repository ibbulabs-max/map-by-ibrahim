import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, LogOut, MapPin, ShieldCheck, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { GlassCard, ScreenShell } from "@/components/glass";
import { PinInput } from "@/components/PinInput";
import { useAuth } from "@/hooks/useAuth";
import { usePins } from "@/hooks/usePins";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Smart Survey Map" },
      { name: "description", content: "Your surveyor profile, activity summary and PIN security." },
      { property: "og:title", content: "Profile — Smart Survey Map" },
      { property: "og:description", content: "Your surveyor profile and PIN security." },
    ],
  }),
  component: ProfileScreen,
});

function ProfileScreen() {
  const { profile, session, role, isAdmin, signOut } = useAuth();
  const { data: pins = [] } = usePins();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const mine = useMemo(
    () => pins.filter((p) => p.user_id === session?.user.id),
    [pins, session?.user.id],
  );
  const today = mine.filter(
    (p) => new Date(p.created_at).toDateString() === new Date().toDateString(),
  ).length;

  async function changePin() {
    if (pin.length !== 6 || confirm.length !== 6) {
      toast.error("Enter your new 6-digit PIN twice");
      return;
    }
    if (pin !== confirm) {
      toast.error("PINs do not match");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: pin });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setPin("");
    setConfirm("");
    toast.success("PIN updated");
  }

  return (
    <>
      <ScreenShell title="Profile" subtitle={profile?.username ? `@${profile.username}` : ""}>
        <GlassCard className="flex items-center gap-4 px-5 py-5">
          <span className="grid size-16 place-items-center rounded-3xl bg-primary-gradient text-primary-foreground shadow-[var(--shadow-float)]">
            <UserRound className="size-7" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold">{profile?.full_name || profile?.username}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              {isAdmin ? "Administrator" : "Survey user"} · {role === "admin" ? "full access" : "field access"}
            </p>
            {profile?.phone ? (
              <p className="text-[13px] text-muted-foreground">{profile.phone}</p>
            ) : null}
          </div>
        </GlassCard>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <Stat label="My pins" value={mine.length} />
          <Stat label="Today" value={today} />
        </div>

        <GlassCard className="mt-4 px-5 py-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            <KeyRound className="size-4 text-primary" />
            Change PIN
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">Choose a new 6-digit PIN.</p>
          <div className="mt-4 space-y-4">
            <PinInput value={pin} onChange={setPin} />
            <PinInput value={confirm} onChange={setConfirm} />
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => void changePin()}
            className="press mt-4 w-full rounded-2xl bg-primary-gradient py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
          >
            {saving ? "Updating…" : "Update PIN"}
          </button>
        </GlassCard>

        <button
          type="button"
          onClick={() => void signOut()}
          className="press glass mt-3 flex w-full items-center justify-center gap-2 rounded-3xl py-3.5 text-sm font-semibold text-destructive"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </ScreenShell>
      <BottomNav />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <GlassCard className="px-4 py-4">
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <MapPin className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </GlassCard>
  );
}
