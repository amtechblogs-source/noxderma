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
  TrendingUp,
  Percent,
  Coins,
  Receipt,
  FileText,
  X,
  Phone,
  MapPin,
  Mail,
  PieChart,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { offlineDb } from "@/lib/offline/db";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import {
  DateFilterState,
  DateRangePreset,
  createDefaultDateFilter,
  isRecordInDateRange,
  getDateFilterDescription,
} from "@/lib/dateFilter";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";
import type { PartnerTransaction, PartnerTransactionType, BusinessSettings } from "@/types";

// Helper: Extract timestamp for granular sorting (createdAt ISO or ID timestamp)
function getPartnerTxTime(tx: PartnerTransaction): number {
  if (tx.createdAt) {
    const time = new Date(tx.createdAt).getTime();
    if (!isNaN(time) && time > 0) return time;
  }
  const match = tx.id.match(/\d{10,13}/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  const dateObj = new Date(tx.date);
  return !isNaN(dateObj.getTime()) ? dateObj.getTime() : 0;
}

// Comparator: Latest entries on TOP (Date DESC, then Creation Timestamp DESC)
function comparePartnerTxNewestFirst(a: PartnerTransaction, b: PartnerTransaction): number {
  const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  const bTime = getPartnerTxTime(b);
  const aTime = getPartnerTxTime(a);
  if (bTime !== aTime) return bTime - aTime;
  return b.id.localeCompare(a.id);
}

// Helper: Clean partner name from any parenthetical tag like (Aap / Owner)
function cleanPartnerName(name: string, fallback: string): string {
  if (!name) return fallback;
  const stripped = name.replace(/\s*\([^)]*\)/g, "").trim();
  return stripped || fallback;
}

