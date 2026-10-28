import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db as firestoreDb } from "@/lib/firebase/config";
import type { NoxdermaDexieDB } from "./db";

export interface SyncedTableConfig {
  tableName: string;
  primaryKey: "id" | "productId";
  localStorageMirrorKey?: string;
}

export const SYNCED_TABLES: SyncedTableConfig[] = [
  { tableName: "settings", primaryKey: "id" },
  { tableName: "categories", primaryKey: "id" },
  { tableName: "products", primaryKey: "id" },
  { tableName: "productPricing", primaryKey: "productId" },
  { tableName: "inventoryBatches", primaryKey: "id" },
  { tableName: "stockMovements", primaryKey: "id" },
  { tableName: "inventoryProjections", primaryKey: "productId" },
  { tableName: "customers", primaryKey: "id" },
  { tableName: "leads", primaryKey: "id" },
  { tableName: "customerVisits", primaryKey: "id" },
  { tableName: "invoices", primaryKey: "id" },
  { tableName: "payments", primaryKey: "id" },
  { tableName: "manufacturers", primaryKey: "id" },
  { tableName: "purchaseOrders", primaryKey: "id", localStorageMirrorKey: "noxderma_purchase_orders" },
  { tableName: "salesBookings", primaryKey: "id", localStorageMirrorKey: "noxderma_sales_bookings" },
  { tableName: "onlineOrders", primaryKey: "id", localStorageMirrorKey: "noxderma_online_orders" },
  { tableName: "salesReturns", primaryKey: "id", localStorageMirrorKey: "noxderma_sales_returns" },
  { tableName: "marketingCampaigns", primaryKey: "id", localStorageMirrorKey: "noxderma_marketing_campaigns" },
  { tableName: "employeeTargets", primaryKey: "id", localStorageMirrorKey: "noxderma_rep_targets" },
  { tableName: "users", primaryKey: "id", localStorageMirrorKey: "noxderma_users" },
  { tableName: "coupons", primaryKey: "id" },
  { tableName: "staffMonitors", primaryKey: "id", localStorageMirrorKey: "noxderma_staff_monitors" },
  { tableName: "dailyBeatPlans", primaryKey: "id" },
  { tableName: "liveMapPins", primaryKey: "id" },
  { tableName: "geoVerifiedPhotos", primaryKey: "id" },
  { tableName: "auditLogs", primaryKey: "id" },
];

const IGNORED_DEMO_IDS = new Set([
  "staff_ali",
  "staff_bilal",
  "staff_kamran",
  "staff_usman",
]);

let isApplyingRemoteCount = 0;
let isInitialized = false;
const activeUnsubscribes: Unsubscribe[] = [];
const pendingDeleteTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingUpsertTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function isApplyingRemote(): boolean {
  return isApplyingRemoteCount > 0;
}

async function withRemoteSyncFlag<T>(fn: () => Promise<T>): Promise<T> {
  isApplyingRemoteCount++;
  try {
    return await fn();
  } finally {
    isApplyingRemoteCount = Math.max(0, isApplyingRemoteCount - 1);
  }
}

/**
 * Recursively strips `undefined` values so Firestore `setDoc` never rejects optional fields,
 * and ensures serialized document size stays safely within Firestore's 1MB limit.
 */
export function sanitizeForFirestore(record: any): Record<string, any> {
  if (!record || typeof record !== "object") return {};
  const cleaned = JSON.parse(
    JSON.stringify(record, (_key, value) => (value === undefined ? null : value))
  );

  // Guard against oversized base64 images exceeding Firestore's 1MB document limit
  const serialized = JSON.stringify(cleaned);
  if (serialized.length > 850_000 && Array.isArray(cleaned.images)) {
    cleaned.images = cleaned.images.map((img: any, index: number) => {
      if (index === 0) {
        // Keep thumbnailUrl if smaller, or trim huge originalUrl
        const thumb = img.thumbnailUrl || img.url || "";
        return {
          ...img,
          originalUrl: undefined,
          url: thumb.length > 450_000 ? "" : thumb,
          thumbnailUrl: thumb.length > 450_000 ? "" : thumb,
        };
      }
      return {
        ...img,
        originalUrl: undefined,
        url: (img.thumbnailUrl || "").length < 150_000 ? img.thumbnailUrl : "",
      };
    });
  }

  return cleaned;
}

/**
 * Push a single record up to Cloud Firestore (debounced & cancels any pending delete on same key).
 */
export function scheduleCloudUpsert(tableName: string, docId: string, data: any) {
  if (typeof window === "undefined" || !docId) return;
  if (tableName === "staffMonitors" && IGNORED_DEMO_IDS.has(docId)) return;

  const compositeKey = `${tableName}:${docId}`;

  // Cancel any pending delete for this exact document (handles clear() + bulkPut() cleanly)
  const existingDelTimer = pendingDeleteTimers.get(compositeKey);
  if (existingDelTimer) {
    clearTimeout(existingDelTimer);
    pendingDeleteTimers.delete(compositeKey);
  }

  const existingUpsertTimer = pendingUpsertTimers.get(compositeKey);
  if (existingUpsertTimer) {
    clearTimeout(existingUpsertTimer);
  }

  const snapshotCopy = sanitizeForFirestore(data);
  const timer = setTimeout(async () => {
    pendingUpsertTimers.delete(compositeKey);
    try {
      await setDoc(doc(firestoreDb, tableName, String(docId)), snapshotCopy, { merge: true });
    } catch (err) {
      console.warn(`[CloudSync] Failed to upsert ${compositeKey} to Firestore:`, err);
    }
  }, 60);

  pendingUpsertTimers.set(compositeKey, timer);
}

