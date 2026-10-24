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

      // 1. Save to local Dexie IndexedDB for instant offline-first access
      await offlineDb.settings.put(updated);
      setSettings(updated);

      // 2. Save directly to Server Database (/api/settings)
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
        // 3. If offline, enqueue operation into outbox queue
        await enqueueOperation(
          "settings",
          "primary",
          "update",
          updated as unknown as Record<string, unknown>,
          "usr_admin",
          "Administrator"
        );
      }

      // 4. Also try direct Firebase Firestore write
      try {
        const { db } = await import("@/lib/firebase/config");
        const { doc, setDoc } = await import("firebase/firestore");
        await setDoc(doc(db, "organizationSettings", "primary"), updated, { merge: true });
      } catch (firestoreErr) {
        console.warn("Client Firestore notice:", firestoreErr);
      }

      setIsSaved(true);

      // Notify Sidebar and Header to immediately re-render logos
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("noxderma_settings_updated"));
      }

      setTimeout(() => setIsSaved(false), 4000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Error saving settings.");
    } finally {
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
        {/* Section 1: Color Themes (Dark Mode Compatible) */}
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" />
              1. Color Themes (5 Options &bull; Dark Mode Compatible)
            </h2>
            <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400">
              Active: {currentTheme.name}
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Aap apni pasand ka color theme chun saktay hain jo poori app, buttons, badges aur dark mode ma khubsurat nazar aayega.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {availableThemes.map((t) => {
              const isSelected = themeId === t.id;
              return (
                <div
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col justify-between ${
                    isSelected
                      ? "border-teal-500 bg-teal-50/20 dark:bg-teal-950/20 shadow-md"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full shadow-sm"
                        style={{ backgroundColor: t.primaryColor }}
                      />
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {t.name}
                      </span>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px]">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 mb-3">{t.description}</p>

                  <div className="flex items-center gap-2 text-[10px] font-mono">
                    <span
                      className="px-2 py-0.5 rounded font-bold text-white shadow-sm"
                      style={{ backgroundColor: t.primaryColor }}
                    >
                      Button Primary
                    </span>
                    <span className="px-2 py-0.5 rounded font-semibold text-slate-500 bg-slate-100 dark:bg-slate-700">
                      {t.nameUrdu}
                    </span>
                  </div>
                </div>
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
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Settings (Mehfooz Karein)"}
          </button>
        </div>
      </form>
    </div>
  );
}
