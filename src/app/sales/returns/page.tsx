"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Receipt,
  ShieldAlert,
  Boxes,
  DollarSign,
  FileText,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import type { Customer, Product, InventoryBatch, StockMovement } from "@/types";

interface SalesReturn {
  id: string;
  returnNoteNumber: string; // e.g. CN-2026-012
  invoiceReference: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  batchNumber: string;
  returnQuantity: number;
  unitCreditPrice: number;
  totalCreditAmount: number;
  returnReason: "near_expiry" | "transit_damage" | "pharmacy_overstock" | "wrong_supply" | "recall";
  disposition: "quarantine_batch" | "scrap_writeoff" | "restocked";
  status: "approved" | "pending_inspection";
  returnDate: string;
  recordedByName: string;
}

export default function SalesReturnsPage() {
  const { currentUser } = useAuth();
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [batchNum, setBatchNum] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCredit, setUnitCredit] = useState(0);
  const [reason, setReason] = useState<SalesReturn["returnReason"]>("near_expiry");
  const [disposition, setDisposition] = useState<SalesReturn["disposition"]>("quarantine_batch");

  const loadData = async () => {
    try {
      const [custList, prodList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
      ]);
      setCustomers(custList);
      setProducts(prodList);

      try {
        const dbReturns = await (offlineDb as any).salesReturns?.toArray();
        if (dbReturns && dbReturns.length > 0) {
          setReturns(dbReturns as SalesReturn[]);
          return;
        }
      } catch {
        // fallback
      }

      const saved = localStorage.getItem("noxderma_sales_returns");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setReturns(parsed);
          } else {
            setReturns([]);
          }
        } catch {
          setReturns([]);
        }
      } else {
        setReturns([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveReturns = async (updated: SalesReturn[]) => {
    setReturns(updated);
    localStorage.setItem("noxderma_sales_returns", JSON.stringify(updated));
    try {
      if ((offlineDb as any).salesReturns) {
        await (offlineDb as any).salesReturns.clear();
        if (updated.length > 0) {
          await (offlineDb as any).salesReturns.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync salesReturns to offlineDb:", err);
    }
  };

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId) || customers[0];
    const prod = products.find((p) => p.id === selectedProductId) || products[0];
    if (!cust || !prod) return;

    const now = new Date().toISOString();
    const cnNumber = `CN-2026-${(returns.length + 10).toString().padStart(3, "0")}`;
    const totalCredit = Number(qty) * Number(unitCredit);

    const newReturn: SalesReturn = {
      id: `ret_${Date.now()}`,
      returnNoteNumber: cnNumber,
      invoiceReference: invoiceRef || "DIRECT-RETURN",
      customerId: cust.id,
      customerName: cust.name,
      productId: prod.id,
      productName: prod.name,
      batchNumber: batchNum.toUpperCase().trim(),
      returnQuantity: Number(qty),
      unitCreditPrice: Number(unitCredit),
      totalCreditAmount: totalCredit,
      returnReason: reason,
      disposition,
      status: "approved",
      returnDate: now.slice(0, 10),
      recordedByName: currentUser?.displayName || "Admin",
    };

    // 1. Stock Movement
    const movement: StockMovement = {
      id: `mov_ret_${Date.now()}`,
      productId: prod.id,
      productName: prod.name,
      batchNumber: newReturn.batchNumber,
      type: "sales_return",
      quantityChange: Number(qty),
      balanceAfter: Number(qty),
      referenceId: cnNumber,
      referenceType: "adjustment",
      userId: currentUser?.id || "usr_admin",
      userName: currentUser?.displayName || "Admin",
      reason: `Customer Return (${reason}) routed to ${disposition}`,
      timestamp: now,
    };
    await offlineDb.stockMovements.put(movement);

    // 2. Adjust Customer Outstanding Balance (Credit Note)
    const newBal = Math.max(0, cust.currentOutstandingBalance - totalCredit);
    await offlineDb.customers.update(cust.id, {
      currentOutstandingBalance: newBal,
      updatedAt: now,
    });

    saveReturns([newReturn, ...returns]);
    setIsProcessing(false);
    alert(
      `Return slip ${cnNumber} for ${formatPKR(
        totalCredit
      )} created for ${cust.name}. Remaining udhaar decreased by this amount.`
    );
  };

  const filtered = returns.filter((r) => {
    return (
      r.returnNoteNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.customerName.toLowerCase().includes(search.toLowerCase()) ||
      r.productName.toLowerCase().includes(search.toLowerCase()) ||
      r.batchNumber.toLowerCase().includes(search.toLowerCase())
    );
  });

  const totalCreditIssued = returns.reduce((sum, r) => sum + r.totalCreditAmount, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Customer Returns
            </span>
            <span className="text-xs text-slate-400">Medicine Returns & Balance Deduction</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Customer Medicine Returns (Wapis Stock)
          </h1>
        </div>

        <button
          onClick={() => setIsProcessing(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Record Customer Return
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Returns Recorded
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {returns.length} Returns
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Returns from Medical Stores</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Total Return Amount (Deducted from Udhaar)
          </span>
          <span className="text-2xl font-black font-mono text-rose-600">
            {formatPKR(totalCreditIssued)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Subtracted from Customer Khata</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Broken / Near Expiry Returns
          </span>
          <span className="text-2xl font-black text-amber-600">
            {returns.filter((r) => r.disposition === "quarantine_batch").length} Batches
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Kept aside (do not sell)</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between text-xs">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search return no, shop name, medicine or batch..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Returns Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Return Slip #</th>
                <th className="p-2.5">Medical Store & Bill No.</th>
                <th className="p-2.5">Medicine & Batch</th>
                <th className="p-2.5">Reason</th>
                <th className="p-2.5">Where Stock is Kept</th>
                <th className="p-2.5 text-right">Amount Deducted (-)</th>
                <th className="p-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((ret) => (
                <tr
                  key={ret.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                    {ret.returnNoteNumber}
                    <span className="text-[10px] text-slate-400 block font-normal font-sans">
                      {ret.returnDate}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {ret.customerName}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">{ret.invoiceReference}</span>
                  </td>
                  <td className="p-2.5 text-slate-700 dark:text-slate-300">
                    <span className="font-semibold block">{ret.productName}</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      Batch: {ret.batchNumber} • {ret.returnQuantity} packs
                    </span>
                  </td>
                  <td className="p-2.5 capitalize text-slate-600 dark:text-slate-400">
                    {ret.returnReason === "near_expiry"
                      ? "Near Expiry"
                      : ret.returnReason === "transit_damage"
                      ? "Broken / Damaged"
                      : ret.returnReason === "pharmacy_overstock"
                      ? "Shop Overstock"
                      : ret.returnReason.replace("_", " ")}
                  </td>
                  <td className="p-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ret.disposition === "quarantine_batch"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : ret.disposition === "scrap_writeoff"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {ret.disposition === "quarantine_batch"
                        ? "LOCKED / NEAR EXPIRY"
                        : ret.disposition === "scrap_writeoff"
                        ? "BROKEN / DESTROYED"
                        : "ADDED BACK TO STOCK"}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                    {formatPKR(ret.totalCreditAmount)}
                  </td>
                  <td className="p-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      APPROVED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Note Modal */}
      {isProcessing && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-teal-600" /> Record Medicine Return from Customer
              </h2>
              <button
                onClick={() => setIsProcessing(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Medical Store / Pharmacy *
                </label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Shop / Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Udhaar: {formatPKR(c.currentOutstandingBalance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Original Bill No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. OFF-DEV01-20261015-001"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Returned Medicine *
                </label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Medicine --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Batch No.
                  </label>
                  <input
                    type="text"
                    required
                    value={batchNum}
                    onChange={(e) => setBatchNum(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Return Qty (Packs)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={qty}
                    onChange={(e) => setQty(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Price / Pack
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={unitCredit}
                    onChange={(e) => setUnitCredit(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Why is it Returned?
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="near_expiry">Near Expiry</option>
                    <option value="transit_damage">Broken / Damaged</option>
                    <option value="pharmacy_overstock">Shop Overstock / Slow Moving</option>
                    <option value="wrong_supply">Wrong Medicine Supplied</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    What to do with Returned Stock?
                  </label>
                  <select
                    value={disposition}
                    onChange={(e) => setDisposition(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="quarantine_batch">Lock in Godown (Do Not Sell)</option>
                    <option value="scrap_writeoff">Broken / Throw Away</option>
                    <option value="restocked">Add Back to Sellable Stock</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs flex justify-between font-bold">
                <span className="text-rose-900 dark:text-rose-200">Total Return Value (Deducted from Udhaar):</span>
                <span className="font-mono text-rose-600 dark:text-rose-400">
                  {formatPKR(qty * unitCredit)}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProcessing(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Return & Deduct Udhaar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
