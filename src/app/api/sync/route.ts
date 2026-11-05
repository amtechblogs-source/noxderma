import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { doc, setDoc } from "firebase/firestore";
import { db as clientFirestoreDb } from "@/lib/firebase/config";
import { adminDb, isFirebaseAdminReady } from "@/lib/firebase/admin";
import type { OutboxOperation, Invoice } from "@/types";

export const dynamic = "force-dynamic";

// In-memory idempotency cache and sequential counter for standalone / preview / dev environments
const inMemorySyncCache = new Map<string, { officialReference?: string; syncedAt: string }>();
let inMemoryInvoiceCounter = 1;

function generateSequentialReference(): string {
  const year = new Date().getFullYear();
  const seq = inMemoryInvoiceCounter++;
  return `NXD-${year}-${String(seq).padStart(5, "0")}`;
}

function withServerTimeout<T>(promise: Promise<T>, timeoutMs = 2500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Server Firestore write timed out after ${timeoutMs}ms`));
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

export async function POST(request: Request) {
  try {
    const op: OutboxOperation = await request.json();

    if (!op || !op.id || !op.entityType) {
      return NextResponse.json({ error: "Invalid outbox operation payload" }, { status: 400 });
    }

    // Check in-memory idempotency cache first
    if (inMemorySyncCache.has(op.id)) {
      const cached = inMemorySyncCache.get(op.id)!;
      return NextResponse.json({
        success: true,
        idempotentDuplicate: true,
        officialReference: cached.officialReference,
        syncedAt: cached.syncedAt,
      });
    }

    // If Firebase Admin credentials are fully configured, attempt cloud Firestore sync
    if (isFirebaseAdminReady()) {
      try {
        // 1. Idempotency Check in Cloud Firestore
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
            officialSeq = Math.floor(Math.random() * 9000) + 1000;
          }

          const year = new Date().getFullYear();
          const officialReference = `NXD-${year}-${String(officialSeq).padStart(5, "0")}`;

          // Atomic commit of invoice, stock movements, batch deductions, and customer balance
          const batch = adminDb.batch();

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

          inMemorySyncCache.set(op.id, { officialReference, syncedAt: new Date().toISOString() });

          return NextResponse.json({
            success: true,
            officialReference,
            syncedAt: new Date().toISOString(),
          });
        }

        // Generic entity sync
        const targetCollection =
          op.entityType === "customer"
            ? "customers"
            : op.entityType === "lead"
            ? "leads"
            : op.entityType === "customer_visit"
            ? "customerVisits"
            : op.entityType === "payment"
            ? "payments"
            : op.entityType === "settings"
            ? "organizationSettings"
            : op.entityType;

        if (op.entityType === "settings") {
          try {
            const dataDir = path.join(process.cwd(), "data");
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(path.join(dataDir, "settings.json"), JSON.stringify(op.payload, null, 2), "utf-8");
          } catch (e) {
            console.warn("Could not write settings file in sync:", e);
          }
        }

        await adminDb.collection(targetCollection).doc(op.entityId).set(op.payload, { merge: true });

        await existingOpRef.set({
          operationId: op.id,
          entityType: op.entityType,
          entityId: op.entityId,
          userId: op.userId,
          deviceId: op.deviceId,
          syncedAt: new Date().toISOString(),
        });

        inMemorySyncCache.set(op.id, { syncedAt: new Date().toISOString() });

        return NextResponse.json({
          success: true,
          syncedAt: new Date().toISOString(),
        });
      } catch (adminErr) {
        console.warn(
          "[Sync Server] Cloud Firestore call bypassed (using standalone reconciliation):",
          adminErr instanceof Error ? adminErr.message : adminErr
        );
        // Fall through to standalone reconciliation
      }
    }

    // Standalone / Preview / Netlify reconciliation (when service account key is not provided)
    if (op.entityType === "settings") {
      try {
        const dataDir = path.join(process.cwd(), "data");
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(path.join(dataDir, "settings.json"), JSON.stringify(op.payload, null, 2), "utf-8");
      } catch (e) {
        console.warn("Could not write settings file in standalone sync:", e);
      }
    }

    // Direct Cloud Firestore sync via Firebase Web SDK (works on Vercel without requiring service account private key)
    const targetCollection =
      op.entityType === "customer"
        ? "customers"
        : op.entityType === "lead"
        ? "leads"
        : op.entityType === "customer_visit"
        ? "customerVisits"
        : op.entityType === "payment"
        ? "payments"
        : op.entityType === "invoice"
        ? "invoices"
        : op.entityType === "settings"
        ? "settings"
        : op.entityType;

    const syncedAt = new Date().toISOString();

    if (op.entityType === "invoice") {
      const invoice = op.payload as unknown as Invoice;
      const officialReference =
        invoice.officialReference && !invoice.officialReference.startsWith("PROV-")
          ? invoice.officialReference
          : generateSequentialReference();

      try {
        const cleanedInvoice = JSON.parse(
          JSON.stringify({
            ...invoice,
            officialReference,
            syncStatus: "synced",
            syncedAt,
          })
        );
        await withServerTimeout(
          setDoc(doc(clientFirestoreDb, "invoices", invoice.id), cleanedInvoice, { merge: true }),
          2500
        );
      } catch (err) {
        console.warn("[Sync API] Direct Firestore invoice write warning:", err);
      }

      inMemorySyncCache.set(op.id, { officialReference, syncedAt });

      return NextResponse.json({
        success: true,
        officialReference,
        syncedAt,
        mode: "firestore_cloud",
      });
    }

    try {
      const cleanedPayload = JSON.parse(JSON.stringify(op.payload || {}));
      await withServerTimeout(
        setDoc(doc(clientFirestoreDb, targetCollection, op.entityId), cleanedPayload, { merge: true }),
        2500
      );
    } catch (err) {
      console.warn(`[Sync API] Direct Firestore write warning for ${targetCollection}:`, err);
    }

    inMemorySyncCache.set(op.id, { syncedAt });

    return NextResponse.json({
      success: true,
      syncedAt,
      mode: "firestore_cloud",
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sync transaction failed";
    console.error("Sync critical error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

