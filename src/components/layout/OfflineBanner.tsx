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

  const handleSyncNow = async () => {
    const result = await syncManager.syncNow();
    setLastSyncResult(result);
    setTimeout(() => setLastSyncResult(null), 5000);
  };

  if (isOnline && pendingCount === 0 && !lastSyncResult) {
    return null;
  }

  return (
    <aside
      id="offline-banner"
      aria-label="Network and synchronization status"
      className={`w-full px-4 py-2 text-xs md:text-sm font-medium transition-colors border-b ${
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
                <strong>Offline Mode Active:</strong> You are disconnected. Invoices and records are saved locally in durable storage and will sync automatically when reconnected.
              </span>
            </>
          ) : pendingCount > 0 ? (
            <>
              <RefreshCw className={`w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 ${isSyncing ? "animate-spin" : ""}`} />
              <span>
                <strong>Online:</strong> You have <strong>{pendingCount}</strong> offline transaction{pendingCount > 1 ? "s" : ""} waiting to sync with the central database.
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>All offline transactions synchronized successfully.</span>
            </>
          )}

          {lastSyncResult && lastSyncResult.conflictCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold ml-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              {lastSyncResult.conflictCount} conflict(s) require admin review.
            </span>
          )}
        </div>

        {isOnline && pendingCount > 0 && (
          <button
            onClick={handleSyncNow}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-md text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        )}
      </div>
    </aside>
  );
}
