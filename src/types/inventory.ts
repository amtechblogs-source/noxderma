export interface InventoryBatch {
  id: string;
  productId: string;
  productName: string;
  batchNumber: string;
  manufacturerId: string;
  manufacturingDate?: string;
  expiryDate: string; // ISO date for FEFO sorting
  receivedQuantity: number;
  remainingQuantity: number;
  blockedQuantity: number; // for quarantine or expired stock
  goodsReceiptId?: string;
  status: "active" | "near_expiry" | "expired" | "quarantine" | "depleted";
  createdAt: string;
  updatedAt: string;
}

// Protected batch valuation
export interface BatchCostRecord {
  batchId: string;
  productId: string;
  landedCostTotal: number;
  landedCostPerUnit: number;
  currency: string;
  calculatedAt: string;
}

export type StockMovementType =
  | "purchase_receipt"
  | "sales_deduction"
  | "sales_return"
  | "supplier_return"
  | "sample_issue"
  | "damaged_stock"
  | "expiry_write_off"
  | "reconciliation_adjustment";

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber?: string;
  type: StockMovementType;
  quantityChange: number; // positive for addition, negative for reduction
  balanceAfter: number;
  referenceId: string; // Invoice ID, GRN ID, Damage ID
  referenceType: "invoice" | "goods_receipt" | "sample" | "damage" | "adjustment";
  userId: string;
  userName: string;
  reason?: string;
  deviceId?: string;
  timestamp: string;
}

export interface InventoryProjection {
  productId: string;
  totalPhysicalStock: number;
  availableStock: number;
  reservedStock: number;
  blockedStock: number;
  activeBatchesCount: number;
  earliestExpiryDate?: string;
  isLowStock: boolean;
  hasNearExpiry: boolean;
  lastMovementAt: string;
}

export interface DamagedStockRecord {
  id: string;
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber?: string;
  quantity: number;
  reason: string;
  valuationCost?: number; // visible to admin
  recordedByUserId: string;
  recordedByUserName: string;
  notes?: string;
  imageUrl?: string;
  date: string;
}

export interface SampleRecord {
  id: string;
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber?: string;
  quantity: number;
  recipientName: string;
  recipientOrganization: string;
  purposeOrCampaign: string;
  issuedByUserId: string;
  issuedByUserName: string;
  valuationCost?: number; // visible to admin
  date: string;
  followUpNotes?: string;
}
