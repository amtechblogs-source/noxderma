export type OutboxEntityType =
  | "invoice"
  | "customer"
  | "lead"
  | "customer_visit"
  | "payment"
  | "stock_movement"
  | "damaged_stock"
  | "sample_record"
  | "product_image"
  | "settings";

export type OutboxActionType = "create" | "update" | "reversal";

export type OutboxStatus = "pending" | "processing" | "synced" | "conflict" | "failed";

export interface OutboxOperation {
  id: string; // Deterministic idempotency key
  entityId: string;
  entityType: OutboxEntityType;
  action: OutboxActionType;
  payload: Record<string, unknown>;
  deviceId: string;
  userId: string;
  userName: string;
  timestamp: string;
  status: OutboxStatus;
  retryCount: number;
  lastError?: string;
  dependencies?: string[]; // IDs of preceding operations that must commit first
}

export interface SyncConflict {
  id: string;
  operationId: string;
  entityType: OutboxEntityType;
  entityId: string;
  reason: "STOCK_EXHAUSTED" | "DUPLICATE_TRANSACTION" | "CUSTOMER_BLOCKED" | "STALE_DATA";
  conflictMessage: string;
  localPayload: Record<string, unknown>;
  serverState?: Record<string, unknown>;
  resolutionStatus: "pending_admin_review" | "resolved_override" | "resolved_cancelled";
  resolvedByUserId?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface DeviceMetadata {
  deviceId: string;
  deviceLabel: string;
  registeredUserId: string;
  isPwaInstalled: boolean;
  browserAgent: string;
  lastOnlineAt: string;
}
