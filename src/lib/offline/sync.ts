import {
  getPendingOperations,
  markOperationProcessing,
  markOperationSynced,
  markOperationConflict,
  markOperationFailed,
  getPendingOutboxCount,
  onOutboxEnqueued,
} from "./outbox";
import { offlineDb } from "./db";
import { forceFullCloudDatabaseSync, startRealtimeCloudSync } from "./cloudSync";

export interface SyncResult {
  totalProcessed: number;
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
  timestamp: string;
}

const AUTO_SYNC_INTERVAL_MS = 10_000; // 10 seconds auto-sync delay
const HEALTH_TIMEOUT_MS = 3_500;

class SynchronizationManager {
  private isSyncing = false;
  private reachableOnline = true;
  private isCheckingConnectivity = false;
  private enqueueSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Array<
    (status: { isOnline: boolean; pendingCount: number; isSyncing: boolean }) => void
  > = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.reachableOnline = navigator.onLine;

      // 1. Browser radio events + active reachability verification
      window.addEventListener("online", () => {
        this.checkConnectivity().then((online) => {
          if (online) {
            this.syncNow();
          }
        });
      });

      window.addEventListener("offline", () => {
        this.setReachableOnline(false);
      });

      window.addEventListener("focus", () => {
        this.checkConnectivity();
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.checkConnectivity();
        }
      });

      // Android / Chrome Network Information API change event (e.g., 4.5G data exhausted or Wi-Fi switch)
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (conn && typeof conn.addEventListener === "function") {
        conn.addEventListener("change", () => {
          this.checkConnectivity();
        });
      }

      window.addEventListener("noxderma-cloud-synced", () => {
        this.notifyListeners();
      });

      // 2. Debounced auto-sync (10 seconds delay) whenever new items enter outbox
      onOutboxEnqueued(() => {
        this.notifyListeners();
        if (this.enqueueSyncTimer) {
          clearTimeout(this.enqueueSyncTimer);
        }
        this.enqueueSyncTimer = setTimeout(() => {
          this.enqueueSyncTimer = null;
          if (this.isOnline() && !this.isSyncing) {
            this.syncNow();
          }
        }, AUTO_SYNC_INTERVAL_MS);
      });

      // 3. Periodic 10-second connectivity probe & background outbox sync
      setInterval(async () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return;
        }
        const actuallyOnline = await this.checkConnectivity();
        if (actuallyOnline && !this.isSyncing) {
          getPendingOutboxCount()
            .then((count) => {
              if (count > 0) {
                this.syncNow();
              }
            })
            .catch(() => {});
        }
      }, AUTO_SYNC_INTERVAL_MS);

      // 4. Initial startup reachability verification + cloud sync
      setTimeout(async () => {
        const actuallyOnline = await this.checkConnectivity();
        if (actuallyOnline && !this.isSyncing) {
          this.syncNow();
        }
      }, 600);
    }
  }

  private setReachableOnline(next: boolean) {
    if (this.reachableOnline !== next) {
      this.reachableOnline = next;
      this.notifyListeners();
    }
  }

  /**
   * Verifies real internet connectivity (detects expired mobile data packages / dead Wi-Fi / captive portals
   * where `navigator.onLine` stays `true` even though Chrome has no internet connection).
   */
  public async checkConnectivity(): Promise<boolean> {
    if (typeof window === "undefined") return true;

    if (!navigator.onLine) {
      this.setReachableOnline(false);
      return false;
    }

    if (this.isCheckingConnectivity) {
      return this.reachableOnline;
    }

    this.isCheckingConnectivity = true;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
      const res = await fetch(`${apiBase}/api/health?t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });

      const isHealthy =
        res.ok && res.headers.get("x-noxderma-health") === "ok";

      const wasOffline = !this.reachableOnline;
      this.setReachableOnline(isHealthy);

      if (isHealthy && wasOffline && !this.isSyncing) {
        // Reconnected after data package renewal or network recovery
        setTimeout(() => {
          if (this.isOnline() && !this.isSyncing) {
            this.syncNow();
          }
        }, 250);
      }

      return isHealthy;
    } catch {
      this.setReachableOnline(false);
      return false;
    } finally {
      clearTimeout(timeoutId);
      this.isCheckingConnectivity = false;
    }
  }

  public isOnline(): boolean {
    if (typeof window === "undefined") return true;
    return navigator.onLine && this.reachableOnline;
  }

  public subscribe(
    listener: (status: { isOnline: boolean; pendingCount: number; isSyncing: boolean }) => void
  ) {
    this.listeners.push(listener);
    this.notifyListeners();
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public async notifyListeners() {
    const pendingCount = await getPendingOutboxCount();
    const state = {
      isOnline: this.isOnline(),
      pendingCount,
      isSyncing: this.isSyncing,
    };
    this.listeners.forEach((l) => l(state));
  }

  public async syncNow(): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        totalProcessed: 0,
        syncedCount: 0,
        conflictCount: 0,
        failedCount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const online = await this.checkConnectivity();
    if (!online) {
      return {
        totalProcessed: 0,
        syncedCount: 0,
        conflictCount: 0,
        failedCount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    this.isSyncing = true;
    await this.notifyListeners();

    let syncedCount = 0;
    let conflictCount = 0;
    let failedCount = 0;

    try {
      await startRealtimeCloudSync(offlineDb);
      await forceFullCloudDatabaseSync(offlineDb);
      const pending = await getPendingOperations();

      for (const op of pending) {
        await markOperationProcessing(op.id);

        try {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
          const response = await fetch(`${apiBase}/api/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(op),
          });

          if (response.ok) {
            const data = await response.json();
            await markOperationSynced(op.id, data);
            syncedCount++;
          } else if (response.status === 409) {
            const errorData = await response.json().catch(() => ({}));
            await markOperationConflict(
              op.id,
              errorData.reason || "STOCK_EXHAUSTED",
              errorData.message || "Conflict: remaining batch stock insufficient.",
              errorData.serverState
            );
            conflictCount++;
          } else {
            const errBody = await response.text();
            await markOperationFailed(op.id, `Server error ${response.status}: ${errBody}`);
            failedCount++;
          }
        } catch (netErr: unknown) {
          const message = netErr instanceof Error ? netErr.message : "Network error during sync";
          await markOperationFailed(op.id, message);
          failedCount++;
          this.setReachableOnline(false);
          break;
        }
      }
    } finally {
      this.isSyncing = false;
      await this.notifyListeners();
    }

    return {
      totalProcessed: syncedCount + conflictCount + failedCount,
      syncedCount,
      conflictCount,
      failedCount,
      timestamp: new Date().toISOString(),
    };
  }
}

export const syncManager = new SynchronizationManager();
