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
  Ticket,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import { recordActivity } from "@/lib/audit/auditTracker";

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
  const { currentUser } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [targetAudience, setTargetAudience] = useState<Campaign["targetAudience"]>("dermatologists");
  const [channel, setChannel] = useState<Campaign["channel"]>("whatsapp_broadcast");
  const [budget, setBudget] = useState(0);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    async function loadCampaigns() {
      try {
        const dbCamps = await (offlineDb as any).marketingCampaigns?.toArray();
        const isCloudInit = localStorage.getItem("noxderma_cloud_init_marketingCampaigns") === "true";
        if (dbCamps && (dbCamps.length > 0 || isCloudInit)) {
          setCampaigns(dbCamps as Campaign[]);
          localStorage.setItem("noxderma_marketing_campaigns", JSON.stringify(dbCamps));
          return;
        }
      } catch {
        // fallback
      }

      const saved = localStorage.getItem("noxderma_marketing_campaigns");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setCampaigns(parsed);
            if (parsed.length > 0 && (offlineDb as any).marketingCampaigns) {
              await (offlineDb as any).marketingCampaigns.bulkPut(parsed);
            }
          } else {
            setCampaigns([]);
          }
        } catch {
          setCampaigns([]);
        }
      } else {
        setCampaigns([]);
      }
    }
    loadCampaigns();
    const handleCloudSynced = () => {
      loadCampaigns();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  const saveCampaigns = async (updated: Campaign[]) => {
    setCampaigns(updated);
    localStorage.setItem("noxderma_marketing_campaigns", JSON.stringify(updated));
    try {
      if ((offlineDb as any).marketingCampaigns) {
        await (offlineDb as any).marketingCampaigns.clear();
        if (updated.length > 0) {
          await (offlineDb as any).marketingCampaigns.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync marketingCampaigns to offlineDb:", err);
    }
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
    recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      userEmail: currentUser?.email,
      action: "create",
      entityType: "marketing_campaign",
      entityId: newCamp.id,
      entityTitle: newCamp.name,
      details: `Created marketing campaign "${newCamp.name}" (Budget: ${formatPKR(newCamp.budgetPkr)}).`,
      snapshotAfter: newCamp,
      canUndo: true,
    }).catch(console.warn);
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
              Promotions
            </span>
            <span className="text-xs text-slate-400">Doctor & Shop Offers</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Marketing Schemes & Doctor Offers
          </h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Link
            href="/marketing/coupons"
            className="px-3.5 py-2 rounded-lg border border-teal-500/30 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Ticket className="w-3.5 h-3.5" /> Customer Coupons (Vouchers)
          </Link>
          <Link
            href="/marketing/whatsapp"
            className="px-3.5 py-2 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" /> WhatsApp Message Maker
          </Link>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
          >
            <Plus className="w-4 h-4" /> New Promotion Scheme
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Promotion Expense
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalBudget)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{campaigns.length} schemes created</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Total Sales from Schemes
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600">
            {formatPKR(totalRevenue)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Return on Spend: {Math.round((totalRevenue / (totalBudget || 1)) * 100)}%
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Active Schemes
          </span>
          <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
            {campaigns.filter((c) => c.status === "active").length} Running
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Currently active in market</span>
        </div>
      </div>

      {/* Campaigns Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Scheme Name</th>
                <th className="p-2.5">For Whom?</th>
                <th className="p-2.5">Sent Via</th>
                <th className="p-2.5 text-right">Expense Budget</th>
                <th className="p-2.5 text-right">Sales Made</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Share</th>
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
                    {c.targetAudience === "dermatologists"
                      ? "Skin Doctors"
                      : c.targetAudience === "general_physicians"
                      ? "General Doctors"
                      : c.targetAudience === "pharmacies"
                      ? "Medical Stores"
                      : "Wholesale Dealers"}
                  </td>
                  <td className="p-2.5 capitalize text-slate-700 dark:text-slate-300">
                    {c.channel === "whatsapp_broadcast"
                      ? "WhatsApp"
                      : c.channel === "field_rep_visits"
                      ? "Staff Visits"
                      : c.channel === "clinical_seminar"
                      ? "Doctor Meeting"
                      : "Brochure"}
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
                      WhatsApp <ArrowRight className="w-3 h-3" />
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
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-teal-600" /> Add New Marketing Scheme
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
                  Scheme Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Winter 10+1 Free Bonus Offer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    For Whom?
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="pharmacies">Retail Medical Stores</option>
                    <option value="dermatologists">Skin Specialists (Dermatologists)</option>
                    <option value="general_physicians">General Doctors</option>
                    <option value="distributors">Wholesale Dealers</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    How Will You Promote?
                  </label>
                  <select
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="whatsapp_broadcast">WhatsApp Message</option>
                    <option value="field_rep_visits">Staff Visits</option>
                    <option value="clinical_seminar">Doctor Meeting</option>
                    <option value="direct_mail">Pamphlet / Brochure</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Estimated Cost (PKR)
                </label>
                <input
                  type="number"
                  placeholder="0"
                  value={budget === 0 ? "" : budget}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setBudget(raw === "" ? 0 : Number(raw) || 0);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  Save Scheme
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
