"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { offlineDb } from "@/lib/offline/db";

export type ThemeId = "teal" | "indigo" | "violet" | "rose" | "amber";

export interface ColorTheme {
  id: ThemeId;
  name: string;
  nameUrdu: string;
  primaryColor: string;
  darkPrimaryColor: string;
  accentBg: string;
  darkAccentBg: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}

export const COLOR_THEMES: ColorTheme[] = [
  {
    id: "teal",
    name: "Emerald Clinical",
    nameUrdu: "زمرّد میڈیکل (Teal)",
    primaryColor: "#0d9488",
    darkPrimaryColor: "#14b8a6",
    accentBg: "#f0fdfa",
    darkAccentBg: "rgba(13, 148, 136, 0.15)",
    badgeBg: "bg-teal-50 dark:bg-teal-950/60",
    badgeText: "text-teal-700 dark:text-teal-300",
    description: "Standard clean clinical and pharmaceutical distribution theme",
  },
  {
    id: "indigo",
    name: "Sapphire Enterprise",
    nameUrdu: "یاقوت کارپوریٹ (Indigo)",
    primaryColor: "#4f46e5",
    darkPrimaryColor: "#818cf8",
    accentBg: "#eef2ff",
    darkAccentBg: "rgba(79, 70, 229, 0.15)",
    badgeBg: "bg-indigo-50 dark:bg-indigo-950/60",
    badgeText: "text-indigo-700 dark:text-indigo-300",
    description: "Deep oceanic executive style for pharmaceutical distributors",
  },
  {
    id: "violet",
    name: "Royal Cosmeceutical",
    nameUrdu: "شاہی کاسمیٹکس (Violet)",
    primaryColor: "#7c3aed",
    darkPrimaryColor: "#a78bfa",
    accentBg: "#f5f3ff",
    darkAccentBg: "rgba(124, 58, 237, 0.15)",
    badgeBg: "bg-purple-50 dark:bg-purple-950/60",
    badgeText: "text-purple-700 dark:text-purple-300",
    description: "Elegant luxury theme suited for dermatology and skincare lines",
  },
  {
    id: "rose",
    name: "Ruby Crimson",
    nameUrdu: "لعل کرمسن (Rose)",
    primaryColor: "#e11d48",
    darkPrimaryColor: "#fb7185",
    accentBg: "#fff1f2",
    darkAccentBg: "rgba(225, 29, 72, 0.15)",
    badgeBg: "bg-rose-50 dark:bg-rose-950/60",
    badgeText: "text-rose-700 dark:text-rose-300",
    description: "Vibrant and high-contrast clinical emergency and vitality tone",
  },
  {
    id: "amber",
    name: "Golden Sunset",
    nameUrdu: "سنہری عنبر (Amber)",
    primaryColor: "#d97706",
    darkPrimaryColor: "#fbbf24",
    accentBg: "#fffbeb",
    darkAccentBg: "rgba(217, 119, 6, 0.15)",
    badgeBg: "bg-amber-50 dark:bg-amber-950/60",
    badgeText: "text-amber-700 dark:text-amber-300",
    description: "Warm, radiant aesthetic for nutraceuticals and wellness",
  },
];

