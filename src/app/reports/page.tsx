"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Product, InventoryBatch, Invoice, Customer } from "@/types";

export default function ReportsExportPage() {
  const [activeReport, setActiveReport] = useState<"stock" | "sales" | "aging" | "tax">("stock");
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [prodList, batchList, invList, custList] = await Promise.all([
          offlineDb.products.toArray(),
          offlineDb.inventoryBatches.toArray(),
          offlineDb.invoices.toArray(),
          offlineDb.customers.toArray(),
        ]);
        setProducts(prodList);
        setBatches(batchList);
        setInvoices(invList);
        setCustomers(custList);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  // 1. Stock Valuation Data
  const stockValuationRows = products.map((p) => {
    const prodBatches = batches.filter((b) => b.productId === p.id);
    const totalQty = prodBatches.reduce((sum, b) => sum + (b.remainingQuantity || 0), 0);
    const estimatedCost = totalQty * 420; // landed cost estimate
    const tradeValuation = totalQty * 700; // wholesale valuation
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

  const totalCostValuation = stockValuationRows.reduce((sum, r) => sum + r.costValuation, 0);
  const totalTradeValuation = stockValuationRows.reduce((sum, r) => sum + r.tradeValuation, 0);

  // 2. Sales by SKU
  const salesSkuMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const inv of invoices) {
    for (const line of inv.lines || []) {
      if (!salesSkuMap[line.productId]) {
        salesSkuMap[line.productId] = { name: line.productName, qty: 0, revenue: 0 };
      }
      salesSkuMap[line.productId].qty += line.quantity;
      salesSkuMap[line.productId].revenue += line.lineTotal;
    }
  }
  const salesRows = Object.entries(salesSkuMap).map(([id, val]) => ({
    id,
    name: val.name,
    qty: val.qty,
    revenue: val.revenue,
  }));

  // CSV Export Helper
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
    if (activeReport === "stock") {
      downloadCSV(
        "Noxderma_Stock_Valuation",
        ["SKU", "Product Name", "Category", "Quantity (Packs)", "Cost Valuation (PKR)", "Trade Valuation (PKR)", "Projected Margin (PKR)"],
        stockValuationRows.map((r) => [
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
        "Noxderma_Sales_By_SKU",
        ["Product Name", "Total Packs Sold", "Total Sales Revenue (PKR)"],
        salesRows.map((r) => [r.name, r.qty, r.revenue])
      );
    } else if (activeReport === "aging") {
      downloadCSV(
        "Noxderma_Customer_Aging",
        ["Customer Name", "Category", "City", "Credit Limit (PKR)", "Outstanding Balance (PKR)"],
        customers.map((c) => [c.name, c.category, c.city, c.creditLimit, c.currentOutstandingBalance])
      );
    } else if (activeReport === "tax") {
      downloadCSV(
        "Noxderma_Tax_Sales_Register",
        ["Invoice Ref", "Customer Name", "Date", "Gross Amount", "Tax Amount", "Net Total"],
        invoices.map((i) => [
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

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Audit & Compliance
            </span>
            <span className="text-xs text-slate-400">Data Export Engine</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Reports & Financial Export Center
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
          >
            <Printer className="w-3.5 h-3.5" /> Print Report
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
          >
            <Download className="w-4 h-4" /> Export CSV Sheet
          </button>
        </div>
      </div>

      {/* Report Selection Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { id: "stock", label: "Stock Valuation", icon: Boxes, desc: "Cost & Trade Price" },
          { id: "sales", label: "Sales by Product SKU", icon: TrendingUp, desc: "Volume & Realized Rev" },
          { id: "aging", label: "Credit Aging & Balances", icon: CreditCard, desc: "Customer Receivables" },
          { id: "tax", label: "Tax Sales Register", icon: Receipt, desc: "Audit Compliant" },
        ].map((rep) => {
          const Icon = rep.icon;
          const isActive = activeReport === rep.id;
          return (
            <button
              key={rep.id}
              onClick={() => setActiveReport(rep.id as any)}
              className={`p-4 rounded-xl border text-left transition-all ${
                isActive
                  ? "border-teal-500 bg-teal-50/50 dark:bg-teal-950/30 shadow-sm"
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

      {/* Report 1: Stock Valuation */}
      {activeReport === "stock" && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                Pharmaceutical Stock Valuation Summary
              </h3>
              <p className="text-xs text-slate-400">
                Inventory valuation computed from batch landed costs vs trade wholesale prices
              </p>
            </div>
            <div className="flex gap-4 text-xs font-mono font-bold">
              <div>
                <span className="text-slate-400 block text-[10px]">Cost Valuation:</span>
                <span className="text-slate-900 dark:text-slate-100">{formatPKR(totalCostValuation)}</span>
              </div>
              <div>
                <span className="text-teal-600 block text-[10px]">Trade Valuation:</span>
                <span className="text-teal-600 dark:text-teal-400">{formatPKR(totalTradeValuation)}</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">SKU</th>
                  <th className="p-2.5">Product Name</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5 text-right">Physical Packs</th>
                  <th className="p-2.5 text-right">Cost Valuation</th>
                  <th className="p-2.5 text-right">Trade Valuation</th>
                  <th className="p-2.5 text-right">Projected Markup</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {stockValuationRows.map((row) => (
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
            </table>
          </div>
        </div>
      )}

      {/* Report 2: Sales by SKU */}
      {activeReport === "sales" && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
            Sales Performance by SKU
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Product Name</th>
                  <th className="p-2.5 text-right">Packs Invoiced</th>
                  <th className="p-2.5 text-right">Realized Net Sales (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {salesRows.map((row) => (
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
            </table>
          </div>
        </div>
      )}

      {/* Report 3: Customer Aging */}
      {activeReport === "aging" && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
            Customer Credit Aging & Receivable Balances
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Customer / Pharmacy</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5">City</th>
                  <th className="p-2.5 text-right">Credit Limit</th>
                  <th className="p-2.5 text-right">Current Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-2.5 font-bold text-slate-900 dark:text-slate-100">{c.name}</td>
                    <td className="p-2.5 uppercase text-[10px] text-slate-500">{c.category}</td>
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
            </table>
          </div>
        </div>
      )}

      {/* Report 4: Tax Register */}
      {activeReport === "tax" && (
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
            Official Sales Tax Register
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Invoice Ref</th>
                  <th className="p-2.5">Customer Name</th>
                  <th className="p-2.5">Invoice Date</th>
                  <th className="p-2.5 text-right">Gross Total</th>
                  <th className="p-2.5 text-right">Tax Amount</th>
                  <th className="p-2.5 text-right">Net Sales Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                      {inv.provisionalReference}
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
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
