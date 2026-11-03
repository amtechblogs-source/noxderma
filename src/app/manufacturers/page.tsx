"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Factory,
  Plus,
  ArrowLeft,
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Building,
  Search,
  Filter,
  Edit2,
  Trash2,
  CheckCircle2,
  X,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { formatPKR } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { db as firestoreDb } from "@/lib/firebase/config";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import {
  scheduleCloudUpsert,
  scheduleCloudDelete,
  sanitizeForFirestore,
} from "@/lib/offline/cloudSync";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import {
  computeDateScopeCounts,
  getItemsInScope,
} from "@/lib/dateFilter";
import {
  BulkDeleteModal,
  SingleDeleteModal,
  type DeleteScopeType,
} from "@/components/common/BulkDeleteModal";

export interface Manufacturer {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  address: string;
  paymentTermsDays: number;
  payableBalance: number;
  status: "active" | "inactive";
  createdAt?: string;
  updatedAt?: string;
}

export default function ManufacturersPage() {
  const { currentUser } = useAuth();
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  // Selection & Bulk Action
  const [selectedMfrIds, setSelectedMfrIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingMfr, setDeletingMfr] = useState<Manufacturer | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Add Modal / Form State
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [terms, setTerms] = useState(30);
  const [status, setStatus] = useState<"active" | "inactive">("active");

  // Edit Modal State
  const [editingMfr, setEditingMfr] = useState<Manufacturer | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editWhatsappNumber, setEditWhatsappNumber] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editTerms, setEditTerms] = useState(30);
  const [editStatus, setEditStatus] = useState<"active" | "inactive">("active");

  const loadManufacturers = async () => {
    try {
      const list = await offlineDb.manufacturers.toArray();
      setManufacturers(list || []);
    } catch (e) {
      console.warn("Could not load manufacturers:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadManufacturers();
    let syncTimer: any = null;
    const handleSync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        loadManufacturers();
      }, 300);
    };
    window.addEventListener("noxderma-cloud-synced", handleSync);
    return () => {
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener("noxderma-cloud-synced", handleSync);
    };
  }, []);

  // Filtered List
  const filteredManufacturers = useMemo(() => {
    return manufacturers.filter((m) => {
      const matchesStatus = statusFilter === "all" || m.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.contactPerson && m.contactPerson.toLowerCase().includes(q)) ||
        (m.phone && m.phone.toLowerCase().includes(q)) ||
        (m.address && m.address.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [manufacturers, statusFilter, search]);

  // Scope counts for BulkDeleteModal
  const scopeCounts = useMemo(() => {
    return computeDateScopeCounts(
      manufacturers,
      (m) => m.createdAt || m.id,
      selectedMfrIds.length
    );
  }, [manufacturers, selectedMfrIds.length]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedMfrIds.length === filteredManufacturers.length && filteredManufacturers.length > 0) {
      setSelectedMfrIds([]);
    } else {
      setSelectedMfrIds(filteredManufacturers.map((m) => m.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedMfrIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Create Manufacturer
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      alert("Company Name aur Phone Number likhna zaroori hai.");
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const newMfr: Manufacturer = {
        id: `mfr_${Date.now()}`,
        name: name.trim(),
        contactPerson: contactPerson.trim() || name.trim(),
        phone: phone.trim(),
        whatsappNumber: whatsappNumber.trim() || phone.trim(),
        email: email.trim(),
        address: address.trim(),
        paymentTermsDays: Number(terms) || 30,
        payableBalance: 0,
        status,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await offlineDb.manufacturers.put(newMfr);

      try {
        await setDoc(doc(firestoreDb, "manufacturers", newMfr.id), sanitizeForFirestore(newMfr), { merge: true });
      } catch {
        scheduleCloudUpsert("manufacturers", newMfr.id, newMfr);
      }

      setManufacturers((prev) => [newMfr, ...prev]);

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "create",
        entityType: "manufacturer",
        entityId: newMfr.id,
        entityTitle: newMfr.name,
        details: `Added new medicine company/manufacturer: ${newMfr.name}`,
        snapshotAfter: newMfr,
      });

      setIsAdding(false);
      setName("");
      setContactPerson("");
      setPhone("");
      setWhatsappNumber("");
      setEmail("");
      setAddress("");
      setTerms(30);
      setStatus("active");
    } catch (err: any) {
      console.error("Create manufacturer error:", err);
      alert("Company save karne mein masla aaya: " + (err?.message || ""));
    } finally {
      setIsSaving(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (m: Manufacturer) => {
    setEditingMfr(m);
    setEditName(m.name);
    setEditContactPerson(m.contactPerson || "");
    setEditPhone(m.phone || "");
    setEditWhatsappNumber(m.whatsappNumber || "");
    setEditEmail(m.email || "");
    setEditAddress(m.address || "");
    setEditTerms(m.paymentTermsDays || 30);
    setEditStatus(m.status || "active");
    setIsEditModalOpen(true);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMfr) return;
    if (!editName.trim() || !editPhone.trim()) {
      alert("Company Name aur Phone Number likhna zaroori hai.");
      return;
    }

    setIsSaving(true);
    try {
      const nowIso = new Date().toISOString();
      const updated: Manufacturer = {
        ...editingMfr,
        name: editName.trim(),
        contactPerson: editContactPerson.trim() || editName.trim(),
        phone: editPhone.trim(),
        whatsappNumber: editWhatsappNumber.trim() || editPhone.trim(),
        email: editEmail.trim(),
        address: editAddress.trim(),
        paymentTermsDays: Number(editTerms) || 30,
        status: editStatus,
        updatedAt: nowIso,
      };

      await offlineDb.manufacturers.put(updated);

      try {
        await setDoc(doc(firestoreDb, "manufacturers", updated.id), sanitizeForFirestore(updated), { merge: true });
      } catch {
        scheduleCloudUpsert("manufacturers", updated.id, updated);
      }

      setManufacturers((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "update",
        entityType: "manufacturer",
        entityId: updated.id,
        entityTitle: updated.name,
        details: `Updated company details for: ${updated.name}`,
        snapshotAfter: updated,
      });

      setIsEditModalOpen(false);
      setEditingMfr(null);
    } catch (err: any) {
      console.error("Save edit manufacturer error:", err);
      alert("Company update karne mein masla aaya: " + (err?.message || ""));
    } finally {
      setIsSaving(false);
    }
  };

  // Single Delete
  const handleExecuteSingleDelete = async () => {
    if (!deletingMfr) return;
    const targetId = deletingMfr.id;
    const targetMfr = deletingMfr;
    try {
      setIsDeleting(true);
      await offlineDb.manufacturers.delete(targetId);

      try {
        await deleteDoc(doc(firestoreDb, "manufacturers", targetId));
      } catch {
        scheduleCloudDelete("manufacturers", targetId);
      }

      setManufacturers((prev) => prev.filter((m) => m.id !== targetId));
      setSelectedMfrIds((prev) => prev.filter((id) => id !== targetId));

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "delete",
        entityType: "manufacturer",
        entityId: targetId,
        entityTitle: targetMfr.name,
        details: `Deleted medicine manufacturer/company: ${targetMfr.name}`,
        snapshotBefore: targetMfr,
      });

      setDeletingMfr(null);
    } catch (err: any) {
      console.error("Delete manufacturer error:", err);
      alert("Delete failed: " + (err?.message || ""));
    } finally {
      setIsDeleting(false);
    }
  };

  // Bulk Delete
  const handleExecuteBulkDelete = async (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => {
    try {
      setIsDeleting(true);
      const toDelete = getItemsInScope(
        manufacturers,
        scope,
        (m) => m.createdAt || m.id,
        (m) => m.id,
        selectedMfrIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        alert("No matching companies found to delete.");
        setDeleteModalOpen(false);
        return;
      }

      const ids = toDelete.map((m) => m.id);
      await offlineDb.manufacturers.bulkDelete(ids);

      await Promise.allSettled(
        ids.map(async (id) => {
          try {
            await deleteDoc(doc(firestoreDb, "manufacturers", id));
          } catch {
            scheduleCloudDelete("manufacturers", id);
          }
        })
      );

      setManufacturers((prev) => prev.filter((m) => !ids.includes(m.id)));
      setSelectedMfrIds((prev) => prev.filter((id) => !ids.includes(id)));

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "delete",
        entityType: "manufacturer",
        entityId: ids.slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} manufacturer(s)`,
        details: `Purged ${toDelete.length} companies under scope: ${scope}.`,
        snapshotBefore: toDelete,
      });

      setDeleteModalOpen(false);
    } catch (err: any) {
      console.error("Bulk delete manufacturers error:", err);
      alert("Bulk delete failed: " + (err?.message || ""));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Factory className="w-6 h-6 text-teal-600" />
            Medicine Companies (Manufacturers &amp; Suppliers)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Companies and factories from where you buy medicine stock.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-bold hover:bg-rose-100 transition-all shadow-sm"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            Delete / Purge
          </button>
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            {isAdding ? "Cancel" : "Add New Company"}
          </button>
        </div>
      </div>

      {/* Add Manufacturer Form (Inline Card) */}
      {isAdding && (
        <form
          onSubmit={handleCreate}
          className="p-5 md:p-6 rounded-2xl border-2 border-teal-500/30 bg-white dark:bg-slate-900 shadow-xl space-y-4 text-xs animate-in fade-in"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Add New Medicine Company / Supplier
            </h2>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Company Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GlaxoSmithKline Pakistan"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Manager / Contact Person Name</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Tariq Jamil"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Payment Time Allowed (Days)</label>
              <input
                type="number"
                placeholder="30"
                min={0}
                value={terms === 0 ? "" : terms}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTerms(raw === "" ? 0 : Number(raw) || 0);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+92 21 34567890"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">WhatsApp Number</label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="+92 300 1234567"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="supply@company.com"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Factory / Godown Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Plot / Sector, Industrial Area..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Company Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="active">Active (فعال)</option>
                <option value="inactive">Inactive (غیر فعال)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20 disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save Company (محفوظ کریں)"}
            </button>
          </div>
        </form>
      )}

      {/* Filter, Search & Selection Toolbar */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3 text-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search company, contact person, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === "all"
                  ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              All ({manufacturers.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === "active"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-1 rounded-lg transition-all ${
                statusFilter === "inactive"
                  ? "bg-slate-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400"
              }`}
            >
              Inactive
            </button>
          </div>
        </div>

        {/* Selection & Actions Bar */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={
                filteredManufacturers.length > 0 &&
                selectedMfrIds.length === filteredManufacturers.length
              }
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
            />
            <span>
              Select All {selectedMfrIds.length > 0 && `(${selectedMfrIds.length} selected)`}
            </span>
          </label>

          <div className="flex items-center gap-2">
            {selectedMfrIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-md shadow-rose-600/20 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Selected ({selectedMfrIds.length})
              </button>
            )}
            <span className="text-[11px] text-slate-400">
              Showing {filteredManufacturers.length} of {manufacturers.length} companies
            </span>
          </div>
        </div>
      </div>

      {/* Manufacturers List Grid */}
      {filteredManufacturers.length === 0 ? (
        <div className="p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400 space-y-2">
          <Factory className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="font-bold text-sm">Koi company mojood nahi hai.</p>
          <p className="text-xs">Upar &ldquo;Add New Company&rdquo; button par click kar ke nai medicine company add karein.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredManufacturers.map((m) => (
            <div
              key={m.id}
              className={`p-5 rounded-2xl border transition-all shadow-sm space-y-3 text-xs ${
                selectedMfrIds.includes(m.id)
                  ? "border-teal-400 bg-teal-50/40 dark:bg-teal-950/30 dark:border-teal-700"
                  : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={selectedMfrIds.includes(m.id)}
                    onChange={() => handleToggleSelect(m.id)}
                    className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                  />
                  <div>
                    <h3 className="font-black text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      {m.name}
                    </h3>
                    <p className="text-slate-500 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                      {m.address || "Address not provided"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      m.status === "active"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200/60"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {m.status === "active" ? "ACTIVE" : "INACTIVE"}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(m)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
                    title="Edit Company Details"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingMfr(m)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="Delete Company"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-[11px] border border-slate-100 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500">Contact Person / Manager:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {m.contactPerson || m.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Payment Terms Allowed:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {m.paymentTermsDays || 30} Days
                  </span>
                </div>
                <div className="flex justify-between text-indigo-600 dark:text-indigo-400 font-bold">
                  <span>Money We Owe (Hamara Dena / Baqaya):</span>
                  <span className="font-mono">{formatPKR(m.payableBalance || 0)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] flex-wrap gap-2">
                <span className="font-mono text-slate-500 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  {m.phone}
                </span>

                <div className="flex items-center gap-3">
                  <Link
                    href="/finance/ledgers/manufacturers"
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                  >
                    View Khata
                  </Link>

                  {m.whatsappNumber && (
                    <a
                      href={`https://wa.me/${m.whatsappNumber.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 font-bold hover:underline"
                    >
                      <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Modal */}
      {isEditModalOpen && editingMfr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-teal-600" />
                Edit Company Details ({editingMfr.name})
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingMfr(null);
                }}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={editContactPerson}
                    onChange={(e) => setEditContactPerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Payment Time Allowed (Days)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editTerms === 0 ? "" : editTerms}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setEditTerms(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    WhatsApp Number
                  </label>
                  <input
                    type="text"
                    value={editWhatsappNumber}
                    onChange={(e) => setEditWhatsappNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Factory / Godown Address
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as "active" | "inactive")}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                >
                  <option value="active">Active (فعال)</option>
                  <option value="inactive">Inactive (غیر فعال)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingMfr(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {isSaving ? "Saving..." : "Save Changes (تبدیلیاں محفوظ کریں)"}
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
        entityName="Medicine Companies"
        selectedCount={selectedMfrIds.length}
        totalCount={manufacturers.length}
        countsByScope={scopeCounts}
        onConfirmDelete={handleExecuteBulkDelete}
        isDeleting={isDeleting}
      />

      {/* Single Delete Modal */}
      <SingleDeleteModal
        isOpen={!!deletingMfr}
        onClose={() => setDeletingMfr(null)}
        title="Delete Medicine Company"
        itemName={deletingMfr ? `${deletingMfr.name} (${deletingMfr.phone})` : ""}
        onConfirm={handleExecuteSingleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
