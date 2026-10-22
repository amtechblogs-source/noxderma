import { offlineDb } from "./db";
import { getDeviceId, generateIdempotencyKey } from "./device";
import type { OutboxOperation, OutboxEntityType, OutboxActionType, SyncConflict } from "@/types";

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
  return operation;
}

export async function getPendingOperations(): Promise<OutboxOperation[]> {
  return await offlineDb.outboxQueue
    .where("status")
    .equals("pending")
    .sortBy("timestamp");
}

export async function getPendingOutboxCount(): Promise<number> {
  return await offlineDb.outboxQueue
    .where("status")
    .anyOf(["pending", "processing", "conflict", "failed"])
    .count();
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

  await offlineDb.transaction("rw", [offlineDb.outboxQueue, offlineDb.invoices], async () => {
    await offlineDb.outboxQueue.update(opId, { status: "synced" });

    // If it was an invoice, update syncStatus to 'synced' and link official server reference
    if (op.entityType === "invoice") {
      const invoice = await offlineDb.invoices.get(op.entityId);
      if (invoice) {
        await offlineDb.invoices.update(op.entityId, {
          syncStatus: "synced",
          officialReference: (serverAssignedData?.officialReference as string) || invoice.officialReference,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  });
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
