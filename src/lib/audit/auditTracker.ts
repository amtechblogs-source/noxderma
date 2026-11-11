import { offlineDb, type LocalAuditLog } from "@/lib/offline/db";
import { getDeviceId } from "@/lib/offline/device";
import {
  scheduleCloudUpsert,
  scheduleCloudDelete,
  sanitizeForFirestore,
} from "@/lib/offline/cloudSync";
import { db as firestoreDb } from "@/lib/firebase/config";
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import type { Invoice, Customer, Product, Payment, InventoryBatch, PartnerTransaction } from "@/types";

async function syncMirrorKeyFromTable(tableName: string, mirrorKey: string) {
  if (typeof window === "undefined") return;
  try {
    const table = (offlineDb as any)[tableName];
    if (table) {
      const all = await table.toArray();
      localStorage.setItem(mirrorKey, JSON.stringify(all || []));
    }
  } catch (err) {
    console.warn(`[AuditUndo] Failed to sync localStorage mirror ${mirrorKey}:`, err);
  }
}

async function cloudUpsertWithFallback(collectionName: string, docId: string, data: any) {
  if (!docId) return;
  scheduleCloudUpsert(collectionName, docId, data);
  try {
    await Promise.race([
      setDoc(doc(firestoreDb, collectionName, String(docId)), sanitizeForFirestore(data), {
        merge: true,
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1800)),
    ]);
  } catch {
    // scheduleCloudUpsert will still retry
  }
}

async function cloudDeleteWithFallback(collectionName: string, docId: string) {
  if (!docId) return;
  scheduleCloudDelete(collectionName, docId);
  try {
    await Promise.race([
      deleteDoc(doc(firestoreDb, collectionName, String(docId))),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 1800)),
    ]);
  } catch {
    // scheduleCloudDelete will still retry
  }
}

/**
 * Resolves previous partners list for a partnerSettings_config log entry,
 * even for legacy log entries that were recorded without `snapshotBefore`.
 */
