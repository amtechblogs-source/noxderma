"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  BellRing,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Share2,
  Barcode,
  CreditCard,
  Building2,
  Calendar,
  Send,
  Boxes,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Customer, InventoryBatch, Invoice } from "@/types";

interface SystemAlert {
  id: string;
  type: "credit_overdue" | "near_expiry" | "low_stock" | "unallocated_payment";
  title: string;
  description: string;
  timestamp: string;
  actionUrl: string;
  actionLabel: string;
  severity: "high" | "medium" | "low";
}

export default function NotificationsCenterPage() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const buildAlerts = async () => {
      try {
        const [customers, batches, invoices] = await Promise.all([
          offlineDb.customers.toArray(),
          offlineDb.inventoryBatches.toArray(),
          offlineDb.invoices.toArray(),
        ]);

        const generated: SystemAlert[] = [];
        const nowMs = Date.now();
        const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

        // 1. Day-31 Overdue Receivables
        for (const cust of customers) {
          if (cust.currentOutstandingBalance > 0 && cust.currentOutstandingBalance >= cust.creditLimit * 0.8) {
            generated.push({
              id: `alert_credit_${cust.id}`,
              type: "credit_overdue",
              title: `Payment Reminder (Udhaar): ${cust.name}`,
              description: `Remaining balance (Baqaya) of ${formatPKR(
                cust.currentOutstandingBalance
              )} is due. Please send WhatsApp reminder.`,
              timestamp: new Date().toISOString(),
              actionUrl: `/customers/detail?id=${encodeURIComponent(cust.id)}`,
              actionLabel: "Send WhatsApp Reminder",
              severity: "high",
            });
          }
        }

        // 2. Near Expiry Batches (<90 days)
        for (const b of batches) {
          const expMs = new Date(b.expiryDate).getTime();
          if (expMs - nowMs <= ninetyDaysMs && b.remainingQuantity > 0) {
            generated.push({
              id: `alert_exp_${b.id}`,
              type: "near_expiry",
              title: `Expiry Warning: Batch ${b.batchNumber} Expiring Soon`,
              description: `${b.productName} k ${b.remainingQuantity} boxes ki expiry ${b.expiryDate} ko hai. Discount offer de kar jaldi sell karein.`,
              timestamp: new Date().toISOString(),
              actionUrl: `/marketing/whatsapp`,
              actionLabel: "Create WhatsApp Offer",
              severity: expMs <= nowMs ? "high" : "medium",
            });
          }
        }

        setAlerts(generated);
      } finally {
        setLoading(false);
      }
    };

    buildAlerts();
    const handleCloudSynced = () => {
      buildAlerts();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Alerts & Warnings
            </span>
            <span className="text-xs text-slate-400">Udhaar Reminders & Expiry Warnings</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Important Alerts (Expiry & Udhaar Reminders)
          </h1>
        </div>

        <span className="text-xs font-bold text-slate-500 font-mono">
          {alerts.length} Active Warnings
        </span>
      </div>

      {/* Alerts Feed */}
      <div className="space-y-3">
        {alerts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-80" />
            <h3 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">
              Sab Theek Hai! (No Warnings)
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Tamam medicine stock safe hai aur kisi medical store ka udhaar limit se bahar nahi hai.
            </p>
          </div>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-all ${
                a.severity === "high"
                  ? "border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20"
                  : "border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    a.severity === "high"
                      ? "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                    {a.title}
                  </h4>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {a.description}
                  </p>
                </div>
              </div>

              <Link
                href={a.actionUrl}
                className={`px-3 py-1.5 rounded-lg font-bold shrink-0 self-start sm:self-auto flex items-center gap-1.5 transition-colors ${
                  a.severity === "high"
                    ? "bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                    : "bg-amber-600 hover:bg-amber-700 text-white shadow-sm"
                }`}
              >
                {a.actionLabel}
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
