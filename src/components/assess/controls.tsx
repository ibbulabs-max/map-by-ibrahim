import { useId, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from "lucide-react";

import { RISK_META, type RiskLevel } from "@/lib/risk";
import type { Option } from "@/lib/assessment";
import { cn } from "@/lib/utils";

/* ---------------- Liquid glass section ---------------- */

export function Section({
  title,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "glass rounded-3xl px-4 py-4",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
          {hint ? <p className="mt-0.5 text-[12px] text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** Smooth conditional reveal — never leaves disabled fields visible. */
export function Reveal({ when, children }: { when: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid transition-all duration-300 ease-out",
        when ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
      style={{ transitionTimingFunction: "var(--ease-ios)" }}
      aria-hidden={!when}
    >
      <div className={cn("overflow-hidden", when ? "" : "pointer-events-none")}>
        <div className="pt-3 space-y-3">{children}</div>
      </div>
    </div>
  );
}

/* ---------------- Inputs ---------------- */

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[13px] font-medium text-muted-foreground">{children}</span>;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "tel" | "date";
  min?: number;
  max?: number;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        type={type}
        inputMode={type === "number" ? "decimal" : type === "tel" ? "tel" : undefined}
        {...(min !== undefined ? { min } : {})}
        {...(max !== undefined ? { max } : {})}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 h-12 w-full rounded-2xl border border-border bg-card/70 px-4 text-base outline-none transition-all focus:border-primary focus:ring-4 focus:ring-ring/20"
      />
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-2xl border border-border bg-card/70 px-4 py-3 text-base outline-none transition-all focus:border-primary focus:ring-4 focus:ring-ring/20"
      />
    </label>
  );
}

/** Compact mobile segmented control — the default choice control everywhere. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label?: string;
  options: Option<T>[] | readonly Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
  columns?: number;
}) {
  const cols = columns ?? Math.min(options.length, 3);
  return (
    <div>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <div
        className={cn("mt-1 grid gap-1.5 rounded-2xl bg-card/60 p-1", label ? "" : "mt-0")}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "press min-h-11 rounded-xl px-2 py-2 text-[12px] font-semibold leading-tight",
              value === o.value
                ? "bg-primary-gradient text-primary-foreground shadow-[var(--shadow-glass)]"
                : "text-muted-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/70 px-4 py-2.5">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - 1))}
          className="press grid size-9 place-items-center rounded-xl bg-card text-lg font-semibold"
          aria-label={`Decrease ${label}`}
        >
          −
        </button>
        <input
          value={String(value)}
          inputMode="numeric"
          onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, "")) || 0))}
          className="h-9 w-12 rounded-xl border border-border bg-card/70 text-center text-base outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + 1))}
          className="press grid size-9 place-items-center rounded-xl bg-primary-gradient text-lg font-semibold text-primary-foreground"
          aria-label={`Increase ${label}`}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function CheckChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <button
      id={id}
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "press flex min-h-11 items-center gap-2 rounded-2xl border px-3.5 py-2 text-left text-[13px] font-medium",
        checked
          ? "border-primary/40 bg-primary/12 text-foreground"
          : "border-border bg-card/70 text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-md border",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {checked ? <CheckCircle2 className="size-3.5" /> : null}
      </span>
      <span className="leading-tight">{label}</span>
    </button>
  );
}

export const YES_NO: Option<"yes" | "no">[] = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
];

/** ONE reusable lifestyle question used by Alcohol, Smoking and Tobacco. */
export function LifestyleQuestion({
  question,
  useOptions,
  frequencyOptions,
  value,
  frequency,
  onValue,
  onFrequency,
}: {
  question: string;
  useOptions: Option[];
  frequencyOptions: Option[];
  value: string | null;
  frequency: string | null;
  onValue: (v: string) => void;
  onFrequency: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card/50 px-3.5 py-3">
      <Segmented label={question} options={useOptions} value={value} onChange={onValue} />
      <Reveal when={value === "yes"}>
        <Segmented
          label="How often?"
          options={frequencyOptions}
          value={frequency}
          onChange={onFrequency}
        />
      </Reveal>
    </div>
  );
}

/** ONE reusable symptoms panel used by both BP and Blood Sugar. */
export function SymptomsPanel({
  open,
  title,
  symptoms,
  selected,
  onToggle,
  onClose,
}: {
  open: boolean;
  title: string;
  symptoms: string[];
  selected: string[];
  onToggle: (symptom: string, on: boolean) => void;
  onClose: () => void;
}) {
  return (
    <Reveal when={open}>
      <div className="glass-strong rounded-2xl px-3.5 py-3">
        <p className="mb-2 text-[13px] font-semibold">{title}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {symptoms.map((s) => (
            <CheckChip
              key={s}
              label={s}
              checked={selected.includes(s)}
              onChange={(on) => onToggle(s, on)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="press mt-3 w-full rounded-xl bg-card/70 py-2 text-[12px] font-semibold text-muted-foreground"
        >
          Hide details
        </button>
      </div>
    </Reveal>
  );
}

/* ---------------- Risk liquid glass ---------------- */

const RISK_ICON = {
  high: ShieldAlert,
  moderate: AlertTriangle,
  low: CheckCircle2,
  unknown: HelpCircle,
} as const;

/** Translucent tinted risk surface — tint + glow + soft border + blur. */
export function riskGlassClass(level: RiskLevel) {
  if (level === "high")
    return "border border-destructive/35 bg-destructive/12 shadow-[0_10px_32px_-14px_var(--destructive)] backdrop-blur-xl";
  if (level === "moderate")
    return "border border-warning/40 bg-warning/14 shadow-[0_10px_32px_-14px_var(--warning)] backdrop-blur-xl";
  if (level === "low")
    return "border border-success/35 bg-success/12 shadow-[0_10px_32px_-14px_var(--success)] backdrop-blur-xl";
  return "border border-border bg-card/60 backdrop-blur-xl";
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const Icon = RISK_ICON[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        riskGlassClass(level),
        className,
      )}
      style={{ color: RISK_META[level].color }}
    >
      <Icon className="size-3.5" />
      {RISK_META[level].label}
    </span>
  );
}
