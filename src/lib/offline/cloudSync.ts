import {
  collection,
  doc,
  getDoc,
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
  { tableName: "settings", primaryKey: "id", localStorageMirrorKey: "noxderma_business_settings" },
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
  { tableName: "manufacturerLedger", primaryKey: "id", localStorageMirrorKey: "noxderma_mfr_ledger" },
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
  { tableName: "operatingExpenses", primaryKey: "id", localStorageMirrorKey: "noxderma_operating_expenses" },
  { tableName: "staffSalaries", primaryKey: "id", localStorageMirrorKey: "noxderma_staff_salaries" },
  { tableName: "partnerTransactions", primaryKey: "id", localStorageMirrorKey: "noxderma_partner_transactions" },
];

const PENDING_UPSERTS_STORAGE_KEY = "noxderma_pending_cloud_upserts";
const PENDING_DELETES_STORAGE_KEY = "noxderma_pending_cloud_deletes";

function loadPendingSet(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return new Set(parsed.map(String));
    }
  } catch {}
  return new Set();
}

function savePendingSet(storageKey: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(set)));
  } catch {}
}

function markPendingUpsert(compositeKey: string) {
  const upserts = loadPendingSet(PENDING_UPSERTS_STORAGE_KEY);
  upserts.add(compositeKey);
  savePendingSet(PENDING_UPSERTS_STORAGE_KEY, upserts);

  const deletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);
  if (deletes.delete(compositeKey)) {
    savePendingSet(PENDING_DELETES_STORAGE_KEY, deletes);
  }
}

function clearPendingUpsert(compositeKey: string) {
  const upserts = loadPendingSet(PENDING_UPSERTS_STORAGE_KEY);
  if (upserts.delete(compositeKey)) {
    savePendingSet(PENDING_UPSERTS_STORAGE_KEY, upserts);
  }
}

function markPendingDelete(compositeKey: string) {
  const deletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);
  deletes.add(compositeKey);
  savePendingSet(PENDING_DELETES_STORAGE_KEY, deletes);

  const upserts = loadPendingSet(PENDING_UPSERTS_STORAGE_KEY);
  if (upserts.delete(compositeKey)) {
    savePendingSet(PENDING_UPSERTS_STORAGE_KEY, upserts);
  }
}

function clearPendingDelete(compositeKey: string) {
  const deletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);
  if (deletes.delete(compositeKey)) {
    savePendingSet(PENDING_DELETES_STORAGE_KEY, deletes);
  }
}

const IGNORED_DEMO_IDS = new Set([
  "staff_ali",
  "staff_bilal",
  "staff_kamran",
  "staff_usman",
]);

function isIgnoredStaffMonitorDoc(docId: string): boolean {
  return (
    IGNORED_DEMO_IDS.has(docId) ||
    docId.startsWith("user_") ||
    docId.startsWith("manual_device_")
  );
}

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

