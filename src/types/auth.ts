export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "accountant"
  | "warehouse_staff"
  | "booking_user"
  | "sales_rep";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  password?: string;
  permissions?: Permission[];
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
  | "audit:undo"
  | "sync:reconcile";

export const PERMISSION_GROUPS: {
  moduleName: string;
  description: string;
  permissions: { key: Permission; label: string; desc: string }[];
}[] = [
  {
    moduleName: "Sales & Invoicing",
    description: "Creating customer bills, seeing bills, and return notes",
    permissions: [
      { key: "invoices:create", label: "Make Customer Bills", desc: "Create new invoices and cash memos" },
      { key: "invoices:view", label: "View Bills List", desc: "Browse and print past customer bills" },
      { key: "invoices:edit", label: "Edit / Cancel Bills", desc: "Modify pending bills" },
      { key: "invoices:reverse", label: "Customer Returns", desc: "Process credit notes and returns" },
    ],
  },
  {
    moduleName: "Inventory & Stock",
    description: "Warehouse medicine stock, batches, and GRN receipts",
    permissions: [
      { key: "inventory:view", label: "View Stock & Batches", desc: "Check quantity and expiry dates" },
      { key: "inventory:receive", label: "Receive New Stock (GRN)", desc: "Add stock from manufacturer purchase orders" },
      { key: "inventory:damage", label: "Record Damaged Stock", desc: "Mark broken or damaged boxes" },
      { key: "inventory:samples", label: "Issue Clinical Samples", desc: "Give free doctor promotional samples" },
      { key: "inventory:adjust", label: "Stock Adjustment", desc: "Audit and manually update count" },
    ],
  },
  {
    moduleName: "Products & Medicine Catalog",
    description: "Product list, formulas, pack sizes, and prices",
    permissions: [
      { key: "products:view", label: "View Medicine Catalog", desc: "See medicines and descriptions" },
      { key: "products:edit", label: "Add & Edit Medicines", desc: "Create new medicines, upload photos" },
      { key: "pricing:view", label: "View Purchase Costs", desc: "See purchase cost and profit margins" },
      { key: "pricing:edit", label: "Edit Trade Prices / MRP", desc: "Change product rates and discounts" },
      { key: "categories:manage", label: "Manage Categories", desc: "Create, edit, or delete categories" },
    ],
  },
  {
    moduleName: "Pharmacies & CRM",
    description: "Medical stores, hospital clients, and field visits",
    permissions: [
      { key: "crm:customers", label: "Manage Pharmacies & Clients", desc: "Add medical stores, set credit limits" },
      { key: "crm:visits", label: "Doctor & Market Visits", desc: "Record field visits and doctor feedback" },
      { key: "crm:leads", label: "New Leads & Enquiries", desc: "Track sales prospects and pipeline" },
      { key: "marketing:manage", label: "Promotions & Schemes", desc: "Run bonus offers and WhatsApp cards" },
    ],
  },
  {
    moduleName: "Finance & Accounts (Khata)",
    description: "Customer credit, company payments, and profit & loss",
    permissions: [
      { key: "finance:payments", label: "Collect Payments", desc: "Record cash and bank payments" },
      { key: "finance:aging", label: "Market Udhaar Tracking", desc: "View pending customer balances" },
      { key: "finance:ledgers", label: "Khata (Ledgers)", desc: "Company and customer detailed ledgers" },
      { key: "finance:pnl", label: "Profit & Loss (Kamai)", desc: "View net profit, margins, and expenses" },
    ],
  },
  {
    moduleName: "Administration & System",
    description: "Software users, logins, security, and company settings",
    permissions: [
      { key: "users:manage", label: "Manage Staff Accounts", desc: "Create user logins and permissions" },
      { key: "settings:manage", label: "Company Settings & Themes", desc: "Change business name, logos, themes" },
      { key: "sync:reconcile", label: "Cloud Sync & Backups", desc: "Sync data to cloud database" },
      { key: "audit:view", label: "View Audit Logs", desc: "Inspect who did what and when" },
      { key: "audit:undo", label: "Undo Staff Actions", desc: "Revert / rollback changes made by any user" },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
);

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  manager: [
    "products:view",
    "products:edit",
    "pricing:view",
    "pricing:edit",
    "categories:manage",
    "inventory:view",
    "inventory:receive",
    "inventory:damage",
    "inventory:samples",
    "inventory:adjust",
    "invoices:create",
    "invoices:view",
    "invoices:edit",
    "invoices:reverse",
    "crm:leads",
    "crm:customers",
    "crm:visits",
    "finance:payments",
    "finance:aging",
    "finance:ledgers",
    "marketing:manage",
    "sync:reconcile",
  ],
  accountant: [
    "products:view",
    "pricing:view",
    "invoices:view",
    "invoices:create",
    "invoices:reverse",
    "crm:customers",
    "finance:payments",
    "finance:aging",
    "finance:ledgers",
    "finance:pnl",
    "sync:reconcile",
  ],
  warehouse_staff: [
    "products:view",
    "inventory:view",
    "inventory:receive",
    "inventory:adjust",
    "inventory:damage",
    "inventory:samples",
    "invoices:view",
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
