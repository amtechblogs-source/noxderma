"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
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
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { imageStorageService } from "@/lib/image-storage/service";
import type { Product, ProductPricing, DynamicCategory, ProductImage } from "@/types";

export function ProductCatalogView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isAdding, setIsAdding] = useState<boolean>(false);

  // Add Product Form State
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [name, setName] = useState("");
  const [genericName, setGenericName] = useState("");
  const [brand, setBrand] = useState("Noxderma Pharma");
  const [manufacturerId, setManufacturerId] = useState("mfr_nox_laboratories");
  const [manufacturerName, setManufacturerName] = useState("Nox Laboratories PK");
  const [categoryId, setCategoryId] = useState("");
  const [packSize, setPackSize] = useState("Pack of 30 Tablets");
  const [unitsPerPack, setUnitsPerPack] = useState(30);
  const [unitOfMeasure, setUnitOfMeasure] = useState<Product["unitOfMeasure"]>("pack");
  const [reorderThreshold, setReorderThreshold] = useState(15);
  const [description, setDescription] = useState("");

  // Commercial Pricing State (Kept separated)
  const [purchaseCost, setPurchaseCost] = useState(380);
  const [tradePrice, setTradePrice] = useState(650);
  const [mrp, setMrp] = useState(800);

  // Uploaded Images
  const [uploadedImages, setUploadedImages] = useState<ProductImage[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const refreshCatalog = async () => {
    const [prodList, catList] = await Promise.all([
      offlineDb.products.toArray(),
      offlineDb.categories.where("active").equals(1).toArray(),
    ]);

    if (prodList.length === 0) {
      // Preload clinical sample catalog
      const now = new Date().toISOString();
      const sampleProducts: Product[] = [
        {
          id: "prod_amox_500",
          sku: "NXD-AMX-500",
          barcode: "8964000123456",
          name: "NoxAmox 500mg Capsules",
          genericName: "Amoxicillin Trihydrate 500mg",
          brand: "Noxderma Clinical",
          manufacturerId: "mfr_bayer_pk",
          manufacturerName: "Bayer Healthcare PK",
          categoryId: "cat_pharmacy",
          categoryName: "Pharmacy & Prescriptions",
          packSize: "Pack of 30 Capsules",
          unitOfMeasure: "pack",
          unitsPerPack: 30,
          reorderThreshold: 20,
          requiresBatchTracking: true,
          status: "active",
          images: [
            {
              id: "img_01",
              url: "https://ik.imagekit.io/h7g4dsggt/products/amox.jpg",
              thumbnailUrl: "https://ik.imagekit.io/h7g4dsggt/products/amox.jpg?tr=w-200,h-200,cm-pad_resize",
              provider: "imagekit",
              isPrimary: true,
              uploadedAt: now,
            },
          ],
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "prod_dermo_cream",
          sku: "NXD-DRM-050",
          barcode: "8964000987654",
          name: "NoxDerm Hydro-Barrier Cream 50g",
          genericName: "Ceramide + Hyaluronic Acid Formula",
          brand: "Noxderma Derma-Care",
          manufacturerId: "mfr_nox_laboratories",
          manufacturerName: "Nox Laboratories PK",
          categoryId: "cat_cosmetics",
          categoryName: "Cosmeceuticals & Skincare",
          packSize: "Tube of 50g",
          unitOfMeasure: "tube",
          unitsPerPack: 1,
          reorderThreshold: 15,
          requiresBatchTracking: true,
          status: "active",
          images: [],
          createdAt: now,
          updatedAt: now,
        },
      ];

      await offlineDb.products.bulkPut(sampleProducts);
      setProducts(sampleProducts);
    } else {
      setProducts(prodList);
    }

    setCategories(catList);
    if (catList.length > 0 && !categoryId) {
      setCategoryId(catList[0].id);
    }
  };

  useEffect(() => {
    refreshCatalog();
  }, []);

  // Handle direct ImageKit / offline upload
  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingImage(true);
    setUploadError(null);

    try {
      const file = files[0];
      const uploaded = await imageStorageService.saveProductImage({
        productId: sku || `temp_${Date.now()}`,
        file,
        isPrimary: uploadedImages.length === 0,
      });

      setUploadedImages([...uploadedImages, uploaded]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Image upload failed";
      setUploadError(message);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) {
      alert("Please provide at least a Product Name and SKU.");
      return;
    }

    const now = new Date().toISOString();
    const productId = `prod_${Date.now()}`;
    const selectedCat = categories.find((c) => c.id === categoryId);

    const newProduct: Product = {
      id: productId,
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim(),
      name: name.trim(),
      genericName: genericName.trim(),
      brand: brand.trim(),
      manufacturerId,
      manufacturerName,
      categoryId: selectedCat?.id || "cat_pharmacy",
      categoryName: selectedCat?.name || "General Formulations",
      packSize: packSize.trim(),
      unitOfMeasure,
      unitsPerPack: Number(unitsPerPack) || 1,
      reorderThreshold: Number(reorderThreshold) || 10,
      requiresBatchTracking: true,
      images: uploadedImages,
      status: "active",
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
    };

    const newPricing: ProductPricing = {
      productId,
      purchaseCostPerPack: Number(purchaseCost) || 0,
      tradePricePerPack: Number(tradePrice) || 0,
      mrpPerPack: Number(mrp) || 0,
      taxPercentage: 0,
      discountMaxPercentage: 15,
      updatedAt: now,
    };

    await offlineDb.transaction("rw", [offlineDb.products, offlineDb.productPricing], async () => {
      await offlineDb.products.add(newProduct);
      await offlineDb.productPricing.add(newPricing);
    });

    await refreshCatalog();
    setIsAdding(false);
    // Reset Form
    setName("");
    setSku("");
    setBarcode("");
    setGenericName("");
    setUploadedImages([]);
  };

  const filtered = products.filter((p) => {
    if (selectedCategory !== "all" && p.categoryId !== selectedCategory) return false;
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
            <PackageCheck className="w-6 h-6 text-teal-600" />
            Product Catalog & Image Gallery
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Enterprise clinical catalog with ImageKit asset delivery, pack conversion rules, and pricing protection.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel Entry" : "Register New Product"}
        </button>
      </div>

      {/* Add Product Modal Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateProduct}
          className="p-5 md:p-6 rounded-2xl border border-teal-500/30 bg-white dark:bg-slate-900 shadow-xl space-y-5 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Product Registration & Image Upload
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Product Commercial Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NoxDerm Hydro-Barrier Cream 50g"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Generic / Clinical Formulation</label>
              <input
                type="text"
                value={genericName}
                onChange={(e) => setGenericName(e.target.value)}
                placeholder="e.g. Ceramide + Hyaluronic Acid"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Business Division / Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
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
              <label className="block font-semibold mb-1">SKU / Unique Product Code *</label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="e.g. NXD-DRM-050"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Barcode (EAN-13 / GS1)</label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="e.g. 8964000987654"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Brand Name</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Pack Size Description</label>
              <input
                type="text"
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
                placeholder="e.g. Pack of 30, Tube of 50g"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Units Per Pack (Conversion)</label>
              <input
                type="number"
                min={1}
                value={unitsPerPack}
                onChange={(e) => setUnitsPerPack(Number(e.target.value) || 1)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Reorder Alert Threshold</label>
              <input
                type="number"
                min={1}
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(Number(e.target.value) || 10)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>
          </div>

          {/* Pricing Controls (Confidential) */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3">
            <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px] flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-teal-600" />
              Commercial Pricing Schedule (PKR)
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-semibold mb-1">Purchase Cost (Landed / Pack)</label>
                <input
                  type="number"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Trade Price (To Pharmacies)</label>
                <input
                  type="number"
                  value={tradePrice}
                  onChange={(e) => setTradePrice(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-teal-600"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Maximum Retail Price (MRP)</label>
                <input
                  type="number"
                  value={mrp}
                  onChange={(e) => setMrp(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* Image Upload Area via ImageStorageService */}
          <div className="space-y-3">
            <span className="font-bold uppercase tracking-wider text-slate-500 text-[10px] flex items-center gap-1">
              <Camera className="w-3.5 h-3.5 text-teal-600" />
              Product Photographs (ImageKit Storage)
            </span>

            <div className="flex flex-wrap items-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-teal-500/50 bg-teal-50/30 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-50">
                <Upload className="w-4 h-4" />
                {isUploadingImage ? "Uploading to ImageKit..." : "Upload Photo"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={isUploadingImage}
                  onChange={handleImageFileChange}
                  className="hidden"
                />
              </label>

              {uploadError && (
                <span className="text-rose-600 text-[11px] font-semibold">{uploadError}</span>
              )}
            </div>

            {uploadedImages.length > 0 && (
              <div className="flex items-center gap-3 pt-2">
                {uploadedImages.map((img, i) => (
                  <div
                    key={img.id || i}
                    className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.thumbnailUrl || img.url} alt="Uploaded" className="w-full h-full object-cover" />
                    {img.isPrimary && (
                      <span className="absolute bottom-0 inset-x-0 bg-teal-600 text-[9px] text-white text-center font-bold">
                        Primary
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/30"
            >
              Save Product Record
            </button>
          </div>
        </form>
      )}

      {/* Filters & Search */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, SKU, or barcode..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Layers className="w-3.5 h-3.5" /> Category:
          </span>
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all ${
              selectedCategory === "all"
                ? "bg-teal-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            All Categories
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all ${
                selectedCategory === c.id
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Catalog Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((prod) => {
          const primaryImg = prod.images.find((i) => i.isPrimary) || prod.images[0];

          return (
            <div
              key={prod.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-teal-500/50 transition-all text-xs"
            >
              <div className="space-y-3">
                <div className="flex gap-3 items-start">
                  <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0 overflow-hidden border border-slate-200 dark:border-slate-700 relative flex items-center justify-center">
                    {primaryImg?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={primaryImg.thumbnailUrl || primaryImg.url}
                        alt={prod.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <PackageCheck className="w-7 h-7 text-slate-400" />
                    )}
                  </div>

                  <div className="space-y-1 min-w-0">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                      {prod.categoryName}
                    </span>
                    <h3 className="font-extrabold text-slate-900 dark:text-slate-100 truncate">
                      {prod.name}
                    </h3>
                    <p className="font-mono text-[11px] text-slate-400">SKU: {prod.sku}</p>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-[11px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Pack Formulation:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{prod.packSize}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Units Per Pack:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{prod.unitsPerPack}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Reorder Alert:</span>
                    <span className="font-bold text-amber-600">{prod.reorderThreshold} packs</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  ACTIVE CATALOG
                </span>

                <div className="flex items-center gap-3">
                  <Link
                    href={`/products/${prod.id}`}
                    className="inline-flex items-center gap-1 text-teal-600 font-bold hover:underline"
                  >
                    <Eye className="w-3.5 h-3.5" /> View Profile
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
