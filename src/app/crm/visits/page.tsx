"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  MapPin,
  Plus,
  ArrowLeft,
  Calendar,
  User,
  Edit3,
  Trash2,
  History,
  Clock,
  X,
  Search,
  Pill,
  CheckCircle2,
  AlertTriangle,
  Eye,
  ArrowRight,
  Building2,
} from "lucide-react";
import { formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import {
  normalizeUserDisplayName,
  type CustomerVisit,
  type VisitEditHistoryEntry,
  type VisitFieldDiff,
  type Customer,
  type Product,
} from "@/types";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
} from "@/lib/dateFilter";

type PlaceType = "pharmacy" | "clinic" | "distributor" | "hospital";
type InterestType = "high" | "medium" | "low" | "none";

function formatPlaceType(type?: string): string {
  if (type === "clinic" || type === "hospital") return "Clinic / Hospital";
  if (type === "pharmacy") return "Medical Store / Pharmacy";
  if (type === "distributor") return "Wholesale Distributor";
  return "Medical Store";
}

function formatInterestLabel(level?: string): string {
  if (level === "high") return "High (Ready to Order)";
  if (level === "medium") return "Medium (Follow-up Needed)";
  if (level === "low") return "Low (Not Interested Now)";
  return "None";
}

function toDateInputValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function toDateTimeLocalValue(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function CustomerVisitsPage() {
  const { selectedCategoryId } = useCategory();
  const { currentUser } = useAuth();

  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create form toggle
  const [isAdding, setIsAdding] = useState(false);

  // Modals for Viewing (with Full Edit History), Editing, and Deleting
  const [viewingVisit, setViewingVisit] = useState<CustomerVisit | null>(null);
  const [editingVisit, setEditingVisit] = useState<CustomerVisit | null>(null);
  const [deletingVisit, setDeletingVisit] = useState<CustomerVisit | null>(null);

  // New Visit Form State
  const [selectedCustId, setSelectedCustId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [organizationType, setOrganizationType] = useState<PlaceType>("clinic");
  const [contactPerson, setContactPerson] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [productsDiscussed, setProductsDiscussed] = useState("");
  const [selectedProdToAdd, setSelectedProdToAdd] = useState("");
  const [interestLevel, setInterestLevel] = useState<InterestType>("high");
  const [competitorIntel, setCompetitorIntel] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  // Edit Visit Form State
  const [editCustId, setEditCustId] = useState("");
  const [editCustomerName, setEditCustomerName] = useState("");
  const [editOrganizationType, setEditOrganizationType] = useState<PlaceType>("clinic");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editVisitDateTime, setEditVisitDateTime] = useState("");
  const [editVisitNotes, setEditVisitNotes] = useState("");
  const [editProductsDiscussed, setEditProductsDiscussed] = useState("");
  const [editProdToAdd, setEditProdToAdd] = useState("");
  const [editInterestLevel, setEditInterestLevel] = useState<InterestType>("high");
  const [editCompetitorIntel, setEditCompetitorIntel] = useState("");
  const [editFollowUpDate, setEditFollowUpDate] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToast({ text, type });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  const refreshVisits = useCallback(async () => {
    try {
      const [list, custList, prodList] = await Promise.all([
        offlineDb.customerVisits.toArray(),
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
      ]);

      setCustomers(custList);
      setProducts(prodList);
      const sorted = [...list].sort(
        (a, b) =>
          new Date(b.updatedAt || b.visitDate).getTime() -
          new Date(a.updatedAt || a.visitDate).getTime()
      );
      setVisits(sorted);

      setViewingVisit((prev) => {
        if (!prev) return null;
        return sorted.find((x) => x.id === prev.id) || null;
      });
    } catch (err) {
      console.warn("Could not load visits:", err);
    }
  }, []);

  useEffect(() => {
    refreshVisits();
    const handleSync = () => {
      refreshVisits();
    };
    window.addEventListener("noxderma-cloud-synced", handleSync);
    return () => window.removeEventListener("noxderma-cloud-synced", handleSync);
  }, [refreshVisits]);

  const actorId = currentUser?.id || "usr_admin";
  const actorName = normalizeUserDisplayName(
    currentUser?.displayName,
    currentUser?.role === "owner" || currentUser?.role === "admin"
      ? "Owner"
      : currentUser?.email || "Owner"
  );
  const actorRole = currentUser?.role === "admin" ? "owner" : currentUser?.role || "owner";

  const availableProducts = useMemo(
    () =>
      selectedCategoryId === "all"
        ? products
        : products.filter((p) => p.categoryId === selectedCategoryId),
    [products, selectedCategoryId]
  );

  const filteredVisits = useMemo(() => {
    return visits.filter((v) => {
      if (!isRecordInDateRange(v.visitDate || v.createdAt, dateFilter)) {
        return false;
      }
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const meds = (v.productsDiscussed || []).join(" ").toLowerCase();
      return (
        v.customerName.toLowerCase().includes(q) ||
        v.contactPerson.toLowerCase().includes(q) ||
        (v.employeeName || "").toLowerCase().includes(q) ||
        (v.visitNotes || "").toLowerCase().includes(q) ||
        (v.competitorProducts || "").toLowerCase().includes(q) ||
        meds.includes(q)
      );
    });
  }, [visits, searchQuery, dateFilter]);

  // =========================================================================
  // CREATE VISIT (+ DETAILED AUDIT LOG WITH UNDO)
  // =========================================================================
  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanShop = customerName.trim();
    const cleanContact = contactPerson.trim();
    if (!cleanShop || !cleanContact) {
      showToast("Please enter both Shop/Clinic Name and Doctor/Owner Name.", "error");
      return;
    }

    const nowIso = new Date().toISOString();
    const parsedMeds = productsDiscussed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const newVisit: CustomerVisit = {
      id: `visit_${Date.now()}`,
      customerId: selectedCustId || undefined,
      customerName: cleanShop,
      organizationType,
      contactPerson: cleanContact,
      employeeId: actorId,
      employeeName: actorName,
      visitDate: nowIso,
      visitNotes: visitNotes.trim(),
      productsDiscussed: parsedMeds,
      productInterestLevel: interestLevel,
      competitorProducts: competitorIntel.trim() || undefined,
      followUpDate: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      createdAt: nowIso,
      editCount: 0,
      editHistory: [],
    };

    await offlineDb.customerVisits.put(newVisit);

    const medsLabel = parsedMeds.length > 0 ? parsedMeds.join(", ") : "None listed";
    const followUpLabel = newVisit.followUpDate
      ? ` | Next Follow-Up: ${formatKarachiDate(newVisit.followUpDate)}`
      : "";
    const competitorLabel = newVisit.competitorProducts
      ? ` | Competitor Info: "${newVisit.competitorProducts}"`
      : "";

    await recordActivity({
      userId: actorId,
      userName: actorName,
      userRole: actorRole,
      userEmail: currentUser?.email,
      action: "create",
      entityType: "visit",
      entityId: newVisit.id,
      entityTitle: `Visit: ${newVisit.customerName} (${newVisit.contactPerson})`,
      details: `Created visit record for "${newVisit.customerName}" (${formatPlaceType(
        newVisit.organizationType
      )}) | Doctor/Contact: ${newVisit.contactPerson} | Recorded By: ${actorName} | Visit Time: ${formatKarachiDate(
        newVisit.visitDate,
        true
      )} | Interest: ${formatInterestLabel(
        newVisit.productInterestLevel
      )} | Medicines Discussed: ${medsLabel} | Notes: "${
        newVisit.visitNotes || "No notes"
      }"${competitorLabel}${followUpLabel}`,
      snapshotAfter: newVisit,
      canUndo: true,
      timestamp: nowIso,
    });

    await refreshVisits();
    setIsAdding(false);
    setSelectedCustId("");
    setCustomerName("");
    setContactPerson("");
    setVisitNotes("");
    setProductsDiscussed("");
    setSelectedProdToAdd("");
    setCompetitorIntel("");
    setFollowUpDate("");
    showToast(`Visit to "${newVisit.customerName}" saved and recorded in Audit Logs.`);
  };

  // =========================================================================
  // OPEN EDIT MODAL FOR ANY SAVED VISIT
  // =========================================================================
  const openEditModal = (visit: CustomerVisit, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingVisit(visit);
    setEditCustId(visit.customerId || "");
    setEditCustomerName(visit.customerName);
    setEditOrganizationType(visit.organizationType || "clinic");
    setEditContactPerson(visit.contactPerson);
    setEditVisitDateTime(toDateTimeLocalValue(visit.visitDate));
    setEditVisitNotes(visit.visitNotes || "");
    setEditProductsDiscussed((visit.productsDiscussed || []).filter(Boolean).join(", "));
    setEditProdToAdd("");
    setEditInterestLevel(visit.productInterestLevel || "high");
    setEditCompetitorIntel(visit.competitorProducts || "");
    setEditFollowUpDate(toDateInputValue(visit.followUpDate));
  };

  // =========================================================================
  // SAVE EDITED VISIT (+ STAMP EDITED TIME, APPEND EDIT HISTORY & AUDIT LOG)
  // =========================================================================
  const handleSaveEditedVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVisit) return;

    const cleanShop = editCustomerName.trim();
    const cleanContact = editContactPerson.trim();
    if (!cleanShop || !cleanContact) {
      showToast("Shop/Clinic Name and Doctor/Owner Name are required.", "error");
      return;
    }

    setIsSavingEdit(true);
    try {
      const nowIso = new Date().toISOString();
      const parsedNewVisitDate = editVisitDateTime
        ? new Date(editVisitDateTime).toISOString()
        : editingVisit.visitDate;
      const newMeds = editProductsDiscussed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const newNotes = editVisitNotes.trim();
      const newComp = editCompetitorIntel.trim();
      const newFollowUpIso = editFollowUpDate
        ? new Date(editFollowUpDate).toISOString()
        : undefined;

      // Compute field-by-field diff for full edit history & detailed audit log
      const diffs: VisitFieldDiff[] = [];

      if (editingVisit.customerName.trim() !== cleanShop) {
        diffs.push({
          field: "customerName",
          label: "Shop / Clinic Name",
          before: editingVisit.customerName || "—",
          after: cleanShop,
        });
      }

      if (editingVisit.contactPerson.trim() !== cleanContact) {
        diffs.push({
          field: "contactPerson",
          label: "Doctor / Owner Name",
          before: editingVisit.contactPerson || "—",
          after: cleanContact,
        });
      }

      if (editingVisit.organizationType !== editOrganizationType) {
        diffs.push({
          field: "organizationType",
          label: "Place Type",
          before: formatPlaceType(editingVisit.organizationType),
          after: formatPlaceType(editOrganizationType),
        });
      }

      if (
        toDateTimeLocalValue(editingVisit.visitDate) !==
        toDateTimeLocalValue(parsedNewVisitDate)
      ) {
        diffs.push({
          field: "visitDate",
          label: "Visit Date & Time",
          before: formatKarachiDate(editingVisit.visitDate, true),
          after: formatKarachiDate(parsedNewVisitDate, true),
        });
      }

      const oldMedsJoined = (editingVisit.productsDiscussed || []).filter(Boolean).join(", ");
      const newMedsJoined = newMeds.join(", ");
      if (oldMedsJoined !== newMedsJoined) {
        diffs.push({
          field: "productsDiscussed",
          label: "Medicines Discussed",
          before: oldMedsJoined || "None",
          after: newMedsJoined || "None",
        });
      }

      if (editingVisit.productInterestLevel !== editInterestLevel) {
        diffs.push({
          field: "productInterestLevel",
          label: "Interest Level",
          before: formatInterestLabel(editingVisit.productInterestLevel),
          after: formatInterestLabel(editInterestLevel),
        });
      }

      const oldFollowDate = toDateInputValue(editingVisit.followUpDate);
      const newFollowDate = toDateInputValue(newFollowUpIso);
      if (oldFollowDate !== newFollowDate) {
        diffs.push({
          field: "followUpDate",
          label: "Next Visit / Follow-Up Date",
          before: editingVisit.followUpDate
            ? formatKarachiDate(editingVisit.followUpDate)
            : "Not set",
          after: newFollowUpIso ? formatKarachiDate(newFollowUpIso) : "Not set",
        });
      }

      if ((editingVisit.visitNotes || "").trim() !== newNotes) {
        diffs.push({
          field: "visitNotes",
          label: "Visit Notes",
          before: (editingVisit.visitNotes || "").trim() || "Empty",
          after: newNotes || "Empty",
        });
      }

      if ((editingVisit.competitorProducts || "").trim() !== newComp) {
        diffs.push({
          field: "competitorProducts",
          label: "Other Brands / Competitor Info",
          before: (editingVisit.competitorProducts || "").trim() || "None",
          after: newComp || "None",
        });
      }

      if (diffs.length === 0) {
        setEditingVisit(null);
        showToast("No changes were made to this visit.");
        return;
      }

      const changeSummary = diffs
        .map((d) => `${d.label}: "${d.before}" → "${d.after}"`)
        .join(" | ");

      const prevHistory = Array.isArray(editingVisit.editHistory)
        ? editingVisit.editHistory
        : [];

      const historyEntry: VisitEditHistoryEntry = {
        id: `vedit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        editedAt: nowIso,
        editedById: actorId,
        editedByName: actorName,
        editedByRole: actorRole,
        summary: changeSummary,
        changes: diffs,
      };

      const updatedVisit: CustomerVisit = {
        ...editingVisit,
        customerId: editCustId || undefined,
        customerName: cleanShop,
        organizationType: editOrganizationType,
        contactPerson: cleanContact,
        visitDate: parsedNewVisitDate,
        visitNotes: newNotes,
        productsDiscussed: newMeds,
        productInterestLevel: editInterestLevel,
        competitorProducts: newComp || undefined,
        followUpDate: newFollowUpIso,
        updatedAt: nowIso,
        lastEditedBy: actorName,
        lastEditedByRole: actorRole,
        editCount: prevHistory.length + 1,
        editHistory: [historyEntry, ...prevHistory],
      };

      await offlineDb.customerVisits.put(updatedVisit);

      await recordActivity({
        userId: actorId,
        userName: actorName,
        userRole: actorRole,
        userEmail: currentUser?.email,
        action: "update",
        entityType: "visit",
        entityId: updatedVisit.id,
        entityTitle: `Visit: ${updatedVisit.customerName} (${updatedVisit.contactPerson})`,
        details: `Edited visit "${updatedVisit.customerName}" (${
          updatedVisit.contactPerson
        }) on ${formatKarachiDate(nowIso, true)} by ${actorName} (${diffs.length} ${
          diffs.length === 1 ? "field" : "fields"
        } modified) — ${changeSummary}`,
        snapshotBefore: editingVisit,
        snapshotAfter: updatedVisit,
        canUndo: true,
        timestamp: nowIso,
      });

      await refreshVisits();
      if (viewingVisit?.id === updatedVisit.id) {
        setViewingVisit(updatedVisit);
      }
      setEditingVisit(null);
      showToast(`Visit updated (${diffs.length} change${diffs.length > 1 ? "s" : ""} recorded in history & Audit Logs).`);
    } catch (err: any) {
      console.error("Failed to save visit edit:", err);
      showToast("Could not update visit: " + (err?.message || "Unknown error"), "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // =========================================================================
  // DELETE SAVED VISIT (+ DETAILED AUDIT LOG WITH UNDO)
  // =========================================================================
  const handleConfirmDeleteVisit = async () => {
    if (!deletingVisit) return;
    setIsDeleting(true);
    try {
      const target = deletingVisit;
      const nowIso = new Date().toISOString();
      const medsJoined = (target.productsDiscussed || []).filter(Boolean).join(", ") || "None";
      const editsNote =
        target.editHistory && target.editHistory.length > 0
          ? ` | Prior Edits: ${target.editHistory.length} (Last edited ${formatKarachiDate(
              target.updatedAt || target.visitDate,
              true
            )})`
          : "";

      await offlineDb.customerVisits.delete(target.id);

      await recordActivity({
        userId: actorId,
        userName: actorName,
        userRole: actorRole,
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "visit",
        entityId: target.id,
        entityTitle: `Visit: ${target.customerName} (${target.contactPerson})`,
        details: `Deleted visit record for "${target.customerName}" (${formatPlaceType(
          target.organizationType
        )}) | Doctor/Contact: ${target.contactPerson} | Original Visit Time: ${formatKarachiDate(
          target.visitDate,
          true
        )} | Recorded By: ${normalizeUserDisplayName(
          target.employeeName,
          "Owner"
        )} | Interest: ${formatInterestLabel(
          target.productInterestLevel
        )} | Medicines: ${medsJoined} | Notes: "${
          target.visitNotes || "No notes"
        }"${editsNote}`,
        snapshotBefore: target,
        canUndo: true,
        timestamp: nowIso,
      });

      if (viewingVisit?.id === target.id) {
        setViewingVisit(null);
      }
      setDeletingVisit(null);
      await refreshVisits();
      showToast(`Visit to "${target.customerName}" deleted (can be restored via Undo in Audit Logs).`);
    } catch (err: any) {
      console.error("Delete visit error:", err);
      showToast("Failed to delete visit: " + (err?.message || "Unknown error"), "error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 pb-12 overflow-x-hidden">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`p-3.5 rounded-2xl border text-xs sm:text-sm flex items-center justify-between gap-3 animate-in fade-in ${
            toast.type === "success"
              ? "bg-teal-50 dark:bg-teal-950/70 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200"
              : "bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {toast.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold break-words">{toast.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-teal-600 shrink-0" />
            <span>Doctor &amp; Market Visits</span>
          </h1>
          <p className="text-xs md:text-sm text-slate-500 mt-0.5">
            Record doctor and pharmacy visits, tap any saved visit to inspect full edit history, or edit and delete anytime.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-teal-600/20 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{isAdding ? "Cancel" : "Add Visit Record"}</span>
        </button>
      </div>

      {/* Record New Visit Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateVisit}
          className="p-4 sm:p-5 rounded-2xl border border-teal-500/30 bg-teal-50/20 dark:bg-slate-900 shadow-sm space-y-4 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Record New Visit to Doctor or Medical Store
          </h2>

          {/* Saved Customer/Clinic Dropdown */}
          <div className="p-3 rounded-xl bg-teal-50/60 dark:bg-slate-800/60 border border-teal-200 dark:border-teal-800/50 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="font-bold text-teal-800 dark:text-teal-300">
                Choose Saved Customer / Clinic / Doctor (Optional Quick Auto-Fill)
              </label>
              <span className="text-[10px] text-slate-500">
                Pick from list OR type manually below
              </span>
            </div>
            <select
              value={selectedCustId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedCustId(id);
                const found = customers.find((c) => c.id === id);
                if (found) {
                  setCustomerName(found.name);
                  setContactPerson(found.contactPerson || found.name);
                  setOrganizationType(
                    found.category === "direct_clinic"
                      ? "clinic"
                      : found.category === "pharmacy"
                      ? "pharmacy"
                      : "distributor"
                  );
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
            >
              <option value="">-- Select Saved Doctor / Clinic / Pharmacy OR Type Below --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.contactPerson ? `(${c.contactPerson})` : ""} — {c.city}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Shop / Clinic Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. SkinCare Specialist Clinic"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Doctor / Owner Name *</label>
              <input
                type="text"
                required
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Dr. Ayesha Khan"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Type of Place</label>
              <select
                value={organizationType}
                onChange={(e) => setOrganizationType(e.target.value as PlaceType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="clinic">Clinic / Hospital</option>
                <option value="pharmacy">Medical Store / Pharmacy</option>
                <option value="distributor">Wholesale Distributor</option>
              </select>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="block font-semibold">
                Medicines Shown / Discussed (Select from catalog OR type comma-separated)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedProdToAdd}
                  onChange={(e) => {
                    const prodId = e.target.value;
                    setSelectedProdToAdd(prodId);
                    const prod = products.find((p) => p.id === prodId);
                    if (prod) {
                      const addition = `${prod.name} (${prod.packSize})`;
                      setProductsDiscussed((prev) => (prev ? `${prev}, ${addition}` : addition));
                    }
                  }}
                  className="sm:w-1/2 px-2.5 py-2 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs"
                >
                  <option value="">+ Pick Medicine to Add...</option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.packSize})
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={productsDiscussed}
                  onChange={(e) => setProductsDiscussed(e.target.value)}
                  placeholder="e.g. NoxDerm Cream, NoxAmox 500mg"
                  className="sm:w-1/2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">Interest Level</label>
              <select
                value={interestLevel}
                onChange={(e) => setInterestLevel(e.target.value as InterestType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-teal-600"
              >
                <option value="high">High (Ready to Order)</option>
                <option value="medium">Medium (Follow-up Needed)</option>
                <option value="low">Low (Not Interested Now)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Next Visit / Follow-Up Date</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Visit Notes &amp; Feedback</label>
              <textarea
                rows={2}
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
                placeholder="Doctor liked the cream, requested 2 samples, promised to prescribe..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="md:col-span-3">
              <label className="block font-semibold mb-1">
                Other Brands / Competitor Rates (Optional)
              </label>
              <textarea
                rows={2}
                value={competitorIntel}
                onChange={(e) => setCompetitorIntel(e.target.value)}
                placeholder="Competitor brands or market schemes noticed during visit..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-sm"
            >
              Save Visit
            </button>
          </div>
        </form>
      )}

      {/* Universal Date Filter Bar */}
      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={filteredVisits.length}
      />

      {/* Search & Count Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clinic, doctor, medicine, notes..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium">
          Showing <strong>{filteredVisits.length}</strong> saved{" "}
          {filteredVisits.length === 1 ? "visit" : "visits"} (Tap any visit to open details &amp; edit history)
        </span>
      </div>

      {/* Saved Visits Feed */}
      <div className="space-y-3">
        {filteredVisits.length === 0 ? (
          <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-2">
            <MapPin className="w-10 h-10 text-teal-600/40 mx-auto" />
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              No visit records found
            </p>
            <p className="text-xs text-slate-400">
              Click &ldquo;Add Visit Record&rdquo; above to log a doctor or medical store visit.
            </p>
          </div>
        ) : (
          filteredVisits.map((v) => {
            const historyCount = Array.isArray(v.editHistory)
              ? v.editHistory.length
              : v.editCount || 0;
            const wasEdited = Boolean(v.updatedAt) || historyCount > 0;
            const cleanMeds = (v.productsDiscussed || []).filter(Boolean);

            return (
              <div
                key={v.id}
                onClick={() => setViewingVisit(v)}
                className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-teal-500/60 bg-white dark:bg-slate-900 shadow-sm text-xs space-y-3 cursor-pointer transition-all"
              >
                {/* Top Header Row */}
                <div className="flex flex-col sm:flex-row justify-between items-start gap-2.5">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 break-words">
                        {v.customerName}
                      </h3>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                        {formatPlaceType(v.organizationType)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          v.productInterestLevel === "high"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                            : v.productInterestLevel === "medium"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                      >
                        Interest:{" "}
                        {v.productInterestLevel === "high"
                          ? "High (Ready)"
                          : v.productInterestLevel === "medium"
                          ? "Medium"
                          : "Low"}
                      </span>
                    </div>

                    <p className="text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>
                        Doctor / Contact:{" "}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {v.contactPerson}
                        </strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Visited By:{" "}
                        <strong className="text-slate-800 dark:text-slate-200">
                          {normalizeUserDisplayName(v.employeeName, "Owner")}
                        </strong>
                      </span>
                    </p>
                  </div>

                  {/* Action Buttons (View/History, Edit, Delete) */}
                  <div
                    className="flex flex-wrap items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => setViewingVisit(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px]"
                      title="Open visit details and full edit history"
                    >
                      <History className="w-3.5 h-3.5 text-teal-600" />
                      <span>{historyCount > 0 ? `History (${historyCount})` : "Details"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => openEditModal(v, e)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-300 font-bold text-[11px]"
                      title="Edit this visit"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingVisit(v)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/60 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 font-bold text-[11px]"
                      title="Delete this visit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                {/* Timestamps Banner: Visit Time + Prominent Edited Time Badge */}
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                    <Clock className="w-3 h-3 text-teal-600" />
                    Visited: <strong>{formatKarachiDate(v.visitDate, true)}</strong>
                  </span>

                  {wasEdited && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100/80 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800 font-bold">
                      <Edit3 className="w-3 h-3 text-amber-600 shrink-0" />
                      <span>
                        Edited: {formatKarachiDate(v.updatedAt || v.visitDate, true)}
                        {v.lastEditedBy ? ` by ${normalizeUserDisplayName(v.lastEditedBy, "Owner")}` : ""}
                        {historyCount > 0
                          ? ` (${historyCount} ${historyCount === 1 ? "edit" : "edits"})`
                          : ""}
                      </span>
                    </span>
                  )}
                </div>

                {/* Medicines Discussed Pills */}
                {cleanMeds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-500 inline-flex items-center gap-1 mr-1">
                      <Pill className="w-3 h-3 text-teal-600" /> Medicines:
                    </span>
                    {cleanMeds.map((med, idx) => (
                      <span
                        key={`${v.id}_med_${idx}`}
                        className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/60 text-[11px] font-semibold"
                      >
                        {med}
                      </span>
                    ))}
                  </div>
                )}

                {/* Visit Notes */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Visit Notes:</span>
                  <p className="text-slate-600 dark:text-slate-300 mt-1 break-words whitespace-pre-line">
                    {v.visitNotes || "No notes recorded."}
                  </p>
                </div>

                {/* Competitor & Follow-Up Footer */}
                {(v.competitorProducts || v.followUpDate) && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    {v.competitorProducts ? (
                      <div className="text-[11px] text-amber-700 dark:text-amber-300 break-words">
                        <strong>Other Brands:</strong> {v.competitorProducts}
                      </div>
                    ) : (
                      <span />
                    )}

                    {v.followUpDate && (
                      <div className="text-[11px] text-teal-600 dark:text-teal-400 flex items-center gap-1 font-semibold">
                        <Calendar className="w-3.5 h-3.5" />
                        Next Visit: {formatKarachiDate(v.followUpDate)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: VISIT DETAIL & COMPLETE EDIT HISTORY                             */}
      {/* ========================================================================= */}
      {viewingVisit && (
        <div
          className="fixed inset-0 !mt-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in"
          onClick={() => setViewingVisit(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                    {formatPlaceType(viewingVisit.organizationType)}
                  </span>
                  {viewingVisit.updatedAt && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                      Edited {viewingVisit.editHistory?.length || viewingVisit.editCount || 1}x
                    </span>
                  )}
                </div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 break-words">
                  {viewingVisit.customerName}
                </h2>
                <p className="text-xs text-slate-500">
                  Doctor / Contact: <strong>{viewingVisit.contactPerson}</strong>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewingVisit(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Current Visit Data + Complete Edit History Timeline */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 text-xs">
              {/* Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Visit Date &amp; Time
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {formatKarachiDate(viewingVisit.visitDate, true)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Originally Recorded By
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {normalizeUserDisplayName(viewingVisit.employeeName, "Owner")}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Interest Level
                  </span>
                  <span className="font-bold text-teal-600 dark:text-teal-400">
                    {formatInterestLabel(viewingVisit.productInterestLevel)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Next Follow-Up Date
                  </span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {viewingVisit.followUpDate
                      ? formatKarachiDate(viewingVisit.followUpDate)
                      : "Not scheduled"}
                  </span>
                </div>

                {viewingVisit.updatedAt && (
                  <div className="sm:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5" />
                      Last Edited: {formatKarachiDate(viewingVisit.updatedAt, true)}
                    </span>
                    {viewingVisit.lastEditedBy && (
                      <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        Edited by: <strong>{normalizeUserDisplayName(viewingVisit.lastEditedBy, "Owner")}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Medicines Discussed */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Medicines Shown / Discussed
                </span>
                {(viewingVisit.productsDiscussed || []).filter(Boolean).length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {(viewingVisit.productsDiscussed || [])
                      .filter(Boolean)
                      .map((m, i) => (
                        <span
                          key={i}
                          className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-semibold"
                        >
                          {m}
                        </span>
                      ))}
                  </div>
                ) : (
                  <p className="text-slate-400 italic">No specific medicines listed.</p>
                )}
              </div>

              {/* Visit Notes */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                  Visit Notes &amp; Doctor Feedback
                </span>
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-slate-700 dark:text-slate-200 leading-relaxed break-words whitespace-pre-line">
                  {viewingVisit.visitNotes || "No notes recorded."}
                </div>
              </div>

              {/* Competitor Intel */}
              {viewingVisit.competitorProducts && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-600 block">
                    Other Brands / Competitor Rates
                  </span>
                  <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 break-words">
                    {viewingVisit.competitorProducts}
                  </div>
                </div>
              )}

              {/* COMPLETE EDIT HISTORY TIMELINE */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-teal-600" />
                    <span>
                      Complete Visit Edit History (
                      {viewingVisit.editHistory?.length || 0}{" "}
                      {(viewingVisit.editHistory?.length || 0) === 1 ? "Edit" : "Edits"})
                    </span>
                  </h3>
                </div>

                {!viewingVisit.editHistory || viewingVisit.editHistory.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-slate-500 text-center">
                    No edits have been made to this visit yet. Original record created on{" "}
                    <strong>{formatKarachiDate(viewingVisit.createdAt || viewingVisit.visitDate, true)}</strong>.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {viewingVisit.editHistory.map((entry, idx) => {
                      const editNumber = viewingVisit.editHistory!.length - idx;
                      return (
                        <div
                          key={entry.id || idx}
                          className="p-3.5 rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/20 space-y-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-amber-200/60 dark:border-amber-800/50">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-black text-[10px] uppercase">
                                Edit #{editNumber}
                              </span>
                              <span className="font-bold text-slate-900 dark:text-slate-100">
                                {normalizeUserDisplayName(entry.editedByName, "Owner")}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                              {formatKarachiDate(entry.editedAt, true)}
                            </span>
                          </div>

                          <div className="space-y-2">
                            {entry.changes.map((chg, cIdx) => (
                              <div
                                key={cIdx}
                                className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1"
                              >
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">
                                  {chg.label}
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                  <div className="p-2 rounded bg-rose-50/70 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 break-words">
                                    <span className="font-bold uppercase text-[9px] block opacity-75">
                                      Before:
                                    </span>
                                    {chg.before}
                                  </div>
                                  <div className="p-2 rounded bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 font-semibold break-words">
                                    <span className="font-bold uppercase text-[9px] block opacity-75">
                                      After:
                                    </span>
                                    {chg.after}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Original Creation Anchor */}
                    <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span>
                        <strong>Original Visit Created</strong> by{" "}
                        {normalizeUserDisplayName(viewingVisit.employeeName, "Owner")}
                      </span>
                      <span className="font-mono">
                        {formatKarachiDate(viewingVisit.createdAt || viewingVisit.visitDate, true)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setDeletingVisit(viewingVisit)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-bold text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Visit</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditModal(viewingVisit)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Visit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingVisit(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: EDIT SAVED VISIT                                                 */}
      {/* ========================================================================= */}
      {editingVisit && (
        <div
          className="fixed inset-0 !mt-0 z-[110] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in"
          onClick={() => setEditingVisit(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-amber-500" />
                  <span>Edit Saved Visit</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Every change is stamped with edit time and saved to Visit Edit History &amp; Audit Logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingVisit(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSaveEditedVisit}
              className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Link to Saved Customer / Clinic (Optional)
                </label>
                <select
                  value={editCustId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setEditCustId(id);
                    const found = customers.find((c) => c.id === id);
                    if (found) {
                      setEditCustomerName(found.name);
                      setEditContactPerson(found.contactPerson || found.name);
                      setEditOrganizationType(
                        found.category === "direct_clinic"
                          ? "clinic"
                          : found.category === "pharmacy"
                          ? "pharmacy"
                          : "distributor"
                      );
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
                >
                  <option value="">-- Custom / Unlinked --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.contactPerson ? `(${c.contactPerson})` : ""} — {c.city}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Shop / Clinic Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editCustomerName}
                    onChange={(e) => setEditCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Doctor / Owner Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editContactPerson}
                    onChange={(e) => setEditContactPerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Type of Place
                  </label>
                  <select
                    value={editOrganizationType}
                    onChange={(e) => setEditOrganizationType(e.target.value as PlaceType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="clinic">Clinic / Hospital</option>
                    <option value="pharmacy">Medical Store / Pharmacy</option>
                    <option value="distributor">Wholesale Distributor</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Visit Date &amp; Time
                  </label>
                  <input
                    type="datetime-local"
                    value={editVisitDateTime}
                    onChange={(e) => setEditVisitDateTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Interest Level
                  </label>
                  <select
                    value={editInterestLevel}
                    onChange={(e) => setEditInterestLevel(e.target.value as InterestType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-teal-600"
                  >
                    <option value="high">High (Ready to Order)</option>
                    <option value="medium">Medium (Follow-up Needed)</option>
                    <option value="low">Low (Not Interested Now)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Next Visit / Follow-Up Date
                  </label>
                  <input
                    type="date"
                    value={editFollowUpDate}
                    onChange={(e) => setEditFollowUpDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  Medicines Shown / Discussed
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={editProdToAdd}
                    onChange={(e) => {
                      const prodId = e.target.value;
                      setEditProdToAdd(prodId);
                      const prod = products.find((p) => p.id === prodId);
                      if (prod) {
                        const addition = `${prod.name} (${prod.packSize})`;
                        setEditProductsDiscussed((prev) =>
                          prev ? `${prev}, ${addition}` : addition
                        );
                      }
                    }}
                    className="sm:w-1/2 px-2.5 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="">+ Add Medicine from Catalog...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.packSize})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={editProductsDiscussed}
                    onChange={(e) => setEditProductsDiscussed(e.target.value)}
                    placeholder="Comma-separated medicine names"
                    className="sm:w-1/2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Visit Notes &amp; Feedback
                </label>
                <textarea
                  rows={3}
                  value={editVisitNotes}
                  onChange={(e) => setEditVisitNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Other Brands / Competitor Info
                </label>
                <textarea
                  rows={2}
                  value={editCompetitorIntel}
                  onChange={(e) => setEditCompetitorIntel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingVisit(null)}
                  disabled={isSavingEdit}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md disabled:opacity-50"
                >
                  {isSavingEdit ? "Saving Changes..." : "Save Edited Visit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DELETE VISIT CONFIRMATION                                        */}
      {/* ========================================================================= */}
      {deletingVisit && (
        <div
          className="fixed inset-0 !mt-0 z-[120] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setDeletingVisit(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Delete This Visit?
                  </h3>
                  <p className="text-slate-500">
                    This visit will be removed and logged in Audit Logs (with Undo support).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeletingVisit(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/60 space-y-1">
              <p className="font-extrabold text-sm text-slate-900 dark:text-slate-100 break-words">
                {deletingVisit.customerName}
              </p>
              <p className="text-slate-600 dark:text-slate-300">
                Doctor / Contact: <strong>{deletingVisit.contactPerson}</strong>
              </p>
              <p className="text-slate-500 font-mono text-[11px]">
                Visited: {formatKarachiDate(deletingVisit.visitDate, true)}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingVisit(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteVisit}
                disabled={isDeleting}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-sm disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