async function resolvePreviousPartnersForLog(
  log: LocalAuditLog
): Promise<Array<{ id: string; name: string }> | null> {
  if (log.snapshotBefore) {
    if (Array.isArray(log.snapshotBefore.partners) && log.snapshotBefore.partners.length > 0) {
      return log.snapshotBefore.partners;
    }
    if (Array.isArray(log.snapshotBefore) && log.snapshotBefore.length > 0) {
      return log.snapshotBefore;
    }
  }

  // Fallback for legacy logs without snapshotBefore:
  // 1. Check if there is an earlier audit log for partnerSettings_config
  try {
    const allLogs = await offlineDb.auditLogs
      .where("entityId")
      .equals("partnerSettings_config")
      .toArray();
    const earlierLogs = allLogs
      .filter(
        (l) =>
          l.id !== log.id &&
          l.action !== "undo" &&
          !l.isUndone &&
          new Date(l.timestamp).getTime() < new Date(log.timestamp).getTime()
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (earlierLogs.length > 0) {
      const prevLog = earlierLogs[0];
      if (prevLog.snapshotAfter?.partners && Array.isArray(prevLog.snapshotAfter.partners)) {
        return prevLog.snapshotAfter.partners;
      }
      const match = (prevLog.details || "").match(/Active partners:\s*(.+)$/i);
      if (match && match[1]) {
        const names = match[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (names.length > 0) {
          let currentPartners: Array<{ id: string; name: string }> = [];
          try {
            const raw = localStorage.getItem("nox_partner_configs");
            if (raw) currentPartners = JSON.parse(raw);
          } catch {}
          return names.map((name, idx) => {
            const matched = currentPartners.find(
              (p) => p.name.toLowerCase() === name.toLowerCase()
            );
            return {
              id: matched?.id || `partner_${idx + 1}`,
              name,
            };
          });
        }
      }
    }
  } catch {}

  // 2. Otherwise inspect current `nox_partner_configs` vs the log's `Active partners: ...`
  try {
    const raw = localStorage.getItem("nox_partner_configs");
    if (raw) {
      const currentPartners: Array<{ id: string; name: string }> = JSON.parse(raw);
      if (Array.isArray(currentPartners) && currentPartners.length > 1) {
        return currentPartners.slice(0, currentPartners.length - 1);
      }
    }
  } catch {}

  return null;
}

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
 * Executes the actual database, localStorage, and Cloud Firestore rollback for a given audit log entry.
 */
async function executeRollbackForLog(
  log: LocalAuditLog,
  performer: { id: string; displayName: string; role: string },
  now: string
): Promise<{ rolledBack: boolean; reason?: string }> {
  const entityType = (log.entityType || "").toLowerCase();

  // ---------------------------------------------------------------------------
  // 1. PARTNERS CONFIGURATION (Add / Rename / Remove Partner in Partners Khata)
  // ---------------------------------------------------------------------------
  if (
    entityType === "partner_settings" ||
    log.entityId === "partnerSettings_config" ||
    ((entityType === "settings" || entityType === "setting") &&
      log.entityId === "partnerSettings_config")
  ) {
    const restoredPartners = await resolvePreviousPartnersForLog(log);
    if (!restoredPartners || restoredPartners.length === 0) {
      return {
        rolledBack: false,
        reason: "Previous partner configuration snapshot is not available to restore.",
      };
    }

    if (typeof window !== "undefined") {
      localStorage.setItem("nox_partner_configs", JSON.stringify(restoredPartners));
      localStorage.setItem("nox_partner_configs_updated_at", now);
      if (restoredPartners[0]) {
        localStorage.setItem("nox_partner_1_name", restoredPartners[0].name);
      }
      if (restoredPartners[1]) {
        localStorage.setItem("nox_partner_2_name", restoredPartners[1].name);
      }
    }

    await cloudUpsertWithFallback("partnerSettings", "config", {
      partners: restoredPartners,
      updatedAt: now,
    });
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 2. PARTNER TRANSACTIONS (Investment, Withdrawal, Profit Distribution, Edit, Delete)
  // ---------------------------------------------------------------------------
  if (entityType === "partner_transaction" || entityType === "transaction") {
    if (log.action === "create") {
      // Subcase A: Distributed profit with snapshotAfter.createdTxs
      if (log.snapshotAfter && Array.isArray(log.snapshotAfter.createdTxs)) {
        const createdIds: string[] = log.snapshotAfter.createdTxs
          .map((t: any) => t?.id)
          .filter(Boolean);
        const unsettledList: PartnerTransaction[] = Array.isArray(
          log.snapshotBefore?.unsettledAdvances
        )
          ? log.snapshotBefore.unsettledAdvances
          : Array.isArray(log.snapshotAfter?.settledAdvances)
          ? log.snapshotAfter.settledAdvances.map((a: any) => ({ ...a, isSettled: false }))
          : [];

        if (createdIds.length > 0) {
          await offlineDb.partnerTransactions.bulkDelete(createdIds);
          for (const id of createdIds) {
            await cloudDeleteWithFallback("partnerTransactions", id);
          }
        }
        if (unsettledList.length > 0) {
          await offlineDb.partnerTransactions.bulkPut(unsettledList);
          for (const adv of unsettledList) {
            await cloudUpsertWithFallback("partnerTransactions", adv.id, adv);
          }
        }
      } else {
        // Subcase B: Single or comma-separated transaction IDs
        const ids = String(log.entityId || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

        for (const id of ids) {
          const existingTx = await offlineDb.partnerTransactions.get(id);
          const targetTx = existingTx || (log.snapshotAfter as PartnerTransaction | undefined);
          if (
            targetTx &&
            targetTx.type === "profit_payout" &&
            Array.isArray(targetTx.settledAdvanceTxIds)
          ) {
            for (const advId of targetTx.settledAdvanceTxIds) {
              const adv = await offlineDb.partnerTransactions.get(advId);
              if (adv && adv.isSettled) {
                const restoredAdv = { ...adv, isSettled: false };
                await offlineDb.partnerTransactions.put(restoredAdv);
                await cloudUpsertWithFallback("partnerTransactions", advId, restoredAdv);
              }
            }
          }
          await offlineDb.partnerTransactions.delete(id);
          await cloudDeleteWithFallback("partnerTransactions", id);
        }
      }
      await syncMirrorKeyFromTable("partnerTransactions", "noxderma_partner_transactions");
      return { rolledBack: true };
    } else if (log.action === "update") {
      if (!log.snapshotBefore) {
        return {
          rolledBack: false,
          reason: "Previous transaction state was not recorded for this edit.",
        };
      }
      const prevTx = log.snapshotBefore as PartnerTransaction;
      await offlineDb.partnerTransactions.put(prevTx);
      await cloudUpsertWithFallback("partnerTransactions", prevTx.id, prevTx);
      await syncMirrorKeyFromTable("partnerTransactions", "noxderma_partner_transactions");
      return { rolledBack: true };
    } else if (log.action === "delete") {
      if (!log.snapshotBefore) {
        return {
          rolledBack: false,
          reason: "Deleted transaction snapshot is not available to restore.",
        };
      }
      const itemsToRestore: PartnerTransaction[] = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];

      await offlineDb.partnerTransactions.bulkPut(itemsToRestore);
      for (const tx of itemsToRestore) {
        await cloudUpsertWithFallback("partnerTransactions", tx.id, tx);
        if (tx.type === "profit_payout" && Array.isArray(tx.settledAdvanceTxIds)) {
          for (const advId of tx.settledAdvanceTxIds) {
            const adv = await offlineDb.partnerTransactions.get(advId);
            if (adv && !adv.isSettled) {
              const settledAdv = { ...adv, isSettled: true };
              await offlineDb.partnerTransactions.put(settledAdv);
              await cloudUpsertWithFallback("partnerTransactions", advId, settledAdv);
            }
          }
        }
      }
      await syncMirrorKeyFromTable("partnerTransactions", "noxderma_partner_transactions");
      return { rolledBack: true };
    }
  }

  // ---------------------------------------------------------------------------
  // 3. INVOICES (Customer Bills)
  // ---------------------------------------------------------------------------
  if (entityType === "invoice") {
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
          const inv =
            (await offlineDb.invoices.get(log.entityId)) || (log.snapshotAfter as Invoice);
          if (inv) {
            for (const line of inv.lines || []) {
              for (const alloc of line.batchAllocations || []) {
                if (alloc.batchId) {
                  const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                  if (batch) {
                    const restoredQty =
                      (Number(batch.remainingQuantity) || 0) + (alloc.quantity || 0);
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

            if (inv.customerId && inv.outstandingBalance > 0) {
              const cust = await offlineDb.customers.get(inv.customerId);
              if (cust) {
                const newBal = Math.max(
                  0,
                  (cust.currentOutstandingBalance || 0) - inv.outstandingBalance
                );
                await offlineDb.customers.update(inv.customerId, {
                  currentOutstandingBalance: newBal,
                  updatedAt: now,
                });
              }
            }

            await offlineDb.invoices.delete(inv.id);
          }
        } else if (log.action === "delete") {
          const invoicesToRestore: Invoice[] = Array.isArray(log.snapshotBefore)
            ? log.snapshotBefore
            : log.snapshotBefore
            ? [log.snapshotBefore as Invoice]
            : [];

          for (const inv of invoicesToRestore) {
            await offlineDb.invoices.put(inv);

            for (const line of inv.lines || []) {
              for (const alloc of line.batchAllocations || []) {
                if (alloc.batchId) {
                  const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                  if (batch) {
                    const newRem = Math.max(
                      0,
                      (Number(batch.remainingQuantity) || 0) - (alloc.quantity || 0)
                    );
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
          const oldInv = log.snapshotBefore as Invoice;
          const currentInv = await offlineDb.invoices.get(log.entityId);

          if (oldInv && currentInv) {
            for (const line of currentInv.lines || []) {
              for (const alloc of line.batchAllocations || []) {
                if (alloc.batchId) {
                  const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                  if (batch) {
                    const restored =
                      (Number(batch.remainingQuantity) || 0) + (alloc.quantity || 0);
                    await offlineDb.inventoryBatches.update(alloc.batchId, {
                      remainingQuantity: restored,
                    });
                  }
                }
              }
            }

            if (currentInv.customerId && currentInv.outstandingBalance > 0) {
              const cust = await offlineDb.customers.get(currentInv.customerId);
              if (cust) {
                const newBal = Math.max(
                  0,
                  (cust.currentOutstandingBalance || 0) - currentInv.outstandingBalance
                );
                await offlineDb.customers.update(currentInv.customerId, {
                  currentOutstandingBalance: newBal,
                });
              }
            }

            for (const line of oldInv.lines || []) {
              for (const alloc of line.batchAllocations || []) {
                if (alloc.batchId) {
                  const batch = await offlineDb.inventoryBatches.get(alloc.batchId);
                  if (batch) {
                    const newRem = Math.max(
                      0,
                      (Number(batch.remainingQuantity) || 0) - (alloc.quantity || 0)
                    );
                    await offlineDb.inventoryBatches.update(alloc.batchId, {
                      remainingQuantity: newRem,
                    });
                  }
                }
              }
            }

            if (oldInv.customerId && oldInv.outstandingBalance > 0) {
              const cust = await offlineDb.customers.get(oldInv.customerId);
              if (cust) {
                const newBal = (cust.currentOutstandingBalance || 0) + oldInv.outstandingBalance;
                await offlineDb.customers.update(oldInv.customerId, {
                  currentOutstandingBalance: newBal,
                });
              }
            }

            await offlineDb.invoices.put(oldInv);
          }
        }
      }
    );
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 4. FIELD VISITS (CRM Visits)
  // ---------------------------------------------------------------------------
  if (entityType === "visit" || entityType === "customervisit") {
    if (log.action === "create") {
      await offlineDb.customerVisits.delete(log.entityId);
      await cloudDeleteWithFallback("customerVisits", log.entityId);
    } else if (log.action === "delete" || log.action === "update") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing visit snapshot to restore." };
      }
      if (Array.isArray(log.snapshotBefore)) {
        await offlineDb.customerVisits.bulkPut(log.snapshotBefore);
      } else {
        await offlineDb.customerVisits.put(log.snapshotBefore);
      }
    }
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 5. CUSTOMERS & DISTRIBUTORS
  // ---------------------------------------------------------------------------
  if (entityType === "customer" || entityType === "distributor") {
    if (log.action === "create") {
      await offlineDb.customers.delete(log.entityId);
      await cloudDeleteWithFallback("customers", log.entityId);
    } else if (log.action === "delete" || log.action === "update") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing customer snapshot to restore." };
      }
      if (Array.isArray(log.snapshotBefore)) {
        await offlineDb.customers.bulkPut(log.snapshotBefore);
      } else {
        await offlineDb.customers.put(log.snapshotBefore);
      }
    }
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 6. PRODUCTS / MEDICINES
  // ---------------------------------------------------------------------------
  if (entityType === "product") {
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
            const snaps = Array.isArray(log.snapshotBefore)
              ? log.snapshotBefore
              : [log.snapshotBefore];
            for (const snap of snaps) {
              if (snap.product && snap.product.id) {
                await offlineDb.products.put(snap.product);
                if (snap.pricing) {
                  await offlineDb.productPricing.put(snap.pricing);
                }
                if (Array.isArray(snap.batches)) {
                  await offlineDb.inventoryBatches
                    .where("productId")
                    .equals(snap.product.id)
                    .delete();
                  if (snap.batches.length > 0) {
                    await offlineDb.inventoryBatches.bulkPut(snap.batches);
                  }
                }
              } else if (snap.id) {
                await offlineDb.products.put(snap);
              }
            }
          }
        }
      }
    );
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 7. CUSTOMER PAYMENTS (with Invoice Allocations Rollback)
  // ---------------------------------------------------------------------------
  if (entityType === "payment") {
    await offlineDb.transaction(
      "rw",
      [offlineDb.payments, offlineDb.customers, offlineDb.invoices],
      async () => {
        if (log.action === "create") {
          const pay =
            (await offlineDb.payments.get(log.entityId)) || (log.snapshotAfter as Payment);
          if (pay) {
            if (pay.customerId && pay.amount > 0) {
              const cust = await offlineDb.customers.get(pay.customerId);
              if (cust) {
                await offlineDb.customers.update(pay.customerId, {
                  currentOutstandingBalance:
                    (cust.currentOutstandingBalance || 0) + pay.amount,
                  updatedAt: now,
                });
              }
            }
            if (Array.isArray(pay.allocations)) {
              for (const alloc of pay.allocations) {
                const allocAmt =
                  Number(alloc.amountAllocated ?? (alloc as any).allocatedAmount) || 0;
                if (alloc.invoiceId && allocAmt > 0) {
                  const inv = await offlineDb.invoices.get(alloc.invoiceId);
                  if (inv) {
                    const nextPaid = Math.max(
                      0,
                      (inv.paidAmount || 0) - allocAmt
                    );
                    const nextOut = (inv.outstandingBalance || 0) + allocAmt;
                    await offlineDb.invoices.update(inv.id, {
                      paidAmount: nextPaid,
                      outstandingBalance: nextOut,
                      paymentStatus: nextPaid <= 0 ? "unpaid" : "partially_paid",
                      updatedAt: now,
                    });
                  }
                }
              }
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
                  currentOutstandingBalance: Math.max(
                    0,
                    (cust.currentOutstandingBalance || 0) - pay.amount
                  ),
                  updatedAt: now,
                });
              }
            }
            if (Array.isArray(pay.allocations)) {
              for (const alloc of pay.allocations) {
                const allocAmt =
                  Number(alloc.amountAllocated ?? (alloc as any).allocatedAmount) || 0;
                if (alloc.invoiceId && allocAmt > 0) {
                  const inv = await offlineDb.invoices.get(alloc.invoiceId);
                  if (inv) {
                    const nextPaid = (inv.paidAmount || 0) + allocAmt;
                    const nextOut = Math.max(
                      0,
                      (inv.outstandingBalance || 0) - allocAmt
                    );
                    await offlineDb.invoices.update(inv.id, {
                      paidAmount: nextPaid,
                      outstandingBalance: nextOut,
                      paymentStatus: nextOut <= 0 ? "paid" : "partially_paid",
                      updatedAt: now,
                    });
                  }
                }
              }
            }
          }
        } else if (log.action === "update") {
          if (log.snapshotBefore) {
            await offlineDb.payments.put(log.snapshotBefore);
          }
        }
      }
    );
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 8. OPERATING EXPENSES (Profit & Loss Module)
  // ---------------------------------------------------------------------------
  if (entityType === "operating_expense" || entityType === "expense") {
    if (log.action === "create") {
      await offlineDb.operatingExpenses.delete(log.entityId);
      await cloudDeleteWithFallback("operatingExpenses", log.entityId);
    } else if (log.action === "delete" || log.action === "update") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing expense snapshot to restore." };
      }
      const list = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await offlineDb.operatingExpenses.bulkPut(list);
      for (const item of list) {
        await cloudUpsertWithFallback("operatingExpenses", item.id, item);
      }
    }
    await syncMirrorKeyFromTable("operatingExpenses", "noxderma_operating_expenses");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 9. STAFF SALARIES & PAYROLL
  // ---------------------------------------------------------------------------
  if (entityType === "salary" || entityType === "staff_salary") {
    if (log.action === "create") {
      const idsToDelete: string[] = Array.isArray(log.snapshotAfter)
        ? log.snapshotAfter.map((s: any) => s?.id).filter(Boolean)
        : String(log.entityId || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      if (idsToDelete.length > 0) {
        await offlineDb.staffSalaries.bulkDelete(idsToDelete);
        for (const id of idsToDelete) {
          await cloudDeleteWithFallback("staffSalaries", id);
        }
      }
    } else if (log.action === "update" || log.action === "delete") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing salary snapshot to restore." };
      }
      const itemsToRestore = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await offlineDb.staffSalaries.bulkPut(itemsToRestore);
      for (const item of itemsToRestore) {
        await cloudUpsertWithFallback("staffSalaries", item.id, item);
      }
    }
    await syncMirrorKeyFromTable("staffSalaries", "noxderma_staff_salaries");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 10. CRM LEADS
  // ---------------------------------------------------------------------------
  if (entityType === "crm_lead" || entityType === "lead") {
    if (log.action === "create") {
      await offlineDb.leads.delete(log.entityId);
      await cloudDeleteWithFallback("leads", log.entityId);
    } else if (log.action === "update" || log.action === "delete") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing lead snapshot to restore." };
      }
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await offlineDb.leads.bulkPut(items);
    }
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 11. EMPLOYEE SALES TARGETS
  // ---------------------------------------------------------------------------
  if (entityType === "employee_target" || entityType === "target") {
    if (log.action === "create") {
      await offlineDb.employeeTargets.delete(log.entityId);
      await cloudDeleteWithFallback("employeeTargets", log.entityId);
    } else if (log.action === "update" || log.action === "delete") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing sales target snapshot to restore." };
      }
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await offlineDb.employeeTargets.bulkPut(items);
      for (const item of items) {
        await cloudUpsertWithFallback("employeeTargets", item.id, item);
      }
    }
    await syncMirrorKeyFromTable("employeeTargets", "noxderma_rep_targets");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 12. PHARMACEUTICAL MANUFACTURERS / SUPPLIERS
  // ---------------------------------------------------------------------------
  if (entityType === "manufacturer") {
    if (log.action === "create") {
      await offlineDb.manufacturers.delete(log.entityId);
      await cloudDeleteWithFallback("manufacturers", log.entityId);
    } else if (log.action === "update" || log.action === "delete") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing manufacturer snapshot to restore." };
      }
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await offlineDb.manufacturers.bulkPut(items);
      for (const item of items) {
        await cloudUpsertWithFallback("manufacturers", item.id, item);
      }
    }
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 13. STAFF USER ACCOUNTS
  // ---------------------------------------------------------------------------
  if (entityType === "user") {
    if (log.action === "create") {
      await (offlineDb as any).users?.delete(log.entityId);
      await cloudDeleteWithFallback("users", log.entityId);
    } else if (log.action === "update" || log.action === "delete") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing user account snapshot to restore." };
      }
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await (offlineDb as any).users?.bulkPut(items);
      for (const item of items) {
        await cloudUpsertWithFallback("users", item.id, item);
      }
    }
    await syncMirrorKeyFromTable("users", "noxderma_users");
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("noxderma-users-updated"));
    }
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 14. PROMOTIONAL COUPONS
  // ---------------------------------------------------------------------------
  if (entityType === "coupon") {
    if (log.action === "create") {
      await offlineDb.coupons.delete(log.entityId);
      await cloudDeleteWithFallback("coupons", log.entityId);
    } else if (log.action === "update" || log.action === "delete") {
      if (!log.snapshotBefore) {
        return { rolledBack: false, reason: "Missing coupon snapshot to restore." };
      }
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await offlineDb.coupons.bulkPut(items);
      for (const item of items) {
        await cloudUpsertWithFallback("coupons", item.id, item);
      }
    }
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 15. PURCHASE ORDERS & GRN STOCK RECEIPTS
  // ---------------------------------------------------------------------------
  if (entityType === "purchase_order" || entityType === "purchase") {
    if (log.action === "create") {
      await (offlineDb as any).purchaseOrders?.delete(log.entityId);
      await cloudDeleteWithFallback("purchaseOrders", log.entityId);
    } else if (log.action === "update") {
      if (log.snapshotBefore?.po) {
        await (offlineDb as any).purchaseOrders?.put(log.snapshotBefore.po);
        if (log.snapshotAfter?.batch?.id) {
          await offlineDb.inventoryBatches.delete(log.snapshotAfter.batch.id);
        }
        if (log.snapshotAfter?.movementId) {
          await offlineDb.stockMovements.delete(log.snapshotAfter.movementId);
        }
      } else if (log.snapshotBefore) {
        await (offlineDb as any).purchaseOrders?.put(log.snapshotBefore);
      }
    } else if (log.action === "delete" && log.snapshotBefore) {
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await (offlineDb as any).purchaseOrders?.bulkPut(items);
    }
    await syncMirrorKeyFromTable("purchaseOrders", "noxderma_purchase_orders");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 16. SALES BOOKINGS (Field Staff Orders)
  // ---------------------------------------------------------------------------
  if (entityType === "sales_booking" || entityType === "booking") {
    if (log.action === "create") {
      await (offlineDb as any).salesBookings?.delete(log.entityId);
      await cloudDeleteWithFallback("salesBookings", log.entityId);
    } else if ((log.action === "update" || log.action === "delete") && log.snapshotBefore) {
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await (offlineDb as any).salesBookings?.bulkPut(items);
    }
    await syncMirrorKeyFromTable("salesBookings", "noxderma_sales_bookings");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 17. ONLINE COURIER ORDERS
  // ---------------------------------------------------------------------------
  if (entityType === "online_order") {
    if (log.action === "create") {
      await (offlineDb as any).onlineOrders?.delete(log.entityId);
      await cloudDeleteWithFallback("onlineOrders", log.entityId);
    } else if ((log.action === "update" || log.action === "delete") && log.snapshotBefore) {
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await (offlineDb as any).onlineOrders?.bulkPut(items);
    }
    await syncMirrorKeyFromTable("onlineOrders", "noxderma_online_orders");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 18. CUSTOMER SALES RETURNS
  // ---------------------------------------------------------------------------
  if (entityType === "sales_return") {
    if (log.action === "create") {
      await (offlineDb as any).salesReturns?.delete(log.entityId);
      await cloudDeleteWithFallback("salesReturns", log.entityId);
      if (log.snapshotAfter?.movementId) {
        await offlineDb.stockMovements.delete(log.snapshotAfter.movementId);
        await cloudDeleteWithFallback("stockMovements", log.snapshotAfter.movementId);
      }
      if (log.snapshotAfter?.extraMovementId) {
        await offlineDb.stockMovements.delete(log.snapshotAfter.extraMovementId);
        await cloudDeleteWithFallback("stockMovements", log.snapshotAfter.extraMovementId);
      }
      if (log.snapshotBefore?.batch) {
        await offlineDb.inventoryBatches.put(log.snapshotBefore.batch);
        await cloudUpsertWithFallback("inventoryBatches", log.snapshotBefore.batch.id, log.snapshotBefore.batch);
      } else if (log.snapshotAfter?.createdBatchId) {
        await offlineDb.inventoryBatches.delete(log.snapshotAfter.createdBatchId);
        await cloudDeleteWithFallback("inventoryBatches", log.snapshotAfter.createdBatchId);
      }
      if (log.snapshotBefore?.replacementBatch) {
        await offlineDb.inventoryBatches.put(log.snapshotBefore.replacementBatch);
        await cloudUpsertWithFallback(
          "inventoryBatches",
          log.snapshotBefore.replacementBatch.id,
          log.snapshotBefore.replacementBatch
        );
      }
      if (
        log.snapshotBefore?.customerId &&
        typeof log.snapshotBefore?.prevBalance === "number"
      ) {
        await offlineDb.customers.update(log.snapshotBefore.customerId, {
          currentOutstandingBalance: log.snapshotBefore.prevBalance,
          updatedAt: now,
        });
      }
    } else if ((log.action === "update" || log.action === "delete") && log.snapshotBefore) {
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await (offlineDb as any).salesReturns?.bulkPut(items);
    }
    await syncMirrorKeyFromTable("salesReturns", "noxderma_sales_returns");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 19. MARKETING CAMPAIGNS
  // ---------------------------------------------------------------------------
  if (entityType === "marketing_campaign") {
    if (log.action === "create") {
      await (offlineDb as any).marketingCampaigns?.delete(log.entityId);
      await cloudDeleteWithFallback("marketingCampaigns", log.entityId);
    } else if ((log.action === "update" || log.action === "delete") && log.snapshotBefore) {
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await (offlineDb as any).marketingCampaigns?.bulkPut(items);
    }
    await syncMirrorKeyFromTable("marketingCampaigns", "noxderma_marketing_campaigns");
    return { rolledBack: true };
  }

  // ---------------------------------------------------------------------------
  // 20. INVENTORY BATCHES, STOCK MOVEMENTS, MANUFACTURER LEDGER, CATEGORIES & SETTINGS
  // ---------------------------------------------------------------------------
  if (entityType === "stock_movement") {
    if (log.action === "create") {
      await offlineDb.stockMovements.delete(log.entityId);
      await cloudDeleteWithFallback("stockMovements", log.entityId);
      if (log.snapshotBefore?.batch) {
        await offlineDb.inventoryBatches.put(log.snapshotBefore.batch);
        await cloudUpsertWithFallback("inventoryBatches", log.snapshotBefore.batch.id, log.snapshotBefore.batch);
      }
    } else if (log.snapshotBefore) {
      await offlineDb.stockMovements.put(log.snapshotBefore);
    }
    return { rolledBack: true };
  }

  if (entityType === "manufacturer_ledger") {
    if (log.action === "create") {
      await (offlineDb as any).manufacturerLedger?.delete(log.entityId);
      await cloudDeleteWithFallback("manufacturerLedger", log.entityId);
      if (log.snapshotBefore?.manufacturer) {
        await offlineDb.manufacturers.put(log.snapshotBefore.manufacturer);
        await cloudUpsertWithFallback("manufacturers", log.snapshotBefore.manufacturer.id, log.snapshotBefore.manufacturer);
      }
    } else if (log.snapshotBefore) {
      const items = Array.isArray(log.snapshotBefore)
        ? log.snapshotBefore
        : [log.snapshotBefore];
      await (offlineDb as any).manufacturerLedger?.bulkPut(items);
    }
    await syncMirrorKeyFromTable("manufacturerLedger", "noxderma_mfr_ledger");
    return { rolledBack: true };
  }

  if (entityType === "inventory_batch") {
    if (log.action === "create") {
      await offlineDb.inventoryBatches.delete(log.entityId);
    } else if (log.snapshotBefore) {
      const batchToRestore = log.snapshotBefore?.batch || log.snapshotBefore;
      const items = Array.isArray(batchToRestore)
        ? batchToRestore
        : [batchToRestore];
      await offlineDb.inventoryBatches.bulkPut(items);
      if (log.snapshotBefore?.manufacturer) {
        await offlineDb.manufacturers.put(log.snapshotBefore.manufacturer);
        await cloudUpsertWithFallback(
          "manufacturers",
          log.snapshotBefore.manufacturer.id,
          log.snapshotBefore.manufacturer
        );
      }
      if (log.snapshotAfter?.movementId) {
        await offlineDb.stockMovements.delete(log.snapshotAfter.movementId);
        await cloudDeleteWithFallback("stockMovements", log.snapshotAfter.movementId);
      }
      if (log.snapshotAfter?.replacementMovementId) {
        await offlineDb.stockMovements.delete(log.snapshotAfter.replacementMovementId);
        await cloudDeleteWithFallback("stockMovements", log.snapshotAfter.replacementMovementId);
      }
      if (log.snapshotAfter?.replacementBatchId) {
        await offlineDb.inventoryBatches.delete(log.snapshotAfter.replacementBatchId);
        await cloudDeleteWithFallback("inventoryBatches", log.snapshotAfter.replacementBatchId);
      }
      if (log.snapshotAfter?.ledgerEntryId) {
        await (offlineDb as any).manufacturerLedger?.delete(log.snapshotAfter.ledgerEntryId);
        await cloudDeleteWithFallback("manufacturerLedger", log.snapshotAfter.ledgerEntryId);
        await syncMirrorKeyFromTable("manufacturerLedger", "noxderma_mfr_ledger");
      }
    }
    return { rolledBack: true };
  }

  if (entityType === "category") {
    if (log.action === "create") {
      await offlineDb.categories.delete(log.entityId);
    } else if (log.snapshotBefore) {
      await offlineDb.categories.put(log.snapshotBefore);
    }
    return { rolledBack: true };
  }

  if (entityType === "setting" || entityType === "settings") {
    if (!log.snapshotBefore) {
      return { rolledBack: false, reason: "Missing settings snapshot to restore." };
    }
    await offlineDb.settings.put(log.snapshotBefore);
    if (typeof window !== "undefined") {
      localStorage.setItem("noxderma_business_settings", JSON.stringify([log.snapshotBefore]));
      window.dispatchEvent(
        new CustomEvent("noxderma_settings_updated", { detail: log.snapshotBefore })
      );
    }
    await cloudUpsertWithFallback("settings", "primary", log.snapshotBefore);
    return { rolledBack: true };
  }

  return {
    rolledBack: false,
    reason: `Unsupported entity type "${log.entityType}" for automatic undo.`,
  };
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

    if (!log.canUndo && !log.snapshotBefore && !log.snapshotAfter) {
      return { success: false, message: "This action cannot be undone." };
    }

    const now = new Date().toISOString();

    // 1. Execute actual rollback across IndexedDB, localStorage mirrors, and Cloud Firestore
    const rollbackResult = await executeRollbackForLog(log, performer, now);
    if (!rollbackResult.rolledBack) {
      return {
        success: false,
        message: rollbackResult.reason || "Could not undo this action.",
      };
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

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("noxderma-cloud-synced"));
    }

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
 * Self-healing reconciliation for audit logs that were previously marked `isUndone: true`
 * when `undoActivity` lacked a handler for their entityType (e.g., Partners Khata config/transactions,
 * salaries, expenses, leads, targets, manufacturers, users, coupons), OR logs that had `canUndo: false`
 * despite having a valid `snapshotBefore` (such as bulk deletes or partner transaction deletes).
 */
export async function reconcileAndRepairAuditLogs(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const allLogs = await offlineDb.auditLogs.toArray();
    let anyChanged = false;
    const now = new Date().toISOString();

    for (const log of allLogs) {
      if (log.action === "undo") continue;

      // 1. Upgrade legacy delete/update logs that have snapshotBefore or partnerSettings_config to canUndo: true
      if (
        !log.canUndo &&
        !log.isUndone &&
        (Boolean(log.snapshotBefore) ||
          Boolean(log.snapshotAfter) ||
          log.entityId === "partnerSettings_config")
      ) {
        await offlineDb.auditLogs.update(log.id, { canUndo: true });
        anyChanged = true;
      }

      // 2. Check if a previously "undone" log for Partners Khata or other modules never actually rolled back!
      if (log.isUndone && !(log as any).repairedRealUndo) {
        const et = (log.entityType || "").toLowerCase();

        if (et === "transaction" || et === "partner_transaction") {
          if (log.action === "create") {
            const ids = String(log.entityId || "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            let stillExists = false;
            for (const id of ids) {
              const found = await offlineDb.partnerTransactions.get(id);
              if (found) {
                stillExists = true;
                break;
              }
            }
            if (stillExists) {
              await executeRollbackForLog(
                log,
                { id: "usr_admin", displayName: log.undoneBy || "Owner", role: "owner" },
                now
              );
              anyChanged = true;
            }
          } else if (log.action === "update" && !log.snapshotBefore) {
            // Legacy edit without snapshotBefore couldn't be undone; reset isUndone so it doesn't show fake UNDONE
            await offlineDb.auditLogs.update(log.id, {
              isUndone: false,
              canUndo: false,
              undoneAt: undefined,
              undoneBy: undefined,
              undoneDetails: undefined,
            });
            anyChanged = true;
            continue;
          }
        } else if (
          et === "partner_settings" ||
          log.entityId === "partnerSettings_config"
        ) {
          // Check if there is any newer non-undone partnerSettings_config log after this one
          const newerConfigLog = allLogs.some(
            (other) =>
              other.id !== log.id &&
              other.action !== "undo" &&
              !other.isUndone &&
              other.entityId === "partnerSettings_config" &&
              new Date(other.timestamp).getTime() > new Date(log.timestamp).getTime()
          );
          if (!newerConfigLog) {
            const match = (log.details || "").match(/Active partners:\s*(.+)$/i);
            const rawCurrent = localStorage.getItem("nox_partner_configs");
            if (match && match[1] && rawCurrent) {
              try {
                const currentPartners: Array<{ id: string; name: string }> =
                  JSON.parse(rawCurrent);
                const currentNames = currentPartners.map((p) => p.name).join(", ");
                if (currentNames.toLowerCase() === match[1].trim().toLowerCase()) {
                  // The undone partner config is STILL active in localStorage! Execute real rollback now:
                  await executeRollbackForLog(
                    log,
                    { id: "usr_admin", displayName: log.undoneBy || "Owner", role: "owner" },
                    now
                  );
                  anyChanged = true;
                }
              } catch {}
            }
          }
        } else if (
          log.action === "create" &&
          ["salary", "operating_expense", "crm_lead", "employee_target", "manufacturer", "user", "coupon"].includes(et)
        ) {
          await executeRollbackForLog(
            log,
            { id: "usr_admin", displayName: log.undoneBy || "Owner", role: "owner" },
            now
          );
          anyChanged = true;
        }

        await offlineDb.auditLogs.update(log.id, { repairedRealUndo: true } as any);
      }
    }

    if (anyChanged && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("noxderma-cloud-synced"));
    }
  } catch (err) {
    console.warn("[AuditUndo] reconcileAndRepairAuditLogs warning:", err);
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

    // Direct Firestore collection purge to guarantee remote clean state across all sessions
    try {
      const { collection, getDocs, deleteDoc } = await import("firebase/firestore");
      const { db: firestoreDb } = await import("@/lib/firebase/config");
      const snap = await getDocs(collection(firestoreDb, "auditLogs"));
      await Promise.allSettled(snap.docs.map((d) => deleteDoc(d.ref)));
    } catch (remoteErr) {
      console.warn("Direct Firestore clear-all warning:", remoteErr);
    }

    await offlineDb.auditLogs.clear();

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
