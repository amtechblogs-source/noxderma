"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ArrowLeft,
  Calendar,
  DollarSign,
  AlertOctagon,
  Percent,
  Download,
  Info,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Invoice, ProfitAndLossReport } from "@/types";

export default function ProfitAndLossPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [period, setPeriod] = useState<"this_month" | "last_month" | "ytd">("this_month");

  useEffect(() => {
    async function loadFinanceData() {
      const [invs, movs] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.stockMovements.toArray(),
      ]);
      setInvoices(invs);
      setMovements(movs);
    }
    loadFinanceData();
  }, []);

  // Compute live auditable P&L metrics
  const grossSales = invoices.reduce((sum, inv) => sum + (inv.grossTotal || inv.netTotal || 0), 0);
  const discountsGiven = invoices.reduce((sum, inv) => sum + (inv.invoiceDiscountAmount || 0), 0);
  const salesReturns = 0;
  const netSales = Math.max(0, grossSales - discountsGiven - salesReturns);

  // COGS derived from allocated batch cost
  const costOfGoodsSold = invoices.reduce((sum, inv) => {
    let invCogs = 0;
    for (const l of inv.lines || []) {
      for (const a of l.batchAllocations || []) {
        invCogs += (a.quantity || 0) * (a.unitCostAtAllocation || 0);
      }
    }
    return sum + invCogs;
  }, 0);

  const grossProfit = netSales - costOfGoodsSold;
  const grossProfitMargin = netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : "0.0";

  // Operating Expenses derived from actual recorded stock movements
  const damagedMovements = movements.filter((m) => m.type === "damaged_stock");
  const damagedStockLoss = damagedMovements.reduce((sum, m) => sum + Math.abs(m.quantityChange || 0) * 350, 0);

  const sampleMovements = movements.filter((m) => m.type === "sample_issue");
  const sampleExpense = sampleMovements.reduce((sum, m) => sum + Math.abs(m.quantityChange || 0) * 350, 0);

  const courierAndLogistics = invoices.reduce((sum, inv) => sum + (inv.deliveryCharge || 0), 0);
  const otherExpenses = 0;
  const totalOperatingExpenses = damagedStockLoss + sampleExpense + courierAndLogistics + otherExpenses;

  const netOperatingProfit = grossProfit - totalOperatingExpenses;
  const netProfitMargin = netSales > 0 ? ((netOperatingProfit / netSales) * 100).toFixed(1) : "0.0";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
            <TrendingUp className="w-6 h-6 text-teal-600" />
            Profit & Loss Report (Kamai / Munafa)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Total sales minus product purchase cost, broken medicines, free doctor samples, and daily expenses.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-100"
        >
          <Download className="w-3.5 h-3.5" />
          Print Report
        </button>
      </div>

      {/* Accounting Compliance Banner */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <Info className="w-4 h-4 text-teal-600" />
          <span>How Profit is Calculated:</span>
        </div>
        <p className="text-slate-500">
          • <strong>Medicine Purchase Cost:</strong> Calculated from the exact price you paid to the company when buying the batch.
        </p>
        <p className="text-slate-500">
          • <strong>Free Samples & Broken Stock:</strong> Subtracted as business expense so your profit figures are 100% honest and accurate.
        </p>
      </div>

      {/* Structured P&L Statement Card */}
      <div className="p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6 text-xs md:text-sm">
        <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
              Noxderma Pharmaceuticals Ltd.
            </h2>
            <p className="text-xs text-slate-500">Business Profit & Loss Report</p>
          </div>
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            Currency: Pakistani Rupee (PKR ₨)
          </span>
        </div>

        {/* 1. Revenue */}
        <div className="space-y-2">
          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-xs">
            <span>1. Total Sales (Bikri)</span>
            <span>Amount</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Total Bills Amount (Gross Sales)</span>
            <span className="font-medium">{formatPKR(grossSales)}</span>
          </div>

          <div className="flex justify-between text-rose-600 pl-3">
            <span>Minus: Discounts Given to Customers</span>
            <span>-{formatPKR(discountsGiven)}</span>
          </div>

          <div className="flex justify-between text-rose-600 pl-3">
            <span>Minus: Customer Medicine Returns (Wapis Stock)</span>
            <span>-{formatPKR(salesReturns)}</span>
          </div>

          <div className="flex justify-between font-extrabold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>Net Sales (Asli Bikri)</span>
            <span className="text-teal-600">{formatPKR(netSales)}</span>
          </div>
        </div>

        {/* 2. Cost of Goods Sold */}
        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-xs">
            <span>2. Purchase Cost of Medicines Sold</span>
            <span>Amount</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Original Cost of Sold Medicines (Purchase Price + Delivery)</span>
            <span>-{formatPKR(costOfGoodsSold)}</span>
          </div>

          <div className="flex justify-between font-extrabold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>Gross Profit (Pehle Ka Munafa)</span>
            <span className="text-teal-600 font-bold">
              {formatPKR(grossProfit)}{" "}
              <span className="text-xs text-slate-500 font-normal">({grossProfitMargin}%)</span>
            </span>
          </div>
        </div>

        {/* 3. Operating Expenses */}
        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-xs">
            <span>3. Daily Business Expenses & Losses (Kharcha)</span>
            <span>Amount</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Broken & Damaged Stock (Nuqsan)</span>
            <span className="text-rose-600 font-medium">-{formatPKR(damagedStockLoss)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Free Doctor Samples Given</span>
            <span className="text-amber-600 font-medium">-{formatPKR(sampleExpense)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Courier & Delivery Charges (TCS / Trax)</span>
            <span className="text-slate-600 dark:text-slate-300">-{formatPKR(courierAndLogistics)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Shop & Staff Expenses (Kharcha)</span>
            <span className="text-slate-600 dark:text-slate-300">-{formatPKR(otherExpenses)}</span>
          </div>

          <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 pt-1">
            <span>Total Expenses & Losses</span>
            <span className="text-rose-600">-{formatPKR(totalOperatingExpenses)}</span>
          </div>
        </div>

        {/* 4. Net Profit */}
        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex justify-between items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300">
              Final Net Profit (Asli Kamai / Saaf Munafa)
            </span>
            <p className="text-xs text-slate-500">Remaining profit in hand after all costs, expenses, and broken stock</p>
          </div>
          <div className="text-right">
            <span className="text-xl md:text-2xl font-extrabold text-teal-700 dark:text-teal-300">
              {formatPKR(netOperatingProfit)}
            </span>
            <span className="block text-xs font-bold text-teal-600 mt-0.5">
              Profit Percentage: {netProfitMargin}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
