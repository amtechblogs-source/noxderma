"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
  Banknote,
  Plus,
  Search,
  Filter,
  Printer,
  Calendar,
  CheckCircle2,
  Clock,
  User,
  Shield,
  Trash2,
  Edit2,
  CreditCard,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Fuel,
  Sparkles,
  Award,
  AlertCircle,
  FileText,
  X,
  Check,
  Building2,
  Send,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { StaffSalary, UserProfile, SalaryPaymentStatus } from "@/types";
import { getUserRoleLabel, normalizeUserDisplayName } from "@/types/auth";
import { recordActivity } from "@/lib/audit/auditTracker";

function numberToWordsPKR(num: number): string {
  if (!num || num === 0) return "Zero Rupees Only";
  const a = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  function inWords(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + inWords(n % 10000000) : "");
  }

  const rounded = Math.round(num);
  return `${inWords(rounded).trim()} Rupees Only`;
}

export default function StaffSalariesPage() {
  const { currentUser, hasPermission } = useAuth();
  const [salaries, setSalaries] = useState<StaffSalary[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  // Month selector
  const currentMonthKey = new Date().toISOString().slice(0, 7); // e.g. "2026-10"
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "paid">("all");

  // Notifications
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState<StaffSalary | null>(null);
  const [slipSalary, setSlipSalary] = useState<StaffSalary | null>(null);
  const [bulkDisburseModalOpen, setBulkDisburseModalOpen] = useState(false);

  // Form State
  const [formStaffId, setFormStaffId] = useState("");
  const [formStaffName, setFormStaffName] = useState("");
  const [formStaffRole, setFormStaffRole] = useState("");
  const [formStaffPhone, setFormStaffPhone] = useState("");
  const [formMonth, setFormMonth] = useState(currentMonthKey);
  const [formBaseSalary, setFormBaseSalary] = useState<number | "">(40000);
  const [formBonus, setFormBonus] = useState<number | "">(0);
  const [formBonusReason, setFormBonusReason] = useState("");
  const [formFuelAllowance, setFormFuelAllowance] = useState<number | "">(5000);
  const [formOtherAllowances, setFormOtherAllowances] = useState<number | "">(0);
  const [formDeductions, setFormDeductions] = useState<number | "">(0);
  const [formDeductionReason, setFormDeductionReason] = useState("");
  const [formPaymentMethod, setFormPaymentMethod] = useState<"cash" | "bank_transfer" | "cheque" | "online">("cash");
  const [formPaymentRef, setFormPaymentRef] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formDisburseNow, setFormDisburseNow] = useState(false);

  // Access restriction
  const isOwnerOrAccountant =
    currentUser?.role === "owner" ||
    currentUser?.role === "admin" ||
    currentUser?.role === "accountant" ||
    hasPermission("finance:pnl") ||
    hasPermission("finance:payments");

  const loadData = async () => {
    setLoading(true);
    try {
      const [salList, userList] = await Promise.all([
        offlineDb.staffSalaries.toArray(),
        (offlineDb as any).users?.toArray() || [],
      ]);

      setSalaries(salList || []);
      setStaffUsers(userList || []);
    } catch (err) {
      console.error("Failed to load staff salaries:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleSync = () => loadData();
    window.addEventListener("noxderma-cloud-synced", handleSync);
    return () => window.removeEventListener("noxderma-cloud-synced", handleSync);
  }, []);

  // Filtered Salaries
  const filteredSalaries = useMemo(() => {
    return salaries.filter((sal) => {
      const matchesMonth = selectedMonth === "all" || sal.month === selectedMonth;
      const matchesStatus = statusFilter === "all" || sal.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        sal.staffName.toLowerCase().includes(q) ||
        sal.staffRole.toLowerCase().includes(q) ||
        (sal.phone && sal.phone.toLowerCase().includes(q)) ||
        (sal.notes && sal.notes.toLowerCase().includes(q));

      return matchesMonth && matchesStatus && matchesSearch;
    });
  }, [salaries, selectedMonth, statusFilter, search]);

  // Aggregate KPI metrics for the selected month
  const monthSalaries = useMemo(() => {
    return selectedMonth === "all"
      ? salaries
      : salaries.filter((s) => s.month === selectedMonth);
  }, [salaries, selectedMonth]);

  const kpis = useMemo(() => {
    const totalPayroll = monthSalaries.reduce((sum, s) => sum + (s.netSalary || 0), 0);
    const disbursedAmount = monthSalaries
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + (s.netSalary || 0), 0);
    const pendingAmount = monthSalaries
      .filter((s) => s.status === "pending")
      .reduce((sum, s) => sum + (s.netSalary || 0), 0);
    const totalFuel = monthSalaries.reduce((sum, s) => sum + (s.fuelAllowance || 0), 0);
    const totalBonuses = monthSalaries.reduce((sum, s) => sum + (s.bonus || 0), 0);
    const totalDeductions = monthSalaries.reduce((sum, s) => sum + (s.deductions || 0), 0);

    const pendingCount = monthSalaries.filter((s) => s.status === "pending").length;
    const paidCount = monthSalaries.filter((s) => s.status === "paid").length;

    return {
      totalPayroll,
      disbursedAmount,
      pendingAmount,
      totalFuel,
      totalBonuses,
      totalDeductions,
      pendingCount,
      paidCount,
      totalCount: monthSalaries.length,
    };
  }, [monthSalaries]);

  // Handle staff dropdown selection in Create Modal
  const handleSelectStaff = (staffId: string) => {
    setFormStaffId(staffId);
    const user = staffUsers.find((u) => u.id === staffId);
    if (user) {
      setFormStaffName(normalizeUserDisplayName(user.displayName, "Staff Member"));
      setFormStaffRole(getUserRoleLabel(user.role));
      setFormStaffPhone(user.phone || "");
    }
  };

  // Open Create / Edit Modal
  const handleOpenCreateModal = (sal?: StaffSalary) => {
    if (sal) {
      setEditingSalary(sal);
      setFormStaffId(sal.staffId);
      setFormStaffName(sal.staffName);
      setFormStaffRole(sal.staffRole);
      setFormStaffPhone(sal.phone || "");
      setFormMonth(sal.month);
      setFormBaseSalary(sal.baseSalary);
      setFormBonus(sal.bonus);
      setFormBonusReason(sal.bonusReason || "");
      setFormFuelAllowance(sal.fuelAllowance);
      setFormOtherAllowances(sal.otherAllowances);
      setFormDeductions(sal.deductions);
      setFormDeductionReason(sal.deductionReason || "");
      setFormPaymentMethod(sal.paymentMethod);
      setFormPaymentRef(sal.paymentReference || "");
      setFormNotes(sal.notes || "");
      setFormDisburseNow(sal.status === "paid");
    } else {
      setEditingSalary(null);
      setFormStaffId(staffUsers[0]?.id || "");
      setFormStaffName(normalizeUserDisplayName(staffUsers[0]?.displayName, "Staff Member"));
      setFormStaffRole(getUserRoleLabel(staffUsers[0]?.role || "sales_rep"));
      setFormStaffPhone(staffUsers[0]?.phone || "");
      setFormMonth(selectedMonth === "all" ? currentMonthKey : selectedMonth);
      setFormBaseSalary(40000);
      setFormBonus(0);
      setFormBonusReason("");
      setFormFuelAllowance(5000);
      setFormOtherAllowances(0);
      setFormDeductions(0);
      setFormDeductionReason("");
      setFormPaymentMethod("cash");
      setFormPaymentRef("");
      setFormNotes("");
      setFormDisburseNow(false);
    }
    setIsCreateModalOpen(true);
  };

  // Save salary record
  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStaffName.trim()) {
      setNotice({ type: "error", text: "Please enter staff member name" });
      return;
    }

    const base = Number(formBaseSalary) || 0;
    const bonus = Number(formBonus) || 0;
    const fuel = Number(formFuelAllowance) || 0;
    const other = Number(formOtherAllowances) || 0;
    const deduct = Number(formDeductions) || 0;
    const net = Math.max(0, base + bonus + fuel + other - deduct);

    const now = new Date();
    const monthDate = new Date(`${formMonth}-01`);
    const monthLabel = isNaN(monthDate.getTime())
      ? formMonth
      : monthDate.toLocaleString("en-PK", { month: "long", year: "numeric" });

    const status: SalaryPaymentStatus = formDisburseNow ? "paid" : "pending";
    const disbursedAt = formDisburseNow
      ? editingSalary?.disbursedAt || now.toISOString()
      : undefined;

    const salaryRecord: StaffSalary = {
      id: editingSalary ? editingSalary.id : `sal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      staffId: formStaffId || `usr_${Date.now()}`,
      staffName: formStaffName.trim(),
      staffRole: formStaffRole.trim() || "Staff Member",
      phone: formStaffPhone.trim() || undefined,
      month: formMonth,
      monthLabel,
      baseSalary: base,
      bonus,
      bonusReason: formBonusReason.trim() || undefined,
      fuelAllowance: fuel,
      otherAllowances: other,
      deductions: deduct,
      deductionReason: formDeductionReason.trim() || undefined,
      netSalary: net,
      status,
      disbursedAt,
      disbursedByUserId: formDisburseNow ? currentUser?.id || "usr_admin" : undefined,
      disbursedByUserName: formDisburseNow ? currentUser?.displayName || "Owner" : undefined,
      paymentMethod: formPaymentMethod,
      paymentReference: formPaymentRef.trim() || undefined,
      notes: formNotes.trim() || undefined,
      createdAt: editingSalary ? editingSalary.createdAt : now.toISOString(),
      updatedAt: now.toISOString(),
    };

    try {
      await offlineDb.staffSalaries.put(salaryRecord);

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: editingSalary ? "update" : "create",
        entityType: "salary",
        entityId: salaryRecord.id,
        entityTitle: `${salaryRecord.staffName} (${salaryRecord.monthLabel})`,
        details: `${editingSalary ? "Updated" : "Created"} salary slip for ${salaryRecord.staffName} (${salaryRecord.monthLabel}): Net PKR ${salaryRecord.netSalary.toLocaleString()} [Status: ${salaryRecord.status.toUpperCase()}]`,
        snapshotAfter: salaryRecord,
      });

      setIsCreateModalOpen(false);
      setEditingSalary(null);
      setNotice({
        type: "success",
        text: `Salary record for ${salaryRecord.staffName} saved successfully!`,
      });
      await loadData();
    } catch (err: any) {
      console.error("Save salary error:", err);
      setNotice({ type: "error", text: "Failed to save salary: " + err.message });
    }
  };

  // One-click individual disbursement
  const handleDisburseSingle = async (sal: StaffSalary) => {
    const now = new Date();
    const updated: StaffSalary = {
      ...sal,
      status: "paid",
      disbursedAt: now.toISOString(),
      disbursedByUserId: currentUser?.id || "usr_admin",
      disbursedByUserName: currentUser?.displayName || "Owner",
      updatedAt: now.toISOString(),
    };

    try {
      await offlineDb.staffSalaries.put(updated);

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "update",
        entityType: "salary",
        entityId: sal.id,
        entityTitle: `Disbursed Salary - ${sal.staffName}`,
        details: `Disbursed PKR ${sal.netSalary.toLocaleString()} to ${sal.staffName} for ${sal.monthLabel} via ${sal.paymentMethod.toUpperCase()}`,
        snapshotAfter: updated,
      });

      setNotice({
        type: "success",
        text: `Salary of PKR ${sal.netSalary.toLocaleString()} disbursed to ${sal.staffName}!`,
      });
      await loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: "Disbursement error: " + err.message });
    }
  };

  // One-click bulk disbursement of all pending salaries in current month
  const handleExecuteBulkDisburse = async () => {
    const pendingList = monthSalaries.filter((s) => s.status === "pending");
    if (pendingList.length === 0) return;

    const now = new Date();
    try {
      for (const sal of pendingList) {
        const updated: StaffSalary = {
          ...sal,
          status: "paid",
          disbursedAt: now.toISOString(),
          disbursedByUserId: currentUser?.id || "usr_admin",
          disbursedByUserName: currentUser?.displayName || "Owner",
          updatedAt: now.toISOString(),
        };
        await offlineDb.staffSalaries.put(updated);
      }

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "update",
        entityType: "salary",
        entityId: `bulk_sal_${Date.now()}`,
        entityTitle: `Bulk Salary Disbursement (${selectedMonth})`,
        details: `One-Click Bulk Disbursed ${pendingList.length} staff salaries totaling PKR ${kpis.pendingAmount.toLocaleString()} for ${selectedMonth}`,
      });

      setBulkDisburseModalOpen(false);
      setNotice({
        type: "success",
        text: `Successfully disbursed ${pendingList.length} staff salaries totaling PKR ${kpis.pendingAmount.toLocaleString()}!`,
      });
      await loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: "Bulk disbursement error: " + err.message });
    }
  };

  // Auto-generate month payroll drafts from existing active staff users
  const handleAutoGeneratePayroll = async () => {
    if (staffUsers.length === 0) {
      setNotice({
        type: "error",
        text: "No staff users found in the system. Add users in User Management first.",
      });
      return;
    }

    const monthToUse = selectedMonth === "all" ? currentMonthKey : selectedMonth;
    const existingMonthSalaries = salaries.filter((s) => s.month === monthToUse);
    const existingStaffIds = new Set(existingMonthSalaries.map((s) => s.staffId));

    const missingStaff = staffUsers.filter(
      (u) => !existingStaffIds.has(u.id) && u.role !== "owner" && u.active !== false
    );

    if (missingStaff.length === 0) {
      setNotice({
        type: "error",
        text: `All active staff already have salary records for ${monthToUse}.`,
      });
      return;
    }

    const now = new Date();
    const monthDate = new Date(`${monthToUse}-01`);
    const monthLabel = isNaN(monthDate.getTime())
      ? monthToUse
      : monthDate.toLocaleString("en-PK", { month: "long", year: "numeric" });

    try {
      for (const staff of missingStaff) {
        const base = staff.role === "booking_user" || staff.role === "sales_rep" ? 40000 : 35000;
        const fuel = staff.role === "booking_user" || staff.role === "sales_rep" ? 6000 : 0;
        const net = base + fuel;

        const record: StaffSalary = {
          id: `sal_${Date.now()}_${staff.id}`,
          staffId: staff.id,
          staffName: normalizeUserDisplayName(staff.displayName, "Staff Member"),
          staffRole: getUserRoleLabel(staff.role),
          phone: staff.phone,
          month: monthToUse,
          monthLabel,
          baseSalary: base,
          bonus: 0,
          fuelAllowance: fuel,
          otherAllowances: 0,
          deductions: 0,
          netSalary: net,
          status: "pending",
          paymentMethod: "cash",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        await offlineDb.staffSalaries.put(record);
      }

      setNotice({
        type: "success",
        text: `Auto-generated ${missingStaff.length} salary drafts for ${monthLabel}!`,
      });
      await loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: "Auto-generate error: " + err.message });
    }
  };

  // Delete salary
  const handleDeleteSalary = async (sal: StaffSalary) => {
    if (!window.confirm(`Are you sure you want to delete the salary record for ${sal.staffName} (${sal.monthLabel})?`)) {
      return;
    }
    try {
      await offlineDb.staffSalaries.delete(sal.id);

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "delete",
        entityType: "salary",
        entityId: sal.id,
        entityTitle: `Deleted Salary - ${sal.staffName}`,
        details: `Deleted salary record for ${sal.staffName} (${sal.monthLabel}) of PKR ${sal.netSalary.toLocaleString()}`,
      });

      setNotice({ type: "success", text: `Salary record deleted.` });
      await loadData();
    } catch (err: any) {
      setNotice({ type: "error", text: "Delete error: " + err.message });
    }
  };

  // Non-authorized view
  if (!isOwnerOrAccountant) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto">
          <Shield className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">
          Owner &amp; Finance Access Only
        </h1>
        <p className="text-xs text-slate-500">
          Staff Salaries and Payroll management is confidential and restricted to the Business Owner and authorized Finance Officers.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      {/* Official Print-Only Sheet Header (When printing entire list) */}
      <div className="hidden print:block border-b-2 border-black pb-3 mb-4">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-xl font-black tracking-tight text-black uppercase">
              NOXDERMA PHARMACEUTICALS
            </h1>
            <p className="text-[11px] text-slate-700 font-semibold">
              Monthly Staff Payroll &amp; Salary Disbursement Ledger
            </p>
          </div>
          <div className="text-right text-[10px] text-slate-700">
            <p><strong>Month:</strong> {selectedMonth === "all" ? "All Time" : selectedMonth}</p>
            <p><strong>Printed:</strong> {formatKarachiDate(new Date(), true)}</p>
            <p><strong>Prepared By:</strong> {currentUser?.displayName || "Owner"}</p>
          </div>
        </div>
      </div>

      {/* Screen Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              Finance &amp; Payroll
            </span>
            <span className="text-xs text-slate-400">Monthly Compensation Ledger</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Banknote className="w-6 h-6 text-teal-600 shrink-0" />
            <span>Staff Salaries &amp; Payroll</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage base pay, fuel allowance, performance bonuses, deductions, and execute one-click disbursements that sync directly into Profit &amp; Loss.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/finance/pnl"
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors"
          >
            <TrendingUp className="w-3.5 h-3.5 text-teal-600" />
            <span>View P&amp;L Sync</span>
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>Print Sheet</span>
          </button>

          <button
            type="button"
            onClick={handleAutoGeneratePayroll}
            className="px-3 py-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/40 hover:bg-teal-100 text-teal-800 dark:text-teal-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
            title="Auto-create pending salary drafts for all active staff for this month"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            <span>Auto-Draft Month</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenCreateModal()}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all btn-interactive"
          >
            <Plus className="w-4 h-4" />
            <span>New Salary Record</span>
          </button>
        </div>
      </div>

      {/* Floating Notice */}
      {notice && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 animate-in fade-in ${
            notice.type === "success"
              ? "bg-teal-50 dark:bg-teal-950/70 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200"
              : "bg-rose-50 dark:bg-rose-950/70 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="p-1 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 no-print">
        {/* Card 1: Total Net Payroll */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Total Payroll</span>
            <DollarSign className="w-4 h-4 text-teal-600" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(kpis.totalPayroll)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            {kpis.totalCount} Salary Slips ({selectedMonth === "all" ? "All Time" : selectedMonth})
          </span>
        </div>

        {/* Card 2: Disbursed / Paid */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Disbursed (Paid)</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-600">
            {formatPKR(kpis.disbursedAmount)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            {kpis.paidCount} Staff Paid &bull; Synced in P&amp;L
          </span>
        </div>

        {/* Card 3: Pending Disbursement */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Pending Payout</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-600">
            {formatPKR(kpis.pendingAmount)}
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-slate-500">
              {kpis.pendingCount} Pending Slips
            </span>
            {kpis.pendingCount > 0 && (
              <button
                type="button"
                onClick={() => setBulkDisburseModalOpen(true)}
                className="text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <Zap className="w-3 h-3" />
                <span>Disburse All</span>
              </button>
            )}
          </div>
        </div>

        {/* Card 4: Fuel & TA Allowances */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft">
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider">Fuel &amp; Travel</span>
            <Fuel className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-2xl font-black font-mono text-blue-600">
            {formatPKR(kpis.totalFuel)}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5 block">
            TA-DA fuel expense for field force
          </span>
        </div>
      </div>

      {/* Month & Filter Controls Bar */}
      <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-3 no-print">
        {/* Month Selector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 mr-1 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-teal-600" /> Month:
          </span>

          <button
            type="button"
            onClick={() => setSelectedMonth(currentMonthKey)}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
              selectedMonth === currentMonthKey
                ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            This Month ({currentMonthKey})
          </button>

          {/* Past Months */}
          {[-1, -2].map((offset) => {
            const d = new Date();
            d.setMonth(d.getMonth() + offset);
            const mKey = d.toISOString().slice(0, 7);
            const label = d.toLocaleString("en-PK", { month: "short", year: "numeric" });
            return (
              <button
                key={mKey}
                type="button"
                onClick={() => setSelectedMonth(mKey)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
                  selectedMonth === mKey
                    ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                {label}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setSelectedMonth("all")}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
              selectedMonth === "all"
                ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            All Months
          </button>

          {/* Bulk Disburse CTA */}
          {kpis.pendingCount > 0 && (
            <button
              type="button"
              onClick={() => setBulkDisburseModalOpen(true)}
              className="ml-auto px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-sm transition-all shrink-0"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>One-Click Disburse ({kpis.pendingCount} Pending)</span>
            </button>
          )}
        </div>

        {/* Search & Status Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 text-xs">
          <div className="relative min-w-0 sm:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search staff name, role, phone or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="min-w-0">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Payment Statuses</option>
              <option value="pending">Pending Disbursement ({kpis.pendingCount})</option>
              <option value="paid">Disbursed / Paid ({kpis.paidCount})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Records Container */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="font-bold text-xs">Loading payroll ledger...</p>
          </div>
        ) : filteredSalaries.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Banknote className="w-12 h-12 mx-auto opacity-30 text-teal-600" />
            <p className="font-bold text-sm text-slate-700 dark:text-slate-300">
              No salary slips found for this period
            </p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Click &quot;Auto-Draft Month&quot; to generate draft slips for all active staff, or click &quot;New Salary Record&quot; to enter manually.
            </p>
          </div>
        ) : (
          <>
            {/* 1. Mobile Feed (Vertical Cards, 0 Horizontal Scroll) */}
            <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800 print:hidden">
              {filteredSalaries.map((sal) => {
                const isPaid = sal.status === "paid";
                return (
                  <div key={sal.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-black text-xs flex items-center justify-center shrink-0">
                          {sal.staffName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                            {sal.staffName}
                          </h3>
                          <span className="text-[10px] text-slate-400 block">
                            {sal.staffRole} &bull; {sal.monthLabel}
                          </span>
                        </div>
                      </div>

                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          <Check className="w-3 h-3" />
                          <span>PAID</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <Clock className="w-3 h-3" />
                          <span>PENDING</span>
                        </span>
                      )}
                    </div>

                    {/* Breakdown Grid */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Base Salary</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {formatPKR(sal.baseSalary)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Fuel Allowance</span>
                        <span className="font-mono font-bold text-blue-600">
                          +{formatPKR(sal.fuelAllowance)}
                        </span>
                      </div>
                      {sal.bonus > 0 && (
                        <div>
                          <span className="text-[10px] text-slate-400 block">Bonus</span>
                          <span className="font-mono font-bold text-emerald-600">
                            +{formatPKR(sal.bonus)}
                          </span>
                        </div>
                      )}
                      {sal.deductions > 0 && (
                        <div>
                          <span className="text-[10px] text-slate-400 block">Deductions</span>
                          <span className="font-mono font-bold text-rose-600">
                            -{formatPKR(sal.deductions)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Net Total */}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs font-bold text-slate-500">Net Payable:</span>
                      <span className="text-base font-black font-mono text-teal-600 dark:text-teal-400">
                        {formatPKR(sal.netSalary)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setSlipSalary(sal)}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 font-bold text-xs inline-flex items-center gap-1"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-500" />
                        <span>Print Slip</span>
                      </button>

                      <div className="flex items-center gap-1.5 ml-auto">
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => handleDisburseSingle(sal)}
                            className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs inline-flex items-center gap-1 shadow-sm"
                          >
                            <Zap className="w-3 h-3" />
                            <span>Disburse</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenCreateModal(sal)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                          title="Edit Salary"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSalary(sal)}
                          className="p-1.5 rounded-lg text-rose-400 hover:text-rose-600"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Desktop Table View */}
            <div className="hidden md:block overflow-x-auto print:block">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 print:bg-slate-100 print:text-black">
                  <tr>
                    <th className="p-3">Staff Member</th>
                    <th className="p-3">Month</th>
                    <th className="p-3 text-right">Base Salary</th>
                    <th className="p-3 text-right">Fuel (TA/DA)</th>
                    <th className="p-3 text-right">Bonus</th>
                    <th className="p-3 text-right">Deductions</th>
                    <th className="p-3 text-right">Net Salary</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-right no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-slate-200">
                  {filteredSalaries.map((sal) => {
                    const isPaid = sal.status === "paid";
                    return (
                      <tr
                        key={sal.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Staff */}
                        <td className="p-3 font-semibold text-slate-900 dark:text-slate-100">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-black text-[11px] flex items-center justify-center shrink-0">
                              {sal.staffName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span className="block font-bold">{sal.staffName}</span>
                              <span className="text-[10px] text-slate-400 block font-normal">
                                {sal.staffRole}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Month */}
                        <td className="p-3 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                          {sal.monthLabel}
                        </td>

                        {/* Base */}
                        <td className="p-3 text-right font-mono font-medium text-slate-700 dark:text-slate-300">
                          {formatPKR(sal.baseSalary)}
                        </td>

                        {/* Fuel */}
                        <td className="p-3 text-right font-mono text-blue-600 font-medium">
                          {sal.fuelAllowance > 0 ? `+${formatPKR(sal.fuelAllowance)}` : "—"}
                        </td>

                        {/* Bonus */}
                        <td className="p-3 text-right font-mono text-emerald-600 font-medium">
                          {sal.bonus > 0 ? (
                            <div>
                              <span>+{formatPKR(sal.bonus)}</span>
                              {sal.bonusReason && (
                                <span className="block text-[9px] text-slate-400 truncate max-w-[120px] ml-auto">
                                  {sal.bonusReason}
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Deductions */}
                        <td className="p-3 text-right font-mono text-rose-600 font-medium">
                          {sal.deductions > 0 ? (
                            <div>
                              <span>-{formatPKR(sal.deductions)}</span>
                              {sal.deductionReason && (
                                <span className="block text-[9px] text-slate-400 truncate max-w-[120px] ml-auto">
                                  {sal.deductionReason}
                                </span>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>

                        {/* Net Salary */}
                        <td className="p-3 text-right font-mono font-black text-sm text-teal-600 dark:text-teal-400">
                          {formatPKR(sal.netSalary)}
                        </td>

                        {/* Status */}
                        <td className="p-3 text-center">
                          {isPaid ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                              <Check className="w-3 h-3" />
                              <span>DISBURSED</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <Clock className="w-3 h-3" />
                              <span>PENDING</span>
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right no-print">
                          <div className="flex items-center justify-end gap-1.5">
                            {!isPaid && (
                              <button
                                type="button"
                                onClick={() => handleDisburseSingle(sal)}
                                className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-[11px] inline-flex items-center gap-1 shadow-sm transition-colors"
                                title="Disburse salary immediately"
                              >
                                <Zap className="w-3 h-3" />
                                <span>Disburse</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSlipSalary(sal)}
                              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-[11px] inline-flex items-center gap-1 transition-colors"
                              title="Print Salary Slip"
                            >
                              <Printer className="w-3 h-3 text-slate-500" />
                              <span>Slip</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenCreateModal(sal)}
                              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              title="Edit Salary"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteSalary(sal)}
                              className="p-1 rounded-lg text-rose-400 hover:text-rose-600"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: CREATE / EDIT SALARY RECORD                                      */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-xl rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  {editingSalary ? "Edit Salary Slip" : "New Staff Salary Record"}
                </h2>
                <p className="text-xs text-slate-500">
                  Configure base salary, fuel, bonuses, and deductions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSalary} className="space-y-4 text-xs">
              {/* Staff Member Picker */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Select Staff Member *
                  </label>
                  {staffUsers.length > 0 ? (
                    <select
                      value={formStaffId}
                      onChange={(e) => handleSelectStaff(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100"
                    >
                      <option value="">-- Choose Staff User --</option>
                      {staffUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {normalizeUserDisplayName(u.displayName, "Staff")} ({getUserRoleLabel(u.role)})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="Staff Member Name"
                      value={formStaffName}
                      onChange={(e) => setFormStaffName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Salary Month (YYYY-MM) *
                  </label>
                  <input
                    type="month"
                    value={formMonth}
                    onChange={(e) => setFormMonth(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Earnings Inputs: Base, Fuel, Bonus */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 space-y-3">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                  1. Earnings &amp; Allowances (+)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Base Salary (PKR) *
                    </label>
                    <input
                      type="number"
                      value={formBaseSalary}
                      onChange={(e) => setFormBaseSalary(e.target.value === "" ? "" : Number(e.target.value))}
                      required
                      min={0}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Fuel Expense / TA-DA (PKR)
                    </label>
                    <input
                      type="number"
                      value={formFuelAllowance}
                      onChange={(e) => setFormFuelAllowance(e.target.value === "" ? "" : Number(e.target.value))}
                      min={0}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Target Bonus / Incentive (PKR)
                    </label>
                    <input
                      type="number"
                      value={formBonus}
                      onChange={(e) => setFormBonus(e.target.value === "" ? "" : Number(e.target.value))}
                      min={0}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-emerald-600"
                    />
                  </div>
                </div>

                {Number(formBonus) > 0 && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Bonus Reason / Sales Target Achieved
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Achieved 100% October Sales Target"
                      value={formBonusReason}
                      onChange={(e) => setFormBonusReason(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                )}
              </div>

              {/* Deductions: Leaves, Advance, Loans */}
              <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40 space-y-3">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-400 block">
                  2. Deductions (-)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Total Deductions (PKR)
                    </label>
                    <input
                      type="number"
                      value={formDeductions}
                      onChange={(e) => setFormDeductions(e.target.value === "" ? "" : Number(e.target.value))}
                      min={0}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-rose-600"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Reason for Deduction
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2 days unpaid absence / Salary advance"
                      value={formDeductionReason}
                      onChange={(e) => setFormDeductionReason(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Live Net Salary Summary */}
              <div className="p-4 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 uppercase tracking-wider block">
                    Calculated Net Payable
                  </span>
                  <span className="text-xs text-slate-500">
                    (Base {formatPKR(Number(formBaseSalary) || 0)} + Fuel {formatPKR(Number(formFuelAllowance) || 0)} + Bonus {formatPKR(Number(formBonus) || 0)}) - Deduct {formatPKR(Number(formDeductions) || 0)}
                  </span>
                </div>
                <div className="text-xl sm:text-2xl font-black font-mono text-teal-700 dark:text-teal-300">
                  {formatPKR(
                    Math.max(
                      0,
                      (Number(formBaseSalary) || 0) +
                        (Number(formFuelAllowance) || 0) +
                        (Number(formBonus) || 0) +
                        (Number(formOtherAllowances) || 0) -
                        (Number(formDeductions) || 0)
                    )
                  )}
                </div>
              </div>

              {/* Payment Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={formPaymentMethod}
                    onChange={(e) => setFormPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="cash">Cash in Hand</option>
                    <option value="bank_transfer">Bank Transfer (IBFT)</option>
                    <option value="cheque">Cheque</option>
                    <option value="online">Online / EasyPaisa / JazzCash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Transaction / Cheque Ref # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. TXN-9481 / Cheque # 10492"
                    value={formPaymentRef}
                    onChange={(e) => setFormPaymentRef(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Disburse Immediately Checkbox */}
              <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={formDisburseNow}
                    onChange={(e) => setFormDisburseNow(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
                  />
                  <div>
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      Mark as Disbursed (Paid Immediately)
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Reflects instantly in Profit &amp; Loss expense calculations
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold shadow-md shadow-teal-600/20"
                >
                  {editingSalary ? "Update Salary Slip" : "Save Salary Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: BULK DISBURSE MODAL                                              */}
      {/* ========================================================================= */}
      {bulkDisburseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                  One-Click Salary Disbursement
                </h3>
                <p className="text-xs text-slate-500">
                  Disburse all pending salaries for {selectedMonth}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Pending Slips:</span>
                <strong className="text-slate-900 dark:text-slate-100">{kpis.pendingCount} staff members</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Net Amount:</span>
                <span className="font-mono font-black text-amber-600 text-sm">
                  {formatPKR(kpis.pendingAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Fuel &amp; Allowances included:</span>
                <span className="font-mono font-bold text-blue-600">
                  {formatPKR(kpis.totalFuel)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Clicking &quot;Confirm Disbursement&quot; will mark all {kpis.pendingCount} salary records as <strong>PAID</strong>, register disbursement timestamps, and sync this expense into the <strong>Profit &amp; Loss</strong> statement.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBulkDisburseModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDisburse}
                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-md shadow-amber-600/30 flex items-center gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Confirm Disbursement ({formatPKR(kpis.pendingAmount)})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: OFFICIAL PRINTABLE SALARY SLIP (A4 / VOUCHER)                     */}
      {/* ========================================================================= */}
      {slipSalary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white text-slate-900 shadow-2xl p-6 sm:p-8 space-y-6 my-auto print:shadow-none print:p-0 print:border-none print:m-0 print:w-full">
            {/* Modal Controls (No print) */}
            <div className="flex items-center justify-between no-print border-b pb-3">
              <span className="text-xs font-black uppercase text-teal-700 tracking-wider">
                Official Salary Slip Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Slip Now</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSlipSalary(null)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Slip Content */}
            <div className="border border-slate-300 rounded-2xl p-6 sm:p-8 space-y-6 bg-white text-slate-900">
              {/* Slip Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-xl font-black uppercase tracking-tight text-black">
                    NOXDERMA PHARMACEUTICALS
                  </h1>
                  <p className="text-xs text-slate-600 font-semibold">
                    Derma &amp; Healthcare Solutions
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Suite # 402, Trade Heights, Karachi, Pakistan
                  </p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded bg-slate-100 border border-slate-400 text-[11px] font-black uppercase tracking-wider text-black mb-1">
                    Salary Disbursement Slip
                  </span>
                  <p className="text-[10px] text-slate-600">
                    <strong>Slip Ref:</strong> {slipSalary.id.toUpperCase().slice(-10)}
                  </p>
                  <p className="text-[10px] text-slate-600">
                    <strong>Period:</strong> {slipSalary.monthLabel}
                  </p>
                </div>
              </div>

              {/* Employee Meta Info */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block">Employee Name:</span>
                  <strong className="text-slate-900 font-bold">{slipSalary.staffName}</strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block">Designation / Role:</span>
                  <span className="font-semibold text-slate-800">{slipSalary.staffRole}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block">Contact Phone:</span>
                  <span className="font-mono text-slate-800">{slipSalary.phone || "—"}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 font-medium block">Payment Status:</span>
                  <span
                    className={`font-black uppercase text-[10px] px-2 py-0.5 rounded ${
                      slipSalary.status === "paid"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {slipSalary.status === "paid" ? "PAID (Disbursed)" : "PENDING"}
                  </span>
                </div>
              </div>

              {/* Breakdown 2-Column Statement: Earnings vs Deductions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Earnings Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 px-3 py-2 font-bold text-slate-800 border-b border-slate-200 uppercase text-[11px] flex justify-between">
                    <span>Earnings</span>
                    <span>Amount (PKR)</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Basic Pay</span>
                      <span className="font-mono font-bold text-slate-900">{formatPKR(slipSalary.baseSalary)}</span>
                    </div>
                    {slipSalary.fuelAllowance > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Fuel &amp; Travel Allowance</span>
                        <span className="font-mono font-bold text-slate-900">+{formatPKR(slipSalary.fuelAllowance)}</span>
                      </div>
                    )}
                    {slipSalary.bonus > 0 && (
                      <div className="flex justify-between">
                        <div>
                          <span className="text-slate-600 block">Performance Bonus</span>
                          {slipSalary.bonusReason && (
                            <span className="text-[9px] text-slate-400 block">{slipSalary.bonusReason}</span>
                          )}
                        </div>
                        <span className="font-mono font-bold text-slate-900">+{formatPKR(slipSalary.bonus)}</span>
                      </div>
                    )}
                    {slipSalary.otherAllowances > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Other Allowances</span>
                        <span className="font-mono font-bold text-slate-900">+{formatPKR(slipSalary.otherAllowances)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                      <span>Total Earnings:</span>
                      <span className="font-mono">
                        {formatPKR(slipSalary.baseSalary + slipSalary.fuelAllowance + slipSalary.bonus + slipSalary.otherAllowances)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Deductions Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-100 px-3 py-2 font-bold text-slate-800 border-b border-slate-200 uppercase text-[11px] flex justify-between">
                    <span>Deductions</span>
                    <span>Amount (PKR)</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {slipSalary.deductions > 0 ? (
                      <>
                        <div className="flex justify-between">
                          <div>
                            <span className="text-slate-600 block">Salary Deductions</span>
                            {slipSalary.deductionReason && (
                              <span className="text-[9px] text-slate-400 block">{slipSalary.deductionReason}</span>
                            )}
                          </div>
                          <span className="font-mono font-bold text-rose-600">-{formatPKR(slipSalary.deductions)}</span>
                        </div>
                        <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
                          <span>Total Deductions:</span>
                          <span className="font-mono text-rose-600">-{formatPKR(slipSalary.deductions)}</span>
                        </div>
                      </>
                    ) : (
                      <p className="text-center text-slate-400 py-6">No deductions applied</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Net Pay Grand Box */}
              <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                    Net Disbursed Salary
                  </span>
                  <span className="text-xs text-slate-300 font-medium">
                    {numberToWordsPKR(slipSalary.netSalary)}
                  </span>
                </div>
                <div className="text-2xl font-black font-mono text-teal-400">
                  {formatPKR(slipSalary.netSalary)}
                </div>
              </div>

              {/* Payment Details */}
              <div className="text-[11px] text-slate-600 space-y-1">
                <p>
                  <strong>Payment Mode:</strong> {slipSalary.paymentMethod.toUpperCase()}
                  {slipSalary.paymentReference ? ` &bull; Ref #${slipSalary.paymentReference}` : ""}
                  {slipSalary.disbursedAt ? ` &bull; Disbursed on ${formatKarachiDate(slipSalary.disbursedAt, true)}` : ""}
                </p>
                {slipSalary.notes && <p><strong>Notes:</strong> {slipSalary.notes}</p>}
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-6 pt-8 mt-6 border-t border-slate-300 text-center text-[10px]">
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-1"></div>
                  <p className="font-bold text-slate-900">Prepared By</p>
                  <p className="text-slate-500">Finance &amp; Accounts</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-1"></div>
                  <p className="font-bold text-slate-900">Employee Signature</p>
                  <p className="text-slate-500">Received with thanks</p>
                </div>
                <div>
                  <div className="border-b border-slate-400 pb-8 mb-1"></div>
                  <p className="font-bold text-slate-900">Approved By</p>
                  <p className="text-slate-500">Owner / Director</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

