"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatPKR } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";

interface Manufacturer {
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
}

export default function ManufacturersPage() {
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [terms, setTerms] = useState(30);

  const loadManufacturers = async () => {
    try {
      const list = await offlineDb.manufacturers.toArray();
      setManufacturers(list);
    } catch (e) {
      console.warn("Could not load manufacturers:", e);
    }
  };

  useEffect(() => {
    loadManufacturers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;

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
      status: "active",
    };

    await offlineDb.manufacturers.put(newMfr);
    await loadManufacturers();
    setIsAdding(false);
    setName("");
    setContactPerson("");
    setPhone("");
    setWhatsappNumber("");
    setEmail("");
    setAddress("");
  };

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
            <Factory className="w-6 h-6 text-teal-600" />
            Medicine Companies (Manufacturers & Suppliers)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Companies and factories from where you buy medicine stock.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel" : "Add New Company"}
        </button>
      </div>

      {/* Add Manufacturer Form */}
      {isAdding && (
        <form
          onSubmit={handleCreate}
          className="p-5 md:p-6 rounded-2xl border border-teal-500/30 bg-white dark:bg-slate-900 shadow-xl space-y-4 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            Add New Medicine Company / Supplier
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Company Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. GlaxoSmithKline Pakistan"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Manager / Contact Person Name</label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Tariq Jamil"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Payment Time Allowed (Days)</label>
              <input
                type="number"
                placeholder="30"
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

            <div className="md:col-span-3">
              <label className="block font-semibold mb-1">Factory / Godown Address</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Plot / Sector, Industrial Area..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
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
              Save Company
            </button>
          </div>
        </form>
      )}

      {/* Manufacturers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {manufacturers.map((m) => (
          <div
            key={m.id}
            className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3 text-xs"
          >
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{m.name}</h3>
                <p className="text-slate-500 mt-0.5">{m.address}</p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                ACTIVE
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Contact Person:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{m.contactPerson}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Payment Time:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">{m.paymentTermsDays} Days</span>
              </div>
              <div className="flex justify-between text-indigo-600 font-bold">
                <span>Money We Owe (Hamara Dena / Baqaya):</span>
                <span>{formatPKR(m.payableBalance)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px]">
              <span className="font-mono text-slate-500">{m.phone}</span>

              <div className="flex items-center gap-3">
                <Link
                  href="/finance/ledgers/manufacturers"
                  className="text-indigo-600 font-bold hover:underline"
                >
                  View Khata
                </Link>

                <a
                  href={`https://wa.me/${m.whatsappNumber.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-600 font-bold hover:underline"
                >
                  <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
