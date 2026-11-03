"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Users2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Calendar,
  Filter,
  Printer,
  Share2,
  Trash2,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Search,
  Building,
  CreditCard,
  Edit2,
  Check,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { offlineDb } from "@/lib/offline/db";
import { formatPKR } from "@/lib/formatting";
import type { PartnerTransaction, PartnerTransactionType } from "@/types";

export default function PartnersKhataPage() {
  const { currentUser, hasPermission } = useAuth();

  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // Partner custom names
  const [partner1Name, setPartner1Name] = useState("Partner 1 (Aap / Owner)");
  const [partner2Name, setPartner2Name] = useState("Partner 2 (Sharakat-dar)");
  const [editingNames, setEditingNames] = useState(false);
  const [tempP1Name, setTempP1Name] = useState(partner1Name);
  const [tempP2Name, setTempP2Name] = useState(partner2Name);

  // Filters
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedPartnerFilter, setSelectedPartnerFilter] = useState<"all" | "partner_1" | "partner_2">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<"partner_1" | "partner_2">("partner_1");
  const [type, setType] = useState<PartnerTransactionType>("in");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(now.toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "cheque" | "online">("cash");
  const [description, setDescription] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load transactions and names
  const loadData = async () => {
    try {
      const list = await offlineDb.partnerTransactions.toArray();
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(list);

      const savedP1 = localStorage.getItem("nox_partner_1_name");
      const savedP2 = localStorage.getItem("nox_partner_2_name");
      if (savedP1) {
        setPartner1Name(savedP1);
        setTempP1Name(savedP1);
      }
      if (savedP2) {
        setPartner2Name(savedP2);
        setTempP2Name(savedP2);
      }
    } catch (err) {
      console.warn("Failed to load partner transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveNames = () => {
    if (tempP1Name.trim()) {
      setPartner1Name(tempP1Name.trim());
      localStorage.setItem("nox_partner_1_name", tempP1Name.trim());
    }
    if (tempP2Name.trim()) {
      setPartner2Name(tempP2Name.trim());
      localStorage.setItem("nox_partner_2_name", tempP2Name.trim());
    }
    setEditingNames(false);
  };

  // Calculations
  const partner1Transactions = useMemo(
    () => transactions.filter((t) => t.partnerId === "partner_1"),
    [transactions]
  );
  const partner2Transactions = useMemo(
    () => transactions.filter((t) => t.partnerId === "partner_2"),
    [transactions]
  );

  // Overall totals
  const p1TotalIn = partner1Transactions.filter((t) => t.type === "in").reduce((s, t) => s + t.amount, 0);
  const p1TotalOut = partner1Transactions.filter((t) => t.type === "out").reduce((s, t) => s + t.amount, 0);
  const p1Net = p1TotalIn - p1TotalOut;

  const p2TotalIn = partner2Transactions.filter((t) => t.type === "in").reduce((s, t) => s + t.amount, 0);
  const p2TotalOut = partner2Transactions.filter((t) => t.type === "out").reduce((s, t) => s + t.amount, 0);
  const p2Net = p2TotalIn - p2TotalOut;

  // Monthly totals (selectedMonth)
  const p1MonthIn = partner1Transactions
    .filter((t) => t.type === "in" && (!selectedMonth || t.date.startsWith(selectedMonth)))
    .reduce((s, t) => s + t.amount, 0);
  const p1MonthOut = partner1Transactions
    .filter((t) => t.type === "out" && (!selectedMonth || t.date.startsWith(selectedMonth)))
    .reduce((s, t) => s + t.amount, 0);
  const p1MonthNet = p1MonthIn - p1MonthOut;

  const p2MonthIn = partner2Transactions
    .filter((t) => t.type === "in" && (!selectedMonth || t.date.startsWith(selectedMonth)))
    .reduce((s, t) => s + t.amount, 0);
  const p2MonthOut = partner2Transactions
    .filter((t) => t.type === "out" && (!selectedMonth || t.date.startsWith(selectedMonth)))
    .reduce((s, t) => s + t.amount, 0);
  const p2MonthNet = p2MonthIn - p2MonthOut;

  // Filtered list
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedPartnerFilter !== "all" && t.partnerId !== selectedPartnerFilter) return false;
      if (selectedMonth && !t.date.startsWith(selectedMonth)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pName = t.partnerId === "partner_1" ? partner1Name.toLowerCase() : partner2Name.toLowerCase();
        return (
          t.description?.toLowerCase().includes(q) ||
          t.paymentMethod?.toLowerCase().includes(q) ||
          t.reference?.toLowerCase().includes(q) ||
          pName.includes(q)
        );
      }
      return true;
    });
  }, [transactions, selectedPartnerFilter, selectedMonth, searchQuery, partner1Name, partner2Name]);

  // Create new transaction
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Barah-e-karam durust raqam (amount) darj karein.");
      return;
    }
    if (!description.trim()) {
      alert("Tafseel ya maqsad (description) likhna zaroori hai.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newTx: PartnerTransaction = {
        id: `ptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        partnerId,
        partnerName: partnerId === "partner_1" ? partner1Name : partner2Name,
        type,
        amount: numAmount,
        date,
        paymentMethod,
        description: description.trim(),
        reference: reference.trim() || undefined,
        createdById: currentUser?.id,
        createdByName: currentUser?.displayName || "Admin",
        createdAt: new Date().toISOString(),
      };

      await offlineDb.partnerTransactions.add(newTx);
      await loadData();
      setIsModalOpen(false);
      setAmount("");
      setDescription("");
      setReference("");
    } catch (err) {
      console.error("Error saving partner transaction:", err);
      alert("Transaction save karne mein masla aaya.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Kya aap waqai is entry ko delete karna chahte hain?")) return;
    try {
      await offlineDb.partnerTransactions.delete(id);
      await loadData();
    } catch (err) {
      console.error("Error deleting transaction:", err);
    }
  };

  // WhatsApp share statement
  const shareWhatsApp = () => {
    const monthLabel = selectedMonth
      ? new Date(`${selectedMonth}-01`).toLocaleString("default", { month: "long", year: "numeric" })
      : "Overall All Time";

    let text = `💼 *PARTNERS KHATA STATEMENT (${monthLabel})*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    text += `👤 *${partner1Name}:*\n`;
    text += `• Paise Aaye (In): ${formatPKR(selectedMonth ? p1MonthIn : p1TotalIn)}\n`;
    text += `• Paise Gaye (Out): ${formatPKR(selectedMonth ? p1MonthOut : p1TotalOut)}\n`;
    text += `• *Net Balance: ${formatPKR(selectedMonth ? p1MonthNet : p1Net)}*\n\n`;

    text += `👤 *${partner2Name}:*\n`;
    text += `• Paise Aaye (In): ${formatPKR(selectedMonth ? p2MonthIn : p2TotalIn)}\n`;
    text += `• Paise Gaye (Out): ${formatPKR(selectedMonth ? p2MonthOut : p2TotalOut)}\n`;
    text += `• *Net Balance: ${formatPKR(selectedMonth ? p2MonthNet : p2Net)}*\n\n`;

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `_Generated via Noxderma ERP_`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const currentMonthName = now.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users2 className="w-6 h-6 text-teal-600" />
              Partners Khata (شراکت دار کھاتہ)
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Dono partners ke aane wale aur nikalne wale paison ka mukammal mahana hisab-kitab.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <button
            type="button"
            onClick={shareWhatsApp}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-bold hover:bg-emerald-100 transition-all btn-interactive"
          >
            <Share2 className="w-4 h-4" /> WhatsApp Statement
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold hover:bg-slate-50 transition-all btn-interactive"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-teal-600/20 transition-all btn-interactive"
          >
            <Plus className="w-4 h-4" /> Nai Entry Karein (نئی انٹری)
          </button>
        </div>
      </div>

      {/* Month Filter Selector Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300">
            Daurania (Mahana Hisab):
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-teal-500/40 bg-teal-50/50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-200 font-bold text-xs sm:text-sm focus:ring-2 focus:ring-teal-500"
          >
            <option value={currentMonthStr}>📅 Current Month ({currentMonthName})</option>
            <option value="">🌐 All Time (Shuru se ab tak)</option>
            {/* Last 5 months */}
            {[1, 2, 3, 4, 5].map((offset) => {
              const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              const label = d.toLocaleString("default", { month: "long", year: "numeric" });
              return (
                <option key={val} value={val}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        {/* Edit Partner Names Toggle */}
        <button
          type="button"
          onClick={() => setEditingNames(!editingNames)}
          className="text-xs font-semibold text-slate-500 hover:text-teal-600 flex items-center gap-1.5 self-end sm:self-auto"
        >
          <Edit2 className="w-3.5 h-3.5" />
          {editingNames ? "Cancel Edit Names" : "Edit Partner Names"}
        </button>
      </div>

      {/* Quick Names Edit Bar (if toggled) */}
      {editingNames && (
        <div className="p-4 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-1/2">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Partner 1 Name:</label>
            <input
              type="text"
              value={tempP1Name}
              onChange={(e) => setTempP1Name(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
            />
          </div>
          <div className="w-full sm:w-1/2">
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Partner 2 Name:</label>
            <input
              type="text"
              value={tempP2Name}
              onChange={(e) => setTempP2Name(e.target.value)}
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold"
            />
          </div>
          <button
            type="button"
            onClick={handleSaveNames}
            className="w-full sm:w-auto px-4 py-2 mt-4 sm:mt-5 rounded-lg bg-teal-600 text-white font-bold text-xs flex items-center justify-center gap-1 shrink-0"
          >
            <Check className="w-4 h-4" /> Save Names
          </button>
        </div>
      )}

      {/* Partners Comparison Cards (Side-by-side) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Partner 1 Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-teal-500/30 shadow-soft space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 flex items-center justify-center font-black text-base">
                P1
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  {partner1Name}
                </h2>
                <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider">
                  Partner 1 Hisab
                </span>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {selectedMonth ? "Is Mahine Ka" : "Total Lifetime"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Money IN */}
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <ArrowDownRight className="w-4 h-4" /> Paise Aaye (IN)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-emerald-800 dark:text-emerald-200 mt-1">
                {formatPKR(selectedMonth ? p1MonthIn : p1TotalIn)}
              </div>
              <p className="text-[10px] text-emerald-600 mt-0.5">Capital / Collection</p>
            </div>

            {/* Money OUT */}
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                <ArrowUpRight className="w-4 h-4" /> Paise Gaye (OUT)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-rose-800 dark:text-rose-200 mt-1">
                {formatPKR(selectedMonth ? p1MonthOut : p1TotalOut)}
              </div>
              <p className="text-[10px] text-rose-600 mt-0.5">Drawings / Withdrawals</p>
            </div>
          </div>

          {/* Net Standing */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Net Balance ({selectedMonth ? "Selected Month" : "Overall"}):
            </span>
            <div className="text-right">
              <span
                className={`text-lg sm:text-xl font-black font-mono ${
                  (selectedMonth ? p1MonthNet : p1Net) >= 0 ? "text-teal-600 dark:text-teal-400" : "text-rose-600"
                }`}
              >
                {formatPKR(selectedMonth ? p1MonthNet : p1Net)}
              </span>
              <span className="block text-[10px] text-slate-400 font-medium">
                {(selectedMonth ? p1MonthNet : p1Net) >= 0 ? "Credit (Business owes partner)" : "Debit (Partner owes)"}
              </span>
            </div>
          </div>
        </div>

        {/* Partner 2 Card */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-500/30 shadow-soft space-y-4 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-black text-base">
                P2
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
                  {partner2Name}
                </h2>
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                  Partner 2 Hisab
                </span>
              </div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {selectedMonth ? "Is Mahine Ka" : "Total Lifetime"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            {/* Money IN */}
            <div className="p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                <ArrowDownRight className="w-4 h-4" /> Paise Aaye (IN)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-emerald-800 dark:text-emerald-200 mt-1">
                {formatPKR(selectedMonth ? p2MonthIn : p2TotalIn)}
              </div>
              <p className="text-[10px] text-emerald-600 mt-0.5">Capital / Collection</p>
            </div>

            {/* Money OUT */}
            <div className="p-3.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800/50">
              <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700 dark:text-rose-400">
                <ArrowUpRight className="w-4 h-4" /> Paise Gaye (OUT)
              </div>
              <div className="text-lg sm:text-xl font-extrabold font-mono text-rose-800 dark:text-rose-200 mt-1">
                {formatPKR(selectedMonth ? p2MonthOut : p2TotalOut)}
              </div>
              <p className="text-[10px] text-rose-600 mt-0.5">Drawings / Withdrawals</p>
            </div>
          </div>

          {/* Net Standing */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              Net Balance ({selectedMonth ? "Selected Month" : "Overall"}):
            </span>
            <div className="text-right">
              <span
                className={`text-lg sm:text-xl font-black font-mono ${
                  (selectedMonth ? p2MonthNet : p2Net) >= 0 ? "text-indigo-600 dark:text-indigo-400" : "text-rose-600"
                }`}
              >
                {formatPKR(selectedMonth ? p2MonthNet : p2Net)}
              </span>
              <span className="block text-[10px] text-slate-400 font-medium">
                {(selectedMonth ? p2MonthNet : p2Net) >= 0 ? "Credit (Business owes partner)" : "Debit (Partner owes)"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ledger Section */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Partners Transactions History (کھاتہ تفصیل)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Showing {filteredTransactions.length} recorded entries
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Partner Tab Switcher */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setSelectedPartnerFilter("all")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  selectedPartnerFilter === "all"
                    ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                All Partners
              </button>
              <button
                type="button"
                onClick={() => setSelectedPartnerFilter("partner_1")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  selectedPartnerFilter === "partner_1"
                    ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {partner1Name}
              </button>
              <button
                type="button"
                onClick={() => setSelectedPartnerFilter("partner_2")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  selectedPartnerFilter === "partner_2"
                    ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {partner2Name}
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search reason, method..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Partner</th>
                <th className="py-3 px-3">Type</th>
                <th className="py-3 px-3">Tafseel (Reason)</th>
                <th className="py-3 px-3">Method</th>
                <th className="py-3 px-3 text-right">Raqam (PKR)</th>
                <th className="py-3 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Koi entry mojood nahi hai. Upar &quot;Nai Entry Karein&quot; button se pehli transaction add karein.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tx.date}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                      {tx.partnerId === "partner_1" ? partner1Name : partner2Name}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {tx.type === "in" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                          <ArrowDownRight className="w-3.5 h-3.5" /> Paise Aaye (IN)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                          <ArrowUpRight className="w-3.5 h-3.5" /> Paise Gaye (OUT)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                      {tx.description}
                      {tx.reference && (
                        <span className="text-[11px] text-slate-400 block font-mono">Ref: {tx.reference}</span>
                      )}
                    </td>
                    <td className="py-3 px-3 capitalize text-slate-500 font-medium">
                      {tx.paymentMethod.replace("_", " ")}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                      <span className={tx.type === "in" ? "text-emerald-600" : "text-rose-600"}>
                        {tx.type === "in" ? "+" : "-"}
                        {formatPKR(tx.amount)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleDelete(tx.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        title="Delete Entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Entry Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-600" />
                Partners Khata Entry (نئی انٹری)
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Partner Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Kis Partner Ka Hisab Hai?
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPartnerId("partner_1")}
                    className={`p-3 rounded-xl border text-xs sm:text-sm font-bold text-left transition-all ${
                      partnerId === "partner_1"
                        ? "border-teal-500 bg-teal-50/60 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 ring-2 ring-teal-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    👤 {partner1Name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPartnerId("partner_2")}
                    className={`p-3 rounded-xl border text-xs sm:text-sm font-bold text-left transition-all ${
                      partnerId === "partner_2"
                        ? "border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    👤 {partner2Name}
                  </button>
                </div>
              </div>

              {/* Transaction Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Transaction Type (پیسے آئے یا گئے؟)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setType("in")}
                    className={`p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                      type === "in"
                        ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    🟢 Paise Aaye (IN)
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("out")}
                    className={`p-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all ${
                      type === "out"
                        ? "border-rose-500 bg-rose-50/70 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 ring-2 ring-rose-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-600" />
                    🔴 Paise Nikalay (OUT)
                  </button>
                </div>
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Raqam (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold text-base focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tareekh (Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium text-sm focus:ring-2 focus:ring-teal-500"
                >
                  <option value="cash">Cash (Naqad)</option>
                  <option value="bank_transfer">Bank Transfer (Meezan / HBL / etc.)</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online App / EasyPaisa / JazzCash</option>
                </select>
              </div>

              {/* Description & Reference */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tafseel / Maqsad (Reason) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stock shipment payment k liye cash diya / Ghar k kharchay k liye nikala"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Slip No. / Bank Ref (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cheque # 49102 / Deposit Slip"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Transaction (محفوظ کریں)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
