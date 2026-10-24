export type CouponUsageLimit = "single_use" | "multi_use" | "unlimited";

export type CouponStatus = "active" | "expired" | "disabled" | "used";

export type CouponAssignedScope =
  | "specific_customer"
  | "all_customers"
  | "pharmacies"
  | "dermatologists"
  | "distributors";

export interface CouponCode {
  id: string;
  code: string; // e.g. "NOX-VIP20-7X9B"
  discountPercent: number; // e.g. 15%
  assignedScope: CouponAssignedScope;
  customerId?: string; // assigned customer ID if specific
  customerName?: string; // Pharmacy / Clinic / Customer name
  customerBusinessName?: string;
  customerPhone?: string; // WhatsApp / Phone number
  customerCategory?: string; // pharmacy, direct_clinic, distributor, online
  minOrderPkr: number; // e.g. Rs. 0 or Rs. 2,000
  maxDiscountPkr?: number; // optional discount cap
  validUntil: string; // Expiry Date (YYYY-MM-DD)
  usageLimit: CouponUsageLimit;
  usageCount: number;
  status: CouponStatus;
  websiteUrl: string; // default "https://noxderma.com"
  description?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CouponDeveloperExportItem {
  code: string;
  discountPercentage: number;
  assignedTo: string;
  customerPhone?: string;
  minOrderAmountPkr: number;
  validUntil: string;
  status: string;
  websiteRedeemUrl: string;
}
