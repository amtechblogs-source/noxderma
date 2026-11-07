"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Scale,
  Building2,
  Search,
  Filter,
  DollarSign,
  Printer,
  Calendar,
  Share2,
  ArrowRight,
  Receipt,
} from "lucide-react";
import { formatPKR, formatNumber, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Customer, Invoice, Payment } from "@/types";
import DateRangeFilterBar from "@/components/common/DateRangeFilterBar";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";
import {
  DateFilterState,
  createDefaultDateFilter,
  isRecordInDateRange,
  getDateFilterDescription,
} from "@/lib/dateFilter";

export default function CustomerLedgersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [custList, invList, payList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.invoices.toArray(),
        offlineDb.payments.toArray(),
      ]);

      const invoiceIds = new Set(invList.map((i) => i.id));
      const invoiceRefs = new Set(invList.map((i) => i.provisionalReference).filter(Boolean));

      // Filter out orphan payments created for invoices that have since been deleted
      const validPayments: Payment[] = [];
      const orphanPayments: Payment[] = [];

      for (const p of payList) {
        const isAutoInvoicePay =
          (p.allocations && p.allocations.length > 0) ||
          (p.referenceNumber && p.referenceNumber.startsWith("INV-"));

        if (isAutoInvoicePay) {
          const hasExistingInvoice =
            (p.allocations &&
              p.allocations.some(
                (a) => invoiceIds.has(a.invoiceId) || invoiceRefs.has(a.invoiceReference)
              )) ||
            (p.referenceNumber && invoiceRefs.has(p.referenceNumber));

          if (!hasExistingInvoice) {
            orphanPayments.push(p);
            continue;
          }
        }
        validPayments.push(p);
      }

      // Automatically purge orphan payments from local storage
      if (orphanPayments.length > 0) {
        for (const op of orphanPayments) {
          offlineDb.payments.delete(op.id).catch(() => { });
        }
      }

      setCustomers(custList);
      setInvoices(invList);
      setPayments(validPayments);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleCloudSynced = () => {
      loadData();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  // Merge Invoices & Payments into a simple Khata history
  const rawLedgerEntries = [
    ...invoices.map((inv) => ({
      id: `ledg_inv_${inv.id}`,
      customerId: inv.customerId,
      customerName: inv.customerName,
      date: (inv.invoiceDate || inv.createdAt || "").slice(0, 10),
      referenceNumber: inv.provisionalReference || inv.id,
      type: "Sales Bill",
      description: `Bill Issued (${inv.lines?.length || 1} medicines)`,
      debit: inv.netTotal, // Invoice increases customer balance
      credit: 0,
      timestamp: new Date(inv.createdAt).getTime(),
    })),
    ...payments.map((pay) => ({
      id: `ledg_pay_${pay.id}`,
      customerId: pay.customerId,
      customerName: pay.customerName,
      date: (pay.paymentDate || pay.createdAt || "").slice(0, 10),
      referenceNumber: pay.referenceNumber || pay.id,
      type: "Payment Received",
      description: `Cash Received (${pay.paymentMethod === "cash" ? "Cash" : "Bank Transfer"})`,
      debit: 0,
      credit: pay.amount, // Payment decreases customer balance
      timestamp: new Date(pay.createdAt).getTime(),
    })),
  ].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    // Put bill first (+ debit), then payment (- credit)
    return b.debit - a.debit;
  });

  const filteredEntries = rawLedgerEntries.filter((e) => {
    const matchesCustomer =
      selectedCustomerId === "all" || e.customerId === selectedCustomerId;
    const matchesSearch =
      e.customerName.toLowerCase().includes(search.toLowerCase()) ||
      e.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase());
    const matchesDate = isRecordInDateRange(e.date || e.timestamp, dateFilter);
    return matchesCustomer && matchesSearch && matchesDate;
  });

  // Calculate Running Balance (Baqaya) per customer so balances never cross-contaminate
  const customerRunningMap: Record<string, number> = {};
  const computedLedger = filteredEntries.map((e) => {
    const prev = customerRunningMap[e.customerId] || 0;
    const next = prev + (e.debit - e.credit);
    customerRunningMap[e.customerId] = next;
    return {
      ...e,
      runningBalance: next,
    };
  });

  const selectedCustomerObj =
    selectedCustomerId === "all" ? null : customers.find((c) => c.id === selectedCustomerId);

  const relevantInvoices =
    selectedCustomerId === "all"
      ? invoices
      : invoices.filter((i) => i.customerId === selectedCustomerId);

  const relevantPayments =
    selectedCustomerId === "all"
      ? payments
      : payments.filter((p) => p.customerId === selectedCustomerId);

  const totalReceivables =
    selectedCustomerId === "all"
      ? customers.reduce((sum, c) => sum + (c.currentOutstandingBalance || 0), 0)
      : selectedCustomerObj?.currentOutstandingBalance || 0;

  const totalBillsAmount = filteredEntries
    .filter((e) => e.debit > 0)
    .reduce((sum, e) => sum + e.debit, 0);
  const totalCashReceived = filteredEntries
    .filter((e) => e.credit > 0)
    .reduce((sum, e) => sum + e.credit, 0);

  return (
    <div className="space-y-6 print:space-y-4 print-page">
      {/* Official Print-Only Header */}
      <OfficialPrintHeader
        title="Customer Khata & Balance Statement"
        period={getDateFilterDescription(dateFilter)}
        targetLabel="Customer"
        targetName={selectedCustomerObj ? `${selectedCustomerObj.name} (${selectedCustomerObj.city})` : "All Customers & Medical Stores"}
      />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Customer Khata & Balance
            </span>
            <span className="text-xs text-slate-400">Bill & Payment History</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Customer Khata (Account History & Balance)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="flex-1 sm:flex-none justify-center px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print Khata Statement
          </button>
          <Link
            href="/sales/invoices/new"
            className="flex-1 sm:flex-none justify-center px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Receipt className="w-4 h-4" /> Make Bill
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
          <span className="text-[11px] font-bold text-slate-400 print:text-slate-600 uppercase tracking-wider block mb-1">
            Total Money to Receive (Market Udhaar)
          </span>
          <span className="text-2xl print:text-lg font-black font-mono text-slate-900 dark:text-slate-100 print:text-black">
            {formatPKR(totalReceivables)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {selectedCustomerObj ? selectedCustomerObj.name : `From ${customers.length} Customers`}
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
          <span className="text-[11px] font-bold text-rose-600 print:text-slate-600 uppercase tracking-wider block mb-1">
            Total Bills Given (+)
          </span>
          <span className="text-2xl print:text-lg font-black font-mono text-rose-600 print:text-black">
            {formatPKR(totalBillsAmount)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {relevantInvoices.length} Bills Made
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
          <span className="text-[11px] font-bold text-emerald-600 print:text-slate-600 uppercase tracking-wider block mb-1">
            Total Cash Received (-)
          </span>
          <span className="text-2xl print:text-lg font-black font-mono text-emerald-600 print:text-black">
            {formatPKR(totalCashReceived)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {relevantPayments.length} Payments Collected
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3 text-xs no-print print:hidden">
        <DateRangeFilterBar
          filter={dateFilter}
          onChange={setDateFilter}
          count={computedLedger.length}
          label="Khata Period"
        />

        <div className="flex flex-col md:flex-row gap-3 items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search bill number, customer or note..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Select Customer:
            </span>
            <select
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-xs"
            >
              <option value="all">All Customers &amp; Stores</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.city})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* General Khata Table & Mobile Cards */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 print:border-none print:shadow-none print:p-0">
        {computedLedger.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-10">No bills or payments found.</p>
        ) : (
          <>
            {/* Mobile Card View */}
            <div className="block md:hidden print:hidden space-y-3">
              {computedLedger.map((row) => (
                <div
                  key={row.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/customers/detail?id=${encodeURIComponent(row.customerId)}`}
                        className="font-bold text-slate-900 dark:text-slate-100 hover:text-teal-600 hover:underline block truncate"
                      >
                        {row.customerName}
                      </Link>
                      <span className="font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400">
                        {row.referenceNumber} • {row.date}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">
                        Baqaya Balance
                      </span>
                      <span
                        className={`font-mono font-black ${
                          row.runningBalance > 0
                            ? "text-rose-600 dark:text-rose-400"
                            : row.runningBalance < 0
                              ? "text-sky-600 dark:text-sky-400"
                              : "text-slate-900 dark:text-slate-100"
                        }`}
                      >
                        {row.runningBalance < 0
                          ? `Adv ${formatPKR(Math.abs(row.runningBalance))}`
                          : formatPKR(row.runningBalance)}
                      </span>
                    </div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px]">{row.description}</p>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                    <div>
                      <span className="text-[10px] font-bold text-rose-600 uppercase block">
                        Bill Amount (+)
                      </span>
                      <span className="font-mono font-bold text-rose-600">
                        {row.debit > 0 ? formatPKR(row.debit) : "—"}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-emerald-600 uppercase block">
                        Cash Received (-)
                      </span>
                      <span className="font-mono font-bold text-emerald-600">
                        {row.credit > 0 ? formatPKR(row.credit) : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop & Print Table */}
            <div className="hidden md:block print:block overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-xs print:text-[10px] print:border-collapse print:border print:border-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 print:bg-slate-100 print:text-black print:border-slate-300">
                <tr>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Date</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Bill / Receipt #</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Customer / Store</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Details</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300 text-right">Bill Amount (+)</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300 text-right">Cash Received (-)</th>
                  <th className="p-2.5 print:p-1.5 text-right">Remaining Balance (Baqaya)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                {computedLedger.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors print:border-b print:border-slate-200"
                  >
                    <td className="p-2.5 print:p-1.5 font-mono text-slate-500 print:text-slate-700 print:border-r print:border-slate-200">{row.date}</td>
                    <td className="p-2.5 print:p-1.5 font-mono font-bold text-teal-600 dark:text-teal-400 print:text-black print:border-r print:border-slate-200">
                      {row.referenceNumber}
                    </td>
                    <td className="p-2.5 print:p-1.5 font-semibold text-slate-900 dark:text-slate-100 print:text-black print:border-r print:border-slate-200">
                      <span className="no-print print:hidden">
                        <Link
                          href={`/customers/detail?id=${encodeURIComponent(row.customerId)}`}
                          className="hover:underline hover:text-teal-600"
                        >
                          {row.customerName}
                        </Link>
                      </span>
                      <span className="hidden print:inline font-bold">
                        {row.customerName}
                      </span>
                    </td>
                    <td className="p-2.5 print:p-1.5 text-slate-700 dark:text-slate-300 print:text-slate-700 print:border-r print:border-slate-200">{row.description}</td>
                    <td className="p-2.5 print:p-1.5 text-right font-mono font-bold text-rose-600 print:text-black print:border-r print:border-slate-200">
                      {row.debit > 0 ? formatPKR(row.debit) : "—"}
                    </td>
                    <td className="p-2.5 print:p-1.5 text-right font-mono font-bold text-emerald-600 print:text-black print:border-r print:border-slate-200">
                      {row.credit > 0 ? formatPKR(row.credit) : "—"}
                    </td>
                    <td className="p-2.5 print:p-1.5 text-right font-mono font-black print:text-black">
                      <span
                        className={
                          row.runningBalance > 0
                            ? "text-rose-600 dark:text-rose-400"
                            : row.runningBalance < 0
                              ? "text-sky-600 dark:text-sky-400"
                              : "text-slate-900 dark:text-slate-100"
                        }
                      >
                        {row.runningBalance < 0
                          ? `Adv ${formatPKR(Math.abs(row.runningBalance))}`
                          : formatPKR(row.runningBalance)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Print-Only Sign-off Block */}
        <div className="hidden print:grid grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[10px]">
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Prepared By</p>
            <p className="text-slate-500">Billing Officer</p>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Audited By</p>
            <p className="text-slate-500">Credit Controller</p>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Approved By</p>
            <p className="text-slate-500">Accounts Manager</p>
          </div>
        </div>
      </div>
    </div>
  );
}
