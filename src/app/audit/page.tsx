"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  History,
  ShieldCheck,
  Undo2,
  Search,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  RotateCcw,
  ArrowLeft,
  Eye,
  X,
  Lock,
  Check,
  RefreshCw,
  ArrowRight,
  Trash2,
  Calendar,
  Filter,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { type LocalAuditLog } from "@/lib/offline/db";
import {
  getAuditLogs,
  undoActivity,
  seedInitialAuditLogsIfEmpty,
  deleteAuditLogEntries,
  clearAllAuditLogs,
} from "@/lib/audit/auditTracker";
import { formatKarachiDate } from "@/lib/formatting";
import {
  formatNameWithRole,
  getUserRoleLabel,
  isRoleRedundantForName,
  normalizeUserDisplayName,
} from "@/types";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";

interface FieldDiffRow {
  field: string;
  before: string;
  after: string;
}

type DateRangeOption = "all" | "today" | "weekly" | "monthly" | "custom";
type DeleteScopeOption = "selected" | "today" | "weekly" | "monthly" | "custom" | "all";

function formatActionMeta(action: string): { label: string; badgeClass: string } {
  const normalized = (action || "").toLowerCase();
  if (normalized === "create") {
    return {
      label: "CREATED",
      badgeClass:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60",
    };
  }
  if (normalized === "update") {
    return {
      label: "EDITED",
      badgeClass:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/60",
    };
  }
  if (normalized === "delete") {
    return {
      label: "DELETED",
      badgeClass:
        "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/60",
    };
  }
  if (normalized === "undo") {
    return {
      label: "UNDONE",
      badgeClass:
        "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200/70 dark:border-purple-800/60",
    };
  }
  return {
    label: (action || "EVENT").toUpperCase(),
    badgeClass:
      "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700",
  };
}

function formatEntityMeta(entityType: string): { label: string; badgeClass: string } {
  const normalized = (entityType || "").toLowerCase();
  if (normalized === "visit" || normalized === "customervisit") {
    return {
      label: "VISIT",
      badgeClass: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300",
    };
  }
  if (normalized === "invoice") {
    return {
      label: "INVOICE",
      badgeClass: "bg-teal-50 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300",
    };
  }
  if (normalized === "customer") {
    return {
      label: "CUSTOMER",
      badgeClass: "bg-blue-50 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300",
    };
  }
  if (normalized === "product") {
    return {
      label: "MEDICINE",
      badgeClass: "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300",
    };
  }
  if (normalized === "payment") {
    return {
      label: "PAYMENT",
      badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300",
    };
  }
  if (normalized === "inventory_batch") {
    return {
      label: "STOCK BATCH",
      badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-950/80 dark:text-amber-300",
    };
  }
  return {
    label: (entityType || "SYSTEM").replace(/_/g, " ").toUpperCase(),
    badgeClass: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
}

function stringifyDiffValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (Array.isArray(val)) {
    if (val.length === 0) return "None";
    if (typeof val[0] === "string" || typeof val[0] === "number") {
      return val.join(", ");
    }
    return `${val.length} item(s)`;
  }
  if (typeof val === "object") {
    try {
      const str = JSON.stringify(val);
      return str.length > 140 ? str.slice(0, 137) + "..." : str;
    } catch {
      return "[Object]";
    }
  }
  return String(val);
}

function humanizeFieldKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function extractLogFieldDiffs(log: LocalAuditLog): FieldDiffRow[] {
  const latestVisitEdit = log.snapshotAfter?.editHistory?.[0];
  if (
    log.action === "update" &&
    Array.isArray(latestVisitEdit?.changes) &&
    latestVisitEdit.changes.length > 0
  ) {
    return latestVisitEdit.changes.map((c: any) => ({
      field: String(c.label || c.field || "Field"),
      before: String(c.before ?? "—"),
      after: String(c.after ?? "—"),
    }));
  }

  if (
    log.snapshotBefore &&
    log.snapshotAfter &&
    typeof log.snapshotBefore === "object" &&
    typeof log.snapshotAfter === "object"
  ) {
    const beforeObj =
      log.snapshotBefore.product && typeof log.snapshotBefore.product === "object"
        ? { ...log.snapshotBefore.product, ...(log.snapshotBefore.pricing || {}) }
        : log.snapshotBefore;
    const afterObj =
      log.snapshotAfter.product && typeof log.snapshotAfter.product === "object"
        ? { ...log.snapshotAfter.product, ...(log.snapshotAfter.pricing || {}) }
        : log.snapshotAfter;

    const ignoredKeys = new Set([
      "updatedAt",
      "createdAt",
      "editHistory",
      "editCount",
      "lastEditedBy",
      "lastEditedByRole",
      "images",
    ]);

    const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
    const diffs: FieldDiffRow[] = [];

    for (const key of keys) {
      if (ignoredKeys.has(key)) continue;
      const bStr = stringifyDiffValue(beforeObj[key]);
      const aStr = stringifyDiffValue(afterObj[key]);
      if (bStr !== aStr) {
        diffs.push({
          field: humanizeFieldKey(key),
          before: bStr,
          after: aStr,
        });
      }
    }
    return diffs;
  }

  return [];
}

/**
 * Checks whether an ISO timestamp matches a selected date range.
 */
