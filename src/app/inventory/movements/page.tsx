"use client";

import React, { useState, useEffect } from "react";
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
import type { StockMovement } from "@/types";

export default function StockMovementsPage() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    async function load() {
      const list = await offlineDb.stockMovements.toArray();
      setMovements(list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
    }
    load();
  }, []);

  const filtered = movements.filter((m) => {
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        m.productName.toLowerCase().includes(q) ||
        (m.batchNumber && m.batchNumber.toLowerCase().includes(q)) ||
        m.referenceId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-teal-600" />
            Stock Movement History & Physical Audit Ledger
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Immutable log of every physical quantity change: Purchase Receipts, Sales Deductions, Returns, Damage & Samples.
          </p>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by product, batch, or reference ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Type:
          </span>
          {[
            { id: "all", label: "All Movements" },
            { id: "sales_deduction", label: "Sales" },
            { id: "purchase_receipt", label: "Purchases" },
            { id: "damaged_stock", label: "Damage" },
            { id: "sample_issue", label: "Samples" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id)}
              className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all ${
                typeFilter === t.id
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Movements Table */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2.5">Date & Time</th>
                <th className="py-2.5">Product Description</th>
                <th className="py-2.5">Batch Number</th>
                <th className="py-2.5">Movement Type</th>
                <th className="py-2.5 text-right">Qty Change</th>
                <th className="py-2.5 text-right">Remaining Bal</th>
                <th className="py-2.5">Transaction Ref</th>
                <th className="py-2.5">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length > 0 ? (
                filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 text-slate-500">{formatKarachiDate(m.timestamp, true)}</td>
                    <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {m.productName}
                    </td>
                    <td className="py-3 font-mono text-teal-600 font-bold">{m.batchNumber || "—"}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.type === "sales_deduction"
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                            : m.type === "purchase_receipt"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : m.type === "damaged_stock"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                            : "bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                        }`}
                      >
                        {m.type.replace("_", " ").toUpperCase()}
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
                    <td className="py-3 font-mono text-[11px] text-slate-500">{m.referenceId}</td>
                    <td className="py-3 text-slate-500">{m.userName}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No movements found for the selected criteria.
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
