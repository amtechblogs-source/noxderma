export type AuditActionType =
  | "create"
  | "update"
  | "delete"
  | "undo"
  | "login"
  | "payment_received"
  | "stock_adjusted"
  | "settings_changed";

export type AuditEntityType =
  | "invoice"
  | "customer"
  | "product"
  | "payment"
  | "inventory_batch"
  | "stock_movement"
  | "category"
  | "setting"
  | "purchase_order"
  | "user"
  | "system";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userRole: string;
  userEmail?: string;
  action: AuditActionType | string;
  entityType: AuditEntityType | string;
  entityId: string;
  entityTitle: string;
  details: string;
  snapshotBefore?: any;
  snapshotAfter?: any;
  canUndo: boolean;
  isUndone?: boolean;
  undoneAt?: string;
  undoneBy?: string;
  undoneDetails?: string;
}
