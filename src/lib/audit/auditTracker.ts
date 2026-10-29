import { offlineDb, type LocalAuditLog } from "@/lib/offline/db";
import { getDeviceId } from "@/lib/offline/device";
import type { Invoice, Customer, Product, Payment, InventoryBatch } from "@/types";

export interface RecordActivityParams {
  userId?: string;
  userName?: string;
  userRole?: string;
  userEmail?: string;
  action: "create" | "update" | "delete" | "undo" | string;
  entityType:
    | "visit"
    | "invoice"
    | "customer"
    | "product"
    | "payment"
    | "inventory_batch"
    | "category"
    | "setting"
    | string;
  entityId: string;
  entityTitle: string;
  details: string;
  snapshotBefore?: any;
  snapshotAfter?: any;
  canUndo?: boolean;
  timestamp?: string;
}

/**
 * Record an audit log entry into IndexedDB offlineDb.auditLogs.
 * Non-blocking, fails gracefully so application workflows never crash.
 */
export async function recordActivity(params: RecordActivityParams): Promise<string> {
  const now = params.timestamp || new Date().toISOString();
  const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const deviceId = typeof window !== "undefined" ? getDeviceId() : "device_sys";

  const entry: LocalAuditLog = {
    id,
    userId: params.userId || "usr_admin",
    userName: params.userName || "Owner",
    userRole: params.userRole === "admin" ? "owner" : params.userRole || "owner",
    userEmail: params.userEmail,
    deviceId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    entityTitle: params.entityTitle,
    details: params.details,
    timestamp: now,
    snapshotBefore: params.snapshotBefore ? JSON.parse(JSON.stringify(params.snapshotBefore)) : undefined,
    snapshotAfter: params.snapshotAfter ? JSON.parse(JSON.stringify(params.snapshotAfter)) : undefined,
    canUndo: params.canUndo ?? (params.action !== "undo"),
    isUndone: false,
  };

  try {
    await offlineDb.auditLogs.put(entry);
  } catch (err) {
    console.warn("Failed to record activity audit log:", err);
  }

  return id;
}

/**
 * Undo an action performed by any staff member.
 * Restores previous entity snapshot, adjusts inventory stock & customer balance accordingly.
 * Strictly available to Owner / Admin.
 */
