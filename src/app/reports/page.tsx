"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Filter,
  Layers,
  Boxes,
  CreditCard,
  TrendingUp,
  Receipt,
  CheckCircle2,
  Search,
  X,
  RotateCcw,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";
import { formatPKR, formatNumber, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import type { Product, InventoryBatch, Invoice, Customer } from "@/types";

export type DatePreset = "all" | "today" | "week" | "month" | "custom";

function isDateInPreset(
  dateString: string | undefined | null,
  preset: DatePreset,
  customStart: string,
  customEnd: string
): boolean {
  if (preset === "all") return true;
  if (!dateString) return false;

  const dateObj = new Date(dateString);
  if (isNaN(dateObj.getTime())) return false;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  if (preset === "today") {
    return dateObj >= todayStart && dateObj <= todayEnd;
  }

  if (preset === "week") {
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    return dateObj >= weekStart && dateObj <= todayEnd;
  }

  if (preset === "month") {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return dateObj >= monthStart && dateObj <= todayEnd;
  }

  if (preset === "custom") {
    if (customStart) {
      const start = new Date(customStart + "T00:00:00");
      if (dateObj < start) return false;
    }
    if (customEnd) {
      const end = new Date(customEnd + "T23:59:59.999");
      if (dateObj > end) return false;
    }
    return true;
  }

  return true;
}

export default function ReportsExportPage() {
  const { currentUser } = useAuth();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [activeReport, setActiveReport] = useState<"stock" | "sales" | "aging" | "tax">("stock");
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pricingMap, setPricingMap] = useState<Record<string, any>>({});
  const [businessSettings, setBusinessSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Search & Date Range Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [prodList, batchList, invList, custList, pricesList, settingsData] = await Promise.all([
          offlineDb.products.toArray(),
          offlineDb.inventoryBatches.toArray(),
          offlineDb.invoices.toArray(),
          offlineDb.customers.toArray(),
          offlineDb.productPricing.toArray(),
          offlineDb.settings.get("primary"),
        ]);
        setProducts(prodList);
        setBatches(batchList);
        setInvoices(invList);
        setCustomers(custList);
        if (settingsData) setBusinessSettings(settingsData);
        const pMap: Record<string, any> = {};
        pricesList.forEach((pr) => {
          pMap[pr.productId] = pr;
        });
        setPricingMap(pMap);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();

    const handleSettingsUpdated = async () => {
      try {
        const s = await offlineDb.settings.get("primary");
        if (s) setBusinessSettings(s);
      } catch {}
    };
    window.addEventListener("noxderma_settings_updated", handleSettingsUpdated);
    return () => window.removeEventListener("noxderma_settings_updated", handleSettingsUpdated);
  }, []);

  // Category isolation
  const activeCategoryObj =
    selectedCategoryId === "all" ? null : categories.find((c) => c.id === selectedCategoryId);

  const displayProducts = useMemo(() => {
    return selectedCategoryId === "all"
      ? products
      : products.filter((p) => p.categoryId === selectedCategoryId);
  }, [products, selectedCategoryId]);

  const categoryProductIds = useMemo(() => {
    return new Set(displayProducts.map((p) => p.id));
  }, [displayProducts]);

  const displayBatches = useMemo(() => {
    return selectedCategoryId === "all"
      ? batches
      : batches.filter((b) => categoryProductIds.has(b.productId));
  }, [batches, selectedCategoryId, categoryProductIds]);

  // 1. Stock Valuation Data (Filtered by Search & Category)
  const stockValuationRows = useMemo(() => {
    return displayProducts.map((p) => {
      const prodBatches = displayBatches.filter((b) => b.productId === p.id);
      const totalQty = prodBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);
      const pricing = pricingMap[p.id];
      const unitCost = pricing?.purchaseCostPerPack || 0;
      const unitTrade = pricing?.tradePricePerPack || pricing?.mrpPerPack || 0;
      const estimatedCost = totalQty * unitCost;
      const tradeValuation = totalQty * unitTrade;
      return {
        sku: p.sku,
        name: p.name,
        category: p.categoryName,
        quantity: totalQty,
        costValuation: estimatedCost,
        tradeValuation: tradeValuation,
        projectedMargin: tradeValuation - estimatedCost,
      };
    });
  }, [displayProducts, displayBatches, pricingMap]);

  const filteredStockRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return stockValuationRows;
    return stockValuationRows.filter(
      (r) =>
        r.sku.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.category && r.category.toLowerCase().includes(q))
    );
  }, [stockValuationRows, searchQuery]);

  // 2. Sales by SKU (Filtered by Date Range, Search & Category)
  const filteredSalesInvoices = useMemo(() => {
    return invoices.filter((inv) =>
      isDateInPreset(inv.invoiceDate, datePreset, customStartDate, customEndDate)
    );
  }, [invoices, datePreset, customStartDate, customEndDate]);

  const salesSkuMap = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const inv of filteredSalesInvoices) {
      for (const line of inv.lines || []) {
        if (selectedCategoryId !== "all" && !categoryProductIds.has(line.productId)) {
          continue;
        }
        if (!map[line.productId]) {
          map[line.productId] = { name: line.productName, qty: 0, revenue: 0 };
        }
        map[line.productId].qty += line.quantity;
        map[line.productId].revenue += line.lineTotal;
      }
    }
    return map;
  }, [filteredSalesInvoices, selectedCategoryId, categoryProductIds]);

  const filteredSalesRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = Object.entries(salesSkuMap).map(([id, val]) => ({
      id,
      name: val.name,
      qty: val.qty,
      revenue: val.revenue,
    }));
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [salesSkuMap, searchQuery]);

  // 3. Customer Aging & Udhaar (Filtered by Search & Category)
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.category && c.category.toLowerCase().includes(q))
    );
  }, [customers, searchQuery]);

  // 4. Bills & Tax Register (Filtered by Date Range & Search)
  const filteredTaxInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return invoices.filter((i) => {
      const matchDate = isDateInPreset(i.invoiceDate, datePreset, customStartDate, customEndDate);
      if (!matchDate) return false;
      if (!q) return true;
      return (
        (i.provisionalReference && i.provisionalReference.toLowerCase().includes(q)) ||
        (i.officialReference && i.officialReference.toLowerCase().includes(q)) ||
        (i.customerName && i.customerName.toLowerCase().includes(q))
      );
    });
  }, [invoices, datePreset, customStartDate, customEndDate, searchQuery]);

  // Dynamic Totals derived exclusively from the currently filtered dataset
  const totalStockQuantity = filteredStockRows.reduce((sum, r) => sum + r.quantity, 0);
  const totalCostValuation = filteredStockRows.reduce((sum, r) => sum + r.costValuation, 0);
  const totalTradeValuation = filteredStockRows.reduce((sum, r) => sum + r.tradeValuation, 0);

  const totalSalesQuantity = filteredSalesRows.reduce((sum, r) => sum + r.qty, 0);
  const totalSalesRevenue = filteredSalesRows.reduce((sum, r) => sum + r.revenue, 0);

  const totalCustomerCreditLimit = filteredCustomers.reduce((sum, c) => sum + (c.creditLimit || 0), 0);
  const totalCustomerBalance = filteredCustomers.reduce((sum, c) => sum + (c.currentOutstandingBalance || 0), 0);

  const totalTaxGross = filteredTaxInvoices.reduce((sum, i) => sum + (i.grossTotal || 0), 0);
  const totalTaxAmount = filteredTaxInvoices.reduce((sum, i) => sum + (i.taxAmount || 0), 0);
  const totalTaxNet = filteredTaxInvoices.reduce((sum, i) => sum + (i.netTotal || 0), 0);

  // Active Period Human-readable Label
  const datePresetLabel = useMemo(() => {
    switch (datePreset) {
      case "today":
        return `Today (${formatKarachiDate(new Date())})`;
      case "week":
        return "This Week (Past 7 Days)";
      case "month":
        return "This Month";
      case "custom":
        return customStartDate || customEndDate
          ? `${customStartDate || "Start"} to ${customEndDate || "End"}`
          : "Custom Date Range";
      default:
        return "All Time (Mukammal)";
    }
  }, [datePreset, customStartDate, customEndDate]);

  const activeRowCount = useMemo(() => {
    switch (activeReport) {
      case "stock":
        return filteredStockRows.length;
      case "sales":
        return filteredSalesRows.length;
      case "aging":
        return filteredCustomers.length;
      case "tax":
        return filteredTaxInvoices.length;
    }
  }, [activeReport, filteredStockRows, filteredSalesRows, filteredCustomers, filteredTaxInvoices]);

  const preparerName = useMemo(() => {
    if (businessSettings?.ownerName && String(businessSettings.ownerName).trim()) {
      return String(businessSettings.ownerName).trim();
    }
    if (currentUser?.displayName) {
      return currentUser.displayName.replace(/\s*\((?:Admin|Owner)\)/gi, "").trim();
    }
    return "Muhammad Farhan";
  }, [businessSettings, currentUser]);

  const preparerRole = useMemo(() => {
    if (businessSettings?.ownerRole && String(businessSettings.ownerRole).trim()) {
      return String(businessSettings.ownerRole).trim();
    }
    return "Owner";
  }, [businessSettings]);

  // CSV Export Helper (Strictly exports ONLY currently filtered rows)
  const downloadCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map((val) => `"${val}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = () => {
    const fileDateTag =
      datePreset === "today"
        ? "Today"
        : datePreset === "week"
        ? "Weekly"
        : datePreset === "month"
        ? "Monthly"
        : datePreset === "custom"
        ? `Custom_${customStartDate}_to_${customEndDate}`
        : "All";

    if (activeReport === "stock") {
      downloadCSV(
        `Noxderma_Stock_Valuation_${fileDateTag}`,
        ["SKU", "Product Name", "Category", "Quantity (Packs)", "Cost Valuation (PKR)", "Trade Valuation (PKR)", "Projected Margin (PKR)"],
        filteredStockRows.map((r) => [
          r.sku,
          r.name,
          r.category,
          r.quantity,
          r.costValuation,
          r.tradeValuation,
          r.projectedMargin,
        ])
      );
    } else if (activeReport === "sales") {
      downloadCSV(
        `Noxderma_Sales_By_SKU_${fileDateTag}`,
        ["Product Name", "Total Packs Sold", "Total Sales Revenue (PKR)"],
        filteredSalesRows.map((r) => [r.name, r.qty, r.revenue])
      );
    } else if (activeReport === "aging") {
      downloadCSV(
        `Noxderma_Customer_Aging_${fileDateTag}`,
        ["Customer Name", "Category", "City", "Credit Limit (PKR)", "Outstanding Balance (PKR)"],
        filteredCustomers.map((c) => [c.name, c.category, c.city, c.creditLimit, c.currentOutstandingBalance])
      );
    } else if (activeReport === "tax") {
      downloadCSV(
        `Noxderma_Tax_Sales_Register_${fileDateTag}`,
        ["Invoice Ref", "Customer Name", "Date", "Gross Amount (PKR)", "Tax Amount (PKR)", "Net Total (PKR)"],
        filteredTaxInvoices.map((i) => [
          i.provisionalReference,
          i.customerName,
          i.invoiceDate,
          i.grossTotal,
          i.taxAmount,
          i.netTotal,
        ])
      );
    }
  };

  const companyName = businessSettings?.brandName || businessSettings?.businessName || "NOXDERMA PHARMACEUTICALS";
  const companyTagline = businessSettings?.tagline || "Derma & Healthcare Solutions";
  const companyAddress = businessSettings?.address || "Suite # 402, Trade Heights, Karachi, Pakistan";
  const companyPhone = businessSettings?.contactPhone || businessSettings?.phone || "+92 300 1234567";
  const companyEmail = businessSettings?.email || "info@noxderma.com";
  const companyNtn = businessSettings?.ntn || "NTN: 8934120-1";

  return (
    <>
      {/* ========================================================================= */}
      {/* SCREEN INTERACTIVE UI (HIDDEN COMPLETELY DURING PRINTING)                */}
      {/* ========================================================================= */}
      <div className="space-y-6 no-print print:hidden">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                Reports
              </span>
              <span className="text-xs text-slate-400">Export & Print</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Download Reports
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Export and print godown stock, sales, customer receivables, and tax registers
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print Report
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
            >
              <Download className="w-4 h-4" /> Download Excel Sheet (CSV)
            </button>
          </div>
        </div>

        {/* Active Category Filter Alert */}
        {selectedCategoryId !== "all" && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
              <span>
                Showing reports for: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
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

        {/* Report Selection Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: "stock", label: "Godown Stock Worth", icon: Boxes, desc: "Kharid Cost vs Bikri Value" },
            { id: "sales", label: "Medicine Sales", icon: TrendingUp, desc: "Total Boxes Sold & Income" },
            { id: "aging", label: "Market Udhaar (Baqaya)", icon: CreditCard, desc: "Customer Due Payments" },
            { id: "tax", label: "All Bills & Tax", icon: Receipt, desc: "Complete Invoices Record" },
          ].map((rep) => {
            const Icon = rep.icon;
            const isActive = activeReport === rep.id;
            return (
              <button
                key={rep.id}
                onClick={() => setActiveReport(rep.id as any)}
                className={`p-4 rounded-xl border text-left transition-all ${
                  isActive
                    ? "border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 shadow-sm ring-1 ring-teal-500"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${isActive ? "text-teal-600" : "text-slate-400"}`} />
                  <h3 className="font-extrabold text-xs text-slate-900 dark:text-slate-100">
                    {rep.label}
                  </h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{rep.desc}</p>
              </button>
            );
          })}
        </div>

        {/* ========================================================================= */}
        {/* ADVANCED FILTER & SEARCH CONTROL BAR                                      */}
        {/* ========================================================================= */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
          {/* Row 1: Search Bar & Quick Reset */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeReport === "stock"
                    ? "Search medicine by name, SKU code, or category..."
                    : activeReport === "sales"
                    ? "Search sales summary by medicine name..."
                    : activeReport === "aging"
                    ? "Search customer / pharmacy by name, city, phone..."
                    : "Search invoices by Bill # or customer name..."
                }
                className="w-full pl-10 pr-9 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {(searchQuery || datePreset !== "all" || customStartDate || customEndDate) && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setDatePreset("all");
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className="px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 hover:bg-rose-100 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reset Filters
              </button>
            )}
          </div>

          {/* Row 2: Date Range Presets */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Period:
              </span>
              {[
                { id: "all", label: "All Time" },
                { id: "today", label: "Today (Daily)" },
                { id: "week", label: "This Week (Past 7 Days)" },
                { id: "month", label: "This Month" },
                { id: "custom", label: "Custom Date Range" },
              ].map((p) => {
                const isActive = datePreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setDatePreset(p.id as DatePreset)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30 font-bold"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {/* Custom Date Pickers */}
            {datePreset === "custom" && (
              <div className="flex items-center gap-2 flex-wrap text-xs bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">From:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">To:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 rounded-lg text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Active Summary Pills */}
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Showing <strong className="text-teal-600 dark:text-teal-400">{activeRowCount}</strong> matching records
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span>Period: <strong className="text-slate-700 dark:text-slate-200">{datePresetLabel}</strong></span>
              {searchQuery && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">•</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-[11px] text-teal-700 dark:text-teal-300 font-medium">
                    &ldquo;{searchQuery}&rdquo;
                    <button onClick={() => setSearchQuery("")} className="hover:text-teal-900">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                </>
              )}
            </div>

            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Excel export & print layout reflect this exact filtered data
            </span>
          </div>
        </div>

        {/* Report 1: Stock Valuation */}
        {activeReport === "stock" && (
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Godown Stock Worth (Maliyat Summary)
                </h3>
                <p className="text-xs text-slate-400">
                  Total worth of medicine stock based on buying cost vs wholesale selling price
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-4 text-xs font-mono font-bold">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Buying Cost:</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatPKR(totalCostValuation)}</span>
                  </div>
                  <div>
                    <span className="text-teal-600 block text-[10px]">Total Sale Value:</span>
                    <span className="text-teal-600 dark:text-teal-400">{formatPKR(totalTradeValuation)}</span>
                  </div>
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
            </div>

            {filteredStockRows.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <Boxes className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No matching stock items</p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery ? `No medicine matched "${searchQuery}".` : "No products available in this category."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Item Code</th>
                      <th className="p-2.5">Medicine Name</th>
                      <th className="p-2.5">Category</th>
                      <th className="p-2.5 text-right">Total Boxes</th>
                      <th className="p-2.5 text-right">Cost Value (Kharid)</th>
                      <th className="p-2.5 text-right">Sale Value (Bikri)</th>
                      <th className="p-2.5 text-right">Expected Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStockRows.map((row) => (
                      <tr
                        key={row.sku}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                          {row.sku}
                        </td>
                        <td className="p-2.5 font-semibold text-slate-900 dark:text-slate-100">
                          {row.name}
                        </td>
                        <td className="p-2.5 text-slate-500">{row.category}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatNumber(row.quantity)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatPKR(row.costValuation)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                          {formatPKR(row.tradeValuation)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-emerald-600">
                          +{formatPKR(row.projectedMargin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={3} className="p-2.5 text-right uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Total Valuation ({filteredStockRows.length} items):
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatNumber(totalStockQuantity)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {formatPKR(totalCostValuation)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                        {formatPKR(totalTradeValuation)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                        +{formatPKR(totalTradeValuation - totalCostValuation)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 2: Sales by SKU */}
        {activeReport === "sales" && (
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Total Sales by Medicine
                </h3>
                <p className="text-xs text-slate-400">
                  Packs dispatched and total revenue generated per SKU for {datePresetLabel}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-4 text-xs font-mono font-bold">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Packs Sold:</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatNumber(totalSalesQuantity)}</span>
                  </div>
                  <div>
                    <span className="text-emerald-600 block text-[10px]">Total Sales Revenue:</span>
                    <span className="text-emerald-600">{formatPKR(totalSalesRevenue)}</span>
                  </div>
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
            </div>

            {filteredSalesRows.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <TrendingUp className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No sales recorded</p>
                <p className="text-xs text-slate-400 mt-1">
                  No sales found for period &ldquo;{datePresetLabel}&rdquo;
                  {searchQuery ? ` matching "${searchQuery}"` : ""}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Medicine Name</th>
                      <th className="p-2.5 text-right">Packs Invoiced</th>
                      <th className="p-2.5 text-right">Total Sales (PKR)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredSalesRows.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">
                          {row.name}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatNumber(row.qty)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                          {formatPKR(row.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td className="p-2.5 text-right uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Total Sales Summary:
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatNumber(totalSalesQuantity)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                        {formatPKR(totalSalesRevenue)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 3: Customer Aging */}
        {activeReport === "aging" && (
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Customer Udhaar & Remaining Balance (Baqaya)
                </h3>
                <p className="text-xs text-slate-400">
                  Receivables statement and credit limits by customer
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-4 text-xs font-mono font-bold">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Total Credit Limit:</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatPKR(totalCustomerCreditLimit)}</span>
                  </div>
                  <div>
                    <span className="text-rose-600 block text-[10px]">Total Udhaar (Baqaya):</span>
                    <span className="text-rose-600">{formatPKR(totalCustomerBalance)}</span>
                  </div>
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
            </div>

            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <CreditCard className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No customers found</p>
                <p className="text-xs text-slate-400 mt-1">
                  {searchQuery ? `No customer matched "${searchQuery}".` : "No customers registered yet."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Customer / Medical Store</th>
                      <th className="p-2.5">Type</th>
                      <th className="p-2.5">City</th>
                      <th className="p-2.5 text-right">Udhaar Limit</th>
                      <th className="p-2.5 text-right">Remaining Balance (Baqaya)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredCustomers.map((c) => (
                      <tr
                        key={c.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">{c.name}</td>
                        <td className="p-2.5 uppercase text-[10px] text-slate-500">
                          {c.category === "pharmacy"
                            ? "Medical Store"
                            : c.category === "distributor"
                            ? "Wholesale Dealer"
                            : c.category === "direct_clinic"
                            ? "Clinic / Hospital"
                            : "Customer"}
                        </td>
                        <td className="p-2.5 text-slate-500">{c.city}</td>
                        <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatPKR(c.creditLimit)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                          {formatPKR(c.currentOutstandingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={3} className="p-2.5 text-right uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Total Receivables ({filteredCustomers.length} customers):
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {formatPKR(totalCustomerCreditLimit)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                        {formatPKR(totalCustomerBalance)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Report 4: Tax Register */}
        {activeReport === "tax" && (
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Bills & Tax Register
                </h3>
                <p className="text-xs text-slate-400">
                  Official sales invoice register with taxable amounts and net totals for {datePresetLabel}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-4 text-xs font-mono font-bold">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Before Tax:</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatPKR(totalTaxGross)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Tax Collected:</span>
                    <span className="text-slate-600 dark:text-slate-300">{formatPKR(totalTaxAmount)}</span>
                  </div>
                  <div>
                    <span className="text-teal-600 block text-[10px]">Net Total:</span>
                    <span className="text-teal-600 dark:text-teal-400">{formatPKR(totalTaxNet)}</span>
                  </div>
                </div>
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
              </div>
            </div>

            {filteredTaxInvoices.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                <Receipt className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="font-bold text-sm text-slate-700 dark:text-slate-300">No invoices found</p>
                <p className="text-xs text-slate-400 mt-1">
                  No invoices found for period &ldquo;{datePresetLabel}&rdquo;
                  {searchQuery ? ` matching "${searchQuery}"` : ""}.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-2.5">Bill #</th>
                      <th className="p-2.5">Medical Store Name</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5 text-right">Total Before Tax</th>
                      <th className="p-2.5 text-right">Tax</th>
                      <th className="p-2.5 text-right">Final Bill Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTaxInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                          {inv.provisionalReference || inv.officialReference}
                        </td>
                        <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">
                          {inv.customerName}
                        </td>
                        <td className="p-2.5 text-slate-500 font-mono">{inv.invoiceDate}</td>
                        <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                          {formatPKR(inv.grossTotal)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-500">
                          {formatPKR(inv.taxAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                          {formatPKR(inv.netTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                    <tr>
                      <td colSpan={3} className="p-2.5 text-right uppercase tracking-wider text-slate-600 dark:text-slate-400">
                        Total Invoices ({filteredTaxInvoices.length}):
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {formatPKR(totalTaxGross)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-slate-500">
                        {formatPKR(totalTaxAmount)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatPKR(totalTaxNet)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DEDICATED OFFICIAL PRINTABLE REPORT (Clean A4 Document Layout)             */}
      {/* ========================================================================= */}
      <div className="hidden print:block print-page bg-white text-black font-sans text-xs w-full max-w-none m-0 p-6 space-y-4">
        {/* Document Header with Branding & Icons */}
        <div className="flex justify-between items-start pb-4 border-b-2 border-black gap-4">
          <div className="flex items-start gap-3.5">
            {businessSettings?.invoiceLogoUrl || businessSettings?.appLogoUrl ? (
              <img
                src={businessSettings.invoiceLogoUrl || businessSettings.appLogoUrl}
                alt="Logo"
                className="h-14 w-auto max-w-[150px] object-contain shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-base shrink-0">
                ND
              </div>
            )}
            <div>
              <h1 className="text-xl font-black tracking-tight text-black leading-tight uppercase">
                {companyName}
              </h1>
              <p className="text-[10px] font-bold text-slate-700">
                {companyTagline}
              </p>
              <div className="mt-1 space-y-0.5 text-[10px] font-semibold text-slate-800">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3 text-black shrink-0" />
                  <span>{companyAddress}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3 h-3 text-black shrink-0" />
                  <span>{companyPhone}</span>
                  {companyNtn && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span>{companyNtn}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3 h-3 text-black shrink-0" />
                  <span>{companyEmail}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="inline-block px-3 py-1 rounded text-[11px] font-black border border-black text-black bg-slate-100 tracking-wider uppercase mb-1">
              {activeReport === "stock" && "Stock Valuation Report"}
              {activeReport === "sales" && "Sales & Dispatch Summary"}
              {activeReport === "aging" && "Customer Udhaar & Aging Report"}
              {activeReport === "tax" && "Tax & Bills Register"}
            </span>
            <p className="text-[10px] text-slate-700 mt-1">
              <strong>Printed:</strong> {formatKarachiDate(new Date(), true)}
            </p>
            <p className="text-[10px] text-slate-700">
              <strong>Period:</strong> {datePresetLabel}
            </p>
            {searchQuery && (
              <p className="text-[10px] text-slate-700">
                <strong>Search Filter:</strong> &ldquo;{searchQuery}&rdquo;
              </p>
            )}
            <p className="text-[10px] text-slate-700">
              <strong>Scope:</strong> {activeCategoryObj?.name ? `Category: ${activeCategoryObj.name}` : "All Medicine Categories"}
            </p>
            <div className="mt-1 pt-1 border-t border-slate-300">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 block">
                Prepared by:
              </span>
              <span className="text-[11px] font-black text-black block">
                {preparerName.trim().toLowerCase() === preparerRole.trim().toLowerCase()
                  ? preparerName
                  : `${preparerName} (${preparerRole})`}
              </span>
            </div>
          </div>
        </div>

        {/* 1. PRINT LAYOUT: Stock Valuation */}
        {activeReport === "stock" && (
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total SKUs</span>
                <span className="text-sm font-black text-black font-mono">{filteredStockRows.length}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Packs in Stock</span>
                <span className="text-sm font-black text-black font-mono">{formatNumber(totalStockQuantity)}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Cost Valuation</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalCostValuation)}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Wholesale Value</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalTradeValuation)}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Projected Profit</span>
                <span className="text-sm font-black text-black font-mono">+{formatPKR(totalTradeValuation - totalCostValuation)}</span>
              </div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-slate-300 text-[10px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800">
                  <th className="p-1.5 border-r border-slate-300 text-center w-8">#</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Item Code</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Medicine Name</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Category</th>
                  <th className="p-1.5 border-r border-slate-300 text-right">Packs</th>
                  <th className="p-1.5 border-r border-slate-300 text-right">Cost Value (PKR)</th>
                  <th className="p-1.5 border-r border-slate-300 text-right">Sale Value (PKR)</th>
                  <th className="p-1.5 text-right">Expected Profit</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">
                      No matching medicine items found for the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredStockRows.map((row, idx) => (
                    <tr key={row.sku} className="border-b border-slate-200">
                      <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-black">{row.sku}</td>
                      <td className="p-1.5 border-r border-slate-200 font-semibold text-black">{row.name}</td>
                      <td className="p-1.5 border-r border-slate-200 text-slate-600">{row.category}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-black">{formatNumber(row.quantity)}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-700">{formatPKR(row.costValuation)}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-black">{formatPKR(row.tradeValuation)}</td>
                      <td className="p-1.5 text-right font-mono font-bold text-black">+{formatPKR(row.projectedMargin)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-400 font-black text-black">
                  <td colSpan={4} className="p-2 text-right uppercase tracking-wider">
                    Total Valuation:
                  </td>
                  <td className="p-2 text-right font-mono border-r border-slate-300">{formatNumber(totalStockQuantity)}</td>
                  <td className="p-2 text-right font-mono border-r border-slate-300">{formatPKR(totalCostValuation)}</td>
                  <td className="p-2 text-right font-mono border-r border-slate-300">{formatPKR(totalTradeValuation)}</td>
                  <td className="p-2 text-right font-mono">+{formatPKR(totalTradeValuation - totalCostValuation)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Formal Sign-off Section */}
            <div className="grid grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[10px]">
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Prepared By</p>
                <p className="text-slate-500">Warehouse In-Charge</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Audited By</p>
                <p className="text-slate-500">Inventory Auditor</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Approved By</p>
                <p className="text-slate-500">Managing Partner / CEO</p>
              </div>
            </div>
          </div>
        )}

        {/* 2. PRINT LAYOUT: Sales by SKU */}
        {activeReport === "sales" && (
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Medicines Invoiced</span>
                <span className="text-sm font-black text-black font-mono">{filteredSalesRows.length}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Packs Sold</span>
                <span className="text-sm font-black text-black font-mono">{formatNumber(totalSalesQuantity)}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Sales Revenue</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalSalesRevenue)}</span>
              </div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-slate-300 text-[10px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800">
                  <th className="p-1.5 border-r border-slate-300 text-center w-8">#</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Medicine Name</th>
                  <th className="p-1.5 border-r border-slate-300 text-right">Packs Invoiced</th>
                  <th className="p-1.5 text-right">Total Sales Revenue (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {filteredSalesRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-500">
                      No sales recorded for period &ldquo;{datePresetLabel}&rdquo;
                      {searchQuery ? ` matching "${searchQuery}"` : ""}.
                    </td>
                  </tr>
                ) : (
                  filteredSalesRows.map((row, idx) => (
                    <tr key={row.id} className="border-b border-slate-200">
                      <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-1.5 border-r border-slate-200 font-bold text-black">{row.name}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono font-bold text-black">{formatNumber(row.qty)}</td>
                      <td className="p-1.5 text-right font-mono font-bold text-black">{formatPKR(row.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-400 font-black text-black">
                  <td colSpan={2} className="p-2 text-right uppercase tracking-wider">
                    Total Sales Summary:
                  </td>
                  <td className="p-2 text-right font-mono border-r border-slate-300">{formatNumber(totalSalesQuantity)}</td>
                  <td className="p-2 text-right font-mono">{formatPKR(totalSalesRevenue)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Formal Sign-off Section */}
            <div className="grid grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[10px]">
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Prepared By</p>
                <p className="text-slate-500">Sales In-Charge</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Verified By</p>
                <p className="text-slate-500">Commercial Manager</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Approved By</p>
                <p className="text-slate-500">Finance Director</p>
              </div>
            </div>
          </div>
        )}

        {/* 3. PRINT LAYOUT: Customer Aging */}
        {activeReport === "aging" && (
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Customers / Pharmacies</span>
                <span className="text-sm font-black text-black font-mono">{filteredCustomers.length}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Allowed Credit Limit</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalCustomerCreditLimit)}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Market Udhaar (Baqaya)</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalCustomerBalance)}</span>
              </div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-slate-300 text-[10px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800">
                  <th className="p-1.5 border-r border-slate-300 text-center w-8">#</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Customer / Medical Store</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Type</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">City</th>
                  <th className="p-1.5 border-r border-slate-300 text-right">Credit Limit (PKR)</th>
                  <th className="p-1.5 text-right">Remaining Balance (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-slate-500">
                      No customer or pharmacy records found matching criteria.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((c, idx) => (
                    <tr key={c.id} className="border-b border-slate-200">
                      <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-1.5 border-r border-slate-200 font-bold text-black">{c.name}</td>
                      <td className="p-1.5 border-r border-slate-200 uppercase text-[9px] text-slate-600">
                        {c.category === "pharmacy"
                          ? "Medical Store"
                          : c.category === "distributor"
                          ? "Wholesale Dealer"
                          : c.category === "direct_clinic"
                          ? "Clinic / Hospital"
                          : "Customer"}
                      </td>
                      <td className="p-1.5 border-r border-slate-200 text-slate-600">{c.city}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-700">{formatPKR(c.creditLimit)}</td>
                      <td className="p-1.5 text-right font-mono font-bold text-black">{formatPKR(c.currentOutstandingBalance)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-400 font-black text-black">
                  <td colSpan={4} className="p-2 text-right uppercase tracking-wider">
                    Total Market Receivables:
                  </td>
                  <td className="p-2 text-right font-mono border-r border-slate-300">{formatPKR(totalCustomerCreditLimit)}</td>
                  <td className="p-2 text-right font-mono">{formatPKR(totalCustomerBalance)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Formal Sign-off Section */}
            <div className="grid grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[10px]">
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Prepared By</p>
                <p className="text-slate-500">Accounts In-Charge</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Verified By</p>
                <p className="text-slate-500">Credit Controller</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Approved By</p>
                <p className="text-slate-500">Managing Partner</p>
              </div>
            </div>
          </div>
        )}

        {/* 4. PRINT LAYOUT: Tax Register */}
        {activeReport === "tax" && (
          <div className="space-y-4">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Invoices</span>
                <span className="text-sm font-black text-black font-mono">{filteredTaxInvoices.length}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Before Tax</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalTaxGross)}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Tax Collected</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalTaxAmount)}</span>
              </div>
              <div className="p-2 border border-slate-300 rounded bg-slate-50">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">Net Invoiced Total</span>
                <span className="text-sm font-black text-black font-mono">{formatPKR(totalTaxNet)}</span>
              </div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse border border-slate-300 text-[10px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-800">
                  <th className="p-1.5 border-r border-slate-300 text-center w-8">#</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Bill #</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Medical Store Name</th>
                  <th className="p-1.5 border-r border-slate-300 text-left">Date</th>
                  <th className="p-1.5 border-r border-slate-300 text-right">Total Before Tax (PKR)</th>
                  <th className="p-1.5 border-r border-slate-300 text-right">Tax (PKR)</th>
                  <th className="p-1.5 text-right">Final Bill Total (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTaxInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-500">
                      No invoices found for period &ldquo;{datePresetLabel}&rdquo;
                      {searchQuery ? ` matching "${searchQuery}"` : ""}.
                    </td>
                  </tr>
                ) : (
                  filteredTaxInvoices.map((inv, idx) => (
                    <tr key={inv.id} className="border-b border-slate-200">
                      <td className="p-1.5 border-r border-slate-200 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="p-1.5 border-r border-slate-200 font-mono font-bold text-black">
                        {inv.provisionalReference || inv.officialReference}
                      </td>
                      <td className="p-1.5 border-r border-slate-200 font-bold text-black">{inv.customerName}</td>
                      <td className="p-1.5 border-r border-slate-200 font-mono text-slate-600">{inv.invoiceDate}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-700">{formatPKR(inv.grossTotal)}</td>
                      <td className="p-1.5 border-r border-slate-200 text-right font-mono text-slate-700">{formatPKR(inv.taxAmount)}</td>
                      <td className="p-1.5 text-right font-mono font-bold text-black">{formatPKR(inv.netTotal)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t-2 border-slate-400 font-black text-black">
                  <td colSpan={4} className="p-2 text-right uppercase tracking-wider">
                    Total Tax Register:
                  </td>
                  <td className="p-2 text-right font-mono border-r border-slate-300">{formatPKR(totalTaxGross)}</td>
                  <td className="p-2 text-right font-mono border-r border-slate-300">{formatPKR(totalTaxAmount)}</td>
                  <td className="p-2 text-right font-mono">{formatPKR(totalTaxNet)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Formal Sign-off Section */}
            <div className="grid grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[10px]">
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Prepared By</p>
                <p className="text-slate-500">Tax Accountant</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Verified By</p>
                <p className="text-slate-500">Internal Auditor</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-8 mb-1"></div>
                <p className="font-bold text-black">Approved By</p>
                <p className="text-slate-500">Chief Financial Officer</p>
              </div>
            </div>
          </div>
        )}

        {/* Footer Note */}
        <p className="text-[9px] text-slate-500 text-center pt-2 border-t border-slate-200">
          This is an official system-generated management report from Noxderma Pharmaceuticals ERP. Valid for audit and operational verification when signed above.
        </p>
      </div>
    </>
  );
}
