"use client";

import React, { useState, useEffect } from "react";
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
  ShieldAlert,
  CheckCircle,
  Compass,
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
  const [selectedRange, setSelectedRange] = useState<"today" | "7d" | "30d">("7d");

  // Load live data from IndexedDB
  const refreshDashboardData = async () => {
    try {
      const [invList, batchList, movList, outList, prodList, mfrList, poList] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.stockMovements.orderBy("timestamp").reverse().limit(10).toArray(),
        offlineDb.outboxQueue.where("status").anyOf(["pending", "processing", "conflict", "failed"]).toArray(),
        offlineDb.products.toArray(),
        offlineDb.manufacturers.toArray(),
        offlineDb.purchaseOrders.toArray(),
      ]);

      setInvoices(invList);
      setBatches(batchList);
      setMovements(movList);
      setOutbox(outList);
      setProducts(prodList);
      setManufacturers(mfrList);
      setPurchaseOrders(poList);
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

  // Compute live KPI totals
  const todayStr = new Date().toISOString().split("T")[0];
  const todayInvoices = displayInvoices.filter((inv) => inv.invoiceDate?.startsWith(todayStr));
  const todaySalesTotal = todayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
  const todayPaymentsCollected = todayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
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

  // Dynamic 7-Day Sales & Payments Trend from actual recorded invoices
  const last7Days = Array.from({ length: 7 }, (_, i) => {
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
  const salesChartData = last7Days;

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
  ];

  const permittedQuickModules = allQuickModules.filter((m) => hasPermission(m.perm));

  return (
    <div className="space-y-6">
      {/* Top Banner: Greeting, Timezone, and Quick Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Daily Business Overview
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
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

        {/* Quick Action Toolbar (Filtered by User Permissions) */}
        <div className="grid grid-cols-2 sm:flex sm:items-center sm:flex-wrap gap-2.5 w-full sm:w-auto">
          {hasPermission("invoices:create") && (
            <Link
              href="/sales/invoices/new"
              className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-teal-600/20 transition-all btn-interactive"
            >
              <PlusCircle className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span>Make New Bill (Invoice)</span>
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
          {/* Card 1: Today's Sales (Owner / Accountant / dashboard:sales only) */}
          {canViewSalesSummary && (
            <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive relative overflow-hidden group hover:border-teal-500/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Today&apos;s Total Sales
                </span>
                <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center shadow-sm">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100">
                  {formatPKR(todaySalesTotal)}
                </span>
                <span className="text-xs font-bold text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3.5 h-3.5" /> {todayInvoices.length} bill{todayInvoices.length !== 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1.5">
                Cash Received: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(todayPaymentsCollected)}</strong>
              </p>
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
              <p className="text-xs text-slate-500 mt-1.5">
                Stores: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(storeReceivables)}</strong> • Dist: <strong className="text-slate-700 dark:text-slate-300">{formatPKR(distributorReceivables)}</strong>
              </p>
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
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Daily total bills vs cash received (PKR)</p>
            </div>
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 self-start sm:self-auto text-xs sm:text-sm font-bold">
              <button
                onClick={() => setSelectedRange("today")}
                className={`px-3 py-1.5 min-h-[34px] rounded-lg transition-all btn-interactive ${
                  selectedRange === "today" ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm" : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                }`}
              >
                Today
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
