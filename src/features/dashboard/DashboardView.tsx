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
  CheckCircle,
  Compass,
  Calendar,
  Users2,
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
  type Permission,
  type PartnerTransaction,
} from "@/types";

export function DashboardView() {
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const { currentUser, hasPermission, hasAnyPermission } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [outbox, setOutbox] = useState<OutboxOperation[]>([]);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedRange, setSelectedRange] = useState<"month" | "7d" | "30d">("month");
  const [viewPeriod, setViewPeriod] = useState<"month" | "today">("month");
  const [partnerTransactions, setPartnerTransactions] = useState<PartnerTransaction[]>([]);

  // Load live data from IndexedDB
  const refreshDashboardData = async () => {
    try {
      const [invList, batchList, movList, outList, prodList, mfrList, poList, partList] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.stockMovements.orderBy("timestamp").reverse().limit(10).toArray(),
        offlineDb.outboxQueue.where("status").anyOf(["pending", "processing", "conflict", "failed"]).toArray(),
        offlineDb.products.toArray(),
        offlineDb.manufacturers.toArray(),
        offlineDb.purchaseOrders.toArray(),
        offlineDb.partnerTransactions ? offlineDb.partnerTransactions.toArray() : Promise.resolve([]),
      ]);

      setInvoices(invList);
      setBatches(batchList);
      setMovements(movList);
      setOutbox(outList);
      setProducts(prodList);
      setManufacturers(mfrList);
      setPurchaseOrders(poList);
      setPartnerTransactions(partList || []);
    } catch (err) {
      console.warn("Failed to query IndexedDB dashboard metrics:", err);
    }
  };

  useEffect(() => {
    refreshDashboardData();
    const unsub = syncManager.subscribe(() => {
      refreshDashboardData();
    });
    return () => unsub();
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
      ? invoices
      : invoices.filter((inv) => inv.lines?.some((l) => categoryProductIds.has(l.productId)));

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

  // Partner Monthly Calculations
  const partner1Name = typeof window !== "undefined" ? localStorage.getItem("nox_partner_1_name") || "Partner 1" : "Partner 1";
  const partner2Name = typeof window !== "undefined" ? localStorage.getItem("nox_partner_2_name") || "Partner 2" : "Partner 2";

  const p1MonthIn = partnerTransactions.filter((t) => t.partnerId === "partner_1" && t.type === "in" && t.date?.startsWith(currentMonthPrefix)).reduce((s, t) => s + t.amount, 0);
  const p1MonthOut = partnerTransactions.filter((t) => t.partnerId === "partner_1" && t.type === "out" && t.date?.startsWith(currentMonthPrefix)).reduce((s, t) => s + t.amount, 0);
  const p1MonthNet = p1MonthIn - p1MonthOut;

  const p2MonthIn = partnerTransactions.filter((t) => t.partnerId === "partner_2" && t.type === "in" && t.date?.startsWith(currentMonthPrefix)).reduce((s, t) => s + t.amount, 0);
  const p2MonthOut = partnerTransactions.filter((t) => t.partnerId === "partner_2" && t.type === "out" && t.date?.startsWith(currentMonthPrefix)).reduce((s, t) => s + t.amount, 0);
  const p2MonthNet = p2MonthIn - p2MonthOut;

  const totalReceivables = displayInvoices.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
  const storeReceivables = displayInvoices
    .filter((inv) => inv.customerCategory !== "distributor")
    .reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
  const distributorReceivables = displayInvoices
    .filter((inv) => inv.customerCategory === "distributor")
    .reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);
  const totalManufacturerPayables = manufacturers.reduce((sum, m) => sum + (m.currentPayable || 0), 0);
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

  // Dynamic Sales & Payments Trend (Default: Current Month day-by-day)
  const salesChartData = useMemo(() => {
    if (selectedRange === "month") {
      const daysCount = Math.max(now.getDate(), 7);
      return Array.from({ length: daysCount }, (_, i) => {
        const dayNum = i + 1;
        const dayStr = `${currentMonthPrefix}-${String(dayNum).padStart(2, "0")}`;
        const dayInvoices = displayInvoices.filter((inv) => inv.invoiceDate?.startsWith(dayStr));
        const sales = dayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
        const collected = dayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
        return {
          day: `${dayNum} ${currentMonthShort}`,
          sales,
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
        return {
          day: `${d.getDate()} ${d.toLocaleString("default", { month: "short" })}`,
          sales,
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
        return {
          day: i === 6 ? "Today" : dayName,
          sales,
          collected,
        };
      });
    }
  }, [displayInvoices, selectedRange, currentMonthPrefix, currentMonthShort]);

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

  const allQuickModules: {
    title: string;
    desc: string;
    href: string;
    perm: Permission;
    badge: string;
  }[] = [
    {
      title: "Make New Bill (Invoice)",
      desc: "Create customer invoice & cash memo",
      href: "/sales/invoices/new",
      perm: "invoices:create",
      badge: "Sales",
    },
    {
      title: "Invoices (Bills) List",
      desc: "View and print customer bills",
      href: "/sales/invoices",
      perm: "invoices:view",
      badge: "Sales",
    },
    {
      title: "Staff Bookings",
      desc: "Field order bookings",
      href: "/sales/bookings",
      perm: "invoices:create",
      badge: "Orders",
    },
    {
      title: "Medicines Catalog",
      desc: "View medicines, pack sizes & rates",
      href: "/products",
      perm: "products:view",
      badge: "Catalog",
    },
    {
      title: "Price Estimator",
      desc: "Calculate landed cost, TP & MRP",
      href: "/products/price-estimator",
      perm: "pricing:view",
      badge: "Pricing",
    },
    {
      title: "Batches & Expiry",
      desc: "Warehouse stock & expiry dates",
      href: "/inventory/batches",
      perm: "inventory:view",
      badge: "Stock",
    },
    {
      title: "Stock Alerts",
      desc: "Current medicine stock & low stock",
      href: "/inventory",
      perm: "inventory:view",
      badge: "Stock",
    },
    {
      title: "Purchases (GRN)",
      desc: "Receive stock from manufacturers",
      href: "/purchases",
      perm: "inventory:receive",
      badge: "GRN",
    },
    {
      title: "Pharmacies & Clients",
      desc: "Medical stores & distributors",
      href: "/customers",
      perm: "crm:customers",
      badge: "CRM",
    },
    {
      title: "Doctor Visits",
      desc: "Record doctor & field visits",
      href: "/crm/visits",
      perm: "crm:visits",
      badge: "Field",
    },
    {
      title: "Client Leads",
      desc: "New enquiries & sales prospects",
      href: "/crm/leads",
      perm: "crm:leads",
      badge: "CRM",
    },
    {
      title: "Staff Live Location",
      desc: "Live GPS & mobile battery monitor",
      href: "/employees/monitoring",
      perm: "staff:monitoring",
      badge: "GPS",
    },
    {
      title: "Market Udhaar",
      desc: "Customer credit & aging balances",
      href: "/finance/credit",
      perm: "finance:aging",
      badge: "Khata",
    },
    {
      title: "Company & Customer Khata",
      desc: "Detailed account ledgers",
      href: "/finance/ledgers/customers",
      perm: "finance:ledgers",
      badge: "Khata",
    },
    {
      title: "Profit & Loss",
      desc: "Net profit, margins & reports",
      href: "/finance/pnl",
      perm: "finance:pnl",
      badge: "Accounts",
    },
    {
      title: "Offers & Schemes",
      desc: "Bonus schemes, coupons & WhatsApp",
      href: "/marketing",
      perm: "marketing:manage",
      badge: "Marketing",
    },
    {
      title: "Partners Khata",
      desc: "Partners capital, drawings & monthly ledger",
      href: "/finance/partners",
      perm: "finance:pnl",
      badge: "Partners",
    },
  ];

  const permittedQuickModules = allQuickModules.filter((m) => hasPermission(m.perm));

  return (
    <div className="space-y-6">
      {/* Top Banner: Greeting, Month, and Quick Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              {viewPeriod === "month" ? "Monthly Business Overview" : "Daily Business Overview"}
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              {viewPeriod === "month" ? `${currentMonthName} ${currentYear}` : "Today"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {viewPeriod === "month" ? (
              <>Showing monthly performance for <strong>{currentMonthName} {currentYear}</strong> &bull; </>
            ) : (
              <>Showing today&apos;s daily records &bull; </>
            )}
            Logged in as{" "}
            <strong>
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

        {/* View Switcher: This Month vs Today + Quick Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Period Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-xs font-bold">
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

          {hasPermission("invoices:create") && (
            <Link
              href="/sales/invoices/new"
              className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[38px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-teal-600/20 transition-all btn-interactive"
            >
              <PlusCircle className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>Make New Bill</span>
            </Link>
          )}

          {isOwnerOrAccountant && (
            <Link
              href="/finance/partners"
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[38px] rounded-xl border border-teal-500/40 bg-teal-50/70 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 text-xs sm:text-sm font-bold hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-all btn-interactive"
            >
              <Users2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>Partners Khata</span>
            </Link>
          )}

          {hasPermission("staff:monitoring") && (
            <Link
              href="/employees/monitoring"
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl border border-teal-500/40 bg-teal-50/70 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 text-xs sm:text-sm font-bold hover:bg-teal-100 dark:hover:bg-teal-900/60 transition-all btn-interactive text-center"
            >
              <Compass className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="truncate">Staff Location</span>
            </Link>
          )}

          {hasPermission("crm:visits") && (
            <Link
              href="/crm/visits"
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all btn-interactive text-center"
            >
              <span className="truncate">Add Doctor Visit</span>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Monthly / Today Sales (Owner / Accountant / dashboard:sales only) */}
          {canViewSalesSummary && (
            <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-teal-500/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {viewPeriod === "month"
                    ? `${currentMonthName}'s Total Sales`
                    : "Today's Total Sales"}
                </span>
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                  {formatPKR(viewPeriod === "month" ? monthSalesTotal : todaySalesTotal)}
                </span>
                <span className="text-xs font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3.5 h-3.5" />{" "}
                  {viewPeriod === "month"
                    ? `${monthInvoices.length} bill${monthInvoices.length !== 1 ? "s" : ""}`
                    : `${todayInvoices.length} bill${todayInvoices.length !== 1 ? "s" : ""}`}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                <p>
                  Cash Received:{" "}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {formatPKR(viewPeriod === "month" ? monthPaymentsCollected : todayPaymentsCollected)}
                  </strong>
                </p>
                {viewPeriod === "month" ? (
                  <p className="text-[11px] text-slate-400">
                    Today: <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPKR(todaySalesTotal)}</span> ({todayInvoices.length} bills &bull; {formatPKR(todayPaymentsCollected)} cash)
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    This Month ({currentMonthShort}): <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPKR(monthSalesTotal)}</span> ({monthInvoices.length} bills)
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Card 2: 3-Way Receivables (Owner / Accountant / dashboard:finance only) */}
          {canViewFinanceSummary && (
            <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-sky-500/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Money to Receive (Udhaar)
                </span>
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center shadow-sm">
                  <CreditCard className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                  {formatPKR(totalReceivables)}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                <p>
                  Stores: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(storeReceivables)}</strong> &bull; Dist: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(distributorReceivables)}</strong>
                </p>
                <p className="text-[11px] text-slate-400">
                  This Month New Udhaar: <span className="font-semibold text-slate-600 dark:text-slate-300">{formatPKR(monthReceivablesCreated)}</span>
                </p>
              </div>
            </div>
          )}

          {/* Card 3: Manufacturer Payables (Owner / Accountant / dashboard:finance only) */}
          {canViewFinanceSummary && (
            <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-indigo-500/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Money We Owe Companies
                </span>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center shadow-sm">
                  <Receipt className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                  {formatPKR(totalManufacturerPayables)}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Open POs: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(pendingPoPayables)}</strong>
              </p>
            </div>
          )}

          {/* Card 4: FEFO Expiry / Low Stock Alerts (Only if inventory access permitted) */}
          {canViewInventory && (
            <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-amber-500/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Medicines Expiring Soon
                </span>
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shadow-sm">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-amber-600 dark:text-amber-400">
                  {nearExpiryBatches.length}
                </span>
                <span className="text-xs font-medium text-slate-500">batches within 90 days</span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                {expiredBatches.length > 0 ? (
                  <span className="text-red-600 font-bold">{expiredBatches.length} Expired (Blocked from sale)</span>
                ) : (
                  <span className="text-emerald-600 font-semibold">0 Expired Medicines (Stock Safe)</span>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Partners Monthly Khata Widget (Owner / Admin / Accountant only) */}
      {isOwnerOrAccountant && (
        <div className="p-5 sm:p-6 rounded-2xl border-2 border-teal-500/20 bg-gradient-to-br from-teal-500/5 via-transparent to-indigo-500/5 dark:bg-slate-900/60 shadow-soft">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold">
                <Users2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Partners Monthly Khata (شراکت داروں کا ماہانہ حساب)
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300">
                    {currentMonthName} {currentYear}
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Dono partners ke is mahine ke aane wale aur nikalne wale paison ka khulaasa
                </p>
              </div>
            </div>
            <Link
              href="/finance/partners"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-500/40 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-50 dark:hover:bg-slate-700 transition-all self-start sm:self-auto shadow-sm"
            >
              Open Full Khata <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Partner 1 Box */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  👤 {partner1Name}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  {currentMonthShort} Summary
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 my-3 text-xs">
                <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Paise Aaye (IN)</span>
                  <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200 text-sm mt-0.5 block">{formatPKR(p1MonthIn)}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-800/40">
                  <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 block">Paise Gaye (OUT)</span>
                  <span className="font-mono font-bold text-rose-800 dark:text-rose-200 text-sm mt-0.5 block">{formatPKR(p1MonthOut)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 text-xs font-bold">
                <span className="text-slate-500">Net Standing ({currentMonthShort}):</span>
                <span className={`font-mono text-sm ${p1MonthNet >= 0 ? "text-teal-600 dark:text-teal-400" : "text-rose-600"}`}>
                  {formatPKR(p1MonthNet)}
                </span>
              </div>
            </div>

            {/* Partner 2 Box */}
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  👤 {partner2Name}
                </span>
                <span className="text-[11px] font-semibold text-slate-400">
                  {currentMonthShort} Summary
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 my-3 text-xs">
                <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-800/40">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Paise Aaye (IN)</span>
                  <span className="font-mono font-bold text-emerald-800 dark:text-emerald-200 text-sm mt-0.5 block">{formatPKR(p2MonthIn)}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-800/40">
                  <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 block">Paise Gaye (OUT)</span>
                  <span className="font-mono font-bold text-rose-800 dark:text-rose-200 text-sm mt-0.5 block">{formatPKR(p2MonthOut)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 text-xs font-bold">
                <span className="text-slate-500">Net Standing ({currentMonthShort}):</span>
                <span className={`font-mono text-sm ${p2MonthNet >= 0 ? "text-indigo-600 dark:text-indigo-400" : "text-rose-600"}`}>
                  {formatPKR(p2MonthNet)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analytics & Charts Section (Owner / Accountant / dashboard:sales ONLY) */}
      {canViewSalesSummary && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Performance Trend */}
        <div className="lg:col-span-2 p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Sales & Cash Collected Trend
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Day-by-day sales & cash received for {currentMonthName} {currentYear} (PKR)
              </p>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 self-start sm:self-auto text-xs sm:text-sm font-bold">
              <button
                onClick={() => setSelectedRange("month")}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg transition-all btn-interactive ${
                  selectedRange === "month" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                📅 This Month
              </button>
              <button
                onClick={() => setSelectedRange("7d")}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg transition-all btn-interactive ${
                  selectedRange === "7d" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setSelectedRange("30d")}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg transition-all btn-interactive ${
                  selectedRange === "30d" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                30 Days
              </button>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
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
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              Sales by Category
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Sales share across medicine categories</p>

            <div className="mt-4 space-y-3">
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

          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs text-slate-600 dark:text-slate-400 mt-6 border border-slate-100 dark:border-slate-700/50">
            <span className="font-bold text-teal-600">Quick Tip:</span> You can add or rename medicine categories anytime in Settings.
          </div>
        </div>
      </div>
      )}

      {/* Critical Lists Grid: Near Expiry Batches & Recent Movements (Only if inventory access permitted) */}
      {canViewInventory && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Near-Expiry Batches (Sell First) */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Medicines Expiring Soon (Sell First)
              </h2>
              <p className="text-xs text-slate-500">Stock expiring within the next 90 days</p>
            </div>
            <Link
              href="/inventory/batches"
              className="text-xs font-semibold text-teal-600 hover:underline"
            >
              View All Stock &rarr;
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
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
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

      {/* Your Assigned Modules (Shows ONLY modules permitted for this user) */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-teal-600" />
              Your Assigned Modules ({permittedQuickModules.length})
            </h2>
            <p className="text-xs text-slate-500">
              Modules enabled for your account based on your role &amp; access permissions
            </p>
          </div>
        </div>

        {permittedQuickModules.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {permittedQuickModules.map((mod) => (
              <Link
                key={mod.href}
                href={mod.href}
                className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-teal-500/50 hover:bg-teal-50/30 dark:hover:bg-teal-950/20 transition-all flex items-start justify-between gap-2 group"
              >
                <div className="min-w-0">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 mb-1">
                    {mod.badge}
                  </span>
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 truncate">
                    {mod.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">{mod.desc}</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 shrink-0 mt-1" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 rounded-xl bg-slate-50 dark:bg-slate-800/40">
            No additional modules assigned yet. Please ask the Owner to enable modules for your account in Staff Accounts.
          </div>
        )}
      </div>
    </div>
  );
}
