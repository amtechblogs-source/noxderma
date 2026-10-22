"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  PackageCheck,
  Barcode,
  Layers,
  Factory,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Boxes,
  TrendingDown,
  TrendingUp,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Plus,
  ArrowLeftRight,
  Share2,
  DollarSign,
  Tag,
  Eye,
  EyeOff,
  Percent,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type {
  Product,
  ProductPricing,
  InventoryBatch,
  StockMovement,
} from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ProductDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const productId = resolvedParams.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [pricing, setPricing] = useState<ProductPricing | null>(null);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCostPrices, setShowCostPrices] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Quick Batch Creation Modal
  const [isAddingBatch, setIsAddingBatch] = useState(false);
  const [newBatchNumber, setNewBatchNumber] = useState("");
  const [newExpiryDate, setNewExpiryDate] = useState("");
  const [newMfgDate, setNewMfgDate] = useState("");
  const [newQuantity, setNewQuantity] = useState(50);
  const [newStatus, setNewStatus] = useState<InventoryBatch["status"]>("active");

  const loadData = async () => {
    try {
      const [prod, price, bList, mList] = await Promise.all([
        offlineDb.products.get(productId),
        offlineDb.productPricing.get(productId),
        offlineDb.inventoryBatches.where("productId").equals(productId).toArray(),
        offlineDb.stockMovements
          .where("productId")
          .equals(productId)
          .reverse()
          .sortBy("timestamp"),
      ]);

      if (prod) {
        setProduct(prod);
        setSelectedImage(prod.images?.[0]?.url || null);
      } else {
        // Fallback or seed sample if not in DB
        const fallback: Product = {
          id: productId,
          sku: `SKU-${productId.toUpperCase()}`,
          name: productId.replace(/_/g, " ").toUpperCase(),
          brand: "Noxderma Pharma",
          manufacturerId: "mfr_nox_laboratories",
          manufacturerName: "Nox Laboratories PK",
          categoryId: "cat_pharmacy",
          categoryName: "Pharmaceuticals",
          packSize: "Pack of 30 Units",
          unitOfMeasure: "pack",
          unitsPerPack: 30,
          reorderThreshold: 20,
          requiresBatchTracking: true,
          status: "active",
          images: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setProduct(fallback);
      }

      setPricing(
        price || {
          productId,
          purchaseCostPerPack: 450,
          tradePricePerPack: 750,
          mrpPerPack: 900,
          taxPercentage: 0,
          discountMaxPercentage: 15,
          updatedAt: new Date().toISOString(),
        }
      );

      // Sort batches by FEFO (earliest expiry first)
      const sortedBatches = (bList || []).sort(
        (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
      );
      setBatches(sortedBatches);
      setMovements(mList || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [productId]);

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBatchNumber || !newExpiryDate || newQuantity <= 0 || !product) return;

    const now = new Date().toISOString();
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const newBatch: InventoryBatch = {
      id: batchId,
      productId: product.id,
      productName: product.name,
      batchNumber: newBatchNumber.toUpperCase().trim(),
      manufacturerId: product.manufacturerId,
      manufacturingDate: newMfgDate || undefined,
      expiryDate: newExpiryDate,
      receivedQuantity: Number(newQuantity),
      remainingQuantity: Number(newQuantity),
      blockedQuantity: newStatus === "quarantine" ? Number(newQuantity) : 0,
      status: newStatus,
      createdAt: now,
      updatedAt: now,
    };

    const movement: StockMovement = {
      id: `mov_${Date.now()}`,
      productId: product.id,
      productName: product.name,
      batchId: batchId,
      batchNumber: newBatch.batchNumber,
      type: "purchase_receipt",
      quantityChange: Number(newQuantity),
      balanceAfter: (totalStock || 0) + Number(newQuantity),
      referenceId: `GRN-MANUAL-${Date.now().toString().slice(-4)}`,
      referenceType: "goods_receipt",
      userId: "usr_admin",
      userName: "Dr. Asim (Admin)",
      reason: "Manual Initial Stock Batch Intake",
      timestamp: now,
    };

    await offlineDb.inventoryBatches.put(newBatch);
    await offlineDb.stockMovements.put(movement);

    setIsAddingBatch(false);
    setNewBatchNumber("");
    setNewExpiryDate("");
    setNewMfgDate("");
    setNewQuantity(50);
    await loadData();
  };

  // Aggregated Stock Stats
  const totalStock = batches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);
  const blockedStock = batches.reduce((sum, b) => sum + (b.blockedQuantity || 0), 0);
  const availableStock = Math.max(0, totalStock - blockedStock);

  const nowMs = Date.now();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
  const nearExpiryBatches = batches.filter((b) => {
    const diff = new Date(b.expiryDate).getTime() - nowMs;
    return diff > 0 && diff <= ninetyDaysMs && b.remainingQuantity > 0;
  });
  const expiredBatches = batches.filter(
    (b) => new Date(b.expiryDate).getTime() <= nowMs && b.remainingQuantity > 0
  );

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="font-semibold text-sm">Loading product profile...</p>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Product not found.</p>
        <Link href="/products" className="text-teal-600 font-bold mt-2 inline-block">
          Return to Catalog
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                {product.categoryName || "Pharmaceutical"}
              </span>
              <span className="text-xs font-mono text-slate-400">SKU: {product.sku}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {product.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href={`/marketing/whatsapp?sku=${product.sku}&name=${encodeURIComponent(product.name)}`}
            className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> WhatsApp Promo
          </Link>
          <button
            onClick={() => setIsAddingBatch(true)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Intake New Batch
          </button>
        </div>
      </div>

      {/* Main Grid: Gallery & Commercial Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Image Gallery & Brand Info */}
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            {/* Primary Image View */}
            <div className="w-full h-64 rounded-lg bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700 flex items-center justify-center relative">
              {selectedImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedImage}
                  alt={product.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="text-center text-slate-400">
                  <PackageCheck className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <span className="text-xs">No product images attached</span>
                </div>
              )}
            </div>

            {/* Thumbnail Carousel */}
            {product.images && product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {product.images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImage(img.url)}
                    className={`w-14 h-14 rounded-lg overflow-hidden border-2 shrink-0 ${
                      selectedImage === img.url
                        ? "border-teal-500"
                        : "border-slate-200 dark:border-slate-700 opacity-70"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.thumbnailUrl || img.url}
                      alt="Thumbnail"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Product Specifications */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Generic Formula:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                  {product.genericName || "Standard Formulation"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Brand Line:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {product.brand}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Manufacturer:</span>
                <span className="font-semibold text-teal-600 dark:text-teal-400">
                  {product.manufacturerName}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Pack Presentation:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {product.packSize} ({product.unitsPerPack} {product.unitOfMeasure}s)
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Barcode / EAN:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {product.barcode || "N/A"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Reorder Alert:</span>
                <span className="font-bold text-amber-600">
                  {product.reorderThreshold} packs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: 2/3 Width - Inventory Stats, Pricing Schedule & Batches */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stock Metrics Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Total Stock
              </span>
              <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
                {formatNumber(totalStock)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Physical packs in warehouse</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                Available (FEFO)
              </span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {formatNumber(availableStock)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Ready for invoice dispatch</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
                Near Expiry (&lt;90d)
              </span>
              <span className="text-2xl font-black text-amber-600">
                {nearExpiryBatches.reduce((acc, b) => acc + b.remainingQuantity, 0)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {nearExpiryBatches.length} batch(es) flagged
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
                Quarantined
              </span>
              <span className="text-2xl font-black text-rose-600">
                {formatNumber(blockedStock)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Damaged or hold</span>
            </div>
          </div>

          {/* Commercial Pricing Schedule (With Cost Visibility Toggle) */}
          {pricing && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-teal-600" />
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Commercial Pricing Schedule & Margins
                  </h3>
                </div>
                <button
                  onClick={() => setShowCostPrices(!showCostPrices)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 font-semibold"
                >
                  {showCostPrices ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showCostPrices ? "Hide Costs" : "Show Costs"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Purchase Cost:</span>
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200 font-mono">
                    {showCostPrices ? formatPKR(pricing.purchaseCostPerPack) : "••••••"}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Trade Price (TP):</span>
                  <span className="font-bold text-sm text-teal-600 dark:text-teal-400 font-mono">
                    {formatPKR(pricing.tradePricePerPack)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Maximum Retail (MRP):</span>
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100 font-mono">
                    {formatPKR(pricing.mrpPerPack)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Gross Markup:</span>
                  <span className="font-bold text-sm text-emerald-600 font-mono">
                    {showCostPrices
                      ? `${Math.round(
                          ((pricing.tradePricePerPack - pricing.purchaseCostPerPack) /
                            pricing.purchaseCostPerPack) *
                            100
                        )}%`
                      : "••••••"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Active Batches (FEFO Sort) */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Barcode className="w-4 h-4 text-teal-600" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Physical Batch Allocations (FEFO Ranked)
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                {batches.length} batch(es) registered
              </span>
            </div>

            {batches.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-lg">
                <p className="text-xs">No batches recorded for this product yet.</p>
                <button
                  onClick={() => setIsAddingBatch(true)}
                  className="mt-2 text-xs font-bold text-teal-600 hover:underline"
                >
                  + Add First Batch
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Batch #</th>
                      <th className="p-2.5">Expiry Date</th>
                      <th className="p-2.5 text-right">Received</th>
                      <th className="p-2.5 text-right">Remaining</th>
                      <th className="p-2.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {batches.map((b) => {
                      const expMs = new Date(b.expiryDate).getTime();
                      const isExpired = expMs <= nowMs;
                      const isNear = !isExpired && expMs - nowMs <= ninetyDaysMs;

                      return (
                        <tr
                          key={b.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="p-2.5 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {b.batchNumber}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`font-semibold ${
                                isExpired
                                  ? "text-rose-600 dark:text-rose-400"
                                  : isNear
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-slate-700 dark:text-slate-300"
                              }`}
                            >
                              {b.expiryDate}
                            </span>
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                            {formatNumber(b.receivedQuantity)}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {formatNumber(b.remainingQuantity)}
                          </td>
                          <td className="p-2.5 text-center">
                            {b.status === "quarantine" ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300">
                                Quarantine
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300">
                                Expired
                              </span>
                            ) : isNear ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
                                Near Expiry
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                                Active
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Stock Movements Audit Trail */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-4 h-4 text-teal-600" />
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                Recent Stock Movements
              </h3>
            </div>

            {movements.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No movement logs recorded yet.</p>
            ) : (
              <div className="space-y-2">
                {movements.slice(0, 5).map((m) => {
                  const isPositive = m.quantityChange > 0;
                  return (
                    <div
                      key={m.id}
                      className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              isPositive ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {isPositive ? `+${m.quantityChange}` : m.quantityChange} packs
                          </span>
                          <span className="text-slate-400 text-[11px]">
                            ({m.type.replace(/_/g, " ")})
                          </span>
                          {m.batchNumber && (
                            <span className="font-mono text-[10px] px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 rounded">
                              Batch: {m.batchNumber}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Ref: {m.referenceId} • User: {m.userName}
                        </p>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(m.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Batch Modal */}
      {isAddingBatch && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Record New Batch Intake
              </h2>
              <button
                onClick={() => setIsAddingBatch(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddBatch} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Batch Number *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NX-2026-B9"
                  value={newBatchNumber}
                  onChange={(e) => setNewBatchNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Mfg Date
                  </label>
                  <input
                    type="date"
                    value={newMfgDate}
                    onChange={(e) => setNewMfgDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Expiry Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newExpiryDate}
                    onChange={(e) => setNewExpiryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Received Quantity (Packs) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Status
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                  >
                    <option value="active">Active (Available)</option>
                    <option value="quarantine">Quarantine (Blocked)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingBatch(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Batch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
