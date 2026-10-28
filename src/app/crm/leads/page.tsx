"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Lead, LeadPipelineStage, Customer } from "@/types";

const STAGES: { stage: LeadPipelineStage; label: string; color: string }[] = [
  { stage: "new", label: "New Inquiries", color: "border-sky-500" },
  { stage: "contacted", label: "Called / Spoken", color: "border-indigo-500" },
  { stage: "qualified", label: "Interested & Verified", color: "border-teal-500" },
  { stage: "follow_up", label: "Follow-Up (Rabta)", color: "border-amber-500" },
  { stage: "offer_sent", label: "Rates & Offer Sent", color: "border-purple-500" },
  { stage: "converted", label: "Became Customer", color: "border-emerald-500" },
];

export default function LeadsCrmPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isAdding, setIsAdding] = useState(false);

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
      assignedEmployeeId: "usr_admin",
      assignedEmployeeName: "Sales Team",
      status: "new",
      estimatedPotentialPkr: Number(potentialPkr) || 0,
      notes: notes.trim(),
      nextFollowUpDate: followUpDate,
      createdAt: now.toISOString(),
    };

    await offlineDb.leads.put(newLead);
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

  const totalPipelineValue = leads.reduce((sum, l) => sum + (l.estimatedPotentialPkr || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 text-xs font-bold border border-teal-200 dark:border-teal-800">
            Pipeline: <strong>{formatPKR(totalPipelineValue)}</strong>
          </div>
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

      {/* Kanban / Stage Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {STAGES.map(({ stage, label, color }) => {
          const stageLeads = leads.filter((l) => l.status === stage);

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
                  stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <strong className="font-bold text-slate-900 dark:text-slate-100">
                          {lead.leadName}
                        </strong>
                        <span className="font-bold text-teal-600">
                          {formatPKR(lead.estimatedPotentialPkr)}
                        </span>
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
                          "{lead.notes}"
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
                  ))
                ) : (
                  <p className="py-4 text-center text-[11px] text-slate-400">No inquiries in this list.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
