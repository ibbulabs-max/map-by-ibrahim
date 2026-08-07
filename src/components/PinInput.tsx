import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Props = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  masked?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
};

export function PinInput({
  length = 6,
  value,
  onChange,
  onComplete,
  masked = true,
  disabled,
  invalid,
  autoFocus,
}: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focused, setFocused] = useState<number | null>(null);
  const digits = value.split("");

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  function setAt(index: number, digit: string) {
    const next = value.split("");
    next[index] = digit;
    const joined = next.join("").slice(0, length);
    onChange(joined);
    if (joined.length === length && !joined.includes("")) onComplete?.(joined);
  }

  return (
    <div className="flex justify-between gap-2.5">
      {Array.from({ length }).map((_, i) => {
        const filled = Boolean(digits[i]);
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={1}
            disabled={disabled}
            value={filled ? (masked ? "•" : digits[i]!) : ""}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
              if (!pasted) return;
              onChange(pasted);
              const target = Math.min(pasted.length, length - 1);
              refs.current[target]?.focus();
              if (pasted.length === length) onComplete?.(pasted);
            }}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "");
              if (!raw) return;
              setAt(i, raw.at(-1)!);
              if (i < length - 1) refs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                if (digits[i]) {
                  const next = value.split("");
                  next[i] = "";
                  onChange(next.join("").replace(/\s/g, ""));
                } else if (i > 0) {
                  const next = value.split("");
                  next[i - 1] = "";
                  onChange(next.join(""));
                  refs.current[i - 1]?.focus();
                }
              }
              if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
              if (e.key === "ArrowRight" && i < length - 1) refs.current[i + 1]?.focus();
            }}
            className={cn(
              "h-14 w-full rounded-2xl border bg-card/70 text-center text-2xl font-semibold text-foreground",
              "backdrop-blur-xl outline-none transition-all duration-300 [transition-timing-function:var(--ease-ios)]",
              "border-border shadow-[var(--shadow-glass)] disabled:opacity-60",
              filled && "border-primary/60 bg-card",
              focused === i && "scale-105 border-primary ring-4 ring-ring/20",
              invalid && "border-destructive ring-4 ring-destructive/15",
            )}
          />
        );
      })}
    </div>
  );
}
