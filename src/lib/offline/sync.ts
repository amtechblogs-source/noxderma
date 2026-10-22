import {
  getPendingOperations,
  markOperationProcessing,
  markOperationSynced,
  markOperationConflict,
  markOperationFailed,
  getPendingOutboxCount,
} from "./outbox";
import type { OutboxOperation } from "@/types";

export interface SyncResult {
  totalProcessed: number;
  syncedCount: number;
  conflictCount: number;
  failedCount: number;
  timestamp: string;
}

class SynchronizationManager {
  private isSyncing = false;
  private listeners: Array<(status: { isOnline: boolean; pendingCount: number; isSyncing: boolean }) => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        this.notifyListeners();
        // Automatically attempt synchronization when internet reconnects
        this.syncNow();
      });

      window.addEventListener("offline", () => {
        this.notifyListeners();
      });
    }
  }

  public isOnline(): boolean {
    if (typeof window === "undefined") return true;
    return navigator.onLine;
  }

  public subscribe(listener: (status: { isOnline: boolean; pendingCount: number; isSyncing: boolean }) => void) {
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
      return { totalProcessed: 0, syncedCount: 0, conflictCount: 0, failedCount: 0, timestamp: new Date().toISOString() };
    }

    if (!this.isOnline()) {
      return { totalProcessed: 0, syncedCount: 0, conflictCount: 0, failedCount: 0, timestamp: new Date().toISOString() };
    }

    this.isSyncing = true;
    await this.notifyListeners();

    let syncedCount = 0;
    let conflictCount = 0;
    let failedCount = 0;

    try {
      const pending = await getPendingOperations();

      for (const op of pending) {
        await markOperationProcessing(op.id);

        try {
          // Send operation to trusted server endpoint
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
            // Conflict detected (e.g. stock exhausted by another device)
            const errorData = await response.json().catch(() => ({}));
            await markOperationConflict(
              op.id,
              errorData.reason || "STOCK_EXHAUSTED",
              errorData.message || "Conflict: remaining batch stock insufficient.",
              errorData.serverState
            );
            conflictCount++;
          } else {
            // Transient or validation error
            const errBody = await response.text();
            await markOperationFailed(op.id, `Server error ${response.status}: ${errBody}`);
            failedCount++;
          }
        } catch (netErr: unknown) {
          const message = netErr instanceof Error ? netErr.message : "Network error during sync";
          await markOperationFailed(op.id, message);
          failedCount++;
          // If network dropped, stop processing remainder
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