export async function undoActivity(
  logId: string,
  performer: { id: string; displayName: string; role: string }
): Promise<{ success: boolean; message: string }> {
  try {
    const log = await offlineDb.auditLogs.get(logId);
    if (!log) {
      return { success: false, message: "Audit log entry not found." };
    }

    if (log.isUndone) {
      return { success: false, message: "This action has already been undone." };
    }

    if (!log.canUndo) {
      return { success: false, message: "This action cannot be undone." };
    }

    const now = new Date().toISOString();

    // 1. Rollback according to entityType and action
    if (log.entityType === "invoice") {
      await offlineDb.transaction(
        "rw",
        [
          offlineDb.invoices,
          offlineDb.inventoryBatches,
          offlineDb.stockMovements,
          offlineDb.customers,
          offlineDb.auditLogs,
        ],
        async () => {
          if (log.action === "create") {
            // Undo creation = Delete invoice and return stock & reverse customer balance
            const inv = (await offlineDb.invoices.get(log.entityId)) || (log.snapshotAfter as Invoice);
            if (inv) {
              // Revert stock
              for (const line of inv.lines || []) {
                for (const alloc of line.batchAllocations || []) {
                  if (alloc.batchId) {
                    const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                    if (batch) {
                      const restoredQty = (Number(batch.remainingQuantity) || 0) + (alloc.quantity || 0);
                      await offlineDb.inventoryBatches.update(alloc.batchId, {
                        remainingQuantity: restoredQty,
                        updatedAt: now,
                      });

                      await offlineDb.stockMovements.add({
                        id: `mov_undo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        productId: line.productId,
                        productName: line.productName,
                        batchId: alloc.batchId,
                        batchNumber: alloc.batchNumber || batch.batchNumber,
                        type: "sales_return",
                        quantityChange: alloc.quantity,
                        balanceAfter: restoredQty,
                        referenceId: inv.id,
                        referenceType: "invoice",
                        userId: performer.id,
                        userName: performer.displayName,
                        reason: `Undo bill creation by owner: ${inv.provisionalReference}`,
                        timestamp: now,
                      });
                    }
                  }
                }
              }

              // Revert customer balance
              if (inv.customerId && inv.outstandingBalance > 0) {
                const cust = await offlineDb.customers.get(inv.customerId);
                if (cust) {
                  const newBal = Math.max(0, (cust.currentOutstandingBalance || 0) - inv.outstandingBalance);
                  await offlineDb.customers.update(inv.customerId, {
                    currentOutstandingBalance: newBal,
                    updatedAt: now,
                  });
                }
              }

              // Delete the invoice record
              await offlineDb.invoices.delete(inv.id);
            }
          } else if (log.action === "delete") {
            // Undo deletion = Restore deleted invoice from snapshotBefore
            const inv = log.snapshotBefore as Invoice;
            if (inv) {
              await offlineDb.invoices.put(inv);

              // Re-deduct stock
              for (const line of inv.lines || []) {
                for (const alloc of line.batchAllocations || []) {
                  if (alloc.batchId) {
                    const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                    if (batch) {
                      const newRem = Math.max(0, (Number(batch.remainingQuantity) || 0) - (alloc.quantity || 0));
                      await offlineDb.inventoryBatches.update(alloc.batchId, {
                        remainingQuantity: newRem,
                        updatedAt: now,
                      });

                      await offlineDb.stockMovements.add({
                        id: `mov_rest_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                        productId: line.productId,
                        productName: line.productName,
                        batchId: alloc.batchId,
                        batchNumber: alloc.batchNumber || batch.batchNumber,
                        type: "sales_deduction",
                        quantityChange: -alloc.quantity,
                        balanceAfter: newRem,
                        referenceId: inv.id,
                        referenceType: "invoice",
                        userId: performer.id,
                        userName: performer.displayName,
                        reason: `Restored deleted bill by owner: ${inv.provisionalReference}`,
                        timestamp: now,
                      });
                    }
                  }
                }
              }

              // Re-apply customer balance
              if (inv.customerId && inv.outstandingBalance > 0) {
                const cust = await offlineDb.customers.get(inv.customerId);
                if (cust) {
                  const newBal = (cust.currentOutstandingBalance || 0) + inv.outstandingBalance;
                  await offlineDb.customers.update(inv.customerId, {
                    currentOutstandingBalance: newBal,
                    updatedAt: now,
                  });
                }
              }
            }
          } else if (log.action === "update") {
            // Undo update = Revert current allocations & balance, restore snapshotBefore
            const oldInv = log.snapshotBefore as Invoice;
            const currentInv = await offlineDb.invoices.get(log.entityId);

            if (oldInv && currentInv) {
              // 1. Revert current allocations
              for (const line of currentInv.lines || []) {
                for (const alloc of line.batchAllocations || []) {
                  if (alloc.batchId) {
                    const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                    if (batch) {
                      const restored = (Number(batch.remainingQuantity) || 0) + (alloc.quantity || 0);
                      await offlineDb.inventoryBatches.update(alloc.batchId, { remainingQuantity: restored });
                    }
                  }
                }
              }

              // Revert customer balance
              if (currentInv.customerId && currentInv.outstandingBalance > 0) {
                const cust = await offlineDb.customers.get(currentInv.customerId);
                if (cust) {
                  const newBal = Math.max(0, (cust.currentOutstandingBalance || 0) - currentInv.outstandingBalance);
                  await offlineDb.customers.update(currentInv.customerId, { currentOutstandingBalance: newBal });
                }
              }

              // 2. Re-apply oldInv allocations
              for (const line of oldInv.lines || []) {
                for (const alloc of line.batchAllocations || []) {
                  if (alloc.batchId) {
                    const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                    if (batch) {
                      const newRem = Math.max(0, (Number(batch.remainingQuantity) || 0) - (alloc.quantity || 0));
                      await offlineDb.inventoryBatches.update(alloc.batchId, { remainingQuantity: newRem });
                    }
                  }
                }
              }

              // Re-apply old customer balance
              if (oldInv.customerId && oldInv.outstandingBalance > 0) {
                const cust = await offlineDb.customers.get(oldInv.customerId);
                if (cust) {
                  const newBal = (cust.currentOutstandingBalance || 0) + oldInv.outstandingBalance;
                  await offlineDb.customers.update(oldInv.customerId, { currentOutstandingBalance: newBal });
                }
              }

              // Put old invoice back
              await offlineDb.invoices.put(oldInv);
            }
          }
        }
      );
    } else if (log.entityType === "visit" || log.entityType === "customerVisit") {
      await offlineDb.transaction("rw", [offlineDb.customerVisits], async () => {
        if (log.action === "create") {
          await offlineDb.customerVisits.delete(log.entityId);
        } else if (log.action === "delete" || log.action === "update") {
          if (log.snapshotBefore) {
            await offlineDb.customerVisits.put(log.snapshotBefore);
          }
        }
      });
    } else if (log.entityType === "customer") {
      await offlineDb.transaction("rw", [offlineDb.customers], async () => {
        if (log.action === "create") {
          await offlineDb.customers.delete(log.entityId);
        } else if (log.action === "delete" || log.action === "update") {
          if (log.snapshotBefore) {
            await offlineDb.customers.put(log.snapshotBefore);
          }
        }
      });
    } else if (log.entityType === "product") {
      await offlineDb.transaction(
        "rw",
        [
          offlineDb.products,
          offlineDb.productPricing,
          offlineDb.inventoryBatches,
          offlineDb.stockMovements,
        ],
        async () => {
          if (log.action === "create") {
            await offlineDb.products.delete(log.entityId);
            await offlineDb.productPricing.delete(log.entityId);
            await offlineDb.inventoryBatches.where("productId").equals(log.entityId).delete();
            await offlineDb.stockMovements.where("productId").equals(log.entityId).delete();
          } else if (log.action === "delete" || log.action === "update") {
            if (log.snapshotBefore) {
              if (log.snapshotBefore.product && log.snapshotBefore.product.id) {
                await offlineDb.products.put(log.snapshotBefore.product);
                if (log.snapshotBefore.pricing) {
                  await offlineDb.productPricing.put(log.snapshotBefore.pricing);
                }
                if (Array.isArray(log.snapshotBefore.batches)) {
                  await offlineDb.inventoryBatches.where("productId").equals(log.entityId).delete();
                  if (log.snapshotBefore.batches.length > 0) {
                    await offlineDb.inventoryBatches.bulkPut(log.snapshotBefore.batches);
                  }
                }
              } else {
                await offlineDb.products.put(log.snapshotBefore);
              }
            }
          }
        }
      );
    } else if (log.entityType === "payment") {
      await offlineDb.transaction("rw", [offlineDb.payments, offlineDb.customers], async () => {
        if (log.action === "create") {
          const pay = (await offlineDb.payments.get(log.entityId)) || (log.snapshotAfter as Payment);
          if (pay && pay.customerId && pay.amount > 0) {
            const cust = await offlineDb.customers.get(pay.customerId);
            if (cust) {
              await offlineDb.customers.update(pay.customerId, {
                currentOutstandingBalance: (cust.currentOutstandingBalance || 0) + pay.amount,
              });
            }
          }
          await offlineDb.payments.delete(log.entityId);
        } else if (log.action === "delete") {
          if (log.snapshotBefore) {
            const pay = log.snapshotBefore as Payment;
            await offlineDb.payments.put(pay);
            if (pay.customerId && pay.amount > 0) {
              const cust = await offlineDb.customers.get(pay.customerId);
              if (cust) {
                await offlineDb.customers.update(pay.customerId, {
                  currentOutstandingBalance: Math.max(0, (cust.currentOutstandingBalance || 0) - pay.amount),
                });
              }
            }
          }
        } else if (log.action === "update") {
          if (log.snapshotBefore) {
            await offlineDb.payments.put(log.snapshotBefore);
          }
        }
      });
    } else if (log.entityType === "inventory_batch") {
      await offlineDb.transaction("rw", [offlineDb.inventoryBatches], async () => {
        if (log.snapshotBefore) {
          await offlineDb.inventoryBatches.put(log.snapshotBefore);
        }
      });
    } else if (log.entityType === "category") {
      await offlineDb.transaction("rw", [offlineDb.categories], async () => {
        if (log.action === "create") {
          await offlineDb.categories.delete(log.entityId);
        } else if (log.snapshotBefore) {
          await offlineDb.categories.put(log.snapshotBefore);
        }
      });
    } else if (log.entityType === "setting") {
      await offlineDb.transaction("rw", [offlineDb.settings], async () => {
        if (log.snapshotBefore) {
          await offlineDb.settings.put(log.snapshotBefore);
        }
      });
    }

    // 2. Mark this audit log entry as undone
    const updatedLog: LocalAuditLog = {
      ...log,
      isUndone: true,
      undoneAt: now,
      undoneBy: performer.displayName,
      undoneDetails: `Undone by owner (${performer.displayName}) on ${now}`,
    };
    await offlineDb.auditLogs.put(updatedLog);

    // 3. Record the "undo" action itself in the audit tracker
    await recordActivity({
      userId: performer.id,
      userName: performer.displayName,
      userRole: performer.role,
      action: "undo",
      entityType: log.entityType,
      entityId: log.entityId,
      entityTitle: log.entityTitle || log.entityId,
      details: `Undid previous "${log.action}" action: "${log.details}"`,
      snapshotBefore: log.snapshotAfter,
      snapshotAfter: log.snapshotBefore,
      canUndo: false,
    });

    return {
      success: true,
      message: `Action on "${log.entityTitle || log.entityId}" was undone successfully!`,
    };
  } catch (err: any) {
    console.error("Undo action failed:", err);
    return {
      success: false,
      message: "Undo operation failed: " + (err.message || "Unknown error"),
    };
  }
}