function withFirestoreTimeout<T>(promise: Promise<T>, timeoutMs = 4000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Firestore operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function extractRecordTimestampMs(item: any): number {
  if (!item || typeof item !== "object") return 0;
  const raw = item.updatedAt || item.lastUpdatedIso || item.syncedAt || item.createdAt || item.timestamp;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
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
  if (tableName === "staffMonitors" && isIgnoredStaffMonitorDoc(docId)) return;

  const compositeKey = `${tableName}:${docId}`;
  markPendingUpsert(compositeKey);

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
  const debounceMs = tableName === "staffMonitors" ? 1200 : 350;
  const timer = setTimeout(async () => {
    pendingUpsertTimers.delete(compositeKey);
    try {
      await setDoc(doc(firestoreDb, tableName, String(docId)), snapshotCopy, { merge: true });
      clearPendingUpsert(compositeKey);
    } catch (err) {
      console.warn(`[CloudSync] Failed to upsert ${compositeKey} to Firestore:`, err);
    }
  }, debounceMs);

  pendingUpsertTimers.set(compositeKey, timer);
}

/**
 * Delete a single record from Cloud Firestore (debounced by 180ms so clear() + bulkPut() won't delete kept items).
 */
export function scheduleCloudDelete(tableName: string, docId: string) {
  if (typeof window === "undefined" || !docId) return;
  const compositeKey = `${tableName}:${docId}`;
  markPendingDelete(compositeKey);

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
      clearPendingDelete(compositeKey);
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

const MONITOR_ONLY_TABLES = new Set([
  "staffMonitors",
  "liveMapPins",
  "geoVerifiedPhotos",
  "dailyBeatPlans",
]);

let notifyDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let monitorsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
const pendingChangedTables = new Set<string>();
let pendingWildcardNotify = false;

function dispatchCloudSyncUpdate(tableName?: string) {
  if (typeof window === "undefined") return;

  // High-frequency GPS/battery telemetry tables ONLY notify the Staff Monitoring view
  // so they never trigger full-app IndexedDB re-queries or React re-renders!
  if (tableName && MONITOR_ONLY_TABLES.has(tableName)) {
    if (monitorsDebounceTimer) clearTimeout(monitorsDebounceTimer);
    monitorsDebounceTimer = setTimeout(() => {
      monitorsDebounceTimer = null;
      window.dispatchEvent(new CustomEvent("noxderma-monitors-synced"));
    }, 400);
    return;
  }

  if (tableName) {
    pendingChangedTables.add(tableName);
  } else {
    pendingWildcardNotify = true;
  }

  if (notifyDebounceTimer) clearTimeout(notifyDebounceTimer);
  notifyDebounceTimer = setTimeout(() => {
    notifyDebounceTimer = null;
    const detail = pendingWildcardNotify
      ? undefined
      : { tables: Array.from(pendingChangedTables) };
    pendingChangedTables.clear();
    pendingWildcardNotify = false;
    window.dispatchEvent(new CustomEvent("noxderma-cloud-synced", { detail }));
  }, 450);
}

const mirrorSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleMirrorSync(cfg: SyncedTableConfig, table: any) {
  if (typeof window === "undefined") return;
  if (!cfg.localStorageMirrorKey && cfg.tableName !== "settings") return;

  const existing = mirrorSyncTimers.get(cfg.tableName);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    mirrorSyncTimers.delete(cfg.tableName);
    try {
      const latestAll = await table.toArray();
      if (cfg.localStorageMirrorKey) {
        const runWrite = () => {
          try {
            const json = JSON.stringify(latestAll);
            // Skip oversized payloads so synchronous localStorage writes never block UI clicks
            if (json.length <= 480_000) {
              localStorage.setItem(cfg.localStorageMirrorKey!, json);
            }
          } catch {}
        };
        if (typeof (window as any).requestIdleCallback === "function") {
          (window as any).requestIdleCallback(runWrite, { timeout: 1500 });
        } else {
          runWrite();
        }
      }
      if (cfg.tableName === "settings") {
        applyRemoteSettingsSideEffects(latestAll);
      }
    } catch {}
  }, 350);

  mirrorSyncTimers.set(cfg.tableName, timer);
}

function applyRemoteSettingsSideEffects(items: any[]) {
  if (typeof window === "undefined" || !Array.isArray(items)) return;
  const primary = items.find((i) => i && i.id === "primary") || items[0];
  if (primary) {
    if (primary.colorTheme) {
      try {
        localStorage.setItem("noxderma_color_theme", String(primary.colorTheme));
      } catch {}
    }
    window.dispatchEvent(new CustomEvent("noxderma_settings_updated", { detail: primary }));
  }
}

/**
 * Synchronize global Partner Settings (`partnerSettings/config`) across devices so Dashboard,
 * Audit Logs, and Partners Khata always reflect the latest partners on every device.
 */
