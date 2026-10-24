"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Receipt,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Printer,
  Share2,
  ArrowRight,
  DollarSign,
  Calendar,
  Building2,
  Phone,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Invoice } from "@/types";

export default function SalesInvoicesListPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const loadData = async () => {
    try {
      const invList = await offlineDb.invoices.toArray();
      // Sort newest first
      const sorted = (invList || []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setInvoices(sorted);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = invoices.filter((inv) => {
    const matchesSearch =
      inv.customerName.toLowerCase().includes(search.toLowerCase()) ||
      inv.provisionalReference.toLowerCase().includes(search.toLowerCase()) ||
      (inv.customerPhone && inv.customerPhone.includes(search));
    const matchesStatus = statusFilter === "all" || inv.paymentStatus === statusFilter;
    const matchesSync = syncFilter === "all" || inv.syncStatus === syncFilter;
    return matchesSearch && matchesStatus && matchesSync;
  });

  const totalGross = invoices.reduce((sum, i) => sum + (i.grossTotal || i.netTotal || 0), 0);
  const totalNet = invoices.reduce((sum, i) => sum + (i.netTotal || 0), 0);
  const totalOutstanding = invoices.reduce((sum, i) => sum + (i.outstandingBalance || 0), 0);

  const handlePrint = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Customer Bills & Udhaar
            </span>
            <span className="text-xs text-slate-400">Saved Offline in Browser</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            Customer Bills (Invoices)
          </h1>
        </div>

        <Link
          href="/sales/invoices/new"
          className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-teal-600/20 transition-all btn-interactive self-stretch sm:self-auto"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" /> Make New Bill
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Bills Amount
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-slate-100">
            {formatPKR(totalNet)}
          </span>
          <span className="text-xs text-slate-500 block mt-1">
            {invoices.length} Total Bills Made
          </span>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive">
          <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Total Cash Received
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-emerald-600">
            {formatPKR(Math.max(0, totalNet - totalOutstanding))}
          </span>
          <span className="text-xs text-slate-500 block mt-1">
            {invoices.filter((i) => i.paymentStatus === "paid").length} bills fully paid
          </span>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive">
          <span className="text-xs font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Remaining Market Udhaar (Baqaya)
          </span>
          <span className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-rose-600">
            {formatPKR(totalOutstanding)}
          </span>
          <span className="text-xs text-slate-500 block mt-1">
            {invoices.filter((i) => i.outstandingBalance > 0).length} bills pending payment
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft flex flex-col md:flex-row gap-3.5 items-stretch md:items-center justify-between text-xs sm:text-sm">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search bill number, customer or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-3.5 py-2.5 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <span className="text-slate-400 font-bold flex items-center gap-1 shrink-0 text-xs uppercase tracking-wider">
            <Filter className="w-3.5 h-3.5 text-teal-600" /> Status:
          </span>
          {(["all", "unpaid", "partially_paid", "paid"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3.5 py-2 min-h-[38px] rounded-xl font-bold capitalize shrink-0 transition-all btn-interactive text-xs sm:text-sm ${
                statusFilter === st
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st === "all"
                ? "All"
                : st === "unpaid"
                ? "Unpaid (Udhaar)"
                : st === "partially_paid"
                ? "Half Paid"
                : "Full Paid"}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Master Container */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50 text-teal-600" />
            <p className="text-sm font-semibold">No bills found matching your filter.</p>
            <Link
              href="/sales/invoices/new"
              className="mt-3 text-sm font-bold text-teal-600 hover:underline inline-block"
            >
              Make First Bill →
            </Link>
          </div>
        ) : (
          <>
            {/* Mobile View: High Ergonomics Touch Cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filtered.map((inv) => (
                <div
                  key={inv.id}
                  className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div>
                      <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm block">
                        {inv.provisionalReference || inv.id}
                      </span>
                      <span className="text-xs text-slate-400">
                        {inv.invoiceDate || inv.createdAt.slice(0, 10)} &bull; {inv.lines?.length || 1} item(s)
                      </span>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
                        inv.paymentStatus === "paid"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : inv.paymentStatus === "partially_paid"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                      }`}
                    >
                      {inv.paymentStatus === "paid" ? "PAID" : inv.paymentStatus === "partially_paid" ? "PARTIAL" : "UNPAID"}
                    </span>
                  </div>

                  <div>
                    <Link
                      href={`/customers/detail?id=${encodeURIComponent(inv.customerId)}`}
                      className="font-bold text-base text-slate-900 dark:text-slate-100 hover:text-teal-600 block truncate"
                    >
                      {inv.customerName}
                    </Link>
                    <span className="text-xs text-slate-400">{inv.customerPhone}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">Total Bill</span>
                      <span className="text-base font-extrabold font-mono text-slate-900 dark:text-slate-100">
                        {formatPKR(inv.netTotal)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-500 block">Baqaya (Udhaar)</span>
                      <span className="text-base font-extrabold font-mono text-rose-600">
                        {formatPKR(inv.outstandingBalance)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2">
                    <button
                      onClick={() => handlePrint(inv)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs min-h-[40px] hover:bg-slate-50 dark:hover:bg-slate-800 btn-interactive"
                    >
                      <Printer className="w-4 h-4 text-slate-500" />
                      <span>Print Bill</span>
                    </button>

                    <a
                      href={`https://wa.me/${inv.customerPhone?.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                        `*NOXDERMA PHARMA - BILL RECEIPT*\nBill No: ${inv.provisionalReference}\nCustomer: ${inv.customerName}\nTotal Bill: ${formatPKR(
                          inv.netTotal
                        )}\nRemaining Baqaya: ${formatPKR(
                          inv.outstandingBalance
                        )}\nDue Date: ${inv.dueDate || "30 Days"}\n\nThank you for your business!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs min-h-[40px] btn-interactive"
                    >
                      <Share2 className="w-4 h-4 text-emerald-600" />
                      <span>WhatsApp</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View: Full Master Table */}
            <div className="hidden md:block p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Bill No</th>
                    <th className="p-3">Customer / Store</th>
                    <th className="p-3">Date / Due Date</th>
                    <th className="p-3 text-right">Total Bill</th>
                    <th className="p-3 text-right">Remaining Baqaya</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Cloud Sync</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-3">
                        <span className="font-mono font-bold text-teal-600 dark:text-teal-400 block text-sm">
                          {inv.provisionalReference || inv.id}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {inv.lines?.length || 1} medicine(s)
                        </span>
                      </td>
                      <td className="p-3">
                        <Link
                          href={`/customers/detail?id=${encodeURIComponent(inv.customerId)}`}
                          className="font-bold text-slate-900 dark:text-slate-100 hover:underline block truncate max-w-[200px]"
                        >
                          {inv.customerName}
                        </Link>
                        <span className="text-xs text-slate-400">{inv.customerPhone}</span>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">
                        <div>{inv.invoiceDate || inv.createdAt.slice(0, 10)}</div>
                        <span className="text-xs text-slate-400">Due: {inv.dueDate || "30 Days"}</span>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatPKR(inv.netTotal)}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-rose-600">
                        {formatPKR(inv.outstandingBalance)}
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            inv.paymentStatus === "paid"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : inv.paymentStatus === "partially_paid"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          }`}
                        >
                          {inv.paymentStatus === "paid"
                            ? "PAID"
                            : inv.paymentStatus === "partially_paid"
                            ? "HALF PAID"
                            : "UNPAID"}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold ${
                            inv.syncStatus === "synced"
                              ? "bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300"
                              : "bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {inv.syncStatus === "synced" ? "ONLINE" : "OFFLINE"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePrint(inv)}
                            title="Print Bill"
                            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 btn-interactive min-h-[36px] min-w-[36px] flex items-center justify-center"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          <a
                            href={`https://wa.me/${inv.customerPhone?.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                              `*NOXDERMA PHARMA - BILL RECEIPT*\nBill No: ${inv.provisionalReference}\nCustomer: ${inv.customerName}\nTotal Bill: ${formatPKR(
                                inv.netTotal
                              )}\nRemaining Baqaya: ${formatPKR(
                                inv.outstandingBalance
                              )}\nDue Date: ${inv.dueDate || "30 Days"}\n\nThank you for your business!`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Send on WhatsApp"
                            className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-600 btn-interactive min-h-[36px] min-w-[36px] flex items-center justify-center"
                          >
                            <Share2 className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Hidden Print Receipt Template */}
      {selectedInvoice && (
        <div className="hidden print:block fixed inset-0 z-50 bg-white text-black p-8 font-mono text-xs">
          <div className="text-center border-b pb-4 mb-4">
            <h1 className="text-xl font-black">NOXDERMA PHARMACEUTICALS</h1>
            <p className="text-[11px]">Industrial Area, Phase 2, Lahore, Pakistan</p>
            <p className="text-[11px]">Phone: +92 300 1234567 • info@noxderma.com</p>
            <h2 className="text-sm font-bold mt-2">SALES BILL / CASH MEMO</h2>
          </div>

          <div className="flex justify-between mb-4 text-xs">
            <div>
              <p>
                <strong>Bill No:</strong> {selectedInvoice.provisionalReference}
              </p>
              <p>
                <strong>Customer:</strong> {selectedInvoice.customerName}
              </p>
              <p>
                <strong>Phone:</strong> {selectedInvoice.customerPhone}
              </p>
            </div>
            <div className="text-right">
              <p>
                <strong>Date:</strong> {selectedInvoice.invoiceDate}
              </p>
              <p>
                <strong>Due Date:</strong> {selectedInvoice.dueDate}
              </p>
              <p>
                <strong>Sales Rep:</strong> {selectedInvoice.salesRepName || "Field Staff"}
              </p>
            </div>
          </div>

          <table className="w-full text-left border-collapse mb-4">
            <thead>
              <tr className="border-b">
                <th className="py-1">Medicine Name</th>
                <th className="py-1 text-center">Batch</th>
                <th className="py-1 text-right">Quantity</th>
                <th className="py-1 text-right">Price</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {selectedInvoice.lines?.map((line, idx) => (
                <tr key={idx} className="border-b border-dashed">
                  <td className="py-1">{line.productName}</td>
                  <td className="py-1 text-center">
                    {line.batchAllocations?.[0]?.batchNumber || "BCH-ACTIVE"}
                  </td>
                  <td className="py-1 text-right">{line.quantity}</td>
                  <td className="py-1 text-right">{formatPKR(line.unitPrice)}</td>
                  <td className="py-1 text-right">{formatPKR(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t pt-2 space-y-1 text-right">
            <p>
              Subtotal: <strong>{formatPKR(selectedInvoice.subtotal)}</strong>
            </p>
            {selectedInvoice.invoiceDiscountAmount > 0 && (
              <p>
                Discount
                {selectedInvoice.invoiceDiscountPercentage
                  ? ` (${selectedInvoice.invoiceDiscountPercentage}%):`
                  : ":"}{" "}
                -<strong>{formatPKR(selectedInvoice.invoiceDiscountAmount)}</strong>
              </p>
            )}
            <p className="text-sm">
              Total Bill: <strong>{formatPKR(selectedInvoice.netTotal)}</strong>
            </p>
            <p>
              Cash Paid: <strong>{formatPKR(selectedInvoice.paidAmount)}</strong>
            </p>
            <p className="text-sm text-rose-600">
              Remaining Udhaar (Baqaya): <strong>{formatPKR(selectedInvoice.outstandingBalance)}</strong>
            </p>
          </div>

          <div className="mt-8 border-t pt-4 text-center text-[10px]">
            <p>Computer generated bill. Thank you for your business!</p>
          </div>
        </div>
      )}
    </div>
  );
}
