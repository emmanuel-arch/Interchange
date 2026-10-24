"use client";

// ─────────────────────────────────────────────────────────────────────────────
// ONE FIELD ON A FRONT DOOR — label, icon, input, and what went wrong with it.
//
// Three things this exists to get right, all of which the old card got wrong:
//
//   1. THE BLUE. Chrome paints an autofilled input #e8f0fe with a UA rule marked
//      !important, which no author rule can outrank. So the input sat as a pale
//      blue slab inside a white field the moment a password manager touched it.
//      The fix lives in globals.css (`.door-input:-webkit-autofill`) and uses the
//      one layer of the cascade above UA-important: a transition. The field now
//      looks the same filled by hand and filled by a manager.
//
//   2. THE LABEL IS A LABEL. A placeholder that doubles as the label vanishes
//      the moment somebody types, and an autofilled form is then two unlabelled
//      boxes. The name of the field sits above it, as on the Micro Eazy app.
//
//   3. AN ERROR BELONGS TO ITS FIELD. "Enter your email and password" in a
//      banner above both fields makes a person work out which one. The field
//      that is wrong turns red and says why, directly underneath itself.
//
// The password field also carries a reveal toggle and a Caps Lock warning,
// because "Invalid email or password" with Caps Lock on is the commonest failed
// sign-in there is, and the machine knows the answer before the person does.
// ─────────────────────────────────────────────────────────────────────────────
import { forwardRef, useId, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { AlertCircle, ArrowBigUp, Eye, EyeOff, type LucideIcon } from "lucide-react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
  label: string;
  icon: LucideIcon;
  /** Sentence under the field; turns the field red. */
  error?: string | null;
  /** Red outline with no sentence — for a refusal that names no one field. */
  invalid?: boolean;
  /** Password fields get the reveal toggle and the Caps Lock hint. */
  secret?: boolean;
};

const DoorField = forwardRef<HTMLInputElement, Props>(function DoorField(
  { label, icon: Icon, error, invalid = false, secret = false, id, onKeyDown, onKeyUp, onBlur, type, className = "", ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  const [reveal, setReveal] = useState(false);
  const [caps, setCaps] = useState(false);

  // getModifierState is the only honest source: it reads the key itself, not a
  // guess from the case of what was typed (which is wrong for Shift+letter).
  const readCaps = (e: KeyboardEvent<HTMLInputElement>) => {
    if (secret && typeof e.getModifierState === "function") setCaps(e.getModifierState("CapsLock"));
  };

  return (
    <div className={className}>
      <label htmlFor={fieldId} className="door-label">
        {label}
      </label>
      <div className="door-field" data-invalid={error || invalid ? "" : undefined}>
        <Icon className="door-field-icon h-[18px] w-[18px] shrink-0" strokeWidth={2} />
        <input
          ref={ref}
          id={fieldId}
          type={secret ? (reveal ? "text" : "password") : type}
          aria-invalid={error || invalid ? true : undefined}
          aria-describedby={error ? `${fieldId}-err` : undefined}
          onKeyDown={(e) => {
            readCaps(e);
            onKeyDown?.(e);
          }}
          onKeyUp={(e) => {
            readCaps(e);
            onKeyUp?.(e);
          }}
          onBlur={(e) => {
            setCaps(false);
            onBlur?.(e);
          }}
          className="door-input"
          spellCheck={false}
          {...rest}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[#8a8a95] transition-colors hover:bg-black/[0.05] hover:text-[#0c0c10]"
          >
            {reveal ? <EyeOff className="h-[18px] w-[18px]" strokeWidth={2} /> : <Eye className="h-[18px] w-[18px]" strokeWidth={2} />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${fieldId}-err`} role="alert" className="door-error mt-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />
          {error}
        </p>
      ) : secret && caps ? (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100/90 px-2.5 py-1 text-[11.5px] font-semibold text-amber-800">
          <ArrowBigUp className="h-3.5 w-3.5" strokeWidth={2.4} />
          Caps Lock is on
        </p>
      ) : null}
    </div>
  );
});

export default DoorField;
