"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Clock,
  Package,
  Layers,
  Receipt,
  PlusCircle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Compass,
  Calendar,
  Users2,
  PackageCheck,
  Award,
  Wallet,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { formatPKR, formatKarachiDate, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { syncManager } from "@/lib/offline/sync";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import {
  getUserRoleLabel,
  isRoleRedundantForName,
  normalizeUserDisplayName,
  type Invoice,
  type InventoryBatch,
  type StockMovement,
  type OutboxOperation,
  type Product,
  type ProductPricing,
  type OperatingExpense,
  type StaffSalary,
  type Permission,
  type PartnerTransaction,
  type PartnerConfig,
} from "@/types";
import { getPartnerTheme } from "@/lib/partners";

export function DashboardView() {
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const { currentUser, hasPermission, hasAnyPermission } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productPricings, setProductPricings] = useState<ProductPricing[]>([]);
  const [operatingExpenses, setOperatingExpenses] = useState<OperatingExpense[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<StaffSalary[]>([]);
  const [allMovements, setAllMovements] = useState<StockMovement[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [outbox, setOutbox] = useState<OutboxOperation[]>([]);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedRange, setSelectedRange] = useState<"month" | "7d" | "30d">("month");
  const [viewPeriod, setViewPeriod] = useState<"month" | "today">("month");
  const [partnerTransactions, setPartnerTransactions] = useState<PartnerTransaction[]>([]);
  const [partnerConfigRefreshTick, setPartnerConfigRefreshTick] = useState(0);

  // Load live data from IndexedDB
  const refreshDashboardData = async () => {
    try {
      const [
        invList,
        batchList,
        movList,
        outList,
        prodList,
        mfrList,
        poList,
        partList,
        pricingList,
        expList,
        salList,
      ] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.stockMovements.toArray(),
        offlineDb.outboxQueue.where("status").anyOf(["pending", "processing", "conflict", "failed"]).toArray(),
        offlineDb.products.toArray(),
        offlineDb.manufacturers.toArray(),
        offlineDb.purchaseOrders.toArray(),
        offlineDb.partnerTransactions ? offlineDb.partnerTransactions.toArray() : Promise.resolve([]),
        offlineDb.productPricing ? offlineDb.productPricing.toArray() : Promise.resolve([]),
        offlineDb.operatingExpenses ? offlineDb.operatingExpenses.toArray() : Promise.resolve([]),
        offlineDb.staffSalaries ? offlineDb.staffSalaries.toArray() : Promise.resolve([]),
      ]);

      const sortedMovs = [...(movList || [])].sort((a, b) =>
        String(b.timestamp || "").localeCompare(String(a.timestamp || ""))
      );

      setInvoices(invList);
      setBatches(batchList);
      setAllMovements(sortedMovs);
      setMovements(sortedMovs.slice(0, 10));
      setOutbox(outList);
      setProducts(prodList);
      setManufacturers(mfrList);
      setPurchaseOrders(poList);
      setPartnerTransactions(partList || []);
      setProductPricings(pricingList || []);
      setOperatingExpenses(expList || []);
      setSalaryRecords(salList || []);
      setPartnerConfigRefreshTick((t) => t + 1);
    } catch (err) {
      console.warn("Failed to query IndexedDB dashboard metrics:", err);
    }
  };

  useEffect(() => {
    refreshDashboardData();
    const unsub = syncManager.subscribe(() => {
      refreshDashboardData();
    });
    const handleCloudSynced = () => {
      refreshDashboardData();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => {
      unsub();
      window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
    };
  }, []);

  // Compute category isolation
  const categoryProductIds = new Set(
    selectedCategoryId === "all"
      ? products.map((p) => p.id)
      : products.filter((p) => p.categoryId === selectedCategoryId).map((p) => p.id)
  );

  const activeCategoryObj =
    selectedCategoryId === "all"
      ? null
      : categories.find((c) => c.id === selectedCategoryId);

  const displayBatches =
    selectedCategoryId === "all"
      ? batches
      : batches.filter((b) => categoryProductIds.has(b.productId));

  const displayMovements =
    selectedCategoryId === "all"
      ? movements
      : movements.filter((m) => categoryProductIds.has(m.productId));

  const displayInvoices =
    selectedCategoryId === "all"
      ? invoices.filter((inv) => (inv as any).status !== "cancelled")
      : invoices.filter(
          (inv) =>
            (inv as any).status !== "cancelled" &&
            inv.lines?.some((l) => categoryProductIds.has(l.productId))
        );

  const displayAllMovements =
    selectedCategoryId === "all"
      ? allMovements
      : allMovements.filter((m) => categoryProductIds.has(m.productId));

  // Fast Lookup Maps for COGS & Profit Calculation (matches /finance/pnl 1-to-1)
  const pricingMap = useMemo(() => {
    const map = new Map<string, ProductPricing>();
    for (const p of productPricings) {
      map.set(String(p.productId), p);
    }
    return map;
  }, [productPricings]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(String(p.id), p);
    }
    return map;
  }, [products]);

  const batchMap = useMemo(() => {
    const map = new Map<string, InventoryBatch>();
    for (const b of batches) {
      map.set(String(b.id), b);
    }
    return map;
  }, [batches]);

  const resolveLineUnitCost = (l: any): number => {
    const pricing = pricingMap.get(String(l.productId));
    const prod = productMap.get(String(l.productId));
    const batch = l.batchAllocations?.[0]?.batchId
      ? batchMap.get(String(l.batchAllocations[0].batchId))
      : undefined;

    const allocCost = l.batchAllocations?.[0]?.unitCostAtAllocation;
    if (typeof allocCost === "number" && allocCost > 0) {
      return allocCost;
    }
    if (pricing && Number(pricing.purchaseCostPerPack) > 0) {
      return Number(pricing.purchaseCostPerPack);
    }
    if (batch && Number((batch as any).purchasePrice || (batch as any).unitCost) > 0) {
      return Number((batch as any).purchasePrice || (batch as any).unitCost);
    }
    if (prod && Number((prod as any).purchaseCostPerPack || (prod as any).costPrice) > 0) {
      return Number((prod as any).purchaseCostPerPack || (prod as any).costPrice);
    }
    return 0;
  };

  // Dynamic Month & Today calculations (whichever month is currently running)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth();
  const currentMonthName = now.toLocaleString("default", { month: "long" });
  const currentMonthShort = now.toLocaleString("default", { month: "short" });
  const currentMonthPrefix = `${currentYear}-${String(currentMonthNum + 1).padStart(2, "0")}`;

  // Monthly KPI totals (Current Active Month)
  const monthInvoices = displayInvoices.filter((inv) => inv.invoiceDate?.startsWith(currentMonthPrefix));
  const monthSalesTotal = monthInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
  const monthPaymentsCollected = monthInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
  const monthReceivablesCreated = monthInvoices.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);

  // Today KPI totals
  const todayStr = now.toISOString().split("T")[0];
  const todayInvoices = displayInvoices.filter((inv) => inv.invoiceDate?.startsWith(todayStr));
  const todaySalesTotal = todayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
  const todayPaymentsCollected = todayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);

  // Profit Calculation Engine (Net Profit, Gross Profit, COGS, Expenses & Margin %)
  const computeProfitMetrics = useMemo(() => {
    return (
      targetInvoices: Invoice[],
      targetExpenses: OperatingExpense[],
      targetSalaries: StaffSalary[],
      targetMovements: StockMovement[]
    ) => {
      let grossSales = 0;
      let discountsGiven = 0;
      let cogs = 0;
      let invoiceDeliveryCharges = 0;

      for (const inv of targetInvoices) {
        if ((inv as any).status === "cancelled") continue;

        if (selectedCategoryId === "all") {
          const linesGross = (inv.lines || []).reduce(
            (lSum, l) => lSum + (l.quantity || 0) * (l.unitPrice || 0),
            0
          );
          grossSales += inv.grossTotal || linesGross || inv.netTotal || 0;

          const linesDiscount = (inv.lines || []).reduce(
            (lSum, l) => lSum + (l.lineDiscountAmount || 0),
            0
          );
          discountsGiven += inv.invoiceDiscountAmount || linesDiscount || 0;
          invoiceDeliveryCharges += inv.deliveryCharge || 0;

          for (const l of inv.lines || []) {
            cogs += (l.quantity || 0) * resolveLineUnitCost(l);
          }
        } else {
          // Category-scoped revenue & COGS
          for (const l of inv.lines || []) {
            if (!categoryProductIds.has(l.productId)) continue;
            const lineGross = (l.quantity || 0) * (l.unitPrice || 0);
            const lineDisc = l.lineDiscountAmount || 0;
            grossSales += lineGross || l.lineTotal || 0;
            discountsGiven += lineDisc;
            cogs += (l.quantity || 0) * resolveLineUnitCost(l);
          }
        }
      }

      const netSales = Math.max(0, grossSales - discountsGiven);
      const grossProfit = netSales - cogs;

      // Damaged & Sample stock losses
      let damagedAndSampleLoss = 0;
      for (const m of targetMovements) {
        if (m.type === "damaged_stock" || m.type === "sample_issue") {
          const pricing = pricingMap.get(String(m.productId));
          const unitCost = pricing?.purchaseCostPerPack || 350;
          damagedAndSampleLoss += Math.abs(m.quantityChange || 0) * unitCost;
        }
      }

      let generalExpenses = 0;
      let paidPayrollCost = 0;

      if (selectedCategoryId === "all") {
        generalExpenses = targetExpenses.reduce(
          (sum, e) => sum + (Number(e.amount) || 0),
          0
        );
        paidPayrollCost = targetSalaries.reduce((sum, s) => {
          if (s.status !== "paid") return sum;
          const fuel = Number(s.fuelAllowance) || 0;
          const netBase = Math.max(
            0,
            (Number(s.baseSalary) || 0) +
              (Number(s.bonus) || 0) +
              (Number(s.otherAllowances) || 0) -
              (Number(s.deductions) || 0)
          );
          return sum + fuel + netBase;
        }, 0);
      }

      const totalOperatingExpenses =
        generalExpenses + paidPayrollCost + invoiceDeliveryCharges + damagedAndSampleLoss;
      const netProfit = grossProfit - totalOperatingExpenses;
      const grossMarginPct =
        netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : "0.0";
      const netMarginPct =
        netSales > 0 ? ((netProfit / netSales) * 100).toFixed(1) : "0.0";

      return {
        netSales,
        cogs,
        grossProfit,
        totalOperatingExpenses,
        netProfit,
        grossMarginPct,
        netMarginPct,
      };
    };
  }, [pricingMap, productMap, batchMap, selectedCategoryId, categoryProductIds]);

  const monthProfit = useMemo(() => {
    const mExpenses = operatingExpenses.filter((e) =>
      String(e.date || (e as any).expenseDate || e.createdAt || "").startsWith(currentMonthPrefix)
    );
    const mSalaries = salaryRecords.filter((s) => {
      if (s.status !== "paid") return false;
      const targetDate = s.month ? `${s.month}-15` : String(s.disbursedAt || s.createdAt || "");
      return targetDate.startsWith(currentMonthPrefix);
    });
    const mMovements = displayAllMovements.filter((m) =>
      String(m.timestamp || "").startsWith(currentMonthPrefix)
    );
    return computeProfitMetrics(monthInvoices, mExpenses, mSalaries, mMovements);
  }, [
    computeProfitMetrics,
    monthInvoices,
    operatingExpenses,
    salaryRecords,
    displayAllMovements,
    currentMonthPrefix,
  ]);

  const todayProfit = useMemo(() => {
    const tExpenses = operatingExpenses.filter((e) =>
      String(e.date || (e as any).expenseDate || e.createdAt || "").startsWith(todayStr)
    );
    const tSalaries = salaryRecords.filter((s) => {
      if (s.status !== "paid") return false;
      return String(s.disbursedAt || "").startsWith(todayStr);
    });
    const tMovements = displayAllMovements.filter((m) =>
      String(m.timestamp || "").startsWith(todayStr)
    );
    return computeProfitMetrics(todayInvoices, tExpenses, tSalaries, tMovements);
  }, [
    computeProfitMetrics,
    todayInvoices,
    operatingExpenses,
    salaryRecords,
    displayAllMovements,
    todayStr,
  ]);

  const allTimeProfit = useMemo(() => {
    const paidSalaries = salaryRecords.filter((s) => s.status === "paid");
    return computeProfitMetrics(
      displayInvoices,
      operatingExpenses,
      paidSalaries,
      displayAllMovements
    );
  }, [
    computeProfitMetrics,
    displayInvoices,
    operatingExpenses,
    salaryRecords,
    displayAllMovements,
  ]);

  const activeProfit = viewPeriod === "month" ? monthProfit : todayProfit;

  // Top Selling Medicines Aggregation (with Product Pictures)
  const [topMedicinesRange, setTopMedicinesRange] = useState<"month" | "today" | "all">("month");

  const topSellingMedicines = useMemo(() => {
    const productById = new Map<string, Product>();
    products.forEach((p) => productById.set(p.id, p));

    const sourceInvoices =
      topMedicinesRange === "today"
        ? todayInvoices
        : topMedicinesRange === "month"
        ? monthInvoices
        : displayInvoices;

    const agg = new Map<
      string,
      {
        productId: string;
        productName: string;
        sku: string;
        categoryName: string;
        packSize: string;
        imageUrl: string;
        quantitySold: number;
        bonusQuantity: number;
        revenue: number;
        profit: number;
        invoiceIds: Set<string>;
      }
    >();

    sourceInvoices.forEach((inv) => {
      if ((inv as any).status === "cancelled") return;
      (inv.lines || []).forEach((line) => {
        if (selectedCategoryId !== "all" && !categoryProductIds.has(line.productId)) {
          return;
        }
        const prod = productById.get(line.productId);
        const primaryImg = prod?.images?.find((i) => i.isPrimary) || prod?.images?.[0];
        const resolvedImg =
          primaryImg?.thumbnailUrl ||
          primaryImg?.url ||
          (line as any).imageUrl ||
          (prod as any)?.imageUrl ||
          "";

        const key = line.productId || line.productName;
        const existing = agg.get(key);
        const qty = Number(line.quantity) || 0;
        const bonus = Number(line.bonusQuantity) || 0;
        const rev = Number(line.lineTotal) || qty * (Number(line.unitPrice) || 0);
        const lineCogs = qty * resolveLineUnitCost(line);
        const lineProfit = rev - lineCogs;

        if (existing) {
          existing.quantitySold += qty;
          existing.bonusQuantity += bonus;
          existing.revenue += rev;
          existing.profit += lineProfit;
          existing.invoiceIds.add(inv.id);
          if (!existing.imageUrl && resolvedImg) existing.imageUrl = resolvedImg;
        } else {
          agg.set(key, {
            productId: prod?.id || line.productId || "",
            productName: prod?.name || line.productName || "Medicine",
            sku: prod?.sku || "",
            categoryName: prod?.categoryName || "",
            packSize: prod?.packSize || line.packSize || "",
            imageUrl: resolvedImg,
            quantitySold: qty,
            bonusQuantity: bonus,
            revenue: rev,
            profit: lineProfit,
            invoiceIds: new Set([inv.id]),
          });
        }
      });
    });

    let list = Array.from(agg.values())
      .map((item) => ({
        ...item,
        billsCount: item.invoiceIds.size,
      }))
      .sort((a, b) => b.quantitySold - a.quantitySold || b.revenue - a.revenue);

    // If no sales in the selected period yet, include catalog medicines so the widget still showcases medicines with pictures
    if (list.length === 0 && products.length > 0) {
      const filteredProds =
        selectedCategoryId === "all"
          ? products
          : products.filter((p) => p.categoryId === selectedCategoryId);
      list = filteredProds.slice(0, 6).map((prod) => {
        const primaryImg = prod.images?.find((i) => i.isPrimary) || prod.images?.[0];
        return {
          productId: prod.id,
          productName: prod.name,
          sku: prod.sku,
          categoryName: prod.categoryName,
          packSize: prod.packSize,
          imageUrl: primaryImg?.thumbnailUrl || primaryImg?.url || "",
          quantitySold: 0,
          bonusQuantity: 0,
          revenue: 0,
          profit: 0,
          invoiceIds: new Set<string>(),
          billsCount: 0,
        };
      });
    }

    return list.slice(0, 8);
  }, [
    products,
    todayInvoices,
    monthInvoices,
    displayInvoices,
    topMedicinesRange,
    selectedCategoryId,
    categoryProductIds,
    pricingMap,
    productMap,
    batchMap,
  ]);

  const totalReceivables = displayInvoices.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
  const storeReceivables = displayInvoices
    .filter((inv) => inv.customerCategory !== "distributor")
    .reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
  const distributorReceivables = displayInvoices
    .filter((inv) => inv.customerCategory === "distributor")
    .reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
  const totalManufacturerPayables = manufacturers.reduce(
    (sum, m) => sum + (Number(m.payableBalance ?? m.currentPayable) || 0),
    0
  );
  const pendingPoPayables = purchaseOrders
    .filter((po) => po.status !== "cancelled" && po.status !== "completed")
    .reduce((sum, po) => sum + (po.totalAmount || 0), 0);

  // Near-expiry batches (< 90 days)
  const nowTime = Date.now();
  const ninetyDaysFromNow = nowTime + 90 * 24 * 60 * 60 * 1000;
  const nearExpiryBatches = displayBatches.filter((b) => {
    const expTime = new Date(b.expiryDate).getTime();
    return expTime > nowTime && expTime <= ninetyDaysFromNow && b.remainingQuantity > 0;
  });

  const expiredBatches = displayBatches.filter((b) => {
    const expTime = new Date(b.expiryDate).getTime();
    return expTime <= nowTime && b.remainingQuantity > 0;
  });

  // Dynamic Sales, Profit & Payments Trend (Default: Current Month day-by-day)
  const salesChartData = useMemo(() => {
    const computeDayProfit = (dayInvs: Invoice[]) => {
      return computeProfitMetrics(dayInvs, [], [], []).grossProfit;
    };

    if (selectedRange === "month") {
      const daysCount = Math.max(now.getDate(), 7);
      return Array.from({ length: daysCount }, (_, i) => {
        const dayNum = i + 1;
        const dayStr = `${currentMonthPrefix}-${String(dayNum).padStart(2, "0")}`;
        const dayInvoices = displayInvoices.filter((inv) => inv.invoiceDate?.startsWith(dayStr));
        const sales = dayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
        const collected = dayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const profit = computeDayProfit(dayInvoices);
        return {
          day: `${dayNum} ${currentMonthShort}`,
          sales,
          profit,
          collected,
        };
      });
    } else if (selectedRange === "30d") {
      return Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (29 - i));
        const dateStr = d.toISOString().split("T")[0];
        const dayInvoices = displayInvoices.filter((inv) => inv.invoiceDate?.startsWith(dateStr));
        const sales = dayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
        const collected = dayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const profit = computeDayProfit(dayInvoices);
        return {
          day: `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`,
          sales,
          profit,
          collected,
        };
      });
    } else {
      // 7d
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
        const dateStr = d.toISOString().split("T")[0];
        const dayInvoices = displayInvoices.filter((inv) => inv.invoiceDate?.startsWith(dateStr));
        const sales = dayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
        const collected = dayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        const profit = computeDayProfit(dayInvoices);
        return {
          day: i === 6 ? "Today" : dayName,
          sales,
          profit,
          collected,
        };
      });
    }
  }, [displayInvoices, selectedRange, currentMonthPrefix, currentMonthShort, computeProfitMetrics]);

  // Dynamic Category Share computed from actual catalog products
  const categoryShareData = categories
    .map((c) => {
      const catProds = products.filter((p) => p.categoryId === c.id);
      return {
        name: c.name,
        value: catProds.length,
      };
    })
    .filter((c) => c.value > 0);

  if (categoryShareData.length === 0) {
    categoryShareData.push({ name: "General Inventory", value: products.length || 1 });
  }

  // Strict Role & Module Permission Checks for Dashboard Sections
  const isOwnerOrAccountant =
    currentUser?.role === "owner" ||
    currentUser?.id === "usr_admin" ||
    currentUser?.role === "accountant";

  const canViewSalesSummary =
    isOwnerOrAccountant || hasPermission("dashboard:sales") || hasPermission("finance:pnl");
  const canViewFinanceSummary =
    isOwnerOrAccountant || hasPermission("dashboard:finance") || hasPermission("finance:pnl");
  const canViewInventory = hasAnyPermission([
    "inventory:view",
    "inventory:receive",
    "inventory:damage",
    "inventory:samples",
    "inventory:adjust",
  ]);

  return (
    <div className="space-y-5">
      {/* Top Banner: Greeting, Month, and Quick Actions */}
      <div className="flex flex-col gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                {viewPeriod === "month" ? "Monthly Business Overview" : "Daily Business Overview"}
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                <Calendar className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                {viewPeriod === "month" ? `${currentMonthName} ${currentYear}` : "Today"}
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              {viewPeriod === "month" ? (
                <>Showing monthly records for <strong>{currentMonthName} {currentYear}</strong> &bull; </>
              ) : (
                <>Showing today&apos;s daily records &bull; </>
              )}
              Logged in as{" "}
              <strong className="text-slate-800 dark:text-slate-200">
                {normalizeUserDisplayName(
                  currentUser?.displayName,
                  currentUser?.role === "owner" || currentUser?.role === "admin"
                    ? "Owner"
                    : "Staff"
                )}
              </strong>
              {!isRoleRedundantForName(
                currentUser?.displayName,
                currentUser?.role
              ) && (
                <>
                  {" "}
                  &bull;{" "}
                  <span className="uppercase font-bold text-teal-600 dark:text-teal-400">
                    {getUserRoleLabel(currentUser?.role)}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* View Switcher: This Month vs Today + Quick Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          {/* Period Toggle */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-bold shrink-0">
            <button
              type="button"
              onClick={() => setViewPeriod("month")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewPeriod === "month"
                  ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              📅 This Month ({currentMonthShort})
            </button>
            <button
              type="button"
              onClick={() => setViewPeriod("today")}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewPeriod === "today"
                  ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              ⚡ Today
            </button>
          </div>

          {/* Primary Action: Make New Bill */}
          {hasPermission("invoices:create") && (
            <Link
              href="/sales/invoices/new"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 min-h-[36px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold shadow-sm shadow-teal-600/20 transition-all btn-interactive shrink-0"
            >
              <PlusCircle className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>Make New Bill</span>
            </Link>
          )}

          {/* Partners Khata */}
          {isOwnerOrAccountant && (
            <Link
              href="/finance/partners"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl border border-teal-500/40 bg-teal-50/70 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-all btn-interactive shrink-0"
            >
              <Users2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Partners Khata</span>
            </Link>
          )}

          {/* Staff Location */}
          {hasPermission("staff:monitoring") && (
            <Link
              href="/employees/monitoring"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all btn-interactive shrink-0"
            >
              <Compass className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Staff Location</span>
            </Link>
          )}

          {/* Add Doctor Visit */}
          {hasPermission("crm:visits") && (
            <Link
              href="/crm/visits"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all btn-interactive shrink-0"
            >
              <span>Add Doctor Visit</span>
            </Link>
          )}
        </div>
      </div>

      {/* Active Category Filter Alert if filtered */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Showing data for: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
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

      {/* KPI Cards Grid (Only renders cards permitted for this role/user) */}
      {(canViewSalesSummary || canViewFinanceSummary || canViewInventory) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
          {/* Card 1: Monthly / Today Sales (Owner / Accountant / dashboard:sales only) */}
          {canViewSalesSummary && (
            <Link
              href="/sales/invoices"
              className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-teal-500/60 block cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                  {viewPeriod === "month"
                    ? `${currentMonthName}'s Total Sales`
                    : "Today's Total Sales"}
                </span>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center shadow-sm shrink-0">
                  <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-slate-100">
                  {formatPKR(viewPeriod === "month" ? monthSalesTotal : todaySalesTotal)}
                </span>
                <span className="text-xs font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3.5 h-3.5" />{" "}
                  {viewPeriod === "month"
                    ? `${monthInvoices.length} bill${monthInvoices.length !== 1 ? "s" : ""}`
                    : `${todayInvoices.length} bill${todayInvoices.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5 space-y-0.5">
                <p>
                  Cash Received:{" "}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {formatPKR(viewPeriod === "month" ? monthPaymentsCollected : todayPaymentsCollected)}
                  </strong>
                </p>
                <div className="text-[11px] text-slate-400 flex items-center justify-between gap-1">
                  {viewPeriod === "month" ? (
                    <span className="truncate">
                      Today: <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPKR(todaySalesTotal)}</span> ({todayInvoices.length} bills)
                    </span>
                  ) : (
                    <span className="truncate">
                      This Month ({currentMonthShort}): <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPKR(monthSalesTotal)}</span> ({monthInvoices.length} bills)
                    </span>
                  )}
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 group-hover:underline shrink-0">
                    Bills &rarr;
                  </span>
                </div>
              </div>
            </Link>
          )}

          {/* Card 2: Total Profit / Net Profit (Owner / Accountant / dashboard:finance / finance:pnl) */}
          {(canViewFinanceSummary || canViewSalesSummary) && (
            <Link
              href="/finance/pnl"
              className="p-3.5 sm:p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 bg-gradient-to-br from-white via-white to-emerald-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 shadow-soft card-interactive relative overflow-hidden group hover:border-emerald-500/60 block cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  {viewPeriod === "month"
                    ? `${currentMonthName}'s Total Profit`
                    : "Today's Total Profit"}
                </span>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm shrink-0">
                  <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <div className="mt-2 sm:mt-3 flex items-baseline gap-2 flex-wrap">
                <span
                  className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
                    activeProfit.netProfit >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {formatPKR(activeProfit.netProfit)}
                </span>
                <span
                  className={`text-[10px] sm:text-xs font-bold px-1.5 py-0.5 rounded-md flex items-center ${
                    activeProfit.netProfit >= 0
                      ? "bg-emerald-100/80 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300"
                      : "bg-rose-100/80 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300"
                  }`}
                >
                  {activeProfit.netProfit >= 0 ? (
                    <ArrowUpRight className="w-3 h-3 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 mr-0.5" />
                  )}
                  {activeProfit.netMarginPct}%
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5 space-y-0.5">
                <p>
                  Gross Margin:{" "}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {formatPKR(activeProfit.grossProfit)}
                  </strong>
                  {activeProfit.totalOperatingExpenses > 0 && (
                    <>
                      {" "}&bull; Exp:{" "}
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {formatPKR(activeProfit.totalOperatingExpenses)}
                      </span>
                    </>
                  )}
                </p>
                <p className="text-[11px] text-slate-400 flex items-center justify-between gap-1">
                  <span>
                    All-Time Profit:{" "}
                    <strong
                      className={
                        allTimeProfit.netProfit >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }
                    >
                      {formatPKR(allTimeProfit.netProfit)}
                    </strong>
                  </span>
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 group-hover:underline shrink-0">
                    P&amp;L &rarr;
                  </span>
                </p>
              </div>
            </Link>
          )}

          {/* Card 3: 3-Way Receivables (Owner / Accountant / dashboard:finance only) */}
          {canViewFinanceSummary && (
            <Link
              href="/finance/ledgers/customers"
              className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-sky-500/60 block cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
                  Money to Receive (Udhaar)
                </span>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center shadow-sm shrink-0">
                  <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-slate-100">
                  {formatPKR(totalReceivables)}
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5 space-y-0.5">
                <p>
                  Stores: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(storeReceivables)}</strong> &bull; Dist: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(distributorReceivables)}</strong>
                </p>
                <div className="text-[11px] text-slate-400 flex items-center justify-between gap-1">
                  <span className="truncate">
                    This Month New Udhaar: <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPKR(monthReceivablesCreated)}</span>
                  </span>
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 group-hover:underline shrink-0">
                    Khata &rarr;
                  </span>
                </div>
              </div>
            </Link>
          )}

          {/* Card 4: Manufacturer Payables (Owner / Accountant / dashboard:finance only) */}
          {canViewFinanceSummary && (
            <Link
              href="/finance/ledgers/manufacturers"
              className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-indigo-500/60 block cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Money We Owe Companies
                </span>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                  <Receipt className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-slate-900 dark:text-slate-100">
                  {formatPKR(totalManufacturerPayables)}
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5 flex items-center justify-between gap-1">
                <span>
                  Open POs: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(pendingPoPayables)}</strong>
                </span>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 group-hover:underline shrink-0">
                  Suppliers &rarr;
                </span>
              </div>
            </Link>
          )}

          {/* Card 5: FEFO Expiry / Low Stock Alerts (Only if inventory access permitted) */}
          {canViewInventory && (
            <Link
              href="/inventory/batches"
              className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-amber-500/60 block cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  Medicines Expiring Soon
                </span>
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shadow-sm shrink-0">
                  <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
              </div>
              <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
                <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-600 dark:text-amber-400">
                  {nearExpiryBatches.length}
                </span>
                <span className="text-xs font-medium text-slate-500">batches within 90 days</span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-500 mt-1.5 flex items-center justify-between gap-1">
                {expiredBatches.length > 0 ? (
                  <span className="text-red-600 font-bold truncate">{expiredBatches.length} Expired (Blocked from sale)</span>
                ) : (
                  <span className="text-emerald-600 font-semibold truncate">0 Expired Medicines (Stock Safe)</span>
                )}
                <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 group-hover:underline shrink-0">
                  Batches &rarr;
                </span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* Top Selling Medicines Widget (with Pictures) */}
      {(canViewSalesSummary || canViewInventory) && (
        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold shrink-0">
                <Award className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-xs sm:text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                  <span>Top Selling Medicines</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 font-mono">
                    {topMedicinesRange === "month"
                      ? `${currentMonthShort} ${currentYear}`
                      : topMedicinesRange === "today"
                      ? "Today"
                      : "All Time"}
                  </span>
                </h2>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  Most sold medicines ranked by packs sold &amp; revenue
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setTopMedicinesRange("month")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    topMedicinesRange === "month"
                      ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => setTopMedicinesRange("today")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    topMedicinesRange === "today"
                      ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setTopMedicinesRange("all")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    topMedicinesRange === "all"
                      ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  All Time
                </button>
              </div>

              <Link
                href="/products"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shrink-0 shadow-sm"
              >
                <span>All Medicines</span> <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {topSellingMedicines.length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 text-xs sm:text-sm">
              No medicines or sales recorded yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
              {topSellingMedicines.map((item, idx) => {
                const maxQty = Math.max(topSellingMedicines[0]?.quantitySold || 1, 1);
                const sharePercent =
                  item.quantitySold > 0
                    ? Math.max(8, Math.min(100, Math.round((item.quantitySold / maxQty) * 100)))
                    : 0;
                const rankBadgeClass =
                  idx === 0
                    ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-300 dark:border-amber-700"
                    : idx === 1
                    ? "bg-slate-200 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600"
                    : idx === 2
                    ? "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/80 dark:text-orange-300 dark:border-orange-700"
                    : "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/70 dark:text-teal-300 dark:border-teal-800";

                return (
                  <Link
                    key={item.productId || `${item.productName}_${idx}`}
                    href={
                      item.productId
                        ? `/products/detail?id=${encodeURIComponent(item.productId)}`
                        : "/products"
                    }
                    className="p-3 sm:p-3.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 hover:border-teal-500/40 shadow-sm transition-all flex flex-col justify-between gap-2.5 group"
                  >
                    <div className="flex items-start gap-3">
                      {/* Medicine Picture Thumbnail */}
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 overflow-hidden relative flex items-center justify-center shadow-sm">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.imageUrl}
                            alt={item.productName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <PackageCheck className="w-7 h-7 text-slate-400" />
                        )}
                        <span
                          className={`absolute top-1 left-1 px-1.5 py-0.2 rounded-md text-[10px] font-black font-mono border shadow-sm ${rankBadgeClass}`}
                        >
                          #{idx + 1}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        {item.categoryName && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 truncate max-w-full">
                            {item.categoryName}
                          </span>
                        )}
                        <h3 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors">
                          {item.productName}
                        </h3>
                        <p className="text-[11px] text-slate-500 font-medium truncate">
                          {item.packSize ? item.packSize : "Standard Pack"}
                          {item.sku ? ` • ${item.sku}` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 font-medium">Sold:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-slate-900 dark:text-slate-100">
                            {formatNumber(item.quantitySold)} pk
                          </span>
                          {item.bonusQuantity > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              +{item.bonusQuantity} bonus
                            </span>
                          )}
                        </div>
                      </div>

                      {canViewSalesSummary && (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 font-medium">
                              Sales ({item.billsCount} bill{item.billsCount !== 1 ? "s" : ""}):
                            </span>
                            <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                              {formatPKR(item.revenue)}
                            </span>
                          </div>
                          {canViewFinanceSummary && (
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-500 font-medium">Profit:</span>
                              <span
                                className={`font-mono font-bold ${
                                  item.profit >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-rose-600 dark:text-rose-400"
                                }`}
                              >
                                {formatPKR(item.profit)}
                              </span>
                            </div>
                          )}
                        </>
                      )}

                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                          style={{ width: `${sharePercent}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Analytics & Charts Section (Owner / Accountant / dashboard:sales ONLY) */}
      {canViewSalesSummary && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Sales Performance Trend */}
        <div className="lg:col-span-2 p-3.5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-5">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                Sales, Profit &amp; Cash Collected Trend
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Day-by-day sales, profit &amp; cash received for {currentMonthName} {currentYear} (PKR)
              </p>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 self-start sm:self-auto text-xs font-bold">
              <button
                onClick={() => setSelectedRange("month")}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all btn-interactive ${
                  selectedRange === "month" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                📅 Month
              </button>
              <button
                onClick={() => setSelectedRange("7d")}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all btn-interactive ${
                  selectedRange === "7d" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setSelectedRange("30d")}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg transition-all btn-interactive ${
                  selectedRange === "30d" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                30 Days
              </button>
            </div>
          </div>

          <div className="h-56 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis
                  tickFormatter={(val) => `₨${val / 1000}k`}
                  tick={{ fontSize: 11 }}
                  stroke="#94a3b8"
                />
                <Tooltip
                  formatter={(val: number) => formatPKR(val)}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="sales"
                  name="Invoiced Bills"
                  stroke="#0d9488"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#salesGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  name="Gross Profit"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#profitGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  name="Cash Received"
                  stroke="#0284c7"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#collGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sector Breakdown */}
        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft flex flex-col justify-between">
          <div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              Sales by Category
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">Sales share across medicine categories</p>

            <div className="mt-3.5 space-y-2.5">
              {categoryShareData.map((cat) => (
                <div key={cat.name} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-slate-700 dark:text-slate-300">{cat.name}</span>
                    <span className="text-teal-600 dark:text-teal-400">{cat.value}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-teal-400 rounded-full"
                      style={{ width: `${cat.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl text-[11px] text-slate-600 dark:text-slate-400 mt-4 border border-slate-100 dark:border-slate-700/50">
            <span className="font-bold text-teal-600">Quick Tip:</span> You can add or rename medicine categories anytime in Settings.
          </div>
        </div>
      </div>
      )}

      {/* Critical Lists Grid: Near Expiry Batches & Recent Movements (Only if inventory access permitted) */}
      {canViewInventory && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Table 1: Near-Expiry Batches (Sell First) */}
        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Medicines Expiring Soon (Sell First)
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500">Stock expiring within the next 90 days</p>
            </div>
            <Link
              href="/inventory/batches"
              className="text-xs font-semibold text-teal-600 hover:underline shrink-0"
            >
              View Stock &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <th className="py-2">Medicine</th>
                  <th className="py-2">Batch No</th>
                  <th className="py-2">Expiry Date</th>
                  <th className="py-2 text-right">Remaining Stock</th>
                  <th className="py-2 text-right">Offer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {nearExpiryBatches.length > 0 ? (
                  nearExpiryBatches.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">
                        {b.productName}
                      </td>
                      <td className="py-2.5 font-mono text-teal-600">{b.batchNumber}</td>
                      <td className="py-2.5 text-amber-600 font-semibold">
                        {formatKarachiDate(b.expiryDate)}
                      </td>
                      <td className="py-2.5 text-right font-bold">{formatNumber(b.remainingQuantity)}</td>
                      <td className="py-2.5 text-right">
                        {hasPermission("marketing:manage") && (
                          <Link
                            href="/marketing"
                            className="px-2 py-1 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-semibold hover:bg-teal-100 text-[10px]"
                          >
                            Make Offer
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      Great! No medicines are expiring soon. All current stock is safe.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Recent Stock Movements & Auditable History */}
        <div className="p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Package className="w-4 h-4 text-teal-600" />
                Recent Stock In & Out History
              </h2>
              <p className="text-xs text-slate-500">Recent changes in your medicine stock</p>
            </div>
            <Link
              href="/inventory/movements"
              className="text-xs font-semibold text-teal-600 hover:underline"
            >
              Full History &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <th className="py-2">Date / Time</th>
                  <th className="py-2">Medicine</th>
                  <th className="py-2">Reason</th>
                  <th className="py-2 text-right">Stock Change</th>
                  <th className="py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {displayMovements.length > 0 ? (
                  displayMovements.map((m) => {
                    const label =
                      m.type === "sales_deduction"
                        ? "Sold (Bill)"
                        : m.type === "damaged_stock"
                        ? "Broken / Damaged"
                        : m.type === "sample_issue"
                        ? "Doctor Sample"
                        : m.type === "sales_return"
                        ? "Customer Wapis Stock"
                        : m.type === "supplier_return"
                        ? "Company Wapis Stock"
                        : m.type === "expiry_write_off"
                        ? "Expired Stock"
                        : (m.type as string).replace(/_/g, " ");

                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 text-slate-500">{formatKarachiDate(m.timestamp, true)}</td>
                        <td className="py-2.5 font-medium text-slate-900 dark:text-slate-100">
                          {m.productName}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              m.type === "sales_deduction"
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                : m.type === "sales_return"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                            }`}
                          >
                            {label}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 text-right font-bold ${
                            m.quantityChange < 0 ? "text-rose-600" : "text-emerald-600"
                          }`}
                        >
                          {m.quantityChange > 0 ? `+${m.quantityChange}` : m.quantityChange}
                        </td>
                        <td className="py-2.5 text-right font-semibold">{formatNumber(m.balanceAfter)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No stock changes recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