export default function PartnersKhataPage() {
  const { currentUser, hasPermission } = useAuth();

  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Partner custom names (Clean names without parentheses/tags)
  const [partner1Name, setPartner1Name] = useState("Partner 1");
  const [partner2Name, setPartner2Name] = useState("Partner 2");
  const [editingNames, setEditingNames] = useState(false);
  const [tempP1Name, setTempP1Name] = useState("Partner 1");
  const [tempP2Name, setTempP2Name] = useState("Partner 2");

  // Profit Distribution Calculator State
  const [distributableProfit, setDistributableProfit] = useState<number>(100000);
  const [showProfitDistributorModal, setShowProfitDistributorModal] = useState(false);

  // Universal Date Filter (Same as other Noxderma modules)
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [selectedPartnerFilter, setSelectedPartnerFilter] = useState<"all" | "partner_1" | "partner_2">("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"all" | "investment" | "withdrawal" | "profit_payout">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State for Add Transaction
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<"partner_1" | "partner_2">("partner_1");
  const [type, setType] = useState<PartnerTransactionType>("investment");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "cheque" | "online">("bank_transfer");
  const [description, setDescription] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Print Preview Modal State
  const [showPrintPreview, setShowPrintPreview] = useState(false);

  // Load transactions and settings from IndexedDB
  const loadData = async () => {
    try {
      const [list, settings] = await Promise.all([
        offlineDb.partnerTransactions.toArray(),
        offlineDb.settings.get("primary"),
      ]);
      list.sort(comparePartnerTxNewestFirst);
      setTransactions(list);
      setBusinessSettings(settings || null);

      const savedP1 = localStorage.getItem("nox_partner_1_name");
      const savedP2 = localStorage.getItem("nox_partner_2_name");
      const p1 = cleanPartnerName(savedP1 || "", "Partner 1");
      const p2 = cleanPartnerName(savedP2 || "", "Partner 2");
      setPartner1Name(p1);
      setTempP1Name(p1);
      setPartner2Name(p2);
      setTempP2Name(p2);
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
    const p1 = cleanPartnerName(tempP1Name, "Partner 1");
    const p2 = cleanPartnerName(tempP2Name, "Partner 2");
    setPartner1Name(p1);
    setTempP1Name(p1);
    localStorage.setItem("nox_partner_1_name", p1);

    setPartner2Name(p2);
    setTempP2Name(p2);
    localStorage.setItem("nox_partner_2_name", p2);

    setEditingNames(false);
  };

  // 1. Partner Investment Management & Calculation
  // Total Investment per partner (investment date does NOT affect total investment or ratio)
  const p1Transactions = useMemo(
    () => transactions.filter((t) => t.partnerId === "partner_1"),
    [transactions]
  );
  const p2Transactions = useMemo(
    () => transactions.filter((t) => t.partnerId === "partner_2"),
    [transactions]
  );

  // Total Injected Investment (Capital)
  const p1TotalInvestment = useMemo(
    () =>
      p1Transactions
        .filter((t) => t.type === "investment" || t.type === "in")
        .reduce((sum, t) => sum + t.amount, 0),
    [p1Transactions]
  );

  const p2TotalInvestment = useMemo(
    () =>
      p2Transactions
        .filter((t) => t.type === "investment" || t.type === "in")
        .reduce((sum, t) => sum + t.amount, 0),
    [p2Transactions]
  );

  const combinedTotalInvestment = p1TotalInvestment + p2TotalInvestment;

  // 2. Automatic Profit Sharing: Investment Ratio Calculation
  // When combined investment is 0, default to 50/50.
  const p1RatioPercent = useMemo(() => {
    if (combinedTotalInvestment <= 0) return 50;
    return parseFloat(((p1TotalInvestment / combinedTotalInvestment) * 100).toFixed(2));
  }, [p1TotalInvestment, combinedTotalInvestment]);

  const p2RatioPercent = useMemo(() => {
    if (combinedTotalInvestment <= 0) return 50;
    return parseFloat(((p2TotalInvestment / combinedTotalInvestment) * 100).toFixed(2));
  }, [p2TotalInvestment, combinedTotalInvestment]);

  // Total Capital Withdrawals / Drawings
  const p1TotalWithdrawals = useMemo(
    () =>
      p1Transactions
        .filter((t) => t.type === "withdrawal" || t.type === "out")
        .reduce((sum, t) => sum + t.amount, 0),
    [p1Transactions]
  );

  const p2TotalWithdrawals = useMemo(
    () =>
      p2Transactions
        .filter((t) => t.type === "withdrawal" || t.type === "out")
        .reduce((sum, t) => sum + t.amount, 0),
    [p2Transactions]
  );

  // Total Profit Payouts Received
  const p1TotalProfitReceived = useMemo(
    () =>
      p1Transactions
        .filter((t) => t.type === "profit_payout")
        .reduce((sum, t) => sum + t.amount, 0),
    [p1Transactions]
  );

  const p2TotalProfitReceived = useMemo(
    () =>
      p2Transactions
        .filter((t) => t.type === "profit_payout")
        .reduce((sum, t) => sum + t.amount, 0),
    [p2Transactions]
  );

  // Net Capital Standing (Investment - Withdrawals)
  const p1NetCapital = p1TotalInvestment - p1TotalWithdrawals;
  const p2NetCapital = p2TotalInvestment - p2TotalWithdrawals;

  // Profit Distribution calculation on distributable profit pool
  const p1CalculatedProfit = Math.round((distributableProfit * p1RatioPercent) / 100);
  const p2CalculatedProfit = Math.round(distributableProfit - p1CalculatedProfit);

  // 4. Filtered Transactions (Unified date filter, partner, type & search)
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Partner Filter
      if (selectedPartnerFilter !== "all" && t.partnerId !== selectedPartnerFilter) return false;

      // Type Filter
      if (selectedTypeFilter !== "all") {
        if (selectedTypeFilter === "investment" && t.type !== "investment" && t.type !== "in") return false;
        if (selectedTypeFilter === "withdrawal" && t.type !== "withdrawal" && t.type !== "out") return false;
        if (selectedTypeFilter === "profit_payout" && t.type !== "profit_payout") return false;
      }

      // Universal Date Range Filter
      if (!isRecordInDateRange(t.date || t.createdAt, dateFilter)) return false;

      // Search Filter
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
    }).sort(comparePartnerTxNewestFirst);
  }, [transactions, selectedPartnerFilter, selectedTypeFilter, dateFilter, searchQuery, partner1Name, partner2Name]);

  // Handle Add Transaction Submit
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

  // Record Profit Share directly into Ledger for both partners
  const handleRecordDistributedProfit = async () => {
    if (distributableProfit <= 0) {
      alert("Distributable profit ki raqam 0 se zyada honi chahiye.");
      return;
    }
    if (
      !confirm(
        `Kya aap waqai Rs ${distributableProfit.toLocaleString()} ko dono partners ke darmiyan unke investment ratio (${p1RatioPercent}% / ${p2RatioPercent}%) ke mutabiq khate mein record karna chahte hain?\n\n• ${partner1Name}: ${formatPKR(p1CalculatedProfit)}\n• ${partner2Name}: ${formatPKR(p2CalculatedProfit)}`
      )
    ) {
      return;
    }

    setIsSubmitting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const nowIso = new Date().toISOString();

      const txP1: PartnerTransaction = {
        id: `ptx_profit_p1_${Date.now()}`,
        partnerId: "partner_1",
        partnerName: partner1Name,
        type: "profit_payout",
        amount: p1CalculatedProfit,
        date: today,
        paymentMethod: "bank_transfer",
        description: `Profit Share Distribution (${p1RatioPercent}% of Rs ${distributableProfit.toLocaleString()})`,
        reference: `PROFIT-${today}`,
        createdById: currentUser?.id,
        createdByName: currentUser?.displayName || "Admin",
        createdAt: nowIso,
      };

      const txP2: PartnerTransaction = {
        id: `ptx_profit_p2_${Date.now() + 1}`,
        partnerId: "partner_2",
        partnerName: partner2Name,
        type: "profit_payout",
        amount: p2CalculatedProfit,
        date: today,
        paymentMethod: "bank_transfer",
        description: `Profit Share Distribution (${p2RatioPercent}% of Rs ${distributableProfit.toLocaleString()})`,
        reference: `PROFIT-${today}`,
        createdById: currentUser?.id,
        createdByName: currentUser?.displayName || "Admin",
        createdAt: nowIso,
      };

      await offlineDb.partnerTransactions.bulkAdd([txP1, txP2]);
      await loadData();
      setShowProfitDistributorModal(false);
      alert("Dono partners ka profit share kamyabi se khate mein darj ho gaya hai!");
    } catch (err) {
      console.error("Error recording profit:", err);
      alert("Profit share record karne mein masla aaya.");
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

  // WhatsApp share statement (Clean, concise & to-the-point)
  const shareWhatsApp = () => {
    const p1 = cleanPartnerName(partner1Name, "Partner 1");
    const p2 = cleanPartnerName(partner2Name, "Partner 2");
    const brand = businessSettings?.brandName || "NOXDERMA PHARMACEUTICALS";
    const period = getDateFilterDescription(dateFilter);

    let text = `📊 *PARTNERSHIP AUDIT STATEMENT*\n`;
    text += `🏢 *${brand}*\n`;
    text += `📅 Period: ${period}\n`;
    text += `─────────────────────────\n\n`;

    text += `💰 *CAPITAL & SHARE:*\n`;
    text += `• *${p1}:* ${formatPKR(p1TotalInvestment)} (${p1RatioPercent}%)\n`;
    text += `• *${p2}:* ${formatPKR(p2TotalInvestment)} (${p2RatioPercent}%)\n`;
    text += `• *Total Capital:* ${formatPKR(combinedTotalInvestment)}\n\n`;

    text += `📈 *PROFIT DISTRIBUTION (Per 100k):*\n`;
    text += `• *${p1} (${p1RatioPercent}%):* ${formatPKR(Math.round(100000 * (p1RatioPercent / 100)))}\n`;
    text += `• *${p2} (${p2RatioPercent}%):* ${formatPKR(Math.round(100000 * (p2RatioPercent / 100)))}\n\n`;

    text += `💼 *CURRENT NET CAPITAL:*\n`;
    text += `• *${p1}:* ${formatPKR(p1NetCapital)}\n`;
    text += `• *${p2}:* ${formatPKR(p2NetCapital)}\n`;
    text += `─────────────────────────\n`;
    text += `_Generated via Noxderma ERP_`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const triggerCleanPrint = () => {
    window.print();
  };

  return (
    <>
      {/* ============================================================== */}
      {/* 1. DEDICATED PRINTABLE INVOICE / STATEMENT (Print Only View)  */}
      {/* ============================================================== */}
      <div className="hidden print:block text-black bg-white p-4 font-sans text-xs">
        {/* Official Branded Header */}
        <OfficialPrintHeader
          title="PARTNERSHIP INVESTMENT & PROFIT AUDIT STATEMENT"
          docRef={`PRT-AUDIT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`}
          period={getDateFilterDescription(dateFilter)}
          settings={businessSettings}
          className="pb-4"
        />

        {/* Partnership Capital & Profit Sharing Table */}
        <div className="my-5">
          <h2 className="text-xs font-black uppercase tracking-wider mb-2 text-black border-b border-black pb-1">
            1. Partnership Capital Ownership &amp; Profit Sharing Ratio
          </h2>
          <table className="w-full text-left border-collapse border border-black text-[11px]">
            <thead className="bg-slate-100">
              <tr className="border-b border-black">
                <th className="p-2 border-r border-black font-black">Audit Metric / Detail</th>
                <th className="p-2 border-r border-black font-black text-right">{partner1Name}</th>
                <th className="p-2 border-r border-black font-black text-right">{partner2Name}</th>
                <th className="p-2 font-black text-right bg-slate-200">Combined Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              <tr>
                <td className="p-2 border-r border-black font-bold">Total Capital Invested (Sarmayakari)</td>
                <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p1TotalInvestment)}</td>
                <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p2TotalInvestment)}</td>
                <td className="p-2 font-mono font-black text-right bg-slate-50">{formatPKR(combinedTotalInvestment)}</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-2 border-r border-black font-black">Investment Ownership Share (%)</td>
                <td className="p-2 border-r border-black font-mono font-black text-right">{p1RatioPercent}%</td>
                <td className="p-2 border-r border-black font-mono font-black text-right">{p2RatioPercent}%</td>
                <td className="p-2 font-mono font-black text-right bg-slate-100">100.0%</td>
              </tr>
              <tr>
                <td className="p-2 border-r border-black font-bold">Profit Share Allocation (e.g. on Rs {distributableProfit.toLocaleString()})</td>
                <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p1CalculatedProfit)}</td>
                <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p2CalculatedProfit)}</td>
                <td className="p-2 font-mono font-black text-right bg-slate-50">{formatPKR(distributableProfit)}</td>
              </tr>
              <tr>
                <td className="p-2 border-r border-black font-bold">Total Capital Withdrawn / Drawings</td>
                <td className="p-2 border-r border-black font-mono text-right">-{formatPKR(p1TotalWithdrawals)}</td>
                <td className="p-2 border-r border-black font-mono text-right">-{formatPKR(p2TotalWithdrawals)}</td>
                <td className="p-2 font-mono text-right bg-slate-50">-{formatPKR(p1TotalWithdrawals + p2TotalWithdrawals)}</td>
              </tr>
              <tr>
                <td className="p-2 border-r border-black font-bold">Total Profit Payouts Disbursed</td>
                <td className="p-2 border-r border-black font-mono text-right">{formatPKR(p1TotalProfitReceived)}</td>
                <td className="p-2 border-r border-black font-mono text-right">{formatPKR(p2TotalProfitReceived)}</td>
                <td className="p-2 font-mono text-right bg-slate-50">{formatPKR(p1TotalProfitReceived + p2TotalProfitReceived)}</td>
              </tr>
              <tr className="bg-slate-100 font-black">
                <td className="p-2 border-r border-black font-black">Net Capital Standing in Business</td>
                <td className="p-2 border-r border-black font-mono text-right">{formatPKR(p1NetCapital)}</td>
                <td className="p-2 border-r border-black font-mono text-right">{formatPKR(p2NetCapital)}</td>
                <td className="p-2 font-mono text-right bg-slate-200">{formatPKR(p1NetCapital + p2NetCapital)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Transaction History Ledger */}
        <div className="my-5">
          <h2 className="text-xs font-black uppercase tracking-wider mb-2 text-black border-b border-black pb-1">
            2. Detailed Transaction Audit Ledger ({filteredTransactions.length} entries)
          </h2>
          <table className="w-full text-left border-collapse border border-black text-[10px]">
            <thead className="bg-slate-100 border-b border-black">
              <tr>
                <th className="p-1.5 border-r border-black">#</th>
                <th className="p-1.5 border-r border-black">Date</th>
                <th className="p-1.5 border-r border-black">Partner</th>
                <th className="p-1.5 border-r border-black">Transaction Type</th>
                <th className="p-1.5 border-r border-black">Description / Reference</th>
                <th className="p-1.5 border-r border-black">Method</th>
                <th className="p-1.5 text-right font-black">Amount (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {filteredTransactions.map((tx, idx) => (
                <tr key={tx.id}>
                  <td className="p-1.5 border-r border-black font-mono">{idx + 1}</td>
                  <td className="p-1.5 border-r border-black font-mono">{tx.date}</td>
                  <td className="p-1.5 border-r border-black font-bold">
                    {tx.partnerId === "partner_1" ? partner1Name : partner2Name}
                  </td>
                  <td className="p-1.5 border-r border-black uppercase font-semibold">
                    {tx.type === "investment" || tx.type === "in"
                      ? "Investment (Capital)"
                      : tx.type === "profit_payout"
                        ? "Profit Payout"
                        : "Drawing (Withdrawal)"}
                  </td>
                  <td className="p-1.5 border-r border-black">
                    {tx.description}
                    {tx.reference && <span className="block text-[9px] text-slate-600">Ref: {tx.reference}</span>}
                  </td>
                  <td className="p-1.5 border-r border-black capitalize">{tx.paymentMethod.replace("_", " ")}</td>
                  <td className="p-1.5 text-right font-mono font-bold">
                    {tx.type === "investment" || tx.type === "in" ? "+" : "-"}
                    {formatPKR(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Official Sign-off Signatures Block */}
        <div className="pt-10 mt-8 border-t-2 border-black grid grid-cols-3 gap-8 text-center text-[10px]">
          <div>
            <div className="border-b border-black pb-8 mb-1"></div>
            <p className="font-black text-black">{partner1Name}</p>
            <p className="text-slate-600">Partner 1 Signature &amp; Stamp</p>
          </div>
          <div>
            <div className="border-b border-black pb-8 mb-1"></div>
            <p className="font-black text-black">{partner2Name}</p>
            <p className="text-slate-600">Partner 2 Signature &amp; Stamp</p>
          </div>
          <div>
            <div className="border-b border-black pb-8 mb-1"></div>
            <p className="font-black text-black">Authorized Accountant / Auditor</p>
            <p className="text-slate-600">Noxderma ERP Financial Audit</p>
          </div>
        </div>

        {/* Disclaimer Footer */}
        <div className="mt-8 pt-2 border-t border-slate-300 text-center text-[9px] text-slate-500">
          Official Partnership Capital &amp; Profit Sharing Document generated by Noxderma ERP &bull; Verified Audit-grade Record.
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. INTERACTIVE WEB / MOBILE APPLICATION VIEW (Hidden on Print) */}
      {/* ============================================================== */}
      <div className="space-y-6 pb-16 print:hidden no-print">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
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
                Partners Investment &amp; Profit Sharing (شراکت دار کھاتہ)
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Dono partners ki separate investment, automatic ratio recalculation, aur equitable profit distribution.
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
              onClick={() => setShowPrintPreview(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold hover:bg-slate-50 transition-all btn-interactive shadow-sm"
            >
              <Printer className="w-4 h-4 text-teal-600" /> Print Statement
            </button>
            <button
              type="button"
              onClick={() => {
                setType("investment");
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-extrabold shadow-md shadow-teal-600/20 transition-all btn-interactive"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" /> Nai Investment / Entry
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* AUTOMATIC PROFIT SHARING & INVESTMENT RATIO CALCULATOR CARD    */}
        {/* ============================================================== */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-teal-500/10 via-white to-indigo-500/10 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800 border-2 border-teal-500/30 shadow-soft space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold shadow-md shadow-teal-600/20">
                <PieChart className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  Automatic Profit Sharing Ratio
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                    Live Calculation
                  </span>
                </h2>
                <p className="text-xs text-slate-500">
                  Profit sirf dono partners ki total investment ke ratio se distribute hota hai.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingNames(!editingNames)}
                className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <Edit2 className="w-3.5 h-3.5" />
                {editingNames ? "Close Name Edit" : "Edit Partner Names"}
              </button>
            </div>
          </div>

          {/* Partner Names Edit Bar (if toggled) */}
          {editingNames && (
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-700/60 flex flex-col sm:flex-row items-center gap-3 animate-fade-in">
              <div className="w-full sm:w-1/2">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Partner 1 Name:</label>
                <input
                  type="text"
                  value={tempP1Name}
                  onChange={(e) => setTempP1Name(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold"
                />
              </div>
              <div className="w-full sm:w-1/2">
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Partner 2 Name:</label>
                <input
                  type="text"
                  value={tempP2Name}
                  onChange={(e) => setTempP2Name(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold"
                />
              </div>
              <button
                type="button"
                onClick={handleSaveNames}
                className="w-full sm:w-auto px-4 py-2 mt-2 sm:mt-5 rounded-lg bg-teal-600 text-white font-bold text-xs flex items-center justify-center gap-1 shrink-0"
              >
                <Check className="w-4 h-4" /> Save
              </button>
            </div>
          )}

          {/* Visual Ratio Progress Split Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
                {partner1Name}: <strong className="font-mono text-sm">{p1RatioPercent}%</strong> ({formatPKR(p1TotalInvestment)})
              </span>
              <span className="text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                {partner2Name}: <strong className="font-mono text-sm">{p2RatioPercent}%</strong> ({formatPKR(p2TotalInvestment)})
              </span>
            </div>

            <div className="w-full h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
              <div
                style={{ width: `${p1RatioPercent}%` }}
                className="h-full bg-teal-600 transition-all duration-500 relative group"
                title={`${partner1Name}: ${p1RatioPercent}%`}
              />
              <div
                style={{ width: `${p2RatioPercent}%` }}
                className="h-full bg-indigo-600 transition-all duration-500 relative group"
                title={`${partner2Name}: ${p2RatioPercent}%`}
              />
            </div>

            <div className="flex justify-between text-[11px] text-slate-500 font-medium pt-0.5">
              <span>Combined Total Investment: <strong className="font-mono text-slate-900 dark:text-slate-100 font-bold">{formatPKR(combinedTotalInvestment)}</strong></span>
              <span>Total Ownership: 100%</span>
            </div>
          </div>

          {/* Interactive Profit Simulator */}
          <div className="p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Enter Distributable Profit (کل قابل تقسیم منافع - PKR):
                </label>
                <div className="relative max-w-xs">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rs</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={distributableProfit}
                    onChange={(e) => setDistributableProfit(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-teal-500/50 bg-teal-50/20 dark:bg-teal-950/20 text-slate-900 dark:text-slate-100 font-mono font-extrabold text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleRecordDistributedProfit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all self-start sm:self-end"
              >
                <Coins className="w-4 h-4" /> Distribute Profit
              </button>
            </div>

            {/* Live Profit Split Preview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-teal-800 dark:text-teal-200">👤 {partner1Name} Profit Share:</span>
                  <span className="font-mono font-bold text-teal-700 dark:text-teal-300">{p1RatioPercent}%</span>
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-teal-900 dark:text-teal-100 mt-1">
                  {formatPKR(p1CalculatedProfit)}
                </div>
                <span className="text-[10px] text-teal-600 dark:text-teal-400">
                  Calculated automatically from {p1RatioPercent}% investment ratio
                </span>
              </div>

              <div className="p-3 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-indigo-800 dark:text-indigo-200">👤 {partner2Name} Profit Share:</span>
                  <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">{p2RatioPercent}%</span>
                </div>
                <div className="text-lg sm:text-xl font-black font-mono text-indigo-900 dark:text-indigo-100 mt-1">
                  {formatPKR(p2CalculatedProfit)}
                </div>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400">
                  Calculated automatically from {p2RatioPercent}% investment ratio
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SIDE-BY-SIDE PARTNER INVESTMENT CARDS                          */}
        {/* ============================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Partner 1 Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-teal-500/30 shadow-soft space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 flex items-center justify-center font-black text-base shadow-sm">
                  P1
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    {partner1Name}
                  </h2>
                  <span className="text-[11px] font-bold text-teal-600 uppercase tracking-wider">
                    Investment Share: {p1RatioPercent}%
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPartnerId("partner_1");
                  setType("investment");
                  setIsModalOpen(true);
                }}
                className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-teal-300 dark:border-teal-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Investment
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/50">
                <span className="text-[10px] uppercase font-bold text-teal-700 dark:text-teal-400 block">Total Investment</span>
                <span className="text-base sm:text-lg font-black font-mono text-teal-900 dark:text-teal-100 mt-0.5 block">
                  {formatPKR(p1TotalInvestment)}
                </span>
                <span className="text-[10px] text-teal-600 font-bold block">{p1RatioPercent}% Ratio</span>
              </div>

              <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/50">
                <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 block">Drawings / Out</span>
                <span className="text-base sm:text-lg font-black font-mono text-rose-900 dark:text-rose-100 mt-0.5 block">
                  {formatPKR(p1TotalWithdrawals)}
                </span>
                <span className="text-[10px] text-rose-600 font-medium block">Capital Withdrawn</span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Profit Received</span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-900 dark:text-emerald-100 mt-0.5 block">
                  {formatPKR(p1TotalProfitReceived)}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium block">Total Payouts</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Net Capital Standing:</span>
              <div className="text-right">
                <span className="text-base sm:text-lg font-black font-mono text-teal-600 dark:text-teal-400">
                  {formatPKR(p1NetCapital)}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">Investment minus Withdrawals</span>
              </div>
            </div>
          </div>

          {/* Partner 2 Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-500/30 shadow-soft space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-black text-base shadow-sm">
                  P2
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    {partner2Name}
                  </h2>
                  <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                    Investment Share: {p2RatioPercent}%
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPartnerId("partner_2");
                  setType("investment");
                  setIsModalOpen(true);
                }}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-indigo-300 dark:border-indigo-700"
              >
                <Plus className="w-3.5 h-3.5" /> Add Investment
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50">
                <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-400 block">Total Investment</span>
                <span className="text-base sm:text-lg font-black font-mono text-indigo-900 dark:text-indigo-100 mt-0.5 block">
                  {formatPKR(p2TotalInvestment)}
                </span>
                <span className="text-[10px] text-indigo-600 font-bold block">{p2RatioPercent}% Ratio</span>
              </div>

              <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/50">
                <span className="text-[10px] uppercase font-bold text-rose-700 dark:text-rose-400 block">Drawings / Out</span>
                <span className="text-base sm:text-lg font-black font-mono text-rose-900 dark:text-rose-100 mt-0.5 block">
                  {formatPKR(p2TotalWithdrawals)}
                </span>
                <span className="text-[10px] text-rose-600 font-medium block">Capital Withdrawn</span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
                <span className="text-[10px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block">Profit Received</span>
                <span className="text-base sm:text-lg font-black font-mono text-emerald-900 dark:text-emerald-100 mt-0.5 block">
                  {formatPKR(p2TotalProfitReceived)}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium block">Total Payouts</span>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Net Capital Standing:</span>
              <div className="text-right">
                <span className="text-base sm:text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">
                  {formatPKR(p2NetCapital)}
                </span>
                <span className="block text-[10px] text-slate-400 font-medium">Investment minus Withdrawals</span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* UNIVERSAL DATA FILTERS BAR (Matches all Noxderma ERP modules)  */}
        {/* ============================================================== */}
        <div className="space-y-3">
          {/* Noxderma Standard Date Filter Bar */}
          <DateRangeFilterBar
            filter={dateFilter}
            onChange={setDateFilter}
            count={filteredTransactions.length}
            label="Transaction Date Filter"
          />

          {/* Secondary Filter Pills: Partner, Type & Search */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Partner Filter */}
              <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold max-w-full">
                <button
                  type="button"
                  onClick={() => setSelectedPartnerFilter("all")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
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
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
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
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                    selectedPartnerFilter === "partner_2"
                      ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {partner2Name}
                </button>
              </div>

              {/* Type Filter */}
              <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold max-w-full">
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("all")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                    selectedTypeFilter === "all"
                      ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  All Types
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("investment")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                    selectedTypeFilter === "investment"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  💰 Investment
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("withdrawal")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                    selectedTypeFilter === "withdrawal"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  🔻 Drawings
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("profit_payout")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs ${
                    selectedTypeFilter === "profit_payout"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  📈 Profit
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64 min-w-0">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search purpose, ref, method..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TRANSACTION HISTORY (Desktop Table + Mobile Cards Layout)      */}
        {/* ============================================================== */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Transaction History ({filteredTransactions.length} records)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Period: {getDateFilterDescription(dateFilter)}
              </p>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Partner</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Purpose / Description</th>
                  <th className="py-3 px-3">Method</th>
                  <th className="py-3 px-3 text-right">Amount (PKR)</th>
                  <th className="py-3 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      Koi transaction mojood nahi hai.
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
                        {tx.type === "investment" || tx.type === "in" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                            <ArrowDownRight className="w-3.5 h-3.5" /> 💰 Investment
                          </span>
                        ) : tx.type === "profit_payout" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                            <Coins className="w-3.5 h-3.5" /> 📈 Profit Payout
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                            <ArrowUpRight className="w-3.5 h-3.5" /> 🔻 Drawings / Out
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
                        <span
                          className={
                            tx.type === "investment" || tx.type === "in"
                              ? "text-emerald-600"
                              : tx.type === "profit_payout"
                                ? "text-teal-600"
                                : "text-rose-600"
                          }
                        >
                          {tx.type === "investment" || tx.type === "in" ? "+" : "-"}
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

          {/* Mobile Card Layout for Phones (Touch Friendly) */}
          <div className="block md:hidden space-y-3">
            {filteredTransactions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Koi transaction mojood nahi hai.
              </div>
            ) : (
              filteredTransactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-slate-100">
                      👤 {tx.partnerId === "partner_1" ? partner1Name : partner2Name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">{tx.date}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    {tx.type === "investment" || tx.type === "in" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        💰 Investment
                      </span>
                    ) : tx.type === "profit_payout" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                        📈 Profit Payout
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                        🔻 Drawings
                      </span>
                    )}

                    <span
                      className={`font-mono text-sm font-extrabold ${
                        tx.type === "investment" || tx.type === "in"
                          ? "text-emerald-600"
                          : tx.type === "profit_payout"
                            ? "text-teal-600"
                            : "text-rose-600"
                      }`}
                    >
                      {tx.type === "investment" || tx.type === "in" ? "+" : "-"}
                      {formatPKR(tx.amount)}
                    </span>
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 font-medium">
                    {tx.description}
                  </p>

                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-200/60 dark:border-slate-700/60">
                    <span className="capitalize">{tx.paymentMethod.replace("_", " ")}</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(tx.id)}
                      className="text-rose-500 font-bold hover:text-rose-700"
                    >
                      Delete Entry
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. DEDICATED PRINT PREVIEW MODAL (Screen preview before print)  */}
      {/* ============================================================== */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-300 dark:border-slate-700 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-teal-600" />
                <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                  Partnership Statement Print Preview
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerCleanPrint}
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
                >
                  <Printer className="w-4 h-4" /> Print Now (پرنٹ کریں)
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintPreview(false)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Printable Document Replica */}
            <div className="p-6 overflow-y-auto space-y-6 text-black bg-white text-xs">
              {/* Document Header */}
              <OfficialPrintHeader
                title="PARTNERSHIP INVESTMENT & PROFIT AUDIT STATEMENT"
                docRef={`PRT-AUDIT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`}
                period={getDateFilterDescription(dateFilter)}
                settings={businessSettings}
                showInPreview={true}
                className="pb-4"
              />

              {/* Capital & Profit Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-black border-b border-black pb-1">
                  1. Partnership Capital Ownership &amp; Profit Sharing Ratio
                </h4>
                <table className="w-full text-left border-collapse border border-black text-[11px]">
                  <thead className="bg-slate-100">
                    <tr className="border-b border-black">
                      <th className="p-2 border-r border-black font-black">Audit Metric</th>
                      <th className="p-2 border-r border-black font-black text-right">{partner1Name}</th>
                      <th className="p-2 border-r border-black font-black text-right">{partner2Name}</th>
                      <th className="p-2 font-black text-right bg-slate-200">Combined Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black">
                    <tr>
                      <td className="p-2 border-r border-black font-bold">Total Capital Invested</td>
                      <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p1TotalInvestment)}</td>
                      <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p2TotalInvestment)}</td>
                      <td className="p-2 font-mono font-black text-right bg-slate-50">{formatPKR(combinedTotalInvestment)}</td>
                    </tr>
                    <tr className="bg-slate-50">
                      <td className="p-2 border-r border-black font-black">Investment Ownership Share (%)</td>
                      <td className="p-2 border-r border-black font-mono font-black text-right">{p1RatioPercent}%</td>
                      <td className="p-2 border-r border-black font-mono font-black text-right">{p2RatioPercent}%</td>
                      <td className="p-2 font-mono font-black text-right bg-slate-100">100.0%</td>
                    </tr>
                    <tr>
                      <td className="p-2 border-r border-black font-bold">Profit Share Allocation (on Rs {distributableProfit.toLocaleString()})</td>
                      <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p1CalculatedProfit)}</td>
                      <td className="p-2 border-r border-black font-mono font-bold text-right">{formatPKR(p2CalculatedProfit)}</td>
                      <td className="p-2 font-mono font-black text-right bg-slate-50">{formatPKR(distributableProfit)}</td>
                    </tr>
                    <tr>
                      <td className="p-2 border-r border-black font-bold">Total Capital Withdrawn / Drawings</td>
                      <td className="p-2 border-r border-black font-mono text-right">-{formatPKR(p1TotalWithdrawals)}</td>
                      <td className="p-2 border-r border-black font-mono text-right">-{formatPKR(p2TotalWithdrawals)}</td>
                      <td className="p-2 font-mono text-right bg-slate-50">-{formatPKR(p1TotalWithdrawals + p2TotalWithdrawals)}</td>
                    </tr>
                    <tr className="bg-slate-100 font-black">
                      <td className="p-2 border-r border-black font-black">Net Capital Standing</td>
                      <td className="p-2 border-r border-black font-mono text-right">{formatPKR(p1NetCapital)}</td>
                      <td className="p-2 border-r border-black font-mono text-right">{formatPKR(p2NetCapital)}</td>
                      <td className="p-2 font-mono text-right bg-slate-200">{formatPKR(p1NetCapital + p2NetCapital)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Ledger */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-black border-b border-black pb-1">
                  2. Transaction History ({filteredTransactions.length} records)
                </h4>
                <table className="w-full text-left border-collapse border border-black text-[10px]">
                  <thead className="bg-slate-100 border-b border-black">
                    <tr>
                      <th className="p-1.5 border-r border-black">#</th>
                      <th className="p-1.5 border-r border-black">Date</th>
                      <th className="p-1.5 border-r border-black">Partner</th>
                      <th className="p-1.5 border-r border-black">Type</th>
                      <th className="p-1.5 border-r border-black">Description</th>
                      <th className="p-1.5 border-r border-black">Method</th>
                      <th className="p-1.5 text-right font-black">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {filteredTransactions.map((tx, idx) => (
                      <tr key={tx.id}>
                        <td className="p-1.5 border-r border-black font-mono">{idx + 1}</td>
                        <td className="p-1.5 border-r border-black font-mono">{tx.date}</td>
                        <td className="p-1.5 border-r border-black font-bold">
                          {tx.partnerId === "partner_1" ? partner1Name : partner2Name}
                        </td>
                        <td className="p-1.5 border-r border-black uppercase font-semibold">
                          {tx.type === "investment" || tx.type === "in"
                            ? "Investment"
                            : tx.type === "profit_payout"
                              ? "Profit Payout"
                              : "Drawings"}
                        </td>
                        <td className="p-1.5 border-r border-black">{tx.description}</td>
                        <td className="p-1.5 border-r border-black capitalize">{tx.paymentMethod.replace("_", " ")}</td>
                        <td className="p-1.5 text-right font-mono font-bold">
                          {tx.type === "investment" || tx.type === "in" ? "+" : "-"}
                          {formatPKR(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Signatures */}
              <div className="pt-8 mt-6 border-t-2 border-black grid grid-cols-3 gap-6 text-center text-[10px]">
                <div>
                  <div className="border-b border-black pb-8 mb-1"></div>
                  <p className="font-black">{partner1Name}</p>
                  <p className="text-slate-600">Partner 1 Signature</p>
                </div>
                <div>
                  <div className="border-b border-black pb-8 mb-1"></div>
                  <p className="font-black">{partner2Name}</p>
                  <p className="text-slate-600">Partner 2 Signature</p>
                </div>
                <div>
                  <div className="border-b border-black pb-8 mb-1"></div>
                  <p className="font-black">Authorized Auditor</p>
                  <p className="text-slate-600">Noxderma ERP</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. ADD TRANSACTION MODAL                                       */}
      {/* ============================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in no-print">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Plus className="w-5 h-5 text-teal-600" />
                Add Partner Investment / Drawing
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
                  Select Partner *
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
                    <span className="block text-[10px] text-teal-600 font-medium mt-0.5">
                      Current Share: {p1RatioPercent}%
                    </span>
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
                    <span className="block text-[10px] text-indigo-600 font-medium mt-0.5">
                      Current Share: {p2RatioPercent}%
                    </span>
                  </button>
                </div>
              </div>

              {/* Transaction Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Transaction Type *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setType("investment")}
                    className={`p-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      type === "investment" || type === "in"
                        ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    <span>💰 Investment</span>
                    <span className="text-[9px] font-medium text-emerald-600">(Adds to Capital)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType("withdrawal")}
                    className={`p-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      type === "withdrawal" || type === "out"
                        ? "border-rose-500 bg-rose-50/80 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 ring-2 ring-rose-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-600" />
                    <span>🔻 Drawings</span>
                    <span className="text-[9px] font-medium text-rose-600">(Money Taken)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType("profit_payout")}
                    className={`p-2.5 rounded-xl border text-[11px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      type === "profit_payout"
                        ? "border-teal-500 bg-teal-50/80 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 ring-2 ring-teal-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <Coins className="w-4 h-4 text-teal-600" />
                    <span>📈 Profit</span>
                    <span className="text-[9px] font-medium text-teal-600">(Munafa Share)</span>
                  </button>
                </div>
              </div>

              {/* Amount and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    placeholder="e.g. 100000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono font-bold text-base focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium text-sm focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    (Date record keeping k liye hai, profit ratio par asar nahi karti)
                  </span>
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
                  <option value="bank_transfer">Bank Transfer (Meezan / HBL / etc.)</option>
                  <option value="cash">Cash (Naqad)</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online / EasyPaisa / Raast</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Purpose / Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Additional stock purchase capital injection / Personal drawings"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bank Reference / Slip No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cheque # 10492 / IBAN Deposit Slip"
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
                  {isSubmitting ? "Saving..." : "Save Record (محفوظ کریں)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
