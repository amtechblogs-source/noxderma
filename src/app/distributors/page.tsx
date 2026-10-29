"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Truck,
  Plus,
  Search,
  Filter,
  MapPin,
  Phone,
  CreditCard,
  Building2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Percent,
  Trash2,
  X,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import type { Customer } from "@/types";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
  computeDateScopeCounts,
  getItemsInScope,
} from "@/lib/dateFilter";
import {
  BulkDeleteModal,
  SingleDeleteModal,
  type DeleteScopeType,
} from "@/components/common/BulkDeleteModal";

interface DistributorDetail extends Customer {
  territory: string;
  marginPercentage: number;
  subDealersCount: number;
}

export default function DistributorsPage() {
  const { currentUser } = useAuth();
  const [distributors, setDistributors] = useState<DistributorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTerritory, setSelectedTerritory] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [isAdding, setIsAdding] = useState(false);

  // Multi-Selection & Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingDistributor, setDeletingDistributor] = useState<DistributorDetail | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [territory, setTerritory] = useState("");
  const [creditLimit, setCreditLimit] = useState(0);
  const [creditTermsDays, setCreditTermsDays] = useState(30);
  const [marginPercentage, setMarginPercentage] = useState(10);

  const loadData = async () => {
    try {
      const allCustomers = await offlineDb.customers.toArray();
      const dists = allCustomers.filter((c) => c.category === "distributor");

      setDistributors(
        dists.map((d) => ({
          ...d,
          territory: (d as any).territory || `${d.city} Metropolitan`,
          marginPercentage: (d as any).marginPercentage || 10,
          subDealersCount: (d as any).subDealersCount || 0,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddDistributor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    const now = new Date().toISOString();
    const id = `dist_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${Date.now().toString().slice(-4)}`;

    const newDist: DistributorDetail = {
      id,
      name,
      category: "distributor",
      contactPerson,
      phone,
      whatsappNumber: whatsapp || phone.replace(/[^0-9]/g, ""),
      address: `${city} Central Distribution`,
      city,
      territory,
      creditLimit: Number(creditLimit),
      creditTermsDays: Number(creditTermsDays),
      currentOutstandingBalance: 0,
      marginPercentage: Number(marginPercentage),
      subDealersCount: 15,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await offlineDb.customers.put(newDist);
    await recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      userEmail: currentUser?.email,
      action: "create",
      entityType: "customer",
      entityId: newDist.id,
      entityTitle: newDist.name,
      details: `Added new wholesale distributor "${newDist.name}" (${newDist.city || ""}).`,
      snapshotAfter: newDist,
      canUndo: true,
    });
    setIsAdding(false);
    setName("");
    setContactPerson("");
    setPhone("");
    setWhatsapp("");
    await loadData();
  };

  const filtered = useMemo(() => {
    return distributors.filter((d) => {
      const matchesSearch =
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
        d.city.toLowerCase().includes(search.toLowerCase());
      const matchesTerritory =
        selectedTerritory === "all" || d.city.toLowerCase() === selectedTerritory.toLowerCase();
      const matchesDate = isRecordInDateRange(d.createdAt || (d as any).updatedAt, dateFilter);
      return matchesSearch && matchesTerritory && matchesDate;
    });
  }, [distributors, search, selectedTerritory, dateFilter]);

  const scopeCounts = useMemo(() => {
    return computeDateScopeCounts(
      distributors,
      (d) => d.createdAt || (d as any).updatedAt,
      selectedIds.length
    );
  }, [distributors, selectedIds.length]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((d) => d.id));
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
      const toDelete = getItemsInScope(
        distributors,
        scope,
        (d) => d.createdAt || (d as any).updatedAt,
        (d) => d.id,
        selectedIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        setNotice({ type: "error", text: "No matching distributors found to delete." });
        setIsDeleting(false);
        setDeleteModalOpen(false);
        return;
      }

      const idsToDelete = toDelete.map((d) => d.id);
      await offlineDb.customers.bulkDelete(idsToDelete);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "customer",
        entityId: idsToDelete.slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} distributor(s)`,
        details: `Purged ${toDelete.length} wholesale distributor(s) under scope: ${scope}.`,
        snapshotBefore: toDelete,
        canUndo: false,
      });

      setSelectedIds([]);
      await loadData();
      setDeleteModalOpen(false);
      setNotice({
        type: "success",
        text: `Successfully deleted ${toDelete.length} distributor(s).`,
      });
    } catch (err: any) {
      console.error("Bulk delete distributors failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete distributors." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteSingleDelete = async () => {
    if (!deletingDistributor) return;
    try {
      setIsDeleting(true);
      await offlineDb.customers.delete(deletingDistributor.id);
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "customer",
        entityId: deletingDistributor.id,
        entityTitle: deletingDistributor.name,
        details: `Deleted distributor "${deletingDistributor.name}" (${deletingDistributor.city || ""}).`,
        snapshotBefore: deletingDistributor,
        canUndo: true,
      });
      setSelectedIds((prev) => prev.filter((id) => id !== deletingDistributor.id));
      await loadData();
      setDeletingDistributor(null);
      setNotice({
        type: "success",
        text: `Deleted "${deletingDistributor.name}".`,
      });
    } catch (err: any) {
      console.error("Single delete distributor failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete distributor." });
    } finally {
      setIsDeleting(false);
    }
  };

  const totalCredit = distributors.reduce((sum, d) => sum + (d.creditLimit || 0), 0);
  const totalReceivable = distributors.reduce(
    (sum, d) => sum + (d.currentOutstandingBalance || 0),
    0
  );

  return (
    <div className="space-y-6">
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

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Supply Chain
            </span>
            <span className="text-xs text-slate-400">Wholesale Market</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Wholesale Distributors (Dealers)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Delete with criteria"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete / Purge</span>
          </button>

          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Add New Distributor
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Distributors
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {distributors.length} Partners
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Covering major cities</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Udhaar Limit Given
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalCredit)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Average 45 to 60 Days Time</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Udhaar to Receive (Baqaya)
          </span>
          <span className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
            {formatPKR(totalReceivable)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {Math.round((totalReceivable / (totalCredit || 1)) * 100)}% of limit used
          </span>
        </div>
      </div>

      {/* Universal Date Filter */}
      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={filtered.length}
      />

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search distributor name, city, or area..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> City:
          </span>
          {["all", "Lahore", "Karachi", "Rawalpindi"].map((cityOpt) => (
            <button
              key={cityOpt}
              onClick={() => setSelectedTerritory(cityOpt)}
              className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all ${
                selectedTerritory.toLowerCase() === cityOpt.toLowerCase()
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {cityOpt === "all" ? "All Cities" : cityOpt}
            </button>
          ))}
        </div>
      </div>

      {/* Selection Toolbar */}
      {filtered.length > 0 && (
        <div className="flex items-center justify-between px-2 text-xs text-slate-500">
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

      {/* Distributor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((d) => {
          const utilPct = Math.round(((d.currentOutstandingBalance || 0) / (d.creditLimit || 1)) * 100);
          const isSelected = selectedIds.includes(d.id);
          return (
            <div
              key={d.id}
              className={`p-5 rounded-xl border transition-all ${
                isSelected
                  ? "border-teal-500 bg-teal-50/20 dark:bg-teal-950/20"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              } shadow-sm flex flex-col justify-between hover:border-teal-500/50 text-xs space-y-4`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelect(d.id)}
                      className="w-4 h-4 mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                    />
                    <div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                        {d.city} Region
                      </span>
                      <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm mt-1">
                        {d.name}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-medium">{d.territory}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setDeletingDistributor(d)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                      title="Delete Distributor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-teal-600 shrink-0">
                      <Truck className="w-4 h-4" />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Owner / Contact:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{d.contactPerson}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone / WhatsApp:</span>
                    <span className="font-bold font-mono text-slate-700 dark:text-slate-300">
                      {d.phone}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Discount / Margin:</span>
                    <span className="font-bold text-emerald-600">{d.marginPercentage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Time:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {d.creditTermsDays} Days
                    </span>
                  </div>
                </div>

                {/* Credit Meter */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Remaining Udhaar / Limit:</span>
                    <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                      {formatPKR(d.currentOutstandingBalance)} / {formatPKR(d.creditLimit)}
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        utilPct > 90
                          ? "bg-rose-500"
                          : utilPct > 70
                          ? "bg-amber-500"
                          : "bg-teal-500"
                      }`}
                      style={{ width: `${Math.min(100, utilPct)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <Link
                  href={`/customers/detail?id=${encodeURIComponent(d.id)}`}
                  className="font-bold text-teal-600 hover:underline flex items-center gap-1"
                >
                  View Khata <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href={`/sales/invoices/new?customerId=${d.id}`}
                  className="px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100"
                >
                  Make Bill
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Add New Wholesale Distributor
              </h2>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddDistributor} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Distributor Business Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Faisalabad Medix Logistics"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Contact Person *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Asad Ullah"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Phone *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Territory / Area
                  </label>
                  <input
                    type="text"
                    value={territory}
                    onChange={(e) => setTerritory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Udhaar Limit (PKR)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={creditLimit === 0 ? "" : creditLimit}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCreditLimit(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Payment Time (Days)
                  </label>
                  <input
                    type="number"
                    placeholder="30"
                    value={creditTermsDays === 0 ? "" : creditTermsDays}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setCreditTermsDays(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Margin / Discount %
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="10"
                    value={marginPercentage === 0 ? "" : marginPercentage}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setMarginPercentage(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Distributor (Dealer)
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        entityName="Wholesale Distributors"
        selectedCount={selectedIds.length}
        totalCount={distributors.length}
        countsByScope={scopeCounts}
        onConfirmDelete={handleExecuteBulkDelete}
        isDeleting={isDeleting}
      />

      {/* Single Delete Modal */}
      <SingleDeleteModal
        isOpen={!!deletingDistributor}
        onClose={() => setDeletingDistributor(null)}
        itemName={deletingDistributor?.name || ""}
        title="Delete Wholesale Distributor"
        onConfirm={handleExecuteSingleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