function matchesDateRange(
  timestamp: string | number | Date,
  range: DateRangeOption,
  customStart?: string,
  customEnd?: string
): boolean {
  if (range === "all") return true;
  const time = new Date(timestamp).getTime();
  if (isNaN(time)) return false;

  const now = new Date();

  if (range === "today") {
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    ).getTime();
    const endOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999
    ).getTime();
    return time >= startOfToday && time <= endOfToday;
  }

  if (range === "weekly") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime();
    return time >= sevenDaysAgo;
  }

  if (range === "monthly") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).getTime();
    return time >= thirtyDaysAgo;
  }

  if (range === "custom") {
    if (customStart) {
      const s = new Date(customStart + "T00:00:00").getTime();
      if (!isNaN(s) && time < s) return false;
    }
    if (customEnd) {
      const e = new Date(customEnd + "T23:59:59.999").getTime();
      if (!isNaN(e) && time > e) return false;
    }
    return true;
  }

  return true;
}

export default function AuditLogsPage() {
  const { currentUser, hasPermission } = useAuth();
  const [logs, setLogs] = useState<LocalAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeOption>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "undone"

  // Multi-Selection State
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);

  // Bulk Delete Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteScope, setDeleteScope] = useState<DeleteScopeOption>("selected");
  const [modalCustomStart, setModalCustomStart] = useState("");
  const [modalCustomEnd, setModalCustomEnd] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Undo confirmation modal state
  const [undoTargetLog, setUndoTargetLog] = useState<LocalAuditLog | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Snapshot / Diff Inspector modal state
  const [inspectLog, setInspectLog] = useState<LocalAuditLog | null>(null);

  // Strictly enforce owner permissions
  const isOwner = hasPermission("audit:view");
  const canPerformUndo = hasPermission("audit:undo");

  const loadLogs = async () => {
    setLoading(true);
    try {
      await seedInitialAuditLogsIfEmpty();
      const records = await getAuditLogs();
      setLogs(records);
    } catch (err) {
      console.error("Failed to load audit history:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOwner) {
      loadLogs();
    } else {
      setLoading(false);
    }
  }, [isOwner]);

  // Execute single log undo action
  const handleExecuteUndo = async () => {
    if (!undoTargetLog || !currentUser || !canPerformUndo) return;
    setIsUndoing(true);
    try {
      const res = await undoActivity(undoTargetLog.id, {
        id: currentUser.id,
        displayName: currentUser.displayName,
        role: currentUser.role,
      });

      if (res.success) {
        setNotification({ type: "success", message: res.message });
        setUndoTargetLog(null);
        setInspectLog(null);
        await loadLogs();
      } else {
        setNotification({ type: "error", message: res.message });
      }
    } catch (err: any) {
      setNotification({
        type: "error",
        message: "Failed to undo action: " + (err.message || "Unknown error"),
      });
    } finally {
      setIsUndoing(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          l.userName.toLowerCase().includes(q) ||
          (l.entityTitle && l.entityTitle.toLowerCase().includes(q)) ||
          l.details.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          l.entityType.toLowerCase().includes(q) ||
          l.entityId.toLowerCase().includes(q);
        if (!matches) return false;
      }

      if (actionFilter !== "all" && l.action.toLowerCase() !== actionFilter.toLowerCase()) {
        return false;
      }

      if (entityFilter !== "all") {
        const typeLower = l.entityType.toLowerCase();
        if (entityFilter === "visit") {
          if (typeLower !== "visit" && typeLower !== "customervisit") return false;
        } else if (typeLower !== entityFilter.toLowerCase()) {
          return false;
        }
      }

      if (statusFilter === "active" && l.isUndone) return false;
      if (statusFilter === "undone" && !l.isUndone) return false;

      if (!matchesDateRange(l.timestamp, dateRangeFilter, customStartDate, customEndDate)) {
        return false;
      }

      return true;
    });
  }, [logs, search, actionFilter, entityFilter, statusFilter, dateRangeFilter, customStartDate, customEndDate]);

  // Selection helpers
  const toggleSelectLog = (id: string) => {
    setSelectedLogIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const isAllFilteredSelected =
    filteredLogs.length > 0 && filteredLogs.every((l) => selectedLogIds.includes(l.id));

  const toggleSelectAllFiltered = () => {
    if (isAllFilteredSelected) {
      const filteredSet = new Set(filteredLogs.map((l) => l.id));
      setSelectedLogIds((prev) => prev.filter((id) => !filteredSet.has(id)));
    } else {
      const combined = Array.from(new Set([...selectedLogIds, ...filteredLogs.map((l) => l.id)]));
      setSelectedLogIds(combined);
    }
  };

  const clearSelection = () => {
    setSelectedLogIds([]);
  };

  // Helper to determine target logs for deletion given a scope
  const getTargetLogsForScope = (
    scope: DeleteScopeOption,
    start?: string,
    end?: string
  ): LocalAuditLog[] => {
    if (scope === "selected") {
      const selectedSet = new Set(selectedLogIds);
      return logs.filter((l) => selectedSet.has(l.id));
    }
    if (scope === "all") {
      return logs;
    }
    return logs.filter((l) => matchesDateRange(l.timestamp, scope as any, start, end));
  };

  // Counts for delete modal options
  const deleteScopeCounts = useMemo(() => {
    const selectedCount = logs.filter((l) => selectedLogIds.includes(l.id)).length;
    const todayCount = logs.filter((l) => matchesDateRange(l.timestamp, "today")).length;
    const weeklyCount = logs.filter((l) => matchesDateRange(l.timestamp, "weekly")).length;
    const monthlyCount = logs.filter((l) => matchesDateRange(l.timestamp, "monthly")).length;
    const customCount = logs.filter((l) =>
      matchesDateRange(
        l.timestamp,
        "custom",
        modalCustomStart || customStartDate,
        modalCustomEnd || customEndDate
      )
    ).length;
    const allCount = logs.length;
    return {
      selected: selectedCount,
      today: todayCount,
      weekly: weeklyCount,
      monthly: monthlyCount,
      custom: customCount,
      all: allCount,
    };
  }, [logs, selectedLogIds, modalCustomStart, modalCustomEnd, customStartDate, customEndDate]);

  // Open delete modal with intelligent pre-selected scope
  const handleOpenDeleteModal = (scope?: DeleteScopeOption) => {
    if (scope) {
      setDeleteScope(scope);
    } else if (selectedLogIds.length > 0) {
      setDeleteScope("selected");
    } else if (dateRangeFilter !== "all") {
      setDeleteScope(dateRangeFilter);
    } else {
      setDeleteScope("today");
    }
    setModalCustomStart(customStartDate);
    setModalCustomEnd(customEndDate);
    setDeleteModalOpen(true);
  };

  // Execute deletion across chosen criteria
  const handleExecuteDelete = async () => {
    if (!isOwner) return;
    setIsDeleting(true);
    try {
      const targets = getTargetLogsForScope(
        deleteScope,
        modalCustomStart || customStartDate,
        modalCustomEnd || customEndDate
      );
      const targetIds = targets.map((l) => l.id);

      if (targetIds.length === 0) {
        setNotification({
          type: "error",
          message: "No logs found matching the selected criteria to delete.",
        });
        setDeleteModalOpen(false);
        return;
      }

      if (deleteScope === "all") {
        await clearAllAuditLogs();
      } else {
        await deleteAuditLogEntries(targetIds);
      }

      const targetSet = new Set(targetIds);
      setSelectedLogIds((prev) => prev.filter((id) => !targetSet.has(id)));
      setNotification({
        type: "success",
        message: `Permanently deleted ${targetIds.length} audit log ${
          targetIds.length === 1 ? "entry" : "entries"
        }.`,
      });
      setDeleteModalOpen(false);
      await loadLogs();
    } catch (err: any) {
      setNotification({
        type: "error",
        message: "Failed to delete audit logs: " + (err.message || "Unknown error"),
      });
    } finally {
      setIsDeleting(false);
      setTimeout(() => setNotification(null), 5000);
    }
  };

  // Export logs to CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = [
      "Log ID",
      "Date & Time",
      "Staff Member",
      "Role",
      "Action",
      "Module",
      "Target Title",
      "Details",
      "Status",
    ];
    const rows = filteredLogs.map((l) => [
      l.id,
      `"${formatKarachiDate(l.timestamp, true)}"`,
      `"${normalizeUserDisplayName(l.userName, "Owner").replace(/"/g, '""')}"`,
      `"${getUserRoleLabel(l.userRole || "staff")}"`,
      l.action.toUpperCase(),
      formatEntityMeta(l.entityType).label,
      `"${(l.entityTitle || "").replace(/"/g, '""')}"`,
      `"${(l.details || "").replace(/\r?\n/g, " | ").replace(/"/g, '""')}"`,
      l.isUndone ? "UNDONE" : "ACTIVE",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Noxderma_Activity_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Statistics
  const stats = useMemo(() => {
    const total = logs.length;
    const undoable = logs.filter((l) => l.canUndo && !l.isUndone).length;
    const undoneCount = logs.filter((l) => l.isUndone).length;
    const uniqueUsers = new Set(
      logs.map((l) => normalizeUserDisplayName(l.userName, "Owner"))
    ).size;
    return { total, undoable, undoneCount, uniqueUsers };
  }, [logs]);

  // =========================================================================
  // ACCESS DENIED VIEW: NON-AUTHORIZED BARRIER (100% ENGLISH)
  // =========================================================================
  if (!isOwner) {
    return (
      <div className="max-w-xl mx-auto py-12 sm:py-16 px-4 overflow-x-hidden">
        <div className="p-6 sm:p-8 rounded-3xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8 text-rose-600" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              Restricted Module
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Owner Access Only
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              This Activity Log &amp; Audit Tracker module is strictly restricted to the business
              owner and authorized auditors. Your account does not have permission to view audit
              logs.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left text-xs space-y-1.5">
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Current Logged-in User:</span>
              <strong className="text-slate-900 dark:text-slate-100 break-words text-right">
                {normalizeUserDisplayName(currentUser?.displayName, "Staff")}
              </strong>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">Assigned Role:</span>
              <span className="font-mono font-bold uppercase text-amber-600">
                {getUserRoleLabel(currentUser?.role || "staff")}
              </span>
            </div>
          </div>

          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs shadow-md transition-all btn-interactive"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Main Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 w-full max-w-7xl mx-auto pb-20 overflow-x-hidden">
      {/* ========================================================================= */}
      {/* OFFICIAL PRINT-ONLY HEADER (CLEAN A4 AUDIT SHEET) */}
      <OfficialPrintHeader
        title="Owner Audit Ledger"
        subtitle="Master Activity History & Audit Tracking Report • CONFIDENTIAL"
        metaItems={[
          {
            label: "Audited By",
            value: formatNameWithRole(currentUser?.displayName, currentUser?.role || "Owner"),
          },
        ]}
        className="mb-6"
      />

      {/* Screen Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 sm:gap-4 no-print border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Link
              href="/"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 shrink-0"
              aria-label="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 inline-flex items-center gap-1.5 border border-purple-200 dark:border-purple-800">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span>Owner Security Vault</span>
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 sm:w-7 sm:h-7 text-teal-600 shrink-0" />
            <span className="break-words">Activity Log &amp; Audit Tracker</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
            Detailed audit trail across doctor visits, invoices, customers, payments, and stock—with
            filters, selective purging, and instant single-click <strong>Undo Action</strong> recovery.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 w-full sm:w-auto shrink-0">
          <button
            type="button"
            onClick={() => handleOpenDeleteModal()}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 bg-rose-50/80 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-bold text-xs shadow-sm transition-all btn-interactive"
            title="Bulk Delete / Purge Audit Logs"
          >
            <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="truncate">Delete Logs</span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-xs shadow-sm transition-all btn-interactive"
          >
            <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 shrink-0" />
            <span className="truncate">Print</span>
          </button>
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-xs shadow-sm transition-all btn-interactive"
          >
            <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 shrink-0" />
            <span className="truncate">Export CSV</span>
          </button>
          <button
            type="button"
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-2.5 sm:px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition-all btn-interactive disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${loading ? "animate-spin" : ""}`}
            />
            <span className="truncate">Refresh</span>
          </button>
        </div>
      </div>

      {/* Floating Notification */}
      {notification && (
        <div
          className={`p-3.5 sm:p-4 rounded-2xl border text-xs sm:text-sm flex items-start sm:items-center gap-3 animate-in fade-in slide-in-from-top-2 no-print ${
            notification.type === "success"
              ? "bg-teal-50 dark:bg-teal-950/70 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200"
              : "bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0 mt-0.5 sm:mt-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5 sm:mt-0" />
          )}
          <span className="font-semibold break-words min-w-0">{notification.message}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 no-print">
        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft min-w-0">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate">
              Total Actions
            </span>
            <History className="w-4 h-4 text-teal-600 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100">
            {stats.total}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block truncate">
            Recorded in audit vault
          </span>
        </div>

        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft min-w-0">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate">
              Undoable
            </span>
            <Undo2 className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400">
            {stats.undoable}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block truncate">
            Ready to revert anytime
          </span>
        </div>

        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft min-w-0">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate">
              Reverted
            </span>
            <RotateCcw className="w-4 h-4 text-purple-600 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-purple-600 dark:text-purple-400">
            {stats.undoneCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block truncate">
            Undone by owner
          </span>
        </div>

        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft min-w-0">
          <div className="flex items-center justify-between gap-2 text-slate-500 mb-1.5 sm:mb-2">
            <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider truncate">
              Users Tracked
            </span>
            <User className="w-4 h-4 text-blue-600 shrink-0" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100">
            {stats.uniqueUsers}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block truncate">
            Distinct active accounts
          </span>
        </div>
      </div>

      {/* Multi-Selection Action Bar (Visible when 1+ logs are selected) */}
      {selectedLogIds.length > 0 && isOwner && (
        <div className="sticky top-2 z-30 p-3 sm:p-3.5 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white shadow-xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 no-print border border-slate-700">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-6 h-6 rounded-lg bg-teal-500 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
              {selectedLogIds.length}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-100 truncate">
              {selectedLogIds.length} log {selectedLogIds.length === 1 ? "entry" : "entries"} selected
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleSelectAllFiltered}
              className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors btn-interactive"
            >
              {isAllFilteredSelected ? "Deselect All Visible" : `Select All Visible (${filteredLogs.length})`}
            </button>

            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors btn-interactive"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={() => handleOpenDeleteModal("selected")}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm transition-colors btn-interactive inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Delete Selected ({selectedLogIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-3 no-print">
        {/* Quick Date Range Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5 py-0.5 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-teal-600 shrink-0" /> Date Criteria:
            </span>
            <button
              type="button"
              onClick={() => setDateRangeFilter("all")}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs ${
                dateRangeFilter === "all"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>All Time</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10">
                {logs.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDateRangeFilter("today")}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs ${
                dateRangeFilter === "today"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>Today</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10">
                {deleteScopeCounts.today}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDateRangeFilter("weekly")}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs ${
                dateRangeFilter === "weekly"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>Weekly</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10">
                {deleteScopeCounts.weekly}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDateRangeFilter("monthly")}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs ${
                dateRangeFilter === "monthly"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>Monthly</span>
              <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10">
                {deleteScopeCounts.monthly}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setDateRangeFilter("custom")}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 text-xs ${
                dateRangeFilter === "custom"
                  ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Custom Dates</span>
              {(customStartDate || customEndDate) && (
                <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-black/10 dark:bg-white/10">
                  {deleteScopeCounts.custom}
                </span>
              )}
            </button>
          </div>

          {/* Quick Contextual Delete for Current Filter */}
          <div className="shrink-0 flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleOpenDeleteModal(dateRangeFilter === "all" ? "all" : dateRangeFilter)}
              className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900 font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-sm"
              title="Delete logs matching this criteria"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>
                {dateRangeFilter === "all"
                  ? "Delete All"
                  : dateRangeFilter === "today"
                  ? "Delete Today"
                  : dateRangeFilter === "weekly"
                  ? "Delete Weekly"
                  : dateRangeFilter === "monthly"
                  ? "Delete Monthly"
                  : "Delete Custom Range"}
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {/* Search */}
          <div className="relative min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search user, visit, medicine, bill #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full min-h-[42px] pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 font-medium"
            />
          </div>

          {/* Date Range Filter Dropdown */}
          <div className="min-w-0">
            <select
              value={dateRangeFilter}
              onChange={(e) => setDateRangeFilter(e.target.value as DateRangeOption)}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Time (All Dates)</option>
              <option value="today">Today</option>
              <option value="weekly">Weekly (Last 7 Days)</option>
              <option value="monthly">Monthly (Last 30 Days)</option>
              <option value="custom">Custom Date Range...</option>
            </select>
          </div>

          {/* Action Filter */}
          <div className="min-w-0">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Actions</option>
              <option value="create">Created (New Entries)</option>
              <option value="update">Edited (Modifications)</option>
              <option value="delete">Deleted (Removals)</option>
              <option value="undo">Undone (Reverted)</option>
            </select>
          </div>

          {/* Module / Entity Filter */}
          <div className="min-w-0">
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Modules</option>
              <option value="visit">Doctor &amp; Field Visits</option>
              <option value="invoice">Customer Invoices</option>
              <option value="customer">Customers &amp; Stores</option>
              <option value="product">Medicines &amp; Catalog</option>
              <option value="payment">Payments &amp; Receipts</option>
              <option value="inventory_batch">Warehouse Batches</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="min-w-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Actions</option>
              <option value="undone">Already Undone</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range Picker Row (shown when Custom is active) */}
        {dateRangeFilter === "custom" && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="font-bold text-slate-700 dark:text-slate-300">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
              <span className="font-bold text-slate-700 dark:text-slate-300">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            {(customStartDate || customEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className="text-[11px] font-bold text-rose-600 hover:underline ml-auto"
              >
                Clear Custom Dates
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <span>
            Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong>{" "}
            recorded actions
          </span>
          {(search ||
            dateRangeFilter !== "all" ||
            customStartDate ||
            customEndDate ||
            actionFilter !== "all" ||
            entityFilter !== "all" ||
            statusFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setDateRangeFilter("all");
                setCustomStartDate("");
                setCustomEndDate("");
                setActionFilter("all");
                setEntityFilter("all");
                setStatusFilter("all");
              }}
              className="text-teal-600 hover:underline font-bold"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Main Audit Logs Container: Dedicated Mobile Cards + Desktop/Print Table */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft overflow-hidden min-w-0">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-bold text-sm">Loading activity audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-10 sm:p-12 text-center text-slate-400 space-y-3">
            <History className="w-12 h-12 mx-auto opacity-30 text-teal-600" />
            <p className="font-bold text-base text-slate-700 dark:text-slate-300">
              No matching activity records found
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Any actions performed across visits, billing, customer accounts, or inventory will be
              automatically recorded here.
            </p>
          </div>
        ) : (
          <>
            {/* =============================================================== */}
            {/* MOBILE VERTICAL CARD FEED (< md): ZERO HORIZONTAL SCROLL        */}
            {/* =============================================================== */}
            <div className="block md:hidden print:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((log) => {
                const isUndone = Boolean(log.isUndone);
                const canUndo = canPerformUndo && log.canUndo && !isUndone;
                const actionMeta = formatActionMeta(log.action);
                const entityMeta = formatEntityMeta(log.entityType);
                const cleanLogName = normalizeUserDisplayName(log.userName, "Owner");
                const cleanLogRole = getUserRoleLabel(log.userRole || "staff");
                const showRolePill = !isRoleRedundantForName(cleanLogName, cleanLogRole);
                const isSelected = selectedLogIds.includes(log.id);

                return (
                  <div
                    key={log.id}
                    className={`p-3.5 sm:p-4 space-y-2.5 w-full min-w-0 transition-colors ${
                      isSelected
                        ? "bg-teal-50/40 dark:bg-teal-950/30 border-l-4 border-teal-500"
                        : isUndone
                        ? "bg-slate-50/60 dark:bg-slate-900/40 opacity-85"
                        : "bg-white dark:bg-slate-900"
                    }`}
                  >
                    {/* Row 1: Checkbox + Action, Module, and Status Badges */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLog(log.id)}
                            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                          />
                          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {isSelected ? "Selected" : "Select"}
                          </span>
                        </label>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${actionMeta.badgeClass}`}
                        >
                          {actionMeta.label}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${entityMeta.badgeClass}`}
                        >
                          {entityMeta.label}
                        </span>
                      </div>

                      {isUndone ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                          <Check className="w-3 h-3 shrink-0" />
                          <span>UNDONE</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {/* Row 2: Target Item Title */}
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 break-words leading-snug">
                        {log.entityTitle || log.entityId}
                      </h3>
                    </div>

                    {/* Row 3: Staff Member & Timestamp */}
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-5 h-5 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-[10px] text-slate-700 dark:text-slate-300 shrink-0">
                          {cleanLogName.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {cleanLogName}
                        </span>
                        {showRolePill && (
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400 shrink-0">
                            {cleanLogRole}
                          </span>
                        )}
                      </div>

                      <div className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>{formatKarachiDate(log.timestamp, true)}</span>
                      </div>
                    </div>

                    {/* Row 4: Full Wrapped Action Details */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/90 space-y-1.5 min-w-0">
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed break-words whitespace-pre-line">
                        {log.details}
                      </p>
                      {isUndone && log.undoneBy && (
                        <div className="flex items-start gap-1.5 pt-1 border-t border-purple-200/50 dark:border-purple-900/50 text-[11px] font-bold text-purple-700 dark:text-purple-300">
                          <RotateCcw className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span className="break-words">
                            Undone by {normalizeUserDisplayName(log.undoneBy, "Owner")} on{" "}
                            {formatKarachiDate(log.undoneAt || "", true)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Row 5: Mobile Action Buttons (Details + Undo Action) */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setInspectLog(log)}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-xs btn-interactive"
                      >
                        <Eye className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                        <span>View Details</span>
                      </button>

                      {canUndo ? (
                        <button
                          type="button"
                          onClick={() => setUndoTargetLog(log)}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-extrabold text-xs shadow-sm transition-all btn-interactive"
                        >
                          <Undo2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Undo Action</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-semibold px-2 py-1">
                          {isUndone ? "Reverted" : "No Undo"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* =============================================================== */}
            {/* DESKTOP & PRINT TABLE VIEW (md+ and print)                      */}
            {/* =============================================================== */}
            <div className="hidden md:block print:block overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 print:bg-slate-100 print:text-black">
                  <tr>
                    <th className="p-3.5 w-10 text-center no-print">
                      <input
                        type="checkbox"
                        aria-label="Select all visible logs"
                        checked={isAllFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3.5">Action &amp; Timestamp</th>
                    <th className="p-3.5">Staff Member</th>
                    <th className="p-3.5">Target &amp; Module</th>
                    <th className="p-3.5">Action Details</th>
                    <th className="p-3.5 text-center">Status</th>
                    <th className="p-3.5 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-300">
                  {filteredLogs.map((log) => {
                    const isUndone = Boolean(log.isUndone);
                    const canUndo = canPerformUndo && log.canUndo && !isUndone;
                    const actionMeta = formatActionMeta(log.action);
                    const entityMeta = formatEntityMeta(log.entityType);
                    const cleanLogName = normalizeUserDisplayName(log.userName, "Owner");
                    const cleanLogRole = getUserRoleLabel(log.userRole || "staff");
                    const isSelected = selectedLogIds.includes(log.id);

                    return (
                      <tr
                        key={log.id}
                        className={`transition-colors ${
                          isSelected
                            ? "bg-teal-50/50 dark:bg-teal-950/30"
                            : isUndone
                            ? "bg-slate-50/50 dark:bg-slate-900/30 opacity-75"
                            : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3.5 w-10 text-center align-top no-print">
                          <input
                            type="checkbox"
                            aria-label={`Select log ${log.id}`}
                            checked={isSelected}
                            onChange={() => toggleSelectLog(log.id)}
                            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer mt-1"
                          />
                        </td>

                        {/* Action & Date */}
                        <td className="p-3.5 align-top whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider w-max ${actionMeta.badgeClass}`}
                            >
                              {actionMeta.label}
                            </span>
                            <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                              {formatKarachiDate(log.timestamp, true)}
                            </span>
                          </div>
                        </td>

                        {/* Staff Member */}
                        <td className="p-3.5 align-top">
                          <div className="flex items-start gap-2">
                            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-black text-xs text-slate-600 dark:text-slate-300 shrink-0">
                              {cleanLogName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 dark:text-slate-100 block text-xs sm:text-sm">
                                {cleanLogName}
                              </span>
                              {!isRoleRedundantForName(cleanLogName, cleanLogRole) && (
                                <span className="text-[10px] font-mono uppercase text-slate-400 block">
                                  {cleanLogRole}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Target Item & Module */}
                        <td className="p-3.5 align-top">
                          <div className="space-y-1 max-w-[220px]">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${entityMeta.badgeClass}`}
                            >
                              {entityMeta.label}
                            </span>
                            <span className="font-extrabold text-slate-900 dark:text-slate-100 block text-xs sm:text-sm break-words">
                              {log.entityTitle || log.entityId}
                            </span>
                          </div>
                        </td>

                        {/* Details of action */}
                        <td className="p-3.5 align-top">
                          <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed max-w-md break-words whitespace-pre-line">
                            {log.details}
                          </p>
                          {isUndone && log.undoneBy && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 dark:text-purple-300 mt-1">
                              <RotateCcw className="w-3 h-3 shrink-0" />
                              <span>
                                Undone by {normalizeUserDisplayName(log.undoneBy, "Owner")} on{" "}
                                {formatKarachiDate(log.undoneAt || "", true)}
                              </span>
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="p-3.5 text-center align-top whitespace-nowrap">
                          {isUndone ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                              <Check className="w-3 h-3" />
                              UNDONE
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              ACTIVE
                            </span>
                          )}
                        </td>

                        {/* Undo / Inspect Actions */}
                        <td className="p-3.5 text-right align-top no-print whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setInspectLog(log)}
                              title="Inspect Audit Details & Snapshots"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs btn-interactive"
                            >
                              <Eye className="w-3.5 h-3.5 text-teal-600" />
                              <span>Details</span>
                            </button>

                            {canUndo ? (
                              <button
                                type="button"
                                onClick={() => setUndoTargetLog(log)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-extrabold text-xs shadow-sm transition-all btn-interactive"
                                title="Undo this action"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                <span>Undo Action</span>
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-semibold px-2">
                                {isUndone ? "Reverted" : "No Undo"}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* BULK DELETE / PURGE MODAL (ALL-TIME, TODAY, WEEKLY, MONTHLY, CUSTOM, SEL) */}
      {/* ========================================================================= */}
      {deleteModalOpen && isOwner && (
        <div className="fixed inset-0 !mt-0 z-[120] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-card-hover max-w-lg w-full p-5 sm:p-6 space-y-4 animate-in zoom-in-95 overflow-x-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 dark:bg-rose-950 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    Delete Audit History Logs
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select criteria to permanently purge recorded activity logs.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scope Selection Options */}
            <div className="space-y-2 pt-1">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Choose Deletion Range / Criteria:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* 1. Selected */}
                <button
                  type="button"
                  disabled={deleteScopeCounts.selected === 0}
                  onClick={() => setDeleteScope("selected")}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    deleteScope === "selected"
                      ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                      : deleteScopeCounts.selected === 0
                      ? "opacity-50 border-slate-200 dark:border-slate-800 text-slate-400 cursor-not-allowed"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="font-extrabold flex items-center justify-between">
                    <span>Selected Logs</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                      {deleteScopeCounts.selected}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Checked items only
                  </span>
                </button>

                {/* 2. Today */}
                <button
                  type="button"
                  onClick={() => setDeleteScope("today")}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    deleteScope === "today"
                      ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="font-extrabold flex items-center justify-between">
                    <span>Today&apos;s Logs</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                      {deleteScopeCounts.today}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Recorded today
                  </span>
                </button>

                {/* 3. Weekly */}
                <button
                  type="button"
                  onClick={() => setDeleteScope("weekly")}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    deleteScope === "weekly"
                      ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="font-extrabold flex items-center justify-between">
                    <span>Weekly Logs</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                      {deleteScopeCounts.weekly}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Past 7 days
                  </span>
                </button>

                {/* 4. Monthly */}
                <button
                  type="button"
                  onClick={() => setDeleteScope("monthly")}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    deleteScope === "monthly"
                      ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="font-extrabold flex items-center justify-between">
                    <span>Monthly Logs</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                      {deleteScopeCounts.monthly}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Past 30 days
                  </span>
                </button>

                {/* 5. Custom Date Range */}
                <button
                  type="button"
                  onClick={() => setDeleteScope("custom")}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    deleteScope === "custom"
                      ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="font-extrabold flex items-center justify-between">
                    <span>Custom Date Range</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                      {deleteScopeCounts.custom}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Selected dates
                  </span>
                </button>

                {/* 6. All Time */}
                <button
                  type="button"
                  onClick={() => setDeleteScope("all")}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    deleteScope === "all"
                      ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 font-bold"
                      : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  <span className="font-extrabold flex items-center justify-between">
                    <span>All Time (Purge All)</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border">
                      {deleteScopeCounts.all}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500 mt-1">
                    Entire history
                  </span>
                </button>
              </div>
            </div>

            {/* Custom Date Pickers inside modal */}
            {deleteScope === "custom" && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300 block">
                  Select Custom Dates to Delete:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={modalCustomStart}
                      onChange={(e) => setModalCustomStart(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-1">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={modalCustomEnd}
                      onChange={(e) => setModalCustomEnd(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Warning and Confirmation Info */}
            <div className="p-3.5 rounded-2xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 text-xs space-y-2 text-rose-900 dark:text-rose-200">
              <div className="flex items-center justify-between font-black">
                <span>Logs targeted for deletion:</span>
                <span className="font-mono text-base px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800">
                  {deleteScopeCounts[deleteScope]}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300">
                <strong>Permanent Removal:</strong> These logs will be deleted from IndexedDB storage
                and synchronized with Cloud Firestore. Once deleted, this activity history cannot be
                reverted using Undo.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={isDeleting}
                className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 btn-interactive"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={
                  isDeleting ||
                  deleteScopeCounts[deleteScope] === 0 ||
                  (deleteScope === "custom" && !modalCustomStart && !modalCustomEnd)
                }
                className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-extrabold text-xs shadow-md shadow-rose-600/30 transition-all btn-interactive inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Deleting Logs...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Permanently Delete ({deleteScopeCounts[deleteScope]})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UNDO CONFIRMATION MODAL (100% ENGLISH & MOBILE-RESPONSIVE)                */}
      {/* ========================================================================= */}
      {undoTargetLog && (
        <div className="fixed inset-0 !mt-0 z-[110] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-card-hover max-w-lg w-full p-5 sm:p-7 space-y-4 sm:space-y-5 animate-in zoom-in-95 overflow-x-hidden">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center shrink-0">
                  <Undo2 className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    Undo This Action?
                  </h3>
                  <p className="text-xs text-slate-500">
                    Confirm reverting this recorded action to its previous state.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUndoTargetLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs space-y-2 text-slate-800 dark:text-slate-200">
              <div className="flex justify-between gap-3 py-0.5 border-b border-amber-200/50 dark:border-amber-800/50">
                <span className="font-bold text-slate-500 shrink-0">Target Item:</span>
                <span className="font-black text-slate-900 dark:text-slate-100 text-right break-words">
                  {undoTargetLog.entityTitle || undoTargetLog.entityId}
                </span>
              </div>
              <div className="flex justify-between gap-3 py-0.5 border-b border-amber-200/50 dark:border-amber-800/50">
                <span className="font-bold text-slate-500 shrink-0">Module:</span>
                <span className="font-bold uppercase text-right">
                  {formatEntityMeta(undoTargetLog.entityType).label}
                </span>
              </div>
              <div className="flex justify-between gap-3 py-0.5 border-b border-amber-200/50 dark:border-amber-800/50">
                <span className="font-bold text-slate-500 shrink-0">Performed By:</span>
                <span className="font-bold text-right break-words">
                  {formatNameWithRole(undoTargetLog.userName, undoTargetLog.userRole)}
                </span>
              </div>
              <div className="flex justify-between gap-3 py-0.5 border-b border-amber-200/50 dark:border-amber-800/50">
                <span className="font-bold text-slate-500 shrink-0">Action Type:</span>
                <span className="font-mono font-black uppercase text-amber-700 dark:text-amber-300">
                  {formatActionMeta(undoTargetLog.action).label}
                </span>
              </div>
              <div className="pt-1">
                <span className="font-bold text-slate-500 block mb-0.5">Recorded Details:</span>
                <p className="text-slate-700 dark:text-slate-300 font-medium break-words whitespace-pre-line">
                  {undoTargetLog.details}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
              <strong className="text-slate-900 dark:text-slate-100">Automatic Rollback:</strong>{" "}
              Undoing this action restores the previous database record (including visit history,
              batch stock quantities, and customer account balances) and syncs automatically to the
              cloud database.
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setUndoTargetLog(null)}
                disabled={isUndoing}
                className="w-full sm:w-auto min-h-[42px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 dark:hover:bg-slate-800 btn-interactive"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteUndo}
                disabled={isUndoing}
                className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-xs shadow-md shadow-amber-600/30 transition-all btn-interactive inline-flex items-center justify-center gap-1.5"
              >
                {isUndoing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Reverting Action...</span>
                  </>
                ) : (
                  <>
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Undo Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SNAPSHOT & FIELD DIFF VIEWER MODAL (MOBILE-OPTIMIZED)                     */}
      {/* ========================================================================= */}
      {inspectLog && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-card-hover max-w-2xl w-full p-4 sm:p-6 space-y-4 animate-in zoom-in-95 max-h-[88vh] flex flex-col overflow-x-hidden">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      Audit Entry Inspector
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        formatActionMeta(inspectLog.action).badgeClass
                      }`}
                    >
                      {formatActionMeta(inspectLog.action).label}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        formatEntityMeta(inspectLog.entityType).badgeClass
                      }`}
                    >
                      {formatEntityMeta(inspectLog.entityType).label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 break-words mt-0.5">
                    {inspectLog.entityTitle || inspectLog.entityId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto overflow-x-hidden space-y-4 flex-1 pr-0.5 text-xs min-w-0">
              {/* Summary Block */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                  Recorded Summary
                </span>
                <p className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed break-words whitespace-pre-line">
                  {inspectLog.details}
                </p>
                <div className="text-[11px] text-slate-400 pt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    By{" "}
                    <strong className="text-slate-700 dark:text-slate-200">
                      {formatNameWithRole(inspectLog.userName, inspectLog.userRole)}
                    </strong>
                  </span>
                  <span>•</span>
                  <span className="font-mono">{formatKarachiDate(inspectLog.timestamp, true)}</span>
                </div>
                {inspectLog.isUndone && inspectLog.undoneBy && (
                  <div className="pt-1.5 text-[11px] font-bold text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span className="break-words">
                      Reverted by {normalizeUserDisplayName(inspectLog.undoneBy, "Owner")} on{" "}
                      {formatKarachiDate(inspectLog.undoneAt || "", true)}
                    </span>
                  </div>
                )}
              </div>

              {/* Structured Field-by-Field Diffs (if available) */}
              {(() => {
                const diffs = extractLogFieldDiffs(inspectLog);
                if (diffs.length === 0) return null;
                return (
                  <div className="space-y-2">
                    <span className="font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider text-[11px] block">
                      Field-by-Field Changes ({diffs.length})
                    </span>
                    <div className="space-y-2">
                      {diffs.map((d, idx) => (
                        <div
                          key={`${d.field}_${idx}`}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 space-y-1.5"
                        >
                          <div className="font-extrabold text-slate-800 dark:text-slate-200 text-xs">
                            {d.field}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            <div className="p-2 rounded-lg bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/50 min-w-0">
                              <span className="text-[10px] font-black uppercase text-rose-600 dark:text-rose-400 block mb-0.5">
                                Before
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 break-words block">
                                {d.before}
                              </span>
                            </div>
                            <div className="p-2 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/50 min-w-0">
                              <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mb-0.5">
                                <ArrowRight className="w-3 h-3" />
                                After
                              </span>
                              <span className="text-slate-800 dark:text-slate-100 font-semibold break-words block">
                                {d.after}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {inspectLog.snapshotBefore && (
                <div className="min-w-0">
                  <span className="font-black text-rose-600 dark:text-rose-400 uppercase tracking-wider text-[11px] block mb-1">
                    Previous State (Snapshot Before Action)
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-950 text-rose-200 font-mono text-[11px] whitespace-pre-wrap break-all overflow-y-auto max-h-48 border border-slate-800">
                    {JSON.stringify(inspectLog.snapshotBefore, null, 2)}
                  </pre>
                </div>
              )}

              {inspectLog.snapshotAfter && (
                <div className="min-w-0">
                  <span className="font-black text-teal-600 dark:text-teal-400 uppercase tracking-wider text-[11px] block mb-1">
                    Updated State (Snapshot After Action)
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-950 text-teal-300 font-mono text-[11px] whitespace-pre-wrap break-all overflow-y-auto max-h-48 border border-slate-800">
                    {JSON.stringify(inspectLog.snapshotAfter, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-end gap-2">
              {canPerformUndo && inspectLog.canUndo && !inspectLog.isUndone && (
                <button
                  type="button"
                  onClick={() => setUndoTargetLog(inspectLog)}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs shadow-sm btn-interactive"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  <span>Undo This Action</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setInspectLog(null)}
                className="min-h-[38px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs btn-interactive"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Sign-offs for Print View */}
      <div className="hidden print:grid grid-cols-3 gap-6 pt-16 text-center text-xs text-black">
        <div className="border-t border-black pt-2">
          <strong>Prepared By</strong>
          <p className="text-[10px] text-slate-600 mt-0.5">Audit Clerk / System Log</p>
        </div>
        <div className="border-t border-black pt-2">
          <strong>Security Officer</strong>
          <p className="text-[10px] text-slate-600 mt-0.5">Data Integrity Verified</p>
        </div>
        <div className="border-t border-black pt-2">
          <strong>Owner Signature</strong>
          <p className="text-[10px] text-slate-600 mt-0.5">Approved &amp; Reviewed</p>
        </div>
      </div>
    </div>
  );
}
