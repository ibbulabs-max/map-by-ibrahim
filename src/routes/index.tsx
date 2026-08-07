import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { Eye, EyeOff, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import logo from "@/assets/logo.png";
import { PinInput } from "@/components/PinInput";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { pinLogin, seedDefaultUsers } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in — Smart Survey Map" },
      {
        name: "description",
        content:
          "Secure 6-digit PIN sign-in for Smart Survey Map, the GPS field survey and household mapping app.",
      },
      { property: "og:title", content: "Sign in — Smart Survey Map" },
      {
        property: "og:description",
        content: "Secure 6-digit PIN sign-in for the Smart Survey Map field app.",
      },
    ],
  }),
  component: LoginScreen,
});

function LoginScreen() {
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const login = useServerFn(pinLogin);
  const seed = useServerFn(seedDefaultUsers);

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ssm.username");
    if (saved) setUsername(saved);
    void seed({}).catch(() => undefined);
  }, [seed]);

  useEffect(() => {
    if (!authLoading && session) void navigate({ to: "/map" });
  }, [authLoading, session, navigate]);

  async function submit(currentPin = pin) {
    if (busy) return;
    setError(null);
    if (username.trim().length < 3) {
      setError("Enter your username");
      return;
    }
    if (!/^\d{6}$/.test(currentPin)) {
      setError("Enter your 6-digit PIN");
      return;
    }
    setBusy(true);
    try {
      const result = await login({ data: { username: username.trim(), pin: currentPin } });
      if (!result.ok) {
        setError(result.error);
        setPin("");
        setBusy(false);
        return;
      }
      await supabase.auth.setSession({
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      });
      if (remember) localStorage.setItem("ssm.username", username.trim());
      else localStorage.removeItem("ssm.username");
      toast.success("Welcome back");
      await navigate({ to: "/map" });
    } catch {
      setError("Network error. Please try again.");
      setPin("");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-sky-gradient px-5 py-10">
      <div className="pointer-events-none absolute -top-32 -left-24 size-80 rounded-full bg-primary/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-20 size-96 rounded-full bg-primary-glow/25 blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        className="glass-strong z-10 w-full max-w-sm rounded-[2rem] px-6 pt-8 pb-7"
      >
        <div className="flex flex-col items-center text-center">
          <img
            src={logo}
            alt="Smart Survey Map logo"
            width={88}
            height={88}
            className="size-[88px] drop-shadow-[0_12px_28px_oklch(0.58_0.19_259_/_35%)]"
          />
          <h1 className="mt-4 text-[26px] font-semibold tracking-tight">Smart Survey Map</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back. Sign in to continue your survey.
          </p>
        </div>

        <div className="mt-7 space-y-5">
          <div className="space-y-2">
            <label htmlFor="username" className="text-[13px] font-medium text-muted-foreground">
              Username
            </label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="e.g. chw1"
              disabled={busy}
              className="h-13 w-full rounded-2xl border border-border bg-card/70 px-4 py-3.5 text-base outline-none backdrop-blur-xl transition-all duration-300 [transition-timing-function:var(--ease-ios)] focus:border-primary focus:ring-4 focus:ring-ring/20"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[13px] font-medium text-muted-foreground">6-digit PIN</label>
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="press flex items-center gap-1.5 text-[13px] font-medium text-primary"
              >
                {reveal ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {reveal ? "Hide" : "Show"}
              </button>
            </div>
            <PinInput
              value={pin}
              onChange={(v) => {
                setPin(v);
                setError(null);
              }}
              onComplete={(v) => void submit(v)}
              masked={!reveal}
              disabled={busy}
              invalid={Boolean(error)}
            />
          </div>

          {error ? (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-destructive/10 px-4 py-2.5 text-center text-[13px] font-medium text-destructive"
            >
              {error}
            </motion.p>
          ) : null}

          <div className="flex items-center justify-between text-[13px]">
            <button
              type="button"
              onClick={() => setRemember((v) => !v)}
              className="press flex items-center gap-2 font-medium text-muted-foreground"
            >
              <span
                className={`grid size-5 place-items-center rounded-lg border transition-colors ${
                  remember
                    ? "border-primary bg-primary-gradient text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {remember ? <ShieldCheck className="size-3.5" /> : null}
              </span>
              Remember me
            </button>
            <button
              type="button"
              onClick={() => toast.info("Ask an admin to reset your PIN.")}
              className="press font-medium text-primary"
            >
              Forgot PIN?
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="press grid h-14 w-full place-items-center rounded-2xl bg-primary-gradient text-base font-semibold text-primary-foreground shadow-[var(--shadow-float)] disabled:opacity-70"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => toast.info("Biometric unlock is coming soon.")}
            className="press flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card/60 py-3 text-[13px] font-medium text-muted-foreground backdrop-blur-xl"
          >
            <Fingerprint className="size-4" />
            Use biometrics (coming soon)
          </button>
        </div>
      </motion.div>

      <p className="z-10 mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
        Demo accounts · admin1 / 950534 · chw1 / 950534
      </p>
    </div>
  );
}
