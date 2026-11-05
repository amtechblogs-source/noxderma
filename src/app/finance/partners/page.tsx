"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Users2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Calendar,
  Filter,
  Printer,
  Share2,
  Trash2,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Search,
  Building,
  CreditCard,
  Edit2,
  Check,
  TrendingUp,
  Percent,
  Coins,
  Receipt,
  FileText,
  X,
  Phone,
  MapPin,
  Mail,
  PieChart,
  UserPlus,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { offlineDb } from "@/lib/offline/db";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import {
  DateFilterState,
  DateRangePreset,
  createDefaultDateFilter,
  isRecordInDateRange,
  getDateFilterDescription,
} from "@/lib/dateFilter";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";
import { db as firestoreDb } from "@/lib/firebase/config";
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDoc,
} from "firebase/firestore";
import {
  scheduleCloudUpsert,
  scheduleCloudDelete,
  sanitizeForFirestore,
} from "@/lib/offline/cloudSync";
import { recordActivity } from "@/lib/audit/auditTracker";
import {
  computeDateScopeCounts,
  getItemsInScope,
} from "@/lib/dateFilter";
import {
  BulkDeleteModal,
  SingleDeleteModal,
  type DeleteScopeType,
} from "@/components/common/BulkDeleteModal";
import type {
  PartnerTransaction,
  PartnerTransactionType,
  BusinessSettings,
  PartnerConfig,
} from "@/types";
import { PARTNER_THEMES, getPartnerTheme, DEFAULT_PARTNERS } from "@/lib/partners";

// Helper: Pakistani Rupees to Words
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

  const rounded = Math.round(Math.abs(num));
  return `${inWords(rounded).trim()} Rupees Only`;
}

// Non-blocking firestore sync helper that times out quickly and delegates to offline queue
function firestoreSyncBackground(promise: Promise<any>, fallback: () => void, timeoutMs = 1500) {
  let settled = false;
  const timeoutId = setTimeout(() => {
    if (!settled) {
      settled = true;
      try {
        fallback();
      } catch (e) {
        console.warn("Fallback cloud sync warning:", e);
      }
    }
  }, timeoutMs);

  promise
    .then(() => {
      settled = true;
      clearTimeout(timeoutId);
    })
    .catch((err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        try {
          fallback();
        } catch (e) {
          console.warn("Fallback cloud sync warning:", e);
        }
      }
    });
}

// Helper: Extract timestamp for granular sorting (createdAt ISO or ID timestamp)
function getPartnerTxTime(tx: PartnerTransaction): number {
  if (tx.createdAt) {
    const time = new Date(tx.createdAt).getTime();
    if (!isNaN(time) && time > 0) return time;
  }
  const match = tx.id.match(/\d{10,13}/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  const dateObj = new Date(tx.date);
  return !isNaN(dateObj.getTime()) ? dateObj.getTime() : 0;
}

// Comparator: Latest entries on TOP (Date DESC, then Creation Timestamp DESC)
function comparePartnerTxNewestFirst(a: PartnerTransaction, b: PartnerTransaction): number {
  const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
  if (dateDiff !== 0) return dateDiff;
  const bTime = getPartnerTxTime(b);
  const aTime = getPartnerTxTime(a);
  if (bTime !== aTime) return bTime - aTime;
  return b.id.localeCompare(a.id);
}

// Helper: Clean partner name from any parenthetical tag like (Aap / Owner)
function cleanPartnerName(name: string, fallback: string): string {
  if (!name) return fallback;
  const stripped = name.replace(/\s*\([^)]*\)/g, "").trim();
  return stripped || fallback;
}

