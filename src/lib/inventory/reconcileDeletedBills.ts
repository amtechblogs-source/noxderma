import { offlineDb } from "@/lib/offline/db";
import type { Invoice, StockMovement } from "@/types";

/**
 * Reconciles deleted customer bills from auditLogs with stockMovements and inventoryBatches.
 * Ensures that any bill deleted earlier (even if its batchId was a synthetic "bch_gen_..." ID)
 * has a visible "+ Stock Restored (Bill Deleted)" entry in Stock In & Out History
 * and an active batch record in Current Medicine Stock & Alerts.
 */
export async function reconcileDeletedBillsStockMovements(): Promise<void> {
  try {
    const [logs, movements, batches, activeInvoices] = await Promise.all([
      offlineDb.auditLogs.toArray(),
      offlineDb.stockMovements.toArray(),
      offlineDb.inventoryBatches.toArray(),
      offlineDb.invoices.toArray(),
    ]);

    const activeInvoiceIds = new Set(activeInvoices.map((i) => i.id));
    const batchMap = new Map(batches.map((b) => [b.id, b]));

    // 1. Clean up raw internal invoice IDs ("inv_1794..._INV-2026...") on existing movements
    for (const m of movements) {
      if (m.referenceId && m.referenceId.startsWith("inv_")) {
        const parts = m.referenceId.split("_");
        const invPart = parts.find((p) => p.startsWith("INV-"));
        const reasonMatch = m.reason?.match(/(INV-[A-Z0-9-]+)/i);
        const cleanRef = invPart || reasonMatch?.[1];
        if (cleanRef && cleanRef !== m.referenceId) {
          await offlineDb.stockMovements.update(m.id, {
            referenceId: cleanRef,
          });
          m.referenceId = cleanRef;
        }
      }
    }

    // 2. Backfill missing restoration movements for any deleted invoice in auditLogs
    const deletedInvoiceLogs = logs.filter(
      (l) =>
        (l.entityType || "").toLowerCase() === "invoice" &&
        (l.action === "delete" || (l.action === "create" && l.isUndone)) &&
        (l.snapshotBefore || l.snapshotAfter)
    );

    for (const log of deletedInvoiceLogs) {
      const rawSnap = log.action === "delete" ? log.snapshotBefore : log.snapshotAfter;
      const snapInvoices: Invoice[] = Array.isArray(rawSnap)
        ? rawSnap
        : rawSnap && typeof rawSnap === "object" && Array.isArray(rawSnap.lines)
        ? [rawSnap as Invoice]
        : [];

      for (const inv of snapInvoices) {
        if (!inv || !inv.id || activeInvoiceIds.has(inv.id)) continue;

        const billRef = inv.officialReference || inv.provisionalReference || inv.id;
        const eventTimestamp = log.undoneAt || log.timestamp || inv.updatedAt || inv.createdAt;

        for (const line of inv.lines || []) {
          if (!line || !line.productId) continue;

          const restoreQty =
            Number(line.totalUnitsDelivered) ||
            Number(line.quantity || 0) + Number(line.bonusQuantity || 0) ||
            (Array.isArray(line.batchAllocations)
              ? line.batchAllocations.reduce((s, a) => s + (Number(a.quantity) || 0), 0)
              : 0) ||
            1;

          const existingRestoration = movements.find(
            (m) =>
              m.productId === line.productId &&
              m.quantityChange > 0 &&
              (m.type === "sales_return" || m.type === "reconciliation_adjustment") &&
              (m.referenceId === inv.id ||
                m.referenceId === billRef ||
                m.id.includes(inv.id) ||
                (m.reason && (m.reason.includes(billRef) || m.reason.includes(inv.id))))
          );

          if (existingRestoration) {
            // Upgrade reason/referenceId if needed so UI is crystal clear
            const cleanReason = `Bill Deleted — Stock Restored (${billRef} • ${
              inv.customerName || "Customer"
            })`;
            if (
              existingRestoration.referenceId !== billRef ||
              !existingRestoration.reason?.includes("Stock Restored")
            ) {
              await offlineDb.stockMovements.update(existingRestoration.id, {
                referenceId: billRef,
                reason: cleanReason,
              });
            }
            continue;
          }

          // No restoration movement existed for this deleted bill line!
          const firstAlloc = line.batchAllocations?.[0];
          const allocBatchId = firstAlloc?.batchId || (line as any).batchId;
          const allocBatchNum = firstAlloc?.batchNumber || (line as any).batchNumber || "GEN-STOCK";

          let targetBatch = allocBatchId ? batchMap.get(allocBatchId) : undefined;
          if (!targetBatch) {
            targetBatch = Array.from(batchMap.values()).find(
              (b) => b.productId === line.productId
            );
          }

          let finalBatchId = targetBatch?.id || allocBatchId || `bch_rest_${line.productId}`;
          let finalBatchNum = targetBatch?.batchNumber || allocBatchNum || "RESTORED";
          let balanceAfter = targetBatch ? Number(targetBatch.remainingQuantity) || 0 : restoreQty;

          // If this medicine had no batch record at all (because it used synthetic bch_gen_...), create one
          if (!targetBatch) {
            const newBatch = {
              id: finalBatchId,
              productId: line.productId,
              productName: line.productName,
              batchNumber: finalBatchNum,
              manufacturerId: "mfr_primary",
              manufacturingDate: eventTimestamp.slice(0, 10),
              expiryDate:
                firstAlloc?.expiryDate ||
                new Date(Date.now() + 2 * 365 * 86400000).toISOString().slice(0, 10),
              receivedQuantity: restoreQty,
              remainingQuantity: restoreQty,
              blockedQuantity: 0,
              status: "active" as const,
              createdAt: eventTimestamp,
              updatedAt: eventTimestamp,
            };
            await offlineDb.inventoryBatches.put(newBatch);
            batchMap.set(finalBatchId, newBatch);
            balanceAfter = restoreQty;
          }

          const newMovement: StockMovement = {
            id: `mov_del_${inv.id}_${line.productId}`,
            productId: line.productId,
            productName: line.productName,
            batchId: finalBatchId,
            batchNumber: finalBatchNum,
            type: "sales_return",
            quantityChange: restoreQty,
            balanceAfter,
            referenceId: billRef,
            referenceType: "invoice",
            userId: log.userId || "usr_admin",
            userName: log.userName || "Owner",
            reason: `Bill Deleted — Stock Restored (${billRef} • ${inv.customerName || "Customer"})`,
            timestamp: eventTimestamp,
          };

          await offlineDb.stockMovements.put(newMovement);
          movements.push(newMovement);
        }
      }
    }
  } catch (err) {
    console.warn("Could not reconcile deleted bills stock movements:", err);
  }
}
