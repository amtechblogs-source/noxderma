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
import { useAuth } from "@/context/AuthContext";
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
  const [period, setPeriod] = useState<"this_month" | "last_month" | "all">("all");
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

  // Filter invoices & expenses by period
  const filteredData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const isMatch = (dateStr?: string) => {
      if (period === "all" || !dateStr) return true;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return true;

      if (period === "this_month") {
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
      }
      if (period === "last_month") {
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        return d.getFullYear() === lastMonthYear && d.getMonth() === lastMonth;
      }
      return true;
    };

    const periodInvoices = invoices.filter((i) => isMatch(i.invoiceDate || i.createdAt));
    const periodExpenses = expenses.filter((e) => isMatch(e.date || e.createdAt));
    const periodMovements = movements.filter((m) => isMatch(m.timestamp));
    const periodSalaries = salaryRecords.filter((s) => {
      if (s.status !== "paid") return false;
      return isMatch(s.disbursedAt || `${s.month}-15` || s.createdAt);
    });

    return { periodInvoices, periodExpenses, periodMovements, periodSalaries };
  }, [invoices, expenses, movements, salaryRecords, period]);

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

  // Handle deleting an expense
  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Are you sure you want to remove this expense record?")) return;
    try {
      await offlineDb.operatingExpenses.delete(id);
      await loadFinanceData();
    } catch (err) {
      console.error("Failed to delete expense:", err);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20 print:max-w-none print:w-full print:m-0 print:p-0">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800 no-print print:hidden">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-teal-600" />
            Profit & Loss Report (Kamai / Munafa)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Audit-grade Net Profit: Gross sales minus customer discounts, product purchase cost, traveling expenses, salaries, and operating overheads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-sm"
          >
            <option value="all">All Time (YTD)</option>
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
          </select>

          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition-all btn-interactive"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-sm transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
        </div>
      </div>

      {/* Accounting Compliance Banner */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 text-xs space-y-1 no-print print:hidden">
        <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
          <Info className="w-4 h-4 text-teal-600" />
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
      <div className="p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-6 text-xs md:text-sm print:border-none print:shadow-none print:p-0 print:space-y-4 print:text-xs">
        <div className="flex justify-between items-center pb-4 border-b border-slate-200 dark:border-slate-800 print:border-slate-900">
          <div>
            <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 print:text-black">
              Noxderma Pharmaceuticals Ltd.
            </h2>
            <p className="text-xs text-slate-500 print:text-slate-600">
              Profit &amp; Loss Statement • {period === "this_month" ? "This Month" : period === "last_month" ? "Last Month" : "All Time"} • Generated: {formatKarachiDate(new Date(), true)}
            </p>
          </div>
          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 print:bg-slate-100 print:text-black print:border print:border-slate-300">
            Currency: Pakistani Rupee (PKR ₨)
          </span>
        </div>

        {/* 1. Revenue & Sales */}
        <div className="space-y-2">
          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-xs">
            <span>1. Revenue &amp; Sales (Bikri)</span>
            <span>Amount</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Total Bills Amount (Gross Sales)</span>
            <span className="font-medium font-mono">{formatPKR(grossSales)}</span>
          </div>

          <div className="flex justify-between text-rose-600 pl-3">
            <span>Minus: Customer Discounts Given ({filteredData.periodInvoices.length} bills)</span>
            <span className="font-mono">-{formatPKR(discountsGiven)}</span>
          </div>

          {salesReturns > 0 && (
            <div className="flex justify-between text-rose-600 pl-3">
              <span>Minus: Customer Medicine Returns (Wapis Stock)</span>
              <span className="font-mono">-{formatPKR(salesReturns)}</span>
            </div>
          )}

          <div className="flex justify-between font-extrabold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>Net Sales Revenue (Asli Bikri)</span>
            <span className="text-teal-600 font-mono text-sm">{formatPKR(netSales)}</span>
          </div>
        </div>

        {/* 2. Cost of Goods Sold */}
        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-xs">
            <span>2. Purchase Cost of Medicines Sold (COGS)</span>
            <span>Amount</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>
              Original Purchase Cost of Sold Medicines ({filteredData.periodInvoices.length} invoices)
            </span>
            <span className="font-semibold text-rose-600 font-mono">-{formatPKR(costOfGoodsSold)}</span>
          </div>

          <div className="flex justify-between font-extrabold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span>Gross Profit (Khaam Munafa)</span>
            <span className="text-teal-600 font-bold font-mono">
              {formatPKR(grossProfit)}{" "}
              <span className="text-xs text-slate-500 font-normal">({grossProfitMargin}%)</span>
            </span>
          </div>
        </div>

        {/* 3. Operating Expenses */}
        <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-center font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider text-xs">
            <span>3. Operating Business Expenses (Kul Kharcha)</span>
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="text-[11px] font-bold text-teal-600 hover:underline normal-case no-print flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Add Expense
            </button>
          </div>

          <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 pl-3">
            <span className="flex items-center gap-2">
              <span>Traveling &amp; Fuel Expenses (Petrol / Reps TA/DA)</span>
              <Link
                href="/finance/salaries"
                className="text-[10px] text-teal-600 dark:text-teal-400 font-bold hover:underline inline-flex items-center"
              >
                (Payroll &rarr;)
              </Link>
            </span>
            <span className="text-rose-600 font-medium font-mono">-{formatPKR(travelingExpenses)}</span>
          </div>

          <div className="flex justify-between items-center text-slate-600 dark:text-slate-300 pl-3">
            <span className="flex items-center gap-2">
              <span>Staff Salaries &amp; Field Commissions (Tankhwah)</span>
              <Link
                href="/finance/salaries"
                className="text-[10px] text-teal-600 dark:text-teal-400 font-bold hover:underline inline-flex items-center"
              >
                (Payroll Slips &rarr;)
              </Link>
            </span>
            <span className="text-rose-600 font-medium font-mono">-{formatPKR(staffSalaries)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Broken &amp; Damaged Medicines (Nuqsan)</span>
            <span className="text-rose-600 font-medium font-mono">-{formatPKR(damagedStockLoss)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Free Doctor Samples Issued</span>
            <span className="text-amber-600 font-medium font-mono">-{formatPKR(sampleExpense)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Courier &amp; Delivery Logistics (TCS / Trax)</span>
            <span className="text-slate-600 dark:text-slate-300 font-mono">-{formatPKR(courierAndLogistics)}</span>
          </div>

          <div className="flex justify-between text-slate-600 dark:text-slate-300 pl-3">
            <span>Office Rent, Utilities &amp; Other Expenses</span>
            <span className="text-slate-600 dark:text-slate-300 font-mono">
              -{formatPKR(officeUtilities + marketingExpenses + otherExpenses)}
            </span>
          </div>

          <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 pt-1.5 border-t border-slate-100 dark:border-slate-800">
            <span>Total Operating Expenses</span>
            <span className="text-rose-600 font-bold font-mono">-{formatPKR(totalOperatingExpenses)}</span>
          </div>
        </div>

        {/* 4. Final Net Profit */}
        <div
          className={`p-4 rounded-xl border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 ${
            netOperatingProfit >= 0
              ? "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-200"
              : "bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200"
          }`}
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider block">
              Final Net Profit (Asli Kamai / Saaf Munafa)
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              Net balance in hand after deducting purchase costs, customer discounts, fuel/traveling, and salaries.
            </p>
          </div>
          <div className="text-left sm:text-right">
            <span className="text-xl md:text-2xl font-extrabold font-mono block">
              {formatPKR(netOperatingProfit)}
            </span>
            <span
              className={`block text-xs font-bold mt-0.5 ${
                netOperatingProfit >= 0 ? "text-teal-700 dark:text-teal-300" : "text-rose-700 dark:text-rose-300"
              }`}
            >
              Net Profit Margin: {netProfitMargin}%
            </span>
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

      {/* Recorded Operating Expenses Table */}
      <div className="p-5 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 no-print">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-teal-600" />
            <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100">
              Recorded Operating Expenses ({filteredData.periodExpenses.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setIsExpenseModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm btn-interactive"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Expense</span>
          </button>
        </div>

        {filteredData.periodExpenses.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl space-y-1">
            <p className="font-semibold text-slate-600 dark:text-slate-400">
              No operating expenses recorded yet for this period.
            </p>
            <p>
              Click <strong>&quot;Add Expense&quot;</strong> to record Traveling/Fuel, Staff Salaries, or Utility bills so your net profit margin remains 100% accurate.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5">Title / Description</th>
                  <th className="p-2.5">Paid To / Method</th>
                  <th className="p-2.5 text-right">Amount</th>
                  <th className="p-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredData.periodExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
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
                        onClick={() => handleDeleteExpense(exp.id)}
                        className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-600 transition-colors"
                        title="Delete expense"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </div>
  );
}
