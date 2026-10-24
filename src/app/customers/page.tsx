"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Customer, CustomerCategory } from "@/types";

export default function CustomersDirectoryPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isAdding, setIsAdding] = useState(false);

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
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

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-bold shadow-soft shadow-teal-600/20 btn-interactive"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel" : "Add New Medical Store"}
        </button>
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

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-thin">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5" /> Type:
          </span>
          {(["all", "pharmacy", "distributor", "direct_clinic"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`min-h-[40px] px-4 py-2 rounded-xl font-bold capitalize shrink-0 btn-interactive transition-all ${
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
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            No medical stores match your search.
          </div>
        ) : (
          filtered.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive space-y-3.5"
            >
              <div className="flex items-start justify-between gap-2">
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
                <span className="px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  {c.category === "pharmacy" ? "Medical Store" : c.category === "distributor" ? "Distributor" : c.category.replace("_", " ")}
                </span>
              </div>

              {/* Outstanding Udhaar and Limit */}
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

              {/* Contact and Direct Action Buttons */}
              <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
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
                  href={`/customers/detail?id=${encodeURIComponent(c.id)}`}
                  className="min-h-[40px] flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 btn-interactive"
                >
                  Khata
                </Link>
                <Link
                  href={`/sales/invoices/new?customerId=${c.id}`}
                  className="min-h-[40px] flex-1 px-3 py-2 rounded-xl bg-teal-600 text-white font-bold text-xs flex items-center justify-center shadow-soft shadow-teal-600/20 btn-interactive"
                >
                  + Bill
                </Link>
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
                <th className="py-3 px-3">Medical Store / Pharmacy</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Owner / Contact</th>
                <th className="py-3 px-3">Phone & WhatsApp</th>
                <th className="py-3 px-3 text-right">Udhaar Limit</th>
                <th className="py-3 px-3 text-right">Baqaya (Udhaar)</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
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
                  <td className="py-3.5 px-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                    {formatPKR(c.creditLimit)}
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono font-extrabold text-rose-600 dark:text-rose-400">
                    {formatPKR(c.currentOutstandingBalance)}
                  </td>
                  <td className="py-3.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/customers/detail?id=${encodeURIComponent(c.id)}`}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-xs btn-interactive inline-flex items-center"
                      >
                        View Khata
                      </Link>
                      <Link
                        href={`/sales/invoices/new?customerId=${c.id}`}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100 text-xs btn-interactive inline-flex items-center"
                      >
                        Make Bill
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
