"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Phone,
  MapPin,
  CreditCard,
  Receipt,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Plus,
  Scale,
  Calendar,
  Share2,
  DollarSign,
  UserCheck,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type {
  Customer,
  Invoice,
  Payment,
  CustomerVisit,
  LedgerEntry,
} from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomerDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const customerId = resolvedParams.id;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [activeTab, setActiveTab] = useState<
    "overview" | "invoices" | "payment" | "ledger" | "visits" | "reminder"
  >("overview");
  const [loading, setLoading] = useState(true);

  // New Payment Form State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<Payment["paymentMethod"]>("cash");
  const [payRef, setPayRef] = useState<string>("");
  const [payNotes, setPayNotes] = useState<string>("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const loadData = async () => {
    try {
      const [cust, invList, payList, visitList] = await Promise.all([
        offlineDb.customers.get(customerId),
        offlineDb.invoices.where("customerId").equals(customerId).toArray(),
        offlineDb.payments.where("customerId").equals(customerId).toArray(),
        offlineDb.customerVisits.where("customerId").equals(customerId).toArray(),
      ]);

      if (cust) {
        setCustomer(cust);
      } else {
        // Fallback demo customer if navigating directly
        const fallback: Customer = {
          id: customerId,
          name: customerId.replace(/_/g, " ").toUpperCase(),
          category: "pharmacy",
          contactPerson: "Pharmacy Incharge",
          phone: "+92 300 1234567",
          whatsappNumber: "923001234567",
          address: "Commercial Market, Main Boulevard",
          city: "Lahore",
          creditLimit: 500000,
          creditTermsDays: 30,
          currentOutstandingBalance: 145000,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setCustomer(fallback);
      }

      setInvoices(
        (invList || []).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      setPayments(
        (payList || []).sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      setVisits(
        (visitList || []).sort(
          (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [customerId]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || payAmount <= 0) return;

    setIsRecordingPayment(true);
    try {
      const now = new Date().toISOString();
      const paymentId = `pay_${Date.now()}`;

      // Allocate across unpaid invoices (FIFO)
      let remainingToAllocate = payAmount;
      const allocations: Payment["allocations"] = [];

      const unpaidInvoices = [...invoices].filter((i) => i.outstandingBalance > 0);
      for (const inv of unpaidInvoices) {
        if (remainingToAllocate <= 0) break;
        const allocationForThis = Math.min(inv.outstandingBalance, remainingToAllocate);
        allocations.push({
          invoiceId: inv.id,
          invoiceReference: inv.provisionalReference || inv.id,
          amountAllocated: allocationForThis,
        });

        // Update local invoice state
        const newOutstanding = Math.max(0, inv.outstandingBalance - allocationForThis);
        const newPaid = inv.paidAmount + allocationForThis;
        const newStatus = newOutstanding === 0 ? "paid" : "partially_paid";

        await offlineDb.invoices.update(inv.id, {
          outstandingBalance: newOutstanding,
          paidAmount: newPaid,
          paymentStatus: newStatus,
          updatedAt: now,
        });

        remainingToAllocate -= allocationForThis;
      }

      const paymentRecord: Payment = {
        id: paymentId,
        customerId: customer.id,
        customerName: customer.name,
        amount: payAmount,
        paymentDate: now.slice(0, 10),
        paymentMethod: payMethod,
        referenceNumber: payRef || undefined,
        allocations,
        unallocatedAmount: remainingToAllocate > 0 ? remainingToAllocate : 0,
        recordedByUserId: "usr_admin",
        notes: payNotes || "Customer payment receipt",
        syncStatus: "local_only",
        createdAt: now,
      };

      await offlineDb.payments.put(paymentRecord);

      // Update customer outstanding balance
      const newBalance = Math.max(0, customer.currentOutstandingBalance - payAmount);
      await offlineDb.customers.update(customer.id, {
        currentOutstandingBalance: newBalance,
        updatedAt: now,
      });

      // Reset form & reload
      setPayAmount(0);
      setPayRef("");
      setPayNotes("");
      setActiveTab("invoices");
      await loadData();
    } finally {
      setIsRecordingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="font-semibold text-sm">Loading customer profile...</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>Customer not found.</p>
        <Link href="/customers" className="text-teal-600 font-bold mt-2 inline-block">
          Return to Customers
        </Link>
      </div>
    );
  }

  const creditUtilization =
    customer.creditLimit > 0
      ? Math.round((customer.currentOutstandingBalance / customer.creditLimit) * 100)
      : 0;

  const isOverLimit = customer.currentOutstandingBalance > customer.creditLimit;

  // Build clean ledger entries by merging Invoices & Payments chronologically
  const ledgerEntries = [
    ...invoices.map((i) => ({
      id: `ledg_inv_${i.id}`,
      date: i.invoiceDate || i.createdAt.slice(0, 10),
      type: "invoice" as const,
      reference: i.provisionalReference || i.id,
      description: `Sales Invoice (${i.lines?.length || 1} items)`,
      debit: i.netTotal,
      credit: 0,
      timestamp: new Date(i.createdAt).getTime(),
    })),
    ...payments.map((p) => ({
      id: `ledg_pay_${p.id}`,
      date: p.paymentDate,
      type: "payment" as const,
      reference: p.referenceNumber || p.id,
      description: `Payment Received (${p.paymentMethod.toUpperCase()})`,
      debit: 0,
      credit: p.amount,
      timestamp: new Date(p.createdAt).getTime(),
    })),
  ].sort((a, b) => a.timestamp - b.timestamp);

  // Compute running balance
  let currentRunBal = 0;
  const computedLedger = ledgerEntries.map((e) => {
    currentRunBal += e.debit - e.credit;
    return {
      ...e,
      runningBalance: currentRunBal,
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/customers"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                {customer.category}
              </span>
              <span className="text-xs text-slate-400">ID: {customer.id}</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              {customer.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={`https://wa.me/${customer.whatsappNumber || customer.phone.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> WhatsApp Chat
          </a>
          <Link
            href={`/sales/invoices/new?customerId=${customer.id}`}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Create Invoice
          </Link>
        </div>
      </div>

      {/* Credit Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Outstanding Balance
          </span>
          <span
            className={`text-2xl font-black font-mono ${
              isOverLimit ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"
            }`}
          >
            {formatPKR(customer.currentOutstandingBalance)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Credit Terms: {customer.creditTermsDays} Days
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Sanctioned Credit Limit
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(customer.creditLimit)}
          </span>
          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
            <div
              className={`h-full ${
                isOverLimit
                  ? "bg-rose-500"
                  : creditUtilization > 80
                  ? "bg-amber-500"
                  : "bg-teal-500"
              }`}
              style={{ width: `${Math.min(100, creditUtilization)}%` }}
            />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Remaining Available Credit
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {formatPKR(Math.max(0, customer.creditLimit - customer.currentOutstandingBalance))}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {creditUtilization}% limit utilized
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 overflow-x-auto text-xs font-bold">
        {[
          { id: "overview", label: "Overview & Contacts", icon: Building2 },
          { id: "invoices", label: `Invoices (${invoices.length})`, icon: Receipt },
          { id: "payment", label: "Record Payment", icon: DollarSign },
          { id: "ledger", label: "Ledger Statement", icon: Scale },
          { id: "visits", label: `Field Visits (${visits.length})`, icon: UserCheck },
          { id: "reminder", label: "WhatsApp Reminder", icon: Send },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold whitespace-nowrap transition-all ${
                isActive
                  ? "border-teal-500 text-teal-600 dark:text-teal-400"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-600" /> Commercial Profile
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Contact Person:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {customer.contactPerson}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Phone Number:</span>
                <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                  {customer.phone}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">WhatsApp:</span>
                <span className="font-bold font-mono text-emerald-600">
                  +{customer.whatsappNumber || customer.phone}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">City / Region:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{customer.city}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Physical Address:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                  {customer.address}
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-teal-600" /> Financial Settings
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Credit Limit:</span>
                <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                  {formatPKR(customer.creditLimit)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Payment Terms:</span>
                <span className="font-bold text-teal-600">{customer.creditTermsDays} Days Net</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Account Status:</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                  {customer.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Assigned Sales Rep:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {customer.assignedSalesRepId ? "Zubair Ahmed (Lahore Central)" : "Direct House Account"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Invoices */}
      {activeTab === "invoices" && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
              Invoices & Billing History
            </h3>
            <Link
              href={`/sales/invoices/new?customerId=${customer.id}`}
              className="text-xs font-bold text-teal-600 hover:underline"
            >
              + Create New Invoice
            </Link>
          </div>

          {invoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No invoices created for this customer yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5">Provisional Ref</th>
                    <th className="p-2.5">Invoice Date</th>
                    <th className="p-2.5">Due Date</th>
                    <th className="p-2.5 text-right">Net Total</th>
                    <th className="p-2.5 text-right">Paid</th>
                    <th className="p-2.5 text-right">Balance</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                        {inv.provisionalReference || inv.id}
                      </td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400">
                        {inv.invoiceDate || inv.createdAt.slice(0, 10)}
                      </td>
                      <td className="p-2.5 text-slate-600 dark:text-slate-400">
                        {inv.dueDate || "30 Days"}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatPKR(inv.netTotal)}
                      </td>
                      <td className="p-2.5 text-right font-mono text-emerald-600">
                        {formatPKR(inv.paidAmount)}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                        {formatPKR(inv.outstandingBalance)}
                      </td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            inv.paymentStatus === "paid"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : inv.paymentStatus === "partially_paid"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          }`}
                        >
                          {inv.paymentStatus.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Record Payment */}
      {activeTab === "payment" && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm max-w-xl mx-auto space-y-4">
          <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-teal-600" /> Record Customer Payment
          </h3>
          <p className="text-xs text-slate-500">
            Payment will automatically allocate against open invoices starting from the oldest invoice
            (FIFO) and reduce the customer&apos;s outstanding balance.
          </p>

          <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Payment Amount (PKR) *
              </label>
              <input
                type="number"
                min="1"
                required
                value={payAmount || ""}
                onChange={(e) => setPayAmount(Number(e.target.value))}
                placeholder="e.g. 50000"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-base font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Payment Method *
                </label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="cash">Cash Collection</option>
                  <option value="bank_transfer">Online Bank Transfer</option>
                  <option value="cheque">Bank Cheque</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Bank Reference / Cheque #
                </label>
                <input
                  type="text"
                  placeholder="e.g. TR-998812"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Receipt Notes
              </label>
              <textarea
                rows={2}
                placeholder="Received by Medical Rep or Deposit Slip details..."
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            </div>

            <button
              type="submit"
              disabled={isRecordingPayment || payAmount <= 0}
              className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-md shadow-teal-600/20 disabled:opacity-50 transition-all"
            >
              {isRecordingPayment ? "Recording Payment..." : "Record Payment & Issue Receipt"}
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Ledger Statement */}
      {activeTab === "ledger" && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                Customer General Ledger Statement
              </h3>
              <p className="text-xs text-slate-400">
                Chronological statement of invoices, payments and running receivable balance
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Print Statement
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Reference</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5 text-right">Debit (PKR)</th>
                  <th className="p-2.5 text-right">Credit (PKR)</th>
                  <th className="p-2.5 text-right">Running Balance</th>
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
                      {row.reference}
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">{row.description}</td>
                    <td className="p-2.5 text-right font-mono font-semibold text-rose-600">
                      {row.debit > 0 ? formatPKR(row.debit) : "-"}
                    </td>
                    <td className="p-2.5 text-right font-mono font-semibold text-emerald-600">
                      {row.credit > 0 ? formatPKR(row.credit) : "-"}
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatPKR(row.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Field Visits */}
      {activeTab === "visits" && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
              Field Visits & Medical Rep Intel
            </h3>
            <Link
              href={`/crm/visits`}
              className="text-xs font-bold text-teal-600 hover:underline"
            >
              + Log New Field Visit
            </Link>
          </div>

          {visits.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              No field visits logged for this customer yet.
            </p>
          ) : (
            <div className="space-y-3">
              {visits.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs space-y-1.5"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Visited by {v.employeeName}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">{v.visitDate}</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{v.visitNotes}</p>
                  {v.competitorOffers && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      <strong>Competitor Intel:</strong> {v.competitorOffers}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 6: WhatsApp Payment Reminder */}
      {activeTab === "reminder" && (
        <div className="p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm max-w-xl mx-auto space-y-4">
          <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Send className="w-5 h-5 text-emerald-600" /> WhatsApp Payment Reminder (Day-31 Queue)
          </h3>
          <p className="text-xs text-slate-500">
            Copy and send this polite reminder directly to the pharmacy owner or click the button to
            open in WhatsApp.
          </p>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 font-sans text-xs space-y-2 whitespace-pre-line text-slate-800 dark:text-slate-200">
            {`Assalam-o-Alaikum ${customer.name},

We hope this message finds you well.

This is a gentle reminder from *Noxderma Pharma* regarding your outstanding account balance of *${formatPKR(
              customer.currentOutstandingBalance
            )}*.

*Account Details for Direct Bank Transfer:*
Bank: Meezan Bank Ltd
Account Title: Noxderma Pharmaceuticals Distribution
Account Number: 0281-0104928172
IBAN: PK68MEZN0002810104928172

Please share the payment deposit slip or screenshot once transferred so we can update your ledger immediately.

Thank you for your valued partnership.
*Noxderma Finance Team*
Helpline: +92 42 35889911`}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `Assalam-o-Alaikum ${customer.name},\n\nWe hope this message finds you well.\n\nThis is a gentle reminder from Noxderma Pharma regarding your outstanding account balance of ${formatPKR(
                    customer.currentOutstandingBalance
                  )}.\n\nAccount Details for Direct Bank Transfer:\nBank: Meezan Bank Ltd\nAccount Title: Noxderma Pharmaceuticals Distribution\nIBAN: PK68MEZN0002810104928172\n\nPlease share the payment slip once transferred so we can update your ledger.\n\nThank you,\nNoxderma Finance Team`
                );
                alert("Reminder text copied to clipboard!");
              }}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Copy Text
            </button>
            <a
              href={`https://wa.me/${
                customer.whatsappNumber || customer.phone.replace(/[^0-9]/g, "")
              }?text=${encodeURIComponent(
                `Assalam-o-Alaikum ${customer.name},\n\nThis is a gentle reminder from *Noxderma Pharma* regarding your outstanding balance of *${formatPKR(
                  customer.currentOutstandingBalance
                )}*.\n\nPlease share the deposit slip once transferred so we can update your ledger.\n\nThank you,\n*Noxderma Finance Team*`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <Send className="w-3.5 h-3.5" /> Send on WhatsApp
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
