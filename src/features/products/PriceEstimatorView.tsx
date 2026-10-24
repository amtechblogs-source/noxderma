"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Calculator,
  ArrowLeft,
  ArrowRight,
  DollarSign,
  TrendingUp,
  Users2,
  Fuel,
  Package,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  Percent,
  Sliders,
  SlidersHorizontal,
  RotateCcw,
  PlusCircle,
  HelpCircle,
  Stethoscope,
  Truck,
  Building2,
  Share2,
  Printer,
  ChevronDown,
  ChevronUp,
  Info,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import { useCategory } from "@/context/CategoryContext";
import type {
  PriceEstimatorInputs,
  PriceEstimatorResults,
  BonusSchemeType,
  Product,
  ProductPricing,
} from "@/types";
import {
  calculatePriceEstimate,
  ESTIMATOR_PRESETS,
  getSchemeDiscountPercent,
} from "@/lib/pricing/calculator";

export function PriceEstimatorView() {
  const { currentUser } = useAuth();
  const { categories } = useCategory();

  // Active Inputs State initialized with Derma Serum Preset
  const [inputs, setInputs] = useState<PriceEstimatorInputs>(
    ESTIMATOR_PRESETS[0].inputs
  );

  // Existing Products in catalog for "Load Product" feature
  const [existingProducts, setExistingProducts] = useState<Product[]>([]);
  const [selectedExistingId, setSelectedExistingId] = useState<string>("");

  // What-If Simulator Overrides (for testing scenarios without modifying baseline)
  const [whatIfFuelDeltaPercent, setWhatIfFuelDeltaPercent] = useState<number>(0);
  const [whatIfVolumeMultiplier, setWhatIfVolumeMultiplier] = useState<number>(1);
  const [isWhatIfActive, setIsWhatIfActive] = useState<boolean>(false);

  // Collapsible section state for inputs
  const [openSections, setOpenSections] = useState<{
    direct: boolean;
    overheads: boolean;
    pharma: boolean;
    margins: boolean;
  }>({
    direct: true,
    overheads: true,
    pharma: true,
    margins: true,
  });

  // Save to Catalog modal state
  const [isSavingToCatalog, setIsSavingToCatalog] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [customSku, setCustomSku] = useState("");
  const [selectedCatId, setSelectedCatId] = useState("");

  // Mobile active tab view: inputs vs results
  const [mobileTab, setMobileTab] = useState<"inputs" | "results">("inputs");

  // Load existing products on mount
  useEffect(() => {
    async function loadData() {
      try {
        const prods = await offlineDb.products.toArray();
        setExistingProducts(prods);
        if (categories.length > 0) {
          setSelectedCatId(categories[0].id);
        }
      } catch (err) {
        console.warn("Could not load products for estimator:", err);
      }
    }
    loadData();
  }, [categories]);

  // Handle Preset Selection
  const handleApplyPreset = (presetId: string) => {
    const found = ESTIMATOR_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setInputs({ ...found.inputs });
      setIsWhatIfActive(false);
      setWhatIfFuelDeltaPercent(0);
      setWhatIfVolumeMultiplier(1);
    }
  };

  // Handle Loading an Existing Product from Dexie
  const handleLoadExistingProduct = async (prodId: string) => {
    setSelectedExistingId(prodId);
    if (!prodId) return;

    const prod = existingProducts.find((p) => p.id === prodId);
    if (!prod) return;

    try {
      const pricing = await offlineDb.productPricing.get(prodId);
      setInputs((prev) => ({
        ...prev,
        productName: prod.name,
        packSize: prod.packSize || prev.packSize,
        unitOfMeasure: prod.unitOfMeasure || prev.unitOfMeasure,
        buyingCostPerUnit: pricing?.purchaseCostPerPack || prev.buyingCostPerUnit,
        noxdermaTargetMarginPercent: 28,
        distributorMarginPercent: 10,
        pharmacyMarginPercent: 15,
      }));
    } catch (e) {
      console.warn("Failed to load pricing for product:", e);
    }
  };

  // Base Calculation
  const baselineResults: PriceEstimatorResults = useMemo(() => {
    return calculatePriceEstimate(inputs);
  }, [inputs]);

  // What-If Simulation Calculation
  const whatIfResults: PriceEstimatorResults = useMemo(() => {
    if (!isWhatIfActive) return baselineResults;

    const simulatedInputs: PriceEstimatorInputs = {
      ...inputs,
      fuelPerEmployee: inputs.fuelPerEmployee * (1 + whatIfFuelDeltaPercent / 100),
      expectedMonthlyVolume: Math.max(10, Math.round(inputs.expectedMonthlyVolume * whatIfVolumeMultiplier)),
    };

    return calculatePriceEstimate(simulatedInputs);
  }, [inputs, isWhatIfActive, whatIfFuelDeltaPercent, whatIfVolumeMultiplier, baselineResults]);

  // Active results currently viewed
  const results = isWhatIfActive ? whatIfResults : baselineResults;

  // Toggle accordion section
  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  // Save directly to Dexie Product Catalog
  const handleSaveToCatalog = async () => {
    if (!inputs.productName.trim()) {
      alert("Please enter a product name first.");
      return;
    }

    setIsSavingToCatalog(true);
    const now = new Date().toISOString();
    const prodId = `prod_est_${Date.now()}`;
    const cleanSku = customSku.trim() || `EST-${inputs.productName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 5).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

    const chosenCat = categories.find((c) => c.id === selectedCatId) || categories[0];

    const newProduct: Product = {
      id: prodId,
      sku: cleanSku,
      name: inputs.productName.trim(),
      brand: "Noxderma Pharma",
      manufacturerId: "mfr_noxderma",
      manufacturerName: "Noxderma Laboratories",
      categoryId: chosenCat?.id || "cat_general",
      categoryName: chosenCat?.name || "General Medicines",
      packSize: inputs.packSize || "Pack of 1",
      unitOfMeasure: inputs.unitOfMeasure || "pack",
      unitsPerPack: 1,
      reorderThreshold: 15,
      requiresBatchTracking: true,
      images: [],
      status: "active",
      description: `Auto-generated from Price Estimator with Landed Cost Rs. ${results.totalLandedCostPerUnit.toFixed(1)} and MRP Rs. ${results.retailPriceFinalMrp.toFixed(0)}`,
      createdAt: now,
      updatedAt: now,
    };

    const newPricing: ProductPricing = {
      productId: prodId,
      purchaseCostPerPack: Math.round(results.totalLandedCostPerUnit),
      distributorPricePerPack: Math.round(results.distributorPrice),
      tradePricePerPack: Math.round(results.tradePrice),
      mrpPerPack: Math.round(results.retailPriceFinalMrp),
      taxPercentage: inputs.taxGstPercent || 0,
      discountMaxPercentage: Math.round(getSchemeDiscountPercent(inputs.bonusSchemeType, inputs.customBonusPercent)),
      updatedAt: now,
    };

    try {
      await offlineDb.transaction("rw", [offlineDb.products, offlineDb.productPricing], async () => {
        await offlineDb.products.add(newProduct);
        await offlineDb.productPricing.add(newPricing);
      });

      const updatedProds = await offlineDb.products.toArray();
      setExistingProducts(updatedProds);
      setSaveSuccessMsg(`"${newProduct.name}" (${cleanSku}) catalog mein kamyabi se shamil ho gai!`);
      setTimeout(() => setSaveSuccessMsg(null), 5000);
    } catch (err: any) {
      console.error("Save product from estimator error:", err);
      alert("Error saving product: " + (err?.message || "Unknown error"));
    } finally {
      setIsSavingToCatalog(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-36 lg:pb-16 px-3 sm:px-6">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/products"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 btn-interactive"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Medicine Catalog
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calculator className="w-6 h-6 sm:w-7 sm:h-7 text-teal-600 shrink-0" />
              <span>Price Estimator & Simulator</span>
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 shrink-0">
              Margin Engine
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-500 mt-1 max-w-2xl">
            Calculate accurate landed costs considering field staff salaries, fuel allowances, doctor sampling, and generate optimal Distributor, Trade & MRP pricing.
          </p>
        </div>

        {/* Quick Toolbar */}
        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 btn-interactive shadow-sm"
            title="Print or Save PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Sheet
          </button>

          <button
            onClick={() => handleSaveToCatalog()}
            disabled={isSavingToCatalog}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-soft shadow-teal-600/20 btn-interactive"
          >
            <PlusCircle className="w-4 h-4" />
            {isSavingToCatalog ? "Saving..." : "Add to Catalog"}
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {saveSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          {saveSuccessMsg}
        </div>
      )}

      {/* Preset Templates Selector & Existing Product Loader */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-teal-50/80 via-emerald-50/40 to-slate-50 dark:from-slate-900 dark:via-teal-950/20 dark:to-slate-900 border border-teal-200/70 dark:border-teal-800/50 shadow-sm space-y-3">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-sm">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate sm:whitespace-normal">
              Select Industry Template or Existing Medicine
            </h3>
            <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-1 sm:line-clamp-none">
              Quickly load standard pharmaceutical, derma serum, or oral tablets cost structures.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
          {/* Preset Buttons */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 w-full sm:w-auto">
            {ESTIMATOR_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => handleApplyPreset(preset.id)}
                className="px-2.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:border-teal-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors btn-interactive text-center truncate"
              >
                {preset.title.split("(")[0]}
              </button>
            ))}
          </div>

          {/* Load existing medicine dropdown */}
          {existingProducts.length > 0 && (
            <div className="w-full sm:w-auto">
              <select
                value={selectedExistingId}
                onChange={(e) => handleLoadExistingProduct(e.target.value)}
                className="w-full sm:w-auto text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-teal-500 focus:outline-none shadow-sm"
              >
                <option value="">Load from Catalog...</option>
                {existingProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Segmented View Switcher (lg:hidden) */}
      <div className="lg:hidden flex items-center p-1 rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-xs font-bold shadow-inner">
        <button
          type="button"
          onClick={() => setMobileTab("inputs")}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === "inputs"
              ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>1. Cost Drivers</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("results")}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            mobileTab === "results"
              ? "bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>2. Pricing & Simulator</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        </button>
      </div>

      {/* Main Grid: Inputs on Left, Real-time Pricing Engine on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ========================================================= */}
        {/* LEFT COLUMN: Input Cost Drivers (7 Columns)               */}
        {/* ========================================================= */}
        <div className={`lg:col-span-7 space-y-4 ${mobileTab === "inputs" ? "block" : "hidden lg:block"}`}>
          {/* Section 1: Product Basics & Direct Production Cost */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection("direct")}
              className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2.5 text-left border-b border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Package className="w-5 h-5 text-teal-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate sm:whitespace-normal">
                    1. Product Identity & Factory Cost
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-1 sm:line-clamp-none">
                    Toll manufacturing, packaging & inward freight
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="text-[10px] sm:text-xs font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Rs. {results.directCostPerUnit.toFixed(1)}/pack
                </span>
                {openSections.direct ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {openSections.direct && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Medicine / Product Name
                    </label>
                    <input
                      type="text"
                      value={inputs.productName}
                      onChange={(e) =>
                        setInputs({ ...inputs, productName: e.target.value })
                      }
                      placeholder="e.g. Noxderma Vitamin-C Serum"
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pack Size / Presentation
                    </label>
                    <input
                      type="text"
                      value={inputs.packSize}
                      onChange={(e) =>
                        setInputs({ ...inputs, packSize: e.target.value })
                      }
                      placeholder="e.g. 30ml Dropper Bottle / 30 Tabs"
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Base Buying / Factory Cost
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        ₨
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={inputs.buyingCostPerUnit || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            buyingCostPerUnit: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Manufacturer invoice rate
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Packaging & Monocarton
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        ₨
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={inputs.packagingCostPerUnit || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            packagingCostPerUnit: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Box, blister, sticker, insert
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Inward Freight (Transport)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        ₨
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={inputs.inwardFreightPerUnit || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            inwardFreightPerUnit: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Factory to warehouse per pack
                    </span>
                  </div>
                </div>

                {/* Damage & Expiry Reserve */}
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Breakage & Expiry Reserve
                      </span>
                      <p className="text-[10px] text-slate-500">
                        Pharma standard damage allowance (2% - 3%)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="15"
                      value={inputs.damageBufferPercent || ""}
                      onChange={(e) =>
                        setInputs({
                          ...inputs,
                          damageBufferPercent: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-16 text-xs font-bold text-right px-2 py-1 rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      %
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Sales Team, Fuel & Operational Overheads */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection("overheads")}
              className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2.5 text-left border-b border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Users2 className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate sm:whitespace-normal">
                    2. Field Staff, Fuel & Overheads
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-1 sm:line-clamp-none">
                    Monthly salaries, bike fuel, allowance & office fixed costs
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="text-[10px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Rs. {results.overheadCostPerUnit.toFixed(1)}/pack
                </span>
                {openSections.overheads ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {openSections.overheads && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Number of Field Staff (Reps)
                    </label>
                    <div className="relative">
                      <Users2 className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="number"
                        min="0"
                        value={inputs.employeeCount || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            employeeCount: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Sales reps / delivery staff
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Avg Salary per Rep (Monthly)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        ₨
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={inputs.salaryPerEmployee || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            salaryPerEmployee: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      e.g. 40,000 PKR / month
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Fuel Allowance per Rep
                    </label>
                    <div className="relative">
                      <Fuel className="w-4 h-4 absolute left-3 top-2.5 text-amber-600" />
                      <input
                        type="number"
                        min="0"
                        value={inputs.fuelPerEmployee || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            fuelPerEmployee: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Bike / Car monthly fuel
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Daily Allowance (DA / Food)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        ₨
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={inputs.dailyAllowancePerEmployee || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            dailyAllowancePerEmployee:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Monthly per rep meals
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Warehouse & Admin Overheads
                    </label>
                    <div className="relative">
                      <Building2 className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="number"
                        min="0"
                        value={inputs.officeAdminOverheads || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            officeAdminOverheads: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Monthly rent, electricity, bills
                    </span>
                  </div>

                  {/* Volume Divider */}
                  <div className="p-2.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
                    <label className="block text-xs font-bold text-teal-900 dark:text-teal-200 mb-1">
                      Target Monthly Volume (Units)
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="1000"
                      value={inputs.expectedMonthlyVolume === 0 ? "" : inputs.expectedMonthlyVolume}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setInputs({
                          ...inputs,
                          expectedMonthlyVolume: raw === "" ? 0 : Math.max(0, parseInt(raw) || 0),
                        });
                      }}
                      className="w-full text-xs font-bold px-3 py-1.5 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-900 text-teal-800 dark:text-teal-300 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                    />
                    <span className="text-[10px] text-teal-700 dark:text-teal-400">
                      Total units sold across market
                    </span>
                  </div>
                </div>

                {/* Overheads Math Summary Box */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-600 dark:text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border border-slate-200 dark:border-slate-700">
                  <span>
                    Monthly Field & Fixed Overheads:{" "}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {formatPKR(
                        inputs.employeeCount *
                          (inputs.salaryPerEmployee +
                            inputs.fuelPerEmployee +
                            inputs.dailyAllowancePerEmployee) +
                          inputs.officeAdminOverheads
                      )}
                    </strong>
                  </span>
                  <span className="text-amber-700 dark:text-amber-400 font-semibold">
                    Cost Per Unit = Monthly Pool ÷ {formatNumber(inputs.expectedMonthlyVolume)} packs ={" "}
                    <strong>Rs. {results.overheadCostPerUnit.toFixed(1)}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Pharma Field Dynamics (Samples, Schemes & Commissions) */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection("pharma")}
              className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2.5 text-left border-b border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Stethoscope className="w-5 h-5 text-purple-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate sm:whitespace-normal">
                    3. Doctor Sampling & Schemes
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-1 sm:line-clamp-none">
                    Free doctor samples, trade deal bonus (10+1 free), rep commissions
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="text-[10px] sm:text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Rs. {(results.doctorSamplingCostPerUnit + results.fieldPromoCostPerUnit + results.deliveryCostPerUnit).toFixed(1)}/pack
                </span>
                {openSections.pharma ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {openSections.pharma && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Doctor Sampling Ratio */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Doctor Free Sampling Ratio (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="30"
                        step="1"
                        value={inputs.doctorSamplingPercent}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            doctorSamplingPercent: parseInt(e.target.value) || 0,
                          })
                        }
                        className="w-full accent-purple-600 cursor-pointer"
                      />
                      <span className="w-12 text-xs font-bold text-purple-600 dark:text-purple-400 text-right">
                        {inputs.doctorSamplingPercent}%
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Sample burden:{" "}
                      <strong>
                        Rs. {results.doctorSamplingCostPerUnit.toFixed(1)} per sold pack
                      </strong>
                    </span>
                  </div>

                  {/* Bonus Schemes */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Trade Deal Scheme (Free Goods)
                    </label>
                    <select
                      value={inputs.bonusSchemeType}
                      onChange={(e) =>
                        setInputs({
                          ...inputs,
                          bonusSchemeType: e.target.value as BonusSchemeType,
                        })
                      }
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="none">No Scheme (Net Invoicing)</option>
                      <option value="10_plus_1">10 + 1 Free (9.1% off)</option>
                      <option value="10_plus_2">10 + 2 Free (16.7% off)</option>
                      <option value="100_plus_10">100 + 10 Free (9.1% off)</option>
                      <option value="100_plus_15">100 + 15 Free (13.0% off)</option>
                      <option value="custom">Custom Discount %</option>
                    </select>
                    {inputs.bonusSchemeType === "custom" && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="Custom scheme %"
                          value={inputs.customBonusPercent || ""}
                          onChange={(e) =>
                            setInputs({
                              ...inputs,
                              customBonusPercent: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800"
                        />
                        <span className="text-xs font-bold">%</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Sales Rep Commission
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        ₨
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={inputs.salesRepCommissionPerUnit || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            salesRepCommissionPerUnit:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Incentive per pack sold
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Marketing & Doctor Literature
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                        ₨
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={inputs.monthlyMarketingBudget || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            monthlyMarketingBudget:
                              parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Monthly promotional folders / ads
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Outward Delivery / Courier
                    </label>
                    <div className="relative">
                      <Truck className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="number"
                        min="0"
                        value={inputs.deliveryCostPerUnit || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            deliveryCostPerUnit: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Per pack delivery to market/distributor
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Target Margins, Channel Cuts & Taxes */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button
              onClick={() => toggleSection("margins")}
              className="w-full px-4 sm:px-5 py-3 sm:py-3.5 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between gap-2.5 text-left border-b border-slate-200 dark:border-slate-800"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Percent className="w-5 h-5 text-blue-600 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate sm:whitespace-normal">
                    4. Target Profit Margin & Tax
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 line-clamp-1 sm:line-clamp-none">
                    Noxderma profit %, Distributor %, Pharmacy % & GST
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="text-[10px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 px-2 py-0.5 rounded-full whitespace-nowrap">
                  Net: {inputs.noxdermaTargetMarginPercent}%
                </span>
                {openSections.margins ? (
                  <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </div>
            </button>

            {openSections.margins && (
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Noxderma Net Margin Slider */}
                  <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        Noxderma Target Profit Margin
                      </label>
                      <span className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                        {inputs.noxdermaTargetMarginPercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="60"
                      step="1"
                      value={inputs.noxdermaTargetMarginPercent}
                      onChange={(e) =>
                        setInputs({
                          ...inputs,
                          noxdermaTargetMarginPercent: parseInt(e.target.value) || 20,
                        })
                      }
                      className="w-full accent-emerald-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-emerald-700/80 dark:text-emerald-400/80 mt-1">
                      <span>Low (10%)</span>
                      <span>Balanced (25-30%)</span>
                      <span>Premium (50%+)</span>
                    </div>
                  </div>

                  {/* Distributor Commission */}
                  <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-blue-900 dark:text-blue-200">
                        Distributor Cut / Margin
                      </label>
                      <span className="text-xs font-extrabold text-blue-700 dark:text-blue-400">
                        {inputs.distributorMarginPercent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="25"
                      step="1"
                      value={inputs.distributorMarginPercent}
                      onChange={(e) =>
                        setInputs({
                          ...inputs,
                          distributorMarginPercent: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full accent-blue-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-blue-700/80 dark:text-blue-400/80 mt-1">
                      <span>Direct (0%)</span>
                      <span>Pharma Standard (8-10%)</span>
                      <span>Wholesale (15%)</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* Retailer / Pharmacy Margin */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pharmacy / Retailer Margin (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={inputs.pharmacyMarginPercent || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            pharmacyMarginPercent: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Standard pharma retail margin is 15%
                    </span>
                  </div>

                  {/* GST / Sales Tax */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Sales Tax / GST (%)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max="30"
                        value={inputs.taxGstPercent || ""}
                        onChange={(e) =>
                          setInputs({
                            ...inputs,
                            taxGstPercent: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                      <span className="text-xs font-bold text-slate-500">%</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      0% for tax-exempt pharma, 18% for cosmetics
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: Results, Pricing Tiers, Visuals & Simulator */}
        {/* ========================================================= */}
        <div className={`lg:col-span-5 space-y-4 lg:sticky lg:top-4 ${mobileTab === "results" ? "block" : "hidden lg:block"}`}>
          {/* Main Price Ladder Card */}
          <div className="rounded-2xl border border-teal-200 dark:border-teal-800/60 bg-gradient-to-b from-white to-teal-50/20 dark:from-slate-900 dark:to-teal-950/20 shadow-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  Recommended Pricing Structure
                </span>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {inputs.productName || "New Product"}
                </h2>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300">
                {inputs.packSize}
              </span>
            </div>

            {/* 4 Pricing Tiers */}
            <div className="space-y-2.5">
              {/* Tier 1: True Landed Cost */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      1. True Landed Cost (Noxderma Cost)
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Product + Staff + Fuel + Samples + Delivery
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    {formatPKR(results.totalLandedCostPerUnit)}
                  </span>
                  <span className="block text-[10px] text-slate-400">per pack</span>
                </div>
              </div>

              {/* Tier 2: Distributor Price (DP) */}
              <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                    2. Distributor Price (DP)
                    <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">
                      (+{inputs.noxdermaTargetMarginPercent}% Margin)
                    </span>
                  </span>
                  <p className="text-[10px] text-teal-700 dark:text-teal-400">
                    Rate you invoice to Main Distributor
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-teal-700 dark:text-teal-300">
                    {formatPKR(results.distributorPrice)}
                  </span>
                  {inputs.bonusSchemeType !== "none" && (
                    <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                      Scheme Net: {formatPKR(results.effectiveDistributorPriceWithScheme)}
                    </span>
                  )}
                </div>
              </div>

              {/* Tier 3: Trade Price (TP) */}
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                    3. Trade Price (TP)
                  </span>
                  <p className="text-[10px] text-blue-700/80 dark:text-blue-400/80">
                    Distributor supplies to Pharmacy (+{inputs.distributorMarginPercent}% cut)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-extrabold text-blue-800 dark:text-blue-300">
                    {formatPKR(results.tradePrice)}
                  </span>
                </div>
              </div>

              {/* Tier 4: Maximum Retail Price (MRP) */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-100 uppercase tracking-wider">
                    4. Printed Box MRP (Retail Price)
                  </span>
                  <p className="text-[11px] text-emerald-100/90 font-medium">
                    Consumer / Patient price (+{inputs.pharmacyMarginPercent}% Pharmacy margin)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black tracking-tight text-white">
                    {formatPKR(results.retailPriceFinalMrp)}
                  </span>
                  {results.taxAmountPerUnit > 0 && (
                    <span className="block text-[10px] text-emerald-200">
                      Incl. {formatPKR(results.taxAmountPerUnit)} GST
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Monthly Profitability Callout */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Net Profit Per Pack
                </span>
                <div className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  +{formatPKR(results.noxdermaNetProfitPerUnit)}
                </div>
                <span className="text-[10px] text-slate-400">
                  {results.noxdermaGrossMarginPercent.toFixed(1)}% net margin
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-500 uppercase">
                  Monthly Total Kamai
                </span>
                <div className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {formatPKR(results.noxdermaMonthlyNetProfit)}
                </div>
                <span className="text-[10px] text-slate-400">
                  at {formatNumber(inputs.expectedMonthlyVolume)} packs/month
                </span>
              </div>
            </div>

            {/* Safety Floor Price Alert */}
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-rose-900 dark:text-rose-200">
                  Minimum Floor Price: {formatPKR(results.minimumFloorPrice)}
                </span>
                <p className="text-[10px] text-rose-700 dark:text-rose-300 mt-0.5">
                  Is rate se kam par kabi deal na karein. Is se kam par staff ki salaries aur fuel ka nuqsan hoga.
                </p>
              </div>
            </div>

            {/* Break-even sales indicator */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>Monthly Break-Even Volume</span>
                <span className={results.isVolumeBelowBreakEven ? "text-rose-600 font-extrabold" : "text-emerald-600 font-extrabold"}>
                  {formatNumber(results.breakEvenVolumeUnits)} packs
                </span>
              </div>

              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    results.isVolumeBelowBreakEven ? "bg-rose-500" : "bg-emerald-500"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (inputs.expectedMonthlyVolume / Math.max(1, results.breakEvenVolumeUnits)) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>
                  Target: {formatNumber(inputs.expectedMonthlyVolume)} packs
                </span>
                <span>
                  {results.isVolumeBelowBreakEven ? (
                    <span className="text-rose-600 font-bold">⚠️ Below Break-Even!</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">✅ Safe & Profitable</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive What-If Scenario Simulator */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  "What-If" Sensitivity Simulator
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsWhatIfActive(!isWhatIfActive);
                  if (isWhatIfActive) {
                    setWhatIfFuelDeltaPercent(0);
                    setWhatIfVolumeMultiplier(1);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors ${
                  isWhatIfActive
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {isWhatIfActive ? "Simulator Active (Reset)" : "Enable Simulator"}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Test how sudden petrol price hikes or volume drops impact your profit without altering your actual data.
            </p>

            {isWhatIfActive && (
              <div className="space-y-4 pt-1 animate-in fade-in">
                {/* Fuel Hike Slider */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Fuel className="w-3.5 h-3.5 text-amber-500" />
                      Petrol / Fuel Price Change
                    </span>
                    <span className="text-amber-600 font-extrabold">
                      {whatIfFuelDeltaPercent > 0 ? `+${whatIfFuelDeltaPercent}%` : `${whatIfFuelDeltaPercent}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-20"
                    max="60"
                    step="5"
                    value={whatIfFuelDeltaPercent}
                    onChange={(e) => setWhatIfFuelDeltaPercent(parseInt(e.target.value))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>-20% Drop</span>
                    <span>No Change</span>
                    <span>+60% Hike</span>
                  </div>
                </div>

                {/* Sales Volume Multiplier Slider */}
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <span className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-teal-500" />
                      Monthly Sales Volume Shift
                    </span>
                    <span className="text-teal-600 font-extrabold">
                      {Math.round(whatIfVolumeMultiplier * 100)}% ({formatNumber(Math.round(inputs.expectedMonthlyVolume * whatIfVolumeMultiplier))} packs)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="2.5"
                    step="0.1"
                    value={whatIfVolumeMultiplier}
                    onChange={(e) => setWhatIfVolumeMultiplier(parseFloat(e.target.value))}
                    className="w-full accent-teal-600 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>Low Sale (40%)</span>
                    <span>Normal (100%)</span>
                    <span>Boom (250%)</span>
                  </div>
                </div>

                {/* Simulation Impact Banner */}
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-xs space-y-1">
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span>Simulated True Landed Cost:</span>
                    <span className="text-amber-800 dark:text-amber-300">
                      {formatPKR(results.totalLandedCostPerUnit)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-800 dark:text-slate-200">
                    <span>Simulated Monthly Net Profit:</span>
                    <span
                      className={
                        results.noxdermaMonthlyNetProfit < baselineResults.noxdermaMonthlyNetProfit
                          ? "text-rose-600 dark:text-rose-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      {formatPKR(results.noxdermaMonthlyNetProfit)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Visual Cost Breakdown Chart */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              Where Does the MRP Rupee Go? (Cost Breakdown)
            </h3>

            <div className="h-44 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={results.chartSlices}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {results.chartSlices.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`₨ ${formatNumber(Number(val))}`, "Share"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="space-y-1.5 pt-1 text-xs">
              {results.chartSlices.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="truncate max-w-[200px]">{item.name}</span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-slate-200">
                    {formatPKR(item.value)} ({item.percent}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Persistent Mobile Bottom Quick Summary Bar (lg:hidden) */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 z-30 px-3 py-2.5 bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-md text-white border-t border-slate-800 shadow-2xl">
        <div className="max-w-md mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div>
              <span className="block text-[8px] font-bold uppercase text-slate-400 leading-none">
                Cost
              </span>
              <span className="text-[11px] font-black font-mono text-slate-200">
                {formatPKR(results.totalLandedCostPerUnit)}
              </span>
            </div>
            <div className="h-5 w-px bg-slate-700 shrink-0" />
            <div>
              <span className="block text-[8px] font-bold uppercase text-teal-400 leading-none">
                Trade (TP)
              </span>
              <span className="text-[11px] font-black font-mono text-teal-300">
                {formatPKR(results.tradePrice)}
              </span>
            </div>
            <div className="h-5 w-px bg-slate-700 shrink-0" />
            <div>
              <span className="block text-[8px] font-bold uppercase text-amber-400 leading-none">
                MRP
              </span>
              <span className="text-xs font-black font-mono text-amber-300">
                {formatPKR(results.retailPriceFinalMrp)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileTab(mobileTab === "inputs" ? "results" : "inputs")}
            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-sm shrink-0 transition-transform"
          >
            {mobileTab === "inputs" ? (
              <>
                <span>Results</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Inputs</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