/**
 * Delete a single record from Cloud Firestore (debounced by 180ms so clear() + bulkPut() won't delete kept items).
 */
export function scheduleCloudDelete(tableName: string, docId: string) {
  if (typeof window === "undefined" || !docId) return;
  const compositeKey = `${tableName}:${docId}`;

  const existingUpsertTimer = pendingUpsertTimers.get(compositeKey);
  if (existingUpsertTimer) {
    clearTimeout(existingUpsertTimer);
    pendingUpsertTimers.delete(compositeKey);
  }

  const existingDelTimer = pendingDeleteTimers.get(compositeKey);
  if (existingDelTimer) {
    clearTimeout(existingDelTimer);
  }

  const timer = setTimeout(async () => {
    pendingDeleteTimers.delete(compositeKey);
    try {
      await deleteDoc(doc(firestoreDb, tableName, String(docId)));
    } catch (err) {
      console.warn(`[CloudSync] Failed to delete ${compositeKey} from Firestore:`, err);
    }
  }, 180);

  pendingDeleteTimers.set(compositeKey, timer);
}

/**
 * Attach Dexie table hooks so every local add/put/update/delete automatically syncs to Cloud Firestore.
 */
export function attachDexieCloudHooks(dexieDb: NoxdermaDexieDB) {
  for (const cfg of SYNCED_TABLES) {
    const table = (dexieDb as any)[cfg.tableName];
    if (!table || !table.hook) continue;

    table.hook("creating", function (primKey: any, obj: any) {
      if (isApplyingRemote()) return;
      const docId = String(obj?.[cfg.primaryKey] ?? primKey ?? "");
      if (docId) {
        scheduleCloudUpsert(cfg.tableName, docId, { ...obj, [cfg.primaryKey]: docId });
      }
    });

    table.hook("updating", function (modifications: any, primKey: any, obj: any) {
      if (isApplyingRemote()) return;
      const merged = { ...obj, ...modifications };
      const docId = String(merged?.[cfg.primaryKey] ?? primKey ?? "");
      if (docId) {
        scheduleCloudUpsert(cfg.tableName, docId, merged);
      }
    });

    table.hook("deleting", function (primKey: any, obj: any) {
      if (isApplyingRemote()) return;
      const docId = String(primKey ?? obj?.[cfg.primaryKey] ?? "");
      if (docId) {
        scheduleCloudDelete(cfg.tableName, docId);
      }
    });
  }
}

let notifyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function dispatchCloudSyncUpdate() {
  if (typeof window === "undefined") return;
  if (notifyDebounceTimer) clearTimeout(notifyDebounceTimer);
  notifyDebounceTimer = setTimeout(() => {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new CustomEvent("noxderma-cloud-synced"));
  }, 120);
}

/**
 * Initialize two-way real-time synchronization between Dexie IndexedDB and Cloud Firestore.
 */
