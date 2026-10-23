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
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Customer, Invoice, Payment } from "@/types";

export default function CustomerLedgersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [custList, invList, payList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.invoices.toArray(),
        offlineDb.payments.toArray(),
      ]);
      setCustomers(custList);
      setInvoices(invList);
      setPayments(payList);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Merge Invoices & Payments into a simple Khata history
  const rawLedgerEntries = [
    ...invoices.map((inv) => ({
      id: `ledg_inv_${inv.id}`,
      customerId: inv.customerId,
      customerName: inv.customerName,
      date: inv.invoiceDate || inv.createdAt.slice(0, 10),
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
      date: pay.paymentDate,
      referenceNumber: pay.referenceNumber || pay.id,
      type: "Payment Received",
      description: `Cash Received (${pay.paymentMethod === "cash" ? "Cash" : "Bank Transfer"})`,
      debit: 0,
      credit: pay.amount, // Payment decreases customer balance
      timestamp: new Date(pay.createdAt).getTime(),
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const filteredEntries = rawLedgerEntries.filter((e) => {
    const matchesCustomer =
      selectedCustomerId === "all" || e.customerId === selectedCustomerId;
    const matchesSearch =
      e.customerName.toLowerCase().includes(search.toLowerCase()) ||
      e.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase());
    return matchesCustomer && matchesSearch;
  });

  // Calculate Running Balance (Baqaya)
  let currentRunningBalance = 0;
  const computedLedger = filteredEntries.map((e) => {
    currentRunningBalance += e.debit - e.credit;
    return {
      ...e,
      runningBalance: currentRunningBalance,
    };
  });

  const totalReceivables = customers.reduce(
    (sum, c) => sum + (c.currentOutstandingBalance || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300"
          >
            <Printer className="w-3.5 h-3.5" /> Print Khata Statement
          </button>
          <Link
            href="/sales/invoices/new"
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
          >
            <Receipt className="w-4 h-4" /> + Make Bill
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Money to Receive (Market Udhaar)
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalReceivables)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">From {customers.length} Customers</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Total Bills Given (+)
          </span>
          <span className="text-2xl font-black font-mono text-rose-600">
            {formatPKR(invoices.reduce((sum, i) => sum + i.netTotal, 0))}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{invoices.length} Bills Made</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Total Cash Received (-)
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600">
            {formatPKR(payments.reduce((sum, p) => sum + p.amount, 0))}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{payments.length} Payments Collected</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
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
            <option value="all">All Customers & Stores</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.city})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* General Khata Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        {computedLedger.length === 0 ? (
          <p className="text-center text-slate-400 text-xs py-10">No bills or payments found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Bill / Receipt #</th>
                  <th className="p-2.5">Customer / Store</th>
                  <th className="p-2.5">Details</th>
                  <th className="p-2.5 text-right">Bill Amount (+)</th>
                  <th className="p-2.5 text-right">Cash Received (-)</th>
                  <th className="p-2.5 text-right">Remaining Balance (Baqaya)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {computedLedger.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-2.5 font-mono text-slate-500">{row.date}</td>
                    <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                      {row.referenceNumber}
                    </td>
                    <td className="p-2.5 font-semibold text-slate-900 dark:text-slate-100">
                      <Link
                        href={`/customers/${row.customerId}`}
                        className="hover:underline hover:text-teal-600"
                      >
                        {row.customerName}
                      </Link>
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">{row.description}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                      {row.debit > 0 ? formatPKR(row.debit) : "—"}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                      {row.credit > 0 ? formatPKR(row.credit) : "—"}
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-slate-900 dark:text-slate-100">
                      {formatPKR(row.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
