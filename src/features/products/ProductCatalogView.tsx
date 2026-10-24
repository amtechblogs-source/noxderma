"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  PackageCheck,
  Plus,
  Search,
  Filter,
  Layers,
  ArrowLeft,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Barcode,
  Tag,
  DollarSign,
  Boxes,
  Eye,
  Edit2,
  X,
  Save,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { imageStorageService } from "@/lib/image-storage/service";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import type { Product, ProductPricing, DynamicCategory, ProductImage } from "@/types";

export function ProductCatalogView() {
  const { currentUser } = useAuth();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Add Product Form State
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [brand, setBrand] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [packSize, setPackSize] = useState("");
  const [unitsPerPack, setUnitsPerPack] = useState(1);
  const [unitOfMeasure, setUnitOfMeasure] = useState<Product["unitOfMeasure"]>("pack");
  const [reorderThreshold, setReorderThreshold] = useState(10);
  const [description, setDescription] = useState("");

  // Commercial Pricing State
  const [purchaseCost, setPurchaseCost] = useState(0);
  const [tradePrice, setTradePrice] = useState(0);
  const [mrp, setMrp] = useState(0);

  // Initial Opening Stock State
  const [initialStock, setInitialStock] = useState<number>(0);
  const [initialBatchNumber, setInitialBatchNumber] = useState<string>("");
  const [initialExpiryDate, setInitialExpiryDate] = useState<string>("");

  // Uploaded Images
  const [uploadedImages, setUploadedImages] = useState<ProductImage[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // --- EDIT PRODUCT MODAL STATE ---
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
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
  const [editImages, setEditImages] = useState<ProductImage[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const refreshCatalog = async () => {
    const prodList = await offlineDb.products.toArray();
    setProducts(prodList);

    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  };

  useEffect(() => {
    refreshCatalog();
  }, [categories]);

  // Handle direct ImageKit upload for new product
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadError(null);

    try {
      const storedImage = await imageStorageService.saveProductImage({
        file,
        productId: sku || "new_product",
        isPrimary: uploadedImages.length === 0,
      });

      setUploadedImages((prev) => [
        ...prev,
        {
          ...storedImage,
          isPrimary: prev.length === 0,
        },
      ]);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  // Handle image upload for editing product
  const handleEditImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;

    setIsUploadingImage(true);
    setUploadError(null);

    try {
      const storedImage = await imageStorageService.saveProductImage({
        file,
        productId: editSku || editingProduct.id,
        isPrimary: editImages.length === 0,
      });

      setEditImages((prev) => [
        ...prev,
        {
          ...storedImage,
          isPrimary: prev.length === 0,
        },
      ]);
    } catch (err: any) {
      setUploadError(err.message || "Failed to upload image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) return;

    const now = new Date().toISOString();
    const prodId = `prod_${Date.now()}`;
    const selectedCat = categories.find((c) => c.id === categoryId);

    const newProduct: Product = {
      id: prodId,
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim() || undefined,
      name: name.trim(),
      genericName: genericName.trim() || undefined,
      brand: brand.trim(),
      manufacturerId,
      manufacturerName,
      categoryId: categoryId || categories[0]?.id || "cat_general",
      categoryName: selectedCat?.name || "General Medicine",
      packSize: packSize.trim(),
      unitOfMeasure,
      unitsPerPack: Number(unitsPerPack) || 1,
      reorderThreshold: Number(reorderThreshold) || 10,
      requiresBatchTracking: true,
      description: description.trim() || undefined,
      images: uploadedImages,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    const newPricing: ProductPricing = {
      productId: prodId,
      purchaseCostPerPack: Number(purchaseCost) || 0,
      tradePricePerPack: Number(tradePrice) || 0,
      mrpPerPack: Number(mrp) || 0,
      taxPercentage: 0,
      discountMaxPercentage: 15,
      updatedAt: now,
    };

    const tablesToLock: any[] = [offlineDb.products, offlineDb.productPricing];
    const hasOpeningStock = Number(initialStock) > 0;
    if (hasOpeningStock) {
      tablesToLock.push(offlineDb.inventoryBatches, offlineDb.stockMovements);
    }

    await offlineDb.transaction("rw", tablesToLock, async () => {
      await offlineDb.products.add(newProduct);
      await offlineDb.productPricing.add(newPricing);

      if (hasOpeningStock) {
        const batchId = `bch_${Date.now()}`;
        const bchNum = initialBatchNumber.trim().toUpperCase() || `BCH-${Date.now().toString().slice(-4)}`;
        const expDate = initialExpiryDate || new Date(Date.now() + 2 * 365 * 86400000).toISOString().slice(0, 10);
        const qty = Number(initialStock);

        await offlineDb.inventoryBatches.add({
          id: batchId,
          productId: prodId,
          productName: newProduct.name,
          batchNumber: bchNum,
          manufacturerId: manufacturerId || "mfr_primary",
          manufacturingDate: now.slice(0, 10),
          expiryDate: expDate,
          receivedQuantity: qty,
          remainingQuantity: qty,
          blockedQuantity: 0,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });

        await offlineDb.stockMovements.add({
          id: `mov_init_${Date.now()}`,
          productId: prodId,
          productName: newProduct.name,
          batchId: batchId,
          batchNumber: bchNum,
          type: "purchase_receipt",
          quantityChange: qty,
          balanceAfter: qty,
          referenceId: `INIT-${bchNum}`,
          referenceType: "goods_receipt",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Admin",
          reason: "Initial warehouse stock added during product setup",
          timestamp: now,
        });
      }
    });

    await refreshCatalog();
    setIsAdding(false);
    // Reset Form
    setName("");
    setSku("");
    setBarcode("");
    setGenericName("");
    setDescription("");
    setInitialStock(0);
    setInitialBatchNumber("");
    setInitialExpiryDate("");
    setUploadedImages([]);
    setSuccessNotice(
      `Medicine "${newProduct.name}" shamil ho chuki hai!${hasOpeningStock ? ` (${initialStock} boxes stock shamil)` : ""}`
    );
    setTimeout(() => setSuccessNotice(null), 4000);
  };

  // Open Edit Product Modal
  const openEditModal = async (prod: Product) => {
    setEditingProduct(prod);
    setEditName(prod.name);
    setEditGenericName(prod.genericName || "");
    setEditBrand(prod.brand || "Noxderma Pharma");
    setEditCategoryId(prod.categoryId);
    setEditSku(prod.sku);
    setEditBarcode(prod.barcode || "");
    setEditPackSize(prod.packSize);
    setEditUnitsPerPack(prod.unitsPerPack || 1);
    setEditUnitOfMeasure(prod.unitOfMeasure || "pack");
    setEditReorderThreshold(prod.reorderThreshold || 10);
    setEditDescription(prod.description || "");
    setEditImages(prod.images || []);

    // Load Pricing
    try {
      const p = await offlineDb.productPricing.get(prod.id);
      if (p) {
        setEditPurchaseCost(p.purchaseCostPerPack || 0);
        setEditTradePrice(p.tradePricePerPack || 0);
        setEditMrp(p.mrpPerPack || 0);
      } else {
        setEditPurchaseCost(0);
        setEditTradePrice(0);
        setEditMrp(0);
      }
    } catch {
      setEditPurchaseCost(0);
      setEditTradePrice(0);
      setEditMrp(0);
    }
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editName.trim() || !editSku.trim()) return;

    setIsSavingEdit(true);
    const now = new Date().toISOString();
    const chosenCat = categories.find((c) => c.id === editCategoryId);

    const updatedProduct: Product = {
      ...editingProduct,
      name: editName.trim(),
      genericName: editGenericName.trim() || undefined,
      brand: editBrand.trim(),
      categoryId: editCategoryId,
      categoryName: chosenCat?.name || editingProduct.categoryName,
      sku: editSku.trim().toUpperCase(),
      barcode: editBarcode.trim() || undefined,
      packSize: editPackSize.trim(),
      unitsPerPack: Number(editUnitsPerPack) || 1,
      unitOfMeasure: editUnitOfMeasure,
      reorderThreshold: Number(editReorderThreshold) || 10,
      description: editDescription.trim() || undefined,
      images: editImages,
      updatedAt: now,
    };

    const updatedPricing: ProductPricing = {
      productId: editingProduct.id,
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

      await refreshCatalog();
      setEditingProduct(null);
      setSuccessNotice(`Medicine "${updatedProduct.name}" kamyabi se update ho gai!`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err) {
      console.error("Failed to update product:", err);
      alert("Error updating product in local storage.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Complete Category Data Isolation:
  const filtered = products.filter((p) => {
    if (selectedCategoryId !== "all" && p.categoryId !== selectedCategoryId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q)) ||
        p.brand.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeCategoryObj =
    selectedCategoryId === "all"
      ? null
      : categories.find((c) => c.id === selectedCategoryId);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 btn-interactive"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <PackageCheck className="w-7 h-7 text-teal-600" />
            Medicine List & Photos (Products)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            All your medicines, pack sizes, purchase costs, and selling prices.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-bold shadow-soft shadow-teal-600/20 btn-interactive"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel" : "Add New Medicine"}
        </button>
      </div>

      {/* Success Notification */}
      {successNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          {successNotice}
        </div>
      )}

      {/* Active Category Filter Banner (Data Isolation Indication) */}
      {activeCategoryObj && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs sm:text-sm animate-in fade-in">
          <div className="flex items-center gap-2 text-teal-800 dark:text-teal-200 font-semibold">
            <Layers className="w-4 h-4 text-teal-600 shrink-0" />
            <span>
              Header Category Filter Active: <strong>{activeCategoryObj.name}</strong> ({filtered.length} medicines found)
            </span>
          </div>
          <button
            onClick={() => setSelectedCategoryId("all")}
            className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold hover:bg-teal-100 text-xs border border-slate-200 dark:border-slate-700 shadow-sm btn-interactive self-start sm:self-auto"
          >
            Show All Categories
          </button>
        </div>
      )}

      {/* Add Product Modal Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateProduct}
          className="p-5 md:p-6 rounded-2xl border border-teal-500/30 bg-white dark:bg-slate-900 shadow-card space-y-5 text-xs sm:text-sm animate-in fade-in"
        >
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add New Medicine / Product
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Medicine Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NoxDerm Hydro-Barrier Cream 50g"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Formula / Generic Name (Optional)</label>
              <input
                type="text"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                placeholder="e.g. Ceramide + Hyaluronic Acid"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Item Code (SKU) *</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. NXD-DRM-050"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono uppercase text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Barcode</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. 8964000987654"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Brand / Company</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Pack Details (Box / Bottle / Tube)</label>
              <input
                type="text"
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
                placeholder="e.g. Pack of 30 Tablets"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Items per Pack</label>
              <input
                type="number"
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(Number(e.target.value) || 1)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Low-Stock Alert Level</label>
              <input
                type="number"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(Number(e.target.value) || 10)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Pricing Row */}
          <div className="p-4 sm:p-5 rounded-2xl border border-teal-500/20 bg-teal-50/20 dark:bg-slate-800/40 space-y-3.5">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4" />
              Medicine Pricing (Rates in PKR)
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5">Buying Cost (Kharid Rate)</label>
                <input
                  type="number"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(Number(e.target.value) || 0)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-teal-600 dark:text-teal-400">
                  Sale Rate to Medical Stores
                </label>
                <input
                  type="number"
                  value={tradePrice}
                  onChange={(e) => setTradePrice(Number(e.target.value) || 0)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-slate-500">Customer Print Price (MRP)</label>
                <input
                  type="number"
                  value={mrp}
                  onChange={(e) => setMrp(Number(e.target.value) || 0)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Opening Warehouse Stock Section (Instant Availability) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-teal-500/30 bg-teal-50/30 dark:bg-slate-800/50 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                <Boxes className="w-4 h-4" />
                Warehouse Stock (Opening Stock - Optional)
              </span>
              <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">
                Shamil karte hi bill or inventory ma show ho ga
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-slate-700 dark:text-slate-300">
                  Initial Stock (Opening Boxes / Packs)
                </label>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 50"
                  value={initialStock || ""}
                  onChange={(e) => setInitialStock(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-mono text-teal-700 dark:text-teal-300 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-slate-700 dark:text-slate-300">
                  Batch Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. BCH-01 (Auto if empty)"
                  value={initialBatchNumber}
                  onChange={(e) => setInitialBatchNumber(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-slate-700 dark:text-slate-300">
                  Expiry Date (Optional)
                </label>
                <input
                  type="date"
                  value={initialExpiryDate}
                  onChange={(e) => setInitialExpiryDate(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
          </div>

          {/* Image Upload Area */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2.5">
            <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
              Product Photos (ImageKit.io Cloud Upload)
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-dashed border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-600 cursor-pointer font-bold text-sm btn-interactive">
                <Upload className="w-4 h-4" />
                {isUploadingImage ? "Uploading to ImageKit..." : "Upload Medicine Picture"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  disabled={isUploadingImage}
                  className="hidden"
                />
              </label>
              <span className="text-slate-400 text-xs">
                {uploadedImages.length > 0
                  ? `${uploadedImages.length} photo(s) attached`
                  : "Photos will be stored on ImageKit CDN"}
              </span>
            </div>
            {uploadError && <p className="text-rose-600 text-xs font-semibold">{uploadError}</p>}
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm btn-interactive"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-7 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-soft shadow-teal-600/20 btn-interactive"
            >
              Save Medicine (Mehfooz Karein)
            </button>
          </div>
        </form>
      )}

      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search medicine name, SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Category Pills (Synced with global CategoryContext) */}
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1.5 scrollbar-thin">
          <span className="text-slate-400 text-xs font-semibold flex items-center gap-1 shrink-0">
            <Layers className="w-3.5 h-3.5" /> Category:
          </span>
          <button
            onClick={() => setSelectedCategoryId("all")}
            className={`min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs sm:text-sm shrink-0 btn-interactive transition-all ${
              selectedCategoryId === "all"
                ? "bg-teal-600 text-white shadow-soft"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategoryId(c.id)}
              className={`min-h-[40px] px-4 py-2 rounded-xl font-bold text-xs sm:text-sm shrink-0 btn-interactive transition-all ${
                selectedCategoryId === c.id
                  ? "bg-teal-600 text-white shadow-soft"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {filtered.length === 0 ? (
          <div className="col-span-full p-12 text-center text-slate-400 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-soft">
            <Boxes className="w-12 h-12 mx-auto mb-2 opacity-40 text-teal-600" />
            <h3 className="font-extrabold text-slate-700 dark:text-slate-300 text-base">
              No Medicines Found in this Category
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {selectedCategoryId !== "all"
                ? "Is category mein abhi koi medicine shamil nahi hai."
                : "Aap ki search se koi medicine match nahi hui."}
            </p>
          </div>
        ) : (
          filtered.map((prod) => {
            const primaryImg = prod.images.find((i) => i.isPrimary) || prod.images[0];

            return (
              <div
                key={prod.id}
                className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft hover:shadow-card-hover card-interactive flex flex-col justify-between transition-all"
              >
                <div className="space-y-3.5">
                  <div className="flex gap-3.5 items-start">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700 relative flex items-center justify-center">
                      {primaryImg?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={primaryImg.thumbnailUrl || primaryImg.url}
                          alt={prod.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <PackageCheck className="w-8 h-8 text-slate-400" />
                      )}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                        {prod.categoryName}
                      </span>
                      <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm sm:text-base leading-snug line-clamp-2">
                        {prod.name}
                      </h3>
                      <p className="font-mono text-xs text-slate-500 font-medium">Code: {prod.sku}</p>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs sm:text-sm space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Pack Details:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{prod.packSize}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Items per Pack:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{prod.unitsPerPack}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Low Stock Alert:</span>
                      <span className="font-bold text-amber-600">{prod.reorderThreshold} packs</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3.5 mt-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    IN STOCK
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(prod)}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900 text-teal-700 dark:text-teal-300 font-bold text-xs sm:text-sm btn-interactive"
                      title="Edit Product Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </button>

                    <Link
                      href={`/products/detail?id=${encodeURIComponent(prod.id)}`}
                      className="min-h-[38px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs sm:text-sm btn-interactive"
                    >
                      <Eye className="w-3.5 h-3.5" /> Details
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* EDIT PRODUCT MODAL                                                        */}
      {/* ========================================================================= */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-card-hover max-w-2xl w-full p-5 sm:p-7 space-y-5 my-8 text-xs sm:text-sm animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center">
                  <Edit2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                    Edit Medicine Details
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Update name, category, pack size, code, and pricing
                  </p>
                </div>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="min-h-[38px] min-w-[38px] p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center justify-center btn-interactive"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateProduct} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Medicine Name *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Formula / Generic Name</label>
                  <input
                    type="text"
                    value={editGenericName}
                    onChange={(e) => setEditGenericName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Category</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Item Code (SKU) *</label>
                  <input
                    type="text"
                    required
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value.toUpperCase())}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Barcode</label>
                  <input
                    type="text"
                    value={editBarcode}
                    onChange={(e) => setEditBarcode(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Brand / Company</label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Pack Details (e.g. Pack of 30 Tablets)</label>
                  <input
                    type="text"
                    value={editPackSize}
                    onChange={(e) => setEditPackSize(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Items per Pack</label>
                  <input
                    type="number"
                    value={editUnitsPerPack}
                    onChange={(e) => setEditUnitsPerPack(Number(e.target.value) || 1)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Low-Stock Alert Level</label>
                  <input
                    type="number"
                    value={editReorderThreshold}
                    onChange={(e) => setEditReorderThreshold(Number(e.target.value) || 10)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Pricing Section */}
              <div className="p-4 sm:p-5 rounded-2xl border border-teal-500/20 bg-teal-50/20 dark:bg-slate-800/40 space-y-3.5">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4" />
                  Medicine Rates (Prices in PKR)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold mb-1.5">Buying Cost (Kharid Rate)</label>
                    <input
                      type="number"
                      value={editPurchaseCost}
                      onChange={(e) => setEditPurchaseCost(Number(e.target.value) || 0)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-bold mb-1.5 text-teal-600 dark:text-teal-400">
                      Sale Rate to Medical Stores
                    </label>
                    <input
                      type="number"
                      value={editTradePrice}
                      onChange={(e) => setEditTradePrice(Number(e.target.value) || 0)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-bold mb-1.5 text-slate-500">
                      Customer Print Price (MRP)
                    </label>
                    <input
                      type="number"
                      value={editMrp}
                      onChange={(e) => setEditMrp(Number(e.target.value) || 0)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              </div>

              {/* Photo Upload for Editing */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
                  Update Medicine Picture (ImageKit)
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="min-h-[40px] inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/40 text-teal-600 cursor-pointer font-bold text-xs sm:text-sm btn-interactive">
                    <Upload className="w-4 h-4" />
                    {isUploadingImage ? "Uploading..." : "Upload New Photo"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditImageFileChange}
                      disabled={isUploadingImage}
                      className="hidden"
                    />
                  </label>
                  <span className="text-slate-400 text-xs">
                    {editImages.length > 0
                      ? `${editImages.length} photo(s) attached`
                      : "No photo attached yet"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm btn-interactive"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold flex items-center gap-2 text-sm shadow-soft shadow-teal-600/20 disabled:opacity-50 btn-interactive"
                >
                  <Save className="w-4 h-4" />
                  {isSavingEdit ? "Saving Changes..." : "Save Changes (Update Karein)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
