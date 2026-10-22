import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import type { OutboxOperation, Invoice } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const op: OutboxOperation = await request.json();

    if (!op || !op.id || !op.entityType) {
      return NextResponse.json({ error: "Invalid outbox operation payload" }, { status: 400 });
    }

    // 1. Idempotency Check: prevent duplicate processing on retries
    const existingOpRef = adminDb.collection("syncOperations").doc(op.id);
    const existingSnap = await existingOpRef.get();

    if (existingSnap.exists) {
      const data = existingSnap.data();
      return NextResponse.json({
        success: true,
        idempotentDuplicate: true,
        officialReference: data?.officialReference,
        syncedAt: data?.syncedAt,
      });
    }

    // 2. Entity-specific synchronized processing
    if (op.entityType === "invoice") {
      const invoice = op.payload as unknown as Invoice;
      const invoiceRef = adminDb.collection("invoices").doc(invoice.id);

      // Check stock availability across allocated batches
      for (const line of invoice.lines || []) {
        for (const alloc of line.batchAllocations || []) {
          if (alloc.batchId) {
            const batchDoc = await adminDb.collection("inventoryBatches").doc(alloc.batchId).get();
            if (batchDoc.exists) {
              const batchData = batchDoc.data();
              const remaining = batchData?.remainingQuantity ?? 0;
              if (remaining < alloc.quantity) {
                // Stock conflict: another device sold this batch first
                return NextResponse.json(
                  {
                    reason: "STOCK_EXHAUSTED",
                    message: `Conflict: Batch ${alloc.batchNumber} has only ${remaining} units remaining, but invoice requested ${alloc.quantity}.`,
                    serverState: { remainingQuantity: remaining },
                  },
                  { status: 409 }
                );
              }
            }
          }
        }
      }

      // Generate authoritative official sequential reference
      const counterRef = adminDb.collection("organizationSettings").doc("invoiceCounter");
      let officialSeq = 1;
      try {
        await adminDb.runTransaction(async (t) => {
          const cSnap = await t.get(counterRef);
          if (cSnap.exists) {
            officialSeq = (cSnap.data()?.lastNumber || 0) + 1;
            t.update(counterRef, { lastNumber: officialSeq });
          } else {
            t.set(counterRef, { lastNumber: 1 });
          }
        });
      } catch {
        // Fallback sequence if counter doc uninitialized
        officialSeq = Math.floor(Math.random() * 9000) + 1000;
      }

      const year = new Date().getFullYear();
      const officialReference = `NXD-${year}-${String(officialSeq).padStart(5, "0")}`;

      // Atomic commit of invoice, stock movements, batch deductions, and customer balance
      const batch = adminDb.batch();

      // Set official invoice
      batch.set(
        invoiceRef,
        {
          ...invoice,
          officialReference,
          syncStatus: "synced",
          syncedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // Deduct batches and record stock movements
      for (const line of invoice.lines || []) {
        for (const alloc of line.batchAllocations || []) {
          if (alloc.batchId) {
            const bRef = adminDb.collection("inventoryBatches").doc(alloc.batchId);
            const bSnap = await bRef.get();
            if (bSnap.exists) {
              const currentRem = bSnap.data()?.remainingQuantity || 0;
              batch.update(bRef, {
                remainingQuantity: Math.max(0, currentRem - alloc.quantity),
                updatedAt: new Date().toISOString(),
              });
            }

            // Create movement record
            const movRef = adminDb.collection("stockMovements").doc();
            batch.set(movRef, {
              id: movRef.id,
              productId: line.productId,
              productName: line.productName,
              batchId: alloc.batchId,
              batchNumber: alloc.batchNumber,
              type: "sales_deduction",
              quantityChange: -alloc.quantity,
              referenceId: invoice.id,
              referenceType: "invoice",
              userId: op.userId,
              userName: op.userName,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      // Record customer receivable if balance > 0
      if (invoice.outstandingBalance > 0 && invoice.customerId) {
        const custRef = adminDb.collection("customers").doc(invoice.customerId);
        const custSnap = await custRef.get();
        if (custSnap.exists) {
          const currentBal = custSnap.data()?.currentOutstandingBalance || 0;
          batch.update(custRef, {
            currentOutstandingBalance: currentBal + invoice.outstandingBalance,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // Record idempotent sync operation
      batch.set(existingOpRef, {
        operationId: op.id,
        entityType: op.entityType,
        entityId: op.entityId,
        officialReference,
        userId: op.userId,
        deviceId: op.deviceId,
        syncedAt: new Date().toISOString(),
      });

      await batch.commit();

      return NextResponse.json({
        success: true,
        officialReference,
        syncedAt: new Date().toISOString(),
      });
    }

    // Generic entity sync (Customer, Lead, Visit, Payment)
    const targetCollection =
      op.entityType === "customer"
        ? "customers"
        : op.entityType === "lead"
        ? "leads"
        : op.entityType === "customer_visit"
        ? "customerVisits"
        : op.entityType === "payment"
        ? "payments"
        : op.entityType;

    await adminDb.collection(targetCollection).doc(op.entityId).set(op.payload, { merge: true });

    // Mark op as synced
    await existingOpRef.set({
      operationId: op.id,
      entityType: op.entityType,
      entityId: op.entityId,
      userId: op.userId,
      deviceId: op.deviceId,
      syncedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sync transaction failed";
    console.error("Sync error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
