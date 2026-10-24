"use client";

// Four drawn boxes over ONE real input — the estate's CodeInput (connected-suite
// components/auth/CodeInput), with dots instead of digits: this is a standing
// access code, not a one-time SMS code, so it is masked like a password. One
// input means paste, autofill and the keyboard all behave as they would on any
// field; the boxes are only how it is drawn.
import { forwardRef, useState } from "react";

const AccessCodeInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (next: string) => void;
    onComplete?: (code: string) => void;
    length?: number;
    disabled?: boolean;
    invalid?: boolean;
    onFocus?: () => void;
    onBlur?: () => void;
  }
>(function AccessCodeInput({ value, onChange, onComplete, length = 4, disabled = false, invalid = false, onFocus, onBlur }, ref) {
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, length);

  const take = (raw: string) => {
    const next = raw.replace(/\D/g, "").slice(0, length);
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <div className={`code-row ${invalid ? "code-row--bad" : ""}`}>
      <div aria-hidden className="code-boxes" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {Array.from({ length }, (_, i) => {
          const set = i < digits.length;
          const at = focused && !disabled && i === Math.min(digits.length, length - 1) && digits.length < length;
          return (
            <span key={i} className={`code-box ${set ? "code-box--set" : ""} ${at ? "code-box--at" : ""}`}>
              {set ? <span className="code-dot" /> : at ? <span className="code-caret" /> : null}
            </span>
          );
        })}
      </div>
      <input
        ref={ref}
        id="access-code"
        type="password"
        value={digits}
        onChange={(e) => take(e.target.value)}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        inputMode="numeric"
        autoComplete="current-password"
        pattern="[0-9]*"
        maxLength={length}
        disabled={disabled}
        aria-label="Four-digit access code"
        aria-invalid={invalid || undefined}
        className="code-input"
      />
    </div>
  );
});

export default AccessCodeInput;
