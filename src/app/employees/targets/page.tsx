"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Target,
  Plus,
  Search,
  Filter,
  UserCheck,
  TrendingUp,
  Award,
  DollarSign,
  Percent,
  CheckCircle2,
  Calendar,
  Building2,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import {
  BulkDeleteModal,
  SingleDeleteModal,
  type DeleteScopeType,
} from "@/components/common/BulkDeleteModal";
import {
  computeDateScopeCounts,
  getItemsInScope,
} from "@/lib/dateFilter";

interface RepTarget {
  id: string;
  repName: string;
  territory: string;
  month: string;
  monthlyQuotaPkr: number;
  achievedSalesPkr: number;
  visitedPharmaciesCount: number;
  targetVisitsCount: number;
  commissionRatePercent: number;
  status: "on_track" | "ahead" | "behind";
  createdAt?: string;
}

export default function SalesTargetsPage() {
  const { currentUser } = useAuth();
  const [targets, setTargets] = useState<RepTarget[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("October 2026");
  const [isSettingTarget, setIsSettingTarget] = useState(false);

  // Multi-Selection & Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState<RepTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [repName, setRepName] = useState("");
  const [territory, setTerritory] = useState("");
  const [quota, setQuota] = useState(0);
  const [targetVisits, setTargetVisits] = useState(0);

  useEffect(() => {
    async function loadTargets() {
      try {
        const dbTargets = await (offlineDb as any).employeeTargets?.toArray();
        if (dbTargets && dbTargets.length > 0) {
          setTargets(dbTargets as RepTarget[]);
          return;
        }
      } catch {
        // fallback
      }

      const saved = localStorage.getItem("noxderma_rep_targets");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setTargets(parsed);
          } else {
            setTargets([]);
          }
        } catch {
          setTargets([]);
        }
      } else {
        setTargets([]);
      }
    }
    loadTargets();
  }, []);

  const saveTargets = async (updated: RepTarget[]) => {
    setTargets(updated);
    localStorage.setItem("noxderma_rep_targets", JSON.stringify(updated));
    try {
      if ((offlineDb as any).employeeTargets) {
        await (offlineDb as any).employeeTargets.clear();
        if (updated.length > 0) {
          await (offlineDb as any).employeeTargets.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync employeeTargets to offlineDb:", err);
    }
  };

  const handleSetTarget = async (e: React.FormEvent) => {
    e.preventDefault();
    const newTarget: RepTarget = {
      id: `target_${Date.now()}`,
      repName,
      territory,
      month: selectedMonth,
      monthlyQuotaPkr: Number(quota),
      achievedSalesPkr: 0,
      visitedPharmaciesCount: 0,
      targetVisitsCount: Number(targetVisits),
      commissionRatePercent: 2.5,
      status: "behind",
      createdAt: new Date().toISOString(),
    };

    const nextList = [newTarget, ...targets];
    await saveTargets(nextList);
    await recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      userEmail: currentUser?.email,
      action: "create",
      entityType: "employee_target",
      entityId: newTarget.id,
      entityTitle: `${newTarget.repName} - ${newTarget.month}`,
      details: `Created monthly sales target for ${newTarget.repName} (${formatPKR(newTarget.monthlyQuotaPkr)}).`,
      snapshotAfter: newTarget,
      canUndo: true,
    });
    setIsSettingTarget(false);
  };

  const filtered = targets.filter(
    (t) =>
      t.repName.toLowerCase().includes(search.toLowerCase()) ||
      t.territory.toLowerCase().includes(search.toLowerCase())
  );

  const scopeCounts = useMemo(() => {
    return computeDateScopeCounts(
      targets,
      (t) => t.createdAt || t.month,
      selectedIds.length
    );
  }, [targets, selectedIds.length]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((t) => t.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExecuteBulkDelete = async (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => {
    try {
      setIsDeleting(true);
      const toDelete = getItemsInScope(
        targets,
        scope,
        (t) => t.createdAt || t.month,
        (t) => t.id,
        selectedIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        setNotice({ type: "error", text: "No matching targets found to delete." });
        setIsDeleting(false);
        setDeleteModalOpen(false);
        return;
      }

      const deleteIds = new Set(toDelete.map((t) => t.id));
      const remaining = targets.filter((t) => !deleteIds.has(t.id));
      await saveTargets(remaining);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "employee_target",
        entityId: Array.from(deleteIds).slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} sales target(s)`,
        details: `Purged ${toDelete.length} target(s) under criteria scope: ${scope}.`,
        snapshotBefore: toDelete,
        canUndo: false,
      });

      setSelectedIds([]);
      setDeleteModalOpen(false);
      setNotice({
        type: "success",
        text: `Successfully deleted ${toDelete.length} sales target(s).`,
      });
    } catch (err: any) {
      console.error("Bulk delete targets failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete targets." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteSingleDelete = async () => {
    if (!deletingTarget) return;
    try {
      setIsDeleting(true);
      const remaining = targets.filter((t) => t.id !== deletingTarget.id);
      await saveTargets(remaining);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "employee_target",
        entityId: deletingTarget.id,
        entityTitle: `${deletingTarget.repName} - ${deletingTarget.month}`,
        details: `Deleted sales target for ${deletingTarget.repName} (${deletingTarget.month}).`,
        snapshotBefore: deletingTarget,
        canUndo: true,
      });

      setSelectedIds((prev) => prev.filter((id) => id !== deletingTarget.id));
      setDeletingTarget(null);
      setNotice({
        type: "success",
        text: `Deleted target for "${deletingTarget.repName}".`,
      });
    } catch (err: any) {
      console.error("Single delete target failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete target." });
    } finally {
      setIsDeleting(false);
    }
  };

  const totalQuota = targets.reduce((sum, t) => sum + t.monthlyQuotaPkr, 0);
  const totalAchieved = targets.reduce((sum, t) => sum + t.achievedSalesPkr, 0);
  const overallAchievementPercent =
    totalQuota > 0 ? Math.round((totalAchieved / totalQuota) * 100) : 0;

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-semibold animate-in fade-in ${
            notice.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Field Staff
            </span>
            <span className="text-xs text-slate-400">Monthly Targets & Commission</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Sales Staff Monthly Targets & Performance
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Delete with scope criteria"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete / Purge</span>
          </button>

          <button
            onClick={() => setIsSettingTarget(true)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
          >
            <Plus className="w-4 h-4" /> Set Monthly Target
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Sales Target ({selectedMonth})
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalQuota)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">For all {targets.length} areas</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Total Sales Done So Far
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600">
            {formatPKR(totalAchieved)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {overallAchievementPercent}% target completed
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Staff Commission Earned
          </span>
          <span className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
            {formatPKR(
              targets.reduce(
                (sum, t) => sum + (t.achievedSalesPkr * t.commissionRatePercent) / 100,
                0
              )
            )}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Commission for staff this month</span>
        </div>
      </div>

      {/* Rep Performance Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="w-10 p-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filtered.length && filtered.length > 0}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    title="Select All"
                  />
                </th>
                <th className="p-2.5">Staff Name & Area</th>
                <th className="p-2.5 text-right">Target (Hadaf)</th>
                <th className="p-2.5 text-right">Sales Done</th>
                <th className="p-2.5 text-center">Progress</th>
                <th className="p-2.5 text-right">Visits Done / Goal</th>
                <th className="p-2.5 text-right">Commission</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((t) => {
                const pct = Math.round((t.achievedSalesPkr / t.monthlyQuotaPkr) * 100);
                const comm = (t.achievedSalesPkr * t.commissionRatePercent) / 100;
                const isSelected = selectedIds.includes(t.id);

                return (
                  <tr
                    key={t.id}
                    className={`transition-colors ${
                      isSelected
                        ? "bg-teal-50/40 dark:bg-teal-950/30"
                        : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    <td className="w-10 p-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(t.id)}
                        className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                    </td>
                    <td className="p-2.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        {t.repName}
                      </span>
                      <span className="text-[11px] text-slate-400">{t.territory}</span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                      {formatPKR(t.monthlyQuotaPkr)}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-emerald-600">
                      {formatPKR(t.achievedSalesPkr)}
                    </td>
                    <td className="p-2.5 text-center w-36">
                      <div className="flex items-center justify-between text-[10px] mb-1 font-mono">
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            pct >= 100 ? "bg-emerald-500" : pct >= 80 ? "bg-teal-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </td>
                    <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                      {t.visitedPharmaciesCount} / {t.targetVisitsCount}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatPKR(comm)}
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          t.status === "ahead"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : t.status === "on_track"
                            ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                        }`}
                      >
                        {t.status === "ahead" ? "TARGET COMPLETED" : t.status === "on_track" ? "ON TRACK" : "BEHIND TARGET"}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setDeletingTarget(t)}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                        title="Delete Target"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target Modal */}
      {isSettingTarget && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Target className="w-5 h-5 text-teal-600" /> Set Sales Target for Staff
              </h2>
              <button
                onClick={() => setIsSettingTarget(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSetTarget} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Staff Member Name *
                </label>
                <input
                  type="text"
                  required
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Area / City (Ilaqa)
                </label>
                <input
                  type="text"
                  required
                  value={territory}
                  onChange={(e) => setTerritory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Sales Target Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                    value={quota === 0 ? "" : quota}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setQuota(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Total Shop Visits Goal
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                    value={targetVisits === 0 ? "" : targetVisits}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setTargetVisits(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsSettingTarget(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Target
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        entityName="Sales Targets"
        selectedCount={selectedIds.length}
        totalCount={targets.length}
        countsByScope={scopeCounts}
        onConfirmDelete={handleExecuteBulkDelete}
        isDeleting={isDeleting}
      />

      {/* Single Delete Modal */}
      <SingleDeleteModal
        isOpen={!!deletingTarget}
        onClose={() => setDeletingTarget(null)}
        itemName={`${deletingTarget?.repName || ""} (${deletingTarget?.month || ""})`}
        title="Delete Sales Target"
        onConfirm={handleExecuteSingleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
