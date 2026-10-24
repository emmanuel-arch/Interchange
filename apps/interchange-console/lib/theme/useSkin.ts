"use client";

// Which floor the console is standing on. localStorage is an external store, so
// it is read with useSyncExternalStore — mirroring it into state would paint the
// default wallpaper for one frame and then swap it, on the largest layer on
// screen. Same reasoning, and the same key shape, as connected-suite's useSkin.
import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_SKIN, SKIN_STORAGE_KEY, skinFor, type Skin } from "./skins";

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

let memory: string | null = null;

function read(): string {
  try {
    const v = localStorage.getItem(SKIN_STORAGE_KEY);
    if (v) return v;
  } catch {
    /* fall through */
  }
  return memory ?? DEFAULT_SKIN;
}

export function useSkin(): { skin: Skin; skinId: string; setSkin: (id: string) => void } {
  const skinId = useSyncExternalStore(subscribe, read, () => DEFAULT_SKIN);
  const setSkin = useCallback((id: string) => {
    memory = id;
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, id);
    } catch {
      /* a preference is a convenience, never a requirement */
    }
    emit();
  }, []);
  return { skin: skinFor(skinId), skinId, setSkin };
}
