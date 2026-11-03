"use client";

import React from "react";
import { Calendar, Filter, RotateCcw } from "lucide-react";
import {
  DateFilterState,
  DateRangePreset,
  getDateFilterDescription,
} from "@/lib/dateFilter";

interface DateRangeFilterBarProps {
  filter: DateFilterState;
  onChange: (filter: DateFilterState) => void;
  count?: number;
  label?: string;
  className?: string;
  compact?: boolean;
}

export function DateRangeFilterBar({
  filter,
  onChange,
  count,
  label = "Date Filter",
  className = "",
  compact = false,
}: DateRangeFilterBarProps) {
  const currentMonth = new Date().toISOString().slice(0, 7);

  const setPreset = (preset: DateRangePreset) => {
    onChange({
      ...filter,
      preset,
      customMonth: filter.customMonth || currentMonth,
    });
  };

  const handleCustomMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filter,
      preset: "custom_month",
      customMonth: e.target.value,
    });
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filter,
      preset: "custom_range",
      startDate: e.target.value,
    });
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({
      ...filter,
      preset: "custom_range",
      endDate: e.target.value,
    });
  };

  const clearCustomDates = () => {
    onChange({
      preset: "all",
      startDate: "",
      endDate: "",
      customMonth: currentMonth,
    });
  };

  // Compact Mode (Ideal for headers or secondary filter rows)
  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <select
            value={filter.preset}
            onChange={(e) => setPreset(e.target.value as DateRangePreset)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Time</option>
            <option value="today">Today (Daily)</option>
            <option value="weekly">This Week (Weekly)</option>
            <option value="monthly">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="custom_month">Select Specific Month...</option>
            <option value="custom_range">Custom Date Range...</option>
          </select>
        </div>

        {filter.preset === "custom_month" && (
          <input
            type="month"
            value={filter.customMonth || currentMonth}
            onChange={handleCustomMonthChange}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        )}

        {filter.preset === "custom_range" && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              type="date"
              value={filter.startDate || ""}
              onChange={handleStartDateChange}
              placeholder="From"
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px]"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={filter.endDate || ""}
              onChange={handleEndDateChange}
              placeholder="To"
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-mono text-[11px]"
            />
            {(filter.startDate || filter.endDate) && (
              <button
                type="button"
                onClick={clearCustomDates}
                className="p-1 text-rose-500 hover:text-rose-700"
                title="Reset Dates"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {typeof count === "number" && (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold ml-auto">
            {count} records
          </span>
        )}
      </div>
    );
  }

  // Full Rich Pills & Date Bar
  return (
    <div className={`space-y-2.5 ${className}`}>
      {/* Preset Buttons Bar (Mobile Optimized Wrapping - No horizontal scroll) */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
          <Filter className="w-3.5 h-3.5 text-teal-600 shrink-0" />
          <span>{label}:</span>
        </span>

        <button
          type="button"
          onClick={() => setPreset("all")}
          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all text-xs ${
            filter.preset === "all"
              ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          All Time
        </button>

        <button
          type="button"
          onClick={() => setPreset("today")}
          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all text-xs ${
            filter.preset === "today"
              ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          Today <span className="hidden sm:inline">(Daily)</span>
        </button>

        <button
          type="button"
          onClick={() => setPreset("weekly")}
          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all text-xs ${
            filter.preset === "weekly"
              ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          Weekly
        </button>

        <button
          type="button"
          onClick={() => setPreset("monthly")}
          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all text-xs ${
            filter.preset === "monthly"
              ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          This Month
        </button>

        <button
          type="button"
          onClick={() => setPreset("last_month")}
          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all text-xs ${
            filter.preset === "last_month"
              ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          Last Month
        </button>

        <button
          type="button"
          onClick={() => setPreset("custom_month")}
          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all text-xs flex items-center gap-1.5 ${
            filter.preset === "custom_month"
              ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>Custom Month</span>
        </button>

        <button
          type="button"
          onClick={() => setPreset("custom_range")}
          className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all text-xs flex items-center gap-1.5 ${
            filter.preset === "custom_range"
              ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
              : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          }`}
        >
          <Calendar className="w-3.5 h-3.5 shrink-0" />
          <span>Custom Dates</span>
        </button>

        {typeof count === "number" && (
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold ml-auto shrink-0 self-center">
            {count} found
          </span>
        )}
      </div>

      {/* Expanded Custom Month Picker */}
      {filter.preset === "custom_month" && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs animate-in fade-in">
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="font-bold text-slate-700 dark:text-slate-300 text-xs">Select Month &amp; Year:</span>
            <input
              type="month"
              value={filter.customMonth || currentMonth}
              onChange={handleCustomMonthChange}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs w-full sm:w-auto"
            />
          </div>
          <span className="text-[11px] text-slate-500">
            Active: <strong>{getDateFilterDescription(filter)}</strong>
          </span>
        </div>
      )}

      {/* Expanded Custom Date Range Picker */}
      {filter.preset === "custom_range" && (
        <div className="flex flex-wrap items-center gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 text-xs animate-in fade-in">
          <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
            <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] shrink-0">From:</span>
            <input
              type="date"
              value={filter.startDate || ""}
              onChange={handleStartDateChange}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs w-full"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-1 min-w-[140px]">
            <span className="font-bold text-slate-700 dark:text-slate-300 text-[11px] shrink-0">To:</span>
            <input
              type="date"
              value={filter.endDate || ""}
              onChange={handleEndDateChange}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 text-xs w-full"
            />
          </div>

          {(filter.startDate || filter.endDate) && (
            <button
              type="button"
              onClick={clearCustomDates}
              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline py-1 px-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/30"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default DateRangeFilterBar;
