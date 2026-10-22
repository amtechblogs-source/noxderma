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
  const [city, setCity] = useState("Karachi");
  const [address, setAddress] = useState("");
  const [creditLimit, setCreditLimit] = useState(250000);

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
      creditLimit: Number(creditLimit) || 100000,
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
    setPhone("");
    setAddress("");
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
            <Building2 className="w-6 h-6 text-teal-600" />
            Customer & Pharmacy Network Directory
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Centralized registry of pharmacies, healthcare distributors, clinics, and direct accounts with credit limits.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel" : "Add New Customer"}
        </button>
      </div>

      {/* Add Customer Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateCustomer}
          className="p-5 md:p-6 rounded-2xl border border-teal-500/30 bg-white dark:bg-slate-900 shadow-xl space-y-4 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Register Customer Account
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Business / Pharmacy Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Al-Madina Medicos"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Customer Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="pharmacy">Retail Pharmacy / Medical Store</option>
                <option value="distributor">Wholesale Regional Distributor</option>
                <option value="direct_clinic">Doctor / Dermatology Clinic</option>
                <option value="online">Online Direct Account</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Contact Person</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Dr. Salman"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Primary Phone *</label>
              <input
                type="text"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +92 321 1234567"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">WhatsApp Number</label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="e.g. +92 321 1234567"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Credit Limit (PKR)</label>
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Street Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Shop 4, Main Commercial Avenue, Karachi"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold"
            >
              Save Customer
            </button>
          </div>
        </form>
      )}

      {/* Filters & Search */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search by customer name, contact, or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Category:
          </span>
          {(["all", "pharmacy", "distributor", "direct_clinic"] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1 rounded-lg font-bold capitalize shrink-0 transition-all ${
                categoryFilter === cat
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {cat.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Customers Table */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2.5">Customer / Pharmacy</th>
                <th className="py-2.5">Category</th>
                <th className="py-2.5">Contact Person</th>
                <th className="py-2.5">Phone & WhatsApp</th>
                <th className="py-2.5 text-right">Credit Limit</th>
                <th className="py-2.5 text-right">Current Balance</th>
                <th className="py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="py-3 font-semibold text-slate-900 dark:text-slate-100">
                    {c.name}
                    <span className="block text-[11px] text-slate-400 font-normal">{c.city}</span>
                  </td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 uppercase">
                      {c.category.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3 text-slate-600 dark:text-slate-300">{c.contactPerson}</td>
                  <td className="py-3 font-mono text-[11px]">
                    {c.phone}
                    <a
                      href={`https://wa.me/${(c.whatsappNumber || c.phone).replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center text-emerald-600 hover:text-emerald-700"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </a>
                  </td>
                  <td className="py-3 text-right font-semibold text-slate-700 dark:text-slate-300">
                    {formatPKR(c.creditLimit)}
                  </td>
                  <td className="py-3 text-right font-extrabold text-teal-600">
                    {formatPKR(c.currentOutstandingBalance)}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/customers/${c.id}`}
                        className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px]"
                      >
                        Profile
                      </Link>
                      <Link
                        href={`/sales/invoices/new?customerId=${c.id}`}
                        className="px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100 text-[10px]"
                      >
                        Bill
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
