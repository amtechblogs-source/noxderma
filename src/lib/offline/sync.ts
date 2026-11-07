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
import {
  forceFullCloudDatabaseSync,
  scheduleCloudUpsert,
  startRealtimeCloudSync,
} from "./cloudSync";

export interface SyncResult {
  totalProcessed: number;
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
  timestamp: string;
}

const OUTBOX_DEBOUNCE_MS = 4_000;
const AUTO_PROBE_INTERVAL_MS = 30_000; // Lightweight 30s Edge CDN probe (never hits serverless Lambda)
const MIN_PROBE_COOLDOWN_MS = 6_000;
const HEALTH_TIMEOUT_MS = 5_500;
const SYNC_API_TIMEOUT_MS = 6_500;
const CLOUD_RECONCILE_MAX_WAIT_MS = 8_000;

function mapEntityTypeToTable(entityType: string): string {
  switch (entityType) {
    case "customer":
      return "customers";
    case "lead":
      return "leads";
    case "customer_visit":
      return "customerVisits";
    case "payment":
      return "payments";
    case "invoice":
      return "invoices";
    case "settings":
      return "settings";
    default:
      return entityType;
  }
}

function buildFallbackOfficialReference(payload?: Record<string, unknown>): string {
  const existing =
    typeof payload?.officialReference === "string" ? payload.officialReference : "";
  if (existing && !existing.startsWith("PROV-")) {
    return existing;
  }
  const prov =
    typeof payload?.provisionalReference === "string" ? payload.provisionalReference : "";
  if (prov && !prov.startsWith("PROV-")) {
    return prov;
  }
  const year = new Date().getFullYear();
  const suffix = String(Date.now()).slice(-5);
  return `NXD-${year}-${suffix}`;
}

class SynchronizationManager {
  private isSyncing = false;
  private reachableOnline = true;
  private consecutiveFailures = 0;
  private lastProbeMs = 0;
  private isCheckingConnectivity = false;
  private retryVerifyTimer: ReturnType<typeof setTimeout> | null = null;
  private enqueueSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Array<
    (status: { isOnline: boolean; pendingCount: number; isSyncing: boolean }) => void
  > = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.reachableOnline = navigator.onLine;

      // 1. Browser radio events + active Edge CDN reachability verification
      window.addEventListener("online", () => {
        this.consecutiveFailures = 0;
        this.checkConnectivity(true).then((online) => {
          if (online) {
            this.syncNow();
          }
        });
      });

      window.addEventListener("offline", () => {
        this.consecutiveFailures = 2;
        this.setReachableOnline(false);
      });

