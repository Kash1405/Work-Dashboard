import { useCallback, useSyncExternalStore } from "react";

// Tiny shared store: every component using the same key sees the same value,
// and values are persisted to localStorage. Keys starting with "~" stay in memory only.
// Own prefix: this site may share an origin (and so localStorage) with the Personal Dashboard.
const PREFIX = "work1.";
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();
const anyListeners = new Set<(key: string) => void>();

// Notified after every write (used by cloud sync to notice local changes).
export function subscribeAll(listener: (key: string) => void) {
  anyListeners.add(listener);
  return () => {
    anyListeners.delete(listener);
  };
}

export function getStored<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let value = fallback;
  if (!key.startsWith("~")) {
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw !== null) value = JSON.parse(raw) as T;
    } catch {
      value = fallback;
    }
  }
  cache.set(key, value);
  return value;
}

// Read without caching a fallback (so background code never masks a hook's default).
export function peekStored<T>(key: string): T | undefined {
  if (cache.has(key)) return cache.get(key) as T;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

export function hasStored(key: string) {
  try {
    return window.localStorage.getItem(PREFIX + key) !== null;
  } catch {
    return false;
  }
}

export function setStored<T>(key: string, next: T | ((prev: T) => T), fallback?: T) {
  const prev = getStored(key, fallback as T);
  const value = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
  cache.set(key, value);
  if (!key.startsWith("~")) {
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: keep the in-memory value.
    }
  }
  listeners.get(key)?.forEach((listener) => listener());
  anyListeners.forEach((listener) => listener(key));
}

export function useStored<T>(key: string, fallback: T) {
  const subscribe = useCallback(
    (callback: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(callback);
      return () => {
        set.delete(callback);
      };
    },
    [key],
  );
  const value = useSyncExternalStore(subscribe, () => getStored(key, fallback));
  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => setStored(key, next, fallback),
    [key],
  );
  return [value, setValue] as const;
}

export function exportAll() {
  const data: Record<string, unknown> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX) && !key.startsWith(`${PREFIX}auth.`) && !key.startsWith(`${PREFIX}sync.`)) data[key.slice(PREFIX.length)] = JSON.parse(window.localStorage.getItem(key) ?? "null");
    }
  } catch {
    // Ignore unreadable storage.
  }
  return { app: "work-dashboard", version: 2, exportedAt: new Date().toISOString(), data };
}

export function importAll(payload: unknown) {
  const data = (payload as { data?: Record<string, unknown> })?.data;
  if (!data || typeof data !== "object") throw new Error("This file is not a dashboard backup.");
  for (const [key, value] of Object.entries(data)) setStored(key, value);
}
