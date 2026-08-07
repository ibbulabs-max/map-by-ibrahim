import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Trash2, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { GlassCard, ScreenShell } from "@/components/glass";
import { PinInput } from "@/components/PinInput";
import {
  adminStats,
  createUser,
  deleteUser,
  listUsers,
  resetUserPin,
  updateUser,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Smart Survey Map" },
      { name: "description", content: "Manage surveyors, PINs and monitor survey activity." },
      { property: "og:title", content: "Admin — Smart Survey Map" },
      { property: "og:description", content: "Manage surveyors, PINs and survey activity." },
    ],
  }),
  component: AdminScreen,
});

function AdminScreen() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const fetchStats = useServerFn(adminStats);
  const addUser = useServerFn(createUser);
  const patchUser = useServerFn(updateUser);
  const resetPin = useServerFn(resetUserPin);
  const removeUser = useServerFn(deleteUser);

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => fetchUsers({ data: undefined }) });
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => fetchStats({ data: undefined }) });

  const [creating, setCreating] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [pin, setPin] = useState("");
  const [resetting, setResetting] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
  };

  const create = useMutation({
    mutationFn: () =>
      addUser({ data: { username: username.trim().toLowerCase(), pin, fullName: fullName.trim(), role: "survey_user" } }),
    onSuccess: (res: { ok: boolean; error?: string }) => {
      if (!res.ok) return toast.error(res.error ?? "Could not create user");
      toast.success("User created");
      setCreating(false);
      setUsername("");
      setFullName("");
      setPin("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <ScreenShell
        title="Admin"
        subtitle="Users and activity"
        action={
          <button
            type="button"
            onClick={() => setCreating((v) => !v)}
            className="press grid size-11 place-items-center rounded-2xl bg-primary-gradient text-primary-foreground"
            aria-label="Add user"
          >
            <UserPlus className="size-5" />
          </button>
        }
      >
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Users" value={stats.data?.users ?? 0} />
          <Stat label="Pins" value={stats.data?.pins ?? 0} />
          <Stat label="Today" value={stats.data?.today ?? 0} />
        </div>

        {creating ? (
          <GlassCard className="mt-4 px-5 py-5">
            <p className="text-[15px] font-semibold">New surveyor</p>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="mt-3 h-12 w-full rounded-2xl border border-border bg-card/70 px-4 text-base outline-none focus:border-primary"
            />
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name (optional)"
              className="mt-2 h-12 w-full rounded-2xl border border-border bg-card/70 px-4 text-base outline-none focus:border-primary"
            />
            <div className="mt-4">
              <PinInput value={pin} onChange={setPin} />
            </div>
            <button
              type="button"
              disabled={create.isPending}
              onClick={() => create.mutate()}
              className="press mt-4 w-full rounded-2xl bg-primary-gradient py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {create.isPending ? "Creating…" : "Create user"}
            </button>
          </GlassCard>
        ) : null}

        <p className="mt-5 mb-2 flex items-center gap-2 px-1 text-[13px] font-medium text-muted-foreground">
          <Users className="size-4" />
          Surveyors
        </p>
        <div className="space-y-2.5">
          {(users.data ?? []).map((u) => (
            <GlassCard key={u.id} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{u.full_name || u.username}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    @{u.username} · {u.role === "admin" ? "Admin" : "Survey user"} ·{" "}
                    {u.is_active ? "Active" : "Disabled"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResetting(resetting === u.id ? null : u.id)}
                  className="press grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"
                  aria-label="Reset PIN"
                >
                  <KeyRound className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void patchUser({ data: { userId: u.id, isActive: !u.is_active } }).then(() => {
                      toast.success(u.is_active ? "User disabled" : "User enabled");
                      invalidate();
                    });
                  }}
                  className="press rounded-xl bg-card/70 px-3 py-2 text-[12px] font-semibold"
                >
                  {u.is_active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void removeUser({ data: { userId: u.id } }).then((res: { ok: boolean; error?: string }) => {
                      if (!res.ok) return toast.error(res.error ?? "Could not delete");
                      toast.success("User deleted");
                      invalidate();
                    });
                  }}
                  className="press grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
                  aria-label="Delete user"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              {resetting === u.id ? (
                <div className="mt-3">
                  <PinInput value={newPin} onChange={setNewPin} />
                  <button
                    type="button"
                    onClick={() => {
                      void resetPin({ data: { userId: u.id, pin: newPin } }).then(() => {
                        toast.success("PIN reset");
                        setResetting(null);
                        setNewPin("");
                      });
                    }}
                    className="press mt-3 w-full rounded-2xl bg-primary-gradient py-3 text-sm font-semibold text-primary-foreground"
                  >
                    Set new PIN
                  </button>
                </div>
              ) : null}
            </GlassCard>
          ))}
        </div>
      </ScreenShell>
      <BottomNav />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <GlassCard className="px-3 py-4 text-center">
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">{label}</p>
    </GlassCard>
  );
}
