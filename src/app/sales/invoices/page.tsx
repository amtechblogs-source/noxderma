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
  Phone,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { getProductImageUrl } from "@/features/sales/OfflineInvoiceCreator";
import type { Invoice, Product, BusinessSettings } from "@/types";

export default function SalesInvoicesListPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const loadData = async () => {
    try {
      const [invList, prodList, settingsRecord] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.products.toArray(),
        offlineDb.settings.get("primary"),
      ]);
      // Sort newest first
      const sorted = (invList || []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setInvoices(sorted);
      setProducts(prodList || []);
      setBusinessSettings(settingsRecord || null);
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

      {/* Printable Official Invoice Card - Optimized for Clean A4 Fit */}
      {selectedInvoice && (
        <div className="hidden print:block fixed inset-0 z-50 bg-white text-black p-6 font-sans text-xs">
          {/* Header with Print Logo support */}
          <div className="flex justify-between items-start pb-5 border-b-2 border-black gap-4">
            <div className="flex items-start gap-3.5">
              {(businessSettings?.invoiceLogoUrl || businessSettings?.appLogoUrl) && (
                <img
                  src={businessSettings.invoiceLogoUrl || businessSettings.appLogoUrl}
                  alt="Invoice Logo"
                  className="h-16 w-auto max-w-[160px] object-contain shrink-0"
                />
              )}
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-black leading-tight">
                  {businessSettings?.brandName || "NOXDERMA PHARMA"}
                </h1>
                <p className="text-xs sm:text-sm font-semibold text-slate-800 mt-1">
                  {businessSettings?.address || "Plot 42, Industrial Sector 7, Karachi, Pakistan"}
                </p>
                <p className="text-xs sm:text-sm font-semibold text-slate-800">
                  Phone: {businessSettings?.contactPhone || "+92 300 1234567"} &bull;{" "}
                  {businessSettings?.email || "info@noxderma.com"}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block px-3 py-1 rounded text-xs sm:text-sm font-black border border-black text-black bg-slate-100 tracking-wider uppercase">
                SALES BILL / CASH MEMO
              </span>
              <p className="font-mono text-base sm:text-lg font-black text-black mt-1.5">
                {selectedInvoice.provisionalReference}
              </p>
              <p className="text-xs sm:text-sm font-bold text-black mt-0.5">
                Date: {selectedInvoice.invoiceDate?.slice(0, 10)}
              </p>
              <p className="text-xs sm:text-sm font-bold text-black">
                Due Date: {selectedInvoice.dueDate?.slice(0, 10)}
              </p>
            </div>
          </div>

          {/* Customer & Payment Details Cards */}
          <div className="grid grid-cols-2 gap-4 text-xs sm:text-sm my-4">
            <div className="p-3.5 rounded-xl border border-slate-400 bg-white">
              <span className="text-slate-600 font-black uppercase text-[11px] tracking-wider block">
                CUSTOMER / PHARMACY:
              </span>
              <p className="font-black text-base sm:text-lg text-black mt-1">
                {selectedInvoice.customerName}
              </p>
              <p className="font-semibold text-slate-800 mt-0.5">
                {selectedInvoice.customerAddress || "Walk-in Counter"}
              </p>
              <p className="font-bold text-black mt-0.5">
                {selectedInvoice.customerPhone || "N/A"}
              </p>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-400 bg-white">
              <span className="text-slate-600 font-black uppercase text-[11px] tracking-wider block">
                PAYMENT DETAILS:
              </span>
              <p className="font-black text-base sm:text-lg text-black capitalize mt-1">
                Paid Via: {selectedInvoice.paymentMethod === "credit" ? "Udhaar (Credit)" : selectedInvoice.paymentMethod?.replace("_", " ")}
              </p>
              <p className="font-bold text-black mt-0.5">
                Payment Status:{" "}
                <span className="font-black text-black uppercase">
                  {selectedInvoice.paymentStatus === "paid"
                    ? "FULL PAID"
                    : selectedInvoice.paymentStatus === "partially_paid"
                    ? "PARTIAL PAID"
                    : "UNPAID (UDHAAR)"}
                </span>
              </p>
            </div>
          </div>

          {/* Line Items Table with Product Images & Bold Typography */}
          <table className="w-full text-left border-collapse mb-4">
            <thead className="border-y-2 border-black bg-slate-100 text-black font-black text-xs sm:text-sm uppercase">
              <tr>
                <th className="py-2.5 px-3">Item Details</th>
                <th className="py-2.5 px-3">Batch & Expiry</th>
                <th className="py-2.5 px-3 text-center">Qty</th>
                <th className="py-2.5 px-3 text-right">Price (PKR)</th>
                <th className="py-2.5 px-3 text-right">Total (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 text-xs sm:text-sm">
              {selectedInvoice.lines?.map((line, idx) => {
                const lineImg =
                  line.imageUrl ||
                  getProductImageUrl(products.find((p) => p.id === line.productId));

                return (
                  <tr key={idx} className="border-b border-slate-300">
                    <td className="py-2.5 px-3 text-black">
                      <div className="flex items-center gap-3">
                        {lineImg ? (
                          <img
                            src={lineImg}
                            alt={line.productName}
                            className="w-10 h-10 object-contain rounded-lg border border-slate-300 bg-white p-0.5 shrink-0"
                          />
                        ) : null}
                        <div>
                          <span className="font-black text-sm sm:text-base text-black block leading-tight">
                            {line.productName}
                          </span>
                          <span className="text-xs text-slate-700 font-semibold">{line.packSize}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-xs sm:text-sm text-black">
                      {line.batchAllocations?.[0]?.batchNumber || "GEN"} &bull;{" "}
                      {line.batchAllocations?.[0]?.expiryDate || "N/A"}
                    </td>
                    <td className="py-2.5 px-3 text-center font-black text-sm sm:text-base text-black">
                      {line.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-sm sm:text-base text-black">
                      {formatPKR(line.unitPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-sm sm:text-base text-black">
                      {formatPKR(line.lineTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Summary Box */}
          <div className="flex justify-end pt-4 border-t-2 border-black">
            <div className="w-72 sm:w-80 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-800 font-bold">
                <span>Gross Total:</span>
                <span className="font-mono text-black font-black">{formatPKR(selectedInvoice.subtotal)}</span>
              </div>
              {selectedInvoice.invoiceDiscountAmount > 0 && (
                <div className="flex justify-between text-rose-800 font-black">
                  <span>
                    Discount
                    {selectedInvoice.invoiceDiscountPercentage
                      ? ` (${selectedInvoice.invoiceDiscountPercentage}%):`
                      : ":"}
                  </span>
                  <span className="font-mono">-{formatPKR(selectedInvoice.invoiceDiscountAmount)}</span>
                </div>
              )}
              {selectedInvoice.deliveryCharge > 0 && (
                <div className="flex justify-between text-slate-800 font-bold">
                  <span>Delivery Charge:</span>
                  <span className="font-mono text-black font-black">{formatPKR(selectedInvoice.deliveryCharge)}</span>
                </div>
              )}
              <div className="flex justify-between text-xl sm:text-2xl font-black text-black pt-2 border-t-2 border-black">
                <span>Net Payable:</span>
                <span className="font-mono text-black">{formatPKR(selectedInvoice.netTotal)}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm font-bold text-emerald-900">
                <span>Amount Paid:</span>
                <span className="font-mono font-black">{formatPKR(selectedInvoice.paidAmount)}</span>
              </div>
              {selectedInvoice.outstandingBalance > 0 && (
                <div className="flex justify-between text-sm sm:text-base font-black text-rose-800 pt-1 border-t border-dashed border-slate-400">
                  <span>Balance (Baqaya Udhaar):</span>
                  <span className="font-mono">{formatPKR(selectedInvoice.outstandingBalance)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Official Signatures Section */}
          <div className="pt-8 pb-3 grid grid-cols-2 gap-10 text-xs font-bold text-black">
            <div className="border-t-2 border-slate-400 pt-2 text-center">
              <span>Received By (Customer Signature & Stamp)</span>
            </div>
            <div className="border-t-2 border-slate-400 pt-2 text-center">
              <span>Authorized Signature & Stamp ({businessSettings?.brandName || "Noxderma Pharma"})</span>
            </div>
          </div>

          <div className="mt-4 border-t border-slate-300 pt-3 text-center text-xs text-slate-600 font-medium">
            <p>{businessSettings?.invoiceFooter || "Computer generated bill. Thank you for your business!"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
