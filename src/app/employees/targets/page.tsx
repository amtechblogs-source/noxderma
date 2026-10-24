"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";

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
}

export default function SalesTargetsPage() {
  const [targets, setTargets] = useState<RepTarget[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("October 2026");
  const [isSettingTarget, setIsSettingTarget] = useState(false);

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

  const handleSetTarget = (e: React.FormEvent) => {
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
    };

    saveTargets([newTarget, ...targets]);
    setIsSettingTarget(false);
  };

  const totalQuota = targets.reduce((sum, t) => sum + t.monthlyQuotaPkr, 0);
  const totalAchieved = targets.reduce((sum, t) => sum + t.achievedSalesPkr, 0);
  const overallAchievementPercent =
    totalQuota > 0 ? Math.round((totalAchieved / totalQuota) * 100) : 0;

  const filtered = targets.filter(
    (t) =>
      t.repName.toLowerCase().includes(search.toLowerCase()) ||
      t.territory.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
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

        <button
          onClick={() => setIsSettingTarget(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" /> Set Monthly Target
        </button>
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
                <th className="p-2.5">Staff Name & Area</th>
                <th className="p-2.5 text-right">Target (Hadaf)</th>
                <th className="p-2.5 text-right">Sales Done</th>
                <th className="p-2.5 text-center">Progress</th>
                <th className="p-2.5 text-right">Visits Done / Goal</th>
                <th className="p-2.5 text-right">Commission</th>
                <th className="p-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((t) => {
                const pct = Math.round((t.achievedSalesPkr / t.monthlyQuotaPkr) * 100);
                const comm = (t.achievedSalesPkr * t.commissionRatePercent) / 100;

                return (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Target Modal */}
      {isSettingTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
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
                    value={quota}
                    onChange={(e) => setQuota(Number(e.target.value))}
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
                    value={targetVisits}
                    onChange={(e) => setTargetVisits(Number(e.target.value))}
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
    </div>
  );
}