/**
 * Permanently deletes specified audit log entries from local Dexie database
 * and propagates deletions to Cloud Firestore via Dexie hooks and direct deleteDoc batch.
 */
export async function deleteAuditLogEntries(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  try {
    // 1. Delete from Dexie (fires table.hook("deleting") which invokes scheduleCloudDelete)
    await offlineDb.auditLogs.bulkDelete(ids);

    // 2. Also directly delete from Cloud Firestore in parallel batches to guarantee instant cloud cleanup
    try {
      const { deleteDoc, doc } = await import("firebase/firestore");
      const { db: firestoreDb } = await import("@/lib/firebase/config");
      await Promise.allSettled(
        ids.map((id) => deleteDoc(doc(firestoreDb, "auditLogs", String(id))))
      );
    } catch (remoteErr) {
      console.warn("Direct Firestore bulk delete warning (fallback to sync hooks):", remoteErr);
    }

    // Ensure we don't accidentally re-seed deleted logs
    if (typeof window !== "undefined") {
      localStorage.setItem("noxderma_audit_seeded", "true");
    }

    return ids.length;
  } catch (err) {
    console.error("Failed to delete audit logs:", err);
    throw err;
  }
}

/**
 * Permanently deletes ALL audit log entries.
 */
export async function clearAllAuditLogs(): Promise<number> {
  try {
    const allLogs = await offlineDb.auditLogs.toArray();
    const ids = allLogs.map((l) => l.id);
    if (ids.length > 0) {
      await deleteAuditLogEntries(ids);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("noxderma_audit_seeded", "true");
    }
    return ids.length;
  } catch (err) {
    console.error("Failed to clear all audit logs:", err);
    throw err;
  }
}

