"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Target,
  Plus,
  Search,
  Filter,
  UserCheck,
  TrendingUp,
  Award,
  DollarSign,
  Percent,
  CheckCircle2,
  Calendar,
  Building2,
  Trash2,
  AlertTriangle,
  X,
  Edit2,
  Users,
  Shield,
  ArrowRight,
  ExternalLink,
  MapPin,
  Clock,
  Sparkles,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import type { UserProfile, UserRole } from "@/types/auth";
import { getUserRoleLabel, normalizeUserDisplayName } from "@/types/auth";
import type { Invoice, CustomerVisit } from "@/types";
import {
  BulkDeleteModal,
  SingleDeleteModal,
  type DeleteScopeType,
} from "@/components/common/BulkDeleteModal";
import {
  computeDateScopeCounts,
  getItemsInScope,
} from "@/lib/dateFilter";

export interface RepTarget {
  id: string;
  repId?: string;
  repName: string;
  userRole?: string;
  userEmail?: string;
  territory: string;
  month: string; // e.g. "November 2026"
  monthlyQuotaPkr: number;
  achievedSalesPkr: number;
  visitedPharmaciesCount: number;
  targetVisitsCount: number;
  commissionRatePercent: number;
  status: "on_track" | "ahead" | "behind";
  createdAt?: string;
  updatedAt?: string;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getCurrentMonthName(): string {
  const now = new Date();
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}

function getAvailableMonthOptions(): string[] {
  const options: string[] = [];
  const now = new Date();
  // Generate 2 months prior, current month, and next 3 months
  for (let i = -2; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    options.push(`${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`);
  }
  return options;
}

function matchesTargetMonth(dateStr: string | undefined | null, targetMonth: string): boolean {
  if (!dateStr || !targetMonth) return false;
  const cleanTarget = targetMonth.trim().toLowerCase();
  if (cleanTarget === "all") return true;

  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const monthYear = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`.toLowerCase();
      if (monthYear === cleanTarget) return true;
      const yyyymm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`.toLowerCase();
      if (yyyymm === cleanTarget) return true;
    }
  } catch {}

  return dateStr.toLowerCase().includes(cleanTarget);
}