async function syncPartnerSettingsConfig(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const configDocRef = doc(firestoreDb, "partnerSettings", "config");
    const snap = await withFirestoreTimeout(getDoc(configDocRef), 3500);
    const localRaw = localStorage.getItem("nox_partner_configs");
    const localUpdatedAt = localStorage.getItem("nox_partner_configs_updated_at") || "";

    let localPartners: any[] | null = null;
    if (localRaw) {
      try {
        const parsed = JSON.parse(localRaw);
        if (Array.isArray(parsed) && parsed.length > 0) localPartners = parsed;
      } catch {}
    }

    if (snap.exists()) {
      const data = snap.data();
      if (data?.partners && Array.isArray(data.partners) && data.partners.length > 0) {
        const remoteUpdatedAt = typeof data.updatedAt === "string" ? data.updatedAt : "";
        const localIsNewer =
          Boolean(localUpdatedAt) &&
          (!remoteUpdatedAt || new Date(localUpdatedAt).getTime() > new Date(remoteUpdatedAt).getTime());

        if (localIsNewer && localPartners) {
          await withFirestoreTimeout(
            setDoc(configDocRef, { partners: localPartners, updatedAt: localUpdatedAt }, { merge: true }),
            3000
          );
        } else {
          localStorage.setItem("nox_partner_configs", JSON.stringify(data.partners));
          if (remoteUpdatedAt) {
            localStorage.setItem("nox_partner_configs_updated_at", remoteUpdatedAt);
          }
          if (data.partners[0]?.name) localStorage.setItem("nox_partner_1_name", data.partners[0].name);
          if (data.partners[1]?.name) localStorage.setItem("nox_partner_2_name", data.partners[1].name);
        }
      }
    } else if (localPartners && localPartners.length > 0) {
      const nowIso = localUpdatedAt || new Date().toISOString();
      localStorage.setItem("nox_partner_configs_updated_at", nowIso);
      await withFirestoreTimeout(
        setDoc(configDocRef, { partners: localPartners, updatedAt: nowIso }, { merge: true }),
        3000
      );
    }
  } catch (err) {
    console.warn("[CloudSync] Partner settings sync warning:", err);
  }
}

/**
 * Initialize two-way real-time synchronization between Dexie IndexedDB and Cloud Firestore.
 */
