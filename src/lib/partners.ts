import type { PartnerConfig } from "@/types";

export interface PartnerTheme {
  key: string;
  primary: string;
  bgLight: string;
  border: string;
  barBg: string;
  badgeBg: string;
  accent: string;
  avatarBg: string;
  buttonActive: string;
}

export const PARTNER_THEMES: PartnerTheme[] = [
  {
    key: "emerald",
    primary: "text-emerald-700 dark:text-emerald-300",
    bgLight: "bg-emerald-50 dark:bg-emerald-950/40",
    border: "border-emerald-300 dark:border-emerald-700/60",
    barBg: "bg-emerald-600",
    badgeBg: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border-emerald-300",
    accent: "text-emerald-600",
    avatarBg: "bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300",
    buttonActive: "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20",
  },
  {
    key: "indigo",
    primary: "text-indigo-700 dark:text-indigo-300",
    bgLight: "bg-indigo-50 dark:bg-indigo-950/40",
    border: "border-indigo-300 dark:border-indigo-700/60",
    barBg: "bg-indigo-600",
    badgeBg: "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 border-indigo-300",
    accent: "text-indigo-600",
    avatarBg: "bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300",
    buttonActive: "border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-100 ring-2 ring-indigo-500/20",
  },
  {
    key: "amber",
    primary: "text-amber-700 dark:text-amber-300",
    bgLight: "bg-amber-50 dark:bg-amber-950/40",
    border: "border-amber-300 dark:border-amber-700/60",
    barBg: "bg-amber-600",
    badgeBg: "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border-amber-300",
    accent: "text-amber-600",
    avatarBg: "bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300",
    buttonActive: "border-amber-600 bg-amber-50/70 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100 ring-2 ring-amber-500/20",
  },
  {
    key: "purple",
    primary: "text-purple-700 dark:text-purple-300",
    bgLight: "bg-purple-50 dark:bg-purple-950/40",
    border: "border-purple-300 dark:border-purple-700/60",
    barBg: "bg-purple-600",
    badgeBg: "bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-200 border-purple-300",
    accent: "text-purple-600",
    avatarBg: "bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300",
    buttonActive: "border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 text-purple-900 dark:text-purple-100 ring-2 ring-purple-500/20",
  },
  {
    key: "rose",
    primary: "text-rose-700 dark:text-rose-300",
    bgLight: "bg-rose-50 dark:bg-rose-950/40",
    border: "border-rose-300 dark:border-rose-700/60",
    barBg: "bg-rose-600",
    badgeBg: "bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200 border-rose-300",
    accent: "text-rose-600",
    avatarBg: "bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300",
    buttonActive: "border-rose-600 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 ring-2 ring-rose-500/20",
  },
  {
    key: "cyan",
    primary: "text-cyan-700 dark:text-cyan-300",
    bgLight: "bg-cyan-50 dark:bg-cyan-950/40",
    border: "border-cyan-300 dark:border-cyan-700/60",
    barBg: "bg-cyan-600",
    badgeBg: "bg-cyan-100 dark:bg-cyan-900/50 text-cyan-800 dark:text-cyan-200 border-cyan-300",
    accent: "text-cyan-600",
    avatarBg: "bg-cyan-100 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300",
    buttonActive: "border-cyan-600 bg-cyan-50/70 dark:bg-cyan-950/40 text-cyan-900 dark:text-cyan-100 ring-2 ring-cyan-500/20",
  },
];

export function getPartnerTheme(index: number): PartnerTheme {
  return PARTNER_THEMES[index % PARTNER_THEMES.length];
}

export const DEFAULT_PARTNERS: PartnerConfig[] = [
  { id: "partner_1", name: "Partner 1" },
  { id: "partner_2", name: "Partner 2" },
];

