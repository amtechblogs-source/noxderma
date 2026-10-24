"use client";

import React, { useEffect, useState } from "react";
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { syncManager, type SyncResult } from "@/lib/offline/sync";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((status) => {
      setIsOnline(status.isOnline);
      setPendingCount(status.pendingCount);
      setIsSyncing(status.isSyncing);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Automatically trigger sync in background whenever online and entries exist
  useEffect(() => {
    if (isOnline && pendingCount > 0 && !isSyncing) {
      syncManager.syncNow().then((result) => {
        if (result.syncedCount > 0 || result.conflictCount > 0) {
          setLastSyncResult(result);
          setTimeout(() => setLastSyncResult(null), 3500);
        }
      });
    }
  }, [isOnline, pendingCount, isSyncing]);

  const handleSyncNow = async () => {
    const result = await syncManager.syncNow();
    setLastSyncResult(result);
    setTimeout(() => setLastSyncResult(null), 4000);
  };

  if (isOnline && pendingCount === 0 && !lastSyncResult) {
    return null;
  }

  return (
    <aside
      id="offline-banner"
      aria-label="Network and synchronization status"
      className={`w-full px-4 py-2 text-xs md:text-sm font-medium transition-all duration-300 border-b ${
        !isOnline
          ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-200"
          : pendingCount > 0
          ? "bg-teal-500/10 border-teal-500/30 text-teal-800 dark:text-teal-200"
          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
      }`}
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {!isOnline ? (
            <>
              <WifiOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 animate-pulse" />
              <span>
                <strong>Internet Band Hai (Offline Mode):</strong> Fikar na karein, bills computer me mehfooz hain. Internet aate hi server pe <strong>khud-ba-khud (automatically)</strong> save ho jayein gy.
              </span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <RefreshCw className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 animate-spin" />
              <span>
                <strong>Cloud Sync Active:</strong> <strong>{pendingCount}</strong> entry server pe khud-ba-khud (automatically) save ho rahi hain...
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Sab data server pe kamyabi se save ho chuka hai (All Synced).</span>
            </>
          )}

          {lastSyncResult && lastSyncResult.conflictCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold ml-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              {lastSyncResult.conflictCount} item(s) need owner checking.
            </span>
          )}
        </div>

        {isOnline && pendingCount > 0 && (
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold shadow-sm transition-all disabled:opacity-60"
            title="Auto-sync background me chalu hai, click kr k bhi foran sync kr skte hain"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Auto Syncing..." : "Sync Now"}
          </button>
        )}
      </div>
    </aside>
  );
}

