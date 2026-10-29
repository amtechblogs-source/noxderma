export type LedgerAccountType =
  | "manufacturer_payable"
  | "distributor_receivable"
  | "pharmacy_receivable"
  | "direct_customer_receivable"
  | "cash"
  | "bank"
  | "sales_revenue"
  | "cost_of_goods_sold"
  | "inventory_asset"
  | "damaged_stock_loss"
  | "sample_expense"
  | "discounts_allowed";

export interface LedgerEntry {
  id: string;
  accountId: string;
  accountName: string;
  accountType: LedgerAccountType;
  entityId?: string; // Manufacturer ID or Customer ID
  entityName?: string;
  date: string;
  referenceId: string; // Invoice ID, Payment ID, GRN ID
  referenceType: "invoice" | "payment" | "purchase" | "adjustment" | "reversal";
  debit: number;
  credit: number;
  runningBalance: number;
  description: string;
  isReversal: boolean;
  reversalOfEntryId?: string;
  userId: string;
  timestamp: string;
}

export interface ThreeWayCreditSummary {
  manufacturerPayablesTotal: number; // what Noxderma owes manufacturers
  distributorReceivablesTotal: number; // what distributors owe Noxderma
  pharmacyReceivablesTotal: number; // what pharmacies & clinics owe Noxderma
  netWorkingCapitalDifference: number;
}

export interface AgingBucket {
  label: "not_due" | "1_30_days" | "31_60_days" | "61_90_days" | "over_90_days";
  displayTitle: string;
  amount: number;
  invoiceCount: number;
}

export type ExpenseCategory =
  | "traveling_fuel"
  | "staff_salaries"
  | "office_utilities"
  | "marketing_promotion"
  | "courier_delivery"
  | "misc_other";

export interface OperatingExpense {
  id: string;
  category: ExpenseCategory;
  categoryLabel?: string;
  title: string;
  amount: number;
  date: string;
  paidTo?: string;
  paymentMethod: "cash" | "bank_transfer" | "cheque" | "online";
  referenceNumber?: string;
  notes?: string;
  createdById?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ProfitAndLossReport {
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  discountsGiven: number;
  salesReturns: number;
  netSales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossProfitMarginPercentage: number;
  operatingExpenses: {
    travelingExpenses: number;
    staffSalaries: number;
    damagedStockLoss: number;
    sampleExpense: number;
    courierAndLogistics: number;
    officeUtilities: number;
    marketingExpenses: number;
    otherExpenses: number;
    totalOperatingExpenses: number;
  };
  netOperatingProfit: number;
  netProfitMarginPercentage: number;
}
