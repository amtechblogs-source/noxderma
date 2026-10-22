"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Megaphone,
  Plus,
  Search,
  Filter,
  Share2,
  Calendar,
  Sparkles,
  TrendingUp,
  Target,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";

interface Campaign {
  id: string;
  name: string;
  targetAudience: "dermatologists" | "general_physicians" | "pharmacies" | "distributors";
  channel: "field_rep_visits" | "whatsapp_broadcast" | "clinical_seminar" | "direct_mail";
  budgetPkr: number;
  actualSpendPkr: number;
  revenueGeneratedPkr: number;
  startDate: string;
  endDate: string;
  status: "active" | "planned" | "completed";
  notes?: string;
}

export default function MarketingCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [targetAudience, setTargetAudience] = useState<Campaign["targetAudience"]>("dermatologists");
  const [channel, setChannel] = useState<Campaign["channel"]>("whatsapp_broadcast");
  const [budget, setBudget] = useState(150000);
  const [startDate, setStartDate] = useState("2026-10-25");
  const [endDate, setEndDate] = useState("2026-11-25");

  useEffect(() => {
    const saved = localStorage.getItem("noxderma_marketing_campaigns");
    if (saved) {
      setCampaigns(JSON.parse(saved));
    } else {
      const initial: Campaign[] = [
        {
          id: "camp_01",
          name: "DermaClear Clinical OPD Awareness Drive",
          targetAudience: "dermatologists",
          channel: "field_rep_visits",
          budgetPkr: 200000,
          actualSpendPkr: 145000,
          revenueGeneratedPkr: 680000,
          startDate: "2026-10-01",
          endDate: "2026-10-31",
          status: "active",
          notes: "Sample kit distribution to 120 key dermatologists in Lahore & Rawalpindi.",
        },
        {
          id: "camp_02",
          name: "Winter Antibiotic Pharmacy Volume Rebate",
          targetAudience: "pharmacies",
          channel: "whatsapp_broadcast",
          budgetPkr: 100000,
          actualSpendPkr: 85000,
          revenueGeneratedPkr: 1450000,
          startDate: "2026-10-15",
          endDate: "2026-11-15",
          status: "active",
          notes: "Special 10+1 bonus pack broadcast via WhatsApp to 450 pharmacies.",
        },
        {
          id: "camp_03",
          name: "Nox-D3 High Dose CME Seminar",
          targetAudience: "general_physicians",
          channel: "clinical_seminar",
          budgetPkr: 350000,
          actualSpendPkr: 320000,
          revenueGeneratedPkr: 920000,
          startDate: "2026-09-15",
          endDate: "2026-10-15",
          status: "completed",
          notes: "Grand symposium at Pearl Continental Lahore on Vitamin D3 deficiency.",
        },
      ];
      setCampaigns(initial);
      localStorage.setItem("noxderma_marketing_campaigns", JSON.stringify(initial));
    }
  }, []);

  const saveCampaigns = (updated: Campaign[]) => {
    setCampaigns(updated);
    localStorage.setItem("noxderma_marketing_campaigns", JSON.stringify(updated));
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    const newCamp: Campaign = {
      id: `camp_${Date.now()}`,
      name,
      targetAudience,
      channel,
      budgetPkr: Number(budget),
      actualSpendPkr: 0,
      revenueGeneratedPkr: 0,
      startDate,
      endDate,
      status: "active",
    };

    saveCampaigns([newCamp, ...campaigns]);
    setIsCreating(false);
    setName("");
  };

  const filtered = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalBudget = campaigns.reduce((sum, c) => sum + c.budgetPkr, 0);
  const totalRevenue = campaigns.reduce((sum, c) => sum + c.revenueGeneratedPkr, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Growth & Medical Affairs
            </span>
            <span className="text-xs text-slate-400">Doctor Engagement & ROI</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Marketing Campaigns & Doctor Outreach
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/marketing/whatsapp"
            className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> WhatsApp Card Generator
          </Link>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
          >
            <Plus className="w-4 h-4" /> Launch Campaign
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Marketing Budget
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalBudget)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{campaigns.length} Active & Past Campaigns</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Attributed Sales Generated
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600">
            {formatPKR(totalRevenue)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            ROI: {Math.round((totalRevenue / (totalBudget || 1)) * 100)}%
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Active Running Campaigns
          </span>
          <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
            {campaigns.filter((c) => c.status === "active").length} In Market
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Field Reps & WhatsApp Broadcasts</span>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Campaign Name</th>
                <th className="p-2.5">Target Audience</th>
                <th className="p-2.5">Channel</th>
                <th className="p-2.5 text-right">Budget</th>
                <th className="p-2.5 text-right">Revenue Generated</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-2.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {c.name}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {c.startDate} to {c.endDate}
                    </span>
                  </td>
                  <td className="p-2.5 capitalize text-slate-700 dark:text-slate-300">
                    {c.targetAudience.replace("_", " ")}
                  </td>
                  <td className="p-2.5 capitalize text-slate-700 dark:text-slate-300">
                    {c.channel.replace(/_/g, " ")}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatPKR(c.budgetPkr)}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-emerald-600">
                    {formatPKR(c.revenueGeneratedPkr)}
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        c.status === "active"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2.5 text-right">
                    <Link
                      href="/marketing/whatsapp"
                      className="px-2.5 py-1 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100 text-[10px] inline-flex items-center gap-1"
                    >
                      Cards <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Launch Campaign Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-teal-600" /> Launch Marketing Campaign
              </h2>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Campaign Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DermaClear Soothing Cream Launch"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Target Audience
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="dermatologists">Dermatologists</option>
                    <option value="general_physicians">General Physicians</option>
                    <option value="pharmacies">Retail Pharmacies</option>
                    <option value="distributors">Wholesale Distributors</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Channel
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="whatsapp_broadcast">WhatsApp Broadcast</option>
                    <option value="field_rep_visits">Medical Rep Visits</option>
                    <option value="clinical_seminar">Clinical Seminar / CME</option>
                    <option value="direct_mail">Direct Mail / Brochure</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Budget (PKR)
                </label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
