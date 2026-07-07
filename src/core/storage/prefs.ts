import browser from "webextension-polyfill";

/**
 * User preferences live in browser.storage.local (simple key/value, survives
 * restarts, syncable later by swapping to storage.sync where size allows).
 */
export interface Prefs {
  requestIntervalMs: number;
  maxAttempts: number;
  placeholderForFailed: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  requestIntervalMs: 1200,
  maxAttempts: 3,
  placeholderForFailed: true,
};

const KEY = "prefs";

export async function getPrefs(): Promise<Prefs> {
  const stored = await browser.storage.local.get(KEY);
  return { ...DEFAULT_PREFS, ...(stored[KEY] as Partial<Prefs> | undefined) };
}

export async function setPrefs(patch: Partial<Prefs>): Promise<Prefs> {
  const next = { ...(await getPrefs()), ...patch };
  await browser.storage.local.set({ [KEY]: next });
  return next;
}
