"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Barcode,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Plus,
  Filter,
  Search,
  ShieldAlert,
  CheckCircle2,
} from "lucide-react";
import { formatKarachiDate, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { InventoryBatch } from "@/types";

export default function BatchInventoryPage() {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    async function loadBatches() {
      const list = await offlineDb.inventoryBatches.toArray();
      // Sort strictly by expiry date ascending (FEFO: First Expiry, First Out)
      setBatches(
        list.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
      );
    }
    loadBatches();
  }, []);

  const now = Date.now();
  const ninetyDaysFromNow = now + 90 * 24 * 3600 * 1000;

  const filtered = batches.filter((b) => {
    const expTime = new Date(b.expiryDate).getTime();
    const isNear = expTime > now && expTime <= ninetyDaysFromNow;
    const isExp = expTime <= now;

    if (filterStatus === "near_expiry" && !isNear) return false;
    if (filterStatus === "expired" && !isExp) return false;
    if (filterStatus === "active" && (isNear || isExp)) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        b.batchNumber.toLowerCase().includes(q) ||
        b.productName.toLowerCase().includes(q) ||
        b.productId.toLowerCase().includes(q)
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
            <Barcode className="w-6 h-6 text-teal-600" />
            Batch-Wise Inventory & FEFO Allocation
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Strict First-Expiry, First-Out (FEFO) prioritization. Clinical shelf-life protection and quarantine controls.
          </p>
        </div>

        <Link
          href="/purchases"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          Receive New Batch
        </Link>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by batch number or product name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {(["all", "active", "near_expiry", "expired"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1 rounded-lg font-bold capitalize transition-all ${
                filterStatus === st
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Batches Table */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2.5">Batch Number</th>
                <th className="py-2.5">Product Name</th>
                <th className="py-2.5">Expiry Date</th>
                <th className="py-2.5">FEFO Status</th>
                <th className="py-2.5 text-right">Received</th>
                <th className="py-2.5 text-right">Remaining Stock</th>
                <th className="py-2.5 text-right">Blocked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length > 0 ? (
                filtered.map((b) => {
                  const expTime = new Date(b.expiryDate).getTime();
                  const isNear = expTime > now && expTime <= ninetyDaysFromNow;
                  const isExp = expTime <= now;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 font-mono font-bold text-teal-600">{b.batchNumber}</td>
                      <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                        {b.productName}
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300">
                        {formatKarachiDate(b.expiryDate)}
                      </td>
                      <td className="py-3">
                        {isExp ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            EXPIRED (BLOCKED)
                          </span>
                        ) : isNear ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            NEAR EXPIRY (&lt;90D)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            ACTIVE (HEALTHY)
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-right text-slate-500">{formatNumber(b.receivedQuantity)}</td>
                      <td className="py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                        {formatNumber(b.remainingQuantity)}
                      </td>
                      <td className="py-3 text-right text-rose-600 font-semibold">{b.blockedQuantity}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No batches match the selected criteria.
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
