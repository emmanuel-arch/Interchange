"use client";

// ─────────────────────────────────────────────────────────────────────────────
// APPEARANCE — light, dark, or whatever this machine is doing.
//
// The console was dark by decree ("a vault does not have a light mode"). Inside
// the estate it is one system among seven, and every other one lets the person
// choose; an Interchange that alone refused read as a different product. So the
// same three-way switch the Lending Console carries, with the same semantics:
// only an explicit press is stored, and "system" is a real state.
//
// The applied value is stamped on <html data-theme>. app/globals.css keys the
// light face off that attribute; the dark face is the console as it always was.
//
// SCOPED TO THE CONSOLE. The public site and the doors share this origin and
// were designed for one ground each, so the provider is mounted only by the
// console layout, and it takes the attribute away again when it unmounts — a
// client-side hop from the console to the site must not carry a light theme
// onto pages that have never been looked at in one. The console layout's inline
// script (THEME_BOOT) stamps the attribute before first paint.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Shared with THEME_BOOT below. */
export const THEME_STORAGE_KEY = "suite:appearance";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Runs before React, from the console layout, so the first frame is already in
 * the right theme. Must agree with ThemeProvider about the key and the default.
 */
export const THEME_BOOT = `(function(){try{var c=localStorage.getItem("${THEME_STORAGE_KEY}");if(c!=="light"&&c!=="dark")c=window.matchMedia("${DARK_QUERY}").matches?"dark":"light";document.documentElement.setAttribute("data-theme",c);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Where the choice lives when the browser blocks storage — for the session. */
let memoryChoice: ThemeChoice | null = null;

function choiceSnapshot(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* fall through */
  }
  return memoryChoice ?? "system";
}

function systemDarkSnapshot(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return true;
  }
}

type ThemeCtx = { choice: ThemeChoice; resolved: ResolvedTheme; setChoice: (c: ThemeChoice) => void };

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const choice = useSyncExternalStore(subscribe, choiceSnapshot, () => "system" as ThemeChoice);
  // The server has no device. Dark is the console's historical face, and the
  // boot script has already corrected it before anything was painted.
  const systemDark = useSyncExternalStore(subscribe, systemDarkSnapshot, () => true);
  const resolved: ResolvedTheme = choice === "system" ? (systemDark ? "dark" : "light") : choice;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  // Leaving the console: the site and the doors have one ground each.
  useEffect(() => () => document.documentElement.removeAttribute("data-theme"), []);

  const setChoice = useCallback((c: ThemeChoice) => {
    memoryChoice = c;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, c);
    } catch {
      /* a preference is a convenience, never a requirement */
    }
    emit();
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx) ?? { choice: "dark", resolved: "dark", setChoice: () => {} };
}
