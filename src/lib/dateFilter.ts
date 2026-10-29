/**
 * Universal Date Filtering Utilities for Noxderma ERP
 * Supports Daily (Today), Weekly, Monthly (This Month), Last Month,
 * Custom Month, and Custom Date Range filtering across all ERP modules.
 */

export type DateRangePreset =
  | "all"
  | "today"
  | "weekly"
  | "monthly"
  | "last_month"
  | "custom_month"
  | "custom_range";

export interface DateFilterState {
  preset: DateRangePreset;
  startDate?: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD"
  customMonth?: string; // "YYYY-MM"
}

export function createDefaultDateFilter(
  defaultPreset: DateRangePreset = "all"
): DateFilterState {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  return {
    preset: defaultPreset,
    startDate: "",
    endDate: "",
    customMonth: currentMonth,
  };
}

/**
 * Checks if a given timestamp or date string falls within the selected date filter.
 * Accurately parses ISO strings, date strings, timestamps, and YYYY-MM strings.
 */
export function isRecordInDateRange(
  dateInput: string | number | Date | null | undefined,
  filter: DateFilterState
): boolean {
  if (!filter || filter.preset === "all") return true;
  if (!dateInput) return false;

  let targetDate: Date;

  if (typeof dateInput === "number") {
    targetDate = new Date(dateInput);
  } else if (dateInput instanceof Date) {
    targetDate = dateInput;
  } else if (typeof dateInput === "string") {
    const trimmed = dateInput.trim();
    if (!trimmed) return false;

    // Check if format is "YYYY-MM" (e.g., staff salary period)
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      targetDate = new Date(`${trimmed}-15T12:00:00`);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      targetDate = new Date(`${trimmed}T12:00:00`);
    } else {
      targetDate = new Date(trimmed);
    }
  } else {
    return false;
  }

  const targetTime = targetDate.getTime();
  if (isNaN(targetTime)) return false;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currentDate = now.getDate();

  switch (filter.preset) {
    case "today": {
      const startOfToday = new Date(currentYear, currentMonth, currentDate, 0, 0, 0, 0).getTime();
      const endOfToday = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999).getTime();
      return targetTime >= startOfToday && targetTime <= endOfToday;
    }

    case "weekly": {
      // Past 7 days (including today)
      const sevenDaysAgo = new Date(currentYear, currentMonth, currentDate - 6, 0, 0, 0, 0).getTime();
      const endOfToday = new Date(currentYear, currentMonth, currentDate, 23, 59, 59, 999).getTime();
      return targetTime >= sevenDaysAgo && targetTime <= endOfToday;
    }

    case "monthly": {
      // Current calendar month (from 1st to last millisecond of current month)
      return (
        targetDate.getFullYear() === currentYear &&
        targetDate.getMonth() === currentMonth
      );
    }

    case "last_month": {
      const lastMonthNum = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      return (
        targetDate.getFullYear() === lastMonthYear &&
        targetDate.getMonth() === lastMonthNum
      );
    }

    case "custom_month": {
      if (!filter.customMonth) return true;
      const [yStr, mStr] = filter.customMonth.split("-");
      const targetYear = parseInt(yStr, 10);
      const targetMonthIdx = parseInt(mStr, 10) - 1;
      if (isNaN(targetYear) || isNaN(targetMonthIdx)) return true;
      return (
        targetDate.getFullYear() === targetYear &&
        targetDate.getMonth() === targetMonthIdx
      );
    }

    case "custom_range": {
      if (filter.startDate) {
        const startTime = new Date(`${filter.startDate}T00:00:00`).getTime();
        if (!isNaN(startTime) && targetTime < startTime) return false;
      }
      if (filter.endDate) {
        const endTime = new Date(`${filter.endDate}T23:59:59.999`).getTime();
        if (!isNaN(endTime) && targetTime > endTime) return false;
      }
      return true;
    }

    default:
      return true;
  }
}

/**
 * Returns a clean, human-readable summary of the active date filter.
 */
export function getDateFilterDescription(filter: DateFilterState): string {
  if (!filter || filter.preset === "all") return "All Time";
  if (filter.preset === "today") return "Today";
  if (filter.preset === "weekly") return "Past 7 Days (Weekly)";
  if (filter.preset === "monthly") {
    return new Date().toLocaleString("en-PK", { month: "long", year: "numeric" });
  }
  if (filter.preset === "last_month") {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toLocaleString("en-PK", { month: "long", year: "numeric" });
  }
  if (filter.preset === "custom_month") {
    if (!filter.customMonth) return "Custom Month";
    const [y, m] = filter.customMonth.split("-");
    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1);
    return isNaN(d.getTime()) ? filter.customMonth : d.toLocaleString("en-PK", { month: "long", year: "numeric" });
  }
  if (filter.preset === "custom_range") {
    if (filter.startDate && filter.endDate) {
      return `${filter.startDate} to ${filter.endDate}`;
    }
    if (filter.startDate) return `From ${filter.startDate}`;
    if (filter.endDate) return `Until ${filter.endDate}`;
    return "Custom Date Range";
  }
  return "All Time";
}

/**
 * Computes breakdown counts for deletion/filter criteria (selected, today, weekly, monthly, custom, all).
 */
export function computeDateScopeCounts<T>(
  items: T[],
  getDateFn: (item: T) => string | number | Date | null | undefined,
  selectedCount = 0,
  customStart?: string,
  customEnd?: string
): {
  selected: number;
  today: number;
  weekly: number;
  monthly: number;
  custom: number;
  all: number;
} {
  let today = 0;
  let weekly = 0;
  let monthly = 0;
  let custom = 0;

  const todayFilter: DateFilterState = { preset: "today" };
  const weeklyFilter: DateFilterState = { preset: "weekly" };
  const monthlyFilter: DateFilterState = { preset: "monthly" };
  const customFilter: DateFilterState = {
    preset: "custom_range",
    startDate: customStart,
    endDate: customEnd,
  };

  for (const item of items) {
    const d = getDateFn(item);
    if (isRecordInDateRange(d, todayFilter)) today++;
    if (isRecordInDateRange(d, weeklyFilter)) weekly++;
    if (isRecordInDateRange(d, monthlyFilter)) monthly++;
    if (customStart || customEnd) {
      if (isRecordInDateRange(d, customFilter)) custom++;
    }
  }

  return {
    selected: selectedCount,
    today,
    weekly,
    monthly,
    custom,
    all: items.length,
  };
}

/**
 * Returns the subset of items that match a given deletion or action scope.
 */
export function getItemsInScope<T>(
  items: T[],
  scope: "selected" | "today" | "weekly" | "monthly" | "custom" | "all",
  getDateFn: (item: T) => string | number | Date | null | undefined,
  getIdFn: (item: T) => string | number,
  selectedIds: (string | number)[],
  customStart?: string,
  customEnd?: string
): T[] {
  if (scope === "selected") {
    const selectedSet = new Set(selectedIds.map(String));
    return items.filter((item) => selectedSet.has(String(getIdFn(item))));
  }
  if (scope === "all") {
    return items;
  }
  const filter: DateFilterState = {
    preset: scope === "custom" ? "custom_range" : (scope as DateRangePreset),
    startDate: customStart,
    endDate: customEnd,
  };
  return items.filter((item) => isRecordInDateRange(getDateFn(item), filter));
}


