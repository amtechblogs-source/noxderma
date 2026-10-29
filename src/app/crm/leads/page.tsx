"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Users2,
  Plus,
  ArrowLeft,
  Calendar,
  Building,
  Phone,
  MessageCircle,
  TrendingUp,
  X,
  CheckCircle2,
  ArrowRight,
  UserCheck,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import type { Lead, LeadPipelineStage, Customer } from "@/types";
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

const STAGES: { stage: LeadPipelineStage; label: string; color: string }[] = [
  { stage: "new", label: "New Inquiries", color: "border-sky-500" },
  { stage: "contacted", label: "Called / Spoken", color: "border-indigo-500" },
  { stage: "qualified", label: "Interested & Verified", color: "border-teal-500" },
  { stage: "follow_up", label: "Follow-Up (Rabta)", color: "border-amber-500" },
  { stage: "offer_sent", label: "Rates & Offer Sent", color: "border-purple-500" },
  { stage: "converted", label: "Became Customer", color: "border-emerald-500" },
];

export default function LeadsCrmPage() {
  const { currentUser } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));

  // Multi-Selection & Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingLead, setDeletingLead] = useState<Lead | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form State
  const [leadName, setLeadName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("Karachi");
  const [address, setAddress] = useState("");
  const [categoryName, setCategoryName] = useState("Pharmacy & Prescriptions");
  const [potentialPkr, setPotentialPkr] = useState<number>(50000);
  const [notes, setNotes] = useState("");
  const [followUpDays, setFollowUpDays] = useState<number>(3);

  const loadLeads = async () => {
    try {
      const list = await offlineDb.leads.toArray();
      setLeads(list);
    } catch (e) {
      console.warn("Could not load leads:", e);
    }
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leadName.trim() || !phone.trim()) return;

    const now = new Date();
    const followUpDate = new Date(now.getTime() + followUpDays * 24 * 3600 * 1000).toISOString();

    const newLead: Lead = {
      id: `lead_${Date.now()}`,
      leadName: leadName.trim(),
      organizationName: leadName.trim(),
      contactPerson: contactPerson.trim() || leadName.trim(),
      phone: phone.trim(),
      whatsappNumber: phone.trim(),
      city: city.trim(),
      address: address.trim(),
      leadSource: "direct_inquiry",
      interestedCategoryName: categoryName,
      assignedEmployeeId: currentUser?.id || "usr_admin",
      assignedEmployeeName: currentUser?.displayName || "Sales Team",
      status: "new",
      estimatedPotentialPkr: Number(potentialPkr) || 0,
      notes: notes.trim(),
      nextFollowUpDate: followUpDate,
      createdAt: now.toISOString(),
    };

    await offlineDb.leads.put(newLead);
    await recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      userEmail: currentUser?.email,
      action: "create",
      entityType: "crm_lead",
      entityId: newLead.id,
      entityTitle: newLead.leadName,
      details: `Created new client lead "${newLead.leadName}" (${newLead.city}).`,
      snapshotAfter: newLead,
      canUndo: true,
    });
    await loadLeads();
    setIsAdding(false);
    // Reset Form
    setLeadName("");
    setContactPerson("");
    setPhone("");
    setNotes("");
  };

  const handleStageChange = async (leadId: string, nextStage: LeadPipelineStage) => {
    await offlineDb.leads.update(leadId, {
      status: nextStage,
      lastContactedAt: new Date().toISOString(),
    });

    // If converting to customer, optionally create in customers table
    if (nextStage === "converted") {
      const targetLead = leads.find((l) => l.id === leadId);
      if (targetLead) {
        const existingCust = await offlineDb.customers.get(`cust_${targetLead.id}`);
        if (!existingCust) {
          const newCust: Customer = {
            id: `cust_${targetLead.id}`,
            name: targetLead.leadName,
            businessName: targetLead.organizationName || targetLead.leadName,
            category: "pharmacy",
            contactPerson: targetLead.contactPerson,
            phone: targetLead.phone,
            whatsappNumber: targetLead.whatsappNumber,
            address: targetLead.address || "Commercial Area",
            city: targetLead.city,
            creditLimit: 100000,
            creditTermsDays: 30,
            currentOutstandingBalance: 0,
            status: "active",
            notes: `Converted from lead: ${targetLead.notes || ""}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await offlineDb.customers.put(newCust);
        }
      }
    }

    await loadLeads();
  };

  const filteredLeads = useMemo(() => {
    return leads.filter((l) =>
      isRecordInDateRange(l.createdAt || l.lastContactedAt, dateFilter)
    );
  }, [leads, dateFilter]);

  const scopeCounts = useMemo(() => {
    return computeDateScopeCounts(
      leads,
      (l) => l.createdAt || l.lastContactedAt,
      selectedIds.length
    );
  }, [leads, selectedIds.length]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filteredLeads.length && filteredLeads.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredLeads.map((l) => l.id));
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
        leads,
        scope,
        (l) => l.createdAt || l.lastContactedAt,
        (l) => l.id,
        selectedIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        setNotice({ type: "error", text: "No matching leads found to delete." });
        setIsDeleting(false);
        setDeleteModalOpen(false);
        return;
      }

      const idsToDelete = toDelete.map((l) => l.id);
      await offlineDb.leads.bulkDelete(idsToDelete);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "crm_lead",
        entityId: idsToDelete.slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} client lead(s)`,
        details: `Purged ${toDelete.length} lead(s) under criteria scope: ${scope}.`,
        snapshotBefore: toDelete,
        canUndo: false,
      });

      setSelectedIds([]);
      await loadLeads();
      setDeleteModalOpen(false);
      setNotice({
        type: "success",
        text: `Successfully deleted ${toDelete.length} lead(s).`,
      });
    } catch (err: any) {
      console.error("Bulk delete leads failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete leads." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteSingleDelete = async () => {
    if (!deletingLead) return;
    try {
      setIsDeleting(true);
      await offlineDb.leads.delete(deletingLead.id);
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "crm_lead",
        entityId: deletingLead.id,
        entityTitle: deletingLead.leadName,
        details: `Deleted client lead "${deletingLead.leadName}" (${deletingLead.city || ""}).`,
        snapshotBefore: deletingLead,
        canUndo: true,
      });
      setSelectedIds((prev) => prev.filter((id) => id !== deletingLead.id));
      await loadLeads();
      setDeletingLead(null);
      setNotice({
        type: "success",
        text: `Deleted lead "${deletingLead.leadName}".`,
      });
    } catch (err: any) {
      console.error("Single delete lead failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete lead." });
    } finally {
      setIsDeleting(false);
    }
  };

  const totalPipelineValue = filteredLeads.reduce((sum, l) => sum + (l.estimatedPotentialPkr || 0), 0);

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

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users2 className="w-6 h-6 text-teal-600" />
            New Client Inquiries & Potential Buyers (Leads)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Track new medical stores and clinics who want to buy medicine. Send WhatsApp messages and follow up.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <div className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 text-xs font-bold border border-teal-200 dark:border-teal-800">
            Pipeline: <strong>{formatPKR(totalPipelineValue)}</strong>
          </div>

          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Delete with scope criteria"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete / Purge</span>
          </button>

          <button
            onClick={() => setIsAdding(true)}
            className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Add New Lead
          </button>
        </div>
      </div>

      {/* Add Lead Modal */}
      {isAdding && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users2 className="w-5 h-5 text-teal-600" />
                Add New Client Lead
              </h2>
              <button
                onClick={() => setIsAdding(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLead} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Medical Store / Clinic / Hospital Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Al-Razi Pharmacy"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Asif / Incharge"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Phone / WhatsApp Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="0300 1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    City
                  </label>
                  <input
                    type="text"
                    placeholder="Karachi, Lahore, etc."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                    Estimated Potential Order (PKR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    placeholder="0"
                    value={potentialPkr === 0 ? "" : potentialPkr}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setPotentialPkr(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-teal-600"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Interested Category
                </label>
                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
                >
                  <option value="Pharmacy & Prescriptions">Pharmacy & Prescriptions</option>
                  <option value="Cosmeceuticals & Skincare">Cosmeceuticals & Skincare</option>
                  <option value="Nutraceuticals & Supplements">Nutraceuticals & Supplements</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Notes & Discussion Points
                </label>
                <textarea
                  rows={2}
                  placeholder="Discussion details, product samples requested..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Universal Date Filter */}
      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={filteredLeads.length}
      />

      {/* Selection Toolbar */}
      {filteredLeads.length > 0 && (
        <div className="flex items-center justify-between px-2 text-xs text-slate-500">
          <label className="flex items-center gap-2 font-bold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedIds.length === filteredLeads.length && filteredLeads.length > 0}
              onChange={handleToggleSelectAll}
              className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>Select All ({filteredLeads.length})</span>
          </label>
          {selectedIds.length > 0 && (
            <span className="font-semibold text-rose-600">
              {selectedIds.length} selected
            </span>
          )}
        </div>
      )}

      {/* Kanban / Stage Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {STAGES.map(({ stage, label, color }) => {
          const stageLeads = filteredLeads.filter((l) => l.status === stage);

          return (
            <div
              key={stage}
              className={`p-4 rounded-xl border-t-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3 ${color}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {label}
                </span>
                <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center">
                  {stageLeads.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {stageLeads.length > 0 ? (
                  stageLeads.map((lead) => {
                    const isSelected = selectedIds.includes(lead.id);
                    return (
                      <div
                        key={lead.id}
                        className={`p-3 rounded-lg border transition-all ${
                          isSelected
                            ? "border-teal-500 bg-teal-50/20 dark:bg-teal-950/20"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                        } text-xs space-y-2`}
                      >
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(lead.id)}
                              className="w-3.5 h-3.5 mt-0.5 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                            />
                            <strong className="font-bold text-slate-900 dark:text-slate-100">
                              {lead.leadName}
                            </strong>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="font-bold text-teal-600">
                              {formatPKR(lead.estimatedPotentialPkr)}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDeletingLead(lead)}
                              className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                              title="Delete Lead"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-500">
                          Contact: {lead.contactPerson} • {lead.city}
                        </p>

                        {lead.interestedCategoryName && (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                            {lead.interestedCategoryName}
                          </span>
                        )}

                        {lead.notes && (
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 italic">
                            &ldquo;{lead.notes}&rdquo;
                          </p>
                        )}

                        {/* Stage Selector / Advancement */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px] text-slate-500 gap-2">
                          <select
                            value={lead.status}
                            onChange={(e) =>
                              handleStageChange(lead.id, e.target.value as LeadPipelineStage)
                            }
                            className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold text-slate-700 dark:text-slate-300"
                          >
                            <option value="new">New</option>
                            <option value="contacted">Called</option>
                            <option value="qualified">Qualified</option>
                            <option value="follow_up">Follow-Up</option>
                            <option value="offer_sent">Offer Sent</option>
                            <option value="converted">Became Customer</option>
                          </select>

                          <a
                            href={`https://wa.me/${(lead.whatsappNumber || lead.phone || "").replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 font-bold hover:underline flex items-center gap-1 shrink-0"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            WhatsApp
                          </a>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="py-4 text-center text-[11px] text-slate-400">No inquiries in this list.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        entityName="Client Leads"
        selectedCount={selectedIds.length}
        totalCount={leads.length}
        countsByScope={scopeCounts}
        onConfirmDelete={handleExecuteBulkDelete}
        isDeleting={isDeleting}
      />

      {/* Single Delete Modal */}
      <SingleDeleteModal
        isOpen={!!deletingLead}
        onClose={() => setDeletingLead(null)}
        itemName={deletingLead?.leadName || ""}
        title="Delete Client Lead"
        onConfirm={handleExecuteSingleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
