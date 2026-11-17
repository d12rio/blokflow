"use client";

import { useCallback, useSyncExternalStore } from "react";

// A per-person view preference in localStorage. The server and the first client render see `false`,
// so hydration matches, then the stored value takes over.
const EVENT = "stored-flag";

function read(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function useStoredFlag(key: string): [boolean, (value: boolean) => void] {
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("storage", onChange);
    window.addEventListener(EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener(EVENT, onChange);
    };
  }, []);
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => false,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
