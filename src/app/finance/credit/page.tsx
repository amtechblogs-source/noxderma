"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Wallet,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Invoice, Customer } from "@/types";
import { openWhatsAppShare } from "@/lib/whatsapp/share";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import { ReceivePaymentModal } from "@/components/finance/ReceivePaymentModal";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
} from "@/lib/dateFilter";

export default function CreditManagementPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [mfrPayables, setMfrPayables] = useState<number>(0);
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [receivingInvoice, setReceivingInvoice] = useState<Invoice | null>(null);
  const [isReceiveCashOpen, setIsReceiveCashOpen] = useState<boolean>(false);

  const loadCreditData = async () => {
    const [invList, mfrList] = await Promise.all([
      offlineDb.invoices.toArray(),
      offlineDb.manufacturers.toArray(),
    ]);
    setInvoices(invList);
    const totalMfr = (mfrList || []).reduce((sum: number, m: any) => sum + (m.payableBalance || 0), 0);
    setMfrPayables(totalMfr);
  };

  useEffect(() => {
    loadCreditData();
    const handleCloudSynced = () => {
      loadCreditData();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) =>
      isRecordInDateRange(inv.invoiceDate || inv.createdAt, dateFilter)
    );
  }, [invoices, dateFilter]);

  // Compute 3-Way Credit Balances
  const unpaidInvoices = filteredInvoices.filter((inv) => (inv.outstandingBalance || 0) > 0);

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
    const message = `Assalam-o-Alaikum ${inv.customerName}, gentle payment reminder from Noxderma Pharma for Bill #${inv.officialReference || inv.provisionalReference}.\nRemaining Balance: ${formatPKR(inv.outstandingBalance)}\nDue Date: ${formatKarachiDate(inv.dueDate)}\n\nPlease arrange payment at your earliest convenience.\nBank: Meezan Bank • Account Title: Noxderma Pharma\nThank you!`;
    openWhatsAppShare({
      phone: inv.customerPhone,
      rawText: message,
      autoCopyFull: true,
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 btn-interactive"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <CreditCard className="w-7 h-7 text-teal-600" />
            Market Udhaar & Due Payments (Khata)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Clear view of what we owe companies, and what pharmacies and distributors owe us.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setReceivingInvoice(null);
            setIsReceiveCashOpen(true);
          }}
          className="px-4 py-2.5 min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 btn-interactive self-stretch sm:self-auto"
        >
          <Wallet className="w-4 h-4" /> + Receive Cash (ادھار وصولی)
        </button>
      </div>

      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={unpaidInvoices.length}
      />

      {/* Three Distinct Types of Credit */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Credit Type 1: Manufacturer Payables */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft hover:shadow-card-hover card-interactive relative overflow-hidden transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Money We Owe Companies
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center">
              <Factory className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-indigo-600 dark:text-indigo-400">
              {formatPKR(manufacturerPayables)}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Amount we have to pay medicine manufacturing companies for stock purchases.
            </p>
          </div>
        </div>

        {/* Credit Type 2: Distributor Receivables */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft hover:shadow-card-hover card-interactive relative overflow-hidden transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              2. Money Owed by Distributors
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-50 dark:bg-sky-950 text-sky-600 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-sky-600 dark:text-sky-400">
              {formatPKR(distributorReceivables)}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Udhaar balance owed to us by wholesale distributors.
            </p>
          </div>
        </div>

        {/* Credit Type 3: Pharmacy / Clinic Receivables */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft hover:shadow-card-hover card-interactive relative overflow-hidden transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              3. Money Owed by Medical Stores
            </span>
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3.5">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-teal-600 dark:text-teal-400">
              {formatPKR(pharmacyReceivables)}
            </span>
            <p className="text-xs text-slate-500 mt-1">
              Udhaar balance owed to us by retail medical stores and pharmacies.
            </p>
          </div>
        </div>
      </div>

      {/* Receivable Aging Schedule */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
        <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Clock className="w-4 h-4 text-teal-600" />
          Payment Due Timeline (Udhaar Aging)
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:text-sm">
          <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
            <span className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 block">
              Within Due Date
            </span>
            <p className="text-lg sm:text-xl font-extrabold font-mono text-emerald-800 dark:text-emerald-300 mt-1">
              {formatPKR(notDue)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
            <span className="text-xs font-bold uppercase text-amber-700 dark:text-amber-400 block">
              1 to 30 Days Late
            </span>
            <p className="text-lg sm:text-xl font-extrabold font-mono text-amber-800 dark:text-amber-300 mt-1">
              {formatPKR(overdue1to30)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-orange-50/50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40">
            <span className="text-xs font-bold uppercase text-orange-700 dark:text-orange-400 block">
              31 to 60 Days Late
            </span>
            <p className="text-lg sm:text-xl font-extrabold font-mono text-orange-800 dark:text-orange-300 mt-1">
              {formatPKR(overdue31to60)}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
            <span className="text-xs font-bold uppercase text-rose-700 dark:text-rose-400 block">
              Over 2 Months Late
            </span>
            <p className="text-lg sm:text-xl font-extrabold font-mono text-rose-800 dark:text-rose-300 mt-1">
              {formatPKR(overdueOver60)}
            </p>
          </div>
        </div>
      </div>

      {/* Overdue Invoices & WhatsApp Reminder Queue */}
      <div className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
        <div>
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-emerald-600" />
            WhatsApp Payment Reminders
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Bills that have passed their due date. Click WhatsApp button to send an instant polite reminder message.
          </p>
        </div>

        {/* Mobile Cards (< md) */}
        <div className="block md:hidden space-y-3.5">
          {unpaidInvoices.length > 0 ? (
            unpaidInvoices.map((inv) => (
              <div
                key={inv.id}
                className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-teal-600">
                      {inv.officialReference || inv.provisionalReference}
                    </span>
                    <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base leading-snug">
                      {inv.customerName}
                    </h3>
                    <p className="font-mono text-xs text-slate-400">{inv.customerPhone}</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
                    DUE: {formatKarachiDate(inv.dueDate)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-500 font-medium">Remaining Baqaya:</span>
                  <span className="font-extrabold font-mono text-base text-rose-600 dark:text-rose-400">
                    {formatPKR(inv.outstandingBalance)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setReceivingInvoice(inv);
                      setIsReceiveCashOpen(true);
                    }}
                    className="min-h-[40px] flex-1 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-soft btn-interactive"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Receive Cash</span>
                  </button>

                  <button
                    onClick={() => handleCopyMessage(inv)}
                    className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-1.5 btn-interactive shrink-0"
                    title="Copy reminder text"
                  >
                    {copiedInvoiceId === inv.id ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleOpenWhatsApp(inv)}
                    className="min-h-[40px] flex-1 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-soft shadow-emerald-600/20 btn-interactive"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp</span>
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
              Great! All customer accounts are currently on time. No late bills right now.
            </div>
          )}
        </div>

        {/* Desktop Table (>= md) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <th className="py-3 px-3">Bill No</th>
                <th className="py-3 px-3">Customer / Medical Store</th>
                <th className="py-3 px-3">Due Date</th>
                <th className="py-3 px-3 text-right">Remaining Baqaya</th>
                <th className="py-3 px-3 text-right">Send Reminder</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {unpaidInvoices.length > 0 ? (
                unpaidInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-bold text-teal-600">
                      {inv.officialReference || inv.provisionalReference}
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                      <div>{inv.customerName}</div>
                      <span className="block text-xs text-slate-400 font-mono">{inv.customerPhone}</span>
                    </td>
                    <td className="py-3.5 px-3 text-rose-600 font-bold">{formatKarachiDate(inv.dueDate)}</td>
                    <td className="py-3.5 px-3 text-right font-extrabold font-mono text-rose-600">
                      {formatPKR(inv.outstandingBalance)}
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setReceivingInvoice(inv);
                            setIsReceiveCashOpen(true);
                          }}
                          className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs btn-interactive shadow-sm"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          Receive Cash
                        </button>

                        <button
                          onClick={() => handleCopyMessage(inv)}
                          title="Copy message text"
                          className="min-h-[36px] min-w-[36px] p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 btn-interactive inline-flex items-center justify-center"
                        >
                          {copiedInvoiceId === inv.id ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => handleOpenWhatsApp(inv)}
                          className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs btn-interactive"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Send WhatsApp
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Great! All customer accounts are currently on time. No late bills right now.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ReceivePaymentModal
        isOpen={isReceiveCashOpen}
        onClose={() => {
          setIsReceiveCashOpen(false);
          setReceivingInvoice(null);
        }}
        initialInvoice={receivingInvoice}
        onSuccess={() => {
          loadCreditData();
        }}
      />
    </div>
  );
}
