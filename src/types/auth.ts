export type UserRole = "admin" | "warehouse_staff" | "booking_user" | "sales_rep";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  territory?: string;
  active: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export type Permission =
  // User Management
  | "users:manage"
  // Settings & Configuration
  | "settings:manage"
  // Dynamic Categories
  | "categories:manage"
  // Catalog & Products
  | "products:view"
  | "products:edit"
  // Financial Costs & Pricing
  | "pricing:view"
  | "pricing:edit"
  // Inventory & Stock
  | "inventory:view"
  | "inventory:receive"
  | "inventory:adjust"
  | "inventory:damage"
  | "inventory:samples"
  // Sales & Invoices
  | "invoices:create"
  | "invoices:view"
  | "invoices:edit"
  | "invoices:reverse"
  // CRM
  | "crm:leads"
  | "crm:customers"
  | "crm:visits"
  // Finance & Accounting
  | "finance:ledgers"
  | "finance:pnl"
  | "finance:aging"
  | "finance:payments"
  // Marketing
  | "marketing:manage"
  // Audit & Sync
  | "audit:view"
  | "sync:reconcile";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    "users:manage",
    "settings:manage",
    "categories:manage",
    "products:view",
    "products:edit",
    "pricing:view",
    "pricing:edit",
    "inventory:view",
    "inventory:receive",
    "inventory:adjust",
    "inventory:damage",
    "inventory:samples",
    "invoices:create",
    "invoices:view",
    "invoices:edit",
    "invoices:reverse",
    "crm:leads",
    "crm:customers",
    "crm:visits",
    "finance:ledgers",
    "finance:pnl",
    "finance:aging",
    "finance:payments",
    "marketing:manage",
    "audit:view",
    "sync:reconcile",
  ],
  warehouse_staff: [
    "products:view",
    "inventory:view",
    "inventory:receive",
    "inventory:adjust",
    "inventory:damage",
    "inventory:samples",
    // Strictly blocked from pricing:view, finance:*, invoices:view, users:manage
  ],
  booking_user: [
    "products:view",
    "inventory:view",
    "invoices:create",
    "invoices:view",
    "crm:leads",
    "crm:customers",
    "crm:visits",
    "finance:payments",
    // Strictly blocked from users:manage, settings:manage, pricing:edit, finance:ledgers, finance:pnl
  ],
  sales_rep: [
    "products:view",
    "inventory:view",
    "invoices:create",
    "crm:leads",
    "crm:customers",
    "crm:visits",
  ],
};
