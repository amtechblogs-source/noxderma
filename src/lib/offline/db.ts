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
  StaffSalary,
  PartnerTransaction,
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
  staffSalaries!: Table<StaffSalary, string>;
  partnerTransactions!: Table<PartnerTransaction, string>;
  manufacturerLedger!: Table<any, string>;

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

    this.version(9).stores({
      staffSalaries: "id, staffId, month, status, disbursedAt, createdAt",
    });

    this.version(10).stores({
      partnerTransactions: "id, partnerId, type, date, paymentMethod, createdAt",
    });

    this.version(11).stores({
      manufacturerLedger: "id, manufacturerId, date, referenceType, referenceNumber",
      payments: "id, customerId, paymentDate, referenceNumber, syncStatus",
    });

    this.attachNewestFirstDefaultSort();
  }

  /**
   * Ensures all user-facing tables return newest/recent entries first (top of list)
   * when `.toArray()` is called across any module in the application.
   */
  private attachNewestFirstDefaultSort() {
    const extractRecordSortTime = (rec: any): number => {
      if (!rec || typeof rec !== "object") return 0;
      const dateCandidate =
        rec.createdAt ||
        rec.timestamp ||
        rec.capturedAt ||
        rec.disbursedAt ||
        rec.invoiceDate ||
        rec.paymentDate ||
        rec.orderDate ||
        rec.bookingDate ||
        rec.returnDate ||
        rec.visitDate ||
        rec.date ||
        rec.updatedAt ||
        rec.startDate;

      if (typeof dateCandidate === "number" && Number.isFinite(dateCandidate)) {
        return dateCandidate;
      }
      if (typeof dateCandidate === "string" && dateCandidate.trim()) {
        const parsed = Date.parse(dateCandidate);
        if (!Number.isNaN(parsed)) return parsed;
      }

      // Fallback: extract embedded epoch timestamp from IDs like "po_1794023837218" or "cust_1794..."
      const idStr = String(rec.id || rec.productId || "");
      const match = idStr.match(/(\d{10,15})/);
      if (match) {
        return Number(match[1]) || 0;
      }
      return 0;
    };

    const skipTables = new Set(["categories", "outboxQueue", "settings"]);

    for (const table of this.tables) {
      if (skipTables.has(table.name)) continue;
      const origToArray = table.toArray.bind(table);
      table.toArray = (async (...args: any[]) => {
        const rows = await (origToArray as any)(...args);
        if (!Array.isArray(rows) || rows.length <= 1) return rows;
        return [...rows].sort((a, b) => {
          const tB = extractRecordSortTime(b);
          const tA = extractRecordSortTime(a);
          if (tB !== tA) return tB - tA;
          return String(b?.id || "").localeCompare(String(a?.id || ""));
        });
      }) as any;
    }
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
