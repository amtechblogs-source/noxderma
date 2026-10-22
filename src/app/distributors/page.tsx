"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Customer } from "@/types";

interface DistributorDetail extends Customer {
  territory: string;
  marginPercentage: number;
  subDealersCount: number;
}

export default function DistributorsPage() {
  const [distributors, setDistributors] = useState<DistributorDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedTerritory, setSelectedTerritory] = useState("all");
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("Lahore");
  const [territory, setTerritory] = useState("Lahore Region (Central)");
  const [creditLimit, setCreditLimit] = useState(2500000);
  const [creditTermsDays, setCreditTermsDays] = useState(45);
  const [marginPercentage, setMarginPercentage] = useState(12);

  const loadData = async () => {
    try {
      const allCustomers = await offlineDb.customers.toArray();
      const dists = allCustomers.filter((c) => c.category === "distributor");

      if (dists.length === 0) {
        // Preload standard regional distributor network
        const sampleDistributors: DistributorDetail[] = [
          {
            id: "dist_lahore_central",
            name: "Shaheen Medical Distributors",
            businessName: "Shaheen Pharma Wholesale Corp",
            category: "distributor",
            contactPerson: "Haji Munir Ahmed",
            phone: "+92 42 37421100",
            whatsappNumber: "923004455667",
            address: "Nishtar Road, Wholesale Medicine Market",
            city: "Lahore",
            territory: "Lahore Central & Sheikhupura",
            creditLimit: 3000000,
            creditTermsDays: 45,
            currentOutstandingBalance: 1450000,
            marginPercentage: 11.5,
            subDealersCount: 42,
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "dist_karachi_south",
            name: "Sindh Healthcare Logistics",
            businessName: "Sindh Medicos Syndicate",
            category: "distributor",
            contactPerson: "Tariq Mehmood",
            phone: "+92 21 34567890",
            whatsappNumber: "923219876543",
            address: "Katchi Gali #3, Medicine Market",
            city: "Karachi",
            territory: "Karachi South & Hyderabad",
            creditLimit: 5000000,
            creditTermsDays: 60,
            currentOutstandingBalance: 2180000,
            marginPercentage: 12.0,
            subDealersCount: 68,
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: "dist_rawalpindi_north",
            name: "Potohar Pharma Network",
            businessName: "Potohar Distribution House",
            category: "distributor",
            contactPerson: "Malik Naveed",
            phone: "+92 51 4455667",
            whatsappNumber: "923335566778",
            address: "Bohir Bazar, Wholesale Complex",
            city: "Rawalpindi",
            territory: "Rawalpindi, Islamabad & KPK South",
            creditLimit: 2500000,
            creditTermsDays: 45,
            currentOutstandingBalance: 980000,
            marginPercentage: 11.0,
            subDealersCount: 35,
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        // Store into Dexie
        for (const d of sampleDistributors) {
          await offlineDb.customers.put(d);
        }
        setDistributors(sampleDistributors);
      } else {
        setDistributors(
          dists.map((d) => ({
            ...d,
            territory: (d as any).territory || `${d.city} Metropolitan`,
            marginPercentage: (d as any).marginPercentage || 11.5,
            subDealersCount: (d as any).subDealersCount || 25,
          }))
        );
      }
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
    setIsAdding(false);
    setName("");
    setContactPerson("");
    setPhone("");
    setWhatsapp("");
    await loadData();
  };

  const filtered = distributors.filter((d) => {
    const matchesSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      d.city.toLowerCase().includes(search.toLowerCase());
    const matchesTerritory =
      selectedTerritory === "all" || d.city.toLowerCase() === selectedTerritory.toLowerCase();
    return matchesSearch && matchesTerritory;
  });

  const totalCredit = distributors.reduce((sum, d) => sum + (d.creditLimit || 0), 0);
  const totalReceivable = distributors.reduce(
    (sum, d) => sum + (d.currentOutstandingBalance || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Supply Chain
            </span>
            <span className="text-xs text-slate-400">Wholesale Channel</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Distributor Network Directory
          </h1>
        </div>

        <button
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Distributor
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Active Regional Distributors
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {distributors.length} Partners
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Territory coverage across Pakistan</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Sanctioned Credit
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalCredit)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Average 45-60 Days Credit Terms</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Outstanding Receivables
          </span>
          <span className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
            {formatPKR(totalReceivable)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {Math.round((totalReceivable / (totalCredit || 1)) * 100)}% of limit utilized
          </span>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search distributor or territory..."
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

      {/* Distributor Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((d) => {
          const utilPct = Math.round(((d.currentOutstandingBalance || 0) / (d.creditLimit || 1)) * 100);
          return (
            <div
              key={d.id}
              className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between hover:border-teal-500/50 transition-all text-xs space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                      {d.city} Region
                    </span>
                    <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm mt-1">
                      {d.name}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-medium">{d.territory}</p>
                  </div>
                  <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-teal-600 shrink-0">
                    <Truck className="w-5 h-5" />
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Contact Person:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{d.contactPerson}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone / WhatsApp:</span>
                    <span className="font-bold font-mono text-slate-700 dark:text-slate-300">
                      {d.phone}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Wholesale Margin:</span>
                    <span className="font-bold text-emerald-600">{d.marginPercentage}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Credit Terms:</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {d.creditTermsDays} Days Net
                    </span>
                  </div>
                </div>

                {/* Credit Meter */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Outstanding / Limit:</span>
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
                  href={`/customers/${d.id}`}
                  className="font-bold text-teal-600 hover:underline flex items-center gap-1"
                >
                  View Profile & Ledgers <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href={`/sales/invoices/new?customerId=${d.id}`}
                  className="px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100"
                >
                  Bill
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {isAdding && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Register New Distributor
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
                  Distributor Name *
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
                    placeholder="+92 300 ..."
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
                    Territory
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
                    Credit Limit (PKR)
                  </label>
                  <input
                    type="number"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Terms (Days)
                  </label>
                  <input
                    type="number"
                    value={creditTermsDays}
                    onChange={(e) => setCreditTermsDays(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Margin %
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={marginPercentage}
                    onChange={(e) => setMarginPercentage(Number(e.target.value))}
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
                  Save Distributor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