      window.addEventListener("focus", () => {
        this.checkConnectivity(false);
      });

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          this.checkConnectivity(false);
        }
      });

      // Android / Chrome Network Information API change event
      const conn =
        (navigator as any).connection ||
        (navigator as any).mozConnection ||
        (navigator as any).webkitConnection;
      if (conn && typeof conn.addEventListener === "function") {
        conn.addEventListener("change", () => {
          this.checkConnectivity(true);
        });
      }

      window.addEventListener("noxderma-cloud-synced", () => {
        this.notifyListeners();
      });

      // 2. Debounced auto-sync whenever new items enter outbox
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
        }, OUTBOX_DEBOUNCE_MS);
      });

      // 3. Periodic 30-second lightweight Edge CDN connectivity check & pending outbox flush
      setInterval(async () => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          return;
        }
        const actuallyOnline = await this.checkConnectivity(false);
        if (actuallyOnline && !this.isSyncing) {
          getPendingOutboxCount()
            .then((count) => {
              if (count > 0) {
                this.syncNow();
              }
            })
            .catch(() => {});
        }
      }, AUTO_PROBE_INTERVAL_MS);

      // 4. Initial startup reachability verification + pending outbox flush (no duplicate 30-table re-download)
      setTimeout(async () => {
        const actuallyOnline = await this.checkConnectivity(true);
        if (actuallyOnline && !this.isSyncing) {
          const count = await getPendingOutboxCount().catch(() => 0);
          if (count > 0) {
            this.syncNow();
          }
        }
      }, 900);
    }
  }

  private setReachableOnline(next: boolean) {
    if (this.reachableOnline !== next) {
      this.reachableOnline = next;
      this.notifyListeners();
    }
  }

  private async probeEdgeHealth(): Promise<boolean> {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    try {
      // Primary probe: static `/health.json` served directly by Netlify Edge CDN (0ms Lambda cold start)
      const res = await fetch(`${apiBase}/health.json?t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
        signal: controller.signal,
      });

      if (res.ok) {
        if (res.headers.get("x-noxderma-health") === "ok") {
          return true;
        }
        const body = await res.json().catch(() => null);
        if (body && body.ok === true) {
          return true;
        }
      }

      // Fallback to `/api/health` only if `/health.json` returned 404
      if (res.status === 404) {
        const apiRes = await fetch(`${apiBase}/api/health?t=${Date.now()}`, {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
          signal: controller.signal,
        });
        return apiRes.ok && apiRes.headers.get("x-noxderma-health") === "ok";
      }

      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Verifies real internet connectivity using Netlify Edge CDN (`/health.json`) with 2-strike hysteresis
   * so transient latency spikes NEVER falsely flip a stable fibre connection to "Offline".
   */
  public async checkConnectivity(force = false): Promise<boolean> {
    if (typeof window === "undefined") return true;

    if (!navigator.onLine) {
      this.consecutiveFailures = 2;
      this.setReachableOnline(false);
      return false;
    }

    const now = Date.now();
    if (!force && this.reachableOnline && now - this.lastProbeMs < MIN_PROBE_COOLDOWN_MS) {
      return this.reachableOnline;
    }

    if (this.isCheckingConnectivity) {
      return this.reachableOnline;
    }

    this.isCheckingConnectivity = true;
    this.lastProbeMs = now;

    try {
      const isHealthy = await this.probeEdgeHealth();

      if (isHealthy) {
        if (this.retryVerifyTimer) {
          clearTimeout(this.retryVerifyTimer);
          this.retryVerifyTimer = null;
        }
        const wasOffline = !this.reachableOnline;
        this.consecutiveFailures = 0;
        this.setReachableOnline(true);

        if (wasOffline && !this.isSyncing) {
          setTimeout(async () => {
            const count = await getPendingOutboxCount().catch(() => 0);
            if (count > 0 && this.isOnline() && !this.isSyncing) {
              this.syncNow();
            }
          }, 300);
        }

        return true;
      }

      // Probe returned non-healthy while navigator.onLine is true -> apply 2-strike hysteresis
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 2) {
        this.setReachableOnline(false);
        return false;
      }

      if (!this.retryVerifyTimer) {
        this.retryVerifyTimer = setTimeout(() => {
          this.retryVerifyTimer = null;
          this.checkConnectivity(true);
        }, 1_800);
      }
      return this.reachableOnline;
    } catch {
      if (!navigator.onLine) {
        this.consecutiveFailures = 2;
        this.setReachableOnline(false);
        return false;
      }

      this.consecutiveFailures++;
      if (this.consecutiveFailures >= 2) {
        this.setReachableOnline(false);
        return false;
      }

      // Single transient glitch on active link: verify once more before declaring offline
      if (!this.retryVerifyTimer) {
        this.retryVerifyTimer = setTimeout(() => {
          this.retryVerifyTimer = null;
          this.checkConnectivity(true);
        }, 1_800);
      }
      return this.reachableOnline;
    } finally {
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

  public async syncNow(options?: { fullReconcile?: boolean }): Promise<SyncResult> {
    if (this.isSyncing) {
      return {
        totalProcessed: 0,
        syncedCount: 0,
        conflictCount: 0,
        failedCount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const online = await this.checkConnectivity(Boolean(options?.fullReconcile));
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
      // 1. Ensure live listeners are running (non-blocking)
      startRealtimeCloudSync(offlineDb).catch((err) => {
        console.warn("[SyncManager] Realtime sync init notice:", err);
      });

      // 2. Process Outbox Queue FIRST so waiting bills & operations upload immediately
      const pending = await getPendingOperations();

      for (const op of pending) {
        await markOperationProcessing(op.id);

        // Ensure record is also queued directly to Cloud Firestore from the client
        const targetTable = mapEntityTypeToTable(op.entityType);
        if (op.entityId && op.payload) {
          scheduleCloudUpsert(targetTable, op.entityId, op.payload);
        }

        const controller = new AbortController();
        const apiTimer = setTimeout(() => controller.abort(), SYNC_API_TIMEOUT_MS);

        try {
          const apiBase = process.env.NEXT_PUBLIC_API_URL || "";
          const response = await fetch(`${apiBase}/api/sync`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(op),
            signal: controller.signal,
          });

          if (response.ok) {
            const data = await response.json().catch(() => ({}));
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
          } else if (this.reachableOnline && response.status >= 500) {
            const fallbackRef =
              op.entityType === "invoice"
                ? buildFallbackOfficialReference(op.payload)
                : undefined;
            if (op.entityType === "invoice" && op.entityId && op.payload) {
              scheduleCloudUpsert("invoices", op.entityId, {
                ...op.payload,
                officialReference: fallbackRef,
                syncStatus: "synced",
                syncedAt: new Date().toISOString(),
              });
            }
            await markOperationSynced(
              op.id,
              fallbackRef ? { officialReference: fallbackRef } : undefined
            );
            syncedCount++;
          } else {
            const errBody = await response.text().catch(() => "");
            await markOperationFailed(op.id, `Server error ${response.status}: ${errBody}`);
            failedCount++;
          }
        } catch (netErr: unknown) {
          if (this.reachableOnline && navigator.onLine) {
            const stillOnline = await this.checkConnectivity(true);
            if (stillOnline) {
              const fallbackRef =
                op.entityType === "invoice"
                  ? buildFallbackOfficialReference(op.payload)
                  : undefined;
              if (op.entityType === "invoice" && op.entityId && op.payload) {
                scheduleCloudUpsert("invoices", op.entityId, {
                  ...op.payload,
                  officialReference: fallbackRef,
                  syncStatus: "synced",
                  syncedAt: new Date().toISOString(),
                });
              }
              await markOperationSynced(
                op.id,
                fallbackRef ? { officialReference: fallbackRef } : undefined
              );
              syncedCount++;
              continue;
            }
          }

          const message = netErr instanceof Error ? netErr.message : "Network error during sync";
          await markOperationFailed(op.id, message);
          failedCount++;
          break;
        } finally {
          clearTimeout(apiTimer);
        }
      }

      // 3. Only run full 30-table pull/reconcile when explicitly requested by user (manual Sync button)
      if (options?.fullReconcile) {
        await Promise.race([
          forceFullCloudDatabaseSync(offlineDb),
          new Promise((resolve) => setTimeout(resolve, CLOUD_RECONCILE_MAX_WAIT_MS)),
        ]);
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
