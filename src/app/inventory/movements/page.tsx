"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowLeft,
  Search,
  Filter,
  Package,
  Calendar,
} from "lucide-react";
import { formatKarachiDate, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { reconcileDeletedBillsStockMovements } from "@/lib/inventory/reconcileDeletedBills";
import type { StockMovement } from "@/types";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
} from "@/lib/dateFilter";

function getMovementTypeBadge(m: StockMovement): { label: string; badgeClass: string } {
  if (m.type === "sales_return") {
    const reasonLower = (m.reason || "").toLowerCase();
    const isDeletedBill =
      reasonLower.includes("delete") ||
      reasonLower.includes("undo") ||
      reasonLower.includes("revert") ||
      m.id.startsWith("mov_del_") ||
      m.id.startsWith("mov_undo_");
    return {
      label: isDeletedBill ? "BILL DELETED • RESTORED (+)" : "STOCK RETURNED (+)",
      badgeClass:
        "bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-200 dark:border-teal-800",
    };
  }
  if (m.type === "sales_deduction") {
    return {
      label: "SOLD IN BILL (-)",
      badgeClass: "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
    };
  }
  if (m.type === "purchase_receipt") {
    return {
      label: "STOCK BOUGHT (+)",
      badgeClass: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    };
  }
  if (m.type === "damaged_stock") {
    return {
      label: "BROKEN STOCK (-)",
      badgeClass: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    };
  }
  if (m.type === "expiry_write_off") {
    return {
      label: "EXPIRED LOSS (-)",
      badgeClass:
        "bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-200 dark:border-rose-800",
    };
  }
  if (m.type === "supplier_return") {
    return {
      label: "COMPANY CLAIM (-)",
      badgeClass:
        "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800",
    };
  }
  if (
    m.type === "reconciliation_adjustment" &&
    (m.referenceType === "expiry_claim" || m.claimOutcome === "quarantined_pending_claim")
  ) {
    return {
      label: "QUARANTINE (LOCKED)",
      badgeClass:
        "bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
    };
  }
  if (m.type === "sample_issue") {
    return {
      label: "DOCTOR SAMPLE (-)",
      badgeClass: "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
    };
  }
  return {
    label: m.quantityChange >= 0 ? "STOCK ADJUSTED (+)" : "STOCK ADJUSTED (-)",
    badgeClass:
      m.quantityChange >= 0
        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
        : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  };
}

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));

  useEffect(() => {
    async function load() {
      await reconcileDeletedBillsStockMovements();
      const list = await offlineDb.stockMovements.toArray();
      setMovements(
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      );
    }
    load();
    const handleCloudSynced = () => {
      load();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (!isRecordInDateRange(m.timestamp, dateFilter)) return false;
      if (typeFilter !== "all" && m.type !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          m.productName.toLowerCase().includes(q) ||
          (m.batchNumber && m.batchNumber.toLowerCase().includes(q)) ||
          m.referenceId.toLowerCase().includes(q) ||
          (m.reason && m.reason.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [movements, typeFilter, search, dateFilter]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-teal-600" />
            Stock In & Out History (Godown Register)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Complete record of every box received from company, sold in bills, broken stock, or given as free doctor samples.
          </p>
        </div>
      </div>

      {/* Universal Date Filter */}
      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={filtered.length}
      />

      {/* Filter and Search */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search medicine, batch, or bill number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {[
            { id: "all", label: "All Records" },
            { id: "sales_deduction", label: "Sold in Bills (-)" },
            { id: "sales_return", label: "Bill Deleted / Returned (+)" },
            { id: "purchase_receipt", label: "Bought (+)" },
            { id: "expiry_write_off", label: "Expired Loss (-)" },
            { id: "supplier_return", label: "Company Claim (-)" },
            { id: "damaged_stock", label: "Damaged (-)" },
            { id: "sample_issue", label: "Samples (-)" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              className={`px-2.5 sm:px-3 py-1 rounded-lg font-bold transition-all text-xs ${typeFilter === t.id
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Movements Table & Mobile Cards */}
      <div className="p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No stock records found.
            </div>
          ) : (
            filtered.map((m) => (
              <div
                key={m.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {m.productName}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {formatKarachiDate(m.timestamp, true)}
                    </p>
                  </div>
                  {(() => {
                    const badge = getMovementTypeBadge(m);
                    return (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${badge.badgeClass}`}
                      >
                        {badge.label}
                      </span>
                    );
                  })()}
                </div>
                {m.reason && (
                  <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-900/50 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                    {m.reason}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Batch #
                    </span>
                    <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                      {m.batchNumber || "—"}
                    </span>
                  </div>
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Changed
                    </span>
                    <span
                      className={`font-mono font-extrabold ${
                        m.quantityChange < 0 ? "text-rose-600" : "text-emerald-600"
                      }`}
                    >
                      {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Left in Godown
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatNumber(m.balanceAfter)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span className="font-mono">Ref: {m.referenceId}</span>
                  <span>By: {m.userName}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2.5">Date & Time</th>
                <th className="py-2.5">Medicine Name</th>
                <th className="py-2.5">Batch #</th>
                <th className="py-2.5">Type</th>
                <th className="py-2.5 text-right">Quantity Changed</th>
                <th className="py-2.5 text-right">Stock Left in Godown</th>
                <th className="py-2.5">Bill / Ref #</th>
                <th className="py-2.5">Reason / Details</th>
                <th className="py-2.5">Done By (Staff)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length > 0 ? (
                filtered.map((m) => {
                  const badge = getMovementTypeBadge(m);
                  return (
                    <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 text-slate-500">{formatKarachiDate(m.timestamp, true)}</td>
                      <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {m.productName}
                      </td>
                      <td className="py-3 font-mono text-teal-600 font-bold">{m.batchNumber || "—"}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.badgeClass}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td
                        className={`py-3 text-right font-extrabold ${
                          m.quantityChange < 0 ? "text-rose-600" : "text-emerald-600"
                        }`}
                      >
                        {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                      </td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatNumber(m.balanceAfter)}
                      </td>
                      <td className="py-3 font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400">
                        {m.referenceId}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 max-w-xs truncate" title={m.reason}>
                        {m.reason || "—"}
                      </td>
                      <td className="py-3 text-slate-500">{m.userName}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No stock records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
