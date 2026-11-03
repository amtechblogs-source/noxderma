"use client";

import React, { useState, useEffect, useMemo } from "react";
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
import { useCategory } from "@/context/CategoryContext";
import type { InventoryBatch, Product } from "@/types";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
} from "@/lib/dateFilter";

export default function BatchInventoryPage() {
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));

  useEffect(() => {
    async function loadBatches() {
      const [list, prodList] = await Promise.all([
        offlineDb.inventoryBatches.toArray(),
        offlineDb.products.toArray(),
      ]);
      // Sort strictly by expiry date ascending (FEFO: First Expiry, First Out)
      setBatches(
        list.sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
      );
      setProducts(prodList);
    }
    loadBatches();
  }, []);

  const now = Date.now();
  const ninetyDaysFromNow = now + 90 * 24 * 3600 * 1000;

  const activeCategoryObj =
    selectedCategoryId === "all" ? null : categories.find((c) => c.id === selectedCategoryId);

  const categoryProductIds = new Set(
    selectedCategoryId === "all"
      ? products.map((p) => p.id)
      : products.filter((p) => p.categoryId === selectedCategoryId).map((p) => p.id)
  );

  const categoryBatches =
    selectedCategoryId === "all"
      ? batches
      : batches.filter((b) => categoryProductIds.has(b.productId));

  const filtered = categoryBatches.filter((b) => {
    if (!isRecordInDateRange(b.expiryDate || b.manufacturingDate || b.createdAt, dateFilter)) {
      return false;
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 btn-interactive"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Barcode className="w-7 h-7 text-teal-600" />
            Medicine Batches & Expiry Dates
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            List of medicine batches sorted with oldest expiry first. Oldest medicines should be sold first.
          </p>
        </div>

        <Link
          href="/purchases"
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-bold shadow-soft shadow-teal-600/20 btn-interactive"
        >
          <Plus className="w-4 h-4" />
          Buy / Receive New Stock
        </Link>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Showing batches for: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
            </span>
          </div>
          <button
            onClick={() => setSelectedCategoryId("all")}
            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-teal-100 text-xs border border-slate-200 dark:border-slate-700 shadow-sm btn-interactive"
          >
            Show All Categories
          </button>
        </div>
      )}

      {/* Universal Date Filter */}
      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={filtered.length}
      />

      {/* Filter and Search Bar */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search batch number or medicine..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {(["all", "active", "near_expiry", "expired"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`min-h-[38px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold capitalize btn-interactive transition-all text-xs sm:text-sm ${
                filterStatus === st
                  ? "bg-teal-600 text-white shadow-soft"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {st === "all"
                ? "All Batches"
                : st === "active"
                ? "Good Expiry"
                : st === "near_expiry"
                ? "Expiring Soon (<3M)"
                : "Expired (Do Not Sell)"}
            </button>
          ))}
        </div>
      </div>

      {/* Batches Mobile Cards (< md) */}
      <div className="block md:hidden space-y-3.5">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            No medicine batches match your search.
          </div>
        ) : (
          filtered.map((b) => {
            const expTime = new Date(b.expiryDate).getTime();
            const isNear = expTime > now && expTime <= ninetyDaysFromNow;
            const isExp = expTime <= now;

            return (
              <div
                key={b.id}
                className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <span className="inline-block px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                      Batch #{b.batchNumber}
                    </span>
                    <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base leading-snug">
                      {b.productName}
                    </h3>
                  </div>

                  {isExp ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
                      EXPIRED
                    </span>
                  ) : isNear ? (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                      EXPIRING SOON
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                      GOOD EXPIRY
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Expiry Date:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {formatKarachiDate(b.expiryDate)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">In Stock:</span>
                    <span className="font-extrabold text-sm sm:text-base text-teal-600 dark:text-teal-400">
                      {formatNumber(b.remainingQuantity)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Total Bought:</span>
                    <span className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {formatNumber(b.receivedQuantity)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block font-medium">Blocked/Broken:</span>
                    <span className="font-bold text-xs sm:text-sm text-rose-600">
                      {b.blockedQuantity || 0}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Batches Table: Desktop View (>= md) */}
      <div className="hidden md:block p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <th className="py-3 px-3">Batch No.</th>
                <th className="py-3 px-3">Medicine Name</th>
                <th className="py-3 px-3">Expiry Date</th>
                <th className="py-3 px-3">Expiry Status</th>
                <th className="py-3 px-3 text-right">Total Bought</th>
                <th className="py-3 px-3 text-right">In Stock Now</th>
                <th className="py-3 px-3 text-right">Broken / Blocked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length > 0 ? (
                filtered.map((b) => {
                  const expTime = new Date(b.expiryDate).getTime();
                  const isNear = expTime > now && expTime <= ninetyDaysFromNow;
                  const isExp = expTime <= now;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3.5 px-3 font-mono font-bold text-teal-600">{b.batchNumber}</td>
                      <td className="py-3.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {b.productName}
                      </td>
                      <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300">
                        {formatKarachiDate(b.expiryDate)}
                      </td>
                      <td className="py-3.5 px-3">
                        {isExp ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                            EXPIRED (DO NOT SELL)
                          </span>
                        ) : isNear ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            EXPIRING SOON (&lt;3 MONTHS)
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            GOOD EXPIRY
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-right text-slate-500 font-mono">{formatNumber(b.receivedQuantity)}</td>
                      <td className="py-3.5 px-3 text-right font-bold text-slate-900 dark:text-slate-100 font-mono">
                        {formatNumber(b.remainingQuantity)}
                      </td>
                      <td className="py-3.5 px-3 text-right text-rose-600 font-semibold font-mono">{b.blockedQuantity}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No medicine batches found.
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
