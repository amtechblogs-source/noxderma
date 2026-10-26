"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Settings,
  Save,
  CheckCircle2,
  Building2,
  Receipt,
  Clock,
  ArrowLeft,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  Globe,
  Palette,
  Image as ImageIcon,
  Upload,
  Trash2,
  Check,
  Eye,
  UserCheck,
  Loader2,
} from "lucide-react";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@/types";
import { offlineDb } from "@/lib/offline/db";
import { enqueueOperation } from "@/lib/offline/outbox";
import { imageStorage } from "@/lib/image-storage/service";
import { useTheme, type ThemeId } from "@/context/ThemeContext";

export default function BusinessSettingsPage() {
  const { currentTheme, themeId, setTheme, availableThemes } = useTheme();
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      // 1. Try local offline storage first for instant render
      try {
        const stored = await offlineDb.settings.get("primary");
        if (stored) {
          setSettings(stored);
        }
      } catch (err) {
        console.warn("Could not load stored business settings:", err);
      }

      // 2. Fetch authoritative database settings from server (/api/settings)
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data?.settings) {
            setSettings(data.settings);
            await offlineDb.settings.put(data.settings);
            if (data.settings.colorTheme) {
              setTheme(data.settings.colorTheme as ThemeId);
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch remote settings:", err);
      }
    }
    loadSettings();
  }, []);

  // Helper to compress logo image on client-side canvas so it fits smoothly in any database
  const compressImage = (file: File, maxWidth = 500, maxHeight = 500): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/png", 0.9));
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Handle image upload with dual-storage: compressed local data URL + permanent cloud upload
  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "appLogoUrl" | "invoiceLogoUrl"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB.");
      return;
    }

    setIsUploadingLogo(true);
    try {
      // 1. Immediately compress for zero-lag UI display and database safety
      const compressedDataUrl = await compressImage(file);
      setSettings((prev) => ({
        ...prev,
        [field]: compressedDataUrl,
      }));

      // 2. Also attempt permanent cloud upload via ImageKit provider
      try {
        const cloudUrl = await imageStorage.uploadLogo(file, "/logos");
        if (cloudUrl) {
          setSettings((prev) => ({
            ...prev,
            [field]: cloudUrl,
          }));
        }
      } catch (cloudErr) {
        console.log("ImageKit upload bypassed, using high-resolution compressed data URL:", cloudErr);
      }
    } catch (err) {
      console.error("Failed to process image:", err);
      alert("Error reading image file.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: BusinessSettings = {
        ...settings,
        colorTheme: themeId,
        updatedAt: new Date().toISOString(),
        updatedBy: "usr_admin",
      };

      // 1. Instantly save to local Dexie IndexedDB (< 5ms)
      await offlineDb.settings.put(updated);
      setSettings(updated);

      // 2. Immediately notify Sidebar, Header, Reports, and other modules
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("noxderma_settings_updated"));
      }

      // 3. Quick, crisp visual feedback (150ms) so user feels instant response
      await new Promise((resolve) => setTimeout(resolve, 150));
      setIsSaved(true);
      setIsSaving(false);
      setTimeout(() => setIsSaved(false), 3000);

      // 4. Background Sync: Server Database & Cloud Firestore (Completely non-blocking)
      (async () => {
        try {
          const res = await fetch("/api/settings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updated),
          });
          if (!res.ok) {
            console.warn("Server settings write returned status:", res.status);
          }
        } catch (netErr) {
          console.warn("Offline: enqueued settings for automatic cloud synchronization:", netErr);
          await enqueueOperation(
            "settings",
            "primary",
            "update",
            updated as unknown as Record<string, unknown>,
            "usr_admin",
            "Administrator"
          );
        }

        try {
          const { db } = await import("@/lib/firebase/config");
          const { doc, setDoc } = await import("firebase/firestore");
          setDoc(doc(db, "organizationSettings", "primary"), updated, { merge: true }).catch((err) => {
            console.warn("Background Firestore sync note:", err);
          });
        } catch {}
      })();
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Error saving settings.");
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Settings className="w-6 h-6 text-teal-600" />
            Company Settings & Themes
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Choose from 5 color themes, upload software UI and invoice print logos, and configure company details.
          </p>
        </div>

        {isSaved && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-xs font-bold border border-teal-200 dark:border-teal-800 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-teal-600" />
            Settings Saved
          </span>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Color Themes (Visual Palette) */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" />
              Theme Color
            </h2>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <span
                className="w-2.5 h-2.5 rounded-full shadow-sm"
                style={{ backgroundColor: currentTheme.primaryColor }}
              />
              <span>{currentTheme.name.split(" ")[0]}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {availableThemes.map((t) => {
              const isSelected = themeId === t.id;
              const shortName =
                t.id === "teal"
                  ? "Emerald"
                  : t.id === "indigo"
                  ? "Sapphire"
                  : t.id === "violet"
                  ? "Violet"
                  : t.id === "rose"
                  ? "Ruby"
                  : "Amber";

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`group text-left p-3 rounded-xl border-2 transition-all relative flex flex-col gap-2.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                    isSelected
                      ? "bg-teal-50/20 dark:bg-teal-950/20 shadow-sm"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40 hover:-translate-y-0.5"
                  }`}
                  style={isSelected ? { borderColor: t.primaryColor } : undefined}
                >
                  {/* Top Bar: Color Dot, Short Name & Selection Check */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm transition-transform group-hover:scale-110"
                        style={{ backgroundColor: t.primaryColor }}
                      />
                      <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {shortName}
                      </span>
                    </div>

                    <span
                      className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        isSelected
                          ? "text-white shadow-xs"
                          : "border border-slate-300 dark:border-slate-600"
                      }`}
                      style={isSelected ? { backgroundColor: t.primaryColor } : undefined}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </span>
                  </div>

                  {/* Visual Mini UI Window Preview */}
                  <div className="w-full h-18 rounded-lg overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-100/70 dark:bg-slate-900/90 flex flex-col p-1.5 gap-1.5 shadow-inner select-none pointer-events-none">
                    {/* Mini Header Strip */}
                    <div className="flex items-center justify-between px-0.5">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.primaryColor }} />
                        <span className="w-6 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                      </div>
                      <span className="w-3 h-1 rounded-full bg-slate-200 dark:bg-slate-800" />
                    </div>

                    {/* Mini App Body */}
                    <div className="flex-1 flex gap-1 min-h-0">
                      {/* Mini Sidebar */}
                      <div className="w-3.5 rounded bg-slate-200/80 dark:bg-slate-800 flex flex-col items-center py-1 gap-0.5 shrink-0">
                        <span className="w-1.5 h-0.5 rounded-xs" style={{ backgroundColor: t.primaryColor }} />
                        <span className="w-1.5 h-0.5 rounded-xs bg-slate-300 dark:bg-slate-700" />
                        <span className="w-1.5 h-0.5 rounded-xs bg-slate-300 dark:bg-slate-700" />
                      </div>

                      {/* Mini Card & Buttons */}
                      <div className="flex-1 flex flex-col justify-between p-1 rounded bg-white dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/50">
                        <div className="flex items-center justify-between">
                          <span className="w-5 h-1 rounded bg-slate-200 dark:bg-slate-700" />
                          <span
                            className="w-2.5 h-1 rounded-full"
                            style={{ backgroundColor: t.primaryColor, opacity: 0.3 }}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            className="h-2.5 px-1.5 rounded-xs flex items-center justify-center shadow-xs"
                            style={{ backgroundColor: t.primaryColor }}
                          >
                            <span className="w-2 h-0.5 rounded-full bg-white" />
                          </span>
                          <span
                            className="h-2.5 flex-1 rounded-xs border"
                            style={{
                              backgroundColor: t.accentBg,
                              borderColor: t.primaryColor,
                              opacity: 0.8,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Visual Color Bar Strip */}
                    <div
                      className="h-1 w-full rounded-full"
                      style={{
                        background: `linear-gradient(to right, ${t.primaryColor}, ${t.darkPrimaryColor}, ${t.accentBg})`,
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Software UI Logo & Print Invoice Logo */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-teal-600" />
            2. Software UI Logo & Invoice Print Logo
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
            {/* UI Logo Card */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Software / UI Brand Logo
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Sidebar aur app header ma show honay wala logo
                </span>
              </div>

              {/* Preview Box */}
              <div className="h-24 rounded-lg bg-slate-900 flex items-center justify-center p-3 border border-slate-800">
                {settings.appLogoUrl ? (
                  <img
                    src={settings.appLogoUrl}
                    alt="UI Logo Preview"
                    className="max-h-16 max-w-full object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-white">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-teal-400 flex items-center justify-center font-bold text-sm">
                      ND
                    </div>
                    <span className="font-extrabold text-sm tracking-tight">NOXDERMA</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer transition-colors shadow-sm">
                  <Upload className="w-3.5 h-3.5" />
                  Upload UI Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "appLogoUrl")}
                    className="hidden"
                  />
                </label>

                {settings.appLogoUrl && (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, appLogoUrl: "" })}
                    className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                    title="Remove Logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Or paste image URL (e.g. https://...)"
                value={settings.appLogoUrl || ""}
                onChange={(e) => setSettings({ ...settings, appLogoUrl: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
              />
            </div>

            {/* Print Logo Card */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
              <div>
                <span className="font-bold text-slate-900 dark:text-slate-100 block">
                  Print Logo (Bills & Invoices)
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Print honay walay customer bills / receipts k ooper show ho ga
                </span>
              </div>

              {/* Preview Box */}
              <div className="h-24 rounded-lg bg-white border border-slate-300 flex items-center justify-center p-3">
                {settings.invoiceLogoUrl ? (
                  <img
                    src={settings.invoiceLogoUrl}
                    alt="Invoice Print Logo Preview"
                    className="max-h-16 max-w-full object-contain"
                  />
                ) : (
                  <div className="text-center">
                    <span className="font-extrabold text-sm tracking-tight text-slate-900 block">
                      NOXDERMA PHARMA
                    </span>
                    <span className="text-[10px] text-slate-400">Default Text Brand on Bills</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold cursor-pointer transition-colors shadow-sm">
                  <Upload className="w-3.5 h-3.5" />
                  Upload Print Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, "invoiceLogoUrl")}
                    className="hidden"
                  />
                </label>

                {settings.invoiceLogoUrl && (
                  <button
                    type="button"
                    onClick={() => setSettings({ ...settings, invoiceLogoUrl: "" })}
                    className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
                    title="Remove Logo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <input
                type="text"
                placeholder="Or paste invoice logo image URL..."
                value={settings.invoiceLogoUrl || ""}
                onChange={(e) => setSettings({ ...settings, invoiceLogoUrl: e.target.value })}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px]"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Business Identity & Contact */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            3. Company Name & Contact Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Company Full Registered Name
              </label>
              <input
                type="text"
                value={settings.legalName}
                onChange={(e) => setSettings({ ...settings, legalName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Company Brand Name (Prints on Bills)
              </label>
              <input
                type="text"
                value={settings.brandName}
                onChange={(e) => setSettings({ ...settings, brandName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                Company Owner / Proprietor Name
              </label>
              <input
                type="text"
                placeholder="e.g. Muhammad Farhan"
                value={settings.ownerName || ""}
                onChange={(e) => setSettings({ ...settings, ownerName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Prints as "Prepared by: [Name] (Owner)" on Price Estimator and official sheets
              </span>
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Owner Role / Designation
              </label>
              <input
                type="text"
                placeholder="Owner"
                value={settings.ownerRole || "Owner"}
                onChange={(e) => setSettings({ ...settings, ownerRole: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                Office / Godown Address (Prints on Bills)
              </label>
              <input
                type="text"
                value={settings.address}
                onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                Office Phone Number
              </label>
              <input
                type="text"
                value={settings.contactPhone}
                onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                Official WhatsApp Number (Click-to-Chat)
              </label>
              <input
                type="text"
                value={settings.whatsappNumber}
                onChange={(e) => setSettings({ ...settings, whatsappNumber: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                Email Address
              </label>
              <input
                type="email"
                value={settings.email}
                onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Globe className="w-3.5 h-3.5 text-slate-400" />
                Website (Optional)
              </label>
              <input
                type="url"
                value={settings.website}
                onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Bill Settings & Payment Instructions */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-teal-600" />
            4. Bill Settings & Bank Account Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Bill Number Prefix (e.g. BILL or INV)</label>
              <input
                type="text"
                value={settings.invoicePrefix}
                onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Standard Udhaar Days (Credit Days)</label>
              <input
                type="number"
                placeholder="30"
                value={settings.defaultCreditTermsDays === 0 ? "" : settings.defaultCreditTermsDays}
                onChange={(e) => {
                  const raw = e.target.value;
                  setSettings({ ...settings, defaultCreditTermsDays: raw === "" ? 0 : Number(raw) || 0 });
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Bank Account Details (Prints on Bill for Payment)</label>
              <textarea
                rows={2}
                value={settings.paymentInstructions}
                onChange={(e) => setSettings({ ...settings, paymentInstructions: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Bill Footer Note / Disclaimer</label>
              <input
                type="text"
                value={settings.invoiceFooter}
                onChange={(e) => setSettings({ ...settings, invoiceFooter: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white text-xs md:text-sm font-bold shadow-lg transition-all disabled:opacity-50 ${
              isSaved
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
                : "bg-teal-600 hover:bg-teal-700 shadow-teal-600/30"
            }`}
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : isSaved ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Settings Saved!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Settings
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