export async function startRealtimeCloudSync(dexieDb: NoxdermaDexieDB): Promise<void> {
  if (typeof window === "undefined" || isInitialized) return;
  isInitialized = true;

  // Step 0: Global real-time listener for partnerSettings/config across all pages & devices
  syncPartnerSettingsConfig().then(() => dispatchCloudSyncUpdate());
  try {
    const partnerConfigRef = doc(firestoreDb, "partnerSettings", "config");
    const unsubPartners = onSnapshot(
      partnerConfigRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (!data?.partners || !Array.isArray(data.partners) || data.partners.length === 0) return;
        const remoteUpdatedAt = typeof data.updatedAt === "string" ? data.updatedAt : "";
        const localUpdatedAt = localStorage.getItem("nox_partner_configs_updated_at") || "";
        const localIsNewer =
          Boolean(localUpdatedAt) &&
          (!remoteUpdatedAt || new Date(localUpdatedAt).getTime() > new Date(remoteUpdatedAt).getTime());

        if (!localIsNewer) {
          localStorage.setItem("nox_partner_configs", JSON.stringify(data.partners));
          if (remoteUpdatedAt) {
            localStorage.setItem("nox_partner_configs_updated_at", remoteUpdatedAt);
          }
          if (data.partners[0]?.name) localStorage.setItem("nox_partner_1_name", data.partners[0].name);
          if (data.partners[1]?.name) localStorage.setItem("nox_partner_2_name", data.partners[1].name);
          dispatchCloudSyncUpdate();
        }
      },
      (err) => {
        console.warn("[CloudSync] Partner config listener warning:", err);
      }
    );
    activeUnsubscribes.push(unsubPartners);
  } catch {}

  // Step 1: Migrate any legacy localStorage arrays into Dexie ONLY if table has never initialized cloud sync
  for (const cfg of SYNCED_TABLES) {
    if (!cfg.localStorageMirrorKey) continue;
    const initFlagKey = `noxderma_cloud_init_${cfg.tableName}`;
    if (localStorage.getItem(initFlagKey) === "true") continue;

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
                !(cfg.tableName === "staffMonitors" && isIgnoredStaffMonitorDoc(String(item[cfg.primaryKey])))
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

  // Step 2: Reconcile collections in non-blocking batches of 5 (yielding to main thread between batches
  // so navigation clicks never stall behind 30 simultaneous IndexedDB transactions) and attach live listeners.
  const INIT_BATCH_SIZE = 5;

  const initSingleCollection = async (cfg: SyncedTableConfig) => {
    const table = (dexieDb as any)[cfg.tableName];
    if (!table) return;

    let reconciledOk = false;

    try {
      const initFlagKey = `noxderma_cloud_init_${cfg.tableName}`;
      const wasAlreadyInitialized = localStorage.getItem(initFlagKey) === "true";

      // Flush any pending offline deletes for this table first
      const pendingDeletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);
      const tablePrefix = `${cfg.tableName}:`;
      const tablePendingDeleteIds: string[] = [];
      pendingDeletes.forEach((compKey) => {
        if (compKey.startsWith(tablePrefix)) {
          tablePendingDeleteIds.push(compKey.slice(tablePrefix.length));
        }
      });

      if (tablePendingDeleteIds.length > 0) {
        await Promise.allSettled(
          tablePendingDeleteIds.map(async (delId) => {
            await withFirestoreTimeout(deleteDoc(doc(firestoreDb, cfg.tableName, delId)), 3000);
            clearPendingDelete(`${cfg.tableName}:${delId}`);
          })
        );
      }

      const colRef = collection(firestoreDb, cfg.tableName);
      const [remoteSnap, localRecords] = await Promise.all([
        withFirestoreTimeout(getDocs(colRef), 6500),
        table.toArray(),
      ]);

      const isFromServer = !remoteSnap.metadata?.fromCache;
      const pendingUpserts = loadPendingSet(PENDING_UPSERTS_STORAGE_KEY);
      const remainingDeletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);

      const remoteMap = new Map<string, any>();
      remoteSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (cfg.tableName === "staffMonitors" && isIgnoredStaffMonitorDoc(docSnap.id)) {
          deleteDoc(doc(firestoreDb, cfg.tableName, docSnap.id)).catch(() => {});
          return;
        }
        if (remainingDeletes.has(`${cfg.tableName}:${docSnap.id}`)) {
          return;
        }
        remoteMap.set(docSnap.id, { ...data, [cfg.primaryKey]: docSnap.id });
      });

      // Clean any legacy ignored local staffMonitors records
      if (cfg.tableName === "staffMonitors") {
        const legacyLocalIds = localRecords
          .map((item: any) => String(item?.[cfg.primaryKey] ?? ""))
          .filter((id: string) => id && isIgnoredStaffMonitorDoc(id));
        if (legacyLocalIds.length > 0) {
          await withRemoteSyncFlag(async () => {
            await table.bulkDelete(legacyLocalIds);
          });
        }
      }

      const localToDeleteIds: string[] = [];
      const localToPushItems: any[] = [];

      for (const localItem of localRecords) {
        const docId = String(localItem?.[cfg.primaryKey] ?? "");
        if (!docId) continue;
        if (cfg.tableName === "staffMonitors" && isIgnoredStaffMonitorDoc(docId)) continue;

        const compKey = `${cfg.tableName}:${docId}`;
        const isPendingUpsert = pendingUpserts.has(compKey);
        const remoteItem = remoteMap.get(docId);

        if (!remoteItem) {
          if (isPendingUpsert || !wasAlreadyInitialized) {
            localToPushItems.push(localItem);
          } else if (isFromServer) {
            localToDeleteIds.push(docId);
          }
        } else {
          const localTs = extractRecordTimestampMs(localItem);
          const remoteTs = extractRecordTimestampMs(remoteItem);
          if (isPendingUpsert || (localTs > 0 && localTs > remoteTs)) {
            localToPushItems.push(localItem);
            remoteMap.set(docId, localItem);
          }
        }
      }

      // Apply remote documents & remote deletions into local IndexedDB
      await withRemoteSyncFlag(async () => {
        if (localToDeleteIds.length > 0) {
          await table.bulkDelete(localToDeleteIds);
        }
        if (remoteMap.size > 0) {
          await table.bulkPut(Array.from(remoteMap.values()));
        }
      });

      // Push any genuinely un-synced or newer local records to Cloud Firestore
      if (localToPushItems.length > 0) {
        await Promise.allSettled(
          localToPushItems.map(async (localItem: any) => {
            const docId = String(localItem[cfg.primaryKey]);
            await withFirestoreTimeout(
              setDoc(
                doc(firestoreDb, cfg.tableName, docId),
                sanitizeForFirestore(localItem),
                { merge: true }
              ),
              3500
            );
            clearPendingUpsert(`${cfg.tableName}:${docId}`);
          })
        );
      }

      localStorage.setItem(initFlagKey, "true");
      reconciledOk = true;

      scheduleMirrorSync(cfg, table);
      dispatchCloudSyncUpdate(cfg.tableName);
    } catch (err) {
      console.warn(`[CloudSync] Initial reconciliation warning for ${cfg.tableName}:`, err);
    }

    // Real-time live listener (Cloud -> Local)
    try {
      const colRef = collection(firestoreDb, cfg.tableName);
      let isFirstSnapshot = true;

      const unsub = onSnapshot(
        colRef,
        async (snapshot) => {
          // Skip redundant full-collection initial snapshot if initial reconciliation just succeeded
          if (isFirstSnapshot) {
            isFirstSnapshot = false;
            if (reconciledOk) return;
          }

          // Skip local latency-compensation echoes of our own writes (already stored in Dexie)
          if (snapshot.metadata?.hasPendingWrites) return;

          const changes = snapshot.docChanges();
          if (changes.length === 0) return;

          const toPut: any[] = [];
          const toDelete: string[] = [];
          const pendingDeletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);

          for (const change of changes) {
            const docId = change.doc.id;
            if (cfg.tableName === "staffMonitors" && isIgnoredStaffMonitorDoc(docId)) continue;
            if (pendingDeletes.has(`${cfg.tableName}:${docId}`)) continue;

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

          scheduleMirrorSync(cfg, table);
          dispatchCloudSyncUpdate(cfg.tableName);
        },
        (err) => {
          console.warn(`[CloudSync] Listener error on ${cfg.tableName}:`, err);
        }
      );

      activeUnsubscribes.push(unsub);
    } catch (err) {
      console.warn(`[CloudSync] Could not attach listener for ${cfg.tableName}:`, err);
    }
  };

  (async () => {
    for (let i = 0; i < SYNCED_TABLES.length; i += INIT_BATCH_SIZE) {
      const batch = SYNCED_TABLES.slice(i, i + INIT_BATCH_SIZE);
      await Promise.allSettled(batch.map((cfg) => initSingleCollection(cfg)));
      // Yield 35ms to the main UI thread between batches so clicks & route transitions stay 0ms
      await new Promise((resolve) => setTimeout(resolve, 35));
    }
  })();
}

