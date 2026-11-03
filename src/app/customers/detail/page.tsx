"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  Printer,
  Pencil,
} from "lucide-react";
import { formatPKR, formatNumber, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import type {
  Customer,
  Invoice,
  Payment,
  CustomerVisit,
  LedgerEntry,
} from "@/types";
import { openWhatsAppShare } from "@/lib/whatsapp/share";
import { recordActivity } from "@/lib/audit/auditTracker";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
} from "@/lib/dateFilter";

/**
 * Static-export friendly: the customer id is read from `?id=` at runtime
 * (data lives in IndexedDB, so there is nothing to pre-render per customer).
 */
export default function CustomerDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-slate-500 min-h-[400px] flex items-center justify-center">
          <p className="font-semibold text-sm">Loading customer profile...</p>
        </div>
      }
    >
      <CustomerDetailContent />
    </Suspense>
  );
}

function CustomerDetailContent() {
  const { currentUser, hasPermission, hasAnyPermission } = useAuth();
  const canCreateBill = hasPermission("invoices:create");
  const canViewInvoices = hasPermission("invoices:view");
  const canReceivePayment = hasPermission("finance:payments");
  const canViewLedger = hasPermission("finance:ledgers");
  const canViewVisits = hasPermission("crm:visits");
  const canViewCredit = hasAnyPermission([
    "finance:aging",
    "finance:ledgers",
    "finance:payments",
    "invoices:view",
  ]);
  const searchParams = useSearchParams();

  // Helper to extract param from useSearchParams with fallback to window.location.search
  const getParam = (key: string): string => {
    const fromNext = searchParams.get(key);
    if (fromNext) return fromNext;
    if (typeof window !== "undefined") {
      try {
        const sp = new URLSearchParams(window.location.search);
        return sp.get(key) || "";
      } catch {
        return "";
      }
    }
    return "";
  };

  const rawCustomerId = getParam("id") || getParam("customerId") || getParam("cid") || "";
  const rawCustomerName = getParam("name") || getParam("customerName") || "";

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [activeTab, setActiveTab] = useState<
    "overview" | "invoices" | "payment" | "ledger" | "visits" | "reminder"
  >("overview");
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));

  // New Payment Form State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<Payment["paymentMethod"]>("cash");
  const [payRef, setPayRef] = useState<string>("");
  const [payNotes, setPayNotes] = useState<string>("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const loadData = async () => {
    const cleanId = decodeURIComponent(
      getParam("id") || getParam("customerId") || getParam("cid") || rawCustomerId || ""
    ).trim();
    const cleanName = decodeURIComponent(
      getParam("name") || getParam("customerName") || rawCustomerName || ""
    ).trim();

    if (!cleanId && !cleanName) {
      setLoading(false);
      return;
    }

    try {
      let cust: Customer | undefined = undefined;

      // 1. First attempt: exact primary key in local Dexie IndexedDB
      if (cleanId) {
        cust = await offlineDb.customers.get(cleanId);
      }

      // 2. Second attempt: search local IndexedDB by ID variations or Name
      if (!cust) {
        const allCusts = await offlineDb.customers.toArray();
        cust = allCusts.find((c) => {
          if (cleanId && c.id.toLowerCase() === cleanId.toLowerCase()) return true;
          if (
            cleanId &&
            c.id.replace(/^cust_/, "").toLowerCase() === cleanId.replace(/^cust_/, "").toLowerCase()
          )
            return true;
          if (cleanName && c.name.trim().toLowerCase() === cleanName.toLowerCase()) return true;
          if (cleanId && c.name.trim().toLowerCase() === cleanId.toLowerCase()) return true;
          if (
            cleanId &&
            c.phone &&
            c.phone.replace(/[^0-9]/g, "") === cleanId.replace(/[^0-9]/g, "")
          )
            return true;
          return false;
        });
      }

      // 3. Third attempt: fetch directly from Cloud Firestore if not found locally
      if (!cust) {
        try {
          const { db: firestoreDb } = await import("@/lib/firebase/config");
          const { doc: fsDoc, getDoc: fsGetDoc, getDocs, collection } = await import(
            "firebase/firestore"
          );

          if (cleanId) {
            const snap = await fsGetDoc(fsDoc(firestoreDb, "customers", cleanId));
            if (snap.exists()) {
              cust = { ...snap.data(), id: snap.id } as Customer;
              await offlineDb.customers.put(cust);
            }
          }

          if (!cust) {
            const allSnap = await getDocs(collection(firestoreDb, "customers"));
            for (const d of allSnap.docs) {
              const data = d.data();
              const matchId =
                cleanId &&
                (d.id.toLowerCase() === cleanId.toLowerCase() ||
                  d.id.replace(/^cust_/, "").toLowerCase() ===
                    cleanId.replace(/^cust_/, "").toLowerCase());
              const matchName =
                (cleanName && (data.name || "").trim().toLowerCase() === cleanName.toLowerCase()) ||
                (cleanId && (data.name || "").trim().toLowerCase() === cleanId.toLowerCase());
              if (matchId || matchName) {
                cust = { ...data, id: d.id } as Customer;
                await offlineDb.customers.put(cust);
                break;
              }
            }
          }
        } catch (fsErr) {
          console.warn("Could not fetch customer directly from Cloud Firestore:", fsErr);
        }
      }

      // 4. Fourth fallback: graceful customer shell from passed name/id so user is never blocked
      if (!cust && (cleanName || cleanId)) {
        cust = {
          id: cleanId || `cust_${Date.now()}`,
          name: cleanName || cleanId,
          businessName: cleanName || cleanId,
          category: "pharmacy",
          contactPerson: cleanName || "Customer",
          phone: "",
          whatsappNumber: "",
          address: "",
          city: "",
          creditLimit: 0,
          creditTermsDays: 30,
          currentOutstandingBalance: 0,
          status: "active",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await offlineDb.customers.put(cust);
      }

      const activeCustId = cust?.id || cleanId;
      const activeCustName = cust?.name || cleanName;

      const [invList, payList, allVisits] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.payments.toArray(),
        offlineDb.customerVisits.toArray(),
      ]);

      const invoiceIds = new Set((invList || []).map((i) => i.id));
      const invoiceRefs = new Set((invList || []).map((i) => i.provisionalReference).filter(Boolean));

      // Filter out orphan payments from deleted invoices
      const validPayList = (payList || []).filter((p) => {
        const isAutoInvoicePay =
          (p.allocations && p.allocations.length > 0) ||
          (p.referenceNumber && p.referenceNumber.startsWith("INV-"));

        if (isAutoInvoicePay) {
          return (
            (p.allocations &&
              p.allocations.some(
                (a) => invoiceIds.has(a.invoiceId) || invoiceRefs.has(a.invoiceReference)
              )) ||
            (p.referenceNumber && invoiceRefs.has(p.referenceNumber))
          );
        }
        return true;
      });

      const matchingInvoices = (invList || []).filter(
        (i) =>
          i.customerId === activeCustId ||
          (activeCustName &&
            (i.customerName || "").trim().toLowerCase() === activeCustName.toLowerCase())
      );

      const matchingPayments = validPayList.filter(
        (p) =>
          p.customerId === activeCustId ||
          (activeCustName &&
            (p.customerName || "").trim().toLowerCase() === activeCustName.toLowerCase())
      );

      const matchingVisits = (allVisits || []).filter(
        (v) =>
          v.customerId === activeCustId ||
          (activeCustName &&
            (v.customerName || "").trim().toLowerCase() === activeCustName.toLowerCase())
      );

      if (cust) {
        setCustomer(cust);
      } else {
        setCustomer(null);
      }

      setInvoices(
        matchingInvoices.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      setPayments(
        matchingPayments.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
      );
      setVisits(
        matchingVisits.sort(
          (a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()
        )
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const handleSync = () => loadData();
    window.addEventListener("noxderma-cloud-synced", handleSync);
    return () => window.removeEventListener("noxderma-cloud-synced", handleSync);
  }, [rawCustomerId, rawCustomerName]);

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
        recordedByUserId: currentUser?.id || "usr_admin",
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

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "create",
        entityType: "payment",
        entityId: paymentId,
        entityTitle: `Payment PKR ${payAmount.toLocaleString()} (${customer.name})`,
        details: `Received payment of PKR ${payAmount.toLocaleString()} via ${payMethod} from ${customer.name}. New outstanding balance: PKR ${newBalance.toLocaleString()}`,
        snapshotAfter: paymentRecord,
        canUndo: true,
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

  const creditUtilization =
    customer && customer.creditLimit > 0
      ? Math.round((customer.currentOutstandingBalance / customer.creditLimit) * 100)
      : 0;

  const isOverLimit = customer
    ? customer.currentOutstandingBalance > customer.creditLimit
    : false;

  // Build clean ledger entries by merging Invoices & Payments chronologically
  const ledgerEntries = useMemo(() => {
    return [
      ...invoices.map((i) => ({
        id: `ledg_inv_${i.id}`,
        date: (i.invoiceDate || i.createdAt).slice(0, 10),
        type: "invoice" as const,
        reference: i.provisionalReference || i.id,
        description: `Sales Invoice (${i.lines?.length || 1} items)`,
        debit: i.netTotal,
        credit: 0,
        timestamp: new Date(i.createdAt).getTime(),
      })),
      ...payments.map((p) => ({
        id: `ledg_pay_${p.id}`,
        date: (p.paymentDate || p.createdAt).slice(0, 10),
        type: "payment" as const,
        reference: p.referenceNumber || p.id,
        description: `Payment Received (${p.paymentMethod.toUpperCase()})`,
        debit: 0,
        credit: p.amount,
        timestamp: new Date(p.createdAt).getTime(),
      })),
    ].sort((a, b) => a.timestamp - b.timestamp);
  }, [invoices, payments]);

  // Compute running balance
  const computedLedger = useMemo(() => {
    let currentRunBal = 0;
    return ledgerEntries.map((e) => {
      currentRunBal += e.debit - e.credit;
      return {
        ...e,
        runningBalance: currentRunBal,
      };
    });
  }, [ledgerEntries]);

  // Filtered lists based on dateFilter (All hooks defined at top level to obey Rules of Hooks)
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) =>
      isRecordInDateRange(inv.invoiceDate || inv.createdAt, dateFilter)
    );
  }, [invoices, dateFilter]);

  const filteredLedger = useMemo(() => {
    return computedLedger.filter((entry) =>
      isRecordInDateRange(entry.date || entry.timestamp, dateFilter)
    );
  }, [computedLedger, dateFilter]);

  const filteredVisits = useMemo(() => {
    return visits.filter((v) =>
      isRecordInDateRange(v.visitDate || v.createdAt, dateFilter)
    );
  }, [visits, dateFilter]);

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
      <div className="max-w-lg mx-auto py-12 px-4 text-center space-y-4">
        <div className="p-8 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
            Customer Profile Not Found
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            The requested customer record {rawCustomerId || rawCustomerName ? `("${rawCustomerId || rawCustomerName}")` : ""} could not be found
            in local storage or Cloud Firestore.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                loadData();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm btn-interactive"
            >
              <Clock className="w-4 h-4" />
              <span>Retry / Sync from Cloud</span>
            </button>
            <Link
              href="/customers"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-xs btn-interactive"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Medical Stores</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Official Print-Only Header */}
      <OfficialPrintHeader
        title="Customer Statement"
        period={getDateFilterDescription(dateFilter)}
        targetLabel="Customer"
        targetName={`${customer.name} (${customer.city})`}
      />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/customers"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors no-print print:hidden"
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

        <div className="flex items-center gap-2.5 no-print print:hidden">
          <a
            href={`https://wa.me/${customer.whatsappNumber || customer.phone.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> WhatsApp Chat
          </a>
          {canCreateBill && (
            <Link
              href={`/sales/invoices/new?customerId=${customer.id}`}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
            >
              <Plus className="w-4 h-4" /> Create Invoice
            </Link>
          )}
        </div>
      </div>

      {/* Credit Overview Cards (Restricted to Finance / Billing Users) */}
      {canViewCredit && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1 print:text-slate-600">
              Total Udhaar (Baqaya)
            </span>
            <span
              className={`text-2xl font-black font-mono ${
                isOverLimit ? "text-rose-600 dark:text-rose-400" : "text-slate-900 dark:text-slate-100"
              } print:text-black`}
            >
              {formatPKR(customer.currentOutstandingBalance)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Allowed Days: {customer.creditTermsDays} Days
            </span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1 print:text-slate-600">
              Maximum Udhaar Limit
            </span>
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 print:text-black">
              {formatPKR(customer.creditLimit)}
            </span>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full mt-2 overflow-hidden print:hidden">
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

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1 print:text-slate-600">
              Remaining Udhaar Space
            </span>
            <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 print:text-black">
              {formatPKR(Math.max(0, customer.creditLimit - customer.currentOutstandingBalance))}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {creditUtilization}% of limit used
            </span>
          </div>
        </div>
      )}

      {/* Tab Navigation (Filtered by User Permissions) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 space-x-2 overflow-x-auto text-xs font-bold no-print print:hidden">
        {[
          { id: "overview", label: "Shop Info", icon: Building2, allowed: true },
          { id: "invoices", label: `Bills (${invoices.length})`, icon: Receipt, allowed: canViewInvoices },
          { id: "payment", label: "Receive Payment", icon: DollarSign, allowed: canReceivePayment },
          { id: "ledger", label: "Khata (History)", icon: Scale, allowed: canViewLedger },
          { id: "visits", label: `Visits (${visits.length})`, icon: UserCheck, allowed: canViewVisits },
          { id: "reminder", label: "WhatsApp Reminder", icon: Send, allowed: canViewCredit },
        ]
          .filter((tab) => tab.allowed)
          .map((tab) => {
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
              <Building2 className="w-4 h-4 text-teal-600" /> Shop & Owner Details
            </h3>
            <div className="space-y-2.5">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Contact Person / Owner:</span>
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
                <span className="text-slate-500">WhatsApp Number:</span>
                <span className="font-bold font-mono text-emerald-600">
                  +{customer.whatsappNumber || customer.phone}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">City / Town:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{customer.city}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Shop Address:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                  {customer.address}
                </span>
              </div>
            </div>
          </div>

          {canViewCredit && (
            <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-teal-600" /> Payment & Udhaar Settings
              </h3>
              <div className="space-y-2.5">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Maximum Udhaar Allowed:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {formatPKR(customer.creditLimit)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Allowed Payment Days:</span>
                  <span className="font-bold text-teal-600">{customer.creditTermsDays} Days</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Shop Status:</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300">
                    {customer.status === "active" ? "ACTIVE / OPEN" : "INACTIVE"}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Field Booker / Rep:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {customer.assignedSalesRepId ? "Zubair Ahmed (Field Staff)" : "Direct Office Account"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Invoices */}
      {activeTab === "invoices" && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
              Customer Bills History
            </h3>
            {canCreateBill && (
              <Link
                href={`/sales/invoices/new?customerId=${customer.id}`}
                className="text-xs font-bold text-teal-600 hover:underline"
              >
                Make New Bill
              </Link>
            )}
          </div>

          <DateRangeFilterBar
            filter={dateFilter}
            onChange={setDateFilter}
            count={filteredInvoices.length}
            compact
          />

          {filteredInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Receipt className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No bills found for the selected period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2.5">Bill No</th>
                    <th className="p-2.5">Bill Date</th>
                    <th className="p-2.5">Due Date</th>
                    <th className="p-2.5 text-right">Total Bill</th>
                    <th className="p-2.5 text-right">Paid</th>
                    <th className="p-2.5 text-right">Baqaya</th>
                    <th className="p-2.5 text-center">Status</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredInvoices.map((inv) => (
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
                          {inv.paymentStatus === "paid"
                            ? "PAID"
                            : inv.paymentStatus === "partially_paid"
                            ? "HALF PAID"
                            : "UNPAID"}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        <Link
                          href={`/sales/invoices/edit?id=${encodeURIComponent(inv.id)}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40"
                          title="Edit Bill (بل تبدیل کریں)"
                        >
                          <Pencil className="w-3 h-3 text-amber-600" />
                          <span>Edit</span>
                        </Link>
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
            <DollarSign className="w-5 h-5 text-teal-600" /> Receive Customer Payment
          </h3>
          <p className="text-xs text-slate-500">
            Payment will automatically pay off oldest unpaid bills first and reduce the customer&apos;s
            remaining balance.
          </p>

          <form onSubmit={handleRecordPayment} className="space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Cash Received (Rs) *
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
                  Received Via *
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
                  Cheque / Slip #
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
                Payment Note
              </label>
              <textarea
                rows={2}
                placeholder="Cash handed by store manager, or deposit slip details..."
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
              {isRecordingPayment ? "Saving Payment..." : "Save Payment & Update Khata"}
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Ledger Statement */}
      {activeTab === "ledger" && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 print:border-none print:shadow-none print:p-0">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 print:text-black">
                Customer Khata Statement
              </h3>
              <p className="text-xs text-slate-400 print:text-slate-600">
                Full history of bills, cash payments received, and remaining balance
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 no-print print:hidden flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print Khata
            </button>
          </div>

          <div className="no-print print:hidden">
            <DateRangeFilterBar
              filter={dateFilter}
              onChange={setDateFilter}
              count={filteredLedger.length}
              compact
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs print:text-[10px] print:border-collapse print:border print:border-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 print:bg-slate-100 print:text-black print:border-slate-300">
                <tr>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Date</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Bill / Receipt #</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Details</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300 text-right">Bill Amount (+)</th>
                  <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300 text-right">Cash Received (-)</th>
                  <th className="p-2.5 print:p-1.5 text-right">Remaining Balance (Baqaya)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                {filteredLedger.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors print:border-b print:border-slate-200"
                  >
                    <td className="p-2.5 print:p-1.5 font-mono text-slate-500 print:text-slate-700 print:border-r print:border-slate-200">{row.date}</td>
                    <td className="p-2.5 print:p-1.5 font-mono font-bold text-teal-600 dark:text-teal-400 print:text-black print:border-r print:border-slate-200">
                      {row.reference}
                    </td>
                    <td className="p-2.5 print:p-1.5 text-slate-700 dark:text-slate-300 print:text-slate-700 print:border-r print:border-slate-200">{row.description}</td>
                    <td className="p-2.5 print:p-1.5 text-right font-mono font-semibold text-rose-600 print:text-black print:border-r print:border-slate-200">
                      {row.debit > 0 ? formatPKR(row.debit) : "-"}
                    </td>
                    <td className="p-2.5 print:p-1.5 text-right font-mono font-semibold text-emerald-600 print:text-black print:border-r print:border-slate-200">
                      {row.credit > 0 ? formatPKR(row.credit) : "-"}
                    </td>
                    <td className="p-2.5 print:p-1.5 text-right font-mono font-bold print:text-black">
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
      )}

      {/* Tab 5: Field Visits */}
      {activeTab === "visits" && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
              Field & Store Visits
            </h3>
            <Link
              href={`/crm/visits`}
              className="text-xs font-bold text-teal-600 hover:underline"
            >
              Add / Edit Visits &rarr;
            </Link>
          </div>

          <DateRangeFilterBar
            filter={dateFilter}
            onChange={setDateFilter}
            count={filteredVisits.length}
            compact
          />

          {filteredVisits.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">
              No staff visits found for the selected period.
            </p>
          ) : (
            <div className="space-y-3">
              {filteredVisits.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs space-y-1.5"
                >
                  <div className="flex flex-wrap justify-between items-center gap-1.5">
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      Visited by {v.employeeName} (Contact: {v.contactPerson})
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-400 font-mono text-[11px]">
                        {formatKarachiDate(v.visitDate, true)}
                      </span>
                      {v.updatedAt && (
                        <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold text-[10px]">
                          Edited {formatKarachiDate(v.updatedAt, true)}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 break-words">{v.visitNotes}</p>
                  {(v.competitorProducts || v.competitorOffers) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 break-words">
                      <strong>Market Note:</strong> {v.competitorProducts || v.competitorOffers}
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
            <Send className="w-5 h-5 text-emerald-600" /> WhatsApp Payment Reminder
          </h3>
          <p className="text-xs text-slate-500">
            Copy and send this polite reminder directly to the pharmacy owner or click the button to
            open in WhatsApp.
          </p>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 font-sans text-xs space-y-2 whitespace-pre-line text-slate-800 dark:text-slate-200">
            {`Assalam-o-Alaikum ${customer.name},

We hope you are doing well.

This is a gentle payment reminder from *Noxderma Pharma* regarding your remaining balance of *${formatPKR(
              customer.currentOutstandingBalance
            )}*.

*Bank Account Details:*
Bank: Meezan Bank Ltd
Account Title: Noxderma Pharma
Account Number: 0281-0104928172
IBAN: PK68MEZN0002810104928172

Please share the payment deposit slip or screenshot once paid so we can update your Khata immediately.

Thank you!
*Noxderma Pharma*
Phone: +92 300 1234567`}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `Assalam-o-Alaikum ${customer.name},\n\nThis is a gentle payment reminder from Noxderma Pharma regarding your remaining balance of ${formatPKR(
                    customer.currentOutstandingBalance
                  )}.\n\nBank Account Details:\nBank: Meezan Bank Ltd\nAccount Title: Noxderma Pharma\nIBAN: PK68MEZN0002810104928172\n\nPlease share the payment slip once paid so we can update your Khata immediately.\n\nThank you,\nNoxderma Pharma`
                );
                alert("Reminder text copied to clipboard!");
              }}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Copy Text
            </button>
            <button
              type="button"
              onClick={() => {
                const message = `Assalam-o-Alaikum ${customer.name},\n\nThis is a gentle payment reminder from *Noxderma Pharma* regarding your remaining balance of *${formatPKR(
                  customer.currentOutstandingBalance
                )}*.\n\nPlease share the deposit slip once transferred so we can update your Khata immediately.\n\nThank you,\n*Noxderma Pharma*`;
                openWhatsAppShare({
                  phone: customer.whatsappNumber || customer.phone,
                  rawText: message,
                  autoCopyFull: true,
                });
              }}
              className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
            >
              <Send className="w-3.5 h-3.5" /> Send on WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
