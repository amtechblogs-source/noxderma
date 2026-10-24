"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Boxes,
  Barcode,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  PackageX,
  Stethoscope,
  Plus,
  Search,
  Filter,
  DollarSign,
  Eye,
  ShieldAlert,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import type {
  Product,
  InventoryBatch,
  StockMovement,
  DamagedStockRecord,
  SampleRecord,
  Customer,
} from "@/types";

export default function InventoryOverviewPage() {
  const { currentUser } = useAuth();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Record Damage Modal
  const [isRecordingDamage, setIsRecordingDamage] = useState(false);
  const [damageProdId, setDamageProdId] = useState("");
  const [damageBatchId, setDamageBatchId] = useState("");
  const [damageQty, setDamageQty] = useState(1);
  const [damageReason, setDamageReason] = useState("");

  // Record Sample Modal
  const [isRecordingSample, setIsRecordingSample] = useState(false);
  const [sampleProdId, setSampleProdId] = useState("");
  const [sampleBatchId, setSampleBatchId] = useState("");
  const [sampleQty, setSampleQty] = useState(1);
  const [sampleRecipient, setSampleRecipient] = useState("");
  const [sampleOrg, setSampleOrg] = useState("");
  const [samplePurpose, setSamplePurpose] = useState("");

  const loadData = async () => {
    try {
      const [prodList, batchList, custList] = await Promise.all([
        offlineDb.products.toArray(),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.customers.toArray(),
      ]);
      setProducts(prodList);
      setBatches(batchList);
      setCustomers(custList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Category isolation
  const activeCategoryObj =
    selectedCategoryId === "all" ? null : categories.find((c) => c.id === selectedCategoryId);

  const displayProducts =
    selectedCategoryId === "all"
      ? products
      : products.filter((p) => p.categoryId === selectedCategoryId);

  const categoryProductIds = new Set(displayProducts.map((p) => p.id));

  const displayBatches =
    selectedCategoryId === "all"
      ? batches
      : batches.filter((b) => categoryProductIds.has(b.productId));

  // Compute aggregated inventory metrics per product
  const productStockMap = displayProducts.map((prod) => {
    const prodBatches = displayBatches.filter((b) => b.productId === prod.id);
    const totalRemaining = prodBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);
    const totalBlocked = prodBatches.reduce((sum, b) => sum + (b.blockedQuantity || 0), 0);
    const available = Math.max(0, totalRemaining - totalBlocked);
    const isLow = totalRemaining <= prod.reorderThreshold;

    return {
      product: prod,
      totalRemaining,
      totalBlocked,
      available,
      isLow,
      batchCount: prodBatches.length,
    };
  });

  const totalInventoryUnits = displayBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);
  const totalBlockedUnits = displayBatches.reduce((sum, b) => sum + (b.blockedQuantity || 0), 0);
  const lowStockCount = productStockMap.filter((p) => p.isLow).length;

  // Handle Record Damaged Stock
  const handleRecordDamage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!damageProdId || damageQty <= 0) return;

    const prod = products.find((p) => p.id === damageProdId);
    const batch = batches.find((b) => b.id === damageBatchId);
    const now = new Date().toISOString();

    if (batch) {
      const newRemaining = Math.max(0, batch.remainingQuantity - damageQty);
      await offlineDb.inventoryBatches.update(batch.id, {
        remainingQuantity: newRemaining,
        updatedAt: now,
      });
    }

    const movement: StockMovement = {
      id: `mov_dmg_${Date.now()}`,
      productId: damageProdId,
      productName: prod ? prod.name : "Pharmaceutical Product",
      batchId: damageBatchId || undefined,
      batchNumber: batch ? batch.batchNumber : undefined,
      type: "damaged_stock",
      quantityChange: -damageQty,
      balanceAfter: (totalInventoryUnits || 0) - damageQty,
      referenceId: `DMG-${Date.now().toString().slice(-4)}`,
      referenceType: "damage",
      userId: currentUser?.id || "usr_admin",
      userName: currentUser?.displayName || "Admin",
      reason: damageReason,
      timestamp: now,
    };

    await offlineDb.stockMovements.put(movement);
    setIsRecordingDamage(false);
    setDamageQty(5);
    await loadData();
    alert(`Damaged stock recorded. ${damageQty} packs removed from stock.`);
  };

  // Handle Record Clinical Sample
  const handleRecordSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sampleProdId || sampleQty <= 0) return;

    const prod = products.find((p) => p.id === sampleProdId);
    const batch = batches.find((b) => b.id === sampleBatchId);
    const now = new Date().toISOString();

    if (batch) {
      const newRemaining = Math.max(0, batch.remainingQuantity - sampleQty);
      await offlineDb.inventoryBatches.update(batch.id, {
        remainingQuantity: newRemaining,
        updatedAt: now,
      });
    }

    const movement: StockMovement = {
      id: `mov_smp_${Date.now()}`,
      productId: sampleProdId,
      productName: prod ? prod.name : "Pharmaceutical Product",
      batchId: sampleBatchId || undefined,
      batchNumber: batch ? batch.batchNumber : undefined,
      type: "sample_issue",
      quantityChange: -sampleQty,
      balanceAfter: (totalInventoryUnits || 0) - sampleQty,
      referenceId: `SMP-${Date.now().toString().slice(-4)}`,
      referenceType: "sample",
      userId: currentUser?.id || "usr_admin",
      userName: currentUser?.displayName || "Admin",
      reason: `Issued to ${sampleRecipient} (${sampleOrg}) - ${samplePurpose}`,
      timestamp: now,
    };

    await offlineDb.stockMovements.put(movement);
    setIsRecordingSample(false);
    setSampleQty(10);
    await loadData();
    alert(`Free doctor sample recorded. ${sampleQty} packs given to ${sampleRecipient}.`);
  };

  const filteredMap = productStockMap.filter((item) =>
    item.product.name.toLowerCase().includes(search.toLowerCase()) ||
    item.product.sku.toLowerCase().includes(search.toLowerCase()) ||
    item.product.categoryName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Warehouse Stock
            </span>
            <span className="text-xs text-slate-400">Oldest Expiry Sold First</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Current Medicine Stock & Alerts
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setIsRecordingDamage(true)}
            className="px-3.5 py-2 rounded-lg border border-rose-500/30 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <PackageX className="w-3.5 h-3.5" /> Broken / Damaged Stock
          </button>
          <button
            onClick={() => setIsRecordingSample(true)}
            className="px-3.5 py-2 rounded-lg border border-sky-500/30 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 hover:bg-sky-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Stethoscope className="w-3.5 h-3.5" /> Free Doctor Sample
          </button>
          <Link
            href="/inventory/batches"
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Barcode className="w-4 h-4" /> View All Batches & Expiry
          </Link>
        </div>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Showing inventory for: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Stock in Godown
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {formatNumber(totalInventoryUnits)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Across {products.length} Medicines</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Available to Sell
          </span>
          <span className="text-2xl font-black text-emerald-600">
            {formatNumber(Math.max(0, totalInventoryUnits - totalBlockedUnits))}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Ready for Billing</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Low Stock Warnings
          </span>
          <span className="text-2xl font-black text-amber-600">
            {lowStockCount} Medicines
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Order More Soon</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Broken / Expired (Do Not Sell)
          </span>
          <span className="text-2xl font-black text-rose-600">
            {formatNumber(totalBlockedUnits)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Locked Stock</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between text-xs">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search medicine name, code, or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/inventory/movements"
            className="text-xs font-bold text-teal-600 hover:underline flex items-center gap-1"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Stock In & Out History
          </Link>
        </div>
      </div>

      {/* Stock Projections Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Medicine Name</th>
                <th className="p-2.5">Category</th>
                <th className="p-2.5 text-right">Total in Godown</th>
                <th className="p-2.5 text-right">Available to Sell</th>
                <th className="p-2.5 text-right">Broken / Locked</th>
                <th className="p-2.5 text-right">Low Stock Limit</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredMap.map((item) => (
                <tr
                  key={item.product.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-2.5">
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {item.product.name}
                    </div>
                    <span className="font-mono text-[11px] text-slate-400">
                      Code: {item.product.sku} • {item.product.packSize}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {item.product.categoryName}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatNumber(item.totalRemaining)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                    {formatNumber(item.available)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-semibold text-rose-600">
                    {item.totalBlocked > 0 ? formatNumber(item.totalBlocked) : "—"}
                  </td>
                  <td className="p-2.5 text-right font-mono text-slate-500">
                    {item.product.reorderThreshold} packs
                  </td>
                  <td className="p-2.5 text-center">
                    {item.isLow ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
                        Low Stock
                      </span>
                    ) : item.available === 0 ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300">
                        Out of Stock (Khatam)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                        Plenty in Stock
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-right">
                    <Link
                      href={`/products/detail?id=${encodeURIComponent(item.product.id)}`}
                      className="text-teal-600 font-bold hover:underline"
                    >
                      View Batches
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Damage Modal */}
      {isRecordingDamage && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <PackageX className="w-5 h-5 text-rose-600" /> Record Broken / Damaged Medicine
              </h2>
              <button
                onClick={() => setIsRecordingDamage(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordDamage} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Medicine *
                </label>
                <select
                  required
                  value={damageProdId}
                  onChange={(e) => {
                    setDamageProdId(e.target.value);
                    const matching = batches.filter((b) => b.productId === e.target.value);
                    if (matching[0]) setDamageBatchId(matching[0].id);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Medicine --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Batch Number
                </label>
                <select
                  value={damageBatchId}
                  onChange={(e) => setDamageBatchId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                >
                  <option value="">-- General Stock --</option>
                  {batches
                    .filter((b) => !damageProdId || b.productId === damageProdId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.batchNumber} (Rem: {b.remainingQuantity})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Broken / Damaged Quantity (Packs) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={damageQty}
                  onChange={(e) => setDamageQty(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Damage *
                </label>
                <textarea
                  rows={2}
                  required
                  value={damageReason}
                  onChange={(e) => setDamageReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordingDamage(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20"
                >
                  Remove from Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Clinical Sample Modal */}
      {isRecordingSample && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-sky-600" /> Give Free Doctor Sample
              </h2>
              <button
                onClick={() => setIsRecordingSample(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordSample} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Medicine *
                </label>
                <select
                  required
                  value={sampleProdId}
                  onChange={(e) => {
                    setSampleProdId(e.target.value);
                    const matching = batches.filter((b) => b.productId === e.target.value);
                    if (matching[0]) setSampleBatchId(matching[0].id);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Medicine --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Batch
                  </label>
                  <select
                    value={sampleBatchId}
                    onChange={(e) => setSampleBatchId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  >
                    <option value="">-- Any Active --</option>
                    {batches
                      .filter((b) => !sampleProdId || b.productId === sampleProdId)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.batchNumber}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Free Sample Quantity (Packs) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={sampleQty}
                    onChange={(e) => setSampleQty(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Saved Doctor/Clinic Dropdown for quick selection */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Choose Saved Customer / Clinic (Optional Quick Fill)
                </label>
                <select
                  onChange={(e) => {
                    const found = customers.find((c) => c.id === e.target.value);
                    if (found) {
                      setSampleRecipient(found.contactPerson || found.name);
                      setSampleOrg(found.name + (found.city ? ` (${found.city})` : ""));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Select Saved Doctor / Clinic OR Type Below --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.contactPerson ? `(${c.contactPerson})` : ""} — {c.city}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Doctor's Name *
                </label>
                <input
                  type="text"
                  required
                  value={sampleRecipient}
                  onChange={(e) => setSampleRecipient(e.target.value)}
                  placeholder="e.g. Dr. Faisal Shah"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Hospital / Clinic Name
                </label>
                <input
                  type="text"
                  value={sampleOrg}
                  onChange={(e) => setSampleOrg(e.target.value)}
                  placeholder="e.g. National Hospital Lahore"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={samplePurpose}
                  onChange={(e) => setSamplePurpose(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordingSample(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-md shadow-sky-600/20"
                >
                  Save Free Sample
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
