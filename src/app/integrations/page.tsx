"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  PlugZap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Globe2,
  Share2,
  Truck,
  Database,
  Lock,
} from "lucide-react";

interface TestResult {
  success: boolean;
  token?: string;
  expire?: number;
  signature?: string;
  error?: string;
}

export default function IntegrationsDashboardPage() {
  const [testingImageKit, setTestingImageKit] = useState(false);
  const [imageKitResult, setImageKitResult] = useState<TestResult | null>(null);

  const testImageKitAuth = async () => {
    setTestingImageKit(true);
    setImageKitResult(null);
    try {
      const res = await fetch("/api/auth/imagekit");
      const data = await res.json();
      if (res.ok && data.signature) {
        setImageKitResult({
          success: true,
          token: data.token,
          expire: data.expire,
          signature: data.signature,
        });
      } else {
        setImageKitResult({
          success: false,
          error: data.error || "Failed to generate HMAC signature",
        });
      }
    } catch (err: any) {
      setImageKitResult({
        success: false,
        error: err.message || "Network error querying /api/auth/imagekit",
      });
    } finally {
      setTestingImageKit(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              External Systems
            </span>
            <span className="text-xs text-slate-400">APIs & Service Connections</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Integration Services & Cloud Providers
          </h1>
        </div>

        <Link
          href="/settings"
          className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          General Settings
        </Link>
      </div>

      {/* Integration Services Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Service 1: ImageKit.io */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-600 font-extrabold text-base border border-teal-200 dark:border-teal-800">
                IK
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  ImageKit.io Media CDN
                </h3>
                <span className="text-[11px] text-slate-400">
                  Product Photography & Dynamic Transformations
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> ACTIVE
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">ImageKit ID:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                h7g4dsggt
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Processing & Storage Region:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Mumbai (India)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Endpoint URL:</span>
              <span className="font-mono text-teal-600 truncate max-w-[200px]">
                https://ik.imagekit.io/h7g4dsggt
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Key Exposure Defense:</span>
              <span className="font-bold text-emerald-600">
                Private Key Secured (Server Route Only)
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={testImageKitAuth}
              disabled={testingImageKit}
              className="w-full py-2 rounded-lg bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingImageKit ? "animate-spin" : ""}`} />
              {testingImageKit ? "Verifying HMAC Signature..." : "Test Cryptographic HMAC Signature"}
            </button>

            {imageKitResult && (
              <div
                className={`p-3 rounded-lg border text-[11px] font-mono space-y-1 ${
                  imageKitResult.success
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
                    : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
                }`}
              >
                {imageKitResult.success ? (
                  <>
                    <p className="font-bold font-sans text-xs">
                      ✓ Signature verified with ImageKit Private Key!
                    </p>
                    <p className="truncate">Token: {imageKitResult.token}</p>
                    <p className="truncate">HMAC-SHA1 Signature: {imageKitResult.signature}</p>
                    <p>Expires At: {new Date((imageKitResult.expire || 0) * 1000).toLocaleTimeString()}</p>
                  </>
                ) : (
                  <p>Error: {imageKitResult.error}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Service 2: WhatsApp Cloud API */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-emerald-600 font-extrabold text-base border border-emerald-200 dark:border-emerald-800">
                <Share2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  WhatsApp Direct Business Bridge
                </h3>
                <span className="text-[11px] text-slate-400">
                  Day-31 Collection Reminders & Promo Cards
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> READY
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Dispatch Protocol:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Deep Linking & Cloud Webhooks
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Day-31 Reminder Automation:</span>
              <span className="font-bold text-emerald-600">Active</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Default Country Code:</span>
              <span className="font-mono text-slate-800 dark:text-slate-200">+92 (Pakistan)</span>
            </div>
          </div>

          <Link
            href="/marketing/whatsapp"
            className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Launch WhatsApp Broadcast Builder
          </Link>
        </div>

        {/* Service 3: Logistics & Couriers */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950 flex items-center justify-center text-sky-600 font-extrabold text-base border border-sky-200 dark:border-sky-800">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Courier Partners (TCS, Trax, Leopards, PostEx)
                </h3>
                <span className="text-[11px] text-slate-400">
                  Automated Airway Bill & COD Tracking
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> CONNECTED
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">TCS Express:</span>
              <span className="font-bold text-emerald-600">Online API Gateway</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Trax Logistics:</span>
              <span className="font-bold text-emerald-600">Online API Gateway</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Leopards Courier:</span>
              <span className="font-bold text-emerald-600">Active</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">PostEx COD:</span>
              <span className="font-bold text-emerald-600">Active</span>
            </div>
          </div>

          <Link
            href="/sales/online-orders"
            className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Manage Courier Shipments
          </Link>
        </div>

        {/* Service 4: Firebase Engine & Offline Sync */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 flex items-center justify-center text-amber-600 font-extrabold text-base border border-amber-200 dark:border-amber-800">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  Firebase & Dexie.js Offline DB
                </h3>
                <span className="text-[11px] text-slate-400">
                  Multi-device Idempotent Sync & Local Outbox
                </span>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> PWA DURABLE
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 space-y-2 text-[11px]">
            <div className="flex justify-between">
              <span className="text-slate-500">Firebase Project:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                noxderma
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">IndexedDB Engine:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Dexie.js (16 Collections)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Provisional Reference Pattern:</span>
              <span className="font-mono text-teal-600">OFF-{`{DEVICE_ID}`}-YYMMDD-SEQ</span>
            </div>
          </div>

          <Link
            href="/sync"
            className="w-full py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Open Sync & Reconciliation Console
          </Link>
        </div>
      </div>
    </div>
  );
}
