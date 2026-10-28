"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  History,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Search,
  Filter,
  Printer,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  FileText,
  RotateCcw,
  ArrowLeft,
  Eye,
  X,
  Lock,
  Layers,
  Sparkles,
  Building,
  CreditCard,
  Pill,
  Trash2,
  Check,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { offlineDb, type LocalAuditLog } from "@/lib/offline/db";
import {
  getAuditLogs,
  undoActivity,
  seedInitialAuditLogsIfEmpty,
} from "@/lib/audit/auditTracker";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";

export default function AuditLogsPage() {
  const { currentUser, hasPermission } = useAuth();
  const [logs, setLogs] = useState<LocalAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "active" | "undone"

  // Undo confirmation modal state
  const [undoTargetLog, setUndoTargetLog] = useState<LocalAuditLog | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Snapshot / Diff Inspector modal state
  const [inspectLog, setInspectLog] = useState<LocalAuditLog | null>(null);

  // Check if current user is owner or authorized administrator
  const isOwner =
    currentUser?.role === "owner" ||
    currentUser?.role === "admin" ||
    hasPermission("audit:view");

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

  // Execute undo action
  const handleExecuteUndo = async () => {
    if (!undoTargetLog || !currentUser) return;
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

  // Export logs to CSV
  const handleExportCSV = () => {
    if (logs.length === 0) return;
    const headers = ["Log ID", "Date Time", "Staff Member", "Role", "Action", "Module", "Target Title", "Details", "Status"];
    const rows = filteredLogs.map((l) => [
      l.id,
      formatKarachiDate(l.timestamp, true),
      l.userName,
      l.userRole || "staff",
      l.action.toUpperCase(),
      l.entityType,
      `"${(l.entityTitle || "").replace(/"/g, '""')}"`,
      `"${(l.details || "").replace(/"/g, '""')}"`,
      l.isUndone ? "UNDONE" : "ACTIVE",
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Noxderma_Activity_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered logs
  const filteredLogs = useMemo(() => {
    return logs.filter((l) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matches =
          l.userName.toLowerCase().includes(q) ||
          (l.entityTitle && l.entityTitle.toLowerCase().includes(q)) ||
          l.details.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          l.entityId.toLowerCase().includes(q);
        if (!matches) return false;
      }

      // Action Filter
      if (actionFilter !== "all" && l.action.toLowerCase() !== actionFilter.toLowerCase()) {
        return false;
      }

      // Entity Filter
      if (entityFilter !== "all" && l.entityType.toLowerCase() !== entityFilter.toLowerCase()) {
        return false;
      }

      // Status Filter
      if (statusFilter === "active" && l.isUndone) return false;
      if (statusFilter === "undone" && !l.isUndone) return false;

      return true;
    });
  }, [logs, search, actionFilter, entityFilter, statusFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = logs.length;
    const undoable = logs.filter((l) => l.canUndo && !l.isUndone).length;
    const undoneCount = logs.filter((l) => l.isUndone).length;
    const uniqueUsers = new Set(logs.map((l) => l.userName)).size;
    return { total, undoable, undoneCount, uniqueUsers };
  }, [logs]);

  // =========================================================================
  // ACCESS DENIED VIEW: NON-OWNER BARRIER
  // =========================================================================
  if (!isOwner) {
    return (
      <div className="max-w-xl mx-auto py-16 px-4">
        <div className="p-8 rounded-3xl border border-rose-200 dark:border-rose-900/50 bg-white dark:bg-slate-900 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto shadow-inner">
            <Lock className="w-8 h-8 text-rose-600" />
          </div>

          <div className="space-y-2">
            <span className="inline-block px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
              Restricted Module
            </span>
            <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
              Owner Access Only (صرف مالک کی رسائی)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
              Yeh Activity History aur Audit Tracker module sirf company owner / proprietor ke liye makhsoos hai. Staff accounts ya booking users ko yahan rasai ki ijazat nahi hai.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-slate-500">Current Logged-in User:</span>
              <strong className="text-slate-900 dark:text-slate-100">{currentUser?.displayName || "Guest Staff"}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Assigned Role:</span>
              <span className="font-mono font-bold uppercase text-amber-600">{currentUser?.role || "staff"}</span>
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
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* ========================================================================= */}
      {/* OFFICIAL PRINT-ONLY HEADER (CLEAN A4 AUDIT SHEET)                        */}
      {/* ========================================================================= */}
      <div className="hidden print:block border-b-2 border-black pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight text-black">
              NOXDERMA PHARMACEUTICALS
            </h1>
            <p className="text-xs text-black font-semibold">
              Master Activity History & Audit Tracking Report
            </p>
            <p className="text-[11px] text-slate-700 mt-0.5">
              CONFIDENTIAL: Strictly Restricted to Business Owner / Proprietor
            </p>
          </div>
          <div className="text-right text-xs text-black">
            <span className="inline-block px-2.5 py-1 rounded border border-black font-black uppercase mb-1">
              Owner Audit Ledger
            </span>
            <p><strong>Printed On:</strong> {formatKarachiDate(new Date(), true)}</p>
            <p><strong>Audited By:</strong> {currentUser?.displayName} (Owner)</p>
          </div>
        </div>
      </div>

      {/* Screen Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print border-b border-slate-200/80 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Link
              href="/"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 flex items-center gap-1.5 border border-purple-200 dark:border-purple-800">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              Owner Security Vault
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <History className="w-7 h-7 text-teal-600" />
            Activity Log & Action Tracker (ہسٹری)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Track who performed which action across invoices, customers, and stock—with instant single-click <strong>UNDO</strong> capability.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-xs shadow-sm transition-all btn-interactive"
          >
            <Printer className="w-4 h-4 text-slate-500" />
            <span>Print Report</span>
          </button>
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-xs shadow-sm transition-all btn-interactive"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={loadLogs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition-all btn-interactive disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Floating Notification */}
      {notification && (
        <div
          className={`p-4 rounded-2xl border text-xs sm:text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 no-print ${
            notification.type === "success"
              ? "bg-teal-50 dark:bg-teal-950/70 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200"
              : "bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <span className="font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4 no-print">
        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Total Actions</span>
            <History className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100">
            {stats.total}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Staff actions recorded</span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Undoable Actions</span>
            <Undo2 className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-600 dark:text-amber-400">
            {stats.undoable}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Can be reverted right now</span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Actions Reverted</span>
            <RotateCcw className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-purple-600 dark:text-purple-400">
            {stats.undoneCount}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Successfully undone by owner</span>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider">Staff Tracked</span>
            <User className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100">
            {stats.uniqueUsers}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Different users in activity log</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-3 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search user, action, medicine, bill #..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500 font-medium"
            />
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
            >
              <option value="all">⚡ All Actions (تمام کارروائیاں)</option>
              <option value="create">➕ Creation (نیا اندراج)</option>
              <option value="update">✏️ Modifications (ترمیم)</option>
              <option value="delete">🗑️ Deletions (حذف شدہ)</option>
              <option value="undo">↩️ Reverted Undos (واپس شدہ)</option>
            </select>
          </div>

          {/* Module / Entity Filter */}
          <div>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
            >
              <option value="all">📦 All Modules (تمام ماڈیولز)</option>
              <option value="invoice">🧾 Customer Invoices (بلز)</option>
              <option value="customer">🏥 Customers & Stores (کسٹمرز)</option>
              <option value="product">💊 Medicines & Catalog (ادویات)</option>
              <option value="payment">💵 Payments & Receipts (ادائیگیاں)</option>
              <option value="inventory_batch">📦 Warehouse Batches (بیچز)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
            >
              <option value="all">🔍 All Statuses (تمام ریکارڈز)</option>
              <option value="active">🟢 Active Actions (فعال)</option>
              <option value="undone">↩️ Already Undone (واپس ہو چکا)</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800/80">
          <span>
            Showing <strong>{filteredLogs.length}</strong> of <strong>{logs.length}</strong> recorded actions
          </span>
          {(search || actionFilter !== "all" || entityFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => {
                setSearch("");
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

      {/* Main Table / Timeline View */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-bold text-sm">Loading activity audit logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <History className="w-12 h-12 mx-auto opacity-30 text-teal-600" />
            <p className="font-bold text-base text-slate-700 dark:text-slate-300">
              No matching activity records found
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Any actions performed by staff across billing, customer khata, or inventory will be automatically recorded here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 print:bg-slate-100 print:text-black">
                <tr>
                  <th className="p-3.5">Action & Timestamp</th>
                  <th className="p-3.5">Staff Member (کس نے کیا)</th>
                  <th className="p-3.5">Target & Module</th>
                  <th className="p-3.5">Action Details (کیا کیا گیا)</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5 text-right no-print">Undo Option</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-300">
                {filteredLogs.map((log) => {
                  const isUndone = log.isUndone;
                  const canUndo = log.canUndo && !isUndone;

                  // Action badge styling
                  let actionColor = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                  let actionLabel = log.action.toUpperCase();
                  if (log.action === "create") {
                    actionColor = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300";
                    actionLabel = "NEW / تخلیق";
                  } else if (log.action === "update") {
                    actionColor = "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300";
                    actionLabel = "EDIT / ترمیم";
                  } else if (log.action === "delete") {
                    actionColor = "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300";
                    actionLabel = "DELETE / حذف";
                  } else if (log.action === "undo") {
                    actionColor = "bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300";
                    actionLabel = "UNDO / بحالی";
                  }

                  // Entity badge
                  const entityBadge =
                    log.entityType === "invoice"
                      ? "bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                      : log.entityType === "customer"
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                      : log.entityType === "product"
                      ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      : log.entityType === "payment"
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

                  return (
                    <tr
                      key={log.id}
                      className={`transition-colors ${
                        isUndone
                          ? "bg-slate-50/50 dark:bg-slate-900/30 opacity-75"
                          : "hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      {/* Action & Date */}
                      <td className="p-3.5 align-top">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider w-max ${actionColor}`}
                          >
                            {actionLabel}
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
                            {log.userName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 block text-xs sm:text-sm">
                              {log.userName}
                            </span>
                            <span className="text-[10px] font-mono uppercase text-slate-400 block">
                              {log.userRole || "staff"}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Target Item & Module */}
                      <td className="p-3.5 align-top">
                        <div className="space-y-1">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${entityBadge}`}
                          >
                            {log.entityType}
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100 block text-xs sm:text-sm truncate max-w-[200px]">
                            {log.entityTitle || log.entityId}
                          </span>
                        </div>
                      </td>

                      {/* Details of action */}
                      <td className="p-3.5 align-top">
                        <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed max-w-md">
                          {log.details}
                        </p>
                        {isUndone && log.undoneBy && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-700 dark:text-purple-300 mt-1">
                            <RotateCcw className="w-3 h-3" />
                            Undone by {log.undoneBy} on {formatKarachiDate(log.undoneAt || "", true)}
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3.5 text-center align-top">
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
                      <td className="p-3.5 text-right align-top no-print">
                        <div className="flex items-center justify-end gap-1.5">
                          {(log.snapshotBefore || log.snapshotAfter) && (
                            <button
                              type="button"
                              onClick={() => setInspectLog(log)}
                              title="Inspect Snapshot Details"
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 btn-interactive"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}

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
        )}
      </div>

      {/* ========================================================================= */}
      {/* UNDO CONFIRMATION MODAL                                                   */}
      {/* ========================================================================= */}
      {undoTargetLog && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-card-hover max-w-lg w-full p-6 sm:p-7 space-y-5 animate-in zoom-in-95">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center shrink-0">
                  <Undo2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                    Undo This Action? (کارروائی واپس کریں)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Are you sure you want to revert this staff action?
                  </p>
                </div>
              </div>
              <button
                onClick={() => setUndoTargetLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs space-y-2 text-slate-800 dark:text-slate-200">
              <div className="flex justify-between py-0.5 border-b border-amber-200/50">
                <span className="font-bold text-slate-500">Target Item:</span>
                <span className="font-black text-slate-900 dark:text-slate-100">
                  {undoTargetLog.entityTitle || undoTargetLog.entityId}
                </span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-amber-200/50">
                <span className="font-bold text-slate-500">Performed By:</span>
                <span className="font-bold">{undoTargetLog.userName} ({undoTargetLog.userRole})</span>
              </div>
              <div className="flex justify-between py-0.5 border-b border-amber-200/50">
                <span className="font-bold text-slate-500">Action:</span>
                <span className="font-mono font-black uppercase text-amber-700">{undoTargetLog.action}</span>
              </div>
              <div className="pt-1">
                <span className="font-bold text-slate-500 block mb-0.5">What was done:</span>
                <p className="text-slate-700 dark:text-slate-300 font-medium">
                  {undoTargetLog.details}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
              <strong className="text-slate-900 dark:text-slate-100">Automatic Adjustment:</strong> Undoing this action will restore previous database records, restore batch inventory quantities, and adjust customer khata accordingly.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setUndoTargetLog(null)}
                disabled={isUndoing}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-50 btn-interactive"
              >
                Cancel (منسوخ کریں)
              </button>
              <button
                type="button"
                onClick={handleExecuteUndo}
                disabled={isUndoing}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-extrabold text-xs shadow-md shadow-amber-600/30 transition-all btn-interactive flex items-center gap-1.5"
              >
                {isUndoing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Reverting Action...</span>
                  </>
                ) : (
                  <>
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Confirm & Undo Now (واپس کریں)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SNAPSHOT & DIFF VIEWER MODAL                                              */}
      {/* ========================================================================= */}
      {inspectLog && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-card-hover max-w-2xl w-full p-6 space-y-4 animate-in zoom-in-95 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Activity Snapshot Inspector
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {inspectLog.entityTitle || inspectLog.entityId} ({inspectLog.entityType})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setInspectLog(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto space-y-4 flex-1 pr-1 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1">
                <span className="font-bold text-slate-500">Summary:</span>
                <p className="font-medium text-slate-800 dark:text-slate-200">{inspectLog.details}</p>
                <div className="text-[11px] text-slate-400 pt-1">
                  Recorded by <strong>{inspectLog.userName}</strong> on {formatKarachiDate(inspectLog.timestamp, true)}
                </div>
              </div>

              {inspectLog.snapshotBefore && (
                <div>
                  <span className="font-black text-rose-600 block mb-1">
                    Previous State (Snapshot Before Action):
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
                    {JSON.stringify(inspectLog.snapshotBefore, null, 2)}
                  </pre>
                </div>
              )}

              {inspectLog.snapshotAfter && (
                <div>
                  <span className="font-black text-teal-600 block mb-1">
                    New State (Snapshot After Action):
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-950 text-teal-300 font-mono text-[11px] overflow-x-auto max-h-48 border border-slate-800">
                    {JSON.stringify(inspectLog.snapshotAfter, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setInspectLog(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
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
          <strong>Proprietor / Owner Signature</strong>
          <p className="text-[10px] text-slate-600 mt-0.5">Approved & Reviewed</p>
        </div>
      </div>
    </div>
  );
}
