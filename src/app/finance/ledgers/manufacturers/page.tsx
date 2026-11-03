"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  BookOpen,
  Factory,
  Search,
  Filter,
  DollarSign,
  Plus,
  Printer,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { formatPKR, formatNumber, formatKarachiDate } from "@/lib/formatting";
import DateRangeFilterBar from "@/components/common/DateRangeFilterBar";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";
import {
  DateFilterState,
  createDefaultDateFilter,
  isRecordInDateRange,
  getDateFilterDescription,
} from "@/lib/dateFilter";

interface ManufacturerPayableEntry {
  id: string;
  manufacturerId: string;
  manufacturerName: string;
  date: string;
  referenceNumber: string;
  referenceType: "purchase_invoice" | "payment_voucher" | "debit_note";
  description: string;
  debit: number; // payment made reduces payable
  credit: number; // purchase increases payable
  runningBalance: number;
}

export default function ManufacturerLedgersPage() {
  const [selectedMfr, setSelectedMfr] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [search, setSearch] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Form State
  const [mfrName, setMfrName] = useState("");
  const [amount, setAmount] = useState(0);
  const [paymentRef, setPaymentRef] = useState("");
  const [notes, setNotes] = useState("");

  const [entries, setEntries] = useState<ManufacturerPayableEntry[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("noxderma_mfr_ledger");
    if (saved) {
      setEntries(JSON.parse(saved));
    } else {
      setEntries([]);
    }
  }, []);

  const saveEntries = (updated: ManufacturerPayableEntry[]) => {
    setEntries(updated);
    localStorage.setItem("noxderma_mfr_ledger", JSON.stringify(updated));
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: ManufacturerPayableEntry = {
      id: `mfr_ledg_${Date.now()}`,
      manufacturerId: mfrName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      manufacturerName: mfrName,
      date: new Date().toISOString().slice(0, 10),
      referenceNumber: paymentRef || `PV-${Date.now().toString().slice(-4)}`,
      referenceType: "payment_voucher",
      description: notes || "Payment to Manufacturer",
      debit: Number(amount),
      credit: 0,
      runningBalance: 0, // recomputed below
    };

    const combined = [...entries, newEntry];
    saveEntries(combined);
    setIsRecordingPayment(false);
  };

  // Filter
  const filtered = entries.filter((e) => {
    const matchesMfr =
      selectedMfr === "all" ||
      e.manufacturerName.toLowerCase().includes(selectedMfr.toLowerCase());
    const matchesSearch =
      e.referenceNumber.toLowerCase().includes(search.toLowerCase()) ||
      e.description.toLowerCase().includes(search.toLowerCase()) ||
      e.manufacturerName.toLowerCase().includes(search.toLowerCase());
    const matchesDate = isRecordInDateRange(e.date, dateFilter);
    return matchesMfr && matchesSearch && matchesDate;
  });

  // Calculate Running Balance per manufacturer
  const mfrRunningMap: Record<string, number> = {};
  const computedList = filtered.map((e) => {
    const prev = mfrRunningMap[e.manufacturerId] || 0;
    const next = prev + (e.credit - e.debit);
    mfrRunningMap[e.manufacturerId] = next;
    return {
      ...e,
      runningBalance: next,
    };
  });

  const totalPayable = entries.reduce((sum, e) => sum + (e.credit - e.debit), 0);

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Official Print-Only Company Header */}
      <OfficialPrintHeader
        title="Company Khata Statement"
        period={getDateFilterDescription(dateFilter)}
        targetLabel="Company"
        targetName={selectedMfr === "all" ? "All Medicine Companies" : selectedMfr}
      />

      {/* Screen Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Company Khata & Payments
            </span>
            <span className="text-xs text-slate-400">Medicine Companies History</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Company Khata (Money We Owe Companies)
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs flex items-center gap-1.5 text-slate-700 dark:text-slate-300 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" /> Print Khata Statement
          </button>
          <button
            onClick={() => setIsRecordingPayment(true)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Payment to Company
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:grid-cols-3 print:gap-2">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1 print:text-slate-600">
            Total Money We Owe Companies
          </span>
          <span className="text-2xl font-black font-mono text-rose-600 print:text-black">
            {formatPKR(totalPayable)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Total remaining balance to pay</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1 print:text-slate-600">
            Total Stock Bought (+)
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100 print:text-black">
            {formatPKR(entries.reduce((sum, e) => sum + e.credit, 0))}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">All medicine purchases</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm print:border-slate-300 print:bg-slate-50 print:p-2.5 print:shadow-none">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1 print:text-slate-600">
            Total Payments Paid (-)
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600 print:text-black">
            {formatPKR(entries.reduce((sum, e) => sum + e.debit, 0))}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Cash & bank payments made</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3 text-xs no-print print:hidden">
        <DateRangeFilterBar
          filter={dateFilter}
          onChange={setDateFilter}
          count={computedList.length}
          label="Khata Period"
        />

        <div className="flex flex-col md:flex-row gap-3 items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search purchase no, company or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
            <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
              <Filter className="w-3.5 h-3.5" /> Select Company:
            </span>
            {["all", "Bayer", "GSK", "Nox Laboratories"].map((m) => (
              <button
                key={m}
                onClick={() => setSelectedMfr(m)}
                className={`px-3 py-1 rounded-lg font-bold shrink-0 transition-all ${
                  selectedMfr.toLowerCase() === m.toLowerCase()
                    ? "bg-teal-600 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                {m === "all" ? "All Companies" : m}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 print:border-none print:shadow-none print:p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs print:text-[10px] print:border-collapse print:border print:border-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 print:bg-slate-100 print:text-black print:border-slate-300">
              <tr>
                <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Date</th>
                <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Purchase / Cheque #</th>
                <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Medicine Company</th>
                <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300">Details</th>
                <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300 text-right">Payment Paid (-)</th>
                <th className="p-2.5 print:p-1.5 print:border-r print:border-slate-300 text-right">Stock Bought (+)</th>
                <th className="p-2.5 print:p-1.5 text-right">Remaining Balance to Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
              {computedList.map((entry) => (
                <tr
                  key={entry.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors print:border-b print:border-slate-200"
                >
                  <td className="p-2.5 print:p-1.5 font-mono text-slate-500 print:text-slate-700 print:border-r print:border-slate-200">{entry.date}</td>
                  <td className="p-2.5 print:p-1.5 font-mono font-bold text-teal-600 dark:text-teal-400 print:text-black print:border-r print:border-slate-200">
                    {entry.referenceNumber}
                  </td>
                  <td className="p-2.5 print:p-1.5 font-semibold text-slate-900 dark:text-slate-100 print:text-black print:border-r print:border-slate-200">
                    {entry.manufacturerName}
                  </td>
                  <td className="p-2.5 print:p-1.5 text-slate-700 dark:text-slate-300 print:text-slate-700 print:border-r print:border-slate-200">{entry.description}</td>
                  <td className="p-2.5 print:p-1.5 text-right font-mono font-bold text-emerald-600 print:text-black print:border-r print:border-slate-200">
                    {entry.debit > 0 ? formatPKR(entry.debit) : "—"}
                  </td>
                  <td className="p-2.5 print:p-1.5 text-right font-mono font-bold text-rose-600 print:text-black print:border-r print:border-slate-200">
                    {entry.credit > 0 ? formatPKR(entry.credit) : "—"}
                  </td>
                  <td className="p-2.5 print:p-1.5 text-right font-mono font-black text-slate-900 dark:text-slate-100 print:text-black">
                    {formatPKR(entry.runningBalance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Print-Only Sign-off Block */}
        <div className="hidden print:grid grid-cols-3 gap-6 pt-6 mt-6 border-t border-slate-300 text-center text-[10px]">
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Prepared By</p>
            <p className="text-slate-500">Accounts Assistant</p>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Audited By</p>
            <p className="text-slate-500">Finance Manager</p>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Approved By</p>
            <p className="text-slate-500">Managing Director</p>
          </div>
        </div>
      </div>

      {/* Payment Voucher Modal */}
      {isRecordingPayment && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-teal-600" /> Record Payment to Company
              </h2>
              <button
                onClick={() => setIsRecordingPayment(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Medicine Company *
                </label>
                <select
                  value={mfrName}
                  onChange={(e) => setMfrName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="Bayer Healthcare PK">Bayer Healthcare PK</option>
                  <option value="GlaxoSmithKline PK">GlaxoSmithKline PK</option>
                  <option value="Nox Laboratories PK">Nox Laboratories PK</option>
                  <option value="Getz Pharma Pakistan">Getz Pharma Pakistan</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Amount Paid (Rs) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="0"
                  value={amount === 0 ? "" : amount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setAmount(raw === "" ? 0 : Number(raw) || 0);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Cheque / Bank Reference Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. CHQ-991823"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Payment Note / Details
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsRecordingPayment(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
