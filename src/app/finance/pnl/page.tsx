"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ArrowLeft,
  Calendar,
  DollarSign,
  AlertOctagon,
  Percent,
  Download,
  Printer,
  Info,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  Wallet,
  FileText,
  Fuel,
  Users,
  Building,
  Truck,
  Layers,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { scheduleCloudUpsert, scheduleCloudDelete } from "@/lib/offline/cloudSync";
import { useAuth } from "@/context/AuthContext";
import DateRangeFilterBar from "@/components/common/DateRangeFilterBar";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";
import {
  DateFilterState,
  createDefaultDateFilter,
  isRecordInDateRange,
  getDateFilterDescription,
  computeDateScopeCounts,
  getItemsInScope,
} from "@/lib/dateFilter";
import {
  BulkDeleteModal,
  SingleDeleteModal,
  type DeleteScopeType,
} from "@/components/common/BulkDeleteModal";
import { recordActivity } from "@/lib/audit/auditTracker";
import type {
  Invoice,
  Product,
  ProductPricing,
  InventoryBatch,
  OperatingExpense,
  ExpenseCategory,
  StaffSalary,
} from "@/types";

const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string; icon: any }[] = [
  { key: "traveling_fuel", label: "Traveling & Fuel (Safar / Petrol TA/DA)", icon: Fuel },
  { key: "staff_salaries", label: "Staff Salaries & Allowances (Tankhwah)", icon: Users },
  { key: "office_utilities", label: "Office Rent & Utilities (Bijli, Gas, Internet)", icon: Building },
  { key: "courier_delivery", label: "Courier & Delivery Charges (TCS / Trax)", icon: Truck },
  { key: "marketing_promotion", label: "Marketing, Promotion & Doctor Tea", icon: Layers },
  { key: "misc_other", label: "Miscellaneous / Other Expenses (Deegar Kharcha)", icon: Wallet },
];