export async function startRealtimeCloudSync(dexieDb: NoxdermaDexieDB): Promise<void> {
  if (typeof window === "undefined" || isInitialized) return;
  isInitialized = true;

  // Step 1: Migrate any legacy localStorage arrays into Dexie if Dexie table is empty
  for (const cfg of SYNCED_TABLES) {
    if (!cfg.localStorageMirrorKey) continue;
    try {
      const table = (dexieDb as any)[cfg.tableName];
      const existingCount = await table.count();
      if (existingCount === 0) {
        const raw = localStorage.getItem(cfg.localStorageMirrorKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const validItems = parsed.filter(
              (item: any) =>
                item &&
                item[cfg.primaryKey] &&
                !(cfg.tableName === "staffMonitors" && IGNORED_DEMO_IDS.has(item[cfg.primaryKey]))
            );
            if (validItems.length > 0) {
              await withRemoteSyncFlag(async () => {
                await table.bulkPut(validItems);
              });
            }
          }
        }
      }
    } catch {}
  }

  // Step 2: Reconcile each collection (Pull remote -> local, Push un-synced local -> remote)
  // and attach real-time onSnapshot listeners
  for (const cfg of SYNCED_TABLES) {
    const table = (dexieDb as any)[cfg.tableName];
    if (!table) continue;

    // Initial reconciliation in background
    (async () => {
      try {
        const colRef = collection(firestoreDb, cfg.tableName);
        const [remoteSnap, localRecords] = await Promise.all([
          getDocs(colRef),
          table.toArray(),
        ]);

        const remoteMap = new Map<string, any>();
        remoteSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (cfg.tableName === "staffMonitors" && IGNORED_DEMO_IDS.has(docSnap.id)) {
            deleteDoc(doc(firestoreDb, cfg.tableName, docSnap.id)).catch(() => {});
            return;
          }
          remoteMap.set(docSnap.id, { ...data, [cfg.primaryKey]: docSnap.id });
        });

        // Apply remote documents into local IndexedDB
        if (remoteMap.size > 0) {
          await withRemoteSyncFlag(async () => {
            await table.bulkPut(Array.from(remoteMap.values()));
          });
        }

        // Push any local records that are not yet in Cloud Firestore
        for (const localItem of localRecords) {
          const docId = String(localItem?.[cfg.primaryKey] ?? "");
          if (!docId) continue;
          if (cfg.tableName === "staffMonitors" && IGNORED_DEMO_IDS.has(docId)) continue;

          if (!remoteMap.has(docId)) {
            await setDoc(
              doc(firestoreDb, cfg.tableName, docId),
              sanitizeForFirestore(localItem),
              { merge: true }
            );
          }
        }

        // Update localStorage mirror if configured
        if (cfg.localStorageMirrorKey) {
          const mergedAll = await table.toArray();
          localStorage.setItem(cfg.localStorageMirrorKey, JSON.stringify(mergedAll));
        }

        dispatchCloudSyncUpdate();
      } catch (err) {
        console.warn(`[CloudSync] Initial reconciliation warning for ${cfg.tableName}:`, err);
      }
    })();

    // Real-time live listener (Cloud -> Local)
    try {
      const colRef = collection(firestoreDb, cfg.tableName);
      const unsub = onSnapshot(
        colRef,
        async (snapshot) => {
          const changes = snapshot.docChanges();
          if (changes.length === 0) return;

          const toPut: any[] = [];
          const toDelete: string[] = [];

          for (const change of changes) {
            const docId = change.doc.id;
            if (cfg.tableName === "staffMonitors" && IGNORED_DEMO_IDS.has(docId)) continue;

            if (change.type === "added" || change.type === "modified") {
              const data = change.doc.data();
              toPut.push({ ...data, [cfg.primaryKey]: docId });
            } else if (change.type === "removed") {
              toDelete.push(docId);
            }
          }

          if (toPut.length === 0 && toDelete.length === 0) return;

          await withRemoteSyncFlag(async () => {
            if (toPut.length > 0) {
              await table.bulkPut(toPut);
            }
            if (toDelete.length > 0) {
              await table.bulkDelete(toDelete);
            }
          });

          if (cfg.localStorageMirrorKey) {
            const latestAll = await table.toArray();
            localStorage.setItem(cfg.localStorageMirrorKey, JSON.stringify(latestAll));
          }

          dispatchCloudSyncUpdate();
        },
        (err) => {
          console.warn(`[CloudSync] Listener error on ${cfg.tableName}:`, err);
        }
      );

      activeUnsubscribes.push(unsub);
    } catch (err) {
      console.warn(`[CloudSync] Could not attach listener for ${cfg.tableName}:`, err);
    }
  }
}

/**
 * Force an immediate full push & pull of all tables with Cloud Firestore.
 */
export async function forceFullCloudDatabaseSync(dexieDb: NoxdermaDexieDB): Promise<number> {
  let totalSyncedDocs = 0;

  for (const cfg of SYNCED_TABLES) {
    const table = (dexieDb as any)[cfg.tableName];
    if (!table) continue;

    try {
      const colRef = collection(firestoreDb, cfg.tableName);
      const [remoteSnap, localRecords] = await Promise.all([
        getDocs(colRef),
        table.toArray(),
      ]);

      const remoteMap = new Map<string, any>();
      remoteSnap.forEach((d) => {
        if (cfg.tableName === "staffMonitors" && IGNORED_DEMO_IDS.has(d.id)) return;
        remoteMap.set(d.id, { ...d.data(), [cfg.primaryKey]: d.id });
      });

      // Push all local records to Cloud Firestore
      for (const localItem of localRecords) {
        const docId = String(localItem?.[cfg.primaryKey] ?? "");
        if (!docId) continue;
        if (cfg.tableName === "staffMonitors" && IGNORED_DEMO_IDS.has(docId)) continue;
        await setDoc(
          doc(firestoreDb, cfg.tableName, docId),
          sanitizeForFirestore(localItem),
          { merge: true }
        );
        totalSyncedDocs++;
      }

      // Pull any remote records into local Dexie
      if (remoteMap.size > 0) {
        await withRemoteSyncFlag(async () => {
          await table.bulkPut(Array.from(remoteMap.values()));
        });
        totalSyncedDocs += remoteMap.size;
      }

      if (cfg.localStorageMirrorKey) {
        const latestAll = await table.toArray();
        localStorage.setItem(cfg.localStorageMirrorKey, JSON.stringify(latestAll));
      }
    } catch (err) {
      console.warn(`[CloudSync] Full sync error on ${cfg.tableName}:`, err);
    }
  }

  dispatchCloudSyncUpdate();
  return totalSyncedDocs;
}
