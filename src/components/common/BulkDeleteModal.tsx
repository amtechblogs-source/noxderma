"use client";

import React, { useState } from "react";
import { AlertTriangle, Trash2, X, Calendar, Check, RotateCcw } from "lucide-react";
import { formatNumber } from "@/lib/formatting";

export type DeleteScopeType =
  | "selected"
  | "today"
  | "weekly"
  | "monthly"
  | "custom"
  | "all";

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityName: string; // e.g. "Medical Stores", "Distributors", "Leads", "Staff Salaries"
  selectedCount: number;
  totalCount: number;
  countsByScope?: {
    selected?: number;
    today?: number;
    weekly?: number;
    monthly?: number;
    custom?: number;
    all?: number;
  };
  onConfirmDelete: (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => Promise<void>;
  isDeleting?: boolean;
}

export function BulkDeleteModal({
  isOpen,
  onClose,
  entityName,
  selectedCount,
  totalCount,
  countsByScope,
  onConfirmDelete,
  isDeleting = false,
}: BulkDeleteModalProps) {
  const [scope, setScope] = useState<DeleteScopeType>(
    selectedCount > 0 ? "selected" : "all"
  );
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  if (!isOpen) return null;

  const currentCount =
    scope === "selected"
      ? selectedCount
      : scope === "all"
      ? countsByScope?.all ?? totalCount
      : scope === "today"
      ? countsByScope?.today ?? 0
      : scope === "weekly"
      ? countsByScope?.weekly ?? 0
      : scope === "monthly"
      ? countsByScope?.monthly ?? 0
      : countsByScope?.custom ?? 0;

  const handleConfirm = async () => {
    await onConfirmDelete(scope, customStart, customEnd);
  };

  return (
    <div className="fixed inset-0 !mt-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 space-y-5 my-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                Delete {entityName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Select items, or delete by day, week, month, or custom date range.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scope Options */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
            Choose Deletion Scope / Criteria:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {/* 1. Selected Items */}
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setScope("selected")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                scope === "selected"
                  ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                  : selectedCount === 0
                  ? "opacity-50 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="font-extrabold flex items-center justify-between">
                <span>Selected Items</span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                  {selectedCount}
                </span>
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Checked rows only</span>
            </button>

            {/* 2. Today */}
            <button
              type="button"
              onClick={() => setScope("today")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                scope === "today"
                  ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="font-extrabold flex items-center justify-between">
                <span>Today (Daily)</span>
                {countsByScope?.today !== undefined && (
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                    {countsByScope.today}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Created today</span>
            </button>

            {/* 3. Weekly */}
            <button
              type="button"
              onClick={() => setScope("weekly")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                scope === "weekly"
                  ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="font-extrabold flex items-center justify-between">
                <span>Weekly</span>
                {countsByScope?.weekly !== undefined && (
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                    {countsByScope.weekly}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Past 7 days</span>
            </button>

            {/* 4. Monthly */}
            <button
              type="button"
              onClick={() => setScope("monthly")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                scope === "monthly"
                  ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="font-extrabold flex items-center justify-between">
                <span>This Month</span>
                {countsByScope?.monthly !== undefined && (
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                    {countsByScope.monthly}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Current calendar month</span>
            </button>

            {/* 5. Custom Range */}
            <button
              type="button"
              onClick={() => setScope("custom")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                scope === "custom"
                  ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="font-extrabold flex items-center justify-between">
                <span>Custom Date Range</span>
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Pick start and end date</span>
            </button>

            {/* 6. Delete All */}
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                scope === "all"
                  ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                  : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="font-extrabold flex items-center justify-between text-rose-600 dark:text-rose-400">
                <span>Delete All Records</span>
                <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                  {totalCount}
                </span>
              </span>
              <span className="text-[10px] text-slate-500 mt-1">Clear all {entityName}</span>
            </button>
          </div>
        </div>

        {/* Custom Date Pickers when scope === "custom" */}
        {scope === "custom" && (
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
            <span className="font-bold text-slate-700 dark:text-slate-300 block">
              Specify Date Range:
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">From Date:</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 block mb-1">To Date:</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* Danger Warning Banner */}
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/80 text-rose-800 dark:text-rose-200 text-xs space-y-1">
          <p className="font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            Warning: Irreversible Deletion
          </p>
          <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
            You are about to permanently delete{" "}
            <strong>
              {currentCount} {entityName}
            </strong>
            . This cannot be undone automatically once cleared from local storage.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting || currentCount === 0}
            onClick={handleConfirm}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs shadow-md shadow-rose-600/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isDeleting
                ? "Deleting..."
                : `Confirm Delete (${formatNumber(currentCount)})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function SingleDeleteModal({
  isOpen,
  onClose,
  title,
  itemName,
  onConfirm,
  isDeleting = false,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  itemName: string;
  onConfirm: () => Promise<void>;
  isDeleting?: boolean;
}) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 !mt-0 z-[120] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900/60 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-600 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-slate-100">
                {title || "Confirm Delete"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Are you sure you want to delete this record?
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/80 text-rose-800 dark:text-rose-200 text-xs">
          <p className="font-semibold text-rose-900 dark:text-rose-200 break-words">
            &ldquo;{itemName}&rdquo;
          </p>
          <p className="text-[11px] text-rose-700 dark:text-rose-300 mt-1">
            This action cannot be undone automatically once removed from the database.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs shadow-md shadow-rose-600/30 flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isDeleting ? "Deleting..." : "Delete Permanently"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkDeleteModal;