export default function ProfitAndLossPage() {
  const { currentUser } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [productPricings, setProductPricings] = useState<ProductPricing[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [expenses, setExpenses] = useState<OperatingExpense[]>([]);
  const [salaryRecords, setSalaryRecords] = useState<StaffSalary[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [loading, setLoading] = useState(true);

  // New Expense Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("traveling_fuel");
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState<number | "">("");
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expensePaidTo, setExpensePaidTo] = useState("");
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<
    "cash" | "bank_transfer" | "cheque" | "online"
  >("cash");
  const [expenseNotes, setExpenseNotes] = useState("");
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  // Operating Expenses Bulk / Single Delete State
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [deleteExpensesModalOpen, setDeleteExpensesModalOpen] = useState(false);
  const [deletingExpense, setDeletingExpense] = useState<OperatingExpense | null>(null);
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);

  const loadFinanceData = async () => {
    try {
      const [invs, movs, pricings, prods, bchs, exps, sals] = await Promise.all([
        offlineDb.invoices.toArray(),
        offlineDb.stockMovements.toArray(),
        offlineDb.productPricing.toArray(),
        offlineDb.products.toArray(),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.operatingExpenses.toArray(),
        offlineDb.staffSalaries.toArray(),
      ]);
      setInvoices(invs || []);
      setMovements(movs || []);
      setProductPricings(pricings || []);
      setProducts(prods || []);
      setBatches(bchs || []);
      setExpenses(exps || []);
      setSalaryRecords(sals || []);
    } catch (err) {
      console.error("Failed to load P&L finance records:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFinanceData();

    const handleSync = () => loadFinanceData();
    window.addEventListener("noxderma-cloud-synced", handleSync);
    window.addEventListener("storage", handleSync);
    return () => {
      window.removeEventListener("noxderma-cloud-synced", handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, []);

  // Quick lookup maps
  const pricingMap = useMemo(() => {
    const map = new Map<string, ProductPricing>();
    productPricings.forEach((p) => map.set(String(p.productId), p));
    return map;
  }, [productPricings]);

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    products.forEach((p) => map.set(String(p.id), p));
    return map;
  }, [products]);

  const batchMap = useMemo(() => {
    const map = new Map<string, InventoryBatch>();
    batches.forEach((b) => map.set(String(b.id), b));
    return map;
  }, [batches]);

  // Filter invoices, expenses, movements & salaries by universal date filter
  const filteredData = useMemo(() => {
    const periodInvoices = invoices.filter((i) =>
      isRecordInDateRange(i.invoiceDate || i.createdAt, dateFilter)
    );
    const periodExpenses = expenses.filter((e) =>
      isRecordInDateRange(e.date || e.createdAt, dateFilter)
    );
    const periodMovements = movements.filter((m) =>
      isRecordInDateRange(m.timestamp, dateFilter)
    );
    const periodSalaries = salaryRecords.filter((s) => {
      if (s.status !== "paid") return false;
      // Match by earned salary month (e.g. "2026-10" for October), so salaries paid in November for October work deduct from October P&L
      const targetDate = s.month ? `${s.month}-15` : (s.disbursedAt || s.createdAt);
      return isRecordInDateRange(targetDate, dateFilter);
    });

    return { periodInvoices, periodExpenses, periodMovements, periodSalaries };
  }, [invoices, expenses, movements, salaryRecords, dateFilter]);

  // 1. REVENUE CALCULATIONS
  const grossSales = useMemo(() => {
    return filteredData.periodInvoices.reduce((sum, inv) => {
      const linesGross = (inv.lines || []).reduce(
        (lSum, l) => lSum + (l.quantity || 0) * (l.unitPrice || 0),
        0
      );
      return sum + (inv.grossTotal || linesGross || inv.netTotal || 0);
    }, 0);
  }, [filteredData.periodInvoices]);

  const discountsGiven = useMemo(() => {
    return filteredData.periodInvoices.reduce((sum, inv) => {
      const linesDiscount = (inv.lines || []).reduce(
        (lSum, l) => lSum + (l.lineDiscountAmount || 0),
        0
      );
      return sum + (inv.invoiceDiscountAmount || linesDiscount || 0);
    }, 0);
  }, [filteredData.periodInvoices]);

  const salesReturns = 0;
  const netSales = Math.max(0, grossSales - discountsGiven - salesReturns);

  // 2. COGS (PURCHASE COST OF MEDICINES SOLD)
  const costOfGoodsSold = useMemo(() => {
    return filteredData.periodInvoices.reduce((sum, inv) => {
      let invCogs = 0;
      for (const l of inv.lines || []) {
        const pricing = pricingMap.get(String(l.productId));
        const prod = productMap.get(String(l.productId));
        const batch = l.batchAllocations?.[0]?.batchId
          ? batchMap.get(String(l.batchAllocations[0].batchId))
          : undefined;

        let unitCost = 0;
        const allocCost = l.batchAllocations?.[0]?.unitCostAtAllocation;
        if (typeof allocCost === "number" && allocCost > 0) {
          unitCost = allocCost;
        } else if (pricing && Number(pricing.purchaseCostPerPack) > 0) {
          unitCost = Number(pricing.purchaseCostPerPack);
        } else if (batch && Number((batch as any).purchasePrice || (batch as any).unitCost) > 0) {
          unitCost = Number((batch as any).purchasePrice || (batch as any).unitCost);
        } else if (prod && Number((prod as any).purchaseCostPerPack || (prod as any).costPrice) > 0) {
          unitCost = Number((prod as any).purchaseCostPerPack || (prod as any).costPrice);
        }

        invCogs += (l.quantity || 0) * unitCost;
      }
      return sum + invCogs;
    }, 0);
  }, [filteredData.periodInvoices, pricingMap, productMap, batchMap]);

  const grossProfit = netSales - costOfGoodsSold;
  const grossProfitMargin = netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : "0.0";

  // 3. OPERATING EXPENSES BREAKDOWN
  const travelingExpenses = useMemo(() => {
    const manualFuel = filteredData.periodExpenses
      .filter((e) => e.category === "traveling_fuel")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const salaryFuel = filteredData.periodSalaries.reduce(
      (sum, s) => sum + (Number(s.fuelAllowance) || 0),
      0
    );
    return manualFuel + salaryFuel;
  }, [filteredData.periodExpenses, filteredData.periodSalaries]);

  const staffSalaries = useMemo(() => {
    const manualSalaries = filteredData.periodExpenses
      .filter((e) => e.category === "staff_salaries")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const payrollSalaries = filteredData.periodSalaries.reduce(
      (sum, s) =>
        sum +
        Math.max(
          0,
          (Number(s.baseSalary) || 0) +
            (Number(s.bonus) || 0) +
            (Number(s.otherAllowances) || 0) -
            (Number(s.deductions) || 0)
        ),
      0
    );
    return manualSalaries + payrollSalaries;
  }, [filteredData.periodExpenses, filteredData.periodSalaries]);

  const officeUtilities = useMemo(() => {
    return filteredData.periodExpenses
      .filter((e) => e.category === "office_utilities")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredData.periodExpenses]);

  const marketingExpenses = useMemo(() => {
    return filteredData.periodExpenses
      .filter((e) => e.category === "marketing_promotion")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredData.periodExpenses]);

  const courierAndLogistics = useMemo(() => {
    const invoiceDeliveryCharges = filteredData.periodInvoices.reduce(
      (sum, inv) => sum + (inv.deliveryCharge || 0),
      0
    );
    const recordedDelivery = filteredData.periodExpenses
      .filter((e) => e.category === "courier_delivery")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return invoiceDeliveryCharges + recordedDelivery;
  }, [filteredData.periodInvoices, filteredData.periodExpenses]);

  const otherExpenses = useMemo(() => {
    return filteredData.periodExpenses
      .filter((e) => e.category === "misc_other")
      .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [filteredData.periodExpenses]);

  // Broken stock loss
  const damagedMovements = useMemo(() => {
    return filteredData.periodMovements.filter((m) => m.type === "damaged_stock");
  }, [filteredData.periodMovements]);

  const damagedStockLoss = useMemo(() => {
    return damagedMovements.reduce((sum, m) => {
      const pricing = pricingMap.get(String(m.productId));
      const unitCost = pricing?.purchaseCostPerPack || 350;
      return sum + Math.abs(m.quantityChange || 0) * unitCost;
    }, 0);
  }, [damagedMovements, pricingMap]);

  // Doctor free samples
  const sampleMovements = useMemo(() => {
    return filteredData.periodMovements.filter((m) => m.type === "sample_issue");
  }, [filteredData.periodMovements]);

  const sampleExpense = useMemo(() => {
    return sampleMovements.reduce((sum, m) => {
      const pricing = pricingMap.get(String(m.productId));
      const unitCost = pricing?.purchaseCostPerPack || 350;
      return sum + Math.abs(m.quantityChange || 0) * unitCost;
    }, 0);
  }, [sampleMovements, pricingMap]);

  const totalOperatingExpenses =
    travelingExpenses +
    staffSalaries +
    officeUtilities +
    marketingExpenses +
    damagedStockLoss +
    sampleExpense +
    courierAndLogistics +
    otherExpenses;

  // 4. NET PROFIT & MARGIN
  const netOperatingProfit = grossProfit - totalOperatingExpenses;
  const netProfitMargin =
    netSales > 0 ? ((netOperatingProfit / netSales) * 100).toFixed(1) : "0.0";

  // Handle saving new operating expense
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(expenseAmount);
    if (!expenseTitle.trim() || isNaN(amountNum) || amountNum <= 0) {
      alert("Please enter a valid expense title and amount.");
      return;
    }

    setIsSavingExpense(true);
    try {
      const now = new Date().toISOString();
      const newExp: OperatingExpense = {
        id: `exp_${Date.now()}`,
        category: expenseCategory,
        title: expenseTitle.trim(),
        amount: amountNum,
        date: expenseDate || now.slice(0, 10),
        paidTo: expensePaidTo.trim(),
        paymentMethod: expensePaymentMethod,
        notes: expenseNotes.trim(),
        createdById: currentUser?.id || "usr_owner",
        createdByName: currentUser?.displayName || "Owner",
        createdAt: now,
      };

      await offlineDb.operatingExpenses.put(newExp);
      scheduleCloudUpsert("operatingExpenses", newExp.id, newExp);
      await recordActivity({
        userId: currentUser?.id || "usr_owner",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "create",
        entityType: "operating_expense",
        entityId: newExp.id,
        entityTitle: `Added Expense: ${newExp.title} (${formatPKR(newExp.amount)})`,
        details: `Recorded operating expense under ${newExp.category} paid via ${newExp.paymentMethod}.`,
        snapshotAfter: newExp,
        canUndo: true,
      });
      setIsExpenseModalOpen(false);
      setExpenseTitle("");
      setExpenseAmount("");
      setExpensePaidTo("");
      setExpenseNotes("");
      await loadFinanceData();
    } catch (err: any) {
      alert("Failed to record expense: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingExpense(false);
    }
  };

  const expenseScopeCounts = useMemo(() => {
    return computeDateScopeCounts(
      expenses,
      (e) => e.date || e.createdAt,
      selectedExpenseIds.length
    );
  }, [expenses, selectedExpenseIds.length]);

  const handleToggleSelectExpense = (id: string) => {
    setSelectedExpenseIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllExpenses = () => {
    if (
      selectedExpenseIds.length === filteredData.periodExpenses.length &&
      filteredData.periodExpenses.length > 0
    ) {
      setSelectedExpenseIds([]);
    } else {
      setSelectedExpenseIds(filteredData.periodExpenses.map((e) => e.id));
    }
  };

  const handleExecuteBulkDeleteExpenses = async (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => {
    try {
      setIsDeletingExpense(true);
      const toDelete = getItemsInScope(
        expenses,
        scope,
        (e) => e.date || e.createdAt,
        (e) => e.id,
        selectedExpenseIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        setIsDeletingExpense(false);
        setDeleteExpensesModalOpen(false);
        return;
      }

      const idsToDelete = toDelete.map((e) => e.id);
      await offlineDb.operatingExpenses.bulkDelete(idsToDelete);
      for (const id of idsToDelete) {
        scheduleCloudDelete("operatingExpenses", id);
      }

      await recordActivity({
        userId: currentUser?.id || "usr_owner",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "delete",
        entityType: "operating_expense",
        entityId: idsToDelete.slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} expense(s)`,
        details: `Purged ${toDelete.length} expense record(s) under criteria scope: ${scope}.`,
        snapshotBefore: toDelete,
        canUndo: true,
      });

      setSelectedExpenseIds([]);
      await loadFinanceData();
      setDeleteExpensesModalOpen(false);
    } catch (err: any) {
      console.error("Bulk delete expenses error:", err);
    } finally {
      setIsDeletingExpense(false);
    }
  };

  const handleExecuteSingleDeleteExpense = async () => {
    if (!deletingExpense) return;
    try {
      setIsDeletingExpense(true);
      await offlineDb.operatingExpenses.delete(deletingExpense.id);
      scheduleCloudDelete("operatingExpenses", deletingExpense.id);

      await recordActivity({
        userId: currentUser?.id || "usr_owner",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "delete",
        entityType: "operating_expense",
        entityId: deletingExpense.id,
        entityTitle: deletingExpense.title,
        details: `Deleted operating expense "${deletingExpense.title}" (PKR ${deletingExpense.amount}).`,
        snapshotBefore: deletingExpense,
        canUndo: true,
      });

      setSelectedExpenseIds((prev) => prev.filter((id) => id !== deletingExpense.id));
      await loadFinanceData();
      setDeletingExpense(null);
    } catch (err) {
      console.error("Failed to delete expense:", err);
    } finally {
      setIsDeletingExpense(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 px-3 sm:px-4 md:px-0 pb-28 sm:pb-16 print:max-w-none print:w-full print:m-0 print:p-0 print-page">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-slate-200 dark:border-slate-800 no-print print:hidden">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-lg sm:text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 shrink-0" />
            <span>Profit &amp; Loss Report (Kamai / Munafa)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Audit-grade Net Profit: Gross sales minus customer discounts, product purchase cost, traveling expenses, salaries, and operating overheads.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all btn-interactive"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Expense</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5 shrink-0" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Universal Date Range Filter Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft no-print print:hidden">
        <DateRangeFilterBar
          filter={dateFilter}
          onChange={setDateFilter}
          count={filteredData.periodInvoices.length}
          label="P&L Date Criteria"
        />
      </div>

      {/* Accounting Compliance Banner */}
      <div className="p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1 no-print print:hidden">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <Info className="w-4 h-4 text-teal-600 shrink-0" />
          <span>Accurate Real-Time Accounting Formula:</span>
        </div>
        <p className="text-slate-600 dark:text-slate-400">
          • <strong>Net Sales:</strong> Total bills amount minus invoice discounts given to customers.
        </p>
        <p className="text-slate-600 dark:text-slate-400">
          • <strong>Cost of Goods Sold (COGS):</strong> Exact batch purchase cost of medicines sold to pharmacies.
        </p>
        <p className="text-slate-600 dark:text-slate-400">
          • <strong>Operating Expenses:</strong> Traveling fuel/TA-DA, staff salaries, free samples, and damaged medicines deducted to compute 100% honest Net Profit.
        </p>
      </div>

      {/* Structured P&L Statement Card */}
      <div className="p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-5 sm:space-y-6 text-xs md:text-sm print:border-none print:shadow-none print:p-0 print:space-y-4 print:text-xs">
        {/* Official Branded Print Header (Print Only) */}
        <OfficialPrintHeader
          title="PROFIT & LOSS STATEMENT"
          period={getDateFilterDescription(dateFilter)}
          metaItems={[{ label: "Currency", value: "PKR (Pakistani Rupee)" }]}
          className="mb-2"
        />

        {/* Screen Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-slate-200 dark:border-slate-800 no-print print:hidden">
          <div className="min-w-0">
            <h2 className="font-black text-base sm:text-lg text-slate-900 dark:text-slate-100 tracking-tight">
              Noxderma Pharmaceuticals Ltd.
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Profit &amp; Loss Statement • {getDateFilterDescription(dateFilter)} • Generated: {formatKarachiDate(new Date(), true)}
            </p>
          </div>
          <span className="font-mono text-[11px] sm:text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 w-fit shrink-0 border border-teal-200/60 dark:border-teal-800/60">
            Currency: Pakistani Rupee (PKR ₨)
          </span>
        </div>

        {/* 1. Revenue & Sales */}
        <div className="space-y-2">
          <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] sm:text-xs pb-1 border-b border-slate-100 dark:border-slate-800/60">
            <span>1. Revenue &amp; Sales (Bikri)</span>
            <span className="text-slate-400 font-semibold text-[10px] sm:text-[11px]">Amount</span>
          </div>

          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Total Bills Amount (Gross Sales)
              </span>
              <span className="text-[10px] text-slate-400 block">
                Total retail invoice value before discounts
              </span>
            </div>
            <span className="font-semibold font-mono text-slate-900 dark:text-slate-100 shrink-0 text-right whitespace-nowrap">
              {formatPKR(grossSales)}
            </span>
          </div>

          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-rose-600 dark:text-rose-400 font-medium block">
                Minus: Customer Discounts Given
              </span>
              <span className="text-[10px] text-slate-400 block">
                Allowed across {filteredData.periodInvoices.length} sales invoices
              </span>
            </div>
            <span className="font-semibold font-mono text-rose-600 dark:text-rose-400 shrink-0 text-right whitespace-nowrap">
              -{formatPKR(discountsGiven)}
            </span>
          </div>

          {salesReturns > 0 && (
            <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
              <div className="min-w-0 pr-1">
                <span className="text-rose-600 dark:text-rose-400 font-medium block">
                  Minus: Customer Medicine Returns (Wapis Stock)
                </span>
                <span className="text-[10px] text-slate-400 block">
                  Reversed stock credited back to pharmacies
                </span>
              </div>
              <span className="font-semibold font-mono text-rose-600 dark:text-rose-400 shrink-0 text-right whitespace-nowrap">
                -{formatPKR(salesReturns)}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2.5 pb-1 font-bold pl-1 sm:pl-3 border-t border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <span className="text-slate-900 dark:text-slate-100 block">
                Net Sales Revenue (Asli Bikri)
              </span>
              <span className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold block">
                Actual billed revenue
              </span>
            </div>
            <span className="text-teal-600 dark:text-teal-400 font-mono text-sm sm:text-base font-extrabold shrink-0 text-right whitespace-nowrap">
              {formatPKR(netSales)}
            </span>
          </div>
        </div>

        {/* 2. Cost of Goods Sold */}
        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] sm:text-xs pb-1 border-b border-slate-100 dark:border-slate-800/60">
            <span>2. Purchase Cost of Medicines Sold (COGS)</span>
            <span className="text-slate-400 font-semibold text-[10px] sm:text-[11px]">Amount</span>
          </div>

          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Original Purchase Cost of Sold Medicines
              </span>
              <span className="text-[10px] text-slate-400 block">
                Exact manufacturer batch cost for {filteredData.periodInvoices.length} invoices
              </span>
            </div>
            <span className="font-semibold text-rose-600 dark:text-rose-400 font-mono shrink-0 text-right whitespace-nowrap">
              -{formatPKR(costOfGoodsSold)}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2.5 pb-1 font-bold pl-1 sm:pl-3 border-t border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <span className="text-slate-900 dark:text-slate-100 block">
                Gross Profit (Khaam Munafa)
              </span>
              <span className="text-[10px] text-slate-500 block">
                Gross Margin: <strong className="text-teal-600 dark:text-teal-400">{grossProfitMargin}%</strong>
              </span>
            </div>
            <span className="text-teal-600 dark:text-teal-400 font-bold font-mono text-sm sm:text-base shrink-0 text-right whitespace-nowrap">
              {formatPKR(grossProfit)}
            </span>
          </div>
        </div>

        {/* 3. Operating Expenses */}
        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-[11px] sm:text-xs pb-1 border-b border-slate-100 dark:border-slate-800/60">
            <span>3. Operating Business Expenses (Kul Kharcha)</span>
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 hover:bg-teal-100 text-[11px] font-bold tracking-normal shrink-0 border border-teal-200/80 dark:border-teal-800/80 no-print"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span>Add Expense</span>
            </button>
          </div>

          {/* Traveling & Fuel */}
          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Traveling &amp; Fuel Expenses (Petrol / TA-DA)
              </span>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                <span>Field visits fuel claims</span>
                <span>•</span>
                <Link
                  href="/finance/salaries"
                  className="text-teal-600 dark:text-teal-400 font-bold hover:underline inline-flex items-center"
                >
                  Payroll Fuel &rarr;
                </Link>
              </div>
            </div>
            <span className="text-rose-600 font-medium font-mono shrink-0 text-right whitespace-nowrap">
              -{formatPKR(travelingExpenses)}
            </span>
          </div>

          {/* Staff Salaries */}
          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Staff Salaries &amp; Field Commissions (Tankhwah)
              </span>
              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-wrap mt-0.5">
                <span>
                  Earned month salaries
                  {filteredData.periodSalaries.length > 0 && ` (${filteredData.periodSalaries.length} slips synced)`}
                </span>
                <span>•</span>
                <Link
                  href="/finance/salaries"
                  className="text-teal-600 dark:text-teal-400 font-bold hover:underline inline-flex items-center"
                >
                  Manage Slips &rarr;
                </Link>
              </div>
            </div>
            <span className="text-rose-600 font-medium font-mono shrink-0 text-right whitespace-nowrap">
              -{formatPKR(staffSalaries)}
            </span>
          </div>

          {/* Broken Medicines */}
          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Broken &amp; Damaged Medicines (Nuqsan)
              </span>
              <span className="text-[10px] text-slate-400 block">
                Transit and warehouse damages write-off
              </span>
            </div>
            <span className="text-rose-600 font-medium font-mono shrink-0 text-right whitespace-nowrap">
              -{formatPKR(damagedStockLoss)}
            </span>
          </div>

          {/* Free Samples */}
          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Free Doctor Samples Issued
              </span>
              <span className="text-[10px] text-slate-400 block">
                Promotional stock given to doctors
              </span>
            </div>
            <span className="text-amber-600 font-medium font-mono shrink-0 text-right whitespace-nowrap">
              -{formatPKR(sampleExpense)}
            </span>
          </div>

          {/* Courier Logistics */}
          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Courier &amp; Delivery Logistics (TCS / Trax)
              </span>
              <span className="text-[10px] text-slate-400 block">
                Shipment charges and transport freight
              </span>
            </div>
            <span className="text-slate-600 dark:text-slate-300 font-mono shrink-0 text-right whitespace-nowrap">
              -{formatPKR(courierAndLogistics)}
            </span>
          </div>

          {/* Office Rent & Utilities */}
          <div className="flex items-start justify-between gap-3 py-1 sm:py-1.5 pl-1 sm:pl-3 border-b border-slate-50 dark:border-slate-800/40">
            <div className="min-w-0 pr-1">
              <span className="text-slate-700 dark:text-slate-300 font-medium block">
                Office Rent, Utilities &amp; Other Expenses
              </span>
              <span className="text-[10px] text-slate-400 block">
                Rent, electricity, internet &amp; miscellaneous
              </span>
            </div>
            <span className="text-slate-600 dark:text-slate-300 font-mono shrink-0 text-right whitespace-nowrap">
              -{formatPKR(officeUtilities + marketingExpenses + otherExpenses)}
            </span>
          </div>

          {/* Total Expenses Subtotal */}
          <div className="flex items-center justify-between gap-3 pt-2.5 pb-1 font-bold pl-1 sm:pl-3 border-t border-slate-100 dark:border-slate-800">
            <div className="min-w-0">
              <span className="text-slate-900 dark:text-slate-100 block">
                Total Operating Expenses
              </span>
              <span className="text-[10px] text-slate-500 block">
                All business overheads combined
              </span>
            </div>
            <span className="text-rose-600 font-bold font-mono text-sm sm:text-base shrink-0 text-right whitespace-nowrap">
              -{formatPKR(totalOperatingExpenses)}
            </span>
          </div>
        </div>

        {/* 4. Final Net Profit Card */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border print:border-slate-800 print:bg-slate-50 ${
            netOperatingProfit >= 0
              ? "bg-gradient-to-br from-emerald-50/90 to-teal-50/90 dark:from-emerald-950/40 dark:to-teal-950/40 border-teal-200 dark:border-teal-800"
              : "bg-gradient-to-br from-rose-50/90 to-amber-50/90 dark:from-rose-950/40 dark:to-amber-950/40 border-rose-200 dark:border-rose-800"
          }`}
        >
          <div className="flex flex-col sm:flex-row print:flex-row justify-between items-start sm:items-center print:items-center gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-extrabold uppercase tracking-wider block text-slate-600 dark:text-slate-400 print:text-slate-700">
                Final Net Profit (Asli Kamai / Saaf Munafa)
              </span>
              <h3
                className={`text-xl sm:text-2xl md:text-3xl font-black font-mono mt-1 print:text-black ${
                  netOperatingProfit >= 0
                    ? "text-teal-700 dark:text-teal-300"
                    : "text-rose-700 dark:text-rose-300"
                }`}
              >
                {formatPKR(netOperatingProfit)}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 print:text-slate-700 mt-1 max-w-md">
                Net balance in hand after deducting purchase costs, customer discounts, fuel/traveling, and salaries.
              </p>
            </div>

            <div className="w-full sm:w-auto print:w-auto p-3 rounded-xl bg-white/80 dark:bg-slate-900/80 print:bg-white border border-slate-200/80 dark:border-slate-800 print:border-slate-400 shrink-0 text-left sm:text-right print:text-right shadow-sm print:shadow-none">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-slate-600 block">
                Net Profit Margin
              </span>
              <span
                className={`text-lg sm:text-xl font-black font-mono block mt-0.5 print:text-black ${
                  netOperatingProfit >= 0
                    ? "text-teal-600 dark:text-teal-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {netProfitMargin}%
              </span>
              <span className="text-[10px] text-slate-500 print:text-slate-700 block">
                {netOperatingProfit >= 0 ? "Healthy business return" : "Operating at net loss"}
              </span>
            </div>
          </div>
        </div>

        {/* Print Sign-Offs */}
        <div className="hidden print:grid grid-cols-3 gap-6 pt-8 mt-6 border-t border-slate-300 text-center text-[10px]">
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Prepared By</p>
            <p className="text-slate-500">Accounts Officer</p>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Audited By</p>
            <p className="text-slate-500">Internal Audit</p>
          </div>
          <div>
            <div className="border-b border-slate-400 pb-8 mb-1"></div>
            <p className="font-bold text-black">Approved By</p>
            <p className="text-slate-500">Chief Executive Officer</p>
          </div>
        </div>
      </div>

      {/* Recorded Operating Expenses Table & Mobile Cards */}
      <div className="p-4 sm:p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 no-print print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-teal-600 shrink-0" />
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
              Recorded Operating Expenses ({filteredData.periodExpenses.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedExpenseIds.length > 0 && (
              <button
                type="button"
                onClick={() => setDeleteExpensesModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm btn-interactive"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Selected ({selectedExpenseIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setDeleteExpensesModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold btn-interactive"
              title="Delete with scope criteria"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete / Purge</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm btn-interactive"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Expense</span>
            </button>
          </div>
        </div>

        {filteredData.periodExpenses.length === 0 ? (
          <div className="p-6 sm:p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl space-y-1">
            <p className="font-semibold text-slate-600 dark:text-slate-400">
              No operating expenses recorded yet for this period.
            </p>
            <p>
              Click <strong>&quot;Add Expense&quot;</strong> to record Traveling/Fuel, Staff Salaries, or Utility bills so your net profit margin remains 100% accurate.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (Hidden on mobile) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="w-10 p-2.5">
                      <input
                        type="checkbox"
                        checked={
                          selectedExpenseIds.length === filteredData.periodExpenses.length &&
                          filteredData.periodExpenses.length > 0
                        }
                        onChange={handleToggleSelectAllExpenses}
                        className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        title="Select All"
                      />
                    </th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Title / Description</th>
                    <th className="p-2.5">Paid To / Method</th>
                    <th className="p-2.5 text-right">Amount</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredData.periodExpenses.map((exp) => {
                    const isSelected = selectedExpenseIds.includes(exp.id);
                    return (
                      <tr
                        key={exp.id}
                        className={`transition-colors ${
                          isSelected
                            ? "bg-teal-50/40 dark:bg-teal-950/30"
                            : "hover:bg-slate-50/50 dark:hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="w-10 p-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectExpense(exp.id)}
                            className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                        </td>
                        <td className="p-2.5 font-mono whitespace-nowrap text-slate-600 dark:text-slate-400">
                          {formatKarachiDate(exp.date)}
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {exp.category.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="p-2.5 font-semibold text-slate-800 dark:text-slate-200">
                          {exp.title}
                        </td>
                        <td className="p-2.5 text-slate-500">
                          {exp.paidTo || "—"} ({exp.paymentMethod})
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-rose-600">
                          {formatPKR(exp.amount)}
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => setDeletingExpense(exp)}
                            className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Delete expense"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Feed View (No Horizontal Scroll) */}
            <div className="md:hidden space-y-2.5">
              {filteredData.periodExpenses.length > 0 && (
                <div className="flex items-center justify-between p-2.5 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  <label className="flex items-center gap-2 font-bold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={
                        selectedExpenseIds.length === filteredData.periodExpenses.length &&
                        filteredData.periodExpenses.length > 0
                      }
                      onChange={handleToggleSelectAllExpenses}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span>Select All ({filteredData.periodExpenses.length})</span>
                  </label>
                  {selectedExpenseIds.length > 0 && (
                    <span className="font-semibold text-rose-600">
                      {selectedExpenseIds.length} selected
                    </span>
                  )}
                </div>
              )}

              {filteredData.periodExpenses.map((exp) => {
                const isSelected = selectedExpenseIds.includes(exp.id);
                return (
                  <div
                    key={exp.id}
                    className={`p-3 rounded-xl border transition-all ${
                      isSelected
                        ? "border-teal-500/60 bg-teal-50/20 dark:bg-teal-950/20"
                        : "border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30"
                    } flex items-start justify-between gap-3`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectExpense(exp.id)}
                        className="w-4 h-4 mt-1 rounded border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                            {exp.category.replace(/_/g, " ")}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {formatKarachiDate(exp.date)}
                          </span>
                        </div>
                        <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                          {exp.title}
                        </div>
                        {(exp.paidTo || exp.paymentMethod) && (
                          <div className="text-[10px] text-slate-500">
                            Paid to: {exp.paidTo || "—"} • {exp.paymentMethod}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right space-y-2">
                      <div className="font-mono font-extrabold text-sm text-rose-600 whitespace-nowrap">
                        {formatPKR(exp.amount)}
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeletingExpense(exp)}
                        className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950 text-rose-600 hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors inline-flex"
                        title="Delete expense"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add Operating Expense Modal */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                    Record Operating Expense
                  </h3>
                  <p className="text-xs text-slate-500">
                    Deduct fuel, salaries, or office bills from business profit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="space-y-3.5 text-xs">
              {/* Category */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Expense Category *
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Expense Title / Purpose *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Lahore market visit fuel - Ali"
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Amount (PKR ₨) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 2500"
                    value={expenseAmount}
                    onChange={(e) =>
                      setExpenseAmount(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Paid To & Payment Method */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Paid To / Staff Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Ali (Medical Rep)"
                    value={expensePaidTo}
                    onChange={(e) => setExpensePaidTo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Payment Method
                  </label>
                  <select
                    value={expensePaymentMethod}
                    onChange={(e) => setExpensePaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="cash">Cash (Naqd)</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online / EasyPaisa / JazzCash</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingExpense}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold shadow-sm btn-interactive disabled:opacity-50"
                >
                  {isSavingExpense ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Delete Operating Expenses Modal */}
      <BulkDeleteModal
        isOpen={deleteExpensesModalOpen}
        onClose={() => setDeleteExpensesModalOpen(false)}
        entityName="Operating Expenses"
        selectedCount={selectedExpenseIds.length}
        totalCount={expenses.length}
        countsByScope={expenseScopeCounts}
        onConfirmDelete={handleExecuteBulkDeleteExpenses}
        isDeleting={isDeletingExpense}
      />

      {/* Single Delete Operating Expense Modal */}
      <SingleDeleteModal
        isOpen={!!deletingExpense}
        onClose={() => setDeletingExpense(null)}
        itemName={`${deletingExpense?.title || ""} (${formatPKR(deletingExpense?.amount || 0)})`}
        title="Delete Operating Expense"
        onConfirm={handleExecuteSingleDeleteExpense}
        isDeleting={isDeletingExpense}
      />
    </div>
  );
}
