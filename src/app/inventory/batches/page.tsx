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
import { useCategory } from "@/context/CategoryContext";
import type { InventoryBatch, Product } from "@/types";

export default function BatchInventoryPage() {
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
            Medicine Batches & Expiry Dates
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            List of medicine batches sorted with oldest expiry first. Oldest medicines should be sold first.
          </p>
        </div>

        <Link
          href="/purchases"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          + Buy / Receive New Stock
        </Link>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Batches isolated for category: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
            </span>
          </div>
          <button
            onClick={() => setSelectedCategoryId("all")}
            className="text-xs font-semibold text-teal-700 dark:text-teal-300 underline hover:text-teal-900"
          >
            Show All Categories
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by batch number or medicine name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {(["all", "active", "near_expiry", "expired"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1 rounded-lg font-bold capitalize shrink-0 transition-all ${
                filterStatus === st
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st === "all"
                ? "All Batches"
                : st === "active"
                ? "Good Expiry"
                : st === "near_expiry"
                ? "Expiring Soon (<3 Months)"
                : "Expired (Do Not Sell)"}
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
                <th className="py-2.5">Batch No.</th>
                <th className="py-2.5">Medicine Name</th>
                <th className="py-2.5">Expiry Date</th>
                <th className="py-2.5">Expiry Status</th>
                <th className="py-2.5 text-right">Total Bought</th>
                <th className="py-2.5 text-right">In Stock Now</th>
                <th className="py-2.5 text-right">Broken / Blocked</th>
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
                            EXPIRED (DO NOT SELL)
                          </span>
                        ) : isNear ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                            EXPIRING SOON (&lt;3 MONTHS)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            GOOD EXPIRY
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
