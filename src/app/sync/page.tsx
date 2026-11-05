"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Database,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Laptop,
  Wifi,
  WifiOff,
  ShieldCheck,
  Check,
  X,
} from "lucide-react";
import { formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { syncManager, type SyncResult } from "@/lib/offline/sync";
import { getDeviceId } from "@/lib/offline/device";
import { detectDeviceMetadata } from "@/lib/monitoring/deviceIdentity";
import type { OutboxOperation, SyncConflict } from "@/types";

function detectIsMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const uaData = (navigator as any).userAgentData;
  if (Boolean(uaData?.mobile) || /Android|iPhone|iPod|iPad|IEMobile|Opera Mini|Mobile/i.test(ua)) {
    return true;
  }
  return window.innerWidth < 768;
}

export default function SyncReconciliationPage() {
  const [operations, setOperations] = useState<OutboxOperation[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  const refreshData = async () => {
    try {
      const [ops, confs] = await Promise.all([
        offlineDb.outboxQueue.toArray(),
        offlineDb.syncConflicts.toArray(),
      ]);
      setOperations(ops.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
      setConflicts(confs);
      setDeviceId(getDeviceId());
    } catch (err) {
      console.warn("Failed to query outbox queue:", err);
    }
  };

  useEffect(() => {
    setIsMobileDevice(detectIsMobileDevice());
    detectDeviceMetadata()
      .then((meta) => {
        if (meta.deviceCategory === "mobile" || meta.deviceCategory === "tablet") {
          setIsMobileDevice(true);
        } else {
          setIsMobileDevice(detectIsMobileDevice());
        }
      })
      .catch(() => {});

    const handleResize = () => {
      setIsMobileDevice(detectIsMobileDevice());
    };
    window.addEventListener("resize", handleResize);

    refreshData();
    const unsub = syncManager.subscribe((st) => {
      setIsOnline(st.isOnline);
      setIsSyncing(st.isSyncing);
      refreshData();
    });
    return () => {
      window.removeEventListener("resize", handleResize);
      unsub();
    };
  }, []);

  const handleSyncNow = async () => {
    const res = await syncManager.syncNow();
    setLastResult(res);
    await refreshData();
  };

  const handleResolveConflict = async (conflictId: string, resolution: "resolved_override" | "resolved_cancelled") => {
    await offlineDb.syncConflicts.update(conflictId, {
      resolutionStatus: resolution,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: "usr_admin",
    });
    await refreshData();
  };

  const pendingOps = operations.filter((o) => o.status === "pending" || o.status === "processing");
  const failedOps = operations.filter((o) => o.status === "failed");
  const syncedOps = operations.filter((o) => o.status === "synced");

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-6 h-6 text-teal-600" />
            Internet Sync & Cloud Backup (Save Data to Server)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Jab internet na ho to sara data computer me mehfooz rehta hai. Internet chalty hi yahan se data online server pe save ho jata hai.
          </p>
        </div>

        <button
          onClick={handleSyncNow}
          disabled={isSyncing || !isOnline}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/30 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Saving Data to Server..." : "Upload / Sync Now (Save All)"}
        </button>
      </div>

      {/* Device & Connection Identity Card */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center text-teal-600">
            <Laptop className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">This Device / Computer</span>
            <p className="font-mono font-bold text-slate-900 dark:text-slate-100">{deviceId || "PRIMARY-PC"}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isOnline ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">Internet Connection</span>
            <p className={`font-bold ${isOnline ? "text-emerald-600" : "text-amber-600"}`}>
              {isOnline
                ? "Connected (Online - Server Active)"
                : isMobileDevice
                ? "Offline (No Internet - Saved in Mobile)"
                : "Offline (No Internet - Saved in PC)"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-sky-950 flex items-center justify-center text-sky-600">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase text-slate-400">Waiting to Save Online</span>
            <p className="font-bold text-slate-900 dark:text-slate-100">
              {pendingOps.length} Waiting to Upload • {conflicts.length} Need Review
            </p>
          </div>
        </div>
      </div>

      {/* Conflicts Requiring Admin Review */}
      {conflicts.length > 0 && (
        <div className="p-5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-bold text-sm">
            <AlertTriangle className="w-4 h-4" />
            Stock / Bill Conflicts Needing Review
          </div>
          <div className="divide-y divide-rose-200 dark:divide-rose-900/60 text-xs">
            {conflicts.map((conf) => (
              <div key={conf.id} className="py-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    Entry: {conf.operationId}
                  </span>
                  <p className="text-rose-600 font-medium mt-0.5">{conf.conflictMessage}</p>
                  <p className="text-[10px] text-slate-500">
                    Detected: {formatKarachiDate(conf.createdAt, true)} • Status:{" "}
                    {conf.resolutionStatus === "pending_admin_review"
                      ? "Pending Owner Review"
                      : conf.resolutionStatus.replace(/_/g, " ")}
                  </p>
                </div>
                {conf.resolutionStatus === "pending_admin_review" && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleResolveConflict(conf.id, "resolved_override")}
                      className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] flex items-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Accept & Keep
                    </button>
                    <button
                      onClick={() => handleResolveConflict(conf.id, "resolved_cancelled")}
                      className="px-2.5 py-1 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[10px] flex items-center gap-1"
                    >
                      <X className="w-3 h-3" /> Cancel Entry
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outbox Operations Queue Table */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
          History of Saved Bills & Server Sync
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2">Entry ID</th>
                <th className="py-2">Type</th>
                <th className="py-2">Action</th>
                <th className="py-2">Date & Time</th>
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Tries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {operations.length > 0 ? (
                operations.map((op) => (
                  <tr key={op.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-2.5 font-mono text-teal-600 font-semibold">{op.id}</td>
                    <td className="py-2.5 uppercase font-medium">{op.entityType}</td>
                    <td className="py-2.5 capitalize">{op.action}</td>
                    <td className="py-2.5 text-slate-500">{formatKarachiDate(op.timestamp, true)}</td>
                    <td className="py-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          op.status === "synced"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : op.status === "pending"
                            ? "bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300"
                            : op.status === "conflict"
                            ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                            : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                        }`}
                      >
                        {op.status === "synced" ? "SAVED ON SERVER" : op.status === "pending" ? "WAITING UPLOAD" : op.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono">{op.retryCount || 0}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Sab data server pe save hai. Kuch baqi nahi. (All synced).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