interface ThemeContextType {
  currentTheme: ColorTheme;
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
  availableThemes: ColorTheme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = "noxderma_color_theme";

const THEME_RGB_PALETTES: Record<ThemeId, Record<number, string>> = {
  teal: {
    50: "240 253 250",
    100: "204 251 241",
    200: "153 246 228",
    300: "94 234 212",
    400: "45 212 191",
    500: "20 184 166",
    600: "13 148 136",
    700: "15 118 110",
    800: "17 94 89",
    900: "19 78 74",
    950: "4 47 46",
  },
  indigo: {
    50: "238 242 255",
    100: "224 231 255",
    200: "199 210 254",
    300: "165 180 252",
    400: "129 140 248",
    500: "99 102 241",
    600: "79 70 229",
    700: "67 56 202",
    800: "55 48 163",
    900: "49 46 129",
    950: "30 27 75",
  },
  violet: {
    50: "245 243 255",
    100: "237 233 254",
    200: "221 214 254",
    300: "196 181 253",
    400: "167 139 250",
    500: "139 92 246",
    600: "124 58 237",
    700: "109 40 217",
    800: "91 33 182",
    900: "76 29 149",
    950: "46 16 101",
  },
  rose: {
    50: "255 241 242",
    100: "255 228 230",
    200: "254 205 211",
    300: "253 164 175",
    400: "251 113 133",
    500: "244 63 94",
    600: "225 29 72",
    700: "190 18 60",
    800: "159 18 57",
    900: "136 19 55",
    950: "76 5 25",
  },
  amber: {
    50: "255 251 235",
    100: "254 243 199",
    200: "253 230 138",
    300: "252 211 77",
    400: "251 191 36",
    500: "245 158 11",
    600: "217 119 6",
    700: "180 83 9",
    800: "146 64 14",
    900: "120 53 15",
    950: "69 26 3",
  },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>("teal");

  // Load persisted theme with database & cloud sync fallback
  useEffect(() => {
    async function loadTheme() {
      let appliedAny = false;

      // 1. Check fast localStorage for instant zero-flicker paint
      if (typeof window !== "undefined") {
        const local = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
        if (local && COLOR_THEMES.some((t) => t.id === local)) {
          setThemeIdState(local);
          applyThemeToDOM(local);
          appliedAny = true;
        }
      }

      // 2. Check offline Dexie database (which receives real-time Cloud Firestore updates)
      try {
        const stored = await offlineDb.settings.get("primary");
        if (stored && (stored as any).colorTheme) {
          const tId = (stored as any).colorTheme as ThemeId;
          if (COLOR_THEMES.some((t) => t.id === tId)) {
            setThemeIdState(tId);
            applyThemeToDOM(tId);
            if (typeof window !== "undefined") {
              localStorage.setItem(THEME_STORAGE_KEY, tId);
            }
            return;
          }
        }
      } catch {}

      if (appliedAny) return;

      // 3. Fallback: Rehydrate from server database (/api/settings)
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (
            data?.settings?.colorTheme &&
            !data.isDefaultFallback &&
            COLOR_THEMES.some((t: any) => t.id === data.settings.colorTheme)
          ) {
            const serverTheme = data.settings.colorTheme as ThemeId;
            setThemeIdState(serverTheme);
            applyThemeToDOM(serverTheme);
            if (typeof window !== "undefined") {
              localStorage.setItem(THEME_STORAGE_KEY, serverTheme);
            }
            return;
          }
        }
      } catch {}

      applyThemeToDOM("teal");
    }

    loadTheme();

    const handleSettingsUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.colorTheme && COLOR_THEMES.some((t) => t.id === detail.colorTheme)) {
        const nextTheme = detail.colorTheme as ThemeId;
        setThemeIdState(nextTheme);
        applyThemeToDOM(nextTheme);
        if (typeof window !== "undefined") {
          localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        }
      }
    };

    const handleCloudSynced = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (Array.isArray(detail?.tables) && !detail.tables.includes("settings")) {
        return;
      }
      offlineDb.settings
        .get("primary")
        .then((stored) => {
          const tId = (stored as any)?.colorTheme as ThemeId | undefined;
          if (tId && COLOR_THEMES.some((t) => t.id === tId)) {
            setThemeIdState(tId);
            applyThemeToDOM(tId);
            if (typeof window !== "undefined") {
              localStorage.setItem(THEME_STORAGE_KEY, tId);
            }
          }
        })
        .catch(() => {});
    };

    window.addEventListener("noxderma_settings_updated", handleSettingsUpdated);
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => {
      window.removeEventListener("noxderma_settings_updated", handleSettingsUpdated);
      window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
    };
  }, []);

  const applyThemeToDOM = (id: ThemeId) => {
    if (typeof document === "undefined") return;
    const themeObj = COLOR_THEMES.find((t) => t.id === id) || COLOR_THEMES[0];
    const root = document.documentElement;

    root.setAttribute("data-theme", id);

    // Dynamic Tailwind primary palette RGB variables
    const palette = THEME_RGB_PALETTES[id] || THEME_RGB_PALETTES.teal;
    Object.entries(palette).forEach(([shade, rgbVal]) => {
      root.style.setProperty(`--color-primary-${shade}`, rgbVal);
    });

    // Custom Properties
    root.style.setProperty("--primary", themeObj.primaryColor);
    root.style.setProperty("--ring", themeObj.primaryColor);
    root.style.setProperty("--theme-primary", themeObj.primaryColor);
    root.style.setProperty("--theme-primary-dark", themeObj.darkPrimaryColor);
    root.style.setProperty("--theme-accent-bg", themeObj.accentBg);
    root.style.setProperty("--theme-accent-dark-bg", themeObj.darkAccentBg);
  };

  const setTheme = useCallback(async (id: ThemeId) => {
    setThemeIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    }
    applyThemeToDOM(id);

    // Persist locally in Dexie and localStorage mirror, then sync full settings record
    let fullUpdatedRecord: Record<string, any> = { id: "primary", colorTheme: id, updatedAt: new Date().toISOString() };
    try {
      const stored = await offlineDb.settings.get("primary");
      if (stored) {
        fullUpdatedRecord = {
          ...stored,
          id: "primary",
          colorTheme: id,
          updatedAt: new Date().toISOString(),
        };
        await offlineDb.settings.put(fullUpdatedRecord as any);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem("noxderma_business_settings", JSON.stringify([fullUpdatedRecord]));
          } catch {}
        }
      }
    } catch (err) {
      console.warn("Could not persist theme to offlineDb:", err);
    }

    // Persist to server database & cloud in background
    try {
      fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fullUpdatedRecord),
      }).catch(() => {});
    } catch {}
  }, []);

  const currentTheme = useMemo(() => {
    return COLOR_THEMES.find((t) => t.id === themeId) || COLOR_THEMES[0];
  }, [themeId]);

  const themeContextValue = useMemo(() => ({
    currentTheme,
    themeId,
    setTheme,
    availableThemes: COLOR_THEMES,
  }), [currentTheme, themeId, setTheme]);

  return (
    <ThemeContext.Provider value={themeContextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
