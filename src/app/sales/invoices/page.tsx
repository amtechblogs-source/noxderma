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
  MapPin,
  Mail,
  Trash2,
  X,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { getProductImageUrl } from "@/features/sales/OfflineInvoiceCreator";
import type { Invoice, Product, BusinessSettings } from "@/types";
import { openWhatsAppShare } from "@/lib/whatsapp/share";
import { useAuth } from "@/context/AuthContext";
import { recordActivity } from "@/lib/audit/auditTracker";

export default function SalesInvoicesListPage() {
  const { currentUser, hasPermission, hasAnyPermission } = useAuth();
  const canCreateInvoice = hasPermission("invoices:create");
  const canEditInvoice = hasPermission("invoices:edit");
  const canDeleteInvoice = hasAnyPermission(["invoices:edit", "invoices:reverse"]);
  const canViewCustomers = hasPermission("crm:customers");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncFilter, setSyncFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  // Selection & Deletion State
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [deletingInvoice, setDeletingInvoice] = useState<Invoice | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState<boolean>(false);
  const [isDeletingLoading, setIsDeletingLoading] = useState<boolean>(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

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

  const selectedInvoicesTotal = invoices
    .filter((inv) => selectedInvoiceIds.includes(inv.id))
    .reduce((sum, inv) => sum + (inv.netTotal || 0), 0);

  // Selection helpers
  const handleToggleSelect = (id: string) => {
    setSelectedInvoiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedInvoiceIds.length === filtered.length && filtered.length > 0) {
      setSelectedInvoiceIds([]);
    } else {
      setSelectedInvoiceIds(filtered.map((inv) => inv.id));
    }
  };

  // Revert stock, customer balance, and delete record
  const deleteInvoiceRecord = async (inv: Invoice) => {
    const now = new Date().toISOString();

    // 1. Return items to respective inventory batches and record positive adjustment
    for (const line of inv.lines || []) {
      for (const alloc of line.batchAllocations || []) {
        if (alloc.batchId) {
          const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
          if (batch) {
            const restoredQty = (Number(batch.remainingQuantity) || 0) + (alloc.quantity || 0);
            await offlineDb.inventoryBatches.update(alloc.batchId, {
              remainingQuantity: restoredQty,
              updatedAt: now,
            });

            await offlineDb.stockMovements.add({
              id: `mov_del_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              productId: line.productId,
              productName: line.productName,
              batchId: alloc.batchId,
              batchNumber: alloc.batchNumber || batch.batchNumber,
              type: "sales_return",
              quantityChange: alloc.quantity,
              balanceAfter: restoredQty,
              referenceId: inv.id,
              referenceType: "invoice",
              userId: currentUser?.id || "usr_admin",
              userName: currentUser?.displayName || "Owner",
              reason: `Invoice deleted: ${inv.provisionalReference || inv.id}`,
              timestamp: now,
            });
          }
        }
      }
    }

    // 2. Revert customer outstanding balance if invoice was pending
    if (inv.customerId && inv.outstandingBalance > 0) {
      const cust = await offlineDb.customers.get(inv.customerId);
      if (cust) {
        const newBal = Math.max(0, (cust.currentOutstandingBalance || 0) - inv.outstandingBalance);
        await offlineDb.customers.update(inv.customerId, {
          currentOutstandingBalance: newBal,
          updatedAt: now,
        });
      }
    }

    // 3. Delete any associated payment records for this invoice
    const linkedPayments = await offlineDb.payments
      .filter((p) => {
        if (p.referenceNumber === inv.provisionalReference || p.referenceNumber === inv.id) return true;
        if (p.allocations?.some((a) => a.invoiceId === inv.id || a.invoiceReference === inv.provisionalReference)) return true;
        return false;
      })
      .toArray();

    for (const p of linkedPayments) {
      await offlineDb.payments.delete(p.id);
    }

    // 4. Delete invoice from Dexie offline database
    await offlineDb.invoices.delete(inv.id);
  };

  // Single Delete Handler
  const handleDeleteSingle = async (inv: Invoice) => {
    setIsDeletingLoading(true);
    try {
      await offlineDb.transaction(
        "rw",
        [
          offlineDb.invoices,
          offlineDb.inventoryBatches,
          offlineDb.stockMovements,
          offlineDb.customers,
          offlineDb.payments,
        ],
        async () => {
          await deleteInvoiceRecord(inv);
        }
      );
      setSelectedInvoiceIds((prev) => prev.filter((id) => id !== inv.id));
      setDeletingInvoice(null);
      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "invoice",
        entityId: inv.id,
        entityTitle: `Bill #${inv.provisionalReference || inv.id}`,
        details: `Deleted customer bill #${inv.provisionalReference || inv.id} for "${inv.customerName}" (Total: PKR ${(inv.netTotal || 0).toLocaleString()}). Stock returned to batches.`,
        snapshotBefore: inv,
        canUndo: true,
      });
      await loadData();
      setSuccessNotice(`Bill "${inv.provisionalReference || inv.id}" kamyabi se delete ho gaya aur stock wapas restore ho gaya!`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      console.error("Delete invoice error:", err);
      alert("Bill delete karne mein masla hua: " + (err.message || "Unknown error"));
    } finally {
      setIsDeletingLoading(false);
    }
  };

  // Bulk Delete Handler
  const handleBulkDelete = async () => {
    if (selectedInvoiceIds.length === 0) return;
    setIsDeletingLoading(true);
    try {
      const count = selectedInvoiceIds.length;
      await offlineDb.transaction(
        "rw",
        [
          offlineDb.invoices,
          offlineDb.inventoryBatches,
          offlineDb.stockMovements,
          offlineDb.customers,
          offlineDb.payments,
        ],
        async () => {
          for (const id of selectedInvoiceIds) {
            const inv = invoices.find((i) => i.id === id);
            if (inv) {
              await deleteInvoiceRecord(inv);
            }
          }
        }
      );
      for (const id of selectedInvoiceIds) {
        const inv = invoices.find((i) => i.id === id);
        if (inv) {
          await recordActivity({
            userId: currentUser?.id || "usr_admin",
            userName: currentUser?.displayName || "Owner",
            userRole: currentUser?.role || "owner",
            userEmail: currentUser?.email,
            action: "delete",
            entityType: "invoice",
            entityId: inv.id,
            entityTitle: `Bill #${inv.provisionalReference || inv.id}`,
            details: `Bulk-deleted customer bill #${inv.provisionalReference || inv.id} for "${inv.customerName}" (Total: PKR ${(inv.netTotal || 0).toLocaleString()}). Stock returned.`,
            snapshotBefore: inv,
            canUndo: true,
          });
        }
      }
      setSelectedInvoiceIds([]);
      setIsBulkDeleting(false);
      await loadData();
      setSuccessNotice(`${count} bills kamyabi se delete ho gaye aur inventory stock restore ho gaya!`);
      setTimeout(() => setSuccessNotice(null), 4000);
    } catch (err: any) {
      console.error("Bulk delete error:", err);
      alert("Bulk delete mein masla hua: " + (err.message || "Unknown error"));
    } finally {
      setIsDeletingLoading(false);
    }
  };

  const handlePrint = (inv: Invoice) => {
    setSelectedInvoice(inv);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  const handleShareInvoiceWhatsApp = (inv: Invoice) => {
    const message = `*NOXDERMA PHARMA - BILL RECEIPT*\nBill No: ${inv.provisionalReference}\nCustomer: ${inv.customerName}\nTotal Bill: ${formatPKR(
      inv.netTotal
    )}\nRemaining Baqaya: ${formatPKR(
      inv.outstandingBalance
    )}\nDue Date: ${inv.dueDate || "30 Days"}\n\nThank you for your business!`;

    openWhatsAppShare({
      phone: inv.customerPhone,
      rawText: message,
      autoCopyFull: true,
    });
  };

  return (
    <>
      <div className="space-y-6 no-print print:hidden">
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

        {canCreateInvoice && (
          <Link
            href="/sales/invoices/new"
            className="px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-teal-600/20 transition-all btn-interactive self-stretch sm:self-auto"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" /> Make New Bill
          </Link>
        )}
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

      {/* Success Notification Notice */}
      {successNotice && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-800 dark:hover:text-emerald-200 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Bulk Selection Actions Floating Toolbar */}
      {canDeleteInvoice && selectedInvoiceIds.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-2xl bg-teal-900 text-white shadow-xl border border-teal-700 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-800 text-teal-200 flex items-center justify-center font-bold text-sm">
              {selectedInvoiceIds.length}
            </div>
            <div>
              <span className="font-extrabold text-sm block">
                {selectedInvoiceIds.length} {selectedInvoiceIds.length === 1 ? "Bill Selected" : "Bills Selected"}
              </span>
              <span className="text-xs text-teal-200">
                Total Value: <strong className="font-mono text-white">{formatPKR(selectedInvoicesTotal)}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setSelectedInvoiceIds([])}
              className="px-3.5 py-2 min-h-[38px] rounded-xl bg-teal-800 hover:bg-teal-700 active:bg-teal-800 text-teal-100 font-bold text-xs sm:text-sm btn-interactive"
            >
              Deselect All
            </button>

            <button
              type="button"
              onClick={() => setIsBulkDeleting(true)}
              className="px-4 py-2 min-h-[38px] rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm btn-interactive"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedInvoiceIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Invoices Master Container */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <Receipt className="w-12 h-12 mx-auto mb-2 opacity-50 text-teal-600" />
            <p className="text-sm font-semibold">No bills found matching your filter.</p>
            {canCreateInvoice && (
              <Link
                href="/sales/invoices/new"
                className="mt-3 text-sm font-bold text-teal-600 hover:underline inline-block"
              >
                Make First Bill →
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Mobile View: High Ergonomics Touch Cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filtered.map((inv) => {
                const isSelected = selectedInvoiceIds.includes(inv.id);
                return (
                  <div
                    key={inv.id}
                    className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-soft card-interactive space-y-3 transition-all ${
                      isSelected
                        ? "border-teal-500 dark:border-teal-400 ring-2 ring-teal-500/20 bg-teal-50/10 dark:bg-teal-950/10"
                        : "border-slate-200/80 dark:border-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2.5">
                        {canDeleteInvoice && (
                          <label
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-2 cursor-pointer select-none"
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(inv.id)}
                              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                            />
                          </label>
                        )}
                        <div>
                          <span className="font-mono font-bold text-teal-600 dark:text-teal-400 text-sm block">
                            {inv.provisionalReference || inv.id}
                          </span>
                          <span className="text-xs text-slate-400">
                            {inv.invoiceDate || inv.createdAt.slice(0, 10)} &bull; {inv.lines?.length || 1} item(s)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider ${
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
                            ? "PARTIAL"
                            : "UNPAID"}
                        </span>

                        {canDeleteInvoice && (
                          <button
                            type="button"
                            onClick={() => setDeletingInvoice(inv)}
                            title="Delete Bill"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors btn-interactive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div>
                      {canViewCustomers ? (
                        <Link
                          href={`/customers/detail?id=${encodeURIComponent(inv.customerId)}`}
                          className="font-bold text-base text-slate-900 dark:text-slate-100 hover:text-teal-600 block truncate"
                        >
                          {inv.customerName}
                        </Link>
                      ) : (
                        <span className="font-bold text-base text-slate-900 dark:text-slate-100 block truncate">
                          {inv.customerName}
                        </span>
                      )}
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

                    <div className="flex items-center justify-between pt-1 gap-1.5 flex-wrap">
                      {canEditInvoice && (
                        <Link
                          href={`/sales/invoices/edit?id=${encodeURIComponent(inv.id)}`}
                          className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 font-bold text-xs min-h-[40px] hover:bg-amber-100 dark:hover:bg-amber-900/50 btn-interactive"
                        >
                          <Pencil className="w-3.5 h-3.5 text-amber-600" />
                          <span>Edit Bill</span>
                        </Link>
                      )}

                      <button
                        onClick={() => handlePrint(inv)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs min-h-[40px] hover:bg-slate-50 dark:hover:bg-slate-800 btn-interactive"
                      >
                        <Printer className="w-4 h-4 text-slate-500" />
                        <span>Print Bill</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleShareInvoiceWhatsApp(inv)}
                        className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs min-h-[40px] btn-interactive"
                      >
                        <Share2 className="w-4 h-4 text-emerald-600" />
                        <span>WhatsApp</span>
                      </button>

                      {canDeleteInvoice && (
                        <button
                          type="button"
                          onClick={() => setDeletingInvoice(inv)}
                          title="Delete Bill"
                          className="inline-flex items-center justify-center p-2 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 min-h-[40px] min-w-[40px] btn-interactive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Full Master Table */}
            <div className="hidden md:block p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {canDeleteInvoice && (
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && selectedInvoiceIds.length === filtered.length}
                          onChange={handleToggleSelectAll}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                          title="Select All Invoices"
                          aria-label="Select All Invoices"
                        />
                      </th>
                    )}
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
                  {filtered.map((inv) => {
                    const isSelected = selectedInvoiceIds.includes(inv.id);
                    return (
                      <tr
                        key={inv.id}
                        className={`transition-colors ${
                          isSelected
                            ? "bg-teal-50/20 dark:bg-teal-950/20"
                            : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        {canDeleteInvoice && (
                          <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(inv.id)}
                              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                              aria-label={`Select bill ${inv.provisionalReference || inv.id}`}
                            />
                          </td>
                        )}
                        <td className="p-3">
                          <span className="font-mono font-bold text-teal-600 dark:text-teal-400 block text-sm">
                            {inv.provisionalReference || inv.id}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {inv.lines?.length || 1} medicine(s)
                          </span>
                        </td>
                        <td className="p-3">
                          {canViewCustomers ? (
                            <Link
                              href={`/customers/detail?id=${encodeURIComponent(inv.customerId)}`}
                              className="font-bold text-slate-900 dark:text-slate-100 hover:underline block truncate max-w-[200px]"
                            >
                              {inv.customerName}
                            </Link>
                          ) : (
                            <span className="font-bold text-slate-900 dark:text-slate-100 block truncate max-w-[200px]">
                              {inv.customerName}
                            </span>
                          )}
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
                            {canEditInvoice && (
                              <Link
                                href={`/sales/invoices/edit?id=${encodeURIComponent(inv.id)}`}
                                title="Edit Bill (بل تبدیل کریں)"
                                className="p-2 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950 text-amber-600 dark:text-amber-400 btn-interactive min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                <Pencil className="w-4 h-4" />
                              </Link>
                            )}
                            <button
                              onClick={() => handlePrint(inv)}
                              title="Print Bill"
                              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 btn-interactive min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareInvoiceWhatsApp(inv)}
                              title="Send on WhatsApp"
                              className="p-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950 text-emerald-600 btn-interactive min-h-[36px] min-w-[36px] flex items-center justify-center"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                            {canDeleteInvoice && (
                              <button
                                type="button"
                                onClick={() => setDeletingInvoice(inv)}
                                title="Delete Bill"
                                className="p-2 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 text-rose-500 hover:text-rose-700 btn-interactive min-h-[36px] min-w-[36px] flex items-center justify-center"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* INDIVIDUAL INVOICE DELETE CONFIRMATION MODAL                              */}
      {/* ========================================================================= */}
      {deletingInvoice && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-card-hover max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                Delete Customer Bill?
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Kya aap waqai Bill No{" "}
                <strong className="text-slate-800 dark:text-slate-200 font-mono">
                  {deletingInvoice.provisionalReference || deletingInvoice.id}
                </strong>{" "}
                ({deletingInvoice.customerName}) delete karna chahte hain?
              </p>

              <div className="p-3 mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Bill Amount:</span>
                  <span className="font-bold font-mono text-slate-900 dark:text-slate-100">
                    {formatPKR(deletingInvoice.netTotal)}
                  </span>
                </div>
                {deletingInvoice.outstandingBalance > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Remaining Udhaar:</span>
                    <span className="font-bold font-mono text-rose-600">
                      {formatPKR(deletingInvoice.outstandingBalance)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Medicines / Batches:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">
                    {deletingInvoice.lines?.length || 0} items
                  </span>
                </div>
              </div>

              <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 font-medium bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Is bill ki tamam items ka stock wapas batches mein jama (restore) ho jayega aur customer ka udhaar balance wapas adjust ho jayega.
                </span>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={() => setDeletingInvoice(null)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 dark:hover:bg-slate-800 btn-interactive"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={() => handleDeleteSingle(deletingInvoice)}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm shadow-rose-600/20 disabled:opacity-50 btn-interactive"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingLoading ? "Deleting..." : "Delete Bill"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BULK INVOICES DELETE CONFIRMATION MODAL                                    */}
      {/* ========================================================================= */}
      {isBulkDeleting && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-card-hover max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                Delete {selectedInvoiceIds.length} Selected Bills?
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Aap ne <strong className="text-slate-800 dark:text-slate-200">{selectedInvoiceIds.length} bills</strong> muntakhib kiye hain jinki kul qeemat{" "}
                <strong className="font-mono text-teal-600 dark:text-teal-400 font-bold">{formatPKR(selectedInvoicesTotal)}</strong> hai.
              </p>

              <p className="text-xs text-rose-600 dark:text-rose-400 mt-2 font-medium bg-rose-50 dark:bg-rose-950/40 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/40 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Tamam muntakhib bills delete ho jayenge aur unka stock wapas batches mein restore ho jayega.
                </span>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={() => setIsBulkDeleting(false)}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs sm:text-sm hover:bg-slate-100 dark:hover:bg-slate-800 btn-interactive"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={handleBulkDelete}
                className="min-h-[42px] px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm shadow-rose-600/20 disabled:opacity-50 btn-interactive"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingLoading ? "Deleting..." : `Delete ${selectedInvoiceIds.length} Bills`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Printable Official Invoice Card - Optimized for Clean A4 Fit */}
      {selectedInvoice && (
        <div className="hidden print:block print-page bg-white text-black p-6 font-sans text-xs w-full max-w-none m-0">
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
                <div className="mt-1.5 space-y-0.5 text-xs sm:text-sm font-semibold text-slate-800">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-black shrink-0" />
                    <span>{businessSettings?.address || "Plot 42, Industrial Area, Sector 7, Karachi, Pakistan"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-black shrink-0" />
                    <span>{businessSettings?.contactPhone || "+92 300 1234567"}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-black shrink-0" />
                    <span>{businessSettings?.email || "info@noxderma.com"}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="inline-block px-3 py-1 rounded text-xs sm:text-sm font-black border border-black text-black bg-slate-100 tracking-wider uppercase">
                SALE INVOICE
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
            <div
              className="invoice-info-card p-4 rounded-xl border border-slate-400 bg-white print:!p-4"
              style={{ padding: "14px 16px" }}
            >
              <span className="text-slate-600 font-black uppercase text-[11px] tracking-wider block">
                CUSTOMER / PHARMACY:
              </span>
              <p className="font-black text-base sm:text-lg text-black mt-1">
                {selectedInvoice.customerName}
              </p>
              {selectedInvoice.customerPhone && (
                <div className="flex items-center gap-1.5 font-bold text-black mt-1 text-xs sm:text-sm">
                  <Phone className="w-3.5 h-3.5 text-black shrink-0" />
                  <span>{selectedInvoice.customerPhone}</span>
                </div>
              )}
              {selectedInvoice.customerAddress && (
                <div className="flex items-center gap-1.5 font-semibold text-slate-800 mt-0.5 text-xs sm:text-sm">
                  <MapPin className="w-3.5 h-3.5 text-black shrink-0" />
                  <span>{selectedInvoice.customerAddress}</span>
                </div>
              )}
            </div>
            <div
              className="invoice-info-card p-4 rounded-xl border border-slate-400 bg-white print:!p-4"
              style={{ padding: "14px 16px" }}
            >
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
    </>
  );
}