/**
 * Fetch all audit logs sorted from newest to oldest.
 */
export async function getAuditLogs(): Promise<LocalAuditLog[]> {
  try {
    const list = await offlineDb.auditLogs.toArray();
    return (list || []).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch (err) {
    console.error("Failed to load audit logs:", err);
    return [];
  }
}

/**
 * Seed historical audit records if auditLogs table is currently empty,
 * inspecting existing invoices and customers so the owner has an immediate,
 * informative history trail to review and test.
 */
export async function seedInitialAuditLogsIfEmpty(): Promise<void> {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("noxderma_audit_seeded") === "true") {
      return;
    }

    const count = await offlineDb.auditLogs.count();
    if (count > 0) {
      if (typeof window !== "undefined") {
        localStorage.setItem("noxderma_audit_seeded", "true");
      }
      return;
    }

    const [invoices, customers, products, visits] = await Promise.all([
      offlineDb.invoices.toArray(),
      offlineDb.customers.toArray(),
      offlineDb.products.toArray(),
      offlineDb.customerVisits.toArray(),
    ]);

    const logsToSeed: LocalAuditLog[] = [];

    // Seed invoices
    for (const inv of invoices || []) {
      logsToSeed.push({
        id: `log_init_inv_${inv.id}`,
        userId: inv.salesRepId || "usr_admin",
        userName: inv.salesRepName || "Owner",
        userRole: "owner",
        deviceId: inv.deviceId || "dev_01",
        action: "create",
        entityType: "invoice",
        entityId: inv.id,
        entityTitle: `Bill #${inv.provisionalReference || inv.id}`,
        details: `Issued customer bill for ${inv.customerName} (${inv.lines?.length || 1} medicines, total PKR ${(inv.netTotal || 0).toLocaleString()})`,
        timestamp: inv.createdAt || inv.invoiceDate || new Date().toISOString(),
        snapshotAfter: inv,
        canUndo: true,
        isUndone: false,
      });
    }

    // Seed customers
    for (const c of customers || []) {
      logsToSeed.push({
        id: `log_init_cust_${c.id}`,
        userId: "usr_admin",
        userName: "Owner",
        userRole: "owner",
        deviceId: "dev_01",
        action: "create",
        entityType: "customer",
        entityId: c.id,
        entityTitle: c.name,
        details: `Registered new medical store/pharmacy in ${c.city || "Karachi"} (Category: ${c.category}, Credit Limit: PKR ${(c.creditLimit || 0).toLocaleString()})`,
        timestamp: c.createdAt || new Date().toISOString(),
        snapshotAfter: c,
        canUndo: true,
        isUndone: false,
      });
    }

    // Seed products
    for (const p of products?.slice(0, 10) || []) {
      logsToSeed.push({
        id: `log_init_prod_${p.id}`,
        userId: "usr_admin",
        userName: "Owner",
        userRole: "owner",
        deviceId: "dev_01",
        action: "create",
        entityType: "product",
        entityId: p.id,
        entityTitle: p.name,
        details: `Added new pharmaceutical product: ${p.name} (${p.genericName || p.packSize || "Medicine"})`,
        timestamp: p.createdAt || new Date().toISOString(),
        snapshotAfter: p,
        canUndo: true,
        isUndone: false,
      });
    }

    // Seed visits
    for (const v of visits || []) {
      logsToSeed.push({
        id: `log_init_visit_${v.id}`,
        userId: v.employeeId || "usr_admin",
        userName: v.employeeName || "Owner",
        userRole: "owner",
        deviceId: "dev_01",
        action: "create",
        entityType: "visit",
        entityId: v.id,
        entityTitle: `Visit: ${v.customerName} (${v.contactPerson})`,
        details: `Recorded visit to "${v.customerName}" (Contact: ${v.contactPerson}, Interest: ${v.productInterestLevel || "medium"}). Notes: ${v.visitNotes || "No notes"}`,
        timestamp: v.createdAt || v.visitDate || new Date().toISOString(),
        snapshotAfter: v,
        canUndo: true,
        isUndone: false,
      });
    }

    if (logsToSeed.length > 0) {
      await offlineDb.auditLogs.bulkPut(logsToSeed);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("noxderma_audit_seeded", "true");
    }
  } catch (err) {
    console.warn("Could not seed initial audit logs:", err);
  }
}
