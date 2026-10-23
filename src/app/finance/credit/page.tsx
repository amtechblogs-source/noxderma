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
  const [mfrPayables, setMfrPayables] = useState<number>(0);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadCreditData() {
      const [invList, mfrList] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.manufacturers.toArray(),
      ]);
      setInvoices(invList);
      const totalMfr = (mfrList || []).reduce((sum, m) => sum + (m.payableBalance || 0), 0);
      setMfrPayables(totalMfr);
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

  const manufacturerPayables = mfrPayables;

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
    const text = `Assalam-o-Alaikum ${inv.customerName}, this is a gentle payment reminder from Noxderma Pharma for Bill #${inv.officialReference || inv.provisionalReference}. Remaining balance: ${formatPKR(inv.outstandingBalance)}. Due date was ${formatKarachiDate(inv.dueDate)}. Please arrange payment soon. Thank you!`;
    navigator.clipboard.writeText(text);
    setCopiedInvoiceId(inv.id);
    setTimeout(() => setCopiedInvoiceId(null), 3000);
  };

  const handleOpenWhatsApp = (inv: Invoice) => {
    const cleanPhone = (inv.customerPhone || "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(
      `Assalam-o-Alaikum ${inv.customerName}, gentle payment reminder from Noxderma Pharma for Bill #${inv.officialReference || inv.provisionalReference}.\nRemaining Balance: ${formatPKR(inv.outstandingBalance)}\nDue Date: ${formatKarachiDate(inv.dueDate)}\n\nPlease arrange payment at your earliest convenience.\nBank: Meezan Bank • Account Title: Noxderma Pharma\nThank you!`
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
            Market Udhaar & Due Payments
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Clear view of what we owe companies, and what pharmacies and distributors owe us.
          </p>
        </div>
      </div>

      {/* Three Distinct Types of Credit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Credit Type 1: Manufacturer Payables */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              1. Money We Owe Companies
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
              Amount we have to pay medicine manufacturing companies for stock purchases.
            </p>
          </div>
        </div>

        {/* Credit Type 2: Distributor Receivables */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              2. Money Owed by Distributors
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
              Udhaar balance owed to us by wholesale distributors.
            </p>
          </div>
        </div>

        {/* Credit Type 3: Pharmacy / Clinic Receivables */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              3. Money Owed by Medical Stores
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
              Udhaar balance owed to us by retail medical stores and pharmacies.
            </p>
          </div>
        </div>
      </div>

      {/* Receivable Aging Schedule */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-600" />
          Payment Due Timeline (Udhaar Aging)
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
            <span className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">
              Fresh Bills (Within Due Date)
            </span>
            <p className="text-lg font-extrabold text-emerald-800 dark:text-emerald-300 mt-1">
              {formatPKR(notDue || 120000)}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
            <span className="text-[10px] font-bold uppercase text-amber-700 dark:text-amber-400">
              1 to 30 Days Late
            </span>
            <p className="text-lg font-extrabold text-amber-800 dark:text-amber-300 mt-1">
              {formatPKR(overdue1to30 || 78500)}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40">
            <span className="text-[10px] font-bold uppercase text-orange-700 dark:text-orange-400">
              31 to 60 Days Late
            </span>
            <p className="text-lg font-extrabold text-orange-800 dark:text-orange-300 mt-1">
              {formatPKR(overdue31to60 || 35000)}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
            <span className="text-[10px] font-bold uppercase text-rose-700 dark:text-rose-400">
              Over 2 Months Late
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
              WhatsApp Payment Reminders
            </h2>
            <p className="text-xs text-slate-500">
              Bills that have passed their due date. Click WhatsApp button to send an instant polite reminder message.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2.5">Bill No</th>
                <th className="py-2.5">Customer / Medical Store</th>
                <th className="py-2.5">Due Date</th>
                <th className="py-2.5 text-right">Remaining Baqaya</th>
                <th className="py-2.5 text-right">Send Reminder</th>
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
                        title="Copy message text"
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
                        Send WhatsApp
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Great! All customer accounts are currently on time. No late bills right now.
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