/**
 * Force an immediate delta push & pull of all tables with Cloud Firestore (bounded with strict timeouts so it never hangs).
 */
export async function forceFullCloudDatabaseSync(dexieDb: NoxdermaDexieDB): Promise<number> {
  let totalSyncedDocs = 0;
  const BATCH_CONCURRENCY = 6;

  await syncPartnerSettingsConfig();

  const syncSingleTable = async (cfg: SyncedTableConfig) => {
    const table = (dexieDb as any)[cfg.tableName];
    if (!table) return;

    try {
      const initFlagKey = `noxderma_cloud_init_${cfg.tableName}`;
      const wasAlreadyInitialized = localStorage.getItem(initFlagKey) === "true";

      // Flush any pending deletes for this table first
      const pendingDeletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);
      const tablePrefix = `${cfg.tableName}:`;
      const tablePendingDeleteIds: string[] = [];
      pendingDeletes.forEach((compKey) => {
        if (compKey.startsWith(tablePrefix)) {
          tablePendingDeleteIds.push(compKey.slice(tablePrefix.length));
        }
      });

      if (tablePendingDeleteIds.length > 0) {
        await Promise.allSettled(
          tablePendingDeleteIds.map(async (delId) => {
            await withFirestoreTimeout(deleteDoc(doc(firestoreDb, cfg.tableName, delId)), 3000);
            clearPendingDelete(`${cfg.tableName}:${delId}`);
          })
        );
      }

      const colRef = collection(firestoreDb, cfg.tableName);
      const [remoteSnap, localRecords] = await Promise.all([
        withFirestoreTimeout(getDocs(colRef), 4500),
        table.toArray(),
      ]);

      const isFromServer = !remoteSnap.metadata?.fromCache;
      const pendingUpserts = loadPendingSet(PENDING_UPSERTS_STORAGE_KEY);
      const remainingDeletes = loadPendingSet(PENDING_DELETES_STORAGE_KEY);

      const remoteMap = new Map<string, any>();
      remoteSnap.forEach((d) => {
        if (cfg.tableName === "staffMonitors" && isIgnoredStaffMonitorDoc(d.id)) return;
        if (remainingDeletes.has(`${cfg.tableName}:${d.id}`)) return;
        remoteMap.set(d.id, { ...d.data(), [cfg.primaryKey]: d.id });
      });

      const localToDeleteIds: string[] = [];
      const recordsToPush: any[] = [];

      for (const localItem of localRecords) {
        const docId = String(localItem?.[cfg.primaryKey] ?? "");
        if (!docId) continue;
        if (cfg.tableName === "staffMonitors" && isIgnoredStaffMonitorDoc(docId)) continue;

        const compKey = `${cfg.tableName}:${docId}`;
        const isPendingUpsert = pendingUpserts.has(compKey);
        const remoteItem = remoteMap.get(docId);

        if (!remoteItem) {
          if (isPendingUpsert || !wasAlreadyInitialized) {
            recordsToPush.push(localItem);
          } else if (isFromServer) {
            localToDeleteIds.push(docId);
          }
        } else {
          const localTs = extractRecordTimestampMs(localItem);
          const remoteTs = extractRecordTimestampMs(remoteItem);
          if (isPendingUpsert || (localTs > 0 && localTs > remoteTs)) {
            recordsToPush.push(localItem);
            remoteMap.set(docId, localItem);
          }
        }
      }

      if (recordsToPush.length > 0) {
        await Promise.allSettled(
          recordsToPush.map(async (localItem: any) => {
            const docId = String(localItem[cfg.primaryKey]);
            totalSyncedDocs++;
            await withFirestoreTimeout(
              setDoc(
                doc(firestoreDb, cfg.tableName, docId),
                sanitizeForFirestore(localItem),
                { merge: true }
              ),
              3000
            );
            clearPendingUpsert(`${cfg.tableName}:${docId}`);
          })
        );
      }

      // Apply remote records & remote deletions into local Dexie
      await withRemoteSyncFlag(async () => {
        if (localToDeleteIds.length > 0) {
          await table.bulkDelete(localToDeleteIds);
        }
        if (remoteMap.size > 0) {
          await table.bulkPut(Array.from(remoteMap.values()));
          totalSyncedDocs += remoteMap.size;
        }
      });

      localStorage.setItem(initFlagKey, "true");
      scheduleMirrorSync(cfg, table);
    } catch (err) {
      console.warn(`[CloudSync] Full sync warning on ${cfg.tableName}:`, err);
    }
  };

  for (let i = 0; i < SYNCED_TABLES.length; i += BATCH_CONCURRENCY) {
    const chunk = SYNCED_TABLES.slice(i, i + BATCH_CONCURRENCY);
    await Promise.allSettled(chunk.map((cfg) => syncSingleTable(cfg)));
  }

  dispatchCloudSyncUpdate();
  return totalSyncedDocs;
}

