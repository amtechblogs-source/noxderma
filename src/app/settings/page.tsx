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
  ShieldAlert,
  ArrowLeft,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  Globe,
} from "lucide-react";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@/types";
import { offlineDb } from "@/lib/offline/db";

export default function BusinessSettingsPage() {
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = await offlineDb.settings.get("primary");
        if (stored) {
          setSettings(stored);
        } else {
          await offlineDb.settings.put(DEFAULT_BUSINESS_SETTINGS);
        }
      } catch (err) {
        console.warn("Could not load stored business settings:", err);
      }
    }
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated: BusinessSettings = {
        ...settings,
        updatedAt: new Date().toISOString(),
        updatedBy: "usr_admin",
      };
      await offlineDb.settings.put(updated);
      setSettings(updated);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 4000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      alert("Error saving settings to local storage.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Settings className="w-6 h-6 text-teal-600" />
            Central Business Configuration & Branding
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Centrally configured legal identity, invoice numbering, credit terms, and clinical policies.
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
        {/* Section 1: Business Identity & Legal Information */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            1. Legal & Brand Identity
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Legal Entity Name
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
                Display Brand Name
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
                Registered Address (Appears on Invoices & Certificates)
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
                UAN Contact Phone
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
                Contact Email
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
                Official Website
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

        {/* Section 2: Financial, Currency & Locale */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-teal-600" />
            2. Currency & Timezone Policies
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Base Currency</label>
              <input
                type="text"
                disabled
                value={`${settings.currency} (${settings.currencySymbol})`}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-bold text-slate-500 cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Default: Pakistani Rupee (PKR)</span>
            </div>

            <div>
              <label className="block font-semibold mb-1">Operating Timezone</label>
              <input
                type="text"
                disabled
                value={settings.timezone}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 font-bold text-slate-500 cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">Default: Asia/Karachi (PKT)</span>
            </div>

            <div>
              <label className="block font-semibold mb-1">Default Credit Terms</label>
              <input
                type="number"
                value={settings.defaultCreditTermsDays}
                onChange={(e) =>
                  setSettings({ ...settings, defaultCreditTermsDays: Number(e.target.value) || 30 })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
              <span className="text-[10px] text-teal-600 mt-1 block">
                Triggers overdue payment reminder on Day 31
              </span>
            </div>
          </div>
        </div>

        {/* Section 3: Invoice Prefix & Payment Instructions */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-teal-600" />
            3. Invoicing Policy & Settlement Instructions
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Official Invoice Prefix</label>
              <input
                type="text"
                value={settings.invoicePrefix}
                onChange={(e) => setSettings({ ...settings, invoicePrefix: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-1 block">
                Generates references like: {settings.invoicePrefix}-2026-00001
              </span>
            </div>

            <div>
              <label className="block font-semibold mb-1">Standard Delivery Fee (PKR)</label>
              <input
                type="number"
                value={settings.defaultDeliverySettings.standardCharge}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    defaultDeliverySettings: {
                      ...settings.defaultDeliverySettings,
                      standardCharge: Number(e.target.value) || 0,
                    },
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Official Bank Account & Settlement Instructions</label>
              <textarea
                rows={2}
                value={settings.paymentInstructions}
                onChange={(e) => setSettings({ ...settings, paymentInstructions: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block font-semibold mb-1">Printable Invoice Footer Message</label>
              <input
                type="text"
                value={settings.invoiceFooter}
                onChange={(e) => setSettings({ ...settings, invoiceFooter: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section 4: Clinical Shelf-life & FEFO Expiry Policies */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-600" />
            4. FEFO Expiry & Quarantine Controls
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold mb-1">Low-Stock Alert Threshold (Default Units)</label>
              <input
                type="number"
                value={settings.lowStockThresholdDefault}
                onChange={(e) =>
                  setSettings({ ...settings, lowStockThresholdDefault: Number(e.target.value) || 10 })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Expiry Enforcement Policy</label>
              <select
                value={settings.expiryBlockingPolicy}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    expiryBlockingPolicy: e.target.value as "block_sale" | "warn_admin_override",
                  })
                }
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold"
              >
                <option value="block_sale">Strict Block: Zero sales permitted for expired batches</option>
                <option value="warn_admin_override">Warning with mandatory Admin override reason</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save Business Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}
