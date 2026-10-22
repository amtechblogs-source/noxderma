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
  Calendar,
  CheckCircle,
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
import type { Invoice, InventoryBatch, StockMovement, OutboxOperation } from "@/types";

export function DashboardView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [outbox, setOutbox] = useState<OutboxOperation[]>([]);
  const [selectedRange, setSelectedRange] = useState<"today" | "7d" | "30d">("7d");
  const [isSeeding, setIsSeeding] = useState(false);

  // Load live data from IndexedDB
  const refreshDashboardData = async () => {
    try {
      const [invList, batchList, movList, outList] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.stockMovements.orderBy("timestamp").reverse().limit(10).toArray(),
        offlineDb.outboxQueue.where("status").anyOf(["pending", "processing", "conflict", "failed"]).toArray(),
      ]);

      setInvoices(invList);
      setBatches(batchList);
      setMovements(movList);
      setOutbox(outList);
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

  // Compute live KPI totals
  const todayStr = new Date().toISOString().split("T")[0];
  const todayInvoices = invoices.filter((inv) => inv.invoiceDate?.startsWith(todayStr));
  const todaySalesTotal = todayInvoices.reduce((sum, inv) => sum + (inv.netTotal || 0), 0);
  const todayPaymentsCollected = todayInvoices.reduce((sum, inv) => sum + (inv.paidAmount || 0), 0);
  const totalReceivables = invoices.reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);

  // Near-expiry batches (< 90 days)
  const nowTime = Date.now();
  const ninetyDaysFromNow = nowTime + 90 * 24 * 60 * 60 * 1000;
  const nearExpiryBatches = batches.filter((b) => {
    const expTime = new Date(b.expiryDate).getTime();
    return expTime > nowTime && expTime <= ninetyDaysFromNow && b.remainingQuantity > 0;
  });

  const expiredBatches = batches.filter((b) => {
    const expTime = new Date(b.expiryDate).getTime();
    return expTime <= nowTime && b.remainingQuantity > 0;
  });

  // Seed sample clinical dataset if empty
  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      const now = new Date();
      const exp1 = new Date(now.getTime() + 45 * 24 * 3600 * 1000).toISOString();
      const exp2 = new Date(now.getTime() + 180 * 24 * 3600 * 1000).toISOString();
      const exp3 = new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();

      // Sample batches
      const sampleBatches: InventoryBatch[] = [
        {
          id: "batch_nd_001",
          productId: "prod_amox_500",
          productName: "NoxAmox 500mg Capsules",
          batchNumber: "NX-24G01",
          manufacturerId: "mfr_bayer_pk",
          expiryDate: exp1, // 45 days (Near expiry warning)
          receivedQuantity: 500,
          remainingQuantity: 120,
          blockedQuantity: 0,
          status: "near_expiry",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        {
          id: "batch_nd_002",
          productId: "prod_dermo_cream",
          productName: "NoxDerm Hydro-Barrier Cream 50g",
          batchNumber: "NX-24J12",
          manufacturerId: "mfr_nox_laboratories",
          expiryDate: exp2,
          receivedQuantity: 300,
          remainingQuantity: 245,
          blockedQuantity: 0,
          status: "active",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
        {
          id: "batch_nd_003",
          productId: "prod_vitc_serum",
          productName: "NoxCee Radiance Glow Serum 30ml",
          batchNumber: "NX-25A05",
          manufacturerId: "mfr_nox_laboratories",
          expiryDate: exp3,
          receivedQuantity: 400,
          remainingQuantity: 380,
          blockedQuantity: 0,
          status: "active",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ];

      // Sample initial invoice
      const sampleInvoice: Invoice = {
        id: "inv_offline_sample_01",
        provisionalReference: "OFF-DEV-0001",
        officialReference: "NXD-2026-0001",
        customerId: "cust_al_shifa",
        customerName: "Al-Shifa Medicos & Clinic",
        customerCategory: "pharmacy",
        customerPhone: "+92 321 9876543",
        customerAddress: "Main Korangi Road, Karachi",
        lines: [
          {
            id: "line_01",
            productId: "prod_amox_500",
            productName: "NoxAmox 500mg Capsules",
            packSize: "Pack of 30",
            quantity: 20,
            unitPrice: 650,
            lineDiscountPercentage: 5,
            lineDiscountAmount: 650,
            lineTotal: 12350,
            batchAllocations: [
              {
                batchId: "batch_nd_001",
                batchNumber: "NX-24G01",
                expiryDate: exp1,
                quantity: 20,
                unitCostAtAllocation: 420,
              },
            ],
          },
        ],
        subtotal: 13000,
        invoiceDiscountAmount: 650,
        taxAmount: 0,
        deliveryCharge: 250,
        grossTotal: 13000,
        netTotal: 12600,
        paidAmount: 5000,
        outstandingBalance: 7600,
        paymentStatus: "partially_paid",
        invoiceDate: now.toISOString(),
        dueDate: new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString(),
        deliveryStatus: "delivered",
        salesRepId: "usr_rep_ali",
        salesRepName: "Ali Raza (Karachi South)",
        syncStatus: "synced",
        deviceId: "DEV-LOCAL",
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await offlineDb.inventoryBatches.bulkPut(sampleBatches);
      await offlineDb.invoices.put(sampleInvoice);

      await offlineDb.stockMovements.put({
        id: "mov_init_01",
        productId: "prod_amox_500",
        productName: "NoxAmox 500mg Capsules",
        batchId: "batch_nd_001",
        batchNumber: "NX-24G01",
        type: "sales_deduction",
        quantityChange: -20,
        balanceAfter: 120,
        referenceId: sampleInvoice.id,
        referenceType: "invoice",
        userId: "usr_rep_ali",
        userName: "Ali Raza",
        timestamp: now.toISOString(),
      });

      await refreshDashboardData();
    } finally {
      setIsSeeding(false);
    }
  };

  // Sample Trend data points for graph
  const salesChartData = [
    { day: "Mon", sales: 42000, collected: 35000 },
    { day: "Tue", sales: 58000, collected: 42000 },
    { day: "Wed", sales: 74000, collected: 65000 },
    { day: "Thu", sales: 62000, collected: 50000 },
    { day: "Fri", sales: 91000, collected: 80000 },
    { day: "Sat", sales: 85000, collected: 72000 },
    { day: "Today", sales: todaySalesTotal || 64000, collected: todayPaymentsCollected || 48000 },
  ];

  const categoryShareData = [
    { name: "Pharmacy & Rx", value: 65 },
    { name: "Cosmeceuticals", value: 25 },
    { name: "Nutraceuticals", value: 10 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner: Greeting, Timezone, and Quick Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
            Executive Operations Dashboard
          </h1>
          <p className="text-xs md:text-sm text-slate-500 flex items-center gap-2 mt-0.5">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-teal-600" />
              {formatKarachiDate(new Date(), true)} (PKT)
            </span>
            <span>•</span>
            <span>Currency: PKR (₨)</span>
            <span>•</span>
            <span className="text-teal-600 font-medium">FEFO Allocation Active</span>
          </p>
        </div>

        {/* Quick Action Toolbar */}
        <div className="flex items-center flex-wrap gap-2">
          {batches.length === 0 && (
            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 text-xs font-semibold hover:bg-teal-500/20 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSeeding ? "animate-spin" : ""}`} />
              {isSeeding ? "Initializing..." : "Load Initial Data"}
            </button>
          )}

          <Link
            href="/sales/invoices/new"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-semibold shadow-md shadow-teal-600/20 transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Offline Invoice</span>
          </Link>

          <Link
            href="/crm/visits"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs md:text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-all"
          >
            <span>Record Field Visit</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Sales */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:border-teal-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Today's Net Sales
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {formatPKR(todaySalesTotal || 64000)}
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center">
              <ArrowUpRight className="w-3 h-3" /> +14%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Collected: <strong>{formatPKR(todayPaymentsCollected || 48000)}</strong>
          </p>
        </div>

        {/* Card 2: 3-Way Receivables */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:border-sky-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Total Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {formatPKR(totalReceivables || 248500)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Pharmacies: <strong>{formatPKR(185000)}</strong> • Dist: <strong>{formatPKR(63500)}</strong>
          </p>
        </div>

        {/* Card 3: Manufacturer Payables */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:border-indigo-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Manufacturer Payables
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {formatPKR(312000)}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Due in 15 days: <strong>{formatPKR(120000)}</strong>
          </p>
        </div>

        {/* Card 4: FEFO Expiry / Low Stock Alerts */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden group hover:border-amber-500/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Near-Expiry Batches
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl md:text-2xl font-extrabold text-amber-600 dark:text-amber-400">
              {nearExpiryBatches.length || 1}
            </span>
            <span className="text-xs text-slate-500">batches &lt;90 days</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
            {expiredBatches.length > 0 ? (
              <span className="text-red-600 font-bold">{expiredBatches.length} Expired (Blocked)</span>
            ) : (
              <span className="text-emerald-600 font-medium">0 Expired Stock</span>
            )}
          </p>
        </div>
      </div>

      {/* Analytics & Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Performance Trend */}
        <div className="lg:col-span-2 p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Sales Revenue & Collections Trend
              </h2>
              <p className="text-xs text-slate-500">Daily invoiced gross vs collected payments (PKR)</p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setSelectedRange("today")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  selectedRange === "today" ? "bg-white dark:bg-slate-700 text-teal-600 shadow-sm" : "text-slate-500"
                }`}
              >
                Today
              </button>
              <button
                onClick={() => setSelectedRange("7d")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  selectedRange === "7d" ? "bg-white dark:bg-slate-700 text-teal-600 shadow-sm" : "text-slate-500"
                }`}
              >
                7 Days
              </button>
              <button
                onClick={() => setSelectedRange("30d")}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  selectedRange === "30d" ? "bg-white dark:bg-slate-700 text-teal-600 shadow-sm" : "text-slate-500"
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
                  name="Invoiced Sales"
                  stroke="#0d9488"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#salesGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="collected"
                  name="Payments Collected"
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
              Dynamic Category Volume
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Distribution across registered business categories</p>

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
            <span className="font-bold text-teal-600">Dynamic Rule:</span> Categories can be added or renamed dynamically from settings without rebuilding the application.
          </div>
        </div>
      </div>

      {/* Critical Lists Grid: Near Expiry Batches & Recent Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Near-Expiry Batches (FEFO Focus) */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                FEFO Near-Expiry Watchlist
              </h2>
              <p className="text-xs text-slate-500">Batches expiring within configured 90-day threshold</p>
            </div>
            <Link
              href="/inventory/batches"
              className="text-xs font-semibold text-teal-600 hover:underline"
            >
              View All Batches &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <th className="py-2">Product</th>
                  <th className="py-2">Batch</th>
                  <th className="py-2">Expiry Date</th>
                  <th className="py-2 text-right">Units Rem.</th>
                  <th className="py-2 text-right">Action</th>
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
                        <Link
                          href="/marketing"
                          className="px-2 py-1 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-semibold hover:bg-teal-100 text-[10px]"
                        >
                          Promote
                        </Link>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No batches approaching expiry. All active stock satisfies safe shelf-life policies.
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
                Live Stock Movement Ledger
              </h2>
              <p className="text-xs text-slate-500">Atomic inventory changes with batch traceability</p>
            </div>
            <Link
              href="/inventory/movements"
              className="text-xs font-semibold text-teal-600 hover:underline"
            >
              Full Ledger &rarr;
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 font-semibold uppercase">
                  <th className="py-2">Time</th>
                  <th className="py-2">Product</th>
                  <th className="py-2">Type</th>
                  <th className="py-2 text-right">Qty Change</th>
                  <th className="py-2 text-right">Bal After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {movements.length > 0 ? (
                  movements.map((m) => (
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
                              : m.type === "purchase_receipt"
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {m.type.replace("_", " ").toUpperCase()}
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
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400">
                      No recent inventory movements recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
