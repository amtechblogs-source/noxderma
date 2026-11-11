"use client";

import React from "react";
import { Trash2 } from "lucide-react";

export interface FloatingBulkActionBarProps {
  /** Number of selected items (bar is hidden when count <= 0) */
  count: number;
  /** Singular label shown when count === 1 (e.g. "Bill Selected") */
  singularLabel: string;
  /** Plural label shown when count > 1 (e.g. "Bills Selected") */
  pluralLabel: string;
  /** Optional subtitle displayed below the label (e.g. formatted total value) */
  subtitle?: React.ReactNode;
  /** Handler to clear the current selection */
  onClear: () => void;
  /** Handler to trigger the bulk delete modal/action */
  onDelete: () => void;
}

/**
 * Sleek bottom floating pill bar for bulk multi-select actions.
 * Positioned above the mobile bottom navigation bar and centered on desktop.
 */
export function FloatingBulkActionBar({
  count,
  singularLabel,
  pluralLabel,
  subtitle,
  onClear,
  onDelete,
}: FloatingBulkActionBarProps) {
  if (count <= 0) return null;

  return (
    <div className="fixed bottom-[92px] lg:bottom-5 left-2.5 right-2.5 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 z-30 pointer-events-none no-print print:hidden animate-in fade-in slide-in-from-bottom-3">
      <div className="pointer-events-auto w-full lg:min-w-[420px] max-w-lg mx-auto px-3 py-2 sm:px-4 sm:py-2.5 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white shadow-2xl border border-slate-700/90 flex items-center justify-between gap-2.5 sm:gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-7 h-7 rounded-xl bg-teal-500 text-white font-mono font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">
            {count}
          </span>
          <div className="min-w-0 leading-tight">
            <span className="font-bold text-xs sm:text-sm text-white block truncate">
              {count === 1 ? singularLabel : pluralLabel}
            </span>
            {subtitle ? (
              <span className="text-[11px] text-slate-300 font-mono block truncate">
                {subtitle}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onClear}
            className="px-2.5 sm:px-3 py-1.5 min-h-[34px] rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 border border-slate-700 text-slate-200 font-bold text-xs whitespace-nowrap transition-colors btn-interactive"
          >
            <span className="hidden sm:inline">Deselect All</span>
            <span className="sm:hidden">Clear</span>
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="px-3 sm:px-3.5 py-1.5 min-h-[34px] rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm shadow-rose-600/30 whitespace-nowrap transition-colors btn-interactive"
          >
            <Trash2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Delete Selected</span>
            <span className="sm:hidden">Delete</span>
          </button>
        </div>
      </div>
    </div>
  );
}

