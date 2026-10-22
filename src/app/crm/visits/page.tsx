"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  MapPin,
  Plus,
  ArrowLeft,
  Calendar,
  Building,
  User,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { CustomerVisit } from "@/types";

export default function CustomerVisitsPage() {
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // New visit form state
  const [customerName, setCustomerName] = useState("");
  const [organizationType, setOrganizationType] = useState<"pharmacy" | "clinic" | "distributor">("pharmacy");
  const [contactPerson, setContactPerson] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [productsDiscussed, setProductsDiscussed] = useState("NoxDerm Cream, NoxAmox 500mg");
  const [interestLevel, setInterestLevel] = useState<"high" | "medium" | "low">("high");
  const [competitorIntel, setCompetitorIntel] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const refreshVisits = async () => {
    const list = await offlineDb.customerVisits.toArray();
    if (list.length === 0) {
      const now = new Date().toISOString();
      const sampleVisits: CustomerVisit[] = [
        {
          id: "visit_001",
          customerName: "Dr. Shahida Skin Care Aesthetics",
          organizationType: "clinic",
          contactPerson: "Dr. Shahida",
          employeeId: "usr_rep_ali",
          employeeName: "Ali Raza",
          visitDate: now,
          visitNotes: "Detailed product presentation on NoxDerm barrier repair mechanism. Sample issued.",
          productsDiscussed: ["NoxDerm Hydro-Barrier Cream 50g"],
          productInterestLevel: "high",
          ordersOrLeadsGenerated: "Requested quotation for 50 packs monthly",
          competitorProducts: "Physiogel A.I. Cream (priced 25% higher)",
          competitorOffers: "Standard 10% cash discount",
          ourPromotionalOffersDiscussed: "Introductory 15% discount on 1st bulk order",
          followUpDate: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
          createdAt: now,
        },
      ];
      await offlineDb.customerVisits.bulkPut(sampleVisits);
      setVisits(sampleVisits);
    } else {
      setVisits(list.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()));
    }
  };

  useEffect(() => {
    refreshVisits();
  }, []);

  const handleCreateVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !contactPerson) {
      alert("Please fill required fields");
      return;
    }

    const newVisit: CustomerVisit = {
      id: `visit_${Date.now()}`,
      customerName,
      organizationType,
      contactPerson,
      employeeId: "usr_rep_ali",
      employeeName: "Ali Raza",
      visitDate: new Date().toISOString(),
      visitNotes,
      productsDiscussed: productsDiscussed.split(",").map((s) => s.trim()),
      productInterestLevel: interestLevel,
      competitorProducts: competitorIntel,
      followUpDate: followUpDate ? new Date(followUpDate).toISOString() : undefined,
      createdAt: new Date().toISOString(),
    };

    await offlineDb.customerVisits.add(newVisit);
    await refreshVisits();
    setIsAdding(false);
    // Reset
    setCustomerName("");
    setContactPerson("");
    setVisitNotes("");
    setCompetitorIntel("");
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-teal-600" />
            Field Representative Visits & Market History
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Log pharmacy, doctor, and clinic visits. Capture product preferences, competitor deals, and follow-ups.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel Entry" : "Record New Field Visit"}
        </button>
      </div>

      {/* Record Visit Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateVisit}
          className="p-5 rounded-xl border border-teal-500/30 bg-teal-50/20 dark:bg-slate-900 shadow-sm space-y-4 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Log New Representative Market Visit
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Organization / Clinic Name *</label>
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
              <label className="block font-semibold mb-1">Doctor / Contact Person *</label>
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
              <label className="block font-semibold mb-1">Organization Sector</label>
              <select
                value={organizationType}
                onChange={(e) => setOrganizationType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="clinic">Dermatology / Medical Clinic</option>
                <option value="pharmacy">Retail Pharmacy / Medical Store</option>
                <option value="distributor">Wholesale Distributor</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Products Discussed</label>
              <input
                type="text"
                value={productsDiscussed}
                onChange={(e) => setProductsDiscussed(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Client Interest Level</label>
              <select
                value={interestLevel}
                onChange={(e) => setInterestLevel(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-teal-600"
              >
                <option value="high">High (Quotation / Order Imminent)</option>
                <option value="medium">Medium (Requires Follow-up)</option>
                <option value="low">Low Interest</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Next Follow-Up Date</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Discussion & Prescription Notes</label>
              <textarea
                rows={2}
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
                placeholder="Details of clinical feedback, sample acceptance, doctor feedback..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Observed Competitor Deals</label>
              <textarea
                rows={2}
                value={competitorIntel}
                onChange={(e) => setCompetitorIntel(e.target.value)}
                placeholder="Competitor products, schemes, discounts observed..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold"
            >
              Save Visit Entry
            </button>
          </div>
        </form>
      )}

      {/* Visits Feed */}
      <div className="space-y-3">
        {visits.map((v) => (
          <div
            key={v.id}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm text-xs space-y-3"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    {v.customerName}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                    {v.organizationType}
                  </span>
                </div>
                <p className="text-slate-500 mt-0.5">
                  Contact: <strong>{v.contactPerson}</strong> • Rep: <strong>{v.employeeName}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  Interest: {v.productInterestLevel.toUpperCase()}
                </span>
                <span className="text-slate-400 font-medium">
                  {formatKarachiDate(v.visitDate, true)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-700 dark:text-slate-300">Observation Notes:</span>
              <p className="text-slate-600 dark:text-slate-300 mt-1">{v.visitNotes}</p>
            </div>

            {v.competitorProducts && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300">
                <strong>Competitor Intel:</strong> {v.competitorProducts}
              </div>
            )}

            {v.followUpDate && (
              <div className="text-[11px] text-teal-600 flex items-center gap-1 font-semibold">
                <Calendar className="w-3.5 h-3.5" />
                Follow-up scheduled: {formatKarachiDate(v.followUpDate)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
