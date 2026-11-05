"use client";

import { useEffect, useRef } from "react";
import { syncManager } from "@/lib/offline/sync";

/**
 * OfflineBanner:
 * Silently coordinates background synchronization without displaying
 * any disruptive top banners or data saving bars on screen.
 */
export function OfflineBanner() {
  const lastAutoAttemptMsRef = useRef<number>(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Automatically trigger sync in background whenever online and pending entries exist,
    // with a cooldown guard so finishing a sync never triggers an immediate infinite re-entry loop.
    const unsubscribe = syncManager.subscribe((status) => {
      if (status.isOnline && status.pendingCount > 0 && !status.isSyncing) {
        const now = Date.now();
        const elapsed = now - lastAutoAttemptMsRef.current;

        if (elapsed >= 8_000) {
          lastAutoAttemptMsRef.current = now;
          syncManager.syncNow().catch((err) => {
            console.warn("Silent background sync:", err);
          });
        } else if (!autoRetryTimerRef.current) {
          const delay = Math.max(2_000, 8_000 - elapsed);
          autoRetryTimerRef.current = setTimeout(() => {
            autoRetryTimerRef.current = null;
            lastAutoAttemptMsRef.current = Date.now();
            syncManager.syncNow().catch((err) => {
              console.warn("Silent background sync:", err);
            });
          }, delay);
        }
      }
    });

    return () => {
      unsubscribe();
      if (autoRetryTimerRef.current) {
        clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
    };
  }, []);

  // Silently save and sync - no top banner rendered
  return null;
}


