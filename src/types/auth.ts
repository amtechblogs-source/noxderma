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
  // Dashboard Financial & Sales Visibility
  | "dashboard:sales"
  | "dashboard:finance"
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
  // CRM & Field Staff
  | "crm:leads"
  | "crm:customers"
  | "crm:visits"
  | "staff:monitoring"
  | "staff:targets"
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
    moduleName: "Dashboard & Financial Summary",
    description: "Control who can see Daily Sales, Cash Received, Udhaar, and Company Payables on Dashboard",
    permissions: [
      { key: "dashboard:sales", label: "Dashboard Sales & Charts", desc: "View Today's Total Sales, Cash Received & 7-Day Sales Trend on Dashboard (Owner / Accountant)" },
      { key: "dashboard:finance", label: "Dashboard Udhaar & Payables", desc: "View Money to Receive (Udhaar) & Money We Owe Companies on Dashboard (Owner / Accountant)" },
    ],
  },
  {
    moduleName: "Sales & Orders",
    description: "Creating customer bills, staff bookings, courier orders, and sales returns",
    permissions: [
      { key: "invoices:create", label: "Make Bills & Staff Bookings", desc: "Create new invoices (/sales/invoices/new) and Staff Bookings (/sales/bookings)" },
      { key: "invoices:view", label: "Invoices (Bills) & Courier Orders", desc: "View past bills (/sales/invoices) and Courier Orders (/sales/online-orders)" },
      { key: "invoices:edit", label: "Edit / Cancel Bills", desc: "Modify pending bills" },
      { key: "invoices:reverse", label: "Sales Returns", desc: "Process customer credit notes and returns (/sales/returns)" },
    ],
  },
  {
    moduleName: "Stock & Medicines",
    description: "Medicines catalog, price estimator, warehouse stock, batches, and purchases (GRN)",
    permissions: [
      { key: "products:view", label: "Medicines & Manufacturers", desc: "View Medicines catalog (/products) and Manufacturers (/manufacturers)" },
      { key: "products:edit", label: "Add & Edit Medicines", desc: "Create or edit medicines and upload photos (/products/new)" },
      { key: "pricing:view", label: "Price Estimator & Costs", desc: "Access Price Estimator (/products/price-estimator) and view purchase costs" },
      { key: "pricing:edit", label: "Edit Trade Prices / MRP", desc: "Change product rates and discounts" },
      { key: "categories:manage", label: "Manage Categories", desc: "Create, edit, or delete medicine categories (/categories)" },
      { key: "inventory:view", label: "Batches, Stock Alerts & History", desc: "View Stock Alerts (/inventory), Batches (/inventory/batches) & Stock History (/inventory/movements)" },
      { key: "inventory:receive", label: "Purchases (GRN)", desc: "Receive stock and manage manufacturer purchase orders (/purchases)" },
      { key: "inventory:damage", label: "Record Damaged Stock", desc: "Mark broken or damaged boxes" },
      { key: "inventory:samples", label: "Issue Doctor Samples", desc: "Give free doctor promotional samples" },
      { key: "inventory:adjust", label: "Stock Adjustment", desc: "Audit and manually update stock count" },
    ],
  },
  {
    moduleName: "Clients & Field Staff",
    description: "Pharmacies, distributors, leads, doctor visits, staff live location, and targets",
    permissions: [
      { key: "crm:customers", label: "Pharmacies & Distributors", desc: "Access Pharmacies (/customers) and Distributors (/distributors)" },
      { key: "crm:leads", label: "Client Leads", desc: "Track new client enquiries (/crm/leads)" },
      { key: "crm:visits", label: "Doctor Visits", desc: "Record and view Doctor & Field Visits (/crm/visits)" },
      { key: "staff:monitoring", label: "Staff Live Location & Battery", desc: "View Staff Live GPS Location & Mobile Battery (/employees/monitoring)" },
      { key: "staff:targets", label: "Sales Targets", desc: "View and manage staff Sales Targets (/employees/targets)" },
    ],
  },
  {
    moduleName: "Accounts (Khata) & Marketing",
    description: "Market udhaar, company/customer khata, profit & loss, reports, and marketing",
    permissions: [
      { key: "finance:payments", label: "Collect Payments", desc: "Record cash and bank payments" },
      { key: "finance:aging", label: "Market Udhaar", desc: "View pending customer balances (/finance/credit)" },
      { key: "finance:ledgers", label: "Company & Customer Khata", desc: "Detailed ledgers (/finance/ledgers/manufacturers & /finance/ledgers/customers)" },
      { key: "finance:pnl", label: "Profit & Loss & Reports", desc: "View net profit (/finance/pnl) and financial Reports (/reports)" },
      { key: "marketing:manage", label: "Marketing, Coupons & WhatsApp", desc: "Offers & Schemes (/marketing), Coupons (/marketing/coupons) & WhatsApp Cards (/marketing/whatsapp)" },
    ],
  },
  {
    moduleName: "System & Settings",
    description: "Audit logs, cloud sync, staff accounts, integrations, and company settings",
    permissions: [
      { key: "users:manage", label: "Staff Accounts & Access", desc: "Create user logins and assign module permissions (/users)" },
      { key: "settings:manage", label: "Settings, Notifications & Integrations", desc: "Access Settings (/settings), Integrations (/integrations) & Notifications (/notifications)" },
      { key: "sync:reconcile", label: "Cloud Sync", desc: "Manage cloud database sync (/sync)" },
      { key: "audit:view", label: "Audit Logs", desc: "Inspect who did what and when (/audit)" },
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
    "staff:monitoring",
    "staff:targets",
    "marketing:manage",
  ],
  accountant: [
    "dashboard:sales",
    "dashboard:finance",
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
  ],
  booking_user: [
    "products:view",
    "inventory:view",
    "invoices:create",
    "invoices:view",
    "crm:leads",
    "crm:customers",
  ],
  sales_rep: [
    "products:view",
    "crm:leads",
    "crm:customers",
    "crm:visits",
  ],
};