export default function PartnersKhataPage() {
  const { currentUser } = useAuth();

  const [transactions, setTransactions] = useState<PartnerTransaction[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);

  // Dynamic Multi-Partner Management State
  const [partners, setPartners] = useState<PartnerConfig[]>(DEFAULT_PARTNERS);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const isPartnerModalOpenRef = React.useRef(false);
  useEffect(() => {
    isPartnerModalOpenRef.current = isPartnerModalOpen;
  }, [isPartnerModalOpen]);
  const [editingPartnerList, setEditingPartnerList] = useState<PartnerConfig[]>([]);
  const [partnerToDelete, setPartnerToDelete] = useState<PartnerConfig | null>(null);
  const [isDeleteWarningModalOpen, setIsDeleteWarningModalOpen] = useState(false);

  // Profit Distribution Calculator State
  const [distributableProfit, setDistributableProfit] = useState<number>(100000);
  const [showProfitDistributorModal, setShowProfitDistributorModal] = useState(false);

  // Universal Date Filter (Same as other Noxderma modules)
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [selectedPartnerFilter, setSelectedPartnerFilter] = useState<string>("all");
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<"all" | "investment" | "withdrawal" | "profit_payout">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal State for Add Transaction
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [partnerId, setPartnerId] = useState<string>("partner_1");
  const [type, setType] = useState<PartnerTransactionType>("investment");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "cheque" | "online">("bank_transfer");
  const [description, setDescription] = useState<string>("");
  const [reference, setReference] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Individual Transaction Slip Modal State
  const [slipTx, setSlipTx] = useState<PartnerTransaction | null>(null);

  // Selection state
  const [selectedTxIds, setSelectedTxIds] = useState<string[]>([]);

  // Bulk Delete Modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Single Delete Modal state
  const [deletingTx, setDeletingTx] = useState<PartnerTransaction | null>(null);

  // Edit Modal State
  const [editingTx, setEditingTx] = useState<PartnerTransaction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editPartnerId, setEditPartnerId] = useState<string>("partner_1");
  const [editType, setEditType] = useState<PartnerTransactionType>("investment");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editDate, setEditDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [editPaymentMethod, setEditPaymentMethod] = useState<"cash" | "bank_transfer" | "cheque" | "online">("bank_transfer");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editReference, setEditReference] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Helper: Resolve dynamic partner name
  const getPartnerName = (id: string, fallback?: string): string => {
    const found = partners.find((p) => p.id === id);
    if (found) return found.name;
    return fallback || `Partner (${id})`;
  };

  const getPartnerIndex = (id: string): number => {
    const idx = partners.findIndex((p) => p.id === id);
    return idx >= 0 ? idx : 0;
  };

  // 1. Initial Load from Local Cache (IndexedDB & LocalStorage)
  const loadData = async () => {
    try {
      const [list, settings] = await Promise.all([
        offlineDb.partnerTransactions.toArray(),
        offlineDb.settings.get("primary"),
      ]);
      list.sort(comparePartnerTxNewestFirst);
      setTransactions(list);
      setBusinessSettings(settings || null);

      // Load partner configs
      const savedConfigsRaw = localStorage.getItem("nox_partner_configs");
      if (savedConfigsRaw) {
        try {
          const parsed = JSON.parse(savedConfigsRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPartners(parsed);
          }
        } catch {}
      } else {
        // Fallback to legacy keys
        const savedP1 = localStorage.getItem("nox_partner_1_name");
        const savedP2 = localStorage.getItem("nox_partner_2_name");
        const initial = [
          { id: "partner_1", name: cleanPartnerName(savedP1 || "", "Partner 1") },
          { id: "partner_2", name: cleanPartnerName(savedP2 || "", "Partner 2") },
        ];
        setPartners(initial);
        localStorage.setItem("nox_partner_configs", JSON.stringify(initial));
      }
    } catch (err) {
      console.warn("Failed to load partner transactions locally:", err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Real-time Two-Way Cloud Firestore Synchronization (Mobile + Desktop)
  useEffect(() => {
    loadData();

    // Listener A: Sync Partner Configurations in real-time
    const unsubConfig = onSnapshot(
      doc(firestoreDb, "partnerSettings", "config"),
      async (snapshot) => {
        const localRaw = localStorage.getItem("nox_partner_configs");
        const localUpdatedAt = localStorage.getItem("nox_partner_configs_updated_at") || "";
        let localPartners: PartnerConfig[] = [];
        if (localRaw) {
          try {
            localPartners = JSON.parse(localRaw);
          } catch {}
        }
        const legacyP1 = localStorage.getItem("nox_partner_1_name");
        const legacyP2 = localStorage.getItem("nox_partner_2_name");
        const localHasCustom =
          localPartners.some((p) => p.name && p.name !== "Partner 1" && p.name !== "Partner 2") ||
          (legacyP1 && legacyP1 !== "Partner 1") ||
          (legacyP2 && legacyP2 !== "Partner 2");

        if (snapshot.exists()) {
          const data = snapshot.data();
          const remotePartners = data?.partners;
          const remoteUpdatedAt = data?.updatedAt || "";
          const remoteHasCustom =
            Array.isArray(remotePartners) &&
            remotePartners.some((p: any) => p.name && p.name !== "Partner 1" && p.name !== "Partner 2");

          const isLocalNewer =
            Boolean(localUpdatedAt) &&
            localPartners.length > 0 &&
            (!remoteUpdatedAt || new Date(localUpdatedAt).getTime() > new Date(remoteUpdatedAt).getTime());

          if (isLocalNewer || (!remoteHasCustom && localHasCustom && localPartners.length > 0)) {
            // Local has newer/undone or custom partner config, push up to Firestore
            try {
              const syncIso = localUpdatedAt || new Date().toISOString();
              setPartners(localPartners);
              await setDoc(
                doc(firestoreDb, "partnerSettings", "config"),
                { partners: localPartners, updatedAt: syncIso },
                { merge: true }
              );
            } catch (e) {
              console.warn("Failed to push custom partner config:", e);
            }
          } else if (Array.isArray(remotePartners) && remotePartners.length > 0) {
            if (!isPartnerModalOpenRef.current) {
              setPartners(remotePartners);
              localStorage.setItem("nox_partner_configs", JSON.stringify(remotePartners));
              if (remoteUpdatedAt) {
                localStorage.setItem("nox_partner_configs_updated_at", remoteUpdatedAt);
              }
              if (remotePartners[0]) localStorage.setItem("nox_partner_1_name", remotePartners[0].name);
              if (remotePartners[1]) localStorage.setItem("nox_partner_2_name", remotePartners[1].name);
            }
          }
        } else {
          // Document does not exist in Firestore yet!
          let toPush = localPartners;
          if (!toPush || toPush.length === 0) {
            toPush = [
              { id: "partner_1", name: cleanPartnerName(legacyP1 || "", "Partner 1") },
              { id: "partner_2", name: cleanPartnerName(legacyP2 || "", "Partner 2") },
            ];
          }
          try {
            const nowIso = new Date().toISOString();
            await setDoc(
              doc(firestoreDb, "partnerSettings", "config"),
              { partners: toPush, updatedAt: nowIso },
              { merge: true }
            );
            setPartners(toPush);
            localStorage.setItem("nox_partner_configs", JSON.stringify(toPush));
            localStorage.setItem("nox_partner_configs_updated_at", nowIso);
          } catch (e) {
            console.warn("Failed to initialize partner config in Firestore:", e);
          }
        }
      },
      (err) => {
        console.warn("[CloudSync] Partner settings snapshot error:", err);
      }
    );

    // Listener B: Sync Partner Transactions in real-time (incremental docChanges so deleted/undone items are never resurrected)
    const unsubTx = onSnapshot(
      collection(firestoreDb, "partnerTransactions"),
      async (snapshot) => {
        const changes = snapshot.docChanges();
        const toPut: PartnerTransaction[] = [];
        const toDelete: string[] = [];

        for (const change of changes) {
          const docId = change.doc.id;
          if (change.type === "added" || change.type === "modified") {
            const data = change.doc.data();
            toPut.push({ ...data, id: docId } as PartnerTransaction);
          } else if (change.type === "removed") {
            toDelete.push(docId);
          }
        }

        if (toPut.length > 0) {
          await offlineDb.partnerTransactions.bulkPut(toPut).catch(console.warn);
        }
        if (toDelete.length > 0) {
          await offlineDb.partnerTransactions.bulkDelete(toDelete).catch(console.warn);
        }

        if (toPut.length > 0 || toDelete.length > 0) {
          const latestList = await offlineDb.partnerTransactions.toArray();
          latestList.sort(comparePartnerTxNewestFirst);
          setTransactions(latestList);
        }
      },
      (err) => {
        console.warn("[CloudSync] Partner transactions snapshot error:", err);
      }
    );

    // Listener C: dexie background sync events
    let syncTimer: any = null;
    const handleSync = () => {
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        offlineDb.partnerTransactions.toArray().then((list) => {
          list.sort(comparePartnerTxNewestFirst);
          setTransactions(list);
        });
        const savedConfigsRaw = localStorage.getItem("nox_partner_configs");
        if (savedConfigsRaw && !isPartnerModalOpenRef.current) {
          try {
            const parsed = JSON.parse(savedConfigsRaw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPartners(parsed);
            }
          } catch {}
        }
      }, 200);
    };
    window.addEventListener("noxderma-cloud-synced", handleSync);

    return () => {
      unsubConfig();
      unsubTx();
      if (syncTimer) clearTimeout(syncTimer);
      window.removeEventListener("noxderma-cloud-synced", handleSync);
    };
  }, []);

  // Ensure default partnerId selection is valid whenever partners change
  useEffect(() => {
    if (partners.length > 0) {
      if (!partners.some((p) => p.id === partnerId)) {
        setPartnerId(partners[0].id);
      }
      if (!partners.some((p) => p.id === editPartnerId)) {
        setEditPartnerId(partners[0].id);
      }
    }
  }, [partners, partnerId, editPartnerId]);

  // 3. Dynamic Partner Calculations (Investment, Advances, Ratio, Net Capital)
  const { partnerStatsMap, combinedTotalInvestment } = useMemo(() => {
    const stats: Record<
      string,
      {
        partner: PartnerConfig;
        totalInvestment: number;
        totalAdvance: number;
        outstandingAdvance: number;
        totalProfitReceived: number;
        netCapital: number;
        ratioPercent: number;
      }
    > = {};

    let totalCombined = 0;

    partners.forEach((p) => {
      const pTxs = transactions.filter((t) => t.partnerId === p.id);
      const totalInvestment = pTxs
        .filter((t) => t.type === "investment" || t.type === "in")
        .reduce((sum, t) => sum + t.amount, 0);

      const totalAdvance = pTxs
        .filter((t) => t.type === "withdrawal" || t.type === "out")
        .reduce((sum, t) => sum + t.amount, 0);

      const outstandingAdvance = pTxs
        .filter((t) => (t.type === "withdrawal" || t.type === "out") && !t.isSettled)
        .reduce((sum, t) => sum + t.amount, 0);

      const totalProfitReceived = pTxs
        .filter((t) => t.type === "profit_payout")
        .reduce((sum, t) => sum + t.amount, 0);

      const netCapital = totalInvestment - totalAdvance;

      totalCombined += totalInvestment;

      stats[p.id] = {
        partner: p,
        totalInvestment,
        totalAdvance,
        outstandingAdvance,
        totalProfitReceived,
        netCapital,
        ratioPercent: 0,
      };
    });

    // Compute automatic investment ratios
    const count = partners.length || 1;
    partners.forEach((p) => {
      if (totalCombined <= 0) {
        stats[p.id].ratioPercent = parseFloat((100 / count).toFixed(2));
      } else {
        stats[p.id].ratioPercent = parseFloat(
          ((stats[p.id].totalInvestment / totalCombined) * 100).toFixed(2)
        );
      }
    });

    return { partnerStatsMap: stats, combinedTotalInvestment: totalCombined };
  }, [partners, transactions]);

  // 4. Live Dynamic Profit Distribution Breakdown across all active partners
  const profitDistributionPreview = useMemo(() => {
    let allocatedGross = 0;
    return partners.map((p, idx) => {
      const isLast = idx === partners.length - 1;
      const stat = partnerStatsMap[p.id] || {
        ratioPercent: 0,
        outstandingAdvance: 0,
      };

      const grossProfit = isLast
        ? Math.max(0, distributableProfit - allocatedGross)
        : Math.round((distributableProfit * stat.ratioPercent) / 100);
      allocatedGross += grossProfit;

      const advanceToDeduct = Math.min(grossProfit, stat.outstandingAdvance);
      const netPayable = Math.max(0, grossProfit - advanceToDeduct);

      return {
        partner: p,
        ratioPercent: stat.ratioPercent,
        grossProfit,
        advanceToDeduct,
        netPayable,
        outstandingAdvance: stat.outstandingAdvance,
      };
    });
  }, [partners, partnerStatsMap, distributableProfit]);

  // 5. Filtered Transactions (Unified date filter, partner, type & search)
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((t) => {
        // Partner Filter
        if (selectedPartnerFilter !== "all" && t.partnerId !== selectedPartnerFilter) return false;

        // Type Filter
        if (selectedTypeFilter !== "all") {
          if (selectedTypeFilter === "investment" && t.type !== "investment" && t.type !== "in") return false;
          if (selectedTypeFilter === "withdrawal" && t.type !== "withdrawal" && t.type !== "out") return false;
          if (selectedTypeFilter === "profit_payout" && t.type !== "profit_payout") return false;
        }

        // Universal Date Range Filter
        if (!isRecordInDateRange(t.date || t.createdAt, dateFilter)) return false;

        // Search Filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const pName = getPartnerName(t.partnerId, t.partnerName).toLowerCase();
          return (
            t.description?.toLowerCase().includes(q) ||
            t.paymentMethod?.toLowerCase().includes(q) ||
            t.reference?.toLowerCase().includes(q) ||
            pName.includes(q)
          );
        }

        return true;
      })
      .sort(comparePartnerTxNewestFirst);
  }, [transactions, selectedPartnerFilter, selectedTypeFilter, dateFilter, searchQuery, partners]);

  // Compute date scope counts for Bulk Delete modal
  const scopeCounts = useMemo(() => {
    return computeDateScopeCounts(
      transactions,
      (t) => t.date || t.createdAt,
      selectedTxIds.length
    );
  }, [transactions, selectedTxIds.length]);

  // Selection handlers
  const handleToggleSelectAll = () => {
    if (selectedTxIds.length === filteredTransactions.length && filteredTransactions.length > 0) {
      setSelectedTxIds([]);
    } else {
      setSelectedTxIds(filteredTransactions.map((t) => t.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedTxIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // =========================================================================
  // PARTNER MANAGEMENT HANDLERS (Add, Edit with Smooth Backspace, Remove)
  // =========================================================================

  const handleOpenPartnerModal = () => {
    // Deep clone so active typing is completely isolated from background sync
    setEditingPartnerList(JSON.parse(JSON.stringify(partners)));
    setIsPartnerModalOpen(true);
  };

  const handleUpdatePartnerName = (index: number, newName: string) => {
    setEditingPartnerList((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], name: newName };
      return updated;
    });
  };

  const handleAddPartner = () => {
    const nextIdx = editingPartnerList.length + 1;
    const newPartner: PartnerConfig = {
      id: `partner_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: `Partner ${nextIdx}`,
      createdAt: new Date().toISOString(),
    };
    setEditingPartnerList((prev) => [...prev, newPartner]);
  };

  const handlePromptDeletePartner = (partner: PartnerConfig) => {
    if (editingPartnerList.length <= 1) {
      alert("Kam az kam 1 partner ka hona zaroori hai.");
      return;
    }
    setPartnerToDelete(partner);
    setIsDeleteWarningModalOpen(true);
  };

  const handleConfirmDeletePartner = () => {
    if (!partnerToDelete) return;
    setEditingPartnerList((prev) => prev.filter((p) => p.id !== partnerToDelete.id));
    setIsDeleteWarningModalOpen(false);
    setPartnerToDelete(null);
  };

  const handleSavePartnerModal = async () => {
    const cleaned = editingPartnerList.map((p, idx) => ({
      ...p,
      name: cleanPartnerName(p.name, `Partner ${idx + 1}`),
    }));

    if (cleaned.length === 0) {
      alert("Kam az kam 1 partner ka hona zaroori hai.");
      return;
    }

    const previousPartners = partners.map((p) => ({ ...p }));
    const nowIso = new Date().toISOString();

    // 1. Commit to React state immediately
    setPartners(cleaned);
    setIsPartnerModalOpen(false);

    // 2. Commit to LocalStorage
    localStorage.setItem("nox_partner_configs", JSON.stringify(cleaned));
    localStorage.setItem("nox_partner_configs_updated_at", nowIso);
    if (cleaned[0]) localStorage.setItem("nox_partner_1_name", cleaned[0].name);
    if (cleaned[1]) localStorage.setItem("nox_partner_2_name", cleaned[1].name);

    // 3. Sync to Cloud Firestore
    firestoreSyncBackground(
      setDoc(
        doc(firestoreDb, "partnerSettings", "config"),
        { partners: cleaned, updatedAt: nowIso },
        { merge: true }
      ),
      () => scheduleCloudUpsert("partnerSettings", "config", { partners: cleaned, updatedAt: nowIso })
    );

    // 4. Audit Trail (with full snapshotBefore & snapshotAfter so Undo rolls back accurately)
    recordActivity({
      userId: currentUser?.id || "usr_admin",
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      action: "update",
      entityType: "partner_settings",
      entityId: "partnerSettings_config",
      entityTitle: `Updated Partners Configuration (${cleaned.length} Partners)`,
      details: `Active partners: ${cleaned.map((p) => p.name).join(", ")}`,
      snapshotBefore: { partners: previousPartners },
      snapshotAfter: { partners: cleaned },
      canUndo: true,
    }).catch(console.warn);
  };

  // =========================================================================
  // TRANSACTION SUBMISSIONS
  // =========================================================================

  // Handle Add Transaction Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Barah-e-karam durust raqam (amount) darj karein.");
      return;
    }
    if (!description.trim()) {
      alert("Tafseel ya maqsad (description) likhna zaroori hai.");
      return;
    }

    setIsSubmitting(true);
    try {
      const pName = getPartnerName(partnerId);
      const newTx: PartnerTransaction = {
        id: `ptx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        partnerId,
        partnerName: pName,
        type,
        amount: numAmount,
        date,
        paymentMethod,
        description: description.trim(),
        reference: reference.trim() || undefined,
        createdById: currentUser?.id,
        createdByName: currentUser?.displayName || "Admin",
        createdAt: new Date().toISOString(),
      };

      // 1. Save locally in IndexedDB immediately
      await offlineDb.partnerTransactions.add(newTx);

      // 2. Update React state immediately
      setTransactions((prev) => [newTx, ...prev].sort(comparePartnerTxNewestFirst));

      // 3. Close modal immediately
      setIsModalOpen(false);
      setAmount("");
      setDescription("");
      setReference("");
      setIsSubmitting(false);

      // 4. Background cloud sync
      firestoreSyncBackground(
        setDoc(doc(firestoreDb, "partnerTransactions", newTx.id), sanitizeForFirestore(newTx), { merge: true }),
        () => scheduleCloudUpsert("partnerTransactions", newTx.id, newTx)
      );

      // 5. Audit record in background
      recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "create",
        entityType: "partner_transaction",
        entityId: newTx.id,
        entityTitle: `Added Partner ${newTx.type} - ${newTx.partnerName}`,
        details: `Recorded ${newTx.type} of PKR ${newTx.amount.toLocaleString()} for ${newTx.partnerName}`,
        snapshotAfter: newTx,
        canUndo: true,
      }).catch(console.warn);
    } catch (err) {
      console.error("Error saving partner transaction:", err);
      alert("Transaction save karne mein masla aaya.");
      setIsSubmitting(false);
    }
  };

  // Record Profit Share directly into Ledger for all active partners
  const handleRecordDistributedProfit = async () => {
    if (distributableProfit <= 0) {
      alert("Distributable profit ki raqam 0 se zyada honi chahiye.");
      return;
    }
    if (partners.length === 0) {
      alert("Koi partner mojood nahi hai.");
      return;
    }

    let confirmMsg = `Kya aap waqai Rs ${distributableProfit.toLocaleString()} profit tamam partners ke darmiyan record karna chahte hain?\n\n`;
    profitDistributionPreview.forEach((item) => {
      confirmMsg += `• ${item.partner.name} (${item.ratioPercent}%):\n`;
      confirmMsg += `   Gross Profit: ${formatPKR(item.grossProfit)}\n`;
      if (item.advanceToDeduct > 0) {
        confirmMsg += `   Advance Cut (پیشگی کٹوتی): -${formatPKR(item.advanceToDeduct)}\n`;
      }
      confirmMsg += `   Net Payout: ${formatPKR(item.netPayable)}\n\n`;
    });

    if (!confirm(confirmMsg)) return;

    setIsSubmitting(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const nowIso = new Date().toISOString();

      const newTxList: PartnerTransaction[] = [];
      const allSettledAdvanceUpdates: PartnerTransaction[] = [];
      const previousUnsettledAdvances: PartnerTransaction[] = [];

      profitDistributionPreview.forEach((item, idx) => {
        const pTxs = transactions.filter((t) => t.partnerId === item.partner.id);
        const settledIds: string[] = [];
        let remainingDeduction = item.advanceToDeduct;

        for (const t of pTxs) {
          if ((t.type === "withdrawal" || t.type === "out") && !t.isSettled && remainingDeduction > 0) {
            settledIds.push(t.id);
            remainingDeduction -= t.amount;
            previousUnsettledAdvances.push({ ...t, isSettled: false });
            allSettledAdvanceUpdates.push({ ...t, isSettled: true });
          }
        }

        const tx: PartnerTransaction = {
          id: `ptx_profit_${item.partner.id}_${Date.now()}_${idx}`,
          partnerId: item.partner.id,
          partnerName: item.partner.name,
          type: "profit_payout",
          amount: item.netPayable,
          date: today,
          paymentMethod: "bank_transfer",
          description: `Profit Share (${item.ratioPercent}% of Rs ${distributableProfit.toLocaleString()}): Gross ${formatPKR(item.grossProfit)}${
            item.advanceToDeduct > 0 ? ` - Advance Cut ${formatPKR(item.advanceToDeduct)}` : ""
          } = Net Paid ${formatPKR(item.netPayable)}`,
          reference: `PROFIT-${today}`,
          grossProfit: item.grossProfit,
          advanceDeducted: item.advanceToDeduct,
          netPaid: item.netPayable,
          settledAdvanceTxIds: settledIds,
          createdById: currentUser?.id,
          createdByName: currentUser?.displayName || "Admin",
          createdAt: nowIso,
        };
        newTxList.push(tx);
      });

      // 1. Update Dexie immediately
      if (allSettledAdvanceUpdates.length > 0) {
        await offlineDb.partnerTransactions.bulkPut(allSettledAdvanceUpdates);
      }
      await offlineDb.partnerTransactions.bulkAdd(newTxList);

      // 2. Update React state immediately
      setTransactions((prev) => {
        const updateMap = new Map(allSettledAdvanceUpdates.map((u) => [u.id, u]));
        const updatedPrev = prev.map((item) => updateMap.get(item.id) || item);
        return [...newTxList, ...updatedPrev].sort(comparePartnerTxNewestFirst);
      });

      // 3. Close modal
      setShowProfitDistributorModal(false);
      setIsSubmitting(false);

      // 4. Background cloud sync
      firestoreSyncBackground(
        Promise.all([
          ...newTxList.map((tx) =>
            setDoc(doc(firestoreDb, "partnerTransactions", tx.id), sanitizeForFirestore(tx), { merge: true })
          ),
          ...allSettledAdvanceUpdates.map((u) =>
            setDoc(doc(firestoreDb, "partnerTransactions", u.id), sanitizeForFirestore(u), { merge: true })
          ),
        ]),
        () => {
          newTxList.forEach((tx) => scheduleCloudUpsert("partnerTransactions", tx.id, tx));
          allSettledAdvanceUpdates.forEach((u) => scheduleCloudUpsert("partnerTransactions", u.id, u));
        }
      );

      // 5. Audit record
      recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "create",
        entityType: "partner_transaction",
        entityId: newTxList.map((t) => t.id).join(", "),
        entityTitle: `Distributed Profit - ${partners.map((p) => p.name).join(" & ")}`,
        details: `Distributed total PKR ${distributableProfit.toLocaleString()} profit across ${partners.length} partners.`,
        snapshotBefore: { unsettledAdvances: previousUnsettledAdvances },
        snapshotAfter: { createdTxs: newTxList, settledAdvances: allSettledAdvanceUpdates },
        canUndo: true,
      }).catch(console.warn);

      alert("Tamam partners ka profit share (advance cut karke) kamyabi se khate mein darj ho gaya hai!");
    } catch (err) {
      console.error("Error recording profit:", err);
      alert("Profit share record karne mein masla aaya.");
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (tx: PartnerTransaction) => {
    setEditingTx(tx);
    setEditPartnerId(tx.partnerId || partners[0]?.id || "partner_1");
    setEditType(tx.type);
    setEditAmount(String(tx.amount));
    setEditDate(tx.date || new Date().toISOString().split("T")[0]);
    setEditPaymentMethod(tx.paymentMethod || "bank_transfer");
    setEditDescription(tx.description || "");
    setEditReference(tx.reference || "");
    setIsEditModalOpen(true);
  };

  // Save Edited Transaction
  const handleSaveEditTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    const numAmount = parseFloat(editAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      alert("Barah-e-karam durust raqam (amount) darj karein.");
      return;
    }
    if (!editDescription.trim()) {
      alert("Tafseel ya maqsad (description) likhna zaroori hai.");
      return;
    }

    setIsSavingEdit(true);
    try {
      const previousTx: PartnerTransaction = { ...editingTx };
      const pName = getPartnerName(editPartnerId);
      const updatedTx: PartnerTransaction = {
        ...editingTx,
        partnerId: editPartnerId,
        partnerName: pName,
        type: editType,
        amount: numAmount,
        date: editDate,
        paymentMethod: editPaymentMethod,
        description: editDescription.trim(),
        reference: editReference.trim() || undefined,
      };

      // 1. Close modal and update React state immediately (0ms instant response)
      setIsEditModalOpen(false);
      setEditingTx(null);
      setIsSavingEdit(false);

      setTransactions((prev) =>
        prev.map((t) => (t.id === updatedTx.id ? updatedTx : t)).sort(comparePartnerTxNewestFirst)
      );

      // 2. Update IndexedDB in background
      await offlineDb.partnerTransactions.put(updatedTx);

      // 3. Background non-blocking sync
      firestoreSyncBackground(
        setDoc(doc(firestoreDb, "partnerTransactions", updatedTx.id), sanitizeForFirestore(updatedTx), { merge: true }),
        () => scheduleCloudUpsert("partnerTransactions", updatedTx.id, updatedTx)
      );

      // 4. Audit record in background
      recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "update",
        entityType: "partner_transaction",
        entityId: updatedTx.id,
        entityTitle: `Updated Partner Transaction - ${updatedTx.partnerName}`,
        details: `Updated ${updatedTx.type} of PKR ${updatedTx.amount.toLocaleString()} for ${updatedTx.partnerName}`,
        snapshotBefore: previousTx,
        snapshotAfter: updatedTx,
        canUndo: true,
      }).catch(console.warn);
    } catch (err: any) {
      console.error("Error updating partner transaction:", err);
      alert("Transaction update karne mein masla aaya: " + (err?.message || ""));
      setIsEditModalOpen(false);
      setEditingTx(null);
      setIsSavingEdit(false);
    }
  };

  // Execute Bulk Delete
  const handleExecuteBulkDelete = async (
    scope: DeleteScopeType,
    customStart?: string,
    customEnd?: string
  ) => {
    try {
      setIsDeleting(true);
      const toDelete = getItemsInScope(
        transactions,
        scope,
        (t) => t.date || t.createdAt,
        (t) => t.id,
        selectedTxIds,
        customStart,
        customEnd
      );

      if (toDelete.length === 0) {
        alert("No matching transactions found to delete.");
        setDeleteModalOpen(false);
        setIsDeleting(false);
        return;
      }

      const idsToDelete = toDelete.map((t) => t.id);

      // Check if any deleted profit payout settled advances, and un-settle them
      const unSettledUpdates: PartnerTransaction[] = [];
      for (const tx of toDelete) {
        if (tx.type === "profit_payout" && tx.settledAdvanceTxIds && tx.settledAdvanceTxIds.length > 0) {
          for (const sid of tx.settledAdvanceTxIds) {
            const adv = transactions.find((t) => t.id === sid);
            if (adv && adv.isSettled) {
              unSettledUpdates.push({ ...adv, isSettled: false });
            }
          }
        }
      }

      // 1. Close modal and update React state immediately (0ms instant response)
      setDeleteModalOpen(false);
      setIsDeleting(false);
      setSelectedTxIds((prev) => prev.filter((id) => !idsToDelete.includes(id)));
      setTransactions((prev) => {
        const updateMap = new Map(unSettledUpdates.map((u) => [u.id, u]));
        return prev
          .filter((t) => !idsToDelete.includes(t.id))
          .map((t) => updateMap.get(t.id) || t);
      });

      // 2. Delete from local IndexedDB in background
      await offlineDb.partnerTransactions.bulkDelete(idsToDelete);
      if (unSettledUpdates.length > 0) {
        await offlineDb.partnerTransactions.bulkPut(unSettledUpdates);
      }

      // 3. Background cloud sync
      firestoreSyncBackground(
        (async () => {
          await Promise.all(idsToDelete.map((id) => deleteDoc(doc(firestoreDb, "partnerTransactions", id))));
          for (const u of unSettledUpdates) {
            await setDoc(doc(firestoreDb, "partnerTransactions", u.id), sanitizeForFirestore(u), { merge: true });
          }
        })(),
        () => {
          idsToDelete.forEach((id) => scheduleCloudDelete("partnerTransactions", id));
          unSettledUpdates.forEach((u) => scheduleCloudUpsert("partnerTransactions", u.id, u));
        }
      );

      // 4. Audit record
      recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "delete",
        entityType: "partner_transaction",
        entityId: idsToDelete.slice(0, 5).join(", "),
        entityTitle: `Bulk deleted ${toDelete.length} partner transaction(s)`,
        details: `Purged ${toDelete.length} partner transactions under scope: ${scope}.`,
        snapshotBefore: toDelete,
        canUndo: true,
      }).catch(console.warn);
    } catch (err: any) {
      console.error("Bulk delete partner transactions failed:", err);
      alert("Transactions delete karne mein masla aaya: " + (err?.message || ""));
      setIsDeleting(false);
    }
  };

  // Execute Single Delete
  const handleExecuteSingleDelete = async () => {
    if (!deletingTx) return;
    const targetId = deletingTx.id;
    const targetTx = deletingTx;

    try {
      const unSettledUpdates: PartnerTransaction[] = [];
      if (targetTx.type === "profit_payout" && targetTx.settledAdvanceTxIds && targetTx.settledAdvanceTxIds.length > 0) {
        for (const sid of targetTx.settledAdvanceTxIds) {
          const adv = transactions.find((t) => t.id === sid);
          if (adv && adv.isSettled) {
            unSettledUpdates.push({ ...adv, isSettled: false });
          }
        }
      }

      // 1. Close modal and update React state immediately (0ms instant response)
      setDeletingTx(null);
      setIsDeleting(false);
      setSelectedTxIds((prev) => prev.filter((id) => id !== targetId));
      setTransactions((prev) => {
        const updateMap = new Map(unSettledUpdates.map((u) => [u.id, u]));
        return prev
          .filter((t) => t.id !== targetId)
          .map((t) => updateMap.get(t.id) || t);
      });

      // 2. Delete from local IndexedDB in background
      await offlineDb.partnerTransactions.delete(targetId);
      if (unSettledUpdates.length > 0) {
        await offlineDb.partnerTransactions.bulkPut(unSettledUpdates);
      }

      // 3. Background cloud sync
      firestoreSyncBackground(
        (async () => {
          await deleteDoc(doc(firestoreDb, "partnerTransactions", targetId));
          for (const u of unSettledUpdates) {
            await setDoc(doc(firestoreDb, "partnerTransactions", u.id), sanitizeForFirestore(u), { merge: true });
          }
        })(),
        () => {
          scheduleCloudDelete("partnerTransactions", targetId);
          unSettledUpdates.forEach((u) => scheduleCloudUpsert("partnerTransactions", u.id, u));
        }
      );

      // 4. Audit record
      recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        action: "delete",
        entityType: "partner_transaction",
        entityId: targetId,
        entityTitle: `Deleted Partner Transaction - ${targetTx.partnerName}`,
        details: `Deleted ${targetTx.type} of PKR ${targetTx.amount.toLocaleString()} for ${targetTx.partnerName}`,
        snapshotBefore: targetTx,
        canUndo: true,
      }).catch(console.warn);
    } catch (err: any) {
      console.error("Delete partner transaction error:", err);
      alert("Transaction delete karne mein masla aaya: " + (err?.message || ""));
      setIsDeleting(false);
    }
  };

  // WhatsApp share statement (Clean, concise & to-the-point)
  const shareWhatsApp = () => {
    const brand = businessSettings?.brandName || "NOXDERMA PHARMACEUTICALS";
    const period = getDateFilterDescription(dateFilter);

    let text = `📊 *PARTNERSHIP AUDIT STATEMENT*\n`;
    text += `🏢 *${brand}*\n`;
    text += `📅 Period: ${period}\n`;
    text += `─────────────────────────\n\n`;

    text += `💰 *CAPITAL & SHARE:*\n`;
    partners.forEach((p) => {
      const stat = partnerStatsMap[p.id];
      text += `• *${p.name}:* ${formatPKR(stat?.totalInvestment || 0)} (${stat?.ratioPercent || 0}%)\n`;
    });
    text += `• *Total Capital:* ${formatPKR(combinedTotalInvestment)}\n\n`;

    text += `💼 *CURRENT NET CAPITAL:*\n`;
    partners.forEach((p) => {
      const stat = partnerStatsMap[p.id];
      text += `• *${p.name}:* ${formatPKR(stat?.netCapital || 0)}\n`;
    });
    text += `─────────────────────────\n`;
    text += `_Generated via Noxderma ERP_`;

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const triggerCleanPrint = () => {
    window.print();
  };

  return (
    <>
      {/* ============================================================== */}
      {/* 1. DEDICATED PRINTABLE INVOICE / STATEMENT (Print Only View)  */}
      {/* ============================================================== */}
      <div className={`hidden ${!slipTx ? "print:block" : ""} text-black bg-white p-4 font-sans text-xs print-page`}>
        {/* Official Branded Header */}
        <OfficialPrintHeader
          title="PARTNERSHIP INVESTMENT & PROFIT AUDIT STATEMENT"
          docRef={`PRT-AUDIT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`}
          period={getDateFilterDescription(dateFilter)}
          settings={businessSettings}
          className="pb-4"
        />

        {/* Partnership Capital & Profit Sharing Table */}
        <div className="my-5">
          <h2 className="text-xs font-black uppercase tracking-wider mb-2 text-black border-b border-black pb-1">
            1. Partnership Capital Ownership &amp; Profit Sharing Ratio
          </h2>
          <table className="w-full text-left border-collapse border border-black text-[11px]">
            <thead className="bg-slate-100">
              <tr className="border-b border-black">
                <th className="p-2 border-r border-black font-black">Audit Metric / Detail</th>
                {partners.map((p) => (
                  <th key={p.id} className="p-2 border-r border-black font-black text-right">
                    {p.name}
                  </th>
                ))}
                <th className="p-2 font-black text-right bg-slate-200">Combined Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black">
              <tr>
                <td className="p-2 border-r border-black font-bold">Total Capital Invested (Sarmayakari)</td>
                {partners.map((p) => (
                  <td key={p.id} className="p-2 border-r border-black font-mono font-bold text-right">
                    {formatPKR(partnerStatsMap[p.id]?.totalInvestment || 0)}
                  </td>
                ))}
                <td className="p-2 font-mono font-black text-right bg-slate-50">{formatPKR(combinedTotalInvestment)}</td>
              </tr>
              <tr className="bg-slate-50">
                <td className="p-2 border-r border-black font-black">Investment Ownership Share (%)</td>
                {partners.map((p) => (
                  <td key={p.id} className="p-2 border-r border-black font-mono font-black text-right">
                    {partnerStatsMap[p.id]?.ratioPercent || 0}%
                  </td>
                ))}
                <td className="p-2 font-mono font-black text-right bg-slate-100">100.0%</td>
              </tr>
              <tr>
                <td className="p-2 border-r border-black font-bold">Total Advance Taken (پیشگی رقم)</td>
                {partners.map((p) => (
                  <td key={p.id} className="p-2 border-r border-black font-mono text-right text-rose-700">
                    -{formatPKR(partnerStatsMap[p.id]?.totalAdvance || 0)}
                  </td>
                ))}
                <td className="p-2 font-mono text-right bg-slate-50">
                  -{formatPKR(
                    partners.reduce((sum, p) => sum + (partnerStatsMap[p.id]?.totalAdvance || 0), 0)
                  )}
                </td>
              </tr>
              <tr>
                <td className="p-2 border-r border-black font-bold">Total Profit Disbursed</td>
                {partners.map((p) => (
                  <td key={p.id} className="p-2 border-r border-black font-mono text-right text-emerald-700">
                    {formatPKR(partnerStatsMap[p.id]?.totalProfitReceived || 0)}
                  </td>
                ))}
                <td className="p-2 font-mono text-right bg-slate-50">
                  {formatPKR(
                    partners.reduce((sum, p) => sum + (partnerStatsMap[p.id]?.totalProfitReceived || 0), 0)
                  )}
                </td>
              </tr>
              <tr className="bg-slate-100 font-black">
                <td className="p-2 border-r border-black font-black">Net Capital Standing (سرمایہ مائنس پیشگی)</td>
                {partners.map((p) => (
                  <td key={p.id} className="p-2 border-r border-black font-mono text-right">
                    {formatPKR(partnerStatsMap[p.id]?.netCapital || 0)}
                  </td>
                ))}
                <td className="p-2 font-mono text-right bg-slate-200">
                  {formatPKR(
                    partners.reduce((sum, p) => sum + (partnerStatsMap[p.id]?.netCapital || 0), 0)
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Transaction History Ledger */}
        <div className="my-5">
          <h2 className="text-xs font-black uppercase tracking-wider mb-2 text-black border-b border-black pb-1">
            2. Detailed Transaction Audit Ledger ({filteredTransactions.length} entries)
          </h2>
          <table className="w-full text-left border-collapse border border-black text-[10px]">
            <thead className="bg-slate-100 border-b border-black">
              <tr>
                <th className="p-1.5 border-r border-black">#</th>
                <th className="p-1.5 border-r border-black">Date</th>
                <th className="p-1.5 border-r border-black">Partner</th>
                <th className="p-1.5 border-r border-black">Transaction Type</th>
                <th className="p-1.5 border-r border-black">Description / Reference</th>
                <th className="p-1.5 border-r border-black">Method</th>
                <th className="p-1.5 text-right font-black">Amount (PKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {filteredTransactions.map((tx, idx) => (
                <tr key={tx.id}>
                  <td className="p-1.5 border-r border-black font-mono">{idx + 1}</td>
                  <td className="p-1.5 border-r border-black font-mono">{tx.date}</td>
                  <td className="p-1.5 border-r border-black font-bold">
                    {getPartnerName(tx.partnerId, tx.partnerName)}
                  </td>
                  <td className="p-1.5 border-r border-black uppercase font-semibold">
                    {tx.type === "investment" || tx.type === "in"
                      ? "Investment (Capital)"
                      : tx.type === "profit_payout"
                        ? "Profit Payout"
                        : "Advance (پیشگی رقم)"}
                  </td>
                  <td className="p-1.5 border-r border-black">
                    {tx.description}
                    {tx.reference && <span className="block text-[9px] text-slate-600">Ref: {tx.reference}</span>}
                  </td>
                  <td className="p-1.5 border-r border-black capitalize">{tx.paymentMethod.replace("_", " ")}</td>
                  <td className="p-1.5 text-right font-mono font-bold">
                    {tx.type === "investment" || tx.type === "in" ? "+" : "-"}
                    {formatPKR(tx.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Official Sign-off Signatures Block */}
        <div className="pt-10 mt-8 border-t-2 border-black grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 text-center text-[10px]">
          {partners.map((p) => (
            <div key={p.id}>
              <div className="border-b border-black pb-8 mb-1"></div>
              <p className="font-black text-black">{p.name}</p>
              <p className="text-slate-600">Partner Signature &amp; Stamp</p>
            </div>
          ))}
          <div>
            <div className="border-b border-black pb-8 mb-1"></div>
            <p className="font-black text-black">Authorized Accountant / Auditor</p>
            <p className="text-slate-600">Noxderma ERP Financial Audit</p>
          </div>
        </div>

        {/* Disclaimer Footer */}
        <div className="mt-8 pt-2 border-t border-slate-300 text-center text-[9px] text-slate-500">
          Official Partnership Capital &amp; Profit Sharing Document generated by Noxderma ERP &bull; Verified Audit-grade Record.
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. INTERACTIVE WEB / MOBILE APPLICATION VIEW (Hidden on Print) */}
      {/* ============================================================== */}
      <div className="space-y-4 sm:space-y-6 pb-32 sm:pb-16 no-print print:hidden">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="p-1.5 sm:p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-all shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg sm:text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <Users2 className="w-5 h-5 sm:w-6 sm:h-6 text-teal-600 shrink-0" />
                    <span>Partners Investment &amp; Profit Sharing</span>
                  </h1>
                  <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 shrink-0">
                    {partners.length} Partners
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                  Complete partnership capital audit, real-time cloud sync &amp; multi-partner profit ledger
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleOpenPartnerModal}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 transition-all shadow-sm"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Manage Partners ({partners.length})</span>
            </button>
            <button
              type="button"
              onClick={shareWhatsApp}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold hover:bg-emerald-100 transition-all shadow-sm"
              title="Share via WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">WhatsApp</span>
            </button>
            <button
              type="button"
              onClick={triggerCleanPrint}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 transition-all shadow-sm active:scale-95"
              title="Print Audit Statement"
            >
              <Printer className="w-3.5 h-3.5 text-teal-600" />
              <span className="hidden xs:inline">Print Statement</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setType("investment");
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-md shadow-teal-600/20 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Transaction</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* AUTOMATIC MULTI-PARTNER PROFIT SHARING RATIO CARD             */}
        {/* ============================================================== */}
        <div className="p-3.5 sm:p-5 rounded-2xl bg-gradient-to-br from-teal-500/10 via-slate-50 to-indigo-500/10 dark:from-teal-950/30 dark:via-slate-900 dark:to-indigo-950/30 border border-teal-500/30 shadow-soft space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20 shrink-0">
                <PieChart className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100">
                    Automatic Multi-Partner Profit Sharing
                  </h2>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Live Calculation
                  </span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500">
                  Profit tamam partners ki kul sarmayakari (total investment) ke ratio se distribute hota hai.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleOpenPartnerModal}
              className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm shrink-0"
            >
              <Edit2 className="w-3.5 h-3.5 text-teal-600" />
              <span>Edit Partner Names / Add Partner</span>
            </button>
          </div>

          {/* Visual Ratio Progress Split Bar for All Partners */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
              {partners.map((p, idx) => {
                const theme = getPartnerTheme(idx);
                const stat = partnerStatsMap[p.id];
                return (
                  <span
                    key={p.id}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] sm:text-xs ${theme.bgLight} ${theme.primary} ${theme.border}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${theme.barBg} inline-block shrink-0`} />
                    <span className="truncate">{p.name}:</span>
                    <strong className="font-mono">{stat?.ratioPercent || 0}%</strong>
                    <span className="text-[10px] font-mono opacity-80">
                      ({formatPKR(stat?.totalInvestment || 0)})
                    </span>
                  </span>
                );
              })}
            </div>

            {/* Split Bar */}
            <div className="w-full h-3.5 sm:h-4 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex shadow-inner">
              {partners.map((p, idx) => {
                const theme = getPartnerTheme(idx);
                const stat = partnerStatsMap[p.id];
                const ratio = stat?.ratioPercent || 0;
                return (
                  <div
                    key={p.id}
                    style={{ width: `${ratio}%` }}
                    className={`h-full ${theme.barBg} transition-all duration-500 relative group`}
                    title={`${p.name}: ${ratio}%`}
                  />
                );
              })}
            </div>

            <div className="flex flex-col xs:flex-row justify-between text-[11px] text-slate-500 font-medium pt-0.5 gap-0.5">
              <span>
                Combined Total Investment:{" "}
                <strong className="font-mono text-slate-900 dark:text-slate-100 font-bold">
                  {formatPKR(combinedTotalInvestment)}
                </strong>
              </span>
              <span>Total Ownership: 100%</span>
            </div>
          </div>

          {/* Interactive Profit Simulator */}
          <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 space-y-3 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
              <div className="w-full sm:max-w-xs">
                <label className="block text-[11px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Enter Distributable Profit (کل قابل تقسیم منافع - PKR):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">Rs</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={distributableProfit}
                    onChange={(e) => setDistributableProfit(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-teal-500/50 bg-teal-50/20 dark:bg-teal-950/20 text-slate-900 dark:text-slate-100 font-mono font-extrabold text-sm sm:text-base focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleRecordDistributedProfit}
                disabled={isSubmitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm shadow-md shadow-emerald-600/20 transition-all shrink-0 disabled:opacity-50"
              >
                <Coins className="w-4 h-4" /> Distribute Profit
              </button>
            </div>

            {/* Live Multi-Partner Profit Split Preview with Advance Deductions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
              {profitDistributionPreview.map((item, idx) => {
                const theme = getPartnerTheme(idx);
                return (
                  <div
                    key={item.partner.id}
                    className={`p-3 rounded-xl ${theme.bgLight} border ${theme.border} space-y-1.5`}
                  >
                    <div className="flex justify-between items-center text-xs">
                      <span className={`font-bold ${theme.primary} truncate flex items-center gap-1`}>
                        <span className={`w-2 h-2 rounded-full ${theme.barBg}`} />
                        {item.partner.name} Profit Share
                      </span>
                      <span className={`font-mono font-bold ${theme.primary} shrink-0`}>
                        {item.ratioPercent}%
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Gross Share:</span>
                      <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                        {formatPKR(item.grossProfit)}
                      </span>
                    </div>
                    {item.advanceToDeduct > 0 && (
                      <div className="flex items-baseline justify-between text-xs text-rose-600 dark:text-rose-400">
                        <span className="font-semibold">Advance Cut (پیشگی کٹوتی):</span>
                        <span className="font-bold font-mono">-{formatPKR(item.advanceToDeduct)}</span>
                      </div>
                    )}
                    <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-baseline justify-between">
                      <span className="text-xs font-black text-slate-900 dark:text-slate-100">Net Profit Payable:</span>
                      <span className={`text-sm sm:text-base font-black font-mono ${theme.accent}`}>
                        {formatPKR(item.netPayable)}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 block truncate">
                      Calculated from {item.ratioPercent}% investment ratio
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* DYNAMIC MULTI-PARTNER INVESTMENT & CAPITAL CARDS               */}
        {/* ============================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {partners.map((p, idx) => {
            const theme = getPartnerTheme(idx);
            const stat = partnerStatsMap[p.id];
            const ratio = stat?.ratioPercent || 0;
            return (
              <div
                key={p.id}
                className="p-3.5 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-teal-500/40 shadow-soft space-y-3 relative overflow-hidden transition-all"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl ${theme.avatarBg} flex items-center justify-center font-black text-xs sm:text-sm shadow-sm shrink-0`}
                    >
                      P{idx + 1}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate">
                        {p.name}
                      </h2>
                      <span className={`text-[10px] sm:text-[11px] font-bold ${theme.accent} uppercase tracking-wider block`}>
                        Investment Share: {ratio}%
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPartnerId(p.id);
                      setType("investment");
                      setIsModalOpen(true);
                    }}
                    className={`text-[11px] sm:text-xs font-bold ${theme.primary} ${theme.bgLight} hover:opacity-80 flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg border ${theme.border} shrink-0`}
                  >
                    <Plus className="w-3.5 h-3.5" /> <span className="hidden xs:inline">Add</span> Investment
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 sm:gap-2 pt-1">
                  <div className="p-2 sm:p-2.5 rounded-xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-800/50">
                    <span className="text-[9px] uppercase font-bold text-teal-700 dark:text-teal-400 block truncate">
                      Total Invested
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono text-teal-900 dark:text-teal-100 mt-0.5 block truncate">
                      {formatPKR(stat?.totalInvestment || 0)}
                    </span>
                    <span className="text-[9px] text-teal-600 font-bold block truncate">{ratio}% Ratio</span>
                  </div>

                  <div className="p-2 sm:p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-800/50">
                    <span className="text-[9px] uppercase font-bold text-rose-700 dark:text-rose-400 block truncate">
                      Total Advance
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono text-rose-900 dark:text-rose-100 mt-0.5 block truncate">
                      {formatPKR(stat?.totalAdvance || 0)}
                    </span>
                    <span className="text-[9px] text-rose-600 font-medium block truncate">پیشگی رقم (Taken)</span>
                  </div>

                  <div className="p-2 sm:p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
                    <span className="text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-400 block truncate">
                      Profit Received
                    </span>
                    <span className="text-xs sm:text-sm font-black font-mono text-emerald-900 dark:text-emerald-100 mt-0.5 block truncate">
                      {formatPKR(stat?.totalProfitReceived || 0)}
                    </span>
                    <span className="text-[9px] text-emerald-600 font-medium block truncate">Total Payouts</span>
                  </div>
                </div>

                <div className="pt-2 sm:pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] sm:text-xs font-bold text-slate-500">Net Capital Standing:</span>
                  <div className="text-right">
                    <span className={`text-sm sm:text-base font-black font-mono ${theme.accent}`}>
                      {formatPKR(stat?.netCapital || 0)}
                    </span>
                    <span className="block text-[9px] text-slate-400 font-medium">سرمایہ مائنس پیشگی</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ============================================================== */}
        {/* UNIVERSAL DATA FILTERS BAR (Matches all Noxderma ERP modules)  */}
        {/* ============================================================== */}
        <div className="space-y-3">
          <DateRangeFilterBar
            filter={dateFilter}
            onChange={setDateFilter}
            count={filteredTransactions.length}
            label="Transaction Date Filter"
          />

          {/* Secondary Filter Pills: Dynamic Partners, Type & Search */}
          <div className="p-2.5 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Dynamic Partner Filter */}
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold overflow-x-auto no-scrollbar max-w-full">
                <button
                  type="button"
                  onClick={() => setSelectedPartnerFilter("all")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs shrink-0 ${
                    selectedPartnerFilter === "all"
                      ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  All Partners ({transactions.length})
                </button>
                {partners.map((p, idx) => {
                  const theme = getPartnerTheme(idx);
                  const pCount = transactions.filter((t) => t.partnerId === p.id).length;
                  const isSelected = selectedPartnerFilter === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPartnerFilter(p.id)}
                      className={`px-2.5 py-1 rounded-lg transition-all text-xs shrink-0 flex items-center gap-1.5 ${
                        isSelected
                          ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${theme.barBg}`} />
                      <span>{p.name}</span>
                      <span className="opacity-70 font-mono text-[10px]">({pCount})</span>
                    </button>
                  );
                })}
              </div>

              {/* Type Filter */}
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 font-bold overflow-x-auto no-scrollbar max-w-full">
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("all")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs shrink-0 ${
                    selectedTypeFilter === "all"
                      ? "bg-white dark:bg-slate-700 text-teal-600 dark:text-teal-400 shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  All Types
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("investment")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs shrink-0 ${
                    selectedTypeFilter === "investment"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  💰 Investment
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("withdrawal")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs shrink-0 ${
                    selectedTypeFilter === "withdrawal"
                      ? "bg-rose-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  🔻 Advance
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTypeFilter("profit_payout")}
                  className={`px-2.5 py-1 rounded-lg transition-all text-xs shrink-0 ${
                    selectedTypeFilter === "profit_payout"
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  📈 Profit Payout
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search description, ref, partner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TRANSACTION HISTORY (Desktop Table + Mobile Cards Layout)      */}
        {/* ============================================================== */}
        <div className="p-3.5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-soft space-y-3.5 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>Transaction History ({filteredTransactions.length} records)</span>
                {selectedTxIds.length > 0 && (
                  <span className="text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                    {selectedTxIds.length} selected
                  </span>
                )}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Period: {getDateFilterDescription(dateFilter)}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
              {selectedTxIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Selected ({selectedTxIds.length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition-all shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete / Purge
              </button>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold uppercase text-[11px] tracking-wider border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={
                        filteredTransactions.length > 0 &&
                        selectedTxIds.length === filteredTransactions.length
                      }
                      onChange={handleToggleSelectAll}
                      aria-label="Select all transactions"
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3">Date</th>
                  <th className="py-3 px-3">Partner</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Purpose / Description</th>
                  <th className="py-3 px-3">Method</th>
                  <th className="py-3 px-3 text-right">Amount (PKR)</th>
                  <th className="py-3 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Koi transaction mojood nahi hai.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const pIdx = getPartnerIndex(tx.partnerId);
                    const theme = getPartnerTheme(pIdx);
                    return (
                      <tr
                        key={tx.id}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors ${
                          selectedTxIds.includes(tx.id) ? "bg-teal-50/40 dark:bg-teal-950/30" : ""
                        }`}
                      >
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedTxIds.includes(tx.id)}
                            onChange={() => handleToggleSelect(tx.id)}
                            aria-label={`Select transaction ${tx.id}`}
                            className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3 font-mono font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {tx.date}
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-100">
                          <span className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${theme.barBg}`} />
                            {getPartnerName(tx.partnerId, tx.partnerName)}
                          </span>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {tx.type === "investment" || tx.type === "in" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                              <ArrowDownRight className="w-3.5 h-3.5" /> 💰 Investment
                            </span>
                          ) : tx.type === "profit_payout" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300">
                              <Coins className="w-3.5 h-3.5" /> 📈 Profit Payout
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                              <ArrowUpRight className="w-3.5 h-3.5" /> 🔻 Advance
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-medium text-slate-700 dark:text-slate-300">
                          {tx.description}
                          {tx.reference && (
                            <span className="text-[11px] text-slate-400 block font-mono">Ref: {tx.reference}</span>
                          )}
                        </td>
                        <td className="py-3 px-3 capitalize text-slate-500 font-medium">
                          {tx.paymentMethod.replace("_", " ")}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                          <span
                            className={
                              tx.type === "investment" || tx.type === "in"
                                ? "text-emerald-600"
                                : tx.type === "profit_payout"
                                  ? "text-teal-600"
                                  : "text-rose-600"
                            }
                          >
                            {tx.type === "investment" || tx.type === "in" ? "+" : "-"}
                            {formatPKR(tx.amount)}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center gap-1 justify-center">
                            <button
                              type="button"
                              onClick={() => setSlipTx(tx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
                              title="Print Transaction Slip / Voucher"
                            >
                              <Printer className="w-4 h-4 text-teal-600" />
                            </button>
                            {tx.type !== "profit_payout" && (tx.type as string) !== "profit" && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(tx)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors"
                                title="Edit Transaction"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDeletingTx(tx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Layout for Phones (Touch Friendly with Selection & Action Buttons) */}
          <div className="block md:hidden space-y-2.5">
            {filteredTransactions.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Koi transaction mojood nahi hai.
              </div>
            ) : (
              filteredTransactions.map((tx) => {
                const pIdx = getPartnerIndex(tx.partnerId);
                const theme = getPartnerTheme(pIdx);
                return (
                  <div
                    key={tx.id}
                    className={`p-3 rounded-xl border transition-colors space-y-2 text-xs shadow-sm ${
                      selectedTxIds.includes(tx.id)
                        ? "border-teal-400 bg-teal-50/50 dark:bg-teal-950/40 dark:border-teal-700"
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-900 dark:text-slate-100 truncate">
                        <input
                          type="checkbox"
                          checked={selectedTxIds.includes(tx.id)}
                          onChange={() => handleToggleSelect(tx.id)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer shrink-0"
                        />
                        <span className="flex items-center gap-1.5 truncate">
                          <span className={`w-2 h-2 rounded-full ${theme.barBg}`} />
                          {getPartnerName(tx.partnerId, tx.partnerName)}
                        </span>
                      </label>
                      <span className="font-mono text-[10px] text-slate-500 shrink-0">{tx.date}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      {tx.type === "investment" || tx.type === "in" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                          💰 Investment
                        </span>
                      ) : tx.type === "profit_payout" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 shrink-0">
                          📈 Profit Payout
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 shrink-0">
                          🔻 Advance
                        </span>
                      )}

                      <span
                        className={`font-mono text-sm sm:text-base font-black shrink-0 ${
                          tx.type === "investment" || tx.type === "in"
                            ? "text-emerald-600"
                            : tx.type === "profit_payout"
                              ? "text-teal-600"
                              : "text-rose-600"
                        }`}
                      >
                        {tx.type === "investment" || tx.type === "in" ? "+" : "-"}
                        {formatPKR(tx.amount)}
                      </span>
                    </div>

                    <p className="text-slate-700 dark:text-slate-300 font-medium text-xs break-words">
                      {tx.description}
                    </p>
                    {tx.reference && (
                      <span className="text-[10px] text-slate-400 block font-mono">Ref: {tx.reference}</span>
                    )}

                    <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500 border-t border-slate-200/60 dark:border-slate-700/60">
                      <span className="capitalize text-[10px]">{tx.paymentMethod.replace("_", " ")}</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSlipTx(tx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition-colors text-[11px]"
                          title="Print Slip"
                        >
                          <Printer className="w-3 h-3 text-teal-600" /> Slip
                        </button>
                        {tx.type !== "profit_payout" && (tx.type as string) !== "profit" && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold hover:bg-teal-100 transition-colors text-[11px]"
                          >
                            <Edit2 className="w-3 h-3" /> Edit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setDeletingTx(tx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold hover:bg-rose-100 transition-colors text-[11px]"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 3. PARTNER MANAGEMENT MODAL (Add, Rename, Delete with Warning)  */}
      {/* ============================================================== */}
      {isPartnerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 flex items-center justify-center font-bold">
                  <Users2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                    Manage Partners (پارٹنرز سیٹ کریں)
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    Naye partners add karein, unke naam tabdeel karein ya kisi partner ko remove karein.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPartnerModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* List of Partners being edited */}
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {editingPartnerList.map((p, idx) => {
                const theme = getPartnerTheme(idx);
                const txCount = transactions.filter((t) => t.partnerId === p.id).length;
                return (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${theme.barBg}`} />
                        Partner {idx + 1}
                        {txCount > 0 && (
                          <span className="text-[10px] font-normal text-slate-400">
                            ({txCount} historical transactions)
                          </span>
                        )}
                      </span>
                      {editingPartnerList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handlePromptDeletePartner(p)}
                          className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 p-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title="Remove this partner"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => handleUpdatePartnerName(idx, e.target.value)}
                      placeholder={`Partner ${idx + 1} Name`}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                );
              })}
            </div>

            {/* Add Partner Button */}
            <button
              type="button"
              onClick={handleAddPartner}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-teal-400 dark:border-teal-700 hover:border-teal-600 bg-teal-50/50 dark:bg-teal-950/20 text-teal-700 dark:text-teal-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Another Partner (نیا پارٹنر شامل کریں)</span>
            </button>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsPartnerModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePartnerModal}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-600/20 flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Save Changes (تبدیلیاں محفوظ کریں)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 4. DELETE PARTNER WARNING CONFIRMATION MODAL                   */}
      {/* ============================================================== */}
      {isDeleteWarningModalOpen && partnerToDelete && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 max-w-md w-full border-2 border-rose-500/30 shadow-2xl space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                  Remove Partner? (پارٹنر خارج کریں)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Partner: <strong className="text-rose-600 font-bold">{partnerToDelete.name}</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-xs text-amber-900 dark:text-amber-200 space-y-2">
              <p className="font-bold">
                ⚠️ Kya aap waqai is partner ko active list se remove karna chahte hain?
              </p>
              <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300/90">
                <strong>Wazahat (Explanation):</strong> Is partner ki ab tak ki tamam transactions (Investment, Advance ya Profit Payouts) khate (Ledger) aur audit reports mein record ke taur par hamesha mehfooz rahengi. Lekin ye partner aainda ki profit distribution aur naye transactions ke intikhab se nikaal diya jayega.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteWarningModalOpen(false);
                  setPartnerToDelete(null);
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100"
              >
                Cancel (منسوخ)
              </button>
              <button
                type="button"
                onClick={handleConfirmDeletePartner}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-md shadow-rose-600/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Yes, Remove Partner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 5. ADD TRANSACTION MODAL                                       */}
      {/* ============================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-teal-600" />
                <span>Add Partner Transaction</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Partner Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Partner *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {partners.map((p, idx) => {
                    const theme = getPartnerTheme(idx);
                    const isSelected = partnerId === p.id;
                    const stat = partnerStatsMap[p.id];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPartnerId(p.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? `${theme.buttonActive} border-2`
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs truncate">
                          <span className={`w-2 h-2 rounded-full ${theme.barBg} shrink-0`} />
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          Share: {stat?.ratioPercent || 0}%
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transaction Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Transaction Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType("investment")}
                    className={`p-2 sm:p-2.5 rounded-xl border text-[10px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      type === "investment" || type === "in"
                        ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    <span>💰 Investment</span>
                    <span className="text-[8px] sm:text-[9px] font-medium text-emerald-600">(Adds Capital)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType("withdrawal")}
                    className={`p-2 sm:p-2.5 rounded-xl border text-[10px] sm:text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      type === "withdrawal" || type === "out"
                        ? "border-rose-500 bg-rose-50/80 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 ring-2 ring-rose-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-600" />
                    <span>🔻 Advance</span>
                    <span className="text-[8px] sm:text-[9px] font-medium text-rose-600">(Money Taken)</span>
                  </button>
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="e.g. 50000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e: any) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-teal-500"
                >
                  <option value="bank_transfer">Bank Transfer (Meezan / HBL / etc.)</option>
                  <option value="cash">Cash in Hand</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online Payment / JazzCash / Nayapay</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Purpose / Description *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Initial Capital Injection, Advance for personal expense, etc."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bank Reference / Slip No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FT-987452 / Cheque # 120045"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-mono focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 sm:px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Transaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 6. EDIT TRANSACTION MODAL                                      */}
      {/* ============================================================== */}
      {isEditModalOpen && editingTx && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto print:hidden">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-4 sm:p-6 space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-teal-600" />
                <span>Edit Partner Transaction</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingTx(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditTx} className="space-y-4">
              {/* Partner Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Partner *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {partners.map((p, idx) => {
                    const theme = getPartnerTheme(idx);
                    const isSelected = editPartnerId === p.id;
                    const stat = partnerStatsMap[p.id];
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setEditPartnerId(p.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? `${theme.buttonActive} border-2`
                            : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold text-xs truncate">
                          <span className={`w-2 h-2 rounded-full ${theme.barBg} shrink-0`} />
                          <span className="truncate">{p.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                          Share: {stat?.ratioPercent || 0}%
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Transaction Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Transaction Type *
                </label>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setEditType("investment")}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      editType === "investment" || editType === "in"
                        ? "border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowDownRight className="w-4 h-4 text-emerald-600" />
                    <span>💰 Investment</span>
                    <span className="text-[9px] font-medium text-emerald-600">(Adds to Capital)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditType("withdrawal")}
                    className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      editType === "withdrawal" || editType === "out"
                        ? "border-rose-500 bg-rose-50/80 dark:bg-rose-950/50 text-rose-800 dark:text-rose-200 ring-2 ring-rose-500/20"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 text-rose-600" />
                    <span>🔻 Drawings</span>
                    <span className="text-[9px] font-medium text-rose-600">(Money Taken)</span>
                  </button>
                </div>
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    placeholder="e.g. 50000"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold font-mono focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Date *
                  </label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Payment Method
                </label>
                <select
                  value={editPaymentMethod}
                  onChange={(e: any) => setEditPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-teal-500"
                >
                  <option value="bank_transfer">Bank Transfer (Meezan / HBL / etc.)</option>
                  <option value="cash">Cash in Hand</option>
                  <option value="cheque">Cheque</option>
                  <option value="online">Online Payment / JazzCash / Nayapay</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Purpose / Description *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Investment, drawings etc."
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Bank Reference / Slip No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. FT-987452 / Cheque # 120045"
                  value={editReference}
                  onChange={(e) => setEditReference(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-mono focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingTx(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 sm:px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm shadow-md shadow-teal-600/20 disabled:opacity-50"
                >
                  {isSavingEdit ? "Saving Changes..." : "Save Changes (تبدیلیاں محفوظ کریں)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 7. BULK DELETE MODAL (Hidden on Print)                         */}
      {/* ============================================================== */}
      <div className="print:hidden">
        <BulkDeleteModal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          entityName="Partner Transactions"
          selectedCount={selectedTxIds.length}
          totalCount={filteredTransactions.length}
          countsByScope={scopeCounts}
          onConfirmDelete={handleExecuteBulkDelete}
          isDeleting={isDeleting}
        />

        {/* ============================================================== */}
        {/* 8. SINGLE DELETE MODAL (Hidden on Print)                       */}
        {/* ============================================================== */}
        <SingleDeleteModal
          isOpen={!!deletingTx}
          onClose={() => setDeletingTx(null)}
          onConfirm={handleExecuteSingleDelete}
          title="Delete Partner Transaction"
          itemName={
            deletingTx
              ? `${getPartnerName(deletingTx.partnerId, deletingTx.partnerName)} - ${deletingTx.type} (PKR ${deletingTx.amount.toLocaleString()})`
              : ""
          }
          isDeleting={isDeleting}
        />
      </div>

      {/* ============================================================== */}
      {/* 9. INDIVIDUAL TRANSACTION VOUCHER SLIP MODAL                   */}
      {/* ============================================================== */}
      {slipTx && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 overflow-y-auto print:fixed print:inset-0 print:bg-white print:p-6 print:m-0 print:z-[9999] print:block print:overflow-visible">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full max-h-[92dvh] overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 space-y-3.5 sm:space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl animate-scale-in print:shadow-none print:border-none print:p-0 print:m-0 print:max-w-none print:max-h-none print:w-full print:bg-white print:text-black print:overflow-visible">
            <div className="flex items-center justify-between gap-2 pb-2.5 sm:pb-3 border-b border-slate-100 dark:border-slate-800 print:hidden">
              <h3 className="text-sm sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Receipt className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 shrink-0" />
                <span className="truncate">Transaction Slip Voucher</span>
              </h3>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={triggerCleanPrint}
                  className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 whitespace-nowrap shrink-0"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span>Print Slip</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSlipTx(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Slip Container */}
            <div className="p-3 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-3 sm:space-y-3.5 text-xs text-slate-800 dark:text-slate-200 overflow-hidden print:bg-white print:border-black print:text-black print:p-0">
              <OfficialPrintHeader
                title={
                  slipTx.type === "investment" || slipTx.type === "in"
                    ? "PARTNER CAPITAL INVESTMENT VOUCHER"
                    : slipTx.type === "profit_payout"
                      ? "PARTNER PROFIT DISTRIBUTION VOUCHER"
                      : "PARTNER ADVANCE PAYMENT VOUCHER"
                }
                docRef={`VCH-PTX-${slipTx.id.toUpperCase().slice(-8)}`}
                period={`Transaction Date: ${slipTx.date}`}
                settings={businessSettings}
                showInPreview={true}
                className="pb-3 border-b border-slate-200 dark:border-slate-700 print:border-black"
              />

              <div className="grid grid-cols-2 gap-2 p-2.5 sm:p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 print:border-black print:bg-white">
                <div className="min-w-0">
                  <span className="text-[10px] text-slate-500 print:text-slate-700 block">Partner Name:</span>
                  <strong className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 print:text-black break-words block">
                    {getPartnerName(slipTx.partnerId, slipTx.partnerName)}
                  </strong>
                  <span className="text-[10px] text-teal-600 print:text-black font-bold block mt-0.5">
                    Share: {partnerStatsMap[slipTx.partnerId]?.ratioPercent || 0}%
                  </span>
                </div>
                <div className="text-right min-w-0">
                  <span className="text-[10px] text-slate-500 print:text-slate-700 block">Transaction Type:</span>
                  <span className="inline-block font-extrabold uppercase text-[10px] sm:text-[11px] print:text-black break-words">
                    {slipTx.type === "investment" || slipTx.type === "in"
                      ? "💰 Capital Investment"
                      : slipTx.type === "profit_payout"
                        ? "📈 Profit Payout"
                        : "🔻 Advance Payment"}
                  </span>
                  <span className="text-[10px] text-slate-400 print:text-slate-600 block mt-0.5 capitalize">
                    {slipTx.paymentMethod.replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* Amount Box */}
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center space-y-1 print:border-black print:bg-white">
                <span className="text-[10px] font-bold text-slate-500 print:text-slate-700 uppercase tracking-wider block">
                  Voucher Net Amount
                </span>
                <div className="text-2xl sm:text-3xl font-black font-mono text-slate-900 dark:text-slate-100 print:text-black">
                  {formatPKR(slipTx.amount)}
                </div>
                <div className="text-[10px] font-medium italic text-slate-500 print:text-slate-700 pt-1 border-t border-slate-100 dark:border-slate-800 print:border-black">
                  {numberToWordsPKR(slipTx.amount)}
                </div>
              </div>

              {/* Description */}
              <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-1 print:border-black print:bg-white">
                <span className="text-[10px] font-bold text-slate-500 print:text-slate-700 uppercase block">Description / Purpose</span>
                <p className="font-medium text-slate-800 dark:text-slate-200 print:text-black">{slipTx.description}</p>
                {slipTx.reference && (
                  <p className="text-[10px] font-mono text-slate-400 print:text-slate-600 pt-1">
                    Reference #: <strong className="text-slate-700 dark:text-slate-300 print:text-black">{slipTx.reference}</strong>
                  </p>
                )}
              </div>

              {/* Signatures */}
              <div className="pt-6 grid grid-cols-2 gap-4 text-center text-[10px]">
                <div>
                  <div className="border-b border-slate-300 dark:border-slate-600 print:border-black pb-6 mb-1"></div>
                  <p className="font-bold print:text-black">{getPartnerName(slipTx.partnerId, slipTx.partnerName)}</p>
                  <p className="text-slate-400 print:text-slate-600 text-[9px]">Partner Signature</p>
                </div>
                <div>
                  <div className="border-b border-slate-300 dark:border-slate-600 print:border-black pb-6 mb-1"></div>
                  <p className="font-bold print:text-black">{slipTx.createdByName || "Authorized Admin"}</p>
                  <p className="text-slate-400 print:text-slate-600 text-[9px]">Auditor / Accountant</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
