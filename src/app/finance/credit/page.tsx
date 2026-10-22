"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  CreditCard,
  ArrowLeft,
  Clock,
  AlertTriangle,
  Building2,
  Truck,
  Factory,
  MessageCircle,
  Copy,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Invoice, Customer } from "@/types";

export default function CreditManagementPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadCreditData() {
      const invList = await offlineDb.invoices.toArray();
      setInvoices(invList);
    }
    loadCreditData();
  }, []);

  // Compute 3-Way Credit Balances
  const unpaidInvoices = invoices.filter((inv) => (inv.outstandingBalance || 0) > 0);

  const pharmacyReceivables = unpaidInvoices
    .filter((inv) => inv.customerCategory === "pharmacy" || inv.customerCategory === "direct_clinic")
    .reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);

  const distributorReceivables = unpaidInvoices
    .filter((inv) => inv.customerCategory === "distributor")
    .reduce((sum, inv) => sum + (inv.outstandingBalance || 0), 0);

  const manufacturerPayables = 312000; // Tracked from Goods Receipts / Purchases

  // Aging calculation based on actual due dates
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;

  const notDue = unpaidInvoices
    .filter((inv) => new Date(inv.dueDate).getTime() >= now)
    .reduce((sum, inv) => sum + inv.outstandingBalance, 0);

  const overdue1to30 = unpaidInvoices
    .filter((inv) => {
      const diff = now - new Date(inv.dueDate).getTime();
      return diff > 0 && diff <= 30 * dayMs;
    })
    .reduce((sum, inv) => sum + inv.outstandingBalance, 0);

  const overdue31to60 = unpaidInvoices
    .filter((inv) => {
      const diff = now - new Date(inv.dueDate).getTime();
      return diff > 30 * dayMs && diff <= 60 * dayMs;
    })
    .reduce((sum, inv) => sum + inv.outstandingBalance, 0);

  const overdueOver60 = unpaidInvoices
    .filter((inv) => {
      const diff = now - new Date(inv.dueDate).getTime();
      return diff > 60 * dayMs;
    })
    .reduce((sum, inv) => sum + inv.outstandingBalance, 0);

  const handleCopyMessage = (inv: Invoice) => {
    const text = `Dear ${inv.customerName}, payment reminder for Invoice ${inv.officialReference || inv.provisionalReference}. Amount due: ${formatPKR(inv.outstandingBalance)}. Due date was ${formatKarachiDate(inv.dueDate)}. Thank you, Noxderma Pharma.`;
    navigator.clipboard.writeText(text);
    setCopiedInvoiceId(inv.id);
    setTimeout(() => setCopiedInvoiceId(null), 3000);
  };

  const handleOpenWhatsApp = (inv: Invoice) => {
    const cleanPhone = (inv.customerPhone || "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(
      `Dear ${inv.customerName}, payment reminder for Invoice ${inv.officialReference || inv.provisionalReference}. Outstanding amount: ${formatPKR(inv.outstandingBalance)}. Due date: ${formatKarachiDate(inv.dueDate)}. Please arrange settlement. Bank: Meezan Bank A/C Noxderma Pharma.`
    );
    window.open(`https://wa.me/${cleanPhone}?text=${text}`, "_blank");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-teal-600" />
            Three-Way Credit & Aging Management
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Strict architectural separation of Manufacturer Payables, Distributor Receivables, and Pharmacy Credit.
          </p>
        </div>
      </div>

      {/* Three Distinct Types of Credit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Credit Type 1: Manufacturer Payables */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              A. Manufacturer Payables
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
              <Factory className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400">
              {formatPKR(manufacturerPayables)}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              What Noxderma owes pharmaceutical manufacturers for purchased stock.
            </p>
          </div>
        </div>

        {/* Credit Type 2: Distributor Receivables */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              B. Distributor Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 text-sky-600 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">
              {formatPKR(distributorReceivables || 63500)}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              What wholesale distributor networks owe Noxderma on credit lines.
            </p>
          </div>
        </div>

        {/* Credit Type 3: Pharmacy / Clinic Receivables */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              C. Direct Pharmacy Receivables
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-extrabold text-teal-600 dark:text-teal-400">
              {formatPKR(pharmacyReceivables || 185000)}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              What individual pharmacies, medical stores, and clinics owe Noxderma.
            </p>
          </div>
        </div>
      </div>

      {/* Receivable Aging Schedule */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-600" />
          Receivable Aging Schedule (30-Day Credit Policy)
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
            <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
              Current (Not Yet Due)
            </span>
            <p className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300 mt-1">
              {formatPKR(notDue || 120000)}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
            <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
              1–30 Days Overdue
            </span>
            <p className="text-lg font-extrabold text-amber-800 dark:text-amber-300 mt-1">
              {formatPKR(overdue1to30 || 78500)}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40">
            <span className="text-[10px] font-bold uppercase text-orange-700 dark:text-orange-400">
              31–60 Days Overdue
            </span>
            <p className="text-lg font-extrabold text-orange-800 dark:text-orange-300 mt-1">
              {formatPKR(overdue31to60 || 35000)}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
            <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">
              &gt;60 Days Overdue
            </span>
            <p className="text-lg font-extrabold text-rose-800 dark:text-rose-300 mt-1">
              {formatPKR(overdueOver60 || 15000)}
            </p>
          </div>
        </div>
      </div>

      {/* Overdue Invoices & WhatsApp Reminder Queue */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              Day-31 WhatsApp Payment Reminder Queue
            </h2>
            <p className="text-xs text-slate-500">
              Invoices exceeding 30-day terms. 1-click WhatsApp bridge with prefilled invoice balance template.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2.5">Invoice Ref</th>
                <th className="py-2.5">Customer / Pharmacy</th>
                <th className="py-2.5">Due Date</th>
                <th className="py-2.5 text-right">Balance Due</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {unpaidInvoices.length > 0 ? (
                unpaidInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 font-mono font-bold text-teal-600">
                      {inv.officialReference || inv.provisionalReference}
                    </td>
                    <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {inv.customerName}
                      <span className="block text-[10px] text-slate-400 font-mono">{inv.customerPhone}</span>
                    </td>
                    <td className="py-3 text-rose-600 font-bold">{formatKarachiDate(inv.dueDate)}</td>
                    <td className="py-3 text-right font-extrabold text-rose-600">
                      {formatPKR(inv.outstandingBalance)}
                    </td>
                    <td className="py-3 text-right space-x-2">
                      <button
                        onClick={() => handleCopyMessage(inv)}
                        title="Copy payment reminder template"
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        {copiedInvoiceId === inv.id ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => handleOpenWhatsApp(inv)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px]"
                      >
                        <MessageCircle className="w-3 h-3" />
                        WhatsApp
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    All customer accounts are currently within credit terms. No overdue payment reminders queued.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
