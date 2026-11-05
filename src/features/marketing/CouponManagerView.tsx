"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Ticket,
  Plus,
  Search,
  Share2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Calendar,
  Building2,
  ArrowLeft,
  Percent,
  Trash2,
  Sparkles,
  Filter,
  Clock,
  Phone,
  Globe2,
  Code2,
  Download,
  RefreshCw,
  Sliders,
  ShieldCheck,
  AlertCircle,
  X,
  Send,
  MessageCircle,
  UserCheck,
  DollarSign,
  Info,
  Infinity as InfinityIcon,
} from "lucide-react";
import { formatPKR, formatNumber, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { scheduleCloudDelete } from "@/lib/offline/cloudSync";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import { BulkDeleteModal, SingleDeleteModal, type DeleteScopeType } from "@/components/common/BulkDeleteModal";
import { computeDateScopeCounts, getItemsInScope } from "@/lib/dateFilter";
import type {
  CouponCode,
  Customer,
  CouponStatus,
  CouponAssignedScope,
  CouponUsageLimit,
  BusinessSettings,
} from "@/types";
import {
  generateRandomCouponCode,
  buildWhatsAppCouponMessage,
  normalizePhoneForWhatsApp,
  exportCouponsForWebDevelopers,
  WhatsAppMessageTone,
} from "@/lib/coupons/generator";
import { openWhatsAppShare } from "@/lib/whatsapp/share";

export function CouponManagerView() {
  // Navigation / View Tabs
  const [activeTab, setActiveTab] = useState<"generator" | "list" | "developer_sync">(
    "generator"
  );

  // Database Records
  const [coupons, setCoupons] = useState<CouponCode[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);

  // Form State
  const [discountPercent, setDiscountPercent] = useState<number>(15);
  const [codePrefix, setCodePrefix] = useState<string>("NOX");
  const [code, setCode] = useState<string>("");
  const [assignedScope, setAssignedScope] = useState<CouponAssignedScope>("specific_customer");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState<string>("");
  const [minOrderPkr, setMinOrderPkr] = useState<number>(0);
  const [validDays, setValidDays] = useState<number>(30);
  const [isNoExpiry, setIsNoExpiry] = useState<boolean>(false);
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  );
  const [usageLimit, setUsageLimit] = useState<CouponUsageLimit>("single_use");
  const [websiteUrl, setWebsiteUrl] = useState<string>("https://noxderma.com");
  const [notes, setNotes] = useState<string>("");

  // WhatsApp Preview Controls
  const [whatsappTone, setWhatsappTone] = useState<WhatsAppMessageTone>("roman_urdu");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedMessage, setCopiedMessage] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filters for Table
  const [listSearch, setListSearch] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Selection & Bulk/Single Deletion State
  const { currentUser } = useAuth();
  const [selectedCouponIds, setSelectedCouponIds] = useState<string[]>([]);
  const [deleteCouponsModalOpen, setDeleteCouponsModalOpen] = useState(false);
  const [deletingCoupon, setDeletingCoupon] = useState<CouponCode | null>(null);
  const [isDeletingCoupon, setIsDeletingCoupon] = useState(false);

  // Compute scope counts for coupon deletion
  const couponScopeCounts = useMemo(() => {
    return computeDateScopeCounts(coupons, (c) => c.createdAt, selectedCouponIds.length);
  }, [coupons, selectedCouponIds.length]);

  // Load Initial Data
  const refreshData = async () => {
    try {
      const [allCoupons, allCustomers, bizSettings] = await Promise.all([
        offlineDb.coupons.toArray(),
        offlineDb.customers.toArray(),
        offlineDb.settings.get("primary"),
      ]);

      // Sort coupons newest first
      const sortedCoupons = (allCoupons || []).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setCoupons(sortedCoupons);
      setCustomers(allCustomers || []);
      if (bizSettings) {
        setSettings(bizSettings);
        if (bizSettings.website) {
          setWebsiteUrl(bizSettings.website.startsWith("http") ? bizSettings.website : `https://${bizSettings.website}`);
        }
      }

      // If customer exists and none selected, auto-select first
      if (allCustomers && allCustomers.length > 0 && !selectedCustomerId) {
        setSelectedCustomerId(allCustomers[0].id);
      }
    } catch (err) {
      console.warn("Could not load coupon manager data:", err);
    }
  };

  useEffect(() => {
    refreshData();
    const handleCloudSynced = () => {
      refreshData();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  // Initialize fresh code on mount or when discount/prefix changes
  useEffect(() => {
    if (!code) {
      setCode(generateRandomCouponCode(codePrefix, discountPercent));
    }
  }, []);

  // Recalculate expiry date when validDays changes
  const handleValidDaysChange = (days: number) => {
    if (days === 0 || days === -1) {
      setIsNoExpiry(true);
      setValidDays(0);
      setValidUntil("no_expiry");
    } else {
      setIsNoExpiry(false);
      setValidDays(days);
      const newDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      setValidUntil(newDate);
    }
  };

  // Generate new random code
  const handleGenerateNewCode = (customPrefix?: string, customDiscount?: number) => {
    const p = customPrefix !== undefined ? customPrefix : codePrefix;
    const d = customDiscount !== undefined ? customDiscount : discountPercent;
    setCode(generateRandomCouponCode(p, d));
  };

  // Selected customer object
  const selectedCustomer = useMemo(() => {
    return customers.find((c) => c.id === selectedCustomerId);
  }, [customers, selectedCustomerId]);

  // Filtered customer options for search
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 50);
    const q = customerSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.businessName && c.businessName.toLowerCase().includes(q)) ||
          c.phone.includes(q) ||
          (c.city && c.city.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [customers, customerSearch]);

  // Real-time WhatsApp message preview text
  const currentWhatsAppMessage = useMemo(() => {
    let customerName = "Valued Customer / Partner";
    let businessName = "";

    if (assignedScope === "specific_customer" && selectedCustomer) {
      customerName = selectedCustomer.name;
      businessName = selectedCustomer.businessName || "";
    } else if (assignedScope === "pharmacies") {
      customerName = "Respected Pharmacy Owner / Partner";
    } else if (assignedScope === "dermatologists") {
      customerName = "Respected Doctor / Dermatologist";
    } else if (assignedScope === "distributors") {
      customerName = "Respected Main Distributor";
    }

    return buildWhatsAppCouponMessage({
      customerName,
      businessName,
      couponCode: code || "NOX-PROMO15",
      discountPercent: discountPercent,
      validUntil: validUntil,
      minOrderPkr: minOrderPkr,
      websiteUrl: websiteUrl,
      brandName: settings?.brandName || "Noxderma",
      tone: whatsappTone,
    });
  }, [
    assignedScope,
    selectedCustomer,
    code,
    discountPercent,
    validUntil,
    minOrderPkr,
    websiteUrl,
    settings,
    whatsappTone,
  ]);

  // Save Coupon into Dexie Database
  const handleSaveCoupon = async () => {
    if (!code.trim()) {
      alert("Please generate or enter a coupon code.");
      return;
    }

    const cleanCode = code.trim().toUpperCase();
    const existing = coupons.find((c) => c.code === cleanCode);
    if (existing) {
      alert(`Coupon code "${cleanCode}" pehle se mojood hai! Barahe karam naya code generate karein.`);
      return;
    }

    const now = new Date().toISOString();
    const newCoupon: CouponCode = {
      id: `cpn_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`,
      code: cleanCode,
      discountPercent: Number(discountPercent) || 10,
      assignedScope: assignedScope,
      customerId: assignedScope === "specific_customer" ? selectedCustomer?.id : undefined,
      customerName:
        assignedScope === "specific_customer"
          ? selectedCustomer?.name
          : assignedScope === "pharmacies"
          ? "All Pharmacies"
          : assignedScope === "dermatologists"
          ? "All Dermatologists"
          : "All Customers",
      customerBusinessName:
        assignedScope === "specific_customer" ? selectedCustomer?.businessName : undefined,
      customerPhone:
        assignedScope === "specific_customer"
          ? selectedCustomer?.whatsappNumber || selectedCustomer?.phone
          : undefined,
      customerCategory:
        assignedScope === "specific_customer" ? selectedCustomer?.category : undefined,
      minOrderPkr: Number(minOrderPkr) || 0,
      validUntil: isNoExpiry ? "no_expiry" : validUntil,
      usageLimit: usageLimit,
      usageCount: 0,
      status: "active",
      websiteUrl: websiteUrl.trim() || "https://noxderma.com",
      notes: notes.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await offlineDb.coupons.add(newCoupon);
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "create",
        entityType: "coupon",
        entityId: newCoupon.id,
        entityTitle: `${newCoupon.code} (${newCoupon.discountPercent}% OFF)`,
        details: `Created promotional coupon code "${newCoupon.code}" (${newCoupon.discountPercent}% OFF) for ${newCoupon.customerName || "customers"}.`,
        snapshotAfter: newCoupon,
        canUndo: true,
      });
      await refreshData();
      setSuccessToast(`Coupon "${cleanCode}" (${discountPercent}% OFF) kamyabi se ban gaya!`);
      setTimeout(() => setSuccessToast(null), 4000);

      // Refresh next code ready for another customer
      handleGenerateNewCode();
    } catch (err: any) {
      console.error("Failed to save coupon:", err);
      alert("Error saving coupon to database: " + (err?.message || "Unknown error"));
    }
  };

  // Toggle Coupon Active / Disabled
  const handleToggleStatus = async (coupon: CouponCode) => {
    const nextStatus: CouponStatus = coupon.status === "active" ? "disabled" : "active";
    const nowIso = new Date().toISOString();
    try {
      await offlineDb.coupons.update(coupon.id, {
        status: nextStatus,
        updatedAt: nowIso,
      });
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "update",
        entityType: "coupon",
        entityId: coupon.id,
        entityTitle: coupon.code,
        details: `${nextStatus === "active" ? "Enabled" : "Disabled"} coupon code "${coupon.code}".`,
        snapshotBefore: coupon,
        snapshotAfter: { ...coupon, status: nextStatus, updatedAt: nowIso },
        canUndo: true,
      });
      await refreshData();
    } catch (e) {
      console.error("Failed to update status:", e);
    }
  };

  // Delete Coupon Initiator (Opens Single Delete Confirmation Modal)
  const handleDeleteCoupon = (coupon: CouponCode) => {
    setDeletingCoupon(coupon);
  };

  // Direct WhatsApp Launcher
  const handleOpenWhatsApp = async (targetPhone?: string, customMsg?: string) => {
    const phoneToUse = targetPhone || selectedCustomer?.whatsappNumber || selectedCustomer?.phone || "";
    const cleanNumber = normalizePhoneForWhatsApp(phoneToUse);
    const message = customMsg || currentWhatsAppMessage;

    if (!cleanNumber) {
      alert("Is customer ka WhatsApp number darj nahi hai. Number check karein ya message copy karein.");
      return;
    }

    await openWhatsAppShare({
      phone: cleanNumber,
      rawText: message,
      autoCopyFull: true,
    });
    setSuccessToast("WhatsApp khul gaya! Emojis wala full message bhi clipboard par copy ho chuka hai (Ctrl+V).");
    setTimeout(() => setSuccessToast(null), 4500);
  };

  // Copy to Clipboard helpers
  const handleCopyText = async (text: string, type: "code" | "message" | "json") => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === "code") {
        setCopiedCode(text);
        setTimeout(() => setCopiedCode(null), 2500);
      } else if (type === "message") {
        setCopiedMessage(true);
        setTimeout(() => setCopiedMessage(false), 2500);
      } else if (type === "json") {
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2500);
      }
    } catch {
      alert("Clipboard copy failed. Please select and copy manually.");
    }
  };

  // Filtered list of coupons for the table
  const displayedCoupons = useMemo(() => {
    let list = coupons;

    if (statusFilter !== "all") {
      list = list.filter((c) => c.status === statusFilter);
    }

    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      list = list.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          (c.customerName && c.customerName.toLowerCase().includes(q)) ||
          (c.customerBusinessName && c.customerBusinessName.toLowerCase().includes(q)) ||
          (c.customerPhone && c.customerPhone.includes(q))
      );
    }

    return list;
  }, [coupons, statusFilter, listSearch]);

  const handleToggleSelectCoupon = (id: string) => {
    setSelectedCouponIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllCoupons = () => {
    const displayedIds = displayedCoupons.map((c) => c.id);
    const allSelected =
      displayedIds.length > 0 && displayedIds.every((id) => selectedCouponIds.includes(id));
    if (allSelected) {
      setSelectedCouponIds((prev) => prev.filter((id) => !displayedIds.includes(id)));
    } else {
      setSelectedCouponIds((prev) => Array.from(new Set([...prev, ...displayedIds])));
    }
  };

  const handleExecuteSingleDeleteCoupon = async () => {
    if (!deletingCoupon) return;
    setIsDeletingCoupon(true);
    try {
      await offlineDb.coupons.delete(deletingCoupon.id);
      scheduleCloudDelete("coupons", deletingCoupon.id);
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "coupon",
        entityId: deletingCoupon.id,
        entityTitle: deletingCoupon.code,
        details: `Deleted coupon code "${deletingCoupon.code}" (${deletingCoupon.discountPercent}% OFF)`,
        snapshotBefore: deletingCoupon,
        canUndo: true,
      });
      setSelectedCouponIds((prev) => prev.filter((id) => id !== deletingCoupon.id));
      await refreshData();
      setSuccessToast(`Coupon "${deletingCoupon.code}" delete ho gaya.`);
      setTimeout(() => setSuccessToast(null), 3000);
      setDeletingCoupon(null);
    } catch (err: any) {
      console.error("Failed to delete coupon:", err);
      alert("Error deleting coupon: " + (err?.message || "Unknown error"));
    } finally {
      setIsDeletingCoupon(false);
    }
  };

  const handleExecuteBulkDeleteCoupons = async (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => {
    const toDelete = getItemsInScope(
      coupons,
      scope,
      (c) => c.createdAt,
      (c) => c.id,
      selectedCouponIds,
      customStart,
      customEnd
    );

    if (toDelete.length === 0) {
      alert("No coupon codes found in the selected scope to delete.");
      return;
    }

    setIsDeletingCoupon(true);
    try {
      const idsToDelete = toDelete.map((c) => c.id);
      await offlineDb.coupons.bulkDelete(idsToDelete);
      for (const id of idsToDelete) {
        scheduleCloudDelete("coupons", id);
      }
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "coupon",
        entityId: idsToDelete.slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} coupon(s)`,
        details: `Bulk deleted ${toDelete.length} coupon code(s) (Scope: ${scope})`,
        snapshotBefore: toDelete,
        canUndo: true,
      });
      setSelectedCouponIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
      await refreshData();
      setDeleteCouponsModalOpen(false);
      setSuccessToast(`${toDelete.length} coupon codes delete ho gaye.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      console.error("Failed bulk deleting coupons:", err);
      alert("Error during bulk delete: " + (err?.message || "Unknown error"));
    } finally {
      setIsDeletingCoupon(false);
    }
  };

  // Export JSON for Web Developers
  const developerJsonString = useMemo(() => {
    const exportData = exportCouponsForWebDevelopers(
      coupons.filter((c) => c.status === "active")
    );
    return JSON.stringify(exportData, null, 2);
  }, [coupons]);

  // Download CSV for Developers / Website Admin
  const handleDownloadCsv = () => {
    const headers = [
      "Coupon Code",
      "Discount %",
      "Assigned To",
      "Business Name",
      "Phone",
      "Min Order PKR",
      "Valid Until",
      "Status",
      "Website URL",
    ];

    const rows = coupons.map((c) => [
      `"${c.code}"`,
      c.discountPercent,
      `"${c.customerName || "All"}"`,
      `"${c.customerBusinessName || ""}"`,
      `"${c.customerPhone || ""}"`,
      c.minOrderPkr,
      c.validUntil,
      c.status,
      `"${c.websiteUrl}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `noxderma_coupons_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/marketing"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1 btn-interactive"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Marketing & Schemes
          </Link>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <Ticket className="w-7 h-7 text-teal-600" />
              Customer Discount & Coupon Code Generator
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
              Web & WhatsApp Sync
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Generate random discount voucher codes, assign to existing pharmacies/clients, dispatch customized WhatsApp privilege cards, and sync active codes with noxderma.com developers.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            onClick={() => setActiveTab("generator")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === "generator"
                ? "bg-white dark:bg-slate-900 text-teal-600 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            Create Coupon
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "list"
                ? "bg-white dark:bg-slate-900 text-teal-600 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            Coupons List
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-extrabold">
              {coupons.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab("developer_sync")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === "developer_sync"
                ? "bg-white dark:bg-slate-900 text-teal-600 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            Website Dev Sync
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successToast && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-bold flex items-center gap-2.5 animate-in fade-in">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          {successToast}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: GENERATOR & LIVE WHATSAPP CARD VIEW                                */}
      {/* ========================================================================= */}
      {activeTab === "generator" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN: Input Form (7 Columns) */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. Discount Percentage & Code Generator */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    1. Discount Percentage & Coupon Code
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => handleGenerateNewCode()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 hover:bg-teal-100 border border-teal-200 dark:border-teal-800 btn-interactive"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Random
                </button>
              </div>

              {/* Quick Percentage Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Discount Percentage
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[5, 10, 15, 20, 25, 30].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setDiscountPercent(pct);
                        handleGenerateNewCode(codePrefix, pct);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                        discountPercent === pct
                          ? "bg-teal-600 text-white shadow-soft shadow-teal-600/30"
                          : "border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-teal-500"
                      }`}
                    >
                      {pct}% OFF
                    </button>
                  ))}
                  <div className="flex items-center gap-1.5 pl-2">
                    <input
                      type="number"
                      min="1"
                      max="90"
                      placeholder="10"
                      value={discountPercent === 0 ? "" : discountPercent}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setDiscountPercent(raw === "" ? 0 : parseInt(raw) || 0);
                      }}
                      className="w-16 text-xs font-bold text-center px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-teal-500"
                    />
                    <span className="text-xs font-bold text-slate-500">%</span>
                  </div>
                </div>
              </div>

              {/* Code Generator & Prefix */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Branded Prefix
                  </label>
                  <select
                    value={codePrefix}
                    onChange={(e) => {
                      const p = e.target.value;
                      setCodePrefix(p);
                      handleGenerateNewCode(p, discountPercent);
                    }}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="NOX">NOX (Noxderma)</option>
                    <option value="DERMA">DERMA (Skincare)</option>
                    <option value="PHARMA">PHARMA (Pharmacy)</option>
                    <option value="VIP">VIP (Special Partner)</option>
                    <option value="CLINIC">CLINIC (Doctor)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Coupon Code (Random or Custom)
                  </label>
                  <div className="relative">
                    <Ticket className="w-4 h-4 absolute left-3 top-2.5 text-teal-600" />
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="e.g. NOX-15-K7M2"
                      className="w-full text-xs font-black tracking-wider pl-9 pr-20 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-950/30 text-teal-900 dark:text-teal-100 uppercase focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyText(code, "code")}
                      className="absolute right-2 top-1.5 px-2 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-teal-600"
                    >
                      {copiedCode === code ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Aap isay manually bhi edit kar saktay hain jese "ALSHIFA20" ya "EID15"
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Customer Assignment */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Building2 className="w-5 h-5 text-teal-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    2. Customer / Pharmacy Assignment
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kisko yeh coupon assign karna hai? (Existing pharmacy, clinic ya general)
                  </p>
                </div>
              </div>

              {/* Assignment Scope Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "specific_customer", label: "Specific Customer" },
                  { id: "pharmacies", label: "All Pharmacies" },
                  { id: "dermatologists", label: "Dermatologists" },
                  { id: "all_customers", label: "All Customers / Web" },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setAssignedScope(s.id as CouponAssignedScope)}
                    className={`p-2.5 rounded-xl text-xs font-bold text-center border transition-all ${
                      assignedScope === s.id
                        ? "border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-900 dark:text-teal-200 shadow-sm"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Customer Selector Dropdown if Specific Customer */}
              {assignedScope === "specific_customer" && (
                <div className="space-y-3 pt-1">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search existing customer by name, pharmacy or phone..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:ring-1 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1 border border-slate-100 dark:border-slate-800 p-1.5 rounded-xl">
                    {filteredCustomers.length === 0 ? (
                      <p className="text-xs text-slate-400 p-2 text-center">
                        Koi customer nahi mila. Customer list check karein.
                      </p>
                    ) : (
                      filteredCustomers.map((cust) => (
                        <div
                          key={cust.id}
                          onClick={() => setSelectedCustomerId(cust.id)}
                          className={`p-2.5 rounded-xl cursor-pointer flex items-center justify-between transition-colors ${
                            selectedCustomerId === cust.id
                              ? "bg-teal-100/70 dark:bg-teal-950 border border-teal-300 dark:border-teal-800"
                              : "hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent"
                          }`}
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <span>{cust.businessName || cust.name}</span>
                              {cust.businessName &&
                                cust.name &&
                                cust.businessName.trim().toLowerCase() !==
                                  cust.name.trim().toLowerCase() && (
                                  <span className="text-[10px] text-slate-400 font-normal">
                                    ({cust.name})
                                  </span>
                                )}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span className="capitalize">{cust.category}</span>
                              <span>•</span>
                              <span>{cust.phone}</span>
                              {cust.city && (
                                <>
                                  <span>•</span>
                                  <span>{cust.city}</span>
                                </>
                              )}
                            </div>
                          </div>
                          {selectedCustomerId === cust.id && (
                            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Active Selected Customer Quick Pill */}
                  {selectedCustomer && (
                    <div className="p-3 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-teal-600" />
                        <div>
                          <span className="font-bold text-teal-950 dark:text-teal-200">
                            {selectedCustomer.businessName || selectedCustomer.name}
                          </span>
                          <span className="block text-[10px] text-teal-700 dark:text-teal-400">
                            WhatsApp: {selectedCustomer.whatsappNumber || selectedCustomer.phone}
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-200/80 dark:bg-teal-900 text-teal-800 dark:text-teal-300 capitalize">
                        {selectedCustomer.category}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Validity & Terms */}
            <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <Calendar className="w-5 h-5 text-teal-600" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  3. Validity, Website URL & Rules
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Expiry Date */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Expiry Date (Last Valid Date)
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-bold text-teal-600 dark:text-teal-400 select-none">
                      <input
                        type="checkbox"
                        checked={isNoExpiry}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setIsNoExpiry(checked);
                          if (checked) {
                            setValidUntil("no_expiry");
                            setValidDays(0);
                          } else {
                            setValidDays(30);
                            setValidUntil(
                              new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
                            );
                          }
                        }}
                        className="w-3.5 h-3.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                      />
                      <span>No Expiry (Lifetime)</span>
                    </label>
                  </div>

                  {isNoExpiry ? (
                    <div className="w-full text-xs font-bold px-3 py-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <InfinityIcon className="w-4 h-4 text-teal-600" />
                        No Expiry (Hamesha ke liye active rahe ga)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsNoExpiry(false);
                          setValidDays(30);
                          setValidUntil(
                            new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
                          );
                        }}
                        className="text-[10px] text-teal-700 dark:text-teal-300 underline font-semibold"
                      >
                        Set Specific Date
                      </button>
                    </div>
                  ) : (
                    <input
                      type="date"
                      value={validUntil === "no_expiry" ? "" : validUntil}
                      onChange={(e) => {
                        setValidUntil(e.target.value);
                        setIsNoExpiry(false);
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-1 focus:ring-teal-500"
                    />
                  )}

                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {[7, 14, 30, 60, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleValidDaysChange(d)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border transition-all ${
                          !isNoExpiry && validDays === d
                            ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                            : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                        }`}
                      >
                        +{d} Days
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleValidDaysChange(0)}
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-lg border flex items-center gap-1 transition-all ${
                        isNoExpiry
                          ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                          : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                      }`}
                    >
                      <InfinityIcon className="w-3 h-3" />
                      No Expiry
                    </button>
                  </div>
                </div>

                {/* Min Order Value */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Min Order Value (PKR)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-xs font-bold text-slate-400">
                      ₨
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={minOrderPkr || ""}
                      onChange={(e) => setMinOrderPkr(parseFloat(e.target.value) || 0)}
                      placeholder="0 (No Minimum)"
                      className="w-full text-xs font-semibold pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Agar koi shart nahi to 0 chorr dein
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                {/* Website Redemption URL */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Website URL to Redeem
                  </label>
                  <div className="relative">
                    <Globe2 className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      value={websiteUrl}
                      onChange={(e) => setWebsiteUrl(e.target.value)}
                      className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-1 focus:ring-teal-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    Jahan customer ja kar order place karega
                  </span>
                </div>

                {/* Usage Limit */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Usage Allowance
                  </label>
                  <select
                    value={usageLimit}
                    onChange={(e) => setUsageLimit(e.target.value as CouponUsageLimit)}
                    className="w-full text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="single_use">Single Use (1 Order Only)</option>
                    <option value="multi_use">Multi Use (Multiple Orders)</option>
                    <option value="unlimited">Unlimited during validity</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => handleGenerateNewCode()}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 btn-interactive"
                >
                  Reset Form
                </button>

                <button
                  type="button"
                  onClick={handleSaveCoupon}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-soft shadow-teal-600/30 btn-interactive"
                >
                  <Ticket className="w-4 h-4" />
                  Save & Activate Coupon
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: WhatsApp Card Live Phone Simulator (5 Columns) */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
            {/* Phone Card Mockup */}
            <div className="rounded-3xl border-2 border-slate-800 dark:border-slate-700 bg-slate-900 p-4 shadow-xl text-white space-y-3">
              {/* Phone Header Bar */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">
                      WhatsApp Privilege Card
                    </h4>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      Ready to Send
                    </span>
                  </div>
                </div>

                {/* Tone Switcher */}
                <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-lg">
                  <button
                    onClick={() => setWhatsappTone("roman_urdu")}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      whatsappTone === "roman_urdu"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Roman Urdu
                  </button>
                  <button
                    onClick={() => setWhatsappTone("formal_english")}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      whatsappTone === "formal_english"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    English
                  </button>
                  <button
                    onClick={() => setWhatsappTone("urdu_nastaliq")}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      whatsappTone === "urdu_nastaliq"
                        ? "bg-emerald-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    اردو
                  </button>
                </div>
              </div>

              {/* Simulated Chat Bubble */}
              <div className="bg-[#0b141a] rounded-2xl p-4 border border-slate-800/80 space-y-3 font-sans">
                <div className="p-3.5 rounded-xl bg-[#005c4b]/30 border border-[#005c4b] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                      Voucher Code Card
                    </span>
                    <span className="text-xs font-black text-white px-2 py-0.5 bg-emerald-500/30 rounded-full border border-emerald-400/30">
                      {discountPercent}% OFF
                    </span>
                  </div>

                  <div className="text-center py-2 border-y border-emerald-500/20">
                    <span className="text-[10px] text-slate-400 block">EXCLUSIVE COUPON</span>
                    <span className="text-lg font-black tracking-widest text-emerald-300 font-mono">
                      {code}
                    </span>
                  </div>

                  <div className="flex justify-between text-[10px] text-slate-300">
                    <span>
                      Valid until:{" "}
                      <strong>
                        {isNoExpiry || validUntil === "no_expiry" ? "Lifetime (No Expiry)" : validUntil}
                      </strong>
                    </span>
                    <span>Website: <strong>noxderma.com</strong></span>
                  </div>
                </div>

                {/* Preformatted WhatsApp Message Body */}
                <div className="p-3 rounded-xl bg-[#202c33] text-[11px] leading-relaxed text-slate-200 font-mono whitespace-pre-wrap max-h-72 overflow-y-auto border border-slate-700">
                  {currentWhatsAppMessage}
                </div>
              </div>

              {/* Action Buttons for WhatsApp */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleCopyText(currentWhatsAppMessage, "message")}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors btn-interactive"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedMessage ? "Copied Text!" : "Copy WhatsApp Text"}
                </button>

                <button
                  type="button"
                  onClick={() => handleOpenWhatsApp()}
                  className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-soft shadow-emerald-600/30 transition-colors btn-interactive"
                >
                  <Send className="w-3.5 h-3.5" />
                  Send WhatsApp Chat
                </button>
              </div>

              {/* Recipient note */}
              {assignedScope === "specific_customer" && selectedCustomer && (
                <div className="text-[10px] text-slate-400 text-center">
                  Will send to: <strong>{selectedCustomer.businessName || selectedCustomer.name}</strong> ({selectedCustomer.whatsappNumber || selectedCustomer.phone})
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ACTIVE COUPONS LIST & HISTORY                                      */}
      {/* ========================================================================= */}
      {activeTab === "list" && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Ticket className="w-5 h-5 text-teal-600" />
                Active Coupons & Customer Codes ({displayedCoupons.length})
              </h3>
              <p className="text-xs text-slate-500">
                All promotional vouchers issued to pharmacies and clients
              </p>
            </div>

            {/* Table Search & Status Filter & Bulk Deletion */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search code or customer..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  className="text-xs font-medium pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value="all">All Statuses</option>
                <option value="active">Active Only</option>
                <option value="disabled">Disabled</option>
                <option value="expired">Expired</option>
              </select>

              <button
                onClick={handleDownloadCsv}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>

              {selectedCouponIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDeleteCouponsModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected ({selectedCouponIds.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => setDeleteCouponsModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete / Purge
              </button>
            </div>
          </div>

          {/* Table */}
          {displayedCoupons.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <Ticket className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Abhi tak koi coupon code create nahi hua.
              </p>
              <button
                onClick={() => setActiveTab("generator")}
                className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold"
              >
                Generate First Coupon
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          displayedCoupons.length > 0 &&
                          displayedCoupons.every((c) => selectedCouponIds.includes(c.id))
                        }
                        onChange={handleToggleSelectAllCoupons}
                        className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        title="Select All"
                      />
                    </th>
                    <th className="py-2.5 px-3">Coupon Code</th>
                    <th className="py-2.5 px-3">Discount</th>
                    <th className="py-2.5 px-3">Assigned To</th>
                    <th className="py-2.5 px-3">Phone / WhatsApp</th>
                    <th className="py-2.5 px-3">Valid Until</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {displayedCoupons.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      {/* Selection Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedCouponIds.includes(c.id)}
                          onChange={() => handleToggleSelectCoupon(c.id)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>

                      {/* Code */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950 px-2 py-0.5 rounded-lg border border-teal-200 dark:border-teal-800">
                            {c.code}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(c.code, "code")}
                            className="p-1 hover:text-teal-600 text-slate-400"
                            title="Copy code"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>

                      {/* Discount % */}
                      <td className="py-3 px-3">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {c.discountPercent}% OFF
                        </span>
                        {c.minOrderPkr > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            Min: Rs. {c.minOrderPkr}
                          </span>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          {c.customerBusinessName || c.customerName || "All Customers"}
                        </span>
                        {c.customerBusinessName &&
                          c.customerName &&
                          c.customerBusinessName.trim().toLowerCase() !==
                            c.customerName.trim().toLowerCase() && (
                            <span className="block text-[10px] text-slate-400">
                              Attn: {c.customerName}
                            </span>
                          )}
                      </td>

                      {/* Phone */}
                      <td className="py-3 px-3">
                        <span className="text-slate-600 dark:text-slate-400 font-mono">
                          {c.customerPhone || "—"}
                        </span>
                      </td>

                      {/* Valid Until */}
                      <td className="py-3 px-3">
                        <span className="text-slate-700 dark:text-slate-300">
                          {c.validUntil === "no_expiry" || !c.validUntil ? (
                            <span className="inline-flex items-center gap-1 font-bold text-teal-600 dark:text-teal-400">
                              <InfinityIcon className="w-3.5 h-3.5" /> No Expiry
                            </span>
                          ) : (
                            c.validUntil
                          )}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            c.status === "active"
                              ? "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300"
                              : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {c.customerPhone && (
                            <button
                              onClick={() => {
                                const msg = buildWhatsAppCouponMessage({
                                  customerName: c.customerName || "Valued Client",
                                  businessName: c.customerBusinessName,
                                  couponCode: c.code,
                                  discountPercent: c.discountPercent,
                                  validUntil: c.validUntil,
                                  minOrderPkr: c.minOrderPkr,
                                  websiteUrl: c.websiteUrl,
                                  brandName: settings?.brandName || "Noxderma",
                                  tone: "roman_urdu",
                                });
                                handleOpenWhatsApp(c.customerPhone, msg);
                              }}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60"
                              title="Send on WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                          )}

                          <button
                            onClick={() => handleToggleStatus(c)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800"
                            title={c.status === "active" ? "Deactivate" : "Activate"}
                          >
                            <Sliders className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteCoupon(c)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60"
                            title="Delete coupon"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: WEB DEVELOPER & WEBSITE SYNC                                       */}
      {/* ========================================================================= */}
      {activeTab === "developer_sync" && (
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Code2 className="w-5 h-5 text-teal-600" />
                  Website Developer Export & Validation Snippet
                </h3>
                <p className="text-xs text-slate-500">
                  Aapke web developers is JSON ya CSV ko apni website (noxderma.com) k checkout logic mein paste kar saktay hain.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download CSV
                </button>
                <button
                  onClick={() => handleCopyText(developerJsonString, "json")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedJson ? "JSON Copied!" : "Copy Active JSON"}
                </button>
              </div>
            </div>

            {/* Code Display Area */}
            <div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                <span>Active Coupon Codes JSON:</span>
                <span>
                  {coupons.filter((c) => c.status === "active").length} active vouchers
                </span>
              </div>
              <pre className="p-4 rounded-xl bg-slate-950 text-emerald-400 font-mono text-xs overflow-x-auto max-h-72 border border-slate-800">
                {developerJsonString}
              </pre>
            </div>

            {/* Instructions for Website Developers */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <h4 className="font-bold flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                <Info className="w-4 h-4 text-teal-600" />
                How Developers Implement This on noxderma.com:
              </h4>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                <li>
                  <strong>Checkout Input Field:</strong> Website cart / checkout page par ek input box rakhein: <em>"Enter Coupon Code"</em>.
                </li>
                <li>
                  <strong>Validation Match:</strong> User jab code enter kare, to is list mein match karein: <code>code.toUpperCase() === inputCode</code>.
                </li>
                <li>
                  <strong>Expiry Check:</strong> Check karein{" "}
                  <code>coupon.validUntil === &quot;no_expiry&quot; || new Date() &lt;= new Date(validUntil)</code>.
                </li>
                <li>
                  <strong>Discount Calculation:</strong> Total cart value par <code>discountPercentage</code> deduct karein:  
                  <code>discountAmount = (cartTotal * coupon.discountPercentage) / 100</code>.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={deleteCouponsModalOpen}
        onClose={() => setDeleteCouponsModalOpen(false)}
        onConfirmDelete={handleExecuteBulkDeleteCoupons}
        entityName="Coupon Codes"
        selectedCount={selectedCouponIds.length}
        totalCount={coupons.length}
        countsByScope={couponScopeCounts}
        isDeleting={isDeletingCoupon}
      />

      {/* Single Delete Modal */}
      <SingleDeleteModal
        isOpen={!!deletingCoupon}
        onClose={() => setDeletingCoupon(null)}
        onConfirm={handleExecuteSingleDeleteCoupon}
        title="Delete Coupon Code"
        itemName={deletingCoupon ? `${deletingCoupon.code} (${deletingCoupon.discountPercent}% OFF)` : ""}
        isDeleting={isDeletingCoupon}
      />
    </div>
  );
}
