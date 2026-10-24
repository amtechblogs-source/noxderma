"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Edit2,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import type {
  Product,
  ProductPricing,
  InventoryBatch,
  StockMovement,
} from "@/types";

/**
 * Static-export friendly: the product id is read from `?id=` at runtime
 * (data lives in IndexedDB, so there is nothing to pre-render per product).
 */
export default function ProductDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-slate-500 min-h-[400px] flex items-center justify-center">
          <p className="font-semibold text-sm">Loading product profile...</p>
        </div>
      }
    >
      <ProductDetailContent />
    </Suspense>
  );
}

function ProductDetailContent() {
  const { currentUser } = useAuth();
  const productId = useSearchParams().get("id") ?? "";

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

  // Edit Product Modal State
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [editName, setEditName] = useState("");
  const [editGenericName, setEditGenericName] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editSku, setEditSku] = useState("");
  const [editBarcode, setEditBarcode] = useState("");
  const [editPackSize, setEditPackSize] = useState("");
  const [editUnitsPerPack, setEditUnitsPerPack] = useState(30);
  const [editUnitOfMeasure, setEditUnitOfMeasure] = useState<Product["unitOfMeasure"]>("pack");
  const [editReorderThreshold, setEditReorderThreshold] = useState(15);
  const [editDescription, setEditDescription] = useState("");
  const [editPurchaseCost, setEditPurchaseCost] = useState(0);
  const [editTradePrice, setEditTradePrice] = useState(0);
  const [editMrp, setEditMrp] = useState(0);
  const [isSavingProductEdit, setIsSavingProductEdit] = useState(false);

  const openEditProductModal = () => {
    if (!product) return;
    setEditName(product.name);
    setEditGenericName(product.genericName || "");
    setEditBrand(product.brand);
    setEditCategoryId(product.categoryId);
    setEditSku(product.sku);
    setEditBarcode(product.barcode || "");
    setEditPackSize(product.packSize);
    setEditUnitsPerPack(product.unitsPerPack || 1);
    setEditUnitOfMeasure(product.unitOfMeasure || "pack");
    setEditReorderThreshold(product.reorderThreshold || 10);
    setEditDescription(product.description || "");
    setEditPurchaseCost(pricing?.purchaseCostPerPack || 0);
    setEditTradePrice(pricing?.tradePricePerPack || 0);
    setEditMrp(pricing?.mrpPerPack || 0);
    setIsEditingProduct(true);
  };

  const handleSaveProductEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !editName.trim() || !editSku.trim()) return;

    setIsSavingProductEdit(true);
    const now = new Date().toISOString();
    const chosenCat = categories.find((c) => c.id === editCategoryId);

    const updatedProduct: Product = {
      ...product,
      name: editName.trim(),
      genericName: editGenericName.trim() || undefined,
      brand: editBrand.trim(),
      categoryId: editCategoryId,
      categoryName: chosenCat?.name || product.categoryName,
      sku: editSku.trim().toUpperCase(),
      barcode: editBarcode.trim() || undefined,
      packSize: editPackSize.trim(),
      unitsPerPack: Number(editUnitsPerPack) || 1,
      unitOfMeasure: editUnitOfMeasure,
      reorderThreshold: Number(editReorderThreshold) || 10,
      description: editDescription.trim() || undefined,
      updatedAt: now,
    };

    const updatedPricing: ProductPricing = {
      productId: product.id,
      purchaseCostPerPack: Number(editPurchaseCost) || 0,
      tradePricePerPack: Number(editTradePrice) || 0,
      mrpPerPack: Number(editMrp) || 0,
      taxPercentage: 0,
      discountMaxPercentage: 15,
      updatedAt: now,
    };

    try {
      await offlineDb.transaction("rw", [offlineDb.products, offlineDb.productPricing], async () => {
        await offlineDb.products.put(updatedProduct);
        await offlineDb.productPricing.put(updatedPricing);
      });
      setProduct(updatedProduct);
      setPricing(updatedPricing);
      setIsEditingProduct(false);
      await loadData();
    } catch (err) {
      console.error("Failed to save product:", err);
      alert("Error saving product changes.");
    } finally {
      setIsSavingProductEdit(false);
    }
  };

  const loadData = async () => {
    try {
      const [prod, price, bList, mList, catList] = await Promise.all([
        offlineDb.products.get(productId),
        offlineDb.productPricing.get(productId),
        offlineDb.inventoryBatches.where("productId").equals(productId).toArray(),
        offlineDb.stockMovements
          .where("productId")
          .equals(productId)
          .reverse()
          .sortBy("timestamp"),
        offlineDb.categories.toArray(),
      ]);
      setCategories(catList);

      if (prod) {
        setProduct(prod);
        setSelectedImage(prod.images?.[0]?.url || null);
        setPricing(price || null);
      } else {
        setProduct(null);
        setPricing(null);
      }

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
      userId: currentUser?.id || "usr_admin",
      userName: currentUser?.displayName || "Admin",
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
          <button
            onClick={openEditProductModal}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5 text-teal-600" /> Edit Medicine
          </button>
          <Link
            href={`/marketing/whatsapp?sku=${product.sku}&name=${encodeURIComponent(product.name)}`}
            className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> Share on WhatsApp
          </Link>
          <button
            onClick={() => setIsAddingBatch(true)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Add New Batch
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
                  <span className="text-xs">No photo added</span>
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
                <span className="text-slate-500">Formula:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                  {product.genericName || "Standard Formulation"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Brand:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {product.brand}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Company / Manufacturer:</span>
                <span className="font-semibold text-teal-600 dark:text-teal-400">
                  {product.manufacturerName}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Pack Details:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {product.packSize} ({product.unitsPerPack} {product.unitOfMeasure}s)
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Barcode:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {product.barcode || "N/A"}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Low Stock Warning:</span>
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
              <span className="text-[10px] text-slate-500 block mt-0.5">Total boxes in godown</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider block mb-1">
                Ready to Sell
              </span>
              <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                {formatNumber(availableStock)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Can be billed right now</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
                Expiring Soon (&lt;3 Months)
              </span>
              <span className="text-2xl font-black text-amber-600">
                {nearExpiryBatches.reduce((acc, b) => acc + b.remainingQuantity, 0)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">
                {nearExpiryBatches.length} batch(es) - sell fast
              </span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
                Broken / Blocked
              </span>
              <span className="text-2xl font-black text-rose-600">
                {formatNumber(blockedStock)}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Damaged or stopped</span>
            </div>
          </div>

          {/* Commercial Pricing Schedule (With Cost Visibility Toggle) */}
          {pricing && (
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-teal-600" />
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Medicine Rates & Profit Margin (Kamai)
                  </h3>
                </div>
                <button
                  onClick={() => setShowCostPrices(!showCostPrices)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 font-semibold"
                >
                  {showCostPrices ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  {showCostPrices ? "Hide Buying Cost" : "Show Buying Cost"}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Buying Rate (Kharid):</span>
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-200 font-mono">
                    {showCostPrices ? formatPKR(pricing.purchaseCostPerPack) : "••••••"}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Sale Rate (To Stores):</span>
                  <span className="font-bold text-sm text-teal-600 dark:text-teal-400 font-mono">
                    {formatPKR(pricing.tradePricePerPack)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Customer Print Price (MRP):</span>
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100 font-mono">
                    {formatPKR(pricing.mrpPerPack)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <span className="text-slate-500 block">Profit Margin (% Munafa):</span>
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
                  Medicine Batches (Oldest Expiry First)
                </h3>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                {batches.length} batch(es)
              </span>
            </div>

            {batches.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 dark:bg-slate-800/30 rounded-lg">
                <p className="text-xs">No batches recorded for this medicine yet.</p>
                <button
                  onClick={() => setIsAddingBatch(true)}
                  className="mt-2 text-xs font-bold text-teal-600 hover:underline"
                >
                  Add First Batch
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Batch #</th>
                      <th className="p-2.5">Expiry Date</th>
                      <th className="p-2.5 text-right">Total Bought</th>
                      <th className="p-2.5 text-right">Stock in Hand</th>
                      <th className="p-2.5 text-center">Condition</th>
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
                                Broken / Blocked
                              </span>
                            ) : isExpired ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300">
                                Expired (Do Not Sell)
                              </span>
                            ) : isNear ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300">
                                Expiring Soon
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                                Good to Sell
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
                Recent Stock In & Out History
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
                            ({m.type === "sales_deduction" ? "Sold in Bill" : m.type.replace(/_/g, " ")})
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
                Add New Medicine Batch
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
                    Made Date (Optional)
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
                    Quantity Received (Packs / Boxes) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                    value={newQuantity === 0 ? "" : newQuantity}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setNewQuantity(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Stock Condition
                  </label>
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                  >
                    <option value="active">Good Stock (Ready to Sell)</option>
                    <option value="quarantine">Broken / Blocked (Do Not Sell)</option>
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

      {/* EDIT PRODUCT MODAL */}
      {isEditingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 my-8 text-xs animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center">
                  <Edit2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Edit Medicine Details
                  </h3>
                  <p className="text-slate-400 text-[11px]">
                    Update medicine name, packing, item code, rates, and category
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditingProduct(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProductEdit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block font-bold mb-1">Medicine Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Formula / Generic Name</label>
                  <input
                    type="text"
                    value={editGenericName}
                    onChange={(e) => setEditGenericName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Category</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold mb-1">Item Code (SKU) *</label>
                  <input
                    type="text"
                    required
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Barcode</label>
                  <input
                    type="text"
                    value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Brand / Company</label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Pack Details (e.g. Pack of 30 Tablets)</label>
                  <input
                    type="text"
                    value={editPackSize}
                    onChange={(e) => setEditPackSize(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Items per Pack</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={editUnitsPerPack === 0 ? "" : editUnitsPerPack}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setEditUnitsPerPack(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">Low-Stock Alert Level</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="10"
                    value={editReorderThreshold === 0 ? "" : editReorderThreshold}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setEditReorderThreshold(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Pricing Section */}
              <div className="p-4 rounded-xl border border-teal-500/20 bg-teal-50/20 dark:bg-slate-800/40 space-y-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5" />
                  Medicine Rates (Prices in PKR)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-bold mb-1">Buying Cost (Kharid Rate)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={editPurchaseCost === 0 ? "" : editPurchaseCost}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setEditPurchaseCost(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold mb-1 text-teal-600 dark:text-teal-400">
                      Sale Rate to Medical Stores
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={editTradePrice === 0 ? "" : editTradePrice}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setEditTradePrice(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 font-bold font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-bold mb-1 text-slate-500">
                      Customer Print Price (MRP)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      value={editMrp === 0 ? "" : editMrp}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setEditMrp(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditingProduct(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProductEdit}
                  className="px-6 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {isSavingProductEdit ? "Saving Changes..." : "Save Changes (Update Karein)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
