"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  Plus,
  Search,
  Filter,
  ArrowLeft,
  Phone,
  MessageCircle,
  MapPin,
  CreditCard,
  User,
  ExternalLink,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  Wallet,
} from "lucide-react";
import { formatPKR, formatKarachiDate, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import type { Customer, CustomerCategory } from "@/types";
import { ReceivePaymentModal } from "@/components/finance/ReceivePaymentModal";
import {
  BulkDeleteModal,
  SingleDeleteModal,
  type DeleteScopeType,
} from "@/components/common/BulkDeleteModal";
import {
  isRecordInDateRange,
  computeDateScopeCounts,
  getItemsInScope,
  type DateFilterState,
} from "@/lib/dateFilter";

export default function CustomersDirectoryPage() {
  const { currentUser, hasPermission, hasAnyPermission } = useAuth();
  const canCreateBill = hasPermission("invoices:create");
  const canViewFinance = hasAnyPermission([
    "finance:aging",
    "finance:ledgers",
    "finance:payments",
    "finance:pnl",
    "invoices:view",
  ]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isAdding, setIsAdding] = useState(false);

  // Multi-Selection & Deletion State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [receiveCashCustomerId, setReceiveCashCustomerId] = useState<string>("");
  const [isReceiveCashOpen, setIsReceiveCashOpen] = useState<boolean>(false);

  // Form State
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState<CustomerCategory>("pharmacy");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState(0);

  const refreshCustomers = async () => {
    const list = await offlineDb.customers.toArray();
    setCustomers(list);
  };

  useEffect(() => {
    refreshCustomers();
    const handleCloudSynced = () => {
      refreshCustomers();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert("Name and Phone are required.");
      return;
    }

    const now = new Date().toISOString();
    const newCust: Customer = {
      id: `cust_${Date.now()}`,
      name: name.trim(),
      businessName: businessName.trim() || name.trim(),
      category,
      contactPerson: contactPerson.trim() || name.trim(),
      phone: phone.trim(),
      whatsappNumber: whatsappNumber.trim() || phone.trim(),
      address: address.trim(),
      city: city.trim(),
      creditLimit: Number(creditLimit) || 0,
      creditTermsDays: 30,
      currentOutstandingBalance: 0,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await offlineDb.customers.add(newCust);
    await recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      userEmail: currentUser?.email,
      action: "create",
      entityType: "customer",
      entityId: newCust.id,
      entityTitle: `${newCust.name}${newCust.city ? ` (${newCust.city})` : ""}`,
      details: `Added new ${newCust.category.replace(/_/g, " ")} "${newCust.name}" — Contact: ${newCust.contactPerson}, Phone: ${newCust.phone}${newCust.city ? `, City: ${newCust.city}` : ""}, Credit Limit: ${formatPKR(newCust.creditLimit)}.`,
      snapshotAfter: newCust,
      canUndo: true,
    });
    await refreshCustomers();
    setIsAdding(false);
    setName("");
    setBusinessName("");
    setContactPerson("");
    setPhone("");
    setWhatsappNumber("");
    setCity("");
    setAddress("");
    setCreditLimit(0);
  };

  const filtered = customers.filter((c) => {
    if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.contactPerson.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.city.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const scopeCounts = useMemo(() => {
    const pool = customers.filter(
      (c) => categoryFilter === "all" || c.category === categoryFilter
    );
    return computeDateScopeCounts(
      pool,
      (c) => c.createdAt,
      selectedIds.length
    );
  }, [customers, categoryFilter, selectedIds.length]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((c) => c.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExecuteBulkDelete = async (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => {
    try {
      setIsDeleting(true);
      const pool = customers.filter(
        (c) => categoryFilter === "all" || c.category === categoryFilter
      );
      const toDelete = getItemsInScope(
        pool,
        scope,
        (c) => c.createdAt,
        (c) => c.id,
        selectedIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        setNotice({ type: "error", text: "No matching records found to delete." });
        setIsDeleting(false);
        setDeleteModalOpen(false);
        return;
      }

      const idsToDelete = toDelete.map((c) => c.id);
      await offlineDb.customers.bulkDelete(idsToDelete);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "customer",
        entityId: idsToDelete.slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} customer(s)`,
        details: `Purged ${toDelete.length} medical store(s) under criteria scope: ${scope}.`,
        snapshotBefore: toDelete,
        canUndo: true,
      });

      setSelectedIds([]);
      await refreshCustomers();
      setDeleteModalOpen(false);
      setNotice({
        type: "success",
        text: `Successfully deleted ${toDelete.length} medical store(s).`,
      });
    } catch (err: any) {
      console.error("Bulk delete customers failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete customers." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteSingleDelete = async () => {
    if (!deletingCustomer) return;
    try {
      setIsDeleting(true);
      await offlineDb.customers.delete(deletingCustomer.id);
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "customer",
        entityId: deletingCustomer.id,
        entityTitle: deletingCustomer.name,
        details: `Deleted medical store "${deletingCustomer.name}" (${deletingCustomer.city || ""}).`,
        snapshotBefore: deletingCustomer,
        canUndo: true,
      });
      setSelectedIds((prev) => prev.filter((id) => id !== deletingCustomer.id));
      await refreshCustomers();
      setDeletingCustomer(null);
      setNotice({
        type: "success",
        text: `Deleted "${deletingCustomer.name}".`,
      });
    } catch (err: any) {
      console.error("Single delete customer failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete customer." });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {notice && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-semibold animate-in fade-in ${
            notice.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 btn-interactive"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Building2 className="w-7 h-7 text-teal-600" />
            Pharmacies & Medical Stores (Customers)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            List of all medical stores, pharmacies, and clinics. Check udhaar balance and make new bills.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs sm:text-sm font-bold shadow-soft shadow-rose-600/20 btn-interactive"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs sm:text-sm font-bold btn-interactive"
            title="Delete with scope criteria (Today, Weekly, Monthly, Custom Range, All)"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete / Purge</span>
          </button>

          <button
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-bold shadow-soft shadow-teal-600/20 btn-interactive"
          >
            <Plus className="w-4 h-4" />
            {isAdding ? "Cancel" : "Add New Medical Store"}
          </button>
        </div>
      </div>

      {/* Add Customer Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateCustomer}
          className="p-5 md:p-6 rounded-2xl border border-teal-500/30 bg-white dark:bg-slate-900 shadow-card space-y-4 text-xs sm:text-sm animate-in fade-in"
        >
          <h2 className="text-sm sm:text-base font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Add New Medical Store / Pharmacy
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Shop / Pharmacy Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Al-Madina Medicos"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Type of Shop / Business</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="pharmacy">Medical Store / Pharmacy</option>
                <option value="distributor">Wholesale Distributor</option>
                <option value="direct_clinic">Doctor / Skin Clinic</option>
                <option value="online">Online Customer</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Owner / Contact Person</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Haji Salman"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Primary Mobile Phone *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0321 1234567"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">WhatsApp Number</label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. 0321 1234567"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Maximum Udhaar Limit (PKR)</label>
              <input
                type="number"
                placeholder="0"
                value={creditLimit === 0 ? "" : creditLimit}
                onChange={(e) => {
                  const raw = e.target.value;
                  setCreditLimit(raw === "" ? 0 : Number(raw) || 0);
                }}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">Shop Address / Market Location</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Shop 4, Main Medicine Market, Karachi"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 mb-1.5">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm btn-interactive"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-soft shadow-teal-600/20 btn-interactive"
            >
              Save Shop / Customer
            </button>
          </div>
        </form>
      )}

      {/* Filters & Search */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search shop, owner, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5" /> Type:
          </span>
          {(["all", "pharmacy", "distributor", "direct_clinic"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`min-h-[38px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl font-bold capitalize btn-interactive transition-all text-xs sm:text-sm ${
                categoryFilter === cat
                  ? "bg-teal-600 text-white shadow-soft"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {cat === "all" ? "All Shops" : cat === "pharmacy" ? "Medical Store" : cat === "distributor" ? "Distributor" : "Doctor / Clinic"}
            </button>
          ))}
        </div>
      </div>

      {/* Customers List: Mobile Card View (< md) */}
      <div className="block md:hidden space-y-3.5">
        {filtered.length > 0 && (
          <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-500">
            <label className="flex items-center gap-2 font-bold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={selectedIds.length === filtered.length && filtered.length > 0}
                onChange={handleToggleSelectAll}
                className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>Select All ({filtered.length})</span>
            </label>
            {selectedIds.length > 0 && (
              <span className="font-semibold text-rose-600">
                {selectedIds.length} selected
              </span>
            )}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            No medical stores match your search.
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className={`p-4 rounded-2xl border transition-all ${
                selectedIds.includes(c.id)
                  ? "border-teal-500 bg-teal-50/20 dark:bg-teal-950/20"
                  : "border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900"
              } shadow-soft card-interactive space-y-3.5`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(c.id)}
                    onChange={() => handleToggleSelect(c.id)}
                    className="w-4 h-4 mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                  />
                  <div className="space-y-0.5">
                    <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base leading-snug">
                      {c.name}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{c.city || "Karachi"}</span>
                      {c.contactPerson && (
                        <>
                          <span>•</span>
                          <span className="font-medium">{c.contactPerson}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    {c.category === "pharmacy" ? "Medical Store" : c.category === "distributor" ? "Distributor" : c.category.replace("_", " ")}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDeletingCustomer(c)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                    title="Delete Shop"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Outstanding Udhaar and Limit (Restricted to Finance / Billing Users) */}
              {canViewFinance && (
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                  <div>
                    <span className="text-slate-400 block font-medium">Baqaya (Udhaar):</span>
                    <span className="font-extrabold text-sm sm:text-base text-rose-600 dark:text-rose-400">
                      {formatPKR(c.currentOutstandingBalance)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400 block font-medium">Credit Limit:</span>
                    <span className="font-bold text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                      {formatPKR(c.creditLimit)}
                    </span>
                  </div>
                </div>
              )}

              {/* Contact and Direct Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                {canViewFinance && c.currentOutstandingBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setReceiveCashCustomerId(c.id);
                      setIsReceiveCashOpen(true);
                    }}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-soft btn-interactive shrink-0"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>Receive Cash</span>
                  </button>
                )}
                <a
                  href={`tel:${c.phone}`}
                  className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 btn-interactive shrink-0"
                  title="Call Shop"
                >
                  <Phone className="w-3.5 h-3.5 text-teal-600" />
                  <span>Call</span>
                </a>
                <a
                  href={`https://wa.me/${(c.whatsappNumber || c.phone).replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-h-[40px] px-3 py-2 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center justify-center gap-1.5 btn-interactive shrink-0"
                  title="WhatsApp"
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp</span>
                </a>
                <Link
                  href={`/customers/detail?id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}`}
                  className="min-h-[40px] flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 btn-interactive"
                >
                  {canViewFinance ? "Khata" : "Profile"}
                </Link>
                {canCreateBill && (
                  <Link
                    href={`/sales/invoices/new?customerId=${c.id}`}
                    className="min-h-[40px] flex-1 px-3 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs flex items-center justify-center shadow-soft shadow-teal-600/20 btn-interactive"
                  >
                    + Bill
                  </Link>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Customers Table: Desktop View (>= md) */}
      <div className="hidden md:block p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-xs font-bold tracking-wider">
                <th className="w-10 py-3 px-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === filtered.length && filtered.length > 0}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    title="Select All"
                  />
                </th>
                <th className="py-3 px-3">Medical Store / Pharmacy</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Owner / Contact</th>
                <th className="py-3 px-3">Phone & WhatsApp</th>
                {canViewFinance && (
                  <>
                    <th className="py-3 px-3 text-right">Udhaar Limit</th>
                    <th className="py-3 px-3 text-right">Baqaya (Udhaar)</th>
                  </>
                )}
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className={`transition-colors ${
                    selectedIds.includes(c.id)
                      ? "bg-teal-50/40 dark:bg-teal-950/30"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <td className="w-10 py-3.5 px-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => handleToggleSelect(c.id)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                  </td>
                  <td className="py-3.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                    <span className="block font-bold">{c.name}</span>
                    <span className="block text-xs text-slate-400 font-normal">{c.city || "Karachi"}</span>
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                      {c.category === "pharmacy" ? "Medical Store" : c.category === "distributor" ? "Distributor" : c.category.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 font-medium">{c.contactPerson}</td>
                  <td className="py-3.5 px-3 font-mono text-xs">
                    <div className="flex items-center gap-2">
                      <span>{c.phone}</span>
                      <a
                        href={`https://wa.me/${(c.whatsappNumber || c.phone).replace(/[^0-9]/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 hover:text-emerald-700 btn-interactive"
                        title="Chat on WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                  {canViewFinance && (
                    <>
                      <td className="py-3.5 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                        {formatPKR(c.creditLimit)}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400">
                        {formatPKR(c.currentOutstandingBalance)}
                      </td>
                    </>
                  )}
                  <td className="py-3.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {canViewFinance && c.currentOutstandingBalance > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setReceiveCashCustomerId(c.id);
                            setIsReceiveCashOpen(true);
                          }}
                          className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs btn-interactive inline-flex items-center gap-1 shadow-sm"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Receive Cash</span>
                        </button>
                      )}
                      <Link
                        href={`/customers/detail?id=${encodeURIComponent(c.id)}&name=${encodeURIComponent(c.name)}`}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-xs btn-interactive inline-flex items-center"
                      >
                        {canViewFinance ? "View Khata" : "View Profile"}
                      </Link>
                      {canCreateBill && (
                        <Link
                          href={`/sales/invoices/new?customerId=${c.id}`}
                          className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100 text-xs btn-interactive inline-flex items-center"
                        >
                          Make Bill
                        </Link>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeletingCustomer(c)}
                        className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors inline-flex items-center"
                        title="Delete Medical Store"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        entityName="Medical Stores / Customers"
        selectedCount={selectedIds.length}
        totalCount={customers.filter((c) => categoryFilter === "all" || c.category === categoryFilter).length}
        countsByScope={scopeCounts}
        onConfirmDelete={handleExecuteBulkDelete}
        isDeleting={isDeleting}
      />

      {/* Single Delete Modal */}
      <SingleDeleteModal
        isOpen={!!deletingCustomer}
        onClose={() => setDeletingCustomer(null)}
        itemName={deletingCustomer?.name || ""}
        title="Delete Medical Store"
        onConfirm={handleExecuteSingleDelete}
        isDeleting={isDeleting}
      />

      <ReceivePaymentModal
        isOpen={isReceiveCashOpen}
        onClose={() => setIsReceiveCashOpen(false)}
        initialCustomerId={receiveCashCustomerId}
        onSuccess={(pay) => {
          refreshCustomers();
          setNotice({
            type: "success",
            text: `Cash Received: ${formatPKR(pay.amount)} from ${pay.customerName} recorded in Khata!`,
          });
          setTimeout(() => setNotice(null), 4000);
        }}
      />
    </div>
  );
}
