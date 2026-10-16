/** Small localStorage helpers that never throw (private mode, blocked storage). */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Saves a value; false when storage refused it (blocked, or full), for callers that can save less. */
export function writeJson<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // storage unavailable: settings last for this visit only
    return false;
  }
}
