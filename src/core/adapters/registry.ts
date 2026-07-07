import type { SiteAdapter } from "./types";
import { ranobesAdapter } from "./ranobes";

/**
 * Adding a site = implement SiteAdapter in its own folder and list it here.
 * Order matters only if two adapters could match the same host (avoid that).
 */
const adapters: readonly SiteAdapter[] = [ranobesAdapter];

export function findAdapter(url: URL | string): SiteAdapter | undefined {
  const u = typeof url === "string" ? safeUrl(url) : url;
  if (!u) return undefined;
  return adapters.find((a) => a.matches(u));
}

export function getAdapter(id: string): SiteAdapter | undefined {
  return adapters.find((a) => a.id === id);
}

export function listAdapters(): readonly SiteAdapter[] {
  return adapters;
}

function safeUrl(s: string): URL | undefined {
  try {
    return new URL(s);
  } catch {
    return undefined;
  }
}
