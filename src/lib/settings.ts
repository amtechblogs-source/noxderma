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

  // Preserve custom paymentInstructions if primary has empty or default text while secondary has custom text
  const defaultBank = DEFAULT_BUSINESS_SETTINGS.paymentInstructions;
  if (
    (!primary.paymentInstructions || primary.paymentInstructions === defaultBank) &&
    secondary.paymentInstructions &&
    secondary.paymentInstructions !== defaultBank
  ) {
    merged.paymentInstructions = secondary.paymentInstructions;
  }

  // Deduplicate legacy businessLogoUrl when it is an identical base64 copy of appLogoUrl
  if (
    merged.businessLogoUrl &&
    merged.businessLogoUrl === merged.appLogoUrl &&
    merged.businessLogoUrl.startsWith("data:")
  ) {
    merged.businessLogoUrl = "";
  }

  return merged;
}

/**
 * Compresses an oversized data:image/... URL in the browser so it always fits
 * comfortably in localStorage (<480KB) and Cloud Firestore (<1MB).
 */
export async function compactDataUrl(
  dataUrl: string,
  maxDim = 340
): Promise<string> {
  if (
    typeof window === "undefined" ||
    !dataUrl ||
    !dataUrl.startsWith("data:image/") ||
    dataUrl.length <= 130_000
  ) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width <= 0 || height <= 0) {
          resolve(dataUrl);
          return;
        }
        const ratio = Math.min(1, maxDim / width, maxDim / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        let result = canvas.toDataURL("image/png");
        if (result.length > 130_000) {
          // Try smaller PNG preserving transparency first
          const smallRatio = Math.min(1, 240 / width, 240 / height);
          const sw = Math.max(1, Math.round(width * smallRatio));
          const sh = Math.max(1, Math.round(height * smallRatio));
          canvas.width = sw;
          canvas.height = sh;
          const sctx = canvas.getContext("2d");
          if (sctx) {
            sctx.drawImage(img, 0, 0, sw, sh);
            result = canvas.toDataURL("image/png");
          }
        }
        if (result.length > 140_000) {
          // Fallback to high-quality JPEG on white background so size is guaranteed < 60KB
          const jctx = canvas.getContext("2d");
          if (jctx) {
            jctx.fillStyle = "#ffffff";
            jctx.fillRect(0, 0, canvas.width, canvas.height);
            jctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            result = canvas.toDataURL("image/jpeg", 0.88);
          }
        }
        resolve(result);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export async function compactBusinessSettingsLogos(
  settings: BusinessSettings
): Promise<{ settings: BusinessSettings; changed: boolean }> {
  let changed = false;
  const next: BusinessSettings = { ...settings, id: "primary" };

  if (
    next.businessLogoUrl &&
    next.businessLogoUrl === next.appLogoUrl &&
    next.businessLogoUrl.startsWith("data:")
  ) {
    next.businessLogoUrl = "";
    changed = true;
  }

  if (next.appLogoUrl?.startsWith("data:image/") && next.appLogoUrl.length > 130_000) {
    const compacted = await compactDataUrl(next.appLogoUrl, 320);
    if (compacted !== next.appLogoUrl) {
      next.appLogoUrl = compacted;
      changed = true;
    }
  }

  if (
    next.invoiceLogoUrl?.startsWith("data:image/") &&
    next.invoiceLogoUrl.length > 130_000
  ) {
    const compacted = await compactDataUrl(next.invoiceLogoUrl, 360);
    if (compacted !== next.invoiceLogoUrl) {
      next.invoiceLogoUrl = compacted;
      changed = true;
    }
  }

  return { settings: next, changed };
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

  // Sync merged bestLocal back to both local stores if they diverged, and compact any legacy oversized base64 logos
  if (bestLocal) {
    const { settings: compacted, changed } = await compactBusinessSettingsLogos(bestLocal);
    bestLocal = compacted;

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify([bestLocal]));
      } catch {}
    }
    if (
      changed ||
      !fromDexie ||
      fromDexie.updatedAt !== bestLocal.updatedAt ||
      fromDexie.invoiceFooter !== bestLocal.invoiceFooter ||
      fromDexie.invoiceLogoUrl !== bestLocal.invoiceLogoUrl
    ) {
      try {
        await offlineDb.settings.put(bestLocal);
      } catch {}
    }
    if (changed) {
      // Push newly-compacted settings to Cloud Firestore so previously-rejected >1MB documents now sync
      (async () => {
        try {
          const { db } = await import("@/lib/firebase/config");
          const { doc, setDoc } = await import("firebase/firestore");
          const clean = JSON.parse(
            JSON.stringify(bestLocal, (_k, v) => (v === undefined ? null : v))
          );
          await Promise.allSettled([
            setDoc(doc(db, "settings", "primary"), clean, { merge: true }),
            setDoc(doc(db, "organizationSettings", "primary"), clean, { merge: true }),
          ]);
        } catch {}
      })();
    }
  }

  // If we don't have user-configured settings locally yet (or local is missing custom logo/footer), check /api/settings
  const needsRemoteCheck =
    !bestLocal ||
    bestLocal.updatedBy === "system" ||
    isDefaultLogoPlaceholder(bestLocal.invoiceLogoUrl) ||
    bestLocal.invoiceFooter === DEFAULT_BUSINESS_SETTINGS.invoiceFooter;

  if (needsRemoteCheck) {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data?.settings && !data.isDefaultFallback) {
          const mergedWithRemote = mergeBusinessSettings(bestLocal, data.settings);
          if (mergedWithRemote) {
            const { settings: compactedRemote } = await compactBusinessSettingsLogos(mergedWithRemote);
            bestLocal = compactedRemote;
            await offlineDb.settings.put(compactedRemote).catch(() => {});
            if (typeof window !== "undefined") {
              try {
                localStorage.setItem(SETTINGS_MIRROR_KEY, JSON.stringify([compactedRemote]));
              } catch {}
            }
          }
        }
      }
    } catch {}
  }

  return bestLocal || DEFAULT_BUSINESS_SETTINGS;
}
