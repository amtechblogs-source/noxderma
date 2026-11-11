export type CustomerCategory = "pharmacy" | "distributor" | "direct_clinic" | "online" | "other";

export interface Customer {
  id: string;
  name: string;
  businessName?: string;
  category: CustomerCategory;
  contactPerson: string;
  phone: string;
  whatsappNumber: string;
  email?: string;
  address: string;
  city: string;
  deliveryArea?: string;
  creditLimit: number; // in PKR
  creditTermsDays: number; // default 30
  currentOutstandingBalance: number;
  assignedSalesRepId?: string;
  status: "active" | "blocked" | "archived";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceLineBatchAllocation {
  batchId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  unitCostAtAllocation?: number; // for COGS calculations
}

export interface InvoiceLine {
  id: string;
  productId: string;
  productName: string;
  packSize: string;
  imageUrl?: string;
  quantity: number; // Paid units
  bonusQuantity?: number; // Free promotional bonus units (e.g. 5+1)
  totalUnitsDelivered?: number; // Paid + Bonus units
  extraDiscountPercent?: number; // Optional extra percentage discount
  unitPrice: number; // in PKR
  lineDiscountPercentage: number;
  lineDiscountAmount: number;
  lineTotal: number;
  batchAllocations: InvoiceLineBatchAllocation[];
}

export type InvoicePaymentStatus = "unpaid" | "partially_paid" | "paid";
export type InvoiceSyncStatus = "local_only" | "pending_sync" | "syncing" | "synced" | "conflict" | "failed";

export interface Invoice {
  id: string; // server ID or deterministic offline ID
  provisionalReference: string; // e.g. "OFF-DEV01-20261022-001"
  officialReference?: string; // e.g. "NXD-2026-00042" assigned by server
  customerId: string;
  customerName: string;
  customerCategory: CustomerCategory;
  customerPhone: string;
  customerAddress: string;
  lines: InvoiceLine[];
  subtotal: number;
  invoiceDiscountAmount: number;
  invoiceDiscountPercentage?: number;
  taxAmount: number;
  deliveryCharge: number;
  grossTotal: number;
  netTotal: number;
  paidAmount: number;
  outstandingBalance: number;
  paymentStatus: InvoicePaymentStatus;
  paymentMethod?: "cash" | "bank_transfer" | "credit" | "split";
  invoiceDate: string;
  dueDate: string; // 30-day default
  deliveryStatus: "pending" | "dispatched" | "delivered" | "returned";
  salesRepId: string;
  salesRepName: string;
  notes?: string;
  syncStatus: InvoiceSyncStatus;
  syncError?: string;
  deviceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocation {
  invoiceId: string;
  invoiceReference: string;
  amountAllocated: number;
}

export interface Payment {
  id: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: "cash" | "bank_transfer" | "cheque" | "online";
  referenceNumber?: string;
  allocations: PaymentAllocation[];
  unallocatedAmount: number;
  recordedByUserId: string;
  notes?: string;
  syncStatus: InvoiceSyncStatus;
  createdAt: string;
}

export type SalesReturnReason =
  | "expired"
  | "near_expiry"
  | "transit_damage"
  | "pharmacy_overstock"
  | "wrong_supply"
  | "recall";

export type SalesReturnDisposition = "quarantine_batch" | "scrap_writeoff" | "restocked";

export type CustomerReturnResolution = "khata_credit" | "cash_refund" | "replacement";

export interface SalesReturn {
  id: string;
  returnNoteNumber: string; // e.g. CN-2026-012
  invoiceReference: string;
  customerId: string;
  customerName: string;
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber: string;
  replacementBatchId?: string;
  replacementBatchNumber?: string;
  returnQuantity: number;
  unitCreditPrice: number;
  unitCost?: number;
  totalCreditAmount: number;
  returnReason: SalesReturnReason;
  disposition: SalesReturnDisposition;
  customerResolution?: CustomerReturnResolution;
  status: "approved" | "pending_inspection";
  returnDate: string;
  recordedByName: string;
  notes?: string;
}
