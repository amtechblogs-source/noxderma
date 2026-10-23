import Dexie, { type Table } from "dexie";
import type {
  BusinessSettings,
  DynamicCategory,
  Product,
  ProductPricing,
  InventoryBatch,
  StockMovement,
  InventoryProjection,
  Customer,
  Lead,
  CustomerVisit,
  Invoice,
  Payment,
  OutboxOperation,
  SyncConflict,
} from "@/types";

export interface PendingImageRecord {
  id: string;
  productId: string;
  blobDataUrl: string; // base64 or object URL for offline rendering
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: "pending" | "uploading" | "uploaded" | "failed";
  uploadedUrl?: string;
  error?: string;
  createdAt: string;
}

export interface LocalAuditLog {
  id: string;
  userId: string;
  userName: string;
  deviceId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export class NoxdermaDexieDB extends Dexie {
  settings!: Table<BusinessSettings, string>;
  categories!: Table<DynamicCategory, string>;
  products!: Table<Product, string>;
  productPricing!: Table<ProductPricing, string>;
  inventoryBatches!: Table<InventoryBatch, string>;
  stockMovements!: Table<StockMovement, string>;
  inventoryProjections!: Table<InventoryProjection, string>;
  customers!: Table<Customer, string>;
  leads!: Table<Lead, string>;
  customerVisits!: Table<CustomerVisit, string>;
  invoices!: Table<Invoice, string>;
  payments!: Table<Payment, string>;
  outboxQueue!: Table<OutboxOperation, string>;
  pendingImages!: Table<PendingImageRecord, string>;
  auditLogs!: Table<LocalAuditLog, string>;
  syncConflicts!: Table<SyncConflict, string>;
  manufacturers!: Table<any, string>;
  purchaseOrders!: Table<any, string>;
  salesBookings!: Table<any, string>;
  onlineOrders!: Table<any, string>;
  salesReturns!: Table<any, string>;
  marketingCampaigns!: Table<any, string>;
  employeeTargets!: Table<any, string>;
  users!: Table<any, string>;

  constructor() {
    super("NoxdermaPharmaOfflineDB");

    this.version(1).stores({
      settings: "id",
      categories: "id, slug, active, displayOrder",
      products: "id, sku, categoryId, status, brand",
      productPricing: "productId",
      inventoryBatches: "id, productId, batchNumber, expiryDate, status",
      stockMovements: "id, productId, batchId, timestamp, type, referenceId",
      inventoryProjections: "productId, isLowStock, hasNearExpiry",
      customers: "id, category, phone, status, name",
      leads: "id, status, assignedEmployeeId, nextFollowUpDate",
      customerVisits: "id, employeeId, visitDate",
      invoices: "id, provisionalReference, customerId, paymentStatus, syncStatus, createdAt",
      payments: "id, customerId, paymentDate, syncStatus",
      outboxQueue: "id, entityId, entityType, status, timestamp, retryCount",
      pendingImages: "id, productId, status, createdAt",
      auditLogs: "id, userId, timestamp, action",
      syncConflicts: "id, operationId, entityType, resolutionStatus, createdAt",
    });

    this.version(2).stores({
      manufacturers: "id, name, status",
      purchaseOrders: "id, poNumber, manufacturerId, status, orderDate",
      salesBookings: "id, bookingRef, customerId, status, bookingDate",
      onlineOrders: "id, orderNumber, customerPhone, courier, status, orderDate",
      salesReturns: "id, returnNoteNumber, customerId, status, returnDate",
      marketingCampaigns: "id, status, targetAudience, startDate",
      employeeTargets: "id, repName, month",
      users: "id, email, role, active",
    });
  }
}

export const offlineDb = new NoxdermaDexieDB();
