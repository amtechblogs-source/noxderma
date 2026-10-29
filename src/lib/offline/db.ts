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
  CouponCode,
  StaffMonitoringProfile,
  DailyBeatPlan,
  LiveMapTransactionPin,
  GeoVerifiedPhoto,
  OperatingExpense,
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
  userRole?: string;
  userEmail?: string;
  deviceId?: string;
  action: string;
  entityType: string;
  entityId: string;
  entityTitle?: string;
  details: string;
  timestamp: string;
  snapshotBefore?: any;
  snapshotAfter?: any;
  canUndo?: boolean;
  isUndone?: boolean;
  undoneAt?: string;
  undoneBy?: string;
  undoneDetails?: string;
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
  coupons!: Table<CouponCode, string>;
  staffMonitors!: Table<StaffMonitoringProfile, string>;
  dailyBeatPlans!: Table<DailyBeatPlan, string>;
  liveMapPins!: Table<LiveMapTransactionPin, string>;
  geoVerifiedPhotos!: Table<GeoVerifiedPhoto, string>;
  operatingExpenses!: Table<OperatingExpense, string>;

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

    this.version(3).stores({
      inventoryBatches: "id, productId, batchNumber, expiryDate, remainingQuantity, status",
      users: "id, email, role, active",
    });

    this.version(4).stores({
      coupons: "id, code, customerId, status, discountPercent, validUntil, createdAt",
    });

    this.version(5).stores({
      auditLogs: "id, userId, timestamp, action, entityType, entityId, isUndone",
    });

    this.version(6).stores({
      staffMonitors: "id, name, liveState, territory",
      dailyBeatPlans: "id, staffId, date, territory",
      liveMapPins: "id, type, staffId, timestamp",
      geoVerifiedPhotos: "id, staffId, capturedAt, auditStatus",
    });

    this.version(7).stores({
      customerVisits: "id, customerId, employeeId, visitDate",
    });

    this.version(8).stores({
      operatingExpenses: "id, category, date, paymentMethod, amount, createdAt",
    });
  }
}

export const offlineDb = new NoxdermaDexieDB();

if (typeof window !== "undefined") {
  import("./cloudSync")
    .then(({ attachDexieCloudHooks, startRealtimeCloudSync }) => {
      attachDexieCloudHooks(offlineDb);
      startRealtimeCloudSync(offlineDb);
    })
    .catch((err) => {
      console.warn("Could not initialize Cloud Firestore sync:", err);
    });
}
