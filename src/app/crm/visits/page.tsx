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
import { useCategory } from "@/context/CategoryContext";
import type { CustomerVisit, Customer, Product } from "@/types";

export default function CustomerVisitsPage() {
  const { selectedCategoryId } = useCategory();
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // New visit form state
  const [selectedCustId, setSelectedCustId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [organizationType, setOrganizationType] = useState<"pharmacy" | "clinic" | "distributor">("pharmacy");
  const [contactPerson, setContactPerson] = useState("");
  const [visitNotes, setVisitNotes] = useState("");
  const [productsDiscussed, setProductsDiscussed] = useState("");
  const [selectedProdToAdd, setSelectedProdToAdd] = useState("");
  const [interestLevel, setInterestLevel] = useState<"high" | "medium" | "low">("high");
  const [competitorIntel, setCompetitorIntel] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");

  const refreshVisits = async () => {
    const [list, custList, prodList] = await Promise.all([
      offlineDb.customerVisits.toArray(),
      offlineDb.customers.toArray(),
      offlineDb.products.toArray(),
    ]);

    setCustomers(custList);
    setProducts(prodList);
    setVisits(list.sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime()));
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
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-teal-600" />
            Doctor & Market Visits (Field Staff Visits)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Write down when staff visits a doctor or medical store, what medicines they showed, and customer feedback.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel" : "+ Add Visit Record"}
        </button>
      </div>

      {/* Record Visit Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateVisit}
          className="p-5 rounded-xl border border-teal-500/30 bg-teal-50/20 dark:bg-slate-900 shadow-sm space-y-4 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Record Visit to Doctor or Medical Store
          </h2>

          {/* Saved Customer/Clinic Dropdown for quick selection */}
          <div className="p-3 rounded-lg bg-teal-50/50 dark:bg-slate-800/60 border border-teal-200 dark:border-teal-800/50 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <label className="font-bold text-teal-800 dark:text-teal-300">
                Choose Saved Customer / Clinic / Doctor (Auto-fills below, or type custom)
              </label>
              <span className="text-[10px] text-slate-500">Pick from list OR type manually in fields below</span>
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
                  {c.name} {c.contactPerson ? `(Dr./Contact: ${c.contactPerson})` : ""} — {c.city} ({c.category === "direct_clinic" ? "Clinic" : c.category === "pharmacy" ? "Medical Store" : "Distributor"})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Shop / Clinic Name * (Manual or Auto-Filled)</label>
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
              <label className="block font-semibold mb-1">Doctor / Owner Name * (Manual or Auto-Filled)</label>
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
                onChange={(e) => setOrganizationType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="clinic">Clinic / Hospital</option>
                <option value="pharmacy">Medical Store / Pharmacy</option>
                <option value="distributor">Wholesale Dealer</option>
              </select>
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <label className="block font-semibold">
                Medicines Shown / Discussed (Choose from saved list OR type manually)
              </label>
              <div className="flex gap-2">
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
                  className="w-1/2 px-2.5 py-1.5 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold text-xs"
                >
                  <option value="">+ Pick Saved Medicine to Add...</option>
                  {(selectedCategoryId === "all"
                    ? products
                    : products.filter((p) => p.categoryId === selectedCategoryId)
                  ).map((p) => (
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
                  className="w-1/2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold mb-1">How Interested Were They?</label>
              <select
                value={interestLevel}
                onChange={(e) => setInterestLevel(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-teal-600"
              >
                <option value="high">High (Ready to Order)</option>
                <option value="medium">Medium (Needs another visit)</option>
                <option value="low">Low (Not interested right now)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Next Visit / Call Date</label>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">What Did They Say? (Notes)</label>
              <textarea
                rows={2}
                value={visitNotes}
                onChange={(e) => setVisitNotes(e.target.value)}
                placeholder="Doctor liked the cream, asked for 2 free samples, promised to prescribe..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Other Brands / Competitor Rates (Optional)</label>
              <textarea
                rows={2}
                value={competitorIntel}
                onChange={(e) => setCompetitorIntel(e.target.value)}
                placeholder="Which other company's medicine they are selling and at what discount..."
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
              Save Visit
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
                    {v.organizationType === "clinic" ? "Clinic" : v.organizationType === "pharmacy" ? "Medical Store" : "Wholesale Dealer"}
                  </span>
                </div>
                <p className="text-slate-500 mt-0.5">
                  Contact: <strong>{v.contactPerson}</strong> • Staff: <strong>{v.employeeName}</strong>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
                  Interest: {v.productInterestLevel === "high" ? "High (Ready)" : v.productInterestLevel === "medium" ? "Medium" : "Low"}
                </span>
                <span className="text-slate-400 font-medium">
                  {formatKarachiDate(v.visitDate, true)}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
              <span className="font-bold text-slate-700 dark:text-slate-300">Visit Notes:</span>
              <p className="text-slate-600 dark:text-slate-300 mt-1">{v.visitNotes}</p>
            </div>

            {v.competitorProducts && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300">
                <strong>Other Brands:</strong> {v.competitorProducts}
              </div>
            )}

            {v.followUpDate && (
              <div className="text-[11px] text-teal-600 flex items-center gap-1 font-semibold">
                <Calendar className="w-3.5 h-3.5" />
                Next Visit Date: {formatKarachiDate(v.followUpDate)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
