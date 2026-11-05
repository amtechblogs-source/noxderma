import { offlineDb } from "./db";
import { getDeviceId, generateIdempotencyKey } from "./device";
import type { OutboxOperation, OutboxEntityType, OutboxActionType, SyncConflict } from "@/types";

type OutboxEnqueueListener = () => void;
const enqueueListeners: OutboxEnqueueListener[] = [];

export function onOutboxEnqueued(listener: OutboxEnqueueListener): () => void {
  enqueueListeners.push(listener);
  return () => {
    const idx = enqueueListeners.indexOf(listener);
    if (idx !== -1) enqueueListeners.splice(idx, 1);
  };
}

export async function enqueueOperation(
  entityType: OutboxEntityType,
  entityId: string,
  action: OutboxActionType,
  payload: Record<string, unknown>,
  userId: string,
  userName: string,
  dependencies?: string[]
): Promise<OutboxOperation> {
  const opId = generateIdempotencyKey(`op_${entityType}`);
  const deviceId = getDeviceId();

  const operation: OutboxOperation = {
    id: opId,
    entityId,
    entityType,
    action,
    payload,
    deviceId,
    userId,
    userName,
    timestamp: new Date().toISOString(),
    status: "pending",
    retryCount: 0,
    dependencies,
  };

  await offlineDb.outboxQueue.add(operation);

  // Trigger immediate background sync
  for (const listener of enqueueListeners) {
    try {
      listener();
    } catch (err) {
      console.warn("Failed to notify outbox listener:", err);
    }
  }

  return operation;
}

export async function getPendingOperations(): Promise<OutboxOperation[]> {
  const ops = await offlineDb.outboxQueue
    .where("status")
    .anyOf(["pending", "failed", "processing"])
    .sortBy("timestamp");
  return ops.filter((op) => (op.retryCount || 0) < 10);
}

export async function getPendingOutboxCount(): Promise<number> {
  const ops = await offlineDb.outboxQueue
    .where("status")
    .anyOf(["pending", "processing", "failed"])
    .toArray();
  return ops.filter((op) => op.status !== "failed" || (op.retryCount || 0) < 5).length;
}

export async function markOperationProcessing(opId: string): Promise<void> {
  await offlineDb.outboxQueue.update(opId, { status: "processing" });
}

export async function markOperationSynced(
  opId: string,
  serverAssignedData?: Record<string, unknown>
): Promise<void> {
  const op = await offlineDb.outboxQueue.get(opId);
  if (!op) return;

  await offlineDb.transaction(
    "rw",
    [offlineDb.outboxQueue, offlineDb.invoices, offlineDb.payments],
    async () => {
      await offlineDb.outboxQueue.update(opId, { status: "synced", lastError: undefined });

      // If it was an invoice, update syncStatus to 'synced' and link official server reference
      if (op.entityType === "invoice" && op.entityId) {
        const invoice = await offlineDb.invoices.get(op.entityId);
        if (invoice) {
          await offlineDb.invoices.update(op.entityId, {
            syncStatus: "synced",
            officialReference:
              (serverAssignedData?.officialReference as string) ||
              invoice.officialReference ||
              invoice.provisionalReference,
            updatedAt: new Date().toISOString(),
          });
        }
      } else if (op.entityType === "payment" && op.entityId) {
        const payment = await offlineDb.payments.get(op.entityId);
        if (payment) {
          await offlineDb.payments.update(op.entityId, {
            syncStatus: "synced",
          });
        }
      }
    }
  );
}

export async function markOperationConflict(
  opId: string,
  conflictReason: SyncConflict["reason"],
  conflictMessage: string,
  serverState?: Record<string, unknown>
): Promise<void> {
  const op = await offlineDb.outboxQueue.get(opId);
  if (!op) return;

  const conflictRecord: SyncConflict = {
    id: `conf_${Date.now()}_${opId}`,
    operationId: opId,
    entityType: op.entityType,
    entityId: op.entityId,
    reason: conflictReason,
    conflictMessage,
    localPayload: op.payload,
    serverState,
    resolutionStatus: "pending_admin_review",
    createdAt: new Date().toISOString(),
  };

  await offlineDb.transaction("rw", [offlineDb.outboxQueue, offlineDb.syncConflicts], async () => {
    await offlineDb.outboxQueue.update(opId, {
      status: "conflict",
      lastError: conflictMessage,
    });
    await offlineDb.syncConflicts.add(conflictRecord);
  });
}

export async function markOperationFailed(opId: string, errorMessage: string): Promise<void> {
  const op = await offlineDb.outboxQueue.get(opId);
  if (!op) return;

  await offlineDb.outboxQueue.update(opId, {
    status: "failed",
    retryCount: (op.retryCount || 0) + 1,
    lastError: errorMessage,
  });
}
