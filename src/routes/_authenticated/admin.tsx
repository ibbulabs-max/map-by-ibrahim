import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  KeyRound,
  Link2,
  Link2Off,
  Shield,
  Trash2,
  UserCog,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BottomNav } from "@/components/BottomNav";
import { GlassCard, ScreenShell } from "@/components/glass";
import { PinInput } from "@/components/PinInput";
import { useAuth } from "@/hooks/useAuth";
import {
  adminStats,
  createUser,
  deleteUser,
  listUsers,
  resetUserPin,
  updateUser,
} from "@/lib/admin.functions";
import { assignSupervisor, listSupervisors } from "@/lib/team.functions";
import { ROLE_LABEL, type AppRole } from "@/lib/roles";

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

type CreatableRole = Extract<AppRole, "admin" | "supervisor" | "survey_user">;

const ROLE_CARDS: { role: CreatableRole; title: string; hint: string; icon: typeof Shield }[] = [
  { role: "admin", title: "Admin", hint: "Full organisation access", icon: Shield },
  { role: "supervisor", title: "Supervisor", hint: "Manages a team of survey users", icon: UserCog },
  { role: "survey_user", title: "CSW / Survey User", hint: "Collects pins in the field", icon: Users },
];

function AdminScreen() {
  const qc = useQueryClient();
  const { isSuperAdmin } = useAuth();
  const fetchUsers = useServerFn(listUsers);
  const fetchStats = useServerFn(adminStats);
  const fetchSupervisors = useServerFn(listSupervisors);
  const addUser = useServerFn(createUser);
  const patchUser = useServerFn(updateUser);
  const resetPin = useServerFn(resetUserPin);
  const removeUser = useServerFn(deleteUser);
  const linkSupervisor = useServerFn(assignSupervisor);

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => fetchUsers({ data: undefined }) });
  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => fetchStats({ data: undefined }) });
  const supervisors = useQuery({
    queryKey: ["admin", "supervisors"],
    queryFn: () => fetchSupervisors({ data: undefined }),
  });

  // ---- add-account wizard ----
  const [step, setStep] = useState<"closed" | "select" | "form">("closed");
  const [role, setRole] = useState<CreatableRole>("survey_user");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [supervisorId, setSupervisorId] = useState("");
  const [supSearch, setSupSearch] = useState("");

  const [resetting, setResetting] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["admin"] });
    void qc.invalidateQueries({ queryKey: ["team"] });
  };

  function resetForm() {
    setStep("closed");
    setUsername("");
    setFullName("");
    setPhone("");
    setEmail("");
    setPin("");
    setConfirmPin("");
    setIsActive(true);
    setSupervisorId("");
    setSupSearch("");
  }

  const create = useMutation({
    mutationFn: () =>
      addUser({
        data: {
          username: username.trim().toLowerCase(),
          pin,
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          role,
          isActive,
          supervisorId: role === "survey_user" && supervisorId ? supervisorId : null,
        },
      }),
    onSuccess: (res: { ok: boolean; error?: string }) => {
      if (!res.ok) {
        toast.error(res.error ?? "Could not create account");
        return;
      }
      toast.success(`${ROLE_LABEL[role]} created`);
      resetForm();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const supervisorOptions = useMemo(() => {
    const list = supervisors.data ?? [];
    const q = supSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.username.toLowerCase().includes(q) || (s.full_name ?? "").toLowerCase().includes(q),
    );
  }, [supervisors.data, supSearch]);

  function submit() {
    if (!/^\d{6}$/.test(pin)) {
      toast.error("PIN must be exactly 6 digits");
      return;
    }
    if (pin !== confirmPin) {
      toast.error("PIN and confirm PIN do not match");
      return;
    }
    if (username.trim().length < 3) {
      toast.error("Username must be at least 3 characters");
      return;
    }
    create.mutate();
  }

  const idLabel =
    role === "supervisor" ? "Supervisor ID" : role === "survey_user" ? "CSW ID" : "Admin ID";

  return (
    <>
      <ScreenShell
        title="Admin"
        subtitle="Accounts and activity"
        action={
          <button
            type="button"
            onClick={() => setStep((s) => (s === "closed" ? "select" : "closed"))}
            className="press grid size-11 place-items-center rounded-2xl bg-primary-gradient text-primary-foreground"
            aria-label="Add account"
          >
            <UserPlus className="size-5" />
          </button>
        }
      >
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="Users" value={stats.data?.totalUsers ?? 0} />
          <Stat label="Pins" value={stats.data?.totalPins ?? 0} />
          <Stat label="Today" value={stats.data?.todayPins ?? 0} />
        </div>

        {step === "select" ? (
          <GlassCard className="mt-4 px-5 py-5">
            <p className="text-[15px] font-semibold">Select account type</p>
            <div className="mt-3 space-y-2.5">
              {ROLE_CARDS.filter((c) => c.role !== "admin" || isSuperAdmin).map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.role}
                    type="button"
                    onClick={() => {
                      setRole(card.role);
                      setStep("form");
                    }}
                    className="press flex w-full items-center gap-3.5 rounded-3xl border border-border bg-card/70 px-4 py-5 text-left"
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary-gradient text-primary-foreground">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[16px] font-semibold">{card.title}</span>
                      <span className="block text-[12px] text-muted-foreground">{card.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </GlassCard>
        ) : null}

        {step === "form" ? (
          <GlassCard className="mt-4 px-5 py-5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("select")}
                className="press grid size-9 place-items-center rounded-xl bg-card/70"
                aria-label="Back to account type"
              >
                <ArrowLeft className="size-4" />
              </button>
              <p className="text-[15px] font-semibold">New {ROLE_LABEL[role]}</p>
            </div>

            <Field label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name"
                className={inputCls}
              />
            </Field>
            <Field label="Username">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ""))}
                placeholder="username"
                className={inputCls}
              />
            </Field>
            <Field label={idLabel}>
              <p className="flex h-12 items-center rounded-2xl border border-dashed border-border bg-card/50 px-4 text-base font-semibold tracking-wide text-muted-foreground">
                {username ? username.toUpperCase() : "—"}
              </p>
            </Field>
            <Field label="Phone">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="Phone"
                className={inputCls}
              />
            </Field>
            <Field label="Email">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                placeholder="Email"
                className={inputCls}
              />
            </Field>

            {role === "survey_user" ? (
              <Field label="Connected to supervisor">
                <input
                  value={supSearch}
                  onChange={(e) => setSupSearch(e.target.value)}
                  placeholder="Search supervisors…"
                  className={inputCls}
                />
                <select
                  value={supervisorId}
                  onChange={(e) => setSupervisorId(e.target.value)}
                  className={`${inputCls} mt-2`}
                >
                  <option value="">Not connected</option>
                  {supervisorOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {(s.full_name || s.username) + " — " + s.username.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Field label="6-digit PIN">
              <PinInput value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} />
            </Field>
            <Field label="Confirm PIN">
              <PinInput
                value={confirmPin}
                onChange={(v) => setConfirmPin(v.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>

            <label className="mt-4 flex items-center justify-between rounded-2xl border border-border bg-card/70 px-4 py-3">
              <span className="text-[14px] font-medium">Status: {isActive ? "Active" : "Disabled"}</span>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="size-5 accent-[var(--primary)]"
              />
            </label>

            <button
              type="button"
              disabled={create.isPending}
              onClick={submit}
              className="press mt-4 w-full rounded-2xl bg-primary-gradient py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-70"
            >
              {create.isPending ? "Creating…" : `Create ${ROLE_LABEL[role]}`}
            </button>
          </GlassCard>
        ) : null}

        <p className="mt-5 mb-2 flex items-center gap-2 px-1 text-[13px] font-medium text-muted-foreground">
          <Users className="size-4" />
          Accounts
        </p>
        <div className="space-y-2.5">
          {(users.data ?? []).map((u) => (
            <GlassCard key={u.id} className="px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{u.full_name || u.username}</p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    @{u.username} · {ROLE_LABEL[u.role]} · {u.is_active ? "Active" : "Disabled"}
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
                      if (!res.ok) {
                        toast.error(res.error ?? "Could not delete");
                        return;
                      }
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

              {u.role === "survey_user" ? (
                <div className="mt-3 rounded-2xl border border-border bg-card/60 px-3.5 py-3">
                  <p className="text-[11px] text-muted-foreground">Connected to supervisor</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {u.supervisor_name ?? "Not connected"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setLinking(linking === u.id ? null : u.id)}
                      className="press flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-2 text-[12px] font-semibold text-primary"
                    >
                      <Link2 className="size-3.5" />
                      {u.supervisor_id ? "Change" : "Connect"}
                    </button>
                    {u.supervisor_id ? (
                      <button
                        type="button"
                        onClick={() => {
                          void linkSupervisor({ data: { cswId: u.id, supervisorId: null } }).then(
                            () => {
                              toast.success("Supervisor removed");
                              invalidate();
                            },
                          );
                        }}
                        className="press grid size-9 place-items-center rounded-xl bg-destructive/10 text-destructive"
                        aria-label="Remove supervisor"
                      >
                        <Link2Off className="size-4" />
                      </button>
                    ) : null}
                  </div>
                  {linking === u.id ? (
                    <select
                      autoFocus
                      defaultValue={u.supervisor_id ?? ""}
                      onChange={(e) => {
                        const value = e.target.value;
                        void linkSupervisor({
                          data: { cswId: u.id, supervisorId: value || null },
                        }).then(() => {
                          toast.success(value ? "Supervisor connected" : "Supervisor removed");
                          setLinking(null);
                          invalidate();
                        });
                      }}
                      className={`${inputCls} mt-2.5`}
                    >
                      <option value="">Not connected</option>
                      {(supervisors.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {(s.full_name || s.username) + " — " + s.username.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ) : null}

              {resetting === u.id ? (
                <div className="mt-3">
                  <PinInput value={newPin} onChange={(v) => setNewPin(v.replace(/\D/g, "").slice(0, 6))} />
                  <button
                    type="button"
                    onClick={() => {
                      if (!/^\d{6}$/.test(newPin)) {
                        toast.error("PIN must be exactly 6 digits");
                        return;
                      }
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

const inputCls =
  "h-12 w-full rounded-2xl border border-border bg-card/70 px-4 text-base outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 px-1 text-[11px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
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
