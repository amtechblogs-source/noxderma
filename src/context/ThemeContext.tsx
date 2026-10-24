"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeIdState] = useState<ThemeId>("teal");

  // Load persisted theme
  useEffect(() => {
    async function loadTheme() {
      if (typeof window !== "undefined") {
        const local = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
        if (local && COLOR_THEMES.some((t) => t.id === local)) {
          setThemeIdState(local);
          applyThemeToDOM(local);
          return;
        }
      }

      try {
        const stored = await offlineDb.settings.get("primary");
        if (stored && (stored as any).colorTheme) {
          const tId = (stored as any).colorTheme as ThemeId;
          setThemeIdState(tId);
          applyThemeToDOM(tId);
        } else {
          applyThemeToDOM("teal");
        }
      } catch {
        applyThemeToDOM("teal");
      }
    }

    loadTheme();
  }, []);

  const applyThemeToDOM = (id: ThemeId) => {
    if (typeof document === "undefined") return;
    const themeObj = COLOR_THEMES.find((t) => t.id === id) || COLOR_THEMES[0];
    const root = document.documentElement;

    root.setAttribute("data-theme", id);

    // Dynamic CSS Custom Properties
    root.style.setProperty("--theme-primary", themeObj.primaryColor);
    root.style.setProperty("--theme-primary-dark", themeObj.darkPrimaryColor);
    root.style.setProperty("--theme-accent-bg", themeObj.accentBg);
    root.style.setProperty("--theme-accent-dark-bg", themeObj.darkAccentBg);
  };

  const setTheme = async (id: ThemeId) => {
    setThemeIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(THEME_STORAGE_KEY, id);
    }
    applyThemeToDOM(id);

    try {
      const stored = await offlineDb.settings.get("primary");
      if (stored) {
        await offlineDb.settings.put({
          ...stored,
          colorTheme: id,
          updatedAt: new Date().toISOString(),
        } as any);
      }
    } catch (err) {
      console.warn("Could not persist theme to offlineDb:", err);
    }
  };

  const currentTheme = COLOR_THEMES.find((t) => t.id === themeId) || COLOR_THEMES[0];

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        themeId,
        setTheme,
        availableThemes: COLOR_THEMES,
      }}
    >
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
