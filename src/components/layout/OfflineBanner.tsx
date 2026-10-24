"use client";

import { useEffect } from "react";
import { syncManager } from "@/lib/offline/sync";

/**
 * OfflineBanner:
 * Silently coordinates background synchronization without displaying
 * any disruptive top banners or data saving bars on screen.
 */
export function OfflineBanner() {
  useEffect(() => {
    // Automatically trigger sync in background whenever online and pending entries exist
    const unsubscribe = syncManager.subscribe((status) => {
      if (status.isOnline && status.pendingCount > 0 && !status.isSyncing) {
        syncManager.syncNow().catch((err) => {
          console.warn("Silent background sync:", err);
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Silently save and sync - no top banner rendered
  return null;
}


