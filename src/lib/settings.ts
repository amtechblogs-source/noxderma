import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@/types";
import { offlineDb } from "@/lib/offline/db";

const SETTINGS_MIRROR_KEY = "noxderma_business_settings";

export function isDefaultLogoPlaceholder(url?: string | null): boolean {
  if (!url || typeof url !== "string") return true;
  const trimmed = url.trim();
  return (
    !trimmed ||
    trimmed === "/brand/invoice-logo.svg" ||
    trimmed === "/brand/logo.svg"
  );
}

/**
 * Resolves the best logo URL for printing on bills, invoices, and official statements.
 * Prioritizes custom uploaded Print Logo (`invoiceLogoUrl`), then custom UI Logo (`appLogoUrl` / `businessLogoUrl`),
 * and finally falls back to any configured logo URL.
 */
export function resolvePrintLogoUrl(settings?: BusinessSettings | null): string {
  if (!settings) return "";
  if (!isDefaultLogoPlaceholder(settings.invoiceLogoUrl)) {
    return settings.invoiceLogoUrl.trim();
  }
  if (!isDefaultLogoPlaceholder(settings.appLogoUrl)) {
    return settings.appLogoUrl.trim();
  }
  if (!isDefaultLogoPlaceholder(settings.businessLogoUrl)) {
    return settings.businessLogoUrl.trim();
  }
  return (
    settings.invoiceLogoUrl?.trim() ||
    settings.appLogoUrl?.trim() ||
    settings.businessLogoUrl?.trim() ||
    ""
  );
}

/**
 * Merges two BusinessSettings records, preferring the newer record while preserving
 * non-default user customizations (e.g. custom invoiceFooter and custom uploaded logos)
 * if one source had an unconfigured default fallback.
 */
export function mergeBusinessSettings(
  a?: BusinessSettings | null,
  b?: BusinessSettings | null
): BusinessSettings | null {
  if (!a && !b) return null;
  if (!a) return b || null;
  if (!b) return a || null;

  const aIsSystem = a.updatedBy === "system";
  const bIsSystem = b.updatedBy === "system";

  let primary = a;
  let secondary = b;

  if (aIsSystem && !bIsSystem) {
    primary = b;
    secondary = a;
  } else if (!aIsSystem && bIsSystem) {
    primary = a;
    secondary = b;
  } else {
    const aTime = new Date(a.updatedAt || 0).getTime() || 0;
    const bTime = new Date(b.updatedAt || 0).getTime() || 0;
    if (bTime > aTime) {
      primary = b;
      secondary = a;
    }
  }

  const merged: BusinessSettings = {
    ...DEFAULT_BUSINESS_SETTINGS,
    ...secondary,
    ...primary,
    id: "primary",
  };

  // Preserve custom uploaded invoiceLogoUrl if primary only has empty/default placeholder
  if (
    isDefaultLogoPlaceholder(primary.invoiceLogoUrl) &&
    !isDefaultLogoPlaceholder(secondary.invoiceLogoUrl)
  ) {
    merged.invoiceLogoUrl = secondary.invoiceLogoUrl;
  }

  // Preserve custom uploaded appLogoUrl if primary only has empty/default placeholder
  if (
    isDefaultLogoPlaceholder(primary.appLogoUrl) &&
    !isDefaultLogoPlaceholder(secondary.appLogoUrl)
  ) {
    merged.appLogoUrl = secondary.appLogoUrl;
  }

  // Preserve custom invoiceFooter if primary has empty or default system text while secondary has custom text
  const defaultFooter = DEFAULT_BUSINESS_SETTINGS.invoiceFooter;
  if (
    (!primary.invoiceFooter || primary.invoiceFooter === defaultFooter) &&
    secondary.invoiceFooter &&
    secondary.invoiceFooter !== defaultFooter
  ) {
    merged.invoiceFooter = secondary.invoiceFooter;
  }

  return merged;
}

/**
 * Synchronous read from localStorage mirror for zero-delay initial render.
 */
export function getCachedBusinessSettings(): BusinessSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SETTINGS_MIRROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const item = Array.isArray(parsed)
      ? parsed.find((x) => x && x.id === "primary") || parsed[0]
      : parsed;
    if (item && typeof item === "object") {
      return { ...DEFAULT_BUSINESS_SETTINGS, ...item, id: "primary" };
    }
  } catch {}
  return null;
}

/**
 * Loads the most up-to-date BusinessSettings across localStorage, IndexedDB, and /api/settings,
 * and keeps localStorage + IndexedDB synchronized.
 */
export async function loadAuthoritativeBusinessSettings(): Promise<BusinessSettings> {
  const fromMirror = getCachedBusinessSettings();

  let fromDexie: BusinessSettings | null = null;
  try {
    const primary = await offlineDb.settings.get("primary");
    if (primary) {
      fromDexie = primary;
    } else {
      const all = await offlineDb.settings.toArray();
      if (all.length > 0) {
        fromDexie = all[0];
      }
    }
  } catch {}

  let bestLocal = mergeBusinessSettings(fromMirror, fromDexie);

  // Sync merged bestLocal back to both local stores if they diverged
  if (bestLocal) {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify([bestLocal]));
      } catch {}
    }
    if (!fromDexie || fromDexie.updatedAt !== bestLocal.updatedAt || fromDexie.invoiceFooter !== bestLocal.invoiceFooter || fromDexie.invoiceLogoUrl !== bestLocal.invoiceLogoUrl) {
      try {
        await offlineDb.settings.put(bestLocal);
      } catch {}
    }
  }

  // If we don't have user-configured settings locally yet, check /api/settings
  if (!bestLocal || bestLocal.updatedBy === "system") {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data?.settings && !data.isDefaultFallback) {
          const mergedWithRemote = mergeBusinessSettings(bestLocal, data.settings);
          if (mergedWithRemote) {
            bestLocal = mergedWithRemote;
            await offlineDb.settings.put(mergedWithRemote).catch(() => {});
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify([mergedWithRemote]));
              } catch {}
            }
          }
        }
      }
    } catch {}
  }

  return bestLocal || DEFAULT_BUSINESS_SETTINGS;
}