export default function SalesTargetsPage() {
  const { currentUser } = useAuth();
  const [targets, setTargets] = useState<RepTarget[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [visits, setVisits] = useState<CustomerVisit[]>([]);

  // Search & Filter State
  const [search, setSearch] = useState("");
  const [selectedMonthFilter, setSelectedMonthFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTargetId, setEditingTargetId] = useState<string | null>(null);

  // Form State
  const [formUserId, setFormUserId] = useState<string>("");
  const [formRepName, setFormRepName] = useState<string>("");
  const [formUserRole, setFormUserRole] = useState<string>("");
  const [formUserEmail, setFormUserEmail] = useState<string>("");
  const [formTerritory, setFormTerritory] = useState<string>("");
  const [formMonth, setFormMonth] = useState<string>(getCurrentMonthName());
  const [formQuota, setFormQuota] = useState<number>(500000);
  const [formTargetVisits, setFormTargetVisits] = useState<number>(80);
  const [formCommissionRate, setFormCommissionRate] = useState<number>(2.5);

  // Multi-Selection & Bulk Delete State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState<RepTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Load all data on mount
  useEffect(() => {
    async function loadAllData() {
      // 1. Load users (Staff Accounts)
      const defaultOwner: UserProfile = {
        id: "usr_admin",
        email: "admin@noxderma.com",
        displayName: "Owner",
        role: "owner",
        active: true,
        createdAt: new Date().toISOString(),
      };

      let loadedUsers: UserProfile[] = [];
      try {
        const dbUsers = await (offlineDb as any).users?.toArray();
        if (dbUsers && dbUsers.length > 0) {
          loadedUsers = dbUsers;
        } else {
          const saved =
            localStorage.getItem("noxderma_staff_users") ||
            localStorage.getItem("noxderma_users");
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (Array.isArray(parsed)) loadedUsers = parsed;
            } catch {}
          }
        }
      } catch (err) {
        console.error("Failed to load staff users:", err);
      }

      if (!loadedUsers.some((u) => u.id === "usr_admin" || u.email === "admin@noxderma.com")) {
        loadedUsers = [defaultOwner, ...loadedUsers];
      }
      setUsers(loadedUsers);

      // 2. Load Invoices
      try {
        const dbInvoices = await (offlineDb as any).invoices?.toArray();
        if (dbInvoices && dbInvoices.length > 0) {
          setInvoices(dbInvoices);
        } else {
          const savedInv = localStorage.getItem("noxderma_offline_invoices");
          if (savedInv) {
            try {
              const parsed = JSON.parse(savedInv);
              if (Array.isArray(parsed)) setInvoices(parsed);
            } catch {}
          }
        }
      } catch (err) {
        console.error("Failed to load invoices:", err);
      }

      // 3. Load Customer Visits
      try {
        const dbVisits = await (offlineDb as any).customerVisits?.toArray();
        if (dbVisits && dbVisits.length > 0) {
          setVisits(dbVisits);
        } else {
          const savedVisits = localStorage.getItem("noxderma_customer_visits");
          if (savedVisits) {
            try {
              const parsed = JSON.parse(savedVisits);
              if (Array.isArray(parsed)) setVisits(parsed);
            } catch {}
          }
        }
      } catch (err) {
        console.error("Failed to load customer visits:", err);
      }

      // 4. Load Employee Targets
      try {
        const dbTargets = await (offlineDb as any).employeeTargets?.toArray();
        if (dbTargets && dbTargets.length > 0) {
          setTargets(dbTargets as RepTarget[]);
          return;
        }
      } catch {}

      const saved = localStorage.getItem("noxderma_rep_targets");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setTargets(parsed);
          } else {
            setTargets([]);
          }
        } catch {
          setTargets([]);
        }
      } else {
        setTargets([]);
      }
    }

    loadAllData();
  }, []);

  const saveTargets = async (updated: RepTarget[]) => {
    setTargets(updated);
    localStorage.setItem("noxderma_rep_targets", JSON.stringify(updated));
    try {
      if ((offlineDb as any).employeeTargets) {
        await (offlineDb as any).employeeTargets.clear();
        if (updated.length > 0) {
          await (offlineDb as any).employeeTargets.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync employeeTargets to offlineDb:", err);
    }
  };

  // Staff account options for dropdown
  const activeStaffAccounts = useMemo(() => {
    return users.filter((u) => u.active !== false);
  }, [users]);

  // Open modal for creating new target
  const handleOpenCreateModal = () => {
    setEditingTargetId(null);
    if (activeStaffAccounts.length > 0) {
      const defaultUser = activeStaffAccounts[0];
      setFormUserId(defaultUser.id);
      setFormRepName(normalizeUserDisplayName(defaultUser.displayName, defaultUser.email));
      setFormUserRole(defaultUser.role || "sales_rep");
      setFormUserEmail(defaultUser.email || "");
      setFormTerritory(defaultUser.territory || "All Areas / Head Office");
    } else {
      setFormUserId("usr_admin");
      setFormRepName("Owner");
      setFormUserRole("owner");
      setFormUserEmail("admin@noxderma.com");
      setFormTerritory("Head Office");
    }
    setFormMonth(getCurrentMonthName());
    setFormQuota(500000);
    setFormTargetVisits(80);
    setFormCommissionRate(2.5);
    setIsModalOpen(true);
  };

  // Open modal for editing existing target
  const handleOpenEditModal = (t: RepTarget) => {
    setEditingTargetId(t.id);
    setFormUserId(t.repId || "");
    setFormRepName(t.repName);
    setFormUserRole(t.userRole || "");
    setFormUserEmail(t.userEmail || "");
    setFormTerritory(t.territory);
    setFormMonth(t.month || getCurrentMonthName());
    setFormQuota(t.monthlyQuotaPkr);
    setFormTargetVisits(t.targetVisitsCount);
    setFormCommissionRate(t.commissionRatePercent || 2.5);
    setIsModalOpen(true);
  };

  // When staff selection changes in form
  const handleStaffUserChange = (userId: string) => {
    const selected = users.find((u) => u.id === userId);
    if (selected) {
      setFormUserId(selected.id);
      setFormRepName(normalizeUserDisplayName(selected.displayName, selected.email));
      setFormUserRole(selected.role);
      setFormUserEmail(selected.email);
      setFormTerritory(selected.territory || "All Areas / Head Office");
    }
  };

  // Save (Create or Update) target
  const handleSubmitTarget = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formRepName.trim()) {
      setNotice({ type: "error", text: "Please select a staff member." });
      return;
    }
    if (formQuota <= 0) {
      setNotice({ type: "error", text: "Sales target amount must be greater than 0 PKR." });
      return;
    }

    if (editingTargetId) {
      // Update existing target
      const existing = targets.find((t) => t.id === editingTargetId);
      const updatedTarget: RepTarget = {
        ...existing,
        id: editingTargetId,
        repId: formUserId,
        repName: formRepName,
        userRole: formUserRole,
        userEmail: formUserEmail,
        territory: formTerritory.trim() || "All Areas",
        month: formMonth,
        monthlyQuotaPkr: Number(formQuota),
        targetVisitsCount: Number(formTargetVisits),
        commissionRatePercent: Number(formCommissionRate),
        achievedSalesPkr: existing?.achievedSalesPkr || 0,
        visitedPharmaciesCount: existing?.visitedPharmaciesCount || 0,
        status: existing?.status || "behind",
        updatedAt: new Date().toISOString(),
      };

      const nextList = targets.map((t) => (t.id === editingTargetId ? updatedTarget : t));
      await saveTargets(nextList);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "update",
        entityType: "employee_target",
        entityId: updatedTarget.id,
        entityTitle: `${updatedTarget.repName} - ${updatedTarget.month}`,
        details: `Updated sales target for ${updatedTarget.repName} to ${formatPKR(updatedTarget.monthlyQuotaPkr)} (${updatedTarget.month}).`,
        snapshotBefore: existing ? { ...existing } : undefined,
        snapshotAfter: updatedTarget,
        canUndo: true,
      });

      setNotice({
        type: "success",
        text: `Target for "${updatedTarget.repName}" updated successfully.`,
      });
    } else {
      // Check if target for this user and month already exists
      const existingIndex = targets.findIndex(
        (t) =>
          (t.repId === formUserId || t.repName.toLowerCase() === formRepName.toLowerCase()) &&
          t.month.toLowerCase() === formMonth.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Update existing instead of creating duplicate
        const existing = targets[existingIndex];
        const updatedTarget: RepTarget = {
          ...existing,
          monthlyQuotaPkr: Number(formQuota),
          targetVisitsCount: Number(formTargetVisits),
          commissionRatePercent: Number(formCommissionRate),
          territory: formTerritory.trim() || existing.territory,
          updatedAt: new Date().toISOString(),
        };
        const nextList = [...targets];
        nextList[existingIndex] = updatedTarget;
        await saveTargets(nextList);

        await recordActivity({
          userId: currentUser?.id,
          userName: currentUser?.displayName || "Owner",
          userRole: currentUser?.role || "owner",
          userEmail: currentUser?.email,
          action: "update",
          entityType: "employee_target",
          entityId: updatedTarget.id,
          entityTitle: `${updatedTarget.repName} - ${updatedTarget.month}`,
          details: `Updated sales target for ${updatedTarget.repName} to ${formatPKR(updatedTarget.monthlyQuotaPkr)} (${updatedTarget.month}).`,
          snapshotBefore: { ...existing },
          snapshotAfter: updatedTarget,
          canUndo: true,
        });

        setNotice({
          type: "success",
          text: `Target for "${formRepName}" in ${formMonth} updated successfully.`,
        });
      } else {
        // Create brand new target
        const newTarget: RepTarget = {
          id: `target_${Date.now()}`,
          repId: formUserId,
          repName: formRepName,
          userRole: formUserRole,
          userEmail: formUserEmail,
          territory: formTerritory.trim() || "All Areas",
          month: formMonth,
          monthlyQuotaPkr: Number(formQuota),
          achievedSalesPkr: 0,
          visitedPharmaciesCount: 0,
          targetVisitsCount: Number(formTargetVisits),
          commissionRatePercent: Number(formCommissionRate),
          status: "behind",
          createdAt: new Date().toISOString(),
        };

        const nextList = [newTarget, ...targets];
        await saveTargets(nextList);

        await recordActivity({
          userId: currentUser?.id,
          userName: currentUser?.displayName || "Owner",
          userRole: currentUser?.role || "owner",
          userEmail: currentUser?.email,
          action: "create",
          entityType: "employee_target",
          entityId: newTarget.id,
          entityTitle: `${newTarget.repName} - ${newTarget.month}`,
          details: `Assigned sales target to ${newTarget.repName} (${formatPKR(newTarget.monthlyQuotaPkr)} for ${newTarget.month}).`,
          snapshotAfter: newTarget,
          canUndo: true,
        });

        setNotice({
          type: "success",
          text: `Sales target for "${newTarget.repName}" (${formatPKR(newTarget.monthlyQuotaPkr)}) saved!`,
        });
      }
    }

    setIsModalOpen(false);
  };

  // Helper to dynamically calculate real-time achievements for each target
  const getDynamicTargetMetrics = (t: RepTarget) => {
    // 1. Filter invoices for this user in target's month
    const userInvoices = invoices.filter((inv) => {
      const matchesUser =
        (t.repId && (inv.salesRepId === t.repId || inv.deviceId === t.repId)) ||
        (t.repName &&
          inv.salesRepName &&
          inv.salesRepName.trim().toLowerCase() === t.repName.trim().toLowerCase()) ||
        (t.userEmail &&
          inv.salesRepName &&
          inv.salesRepName.trim().toLowerCase() === t.userEmail.trim().toLowerCase());

      if (!matchesUser) return false;
      return matchesTargetMonth(inv.invoiceDate || inv.createdAt, t.month);
    });

    const liveSalesPkr = userInvoices.reduce(
      (sum, inv) => sum + (Number(inv.netTotal) || Number(inv.grossTotal) || 0),
      0
    );

    // 2. Filter visits for this user in target's month
    const userVisits = visits.filter((v) => {
      const matchesUser =
        (t.repId && v.employeeId === t.repId) ||
        (t.repName &&
          v.employeeName &&
          v.employeeName.trim().toLowerCase() === t.repName.trim().toLowerCase());

      if (!matchesUser) return false;
      return matchesTargetMonth(v.visitDate, t.month);
    });

    const liveVisitsCount = userVisits.length;

    // Use live calculation if records exist, otherwise fallback to stored values
    const actualSales = liveSalesPkr > 0 ? liveSalesPkr : (t.achievedSalesPkr || 0);
    const actualVisits = liveVisitsCount > 0 ? liveVisitsCount : (t.visitedPharmaciesCount || 0);

    const pct = t.monthlyQuotaPkr > 0 ? Math.round((actualSales / t.monthlyQuotaPkr) * 100) : 0;
    const comm = (actualSales * (t.commissionRatePercent || 2.5)) / 100;

    let dynamicStatus: "ahead" | "on_track" | "behind" = "behind";
    if (pct >= 100) {
      dynamicStatus = "ahead";
    } else if (pct >= 50) {
      dynamicStatus = "on_track";
    }

    return {
      actualSales,
      actualVisits,
      pct,
      comm,
      dynamicStatus,
      invoicesCount: userInvoices.length,
    };
  };

  // Filtered targets list
  const filtered = useMemo(() => {
    return targets.filter((t) => {
      // Month Filter
      if (selectedMonthFilter !== "all") {
        if (!matchesTargetMonth(t.month, selectedMonthFilter)) return false;
      }

      // Role Filter
      if (roleFilter !== "all") {
        const uRole = (t.userRole || "").toLowerCase();
        if (roleFilter === "owner_partner") {
          const isOwner = uRole === "owner" || uRole === "admin" || t.repName.toLowerCase().includes("owner") || t.repName.toLowerCase().includes("partner");
          if (!isOwner) return false;
        } else if (roleFilter === "sales_rep") {
          if (uRole !== "sales_rep") return false;
        } else if (roleFilter === "booking_user") {
          if (uRole !== "booking_user") return false;
        } else if (roleFilter === "manager") {
          if (uRole !== "manager") return false;
        }
      }

      // Text Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = t.repName.toLowerCase().includes(q);
        const matchesTerritory = t.territory.toLowerCase().includes(q);
        const matchesEmail = (t.userEmail || "").toLowerCase().includes(q);
        if (!matchesName && !matchesTerritory && !matchesEmail) return false;
      }

      return true;
    });
  }, [targets, selectedMonthFilter, roleFilter, search]);

  // Aggregate KPI summary for filtered items
  const summaryMetrics = useMemo(() => {
    let totalQuota = 0;
    let totalAchieved = 0;
    let totalVisitsDone = 0;
    let totalVisitsGoal = 0;
    let totalCommission = 0;

    filtered.forEach((t) => {
      const { actualSales, actualVisits, comm } = getDynamicTargetMetrics(t);
      totalQuota += t.monthlyQuotaPkr;
      totalAchieved += actualSales;
      totalVisitsDone += actualVisits;
      totalVisitsGoal += t.targetVisitsCount;
      totalCommission += comm;
    });

    const overallPct =
      totalQuota > 0 ? Math.round((totalAchieved / totalQuota) * 100) : 0;

    return {
      totalQuota,
      totalAchieved,
      totalVisitsDone,
      totalVisitsGoal,
      totalCommission,
      overallPct,
    };
  }, [filtered, invoices, visits]);

  // Bulk Delete Scope Counts
  const scopeCounts = useMemo(() => {
    return computeDateScopeCounts(
      targets,
      (t) => t.createdAt || t.month,
      selectedIds.length
    );
  }, [targets, selectedIds.length]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filtered.length && filtered.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((t) => t.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExecuteBulkDelete = async (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => {
    try {
      setIsDeleting(true);
      const toDelete = getItemsInScope(
        targets,
        scope,
        (t) => t.createdAt || t.month,
        (t) => t.id,
        selectedIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        setNotice({ type: "error", text: "No matching targets found to delete." });
        setIsDeleting(false);
        setDeleteModalOpen(false);
        return;
      }

      const deleteIds = new Set(toDelete.map((t) => t.id));
      const remaining = targets.filter((t) => !deleteIds.has(t.id));
      await saveTargets(remaining);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "employee_target",
        entityId: Array.from(deleteIds).slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} sales target(s)`,
        details: `Purged ${toDelete.length} target(s) under criteria scope: ${scope}.`,
        snapshotBefore: toDelete,
        canUndo: true,
      });

      setSelectedIds([]);
      setDeleteModalOpen(false);
      setNotice({
        type: "success",
        text: `Successfully deleted ${toDelete.length} sales target(s).`,
      });
    } catch (err: any) {
      console.error("Bulk delete targets failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete targets." });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExecuteSingleDelete = async () => {
    if (!deletingTarget) return;
    try {
      setIsDeleting(true);
      const remaining = targets.filter((t) => t.id !== deletingTarget.id);
      await saveTargets(remaining);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "employee_target",
        entityId: deletingTarget.id,
        entityTitle: `${deletingTarget.repName} - ${deletingTarget.month}`,
        details: `Deleted sales target for ${deletingTarget.repName} (${deletingTarget.month}).`,
        snapshotBefore: deletingTarget,
        canUndo: true,
      });

      setSelectedIds((prev) => prev.filter((id) => id !== deletingTarget.id));
      setDeletingTarget(null);
      setNotice({
        type: "success",
        text: `Deleted target for "${deletingTarget.repName}".`,
      });
    } catch (err: any) {
      console.error("Single delete target failed:", err);
      setNotice({ type: "error", text: err?.message || "Failed to delete target." });
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper for role badge colors
  const getRoleBadge = (roleName?: string, name?: string) => {
    const r = (roleName || "").toLowerCase();
    const isOwnerOrPartner =
      r === "owner" ||
      r === "admin" ||
      (name && (name.toLowerCase().includes("owner") || name.toLowerCase().includes("partner")));

    if (isOwnerOrPartner) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          <Shield className="w-3 h-3" /> Partner / Owner
        </span>
      );
    }
    if (r === "sales_rep") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <UserCheck className="w-3 h-3" /> Sales Representative
        </span>
      );
    }
    if (r === "booking_user") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
          Order Booker
        </span>
      );
    }
    if (r === "manager") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          Manager
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
        {getUserRoleLabel(roleName || "sales_rep")}
      </span>
    );
  };

  const monthOptions = getAvailableMonthOptions();

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between text-xs sm:text-sm font-semibold animate-in fade-in ${
            notice.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
              : "bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notice.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
              Staff & Partners Performance
            </span>
            <span className="text-xs text-slate-400">Live Invoices & Visits Tracking</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            Sales Targets & Goals Tracking (سیلز ٹارگٹس)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Set sales & visit targets for Owner, Partners, and created Staff Accounts. Track live sales progress directly from real billing invoices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-rose-600/20 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="px-3.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 hover:bg-rose-100 text-xs font-bold flex items-center gap-1.5 transition-all"
            title="Delete with scope criteria"
          >
            <Trash2 className="w-4 h-4" />
            <span>Purge Targets</span>
          </button>

          <Link
            href="/users"
            className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Users className="w-4 h-4 text-slate-500" />
            <span>Staff Accounts ({activeStaffAccounts.length})</span>
          </Link>

          <button
            onClick={handleOpenCreateModal}
            className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
          >
            <Plus className="w-4 h-4" /> Set Sales Target
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Target Quota */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Total Target (کل ہدف)
            </span>
            <Target className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(summaryMetrics.totalQuota)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            For {filtered.length} target assignments
          </span>
        </div>

        {/* Live Sales Done */}
        <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Live Sales Done
            </span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {formatPKR(summaryMetrics.totalAchieved)}
          </span>
          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 block mt-0.5">
            {summaryMetrics.overallPct}% overall target achieved
          </span>
        </div>

        {/* Total Visits Done */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Doctor & Shop Visits
            </span>
            <MapPin className="w-4 h-4 text-slate-400" />
          </div>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {summaryMetrics.totalVisitsDone} <span className="text-xs text-slate-400 font-normal">/ {summaryMetrics.totalVisitsGoal} Goal</span>
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Field visits recorded in CRM
          </span>
        </div>

        {/* Total Commission Earned */}
        <div className="p-4 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/30 dark:bg-teal-950/20 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wider">
              Commission Earned
            </span>
            <Award className="w-4 h-4 text-teal-600" />
          </div>
          <span className="text-2xl font-black font-mono text-teal-600 dark:text-teal-400">
            {formatPKR(summaryMetrics.totalCommission)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Based on completed invoice sales
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by staff name, partner, area, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month Selector Filter */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedMonthFilter}
              onChange={(e) => setSelectedMonthFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Target Months</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Roles (سبھی)</option>
              <option value="owner_partner">Owners & Partners</option>
              <option value="sales_rep">Sales Representatives</option>
              <option value="booking_user">Order Bookers</option>
              <option value="manager">Operations Managers</option>
            </select>
          </div>
        </div>
      </div>

      {/* Rep Performance Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        {filtered.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Target className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No Sales Targets Found
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Assign sales and visit targets to your sales staff, order bookers, partners, or yourself. All achievements will automatically update as they issue sales invoices in the system.
            </p>
            <button
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20"
            >
              <Plus className="w-4 h-4" /> Set First Sales Target
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="w-10 p-2.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filtered.length && filtered.length > 0}
                      onChange={handleToggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      title="Select All"
                    />
                  </th>
                  <th className="p-2.5">Staff Account & Role</th>
                  <th className="p-2.5">Month & Area</th>
                  <th className="p-2.5 text-right">Target (Hadaf)</th>
                  <th className="p-2.5 text-right">Live Sales Done</th>
                  <th className="p-2.5 text-center">Progress</th>
                  <th className="p-2.5 text-right">Visits / Goal</th>
                  <th className="p-2.5 text-right">Commission</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((t) => {
                  const {
                    actualSales,
                    actualVisits,
                    pct,
                    comm,
                    dynamicStatus,
                    invoicesCount,
                  } = getDynamicTargetMetrics(t);
                  const isSelected = selectedIds.includes(t.id);

                  return (
                    <tr
                      key={t.id}
                      className={`transition-colors ${
                        isSelected
                          ? "bg-teal-50/40 dark:bg-teal-950/30"
                          : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                      }`}
                    >
                      <td className="w-10 p-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(t.id)}
                          className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                      </td>

                      {/* Staff Account & Role */}
                      <td className="p-2.5">
                        <div className="flex items-center gap-2">
                          <div>
                            <span className="font-bold text-slate-900 dark:text-slate-100 block">
                              {t.repName}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {getRoleBadge(t.userRole, t.repName)}
                              {t.userEmail && (
                                <span className="text-[10px] text-slate-400 hidden sm:inline">
                                  {t.userEmail}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Month & Area */}
                      <td className="p-2.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                          {t.month}
                        </span>
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          {t.territory}
                        </span>
                      </td>

                      {/* Target Quota */}
                      <td className="p-2.5 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                        {formatPKR(t.monthlyQuotaPkr)}
                      </td>

                      {/* Sales Done */}
                      <td className="p-2.5 text-right font-mono">
                        <span className="font-black text-emerald-600 dark:text-emerald-400 block">
                          {formatPKR(actualSales)}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {invoicesCount} invoice(s)
                        </span>
                      </td>

                      {/* Progress Bar */}
                      <td className="p-2.5 text-center w-36">
                        <div className="flex items-center justify-between text-[10px] mb-1 font-mono">
                          <span className="font-bold text-slate-700 dark:text-slate-300">{pct}%</span>
                          <span className="text-slate-400">
                            {formatPKR(Math.max(0, t.monthlyQuotaPkr - actualSales))} left
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              pct >= 100
                                ? "bg-emerald-500"
                                : pct >= 50
                                ? "bg-teal-500"
                                : "bg-amber-500"
                            }`}
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                      </td>

                      {/* Visits Done / Goal */}
                      <td className="p-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {actualVisits}
                        </span>{" "}
                        / {t.targetVisitsCount}
                      </td>

                      {/* Commission */}
                      <td className="p-2.5 text-right font-mono">
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {formatPKR(comm)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          @{t.commissionRatePercent || 2.5}%
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            dynamicStatus === "ahead"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              : dynamicStatus === "on_track"
                              ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300 border border-teal-200 dark:border-teal-800"
                              : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                          }`}
                        >
                          {dynamicStatus === "ahead"
                            ? "TARGET COMPLETED"
                            : dynamicStatus === "on_track"
                            ? "ON TRACK"
                            : "BEHIND TARGET"}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="p-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(t)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Edit Target"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTarget(t)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                            title="Delete Target"
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
        )}
      </div>

      {/* Create / Edit Target Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Target className="w-5 h-5 text-teal-600" />
                <span>
                  {editingTargetId ? "Edit Sales Target" : "Assign Sales Target to Staff / Partner"}
                </span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitTarget} className="space-y-4 text-xs">
              {/* Select Staff Member from Staff Accounts */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Staff Member / Partner (عملے یا پارٹنر کا اکاؤنٹ) *
                </label>
                <select
                  required
                  value={formUserId}
                  onChange={(e) => handleStaffUserChange(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">-- Choose Account from Staff Accounts --</option>
                  {activeStaffAccounts.map((user) => (
                    <option key={user.id} value={user.id}>
                      {normalizeUserDisplayName(user.displayName, user.email)} (
                      {getUserRoleLabel(user.role)}) &bull; {user.email}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
                  <span>Only accounts created in Staff Accounts can be assigned targets.</span>
                  <Link
                    href="/users"
                    target="_blank"
                    className="text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-1 font-semibold"
                  >
                    Manage Staff Accounts <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {/* Selected Staff Details Card */}
              {formUserId && (
                <div className="p-3 rounded-xl border border-teal-100 dark:border-teal-900/50 bg-teal-50/40 dark:bg-teal-950/20 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {formRepName}
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      {formUserEmail} &bull; {formTerritory || "General Territory"}
                    </span>
                  </div>
                  <div>{getRoleBadge(formUserRole, formRepName)}</div>
                </div>
              )}

              {/* Month Selector */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Target Month (ٹارگٹ کا مہینہ) *
                </label>
                <select
                  required
                  value={formMonth}
                  onChange={(e) => setFormMonth(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {monthOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {/* Territory / Area */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Assigned Territory / Area (علاقہ / شہر) *
                </label>
                <input
                  type="text"
                  required
                  value={formTerritory}
                  onChange={(e) => setFormTerritory(e.target.value)}
                  placeholder="e.g. Lahore North, Faisalabad City, Multan Region..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Sales Target Amount */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Sales Target Amount (کل سیلز ہدف PKR) *
                  </label>
                  <span className="font-bold font-mono text-teal-600 dark:text-teal-400">
                    {formatPKR(formQuota)}
                  </span>
                </div>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="500000"
                  value={formQuota === 0 ? "" : formQuota}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setFormQuota(raw === "" ? 0 : Number(raw) || 0);
                  }}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {[250000, 500000, 750000, 1000000, 1500000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setFormQuota(amt)}
                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300"
                    >
                      +{formatPKR(amt)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid: Visits Goal & Commission % */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Doctor / Shop Visits Goal *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="80"
                    value={formTargetVisits === 0 ? "" : formTargetVisits}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFormTargetVisits(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Monthly visits to clinics & medical stores
                  </span>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Commission Rate (%)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    required
                    placeholder="2.5"
                    value={formCommissionRate}
                    onChange={(e) => setFormCommissionRate(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                  <span className="text-[10px] text-slate-400 block mt-1">
                    Bonus commission percentage on sales
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20 flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{editingTargetId ? "Update Target" : "Save Target"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Delete Modal */}
      <BulkDeleteModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        entityName="Sales Targets"
        selectedCount={selectedIds.length}
        totalCount={targets.length}
        countsByScope={scopeCounts}
        onConfirmDelete={handleExecuteBulkDelete}
        isDeleting={isDeleting}
      />

      {/* Single Delete Modal */}
      <SingleDeleteModal
        isOpen={!!deletingTarget}
        onClose={() => setDeletingTarget(null)}
        itemName={`${deletingTarget?.repName || ""} (${deletingTarget?.month || ""})`}
        title="Delete Sales Target"
        onConfirm={handleExecuteSingleDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
