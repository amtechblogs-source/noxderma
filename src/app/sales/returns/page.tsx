"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  RotateCcw,
  Plus,
  Search,
  CheckCircle2,
  Receipt,
  Lock,
  Unlock,
  Trash2,
  Pencil,
  X,
  AlertCircle,
  FileText,
  Percent,
  Factory,
  ShoppingBag,
  Truck,
  Wallet,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { scheduleCloudDelete, scheduleCloudUpsert } from "@/lib/offline/cloudSync";
import { useAuth } from "@/context/AuthContext";
import { recordActivity } from "@/lib/audit/auditTracker";
import { resolveUnitPurchaseCost } from "@/lib/inventory/expiryUtils";
import { FloatingBulkActionBar } from "@/components/common/FloatingBulkActionBar";
import type {
  Customer,
  Product,
  ProductPricing,
  InventoryBatch,
  Invoice,
  Payment,
  StockMovement,
  SalesReturn,
  SalesReturnMode,
  ReturnSourceBillType,
  SalesReturnReason,
  SalesReturnDisposition,
  CustomerReturnResolution,
} from "@/types";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
} from "@/lib/dateFilter";

interface ReturnDraftRow {
  rowId: string;
  lineId?: string;
  productId: string;
  productName: string;
  packSize?: string;
  batchId: string;
  batchNumber: string;
  soldQuantity?: number;
  bonusQuantity?: number;
  alreadyReturnedQty?: number;
  maxReturnableQty?: number;
  selected: boolean;
  returnQuantity: number;
  grossUnitPrice: number;
  discountPercentage: number;
  unitCost: number;
  replacementBatchId: string;
}

interface UniversalBillOption {
  key: string;
  billType: Exclude<ReturnSourceBillType, "open_return">;
  refNumber: string;
  altRefs: string[];
  partyId: string;
  partyName: string;
  partyPhone?: string;
  date: string;
  totalAmount: number;
  subtitle?: string;
  raw: any;
}

const VOUCHER_PRODUCT_ID = "VOUCHER_ADJUSTMENT";

function computeNetUnitCredit(grossPrice: number, discountPct: number): number {
  const safeGross = Math.max(0, Number(grossPrice) || 0);
  const safeDisc = Math.min(100, Math.max(0, Number(discountPct) || 0));
  return Number((safeGross * (1 - safeDisc / 100)).toFixed(2));
}

function computeInvoiceLineEffectiveDiscountPct(inv: Invoice, lineIdx: number): number {
  const line = inv.lines?.[lineIdx];
  if (!line) return 0;

  const lineDiscPct = Math.max(
    0,
    Number(line.extraDiscountPercent ?? line.lineDiscountPercentage ?? 0) || 0
  );

  const lines = inv.lines || [];
  const subtotal =
    Number(inv.subtotal) ||
    lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  const totalLineDiscount = lines.reduce((s, l) => {
    const lPct = Math.max(0, Number(l.extraDiscountPercent ?? l.lineDiscountPercentage ?? 0) || 0);
    const lAmt =
      Number(l.lineDiscountAmount) ||
      ((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * lPct) / 100;
    return s + lAmt;
  }, 0);

  const eligibleBase = Math.max(0, subtotal - totalLineDiscount);
  let billLevelDiscPct = 0;

  if (Number(inv.invoiceDiscountPercentage) > 0) {
    billLevelDiscPct = Number(inv.invoiceDiscountPercentage);
  } else if (Number(inv.invoiceDiscountAmount) > totalLineDiscount + 0.01 && eligibleBase > 0) {
    const extraBillDiscAmt = Math.max(0, Number(inv.invoiceDiscountAmount) - totalLineDiscount);
    billLevelDiscPct = (extraBillDiscAmt / eligibleBase) * 100;
  }

  if (lineDiscPct > 0 && billLevelDiscPct > 0) {
    const combined = (1 - (1 - lineDiscPct / 100) * (1 - billLevelDiscPct / 100)) * 100;
    return Number(Math.min(100, Math.max(0, combined)).toFixed(2));
  }
  return Number(Math.min(100, Math.max(0, lineDiscPct || billLevelDiscPct)).toFixed(2));
}

function getSourceBillBadge(ret: SalesReturn): { label: string; className: string } {
  if (
    ret.returnMode === "open_return" ||
    ret.sourceBillType === "open_return" ||
    ret.invoiceReference === "OPEN-RETURN" ||
    ret.invoiceReference === "DIRECT-RETURN"
  ) {
    return {
      label: "OPEN RETURN",
      className: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300",
    };
  }
  if (ret.sourceBillType === "purchase_bill") {
    return {
      label: `BUYING BILL: ${ret.invoiceReference}`,
      className: "bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300",
    };
  }
  if (ret.sourceBillType === "manufacturer_payment") {
    return {
      label: `COMPANY PAY: ${ret.invoiceReference}`,
      className: "bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300",
    };
  }
  if (ret.sourceBillType === "online_order") {
    return {
      label: `COURIER: ${ret.invoiceReference}`,
      className: "bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300",
    };
  }
  if (ret.sourceBillType === "customer_payment") {
    return {
      label: `RECEIPT: ${ret.invoiceReference}`,
      className: "bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300",
    };
  }
  return {
    label: `BILL: ${ret.invoiceReference}`,
    className: "bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300",
  };
}

function getBillTypeMeta(type: UniversalBillOption["billType"]) {
  switch (type) {
    case "purchase_bill":
      return { tag: "BUYING BILL", qtyLabel: "Bought Qty", priceLabel: "Buy Price" };
    case "online_order":
      return { tag: "COURIER ORDER", qtyLabel: "Order Qty", priceLabel: "Order Price" };
    case "manufacturer_payment":
      return { tag: "MFR PAYMENT", qtyLabel: "Voucher", priceLabel: "Voucher Amt" };
    case "customer_payment":
      return { tag: "CUST PAYMENT", qtyLabel: "Qty / Ref", priceLabel: "Paid Amt" };
    default:
      return { tag: "SALE BILL", qtyLabel: "Sold Qty", priceLabel: "Sale Price" };
  }
}

export default function SalesReturnsPage() {
  const { currentUser, hasPermission } = useAuth();
  const canEditPriceRights = hasPermission("pricing:edit");
  const canManageReturns = hasPermission("invoices:reverse") || currentUser?.role === "owner" || currentUser?.role === "admin";

  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [onlineOrders, setOnlineOrders] = useState<any[]>([]);
  const [mfrLedgerEntries, setMfrLedgerEntries] = useState<any[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [manufacturers, setManufacturers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productPricings, setProductPricings] = useState<ProductPricing[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);

  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [isProcessing, setIsProcessing] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Return Mode: "invoice_return" (Against Any Bill / Voucher) vs "open_return" (Without Bill)
  const [returnMode, setReturnMode] = useState<SalesReturnMode>("invoice_return");
  const [billTypeFilter, setBillTypeFilter] = useState<
    "all" | UniversalBillOption["billType"]
  >("all");

  // Price & Discount Rights Lock
  const [isPriceRightsUnlocked, setIsPriceRightsUnlocked] = useState(false);

  // Universal Bill Lookup State
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [selectedBillKey, setSelectedBillKey] = useState("");
  const [invoiceError, setInvoiceError] = useState("");

  // Shared Form State (Create)
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [draftRows, setDraftRows] = useState<ReturnDraftRow[]>([]);
  const [reason, setReason] = useState<SalesReturnReason>("pharmacy_overstock");
  const [disposition, setDisposition] = useState<SalesReturnDisposition>("restocked");
  const [customerResolution, setCustomerResolution] =
    useState<CustomerReturnResolution>("khata_credit");
  const [remarks, setRemarks] = useState("");

  // Edit Return Slip Modal State
  const [editingReturn, setEditingReturn] = useState<SalesReturn | null>(null);
  const [editBatchId, setEditBatchId] = useState("");
  const [editBatchNumber, setEditBatchNumber] = useState("");
  const [editQty, setEditQty] = useState(1);
  const [editGrossPrice, setEditGrossPrice] = useState(0);
  const [editDiscountPct, setEditDiscountPct] = useState(0);
  const [editUnitCost, setEditUnitCost] = useState(0);
  const [editReason, setEditReason] = useState<SalesReturnReason>("pharmacy_overstock");
  const [editDisposition, setEditDisposition] = useState<SalesReturnDisposition>("restocked");
  const [editResolution, setEditResolution] = useState<CustomerReturnResolution>("khata_credit");
  const [editReplacementBatchId, setEditReplacementBatchId] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Delete & Bulk Selection State
  const [selectedReturnIds, setSelectedReturnIds] = useState<string[]>([]);
  const [deletingReturn, setDeletingReturn] = useState<SalesReturn | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isDeletingLoading, setIsDeletingLoading] = useState(false);

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

  useEffect(() => {
    try {
      const savedRights = localStorage.getItem("noxderma_return_price_rights_unlocked");
      if (savedRights === "true" && canEditPriceRights) {
        setIsPriceRightsUnlocked(true);
      }
    } catch {
      // ignore
    }
  }, [canEditPriceRights]);

  const togglePriceRights = () => {
    if (!canEditPriceRights) return;
    setIsPriceRightsUnlocked((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("noxderma_return_price_rights_unlocked", String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const canModifyPriceAndDiscount = canEditPriceRights && isPriceRightsUnlocked;

  const showNotice = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  const loadData = async () => {
    try {
      const [
        custList,
        prodList,
        pricingList,
        batchList,
        invList,
        poList,
        ordList,
        mfrLedgList,
        payList,
        mfrList,
      ] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
        offlineDb.productPricing ? offlineDb.productPricing.toArray() : Promise.resolve([]),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.invoices ? offlineDb.invoices.toArray() : Promise.resolve([]),
        (offlineDb as any).purchaseOrders ? (offlineDb as any).purchaseOrders.toArray() : Promise.resolve([]),
        (offlineDb as any).onlineOrders ? (offlineDb as any).onlineOrders.toArray() : Promise.resolve([]),
        (offlineDb as any).manufacturerLedger ? (offlineDb as any).manufacturerLedger.toArray() : Promise.resolve([]),
        offlineDb.payments ? offlineDb.payments.toArray() : Promise.resolve([]),
        offlineDb.manufacturers ? offlineDb.manufacturers.toArray() : Promise.resolve([]),
      ]);

      setCustomers(custList);
      setProducts(prodList);
      setProductPricings(pricingList || []);
      setBatches(batchList || []);
      setManufacturers(mfrList || []);
      setPayments(payList || []);

      const sortedInvoices = [...(invList || [])].sort(
        (a, b) =>
          String(b.invoiceDate || b.createdAt || "").localeCompare(
            String(a.invoiceDate || a.createdAt || "")
          ) || String(b.id || "").localeCompare(String(a.id || ""))
      );
      setInvoices(sortedInvoices);

      let finalPOs = Array.isArray(poList) ? poList : [];
      if (finalPOs.length === 0) {
        try {
          const ls = localStorage.getItem("noxderma_purchase_orders");
          if (ls) finalPOs = JSON.parse(ls) || [];
        } catch {}
      }
      setPurchaseOrders(finalPOs);

      let finalOrders = Array.isArray(ordList) ? ordList : [];
      if (finalOrders.length === 0) {
        try {
          const ls = localStorage.getItem("noxderma_online_orders");
          if (ls) finalOrders = JSON.parse(ls) || [];
        } catch {}
      }
      setOnlineOrders(finalOrders);

      let finalMfrLedger = Array.isArray(mfrLedgList) ? mfrLedgList : [];
      if (finalMfrLedger.length === 0) {
        try {
          const ls = localStorage.getItem("noxderma_mfr_ledger");
          if (ls) finalMfrLedger = JSON.parse(ls) || [];
        } catch {}
      }
      setMfrLedgerEntries(finalMfrLedger);

      try {
        const dbReturns = await (offlineDb as any).salesReturns?.toArray();
        const isCloudInit = localStorage.getItem("noxderma_cloud_init_salesReturns") === "true";
        if (dbReturns && (dbReturns.length > 0 || isCloudInit)) {
          const sorted = [...(dbReturns as SalesReturn[])].sort(
            (a, b) =>
              String(b.returnDate || "").localeCompare(String(a.returnDate || "")) ||
              String(b.id || "").localeCompare(String(a.id || ""))
          );
          setReturns(sorted);
          localStorage.setItem("noxderma_sales_returns", JSON.stringify(sorted));
          return;
        }
      } catch {
        // fallback
      }

      const saved = localStorage.getItem("noxderma_sales_returns");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const sorted = [...parsed].sort(
              (a, b) =>
                String(b.returnDate || "").localeCompare(String(a.returnDate || "")) ||
                String(b.id || "").localeCompare(String(a.id || ""))
            );
            setReturns(sorted);
            if (sorted.length > 0 && (offlineDb as any).salesReturns) {
              await (offlineDb as any).salesReturns.bulkPut(sorted);
            }
          } else {
            setReturns([]);
          }
        } catch {
          setReturns([]);
        }
      } else {
        setReturns([]);
      }
    } catch (err) {
      console.warn("Could not load returns data:", err);
    }
  };

  useEffect(() => {
    loadData();
    const handleCloudSynced = () => {
      loadData();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  const saveReturns = async (updated: SalesReturn[], deletedIds: string[] = []) => {
    const sorted = [...updated].sort(
      (a, b) =>
        String(b.returnDate || "").localeCompare(String(a.returnDate || "")) ||
        String(b.id || "").localeCompare(String(a.id || ""))
    );
    setReturns(sorted);
    localStorage.setItem("noxderma_sales_returns", JSON.stringify(sorted));
    try {
      if ((offlineDb as any).salesReturns) {
        for (const delId of deletedIds) {
          await (offlineDb as any).salesReturns.delete(delId);
          scheduleCloudDelete("salesReturns", delId);
        }
        if (sorted.length > 0) {
          await (offlineDb as any).salesReturns.bulkPut(sorted);
        }
      }
    } catch (err) {
      console.error("Failed to sync salesReturns to offlineDb:", err);
    }
  };

  // Build Universal Bill / Voucher catalog across ALL modules (Sale Bills, Buying Bills/POs, Courier Orders, Mfr Payments, Customer Payments)
  const universalBills = useMemo<UniversalBillOption[]>(() => {
    const list: UniversalBillOption[] = [];
    const poRefSet = new Set<string>();

    for (const inv of invoices) {
      const ref = inv.provisionalReference || inv.officialReference || inv.id;
      list.push({
        key: `inv:${inv.id}`,
        billType: "sale_invoice",
        refNumber: ref,
        altRefs: [inv.officialReference || "", inv.id].filter(Boolean),
        partyId: inv.customerId || "",
        partyName: inv.customerName || "Customer",
        partyPhone: inv.customerPhone,
        date: inv.invoiceDate || inv.createdAt || "",
        totalAmount: Number(inv.netTotal) || 0,
        subtitle: `${inv.lines?.length || 0} item(s)`,
        raw: inv,
      });
    }

    for (const po of purchaseOrders) {
      const ref = po.poNumber || po.grnReference || po.id;
      if (po.poNumber) poRefSet.add(String(po.poNumber).toLowerCase());
      if (po.grnReference) poRefSet.add(String(po.grnReference).toLowerCase());
      list.push({
        key: `po:${po.id}`,
        billType: "purchase_bill",
        refNumber: ref,
        altRefs: [po.grnReference || "", po.id].filter(Boolean),
        partyId: po.manufacturerId || "",
        partyName: po.manufacturerName || "Medicine Company",
        date: po.orderDate || po.receivedDate || po.createdAt || "",
        totalAmount: Number(po.totalAmount) || 0,
        subtitle: `${po.items?.length || 1} bought item(s)${po.grnReference ? ` • ${po.grnReference}` : ""}`,
        raw: po,
      });
    }

    for (const ord of onlineOrders) {
      const ref = ord.orderNumber || ord.id;
      list.push({
        key: `ord:${ord.id}`,
        billType: "online_order",
        refNumber: ref,
        altRefs: [ord.trackingNumber || "", ord.id].filter(Boolean),
        partyId: "",
        partyName: ord.customerName || "Online Customer",
        partyPhone: ord.customerPhone,
        date: ord.orderDate || "",
        totalAmount: Number(ord.totalAmount) || 0,
        subtitle: `${ord.courier || "Courier"}${ord.trackingNumber ? ` • ${ord.trackingNumber}` : ""}`,
        raw: ord,
      });
    }

    for (const entry of mfrLedgerEntries) {
      const ref = entry.referenceNumber || entry.id;
      if (entry.referenceType === "purchase_invoice" && poRefSet.has(String(ref).toLowerCase())) {
        continue;
      }
      const amt = Number(entry.debit) || Number(entry.credit) || 0;
      list.push({
        key: `mfrpay:${entry.id}`,
        billType: "manufacturer_payment",
        refNumber: ref,
        altRefs: [entry.id],
        partyId: entry.manufacturerId || "",
        partyName: entry.manufacturerName || "Medicine Company",
        date: entry.date || entry.createdAt || "",
        totalAmount: amt,
        subtitle: entry.description || "Company Payment Voucher",
        raw: entry,
      });
    }

    for (const pay of payments) {
      const ref = pay.referenceNumber || pay.id;
      // Avoid duplicating if reference is literally just an invoice ref already listed above
      const allocRefs = (pay.allocations || []).map((a) => a.invoiceReference).filter(Boolean);
      list.push({
        key: `pay:${pay.id}`,
        billType: "customer_payment",
        refNumber: ref,
        altRefs: [pay.id, ...allocRefs],
        partyId: pay.customerId || "",
        partyName: pay.customerName || "Customer",
        date: pay.paymentDate || pay.createdAt || "",
        totalAmount: Number(pay.amount) || 0,
        subtitle: `Receipt (${pay.paymentMethod || "cash"})`,
        raw: pay,
      });
    }

    return list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  }, [invoices, purchaseOrders, onlineOrders, mfrLedgerEntries, payments]);

  const matchingBills = useMemo(() => {
    const q = invoiceSearchQuery.trim().toLowerCase();
    return universalBills.filter((b) => {
      if (billTypeFilter !== "all" && b.billType !== billTypeFilter) return false;
      if (!q) return true;
      return (
        b.refNumber.toLowerCase().includes(q) ||
        b.altRefs.some((r) => r.toLowerCase().includes(q)) ||
        b.partyName.toLowerCase().includes(q) ||
        (b.partyPhone || "").toLowerCase().includes(q)
      );
    });
  }, [universalBills, invoiceSearchQuery, billTypeFilter]);

  const selectedBillObj = useMemo(
    () => universalBills.find((b) => b.key === selectedBillKey) || null,
    [universalBills, selectedBillKey]
  );

  const getActiveReplacementBatchesForProduct = (prodId: string) => {
    const nowTime = Date.now();
    return batches.filter(
      (b) =>
        b.productId === prodId &&
        (b.remainingQuantity || 0) > 0 &&
        b.status !== "expired" &&
        b.status !== "quarantine" &&
        new Date(b.expiryDate).getTime() > nowTime
    );
  };

  const createEmptyOpenRow = (): ReturnDraftRow => ({
    rowId: `open_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    productId: "",
    productName: "",
    batchId: "",
    batchNumber: "",
    selected: true,
    returnQuantity: 1,
    grossUnitPrice: 0,
    discountPercentage: 0,
    unitCost: 0,
    replacementBatchId: "",
  });

  const handleOpenModal = (initialMode: SalesReturnMode = "invoice_return") => {
    setReturnMode(initialMode);
    setBillTypeFilter("all");
    setInvoiceSearchQuery("");
    setSelectedBillKey("");
    setInvoiceError("");
    setSelectedCustomerId("");
    setReason("pharmacy_overstock");
    setDisposition("restocked");
    setCustomerResolution("khata_credit");
    setRemarks("");
    setDraftRows(initialMode === "open_return" ? [createEmptyOpenRow()] : []);
    setIsProcessing(true);
  };

  const handleSwitchMode = (nextMode: SalesReturnMode) => {
    setReturnMode(nextMode);
    setInvoiceError("");
    if (nextMode === "open_return") {
      setSelectedBillKey("");
      if (draftRows.length === 0 || draftRows[0]?.lineId) {
        setDraftRows([createEmptyOpenRow()]);
      }
    } else {
      setDraftRows([]);
      setSelectedBillKey("");
    }
  };

  const buildRowsFromSaleInvoice = (inv: Invoice): ReturnDraftRow[] => {
    return (inv.lines || []).map((line, idx) => {
      const alloc = line.batchAllocations?.[0];
      const matchedBatch =
        (alloc?.batchId && batchMap.get(String(alloc.batchId))) ||
        batches.find(
          (b) =>
            b.productId === line.productId &&
            b.batchNumber?.toUpperCase().trim() === (alloc?.batchNumber || "").toUpperCase().trim()
        );

      const alreadyRet = returns
        .filter(
          (r) =>
            (r.invoiceId === inv.id ||
              r.invoiceReference === inv.provisionalReference ||
              (inv.officialReference && r.invoiceReference === inv.officialReference)) &&
            r.productId === line.productId
        )
        .reduce((sum, r) => sum + (Number(r.returnQuantity) || 0), 0);

      const soldQty = Number(line.quantity) || 0;
      const maxRet = Math.max(0, soldQty - alreadyRet);
      const effectiveDiscPct = computeInvoiceLineEffectiveDiscountPct(inv, idx);
      const grossPrice = Number(line.unitPrice) || 0;

      const resolvedCost =
        Number(alloc?.unitCostAtAllocation) > 0
          ? Number(alloc?.unitCostAtAllocation)
          : resolveUnitPurchaseCost({
              productId: line.productId,
              batchId: matchedBatch?.id,
              pricingMap,
              productMap,
              batchMap,
            });

      const repBatches = getActiveReplacementBatchesForProduct(line.productId);

      // Auto-fill Return Qty = full remaining sold qty (AND editable so e.g. 3 -> 1 works!)
      return {
        rowId: `invline_${inv.id}_${line.id || idx}`,
        lineId: line.id || `line_${idx}`,
        productId: line.productId,
        productName: line.productName,
        packSize: line.packSize,
        batchId: matchedBatch?.id || alloc?.batchId || "",
        batchNumber: alloc?.batchNumber || matchedBatch?.batchNumber || "BILL-BATCH",
        soldQuantity: soldQty,
        bonusQuantity: Number(line.bonusQuantity) || 0,
        alreadyReturnedQty: alreadyRet,
        maxReturnableQty: maxRet,
        selected: maxRet > 0,
        returnQuantity: maxRet,
        grossUnitPrice: grossPrice,
        discountPercentage: effectiveDiscPct,
        unitCost: resolvedCost,
        replacementBatchId: repBatches[0]?.id || "",
      };
    });
  };

  // Universal Bill Picker: Auto-fills ALL items, prices, discounts, and default Return Qty (= Sold/Bought Qty)
  const handleSelectUniversalBill = (bill: UniversalBillOption | null) => {
    if (!bill) {
      setSelectedBillKey("");
      setDraftRows([]);
      return;
    }

    setSelectedBillKey(bill.key);
    setInvoiceError("");

    if (bill.billType === "sale_invoice") {
      const inv = bill.raw as Invoice;
      if (inv.customerId && customers.some((c) => c.id === inv.customerId)) {
        setSelectedCustomerId(inv.customerId);
      } else {
        const byName = customers.find(
          (c) => c.name.toLowerCase().trim() === (inv.customerName || "").toLowerCase().trim()
        );
        setSelectedCustomerId(byName?.id || inv.customerId || "");
      }
      setDraftRows(buildRowsFromSaleInvoice(inv));
      return;
    }

    if (bill.billType === "purchase_bill") {
      const po = bill.raw;
      setSelectedCustomerId(po.manufacturerId || "");
      const poItems = Array.isArray(po.items) ? po.items : [];
      const built: ReturnDraftRow[] = poItems.map((item: any, idx: number) => {
        const matchedBatch =
          batches.find(
            (b) =>
              b.productId === item.productId &&
              po.grnReference &&
              b.goodsReceiptId === po.grnReference
          ) || batches.find((b) => b.productId === item.productId);

        const alreadyRet = returns
          .filter(
            (r) =>
              r.sourceBillType === "purchase_bill" &&
              (r.invoiceId === po.id || r.invoiceReference === po.poNumber) &&
              r.productId === item.productId
          )
          .reduce((sum, r) => sum + (Number(r.returnQuantity) || 0), 0);

        const boughtQty = Number(item.quantity) || 1;
        const maxRet = Math.max(0, boughtQty - alreadyRet);
        const unitPrice = Number(item.unitPrice) || 0;

        return {
          rowId: `poline_${po.id}_${idx}`,
          lineId: `po_${idx}`,
          productId: item.productId || VOUCHER_PRODUCT_ID,
          productName: item.productName || "Purchased Medicine",
          packSize: item.packSize,
          batchId: matchedBatch?.id || "",
          batchNumber: matchedBatch?.batchNumber || po.grnReference || po.poNumber || "PO-BATCH",
          soldQuantity: boughtQty,
          bonusQuantity: 0,
          alreadyReturnedQty: alreadyRet,
          maxReturnableQty: maxRet,
          selected: maxRet > 0,
          returnQuantity: maxRet,
          grossUnitPrice: unitPrice,
          discountPercentage: 0,
          unitCost: unitPrice,
          replacementBatchId: "",
        };
      });
      setDraftRows(built);
      return;
    }

    if (bill.billType === "online_order") {
      const ord = bill.raw;
      setSelectedCustomerId("");
      const ordItems = Array.isArray(ord.items) && ord.items.length > 0 ? ord.items : [];
      if (ordItems.length > 0) {
        const built: ReturnDraftRow[] = ordItems.map((item: any, idx: number) => {
          const matchedBatch = batches.find((b) => b.productId === item.productId);
          const alreadyRet = returns
            .filter(
              (r) =>
                (r.invoiceId === ord.id || r.invoiceReference === ord.orderNumber) &&
                r.productId === item.productId
            )
            .reduce((sum, r) => sum + (Number(r.returnQuantity) || 0), 0);
          const ordQty = Number(item.quantity) || 1;
          const maxRet = Math.max(0, ordQty - alreadyRet);
          const resolvedCost = resolveUnitPurchaseCost({
            productId: item.productId,
            batchId: matchedBatch?.id,
            pricingMap,
            productMap,
            batchMap,
          });
          return {
            rowId: `ordline_${ord.id}_${idx}`,
            lineId: `ord_${idx}`,
            productId: item.productId || VOUCHER_PRODUCT_ID,
            productName: item.productName || "Ordered Item",
            packSize: item.packSize,
            batchId: matchedBatch?.id || "",
            batchNumber: matchedBatch?.batchNumber || ord.orderNumber || "ORD-BATCH",
            soldQuantity: ordQty,
            alreadyReturnedQty: alreadyRet,
            maxReturnableQty: maxRet,
            selected: maxRet > 0,
            returnQuantity: maxRet,
            grossUnitPrice: Number(item.unitPrice) || 0,
            discountPercentage: 0,
            unitCost: resolvedCost,
            replacementBatchId: getActiveReplacementBatchesForProduct(item.productId)[0]?.id || "",
          };
        });
        setDraftRows(built);
      } else {
        setDraftRows([
          {
            rowId: `ordline_${ord.id}_0`,
            lineId: "ord_0",
            productId: VOUCHER_PRODUCT_ID,
            productName: ord.itemsSummary || `Courier Order ${ord.orderNumber}`,
            batchId: "",
            batchNumber: ord.orderNumber || "COURIER",
            soldQuantity: 1,
            alreadyReturnedQty: 0,
            maxReturnableQty: 1,
            selected: true,
            returnQuantity: 1,
            grossUnitPrice: Number(ord.totalAmount) || 0,
            discountPercentage: 0,
            unitCost: 0,
            replacementBatchId: "",
          },
        ]);
      }
      return;
    }

    if (bill.billType === "manufacturer_payment") {
      const entry = bill.raw;
      setSelectedCustomerId(entry.manufacturerId || "");
      const amt = Number(entry.debit) || Number(entry.credit) || 0;
      setDraftRows([
        {
          rowId: `mfrpay_${entry.id}`,
          lineId: "mfrpay_0",
          productId: VOUCHER_PRODUCT_ID,
          productName: entry.description || `Company Payment (${entry.referenceNumber})`,
          batchId: "",
          batchNumber: entry.referenceNumber || "PV",
          soldQuantity: 1,
          alreadyReturnedQty: 0,
          maxReturnableQty: 1,
          selected: true,
          returnQuantity: 1,
          grossUnitPrice: amt,
          discountPercentage: 0,
          unitCost: 0,
          replacementBatchId: "",
        },
      ]);
      return;
    }

    if (bill.billType === "customer_payment") {
      const pay = bill.raw as Payment;
      setSelectedCustomerId(pay.customerId || "");
      // If payment is allocated to an existing Sale Invoice, auto-load that bill's items!
      const linkedAlloc = (pay.allocations || [])[0];
      const linkedInv = linkedAlloc
        ? invoices.find(
            (i) =>
              i.id === linkedAlloc.invoiceId ||
              i.provisionalReference === linkedAlloc.invoiceReference
          )
        : undefined;

      if (linkedInv && (linkedInv.lines || []).length > 0) {
        setDraftRows(buildRowsFromSaleInvoice(linkedInv));
      } else {
        setDraftRows([
          {
            rowId: `pay_${pay.id}`,
            lineId: "pay_0",
            productId: VOUCHER_PRODUCT_ID,
            productName: pay.notes || `Customer Receipt (${pay.referenceNumber || pay.id})`,
            batchId: "",
            batchNumber: pay.referenceNumber || "RECEIPT",
            soldQuantity: 1,
            alreadyReturnedQty: 0,
            maxReturnableQty: 1,
            selected: true,
            returnQuantity: 1,
            grossUnitPrice: Number(pay.amount) || 0,
            discountPercentage: 0,
            unitCost: 0,
            replacementBatchId: "",
          },
        ]);
      }
    }
  };

  const handleOpenRowProductChange = (rowId: string, prodId: string) => {
    const prod = productMap.get(String(prodId));
    const matchingBatches = batches.filter((b) => b.productId === prodId);
    const firstBatch = matchingBatches[0];
    const resolvedCost = resolveUnitPurchaseCost({
      productId: prodId,
      batchId: firstBatch?.id,
      pricingMap,
      productMap,
      batchMap,
    });
    const pricing = pricingMap.get(String(prodId));
    const suggestedSalePrice = Number(pricing?.tradePricePerPack || pricing?.mrpPerPack || 0);
    const repBatches = getActiveReplacementBatchesForProduct(prodId);

    setDraftRows((prev) =>
      prev.map((r) =>
        r.rowId === rowId
          ? {
              ...r,
              productId: prodId,
              productName: prod?.name || "",
              packSize: prod?.packSize,
              batchId: firstBatch?.id || "",
              batchNumber: firstBatch?.batchNumber || "",
              grossUnitPrice: suggestedSalePrice,
              discountPercentage: 0,
              unitCost: resolvedCost,
              replacementBatchId: repBatches[0]?.id || "",
            }
          : r
      )
    );
  };

  const updateDraftRow = (rowId: string, patch: Partial<ReturnDraftRow>) => {
    setDraftRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  };

  const handleToggleSelectAllBillRows = (checked: boolean) => {
    setDraftRows((prev) =>
      prev.map((row) => {
        const maxRet = row.maxReturnableQty ?? 0;
        if (maxRet <= 0) return row;
        return {
          ...row,
          selected: checked,
          returnQuantity: checked ? (row.returnQuantity > 0 ? row.returnQuantity : maxRet) : 0,
        };
      })
    );
  };

  const handleReasonSelect = (nextReason: SalesReturnReason) => {
    setReason(nextReason);
    if (nextReason === "expired" || nextReason === "near_expiry") {
      setDisposition("quarantine_batch");
    } else if (nextReason === "transit_damage") {
      setDisposition("scrap_writeoff");
    } else if (nextReason === "pharmacy_overstock" || nextReason === "wrong_supply") {
      setDisposition("restocked");
    }
  };

  const activeReturnRows = useMemo(
    () =>
      draftRows.filter(
        (r) =>
          Boolean(r.productId) &&
          (returnMode === "open_return" || r.selected) &&
          Number(r.returnQuantity) > 0
      ),
    [draftRows, returnMode]
  );

  const returnTotals = useMemo(() => {
    let totalPacks = 0;
    let grossAmount = 0;
    let discountAmount = 0;
    let netCreditAmount = 0;
    let totalCostAmount = 0;

    for (const r of activeReturnRows) {
      const qtyNum = Math.max(0, Math.floor(Number(r.returnQuantity) || 0));
      const grossRate = Math.max(0, Number(r.grossUnitPrice) || 0);
      const netRate = computeNetUnitCredit(grossRate, r.discountPercentage);
      const rowGross = qtyNum * grossRate;
      const rowNet = customerResolution === "replacement" ? 0 : Math.round(qtyNum * netRate);
      const rowDisc = customerResolution === "replacement" ? 0 : Math.max(0, rowGross - rowNet);

      totalPacks += qtyNum;
      grossAmount += rowGross;
      discountAmount += rowDisc;
      netCreditAmount += rowNet;
      totalCostAmount += qtyNum * Math.max(0, Number(r.unitCost) || 0);
    }

    return {
      totalPacks,
      grossAmount: Math.round(grossAmount),
      discountAmount: Math.round(discountAmount),
      netCreditAmount: Math.round(netCreditAmount),
      totalCostAmount: Math.round(totalCostAmount),
    };
  }, [activeReturnRows, customerResolution]);

  // =========================================================================
  // REVERSAL ENGINE (USED BY DELETE, BULK DELETE, AND EDIT)
  // =========================================================================
  const reverseSalesReturnImpact = async (ret: SalesReturn) => {
    const now = new Date().toISOString();
    const qtyNum = Math.max(0, Number(ret.returnQuantity) || 0);
    const isSupplierReturn =
      ret.sourceBillType === "purchase_bill" || ret.sourceBillType === "manufacturer_payment";
    const isPhysicalProduct = Boolean(ret.productId && ret.productId !== VOUCHER_PRODUCT_ID);

    // 1. Reverse Batch Inventory Change
    if (isPhysicalProduct && qtyNum > 0) {
      const allBatches = await offlineDb.inventoryBatches.toArray();
      const matchedBatch =
        (ret.batchId && allBatches.find((b) => b.id === ret.batchId)) ||
        allBatches.find(
          (b) =>
            b.productId === ret.productId &&
            b.batchNumber?.toUpperCase().trim() === (ret.batchNumber || "").toUpperCase().trim()
        );

      if (matchedBatch) {
        if (ret.sourceBillType === "purchase_bill") {
          // Purchase return deducted stock -> add it back on reversal
          const nextRem = (Number(matchedBatch.remainingQuantity) || 0) + qtyNum;
          await offlineDb.inventoryBatches.update(matchedBatch.id, {
            remainingQuantity: nextRem,
            status:
              new Date(matchedBatch.expiryDate).getTime() <= Date.now() ? "expired" : "active",
            updatedAt: now,
          });
        } else if (ret.disposition === "restocked") {
          const nextRem = Math.max(0, (Number(matchedBatch.remainingQuantity) || 0) - qtyNum);
          await offlineDb.inventoryBatches.update(matchedBatch.id, {
            remainingQuantity: nextRem,
            status: nextRem === 0 ? "depleted" : matchedBatch.status,
            updatedAt: now,
          });
        } else if (ret.disposition === "quarantine_batch") {
          const nextBlocked = Math.max(0, (Number(matchedBatch.blockedQuantity) || 0) - qtyNum);
          await offlineDb.inventoryBatches.update(matchedBatch.id, {
            blockedQuantity: nextBlocked,
            updatedAt: now,
          });
        }
      }

      // Reverse Fresh Replacement Deduction (if replacement was given to customer)
      if (ret.customerResolution === "replacement" && ret.replacementBatchId) {
        const repBatch = await offlineDb.inventoryBatches.get(ret.replacementBatchId);
        if (repBatch) {
          const nextRepRem = (Number(repBatch.remainingQuantity) || 0) + qtyNum;
          await offlineDb.inventoryBatches.update(repBatch.id, {
            remainingQuantity: nextRepRem,
            status:
              new Date(repBatch.expiryDate).getTime() <= Date.now() ? "expired" : "active",
            updatedAt: now,
          });
        }
      }
    }

    // 2. Reverse Customer Khata Balance (if customer khata credit)
    if (!isSupplierReturn && ret.customerResolution === "khata_credit" && ret.totalCreditAmount > 0) {
      const cust = await offlineDb.customers.get(ret.customerId);
      if (cust) {
        const restoredBalance = (Number(cust.currentOutstandingBalance) || 0) + Number(ret.totalCreditAmount);
        await offlineDb.customers.update(cust.id, {
          currentOutstandingBalance: restoredBalance,
          updatedAt: now,
        });
      }
    }

    // 3. Reverse Manufacturer Ledger & Payable Balance (if purchase bill / company payment return)
    if (isSupplierReturn) {
      const ledgerTable = (offlineDb as any).manufacturerLedger;
      if (ledgerTable) {
        const allLedg = (await ledgerTable.toArray()) || [];
        const toDelete = allLedg.filter(
          (e: any) =>
            (ret.manufacturerLedgerEntryId && e.id === ret.manufacturerLedgerEntryId) ||
            e.referenceNumber === ret.returnNoteNumber
        );
        for (const entry of toDelete) {
          await ledgerTable.delete(entry.id);
          scheduleCloudDelete("manufacturerLedger", entry.id);
        }
        const remainingLedg = (await ledgerTable.toArray()) || [];
        localStorage.setItem("noxderma_mfr_ledger", JSON.stringify(remainingLedg));
      }

      if (ret.totalCreditAmount > 0) {
        const mfrs = await offlineDb.manufacturers.toArray();
        const matchedMfr = mfrs.find(
          (m: any) =>
            m.id === ret.customerId ||
            m.name?.toLowerCase() === (ret.customerName || "").toLowerCase()
        );
        if (matchedMfr) {
          // For purchase_bill return, debit reduced payableBalance -> restore by adding back
          // For manufacturer_payment return, credit reversed payment -> restore by subtracting back
          const delta =
            ret.sourceBillType === "manufacturer_payment"
              ? -Number(ret.totalCreditAmount)
              : Number(ret.totalCreditAmount);
          await offlineDb.manufacturers.update(matchedMfr.id, {
            payableBalance: Math.max(0, (Number(matchedMfr.payableBalance) || 0) + delta),
            updatedAt: now,
          });
        }
      }
    }

    // 4. Clean Up Stock Movements created by this Return Slip
    const allMovs = await offlineDb.stockMovements.toArray();
    const relatedMovs = allMovs.filter(
      (m) =>
        (ret.movementId && m.id === ret.movementId) ||
        (ret.extraMovementId && m.id === ret.extraMovementId) ||
        m.referenceId === ret.returnNoteNumber
    );
    for (const m of relatedMovs) {
      await offlineDb.stockMovements.delete(m.id);
      scheduleCloudDelete("stockMovements", m.id);
    }
  };

  // =========================================================================
  // APPLY RETURN IMPACT (SHARED BY CREATE & EDIT)
  // =========================================================================
  const applyReturnRecordImpact = async (params: {
    ret: SalesReturn;
    prod?: Product;
    runningProdBalance?: number;
  }): Promise<{
    movementId?: string;
    extraMovementId?: string;
    manufacturerLedgerEntryId?: string;
    prevBalance: number;
    newBalance: number;
    prevBatchSnapshot: InventoryBatch | null;
    prevReplacementSnapshot: InventoryBatch | null;
    createdBatchId: string | null;
  }> => {
    const { ret, prod } = params;
    const now = new Date().toISOString();
    const qtyNum = Math.max(1, Math.floor(Number(ret.returnQuantity) || 1));
    const safeCost = Math.max(0, Number(ret.unitCost) || 0);
    const cleanBatchNum = (ret.batchNumber || "RET-BATCH").toUpperCase().trim();
    const isSupplierReturn =
      ret.sourceBillType === "purchase_bill" || ret.sourceBillType === "manufacturer_payment";
    const isPhysicalProduct = Boolean(ret.productId && ret.productId !== VOUCHER_PRODUCT_ID);

    let prevBatchSnapshot: InventoryBatch | null = null;
    let prevReplacementSnapshot: InventoryBatch | null = null;
    let createdBatchId: string | null = null;
    let movementId: string | undefined;
    let extraMovementId: string | undefined;
    let manufacturerLedgerEntryId: string | undefined;

    const liveBatches = await offlineDb.inventoryBatches.toArray();
    const currentProdRemaining =
      typeof params.runningProdBalance === "number"
        ? params.runningProdBalance
        : liveBatches
            .filter((b) => b.productId === ret.productId)
            .reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);

    const matchedBatch = isPhysicalProduct
      ? (ret.batchId && liveBatches.find((b) => b.id === ret.batchId)) ||
        liveBatches.find(
          (b) =>
            b.productId === ret.productId &&
            b.batchNumber?.toUpperCase().trim() === cleanBatchNum
        )
      : undefined;

    if (matchedBatch) prevBatchSnapshot = { ...matchedBatch };

    // 1. Stock & Stock Movement updates
    if (isPhysicalProduct) {
      if (ret.sourceBillType === "purchase_bill") {
        // Stock Buying Bill Return -> Deduct returned stock from warehouse & log supplier_return
        if (matchedBatch) {
          const nextRem = Math.max(0, (Number(matchedBatch.remainingQuantity) || 0) - qtyNum);
          await offlineDb.inventoryBatches.update(matchedBatch.id, {
            remainingQuantity: nextRem,
            status: nextRem === 0 ? "depleted" : matchedBatch.status,
            updatedAt: now,
          });
        }
        const mov: StockMovement = {
          id: `mov_supret_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          productId: ret.productId,
          productName: ret.productName,
          batchId: matchedBatch?.id,
          batchNumber: cleanBatchNum,
          type: "supplier_return",
          quantityChange: -qtyNum,
          balanceAfter: Math.max(0, currentProdRemaining - qtyNum),
          referenceId: ret.returnNoteNumber,
          referenceType: "goods_receipt",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: safeCost,
          totalCostValue: qtyNum * safeCost,
          manufacturerId: ret.customerId,
          manufacturerName: ret.customerName,
          reason: `Stock Buying Bill Return (${ret.customerName}, ${ret.invoiceReference})${ret.notes ? ` - ${ret.notes}` : ""}`,
          timestamp: now,
        };
        movementId = mov.id;
        await offlineDb.stockMovements.put(mov);
      } else if (ret.disposition === "restocked") {
        if (matchedBatch) {
          const nextRem = (Number(matchedBatch.remainingQuantity) || 0) + qtyNum;
          await offlineDb.inventoryBatches.update(matchedBatch.id, {
            remainingQuantity: nextRem,
            status:
              new Date(matchedBatch.expiryDate).getTime() <= Date.now() ? "expired" : "active",
            updatedAt: now,
          });
        } else {
          const nextYear = new Date();
          nextYear.setFullYear(nextYear.getFullYear() + 1);
          const createdBatch: InventoryBatch = {
            id: `bch_ret_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            productId: ret.productId,
            productName: ret.productName,
            batchNumber: cleanBatchNum || "RET-GOOD",
            manufacturerId: prod?.manufacturerId || "",
            expiryDate: nextYear.toISOString().slice(0, 10),
            receivedQuantity: qtyNum,
            remainingQuantity: qtyNum,
            blockedQuantity: 0,
            purchasePrice: safeCost,
            unitCost: safeCost,
            status: "active",
            createdAt: now,
            updatedAt: now,
          };
          createdBatchId = createdBatch.id;
          ret.batchId = createdBatch.id;
          await offlineDb.inventoryBatches.put(createdBatch);
        }

        const mov: StockMovement = {
          id: `mov_ret_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          productId: ret.productId,
          productName: ret.productName,
          batchId: matchedBatch?.id || createdBatchId || undefined,
          batchNumber: cleanBatchNum,
          type: "sales_return",
          quantityChange: qtyNum,
          balanceAfter: currentProdRemaining + qtyNum,
          referenceId: ret.returnNoteNumber,
          referenceType: "customer_return",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: safeCost,
          totalCostValue: qtyNum * safeCost,
          reason: `Customer Good Return (${ret.customerName}, ${ret.invoiceReference})${ret.notes ? ` - ${ret.notes}` : ""} -> Added Back to Sellable Stock`,
          timestamp: now,
        };
        movementId = mov.id;
        await offlineDb.stockMovements.put(mov);
      } else if (ret.disposition === "quarantine_batch") {
        if (matchedBatch) {
          const nextBlocked = (Number(matchedBatch.blockedQuantity) || 0) + qtyNum;
          const nextStatus =
            (Number(matchedBatch.remainingQuantity) || 0) === 0
              ? "quarantine"
              : matchedBatch.status;
          await offlineDb.inventoryBatches.update(matchedBatch.id, {
            blockedQuantity: nextBlocked,
            status: nextStatus,
            expiryClaimStatus: "quarantined_pending_claim",
            expiryClaimNotes: `Customer return ${ret.returnNoteNumber} (${ret.customerName})${ret.notes ? `: ${ret.notes}` : ""}`,
            expiryClaimUpdatedAt: now,
            updatedAt: now,
          });
        } else {
          const createdQuarantine: InventoryBatch = {
            id: `bch_qret_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            productId: ret.productId,
            productName: ret.productName,
            batchNumber: cleanBatchNum || "RET-EXP",
            manufacturerId: prod?.manufacturerId || "",
            expiryDate: now.slice(0, 10),
            receivedQuantity: 0,
            remainingQuantity: 0,
            blockedQuantity: qtyNum,
            purchasePrice: safeCost,
            unitCost: safeCost,
            status: "quarantine",
            expiryClaimStatus: "quarantined_pending_claim",
            expiryClaimNotes: `Customer expired return ${ret.returnNoteNumber} (${ret.customerName})${ret.notes ? `: ${ret.notes}` : ""}`,
            expiryClaimUpdatedAt: now,
            createdAt: now,
            updatedAt: now,
          };
          createdBatchId = createdQuarantine.id;
          ret.batchId = createdQuarantine.id;
          await offlineDb.inventoryBatches.put(createdQuarantine);
        }

        const mov: StockMovement = {
          id: `mov_ret_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          productId: ret.productId,
          productName: ret.productName,
          batchId: matchedBatch?.id || createdBatchId || undefined,
          batchNumber: cleanBatchNum,
          type: "reconciliation_adjustment",
          quantityChange: 0,
          balanceAfter: currentProdRemaining,
          referenceId: ret.returnNoteNumber,
          referenceType: "customer_return",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: safeCost,
          totalCostValue: qtyNum * safeCost,
          recoveredAmount: 0,
          netLossAmount: 0,
          claimOutcome: "quarantined_pending_claim",
          reason: `Customer Return (${ret.returnReason}) -> Locked in Quarantine for Company Claim${ret.notes ? ` (${ret.notes})` : ""}`,
          timestamp: now,
        };
        movementId = mov.id;
        await offlineDb.stockMovements.put(mov);
      } else {
        const isExpiry = ret.returnReason === "expired" || ret.returnReason === "near_expiry";
        const lossVal = qtyNum * safeCost;
        const mov: StockMovement = {
          id: `mov_ret_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          productId: ret.productId,
          productName: ret.productName,
          batchId: matchedBatch?.id,
          batchNumber: cleanBatchNum,
          type: isExpiry ? "expiry_write_off" : "damaged_stock",
          quantityChange: 0,
          balanceAfter: currentProdRemaining,
          referenceId: ret.returnNoteNumber,
          referenceType: "customer_return",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: safeCost,
          totalCostValue: lossVal,
          recoveredAmount: 0,
          netLossAmount: lossVal,
          claimOutcome: "direct_write_off",
          reason: `Customer ${isExpiry ? "Expired" : "Broken/Damaged"} Return (${ret.customerName}) -> Written Off Loss (${formatPKR(lossVal)})${ret.notes ? ` - ${ret.notes}` : ""}`,
          timestamp: now,
        };
        movementId = mov.id;
        await offlineDb.stockMovements.put(mov);
      }

      // Fresh replacement stock deduction
      if (!isSupplierReturn && ret.customerResolution === "replacement" && ret.replacementBatchId) {
        const repBatch = await offlineDb.inventoryBatches.get(ret.replacementBatchId);
        if (repBatch) {
          prevReplacementSnapshot = { ...repBatch };
          const nextRepRemaining = Math.max(0, (Number(repBatch.remainingQuantity) || 0) - qtyNum);
          await offlineDb.inventoryBatches.update(repBatch.id, {
            remainingQuantity: nextRepRemaining,
            status: nextRepRemaining === 0 ? "depleted" : repBatch.status,
            updatedAt: now,
          });
          const afterRestockBal =
            ret.disposition === "restocked" ? currentProdRemaining + qtyNum : currentProdRemaining;
          const extraMov: StockMovement = {
            id: `mov_repout_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            productId: ret.productId,
            productName: ret.productName,
            batchId: repBatch.id,
            batchNumber: repBatch.batchNumber,
            type: "sales_deduction",
            quantityChange: -qtyNum,
            balanceAfter: Math.max(0, afterRestockBal - qtyNum),
            referenceId: ret.returnNoteNumber,
            referenceType: "customer_return",
            userId: currentUser?.id || "usr_admin",
            userName: currentUser?.displayName || "Owner",
            unitCost: resolveUnitPurchaseCost({
              productId: ret.productId,
              batchId: repBatch.id,
              pricingMap,
              productMap,
              batchMap,
            }),
            reason: `Fresh Replacement Given to ${ret.customerName} against Return ${ret.returnNoteNumber} (Batch #${repBatch.batchNumber})`,
            timestamp: new Date(Date.now() + 10).toISOString(),
          };
          extraMovementId = extraMov.id;
          await offlineDb.stockMovements.put(extraMov);
        }
      }
    }

    // 2. Customer Khata OR Manufacturer Ledger Update
    let prevBalance = 0;
    let newBalance = 0;

    if (isSupplierReturn) {
      const mfrs = await offlineDb.manufacturers.toArray();
      const matchedMfr = mfrs.find(
        (m: any) =>
          m.id === ret.customerId ||
          m.name?.toLowerCase() === (ret.customerName || "").toLowerCase()
      );
      prevBalance = Number(matchedMfr?.payableBalance) || 0;

      const ledgId = `mfr_ret_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      manufacturerLedgerEntryId = ledgId;
      const isPayReversal = ret.sourceBillType === "manufacturer_payment";
      const ledgEntry = {
        id: ledgId,
        manufacturerId:
          matchedMfr?.id ||
          ret.customerId ||
          ret.customerName.toLowerCase().replace(/[^a-z0-9]/g, "_"),
        manufacturerName: ret.customerName,
        date: ret.returnDate || now.slice(0, 10),
        referenceNumber: ret.returnNoteNumber,
        referenceType: "debit_note",
        description: `${isPayReversal ? "Payment Reversal" : "Stock Buying Bill Return"} (${ret.invoiceReference}) — ${ret.productName} x${qtyNum}${ret.notes ? ` | ${ret.notes}` : ""}`,
        debit: isPayReversal ? 0 : Number(ret.totalCreditAmount) || 0,
        credit: isPayReversal ? Number(ret.totalCreditAmount) || 0 : 0,
        runningBalance: 0,
        createdAt: now,
      };

      await (offlineDb as any).manufacturerLedger?.put(ledgEntry);
      scheduleCloudUpsert("manufacturerLedger", ledgId, ledgEntry);
      const allLedg = (await (offlineDb as any).manufacturerLedger?.toArray()) || [];
      localStorage.setItem("noxderma_mfr_ledger", JSON.stringify(allLedg));

      if (matchedMfr && ret.totalCreditAmount > 0) {
        newBalance = Math.max(
          0,
          isPayReversal
            ? prevBalance + Number(ret.totalCreditAmount)
            : prevBalance - Number(ret.totalCreditAmount)
        );
        await offlineDb.manufacturers.update(matchedMfr.id, {
          payableBalance: newBalance,
          updatedAt: now,
        });
      }
    } else if (ret.customerResolution === "khata_credit" && ret.totalCreditAmount > 0) {
      const liveCust = await offlineDb.customers.get(ret.customerId);
      if (liveCust) {
        prevBalance = Number(liveCust.currentOutstandingBalance) || 0;
        newBalance = prevBalance - Number(ret.totalCreditAmount);
        await offlineDb.customers.update(liveCust.id, {
          currentOutstandingBalance: newBalance,
          updatedAt: now,
        });
      }
    }

    return {
      movementId,
      extraMovementId,
      manufacturerLedgerEntryId,
      prevBalance,
      newBalance,
      prevBatchSnapshot,
      prevReplacementSnapshot,
      createdBatchId,
    };
  };

  // =========================================================================
  // CREATE NEW RETURN SLIP(S)
  // =========================================================================
  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (returnMode === "invoice_return" && !selectedBillObj) {
      setInvoiceError(
        "You must select a bill / voucher first! (Pehle Bill No. select karein — Sale Bill, Buying Bill, Courier Order ya Company Payment — ya 'Open Sale Return' chunein)."
      );
      return;
    }

    const party =
      returnMode === "invoice_return" && selectedBillObj
        ? {
            id: selectedBillObj.partyId || selectedCustomerId || "cust_walkin",
            name: selectedBillObj.partyName || "Customer",
          }
        : customers.find((c) => c.id === selectedCustomerId)
        ? {
            id: customers.find((c) => c.id === selectedCustomerId)!.id,
            name: customers.find((c) => c.id === selectedCustomerId)!.name,
          }
        : null;

    if (!party) {
      alert("Please select a Medical Store / Customer first.");
      return;
    }

    if (activeReturnRows.length === 0) {
      alert(
        returnMode === "invoice_return"
          ? "Please select at least one item from the bill and keep Return Qty > 0."
          : "Please select a medicine and enter Return Qty > 0."
      );
      return;
    }

    const activeSourceBillType: ReturnSourceBillType =
      returnMode === "invoice_return" && selectedBillObj
        ? selectedBillObj.billType
        : "open_return";

    const isSupplierReturn =
      activeSourceBillType === "purchase_bill" || activeSourceBillType === "manufacturer_payment";

    for (const row of activeReturnRows) {
      const qtyNum = Math.floor(Number(row.returnQuantity) || 0);
      if (qtyNum <= 0) {
        alert(`Please enter a valid Return Qty for ${row.productName || "selected item"}.`);
        return;
      }
      if (
        returnMode === "invoice_return" &&
        typeof row.maxReturnableQty === "number" &&
        qtyNum > row.maxReturnableQty
      ) {
        alert(
          `${row.productName}: Return quantity (${qtyNum}) cannot exceed remaining returnable bill quantity (${row.maxReturnableQty}).`
        );
        return;
      }
      if (!row.batchNumber.trim()) {
        alert(`Please enter or select a Batch Number for ${row.productName}.`);
        return;
      }
      if (!isSupplierReturn && customerResolution === "replacement" && row.productId !== VOUCHER_PRODUCT_ID) {
        const repBatch = batches.find((b) => b.id === row.replacementBatchId);
        if (!repBatch || (repBatch.remainingQuantity || 0) < qtyNum) {
          alert(
            `Not enough fresh stock in replacement batch for ${row.productName} (${repBatch?.remainingQuantity || 0} available, need ${qtyNum}).`
          );
          return;
        }
      }
    }

    const now = new Date().toISOString();
    const baseReturnIndex = returns.length + 10;
    const newReturnRecords: SalesReturn[] = [];

    for (let i = 0; i < activeReturnRows.length; i++) {
      const row = activeReturnRows[i];
      const prod = productMap.get(String(row.productId));

      const cleanBatchNum = row.batchNumber.toUpperCase().trim() || "RET-BATCH";
      const qtyNum = Math.max(1, Math.floor(Number(row.returnQuantity) || 1));
      const safeCost = Math.max(0, Number(row.unitCost) || 0);
      const grossPrice = Math.max(0, Number(row.grossUnitPrice) || 0);
      const discPct = Math.min(100, Math.max(0, Number(row.discountPercentage) || 0));
      const netUnitRate = computeNetUnitCredit(grossPrice, discPct);
      const discAmtPerUnit = Number(Math.max(0, grossPrice - netUnitRate).toFixed(2));
      const effectiveResolution: CustomerReturnResolution = isSupplierReturn
        ? "khata_credit"
        : customerResolution;
      const lineTotalCredit =
        effectiveResolution === "replacement" ? 0 : Math.round(qtyNum * netUnitRate);

      const cnPrefix = isSupplierReturn ? "DN" : "CN";
      const cnNumber =
        activeReturnRows.length === 1
          ? `${cnPrefix}-2026-${baseReturnIndex.toString().padStart(3, "0")}`
          : `${cnPrefix}-2026-${baseReturnIndex.toString().padStart(3, "0")}-${i + 1}`;

      const repBatch =
        !isSupplierReturn && effectiveResolution === "replacement"
          ? batches.find((b) => b.id === row.replacementBatchId)
          : undefined;

      const invoiceRefLabel =
        returnMode === "invoice_return" && selectedBillObj
          ? selectedBillObj.refNumber
          : "OPEN-RETURN";

      const newReturn: SalesReturn = {
        id: `ret_${Date.now()}_${i}`,
        returnNoteNumber: cnNumber,
        returnMode,
        sourceBillType: activeSourceBillType,
        invoiceId: returnMode === "invoice_return" ? selectedBillObj?.raw?.id : undefined,
        invoiceReference: invoiceRefLabel,
        customerId: party.id,
        customerName: party.name,
        productId: row.productId,
        productName: row.productName || prod?.name || "Returned Item",
        batchId: row.batchId || undefined,
        batchNumber: cleanBatchNum,
        replacementBatchId: repBatch?.id,
        replacementBatchNumber: repBatch?.batchNumber,
        soldQuantity: row.soldQuantity,
        returnQuantity: qtyNum,
        grossUnitPrice: grossPrice,
        discountPercentage: discPct,
        discountAmountPerUnit: discAmtPerUnit,
        unitCreditPrice: effectiveResolution === "replacement" ? 0 : netUnitRate,
        unitCost: safeCost,
        totalCreditAmount: lineTotalCredit,
        returnReason: reason,
        disposition: isSupplierReturn ? "restocked" : disposition,
        customerResolution: effectiveResolution,
        status: "approved",
        returnDate: now.slice(0, 10),
        recordedByName: currentUser?.displayName || "Owner",
        notes: remarks.trim() || undefined,
      };

      const impact = await applyReturnRecordImpact({ ret: newReturn, prod });
      newReturn.movementId = impact.movementId;
      newReturn.extraMovementId = impact.extraMovementId;
      newReturn.manufacturerLedgerEntryId = impact.manufacturerLedgerEntryId;

      newReturnRecords.push(newReturn);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "create",
        entityType: "sales_return",
        entityId: newReturn.id,
        entityTitle: `${newReturn.returnNoteNumber} - ${newReturn.customerName}`,
        details: `Recorded ${activeSourceBillType.replace(/_/g, " ")} return ${newReturn.returnNoteNumber} (${invoiceRefLabel}) for ${newReturn.customerName}: ${newReturn.productName} (${newReturn.returnQuantity} packs, Rate: ${formatPKR(grossPrice)}, Disc: ${discPct}%, Net: ${formatPKR(lineTotalCredit)})${remarks.trim() ? ` | Remarks: ${remarks.trim()}` : ""}.`,
        snapshotBefore: {
          customerId: party.id,
          prevBalance: impact.prevBalance,
          batch: impact.prevBatchSnapshot,
          replacementBatch: impact.prevReplacementSnapshot,
        },
        snapshotAfter: {
          returnRecord: newReturn,
          movementId: impact.movementId || null,
          extraMovementId: impact.extraMovementId || null,
          createdBatchId: impact.createdBatchId,
          customerId: party.id,
          newBalance: impact.newBalance,
        },
        canUndo: true,
      }).catch(console.warn);
    }

    // If Courier / Online order was returned, update its status to "returned"
    if (activeSourceBillType === "online_order" && selectedBillObj?.raw?.id) {
      try {
        await (offlineDb as any).onlineOrders?.update(selectedBillObj.raw.id, {
          status: "returned",
        });
      } catch {}
    }

    await saveReturns([...newReturnRecords, ...returns]);
    await loadData();
    setIsProcessing(false);
    showNotice(
      isSupplierReturn
        ? `Company Return Slip saved (${formatPKR(returnTotals.netCreditAmount)}) & Company Khata updated!`
        : customerResolution === "replacement"
        ? `Replacement Return (${newReturnRecords.length} item${newReturnRecords.length > 1 ? "s" : ""}, ${returnTotals.totalPacks} packs) saved!`
        : `Return Slip (${formatPKR(returnTotals.netCreditAmount)}) saved & stock/khata updated!`
    );
  };

  // =========================================================================
  // EDIT EXISTING RETURN SLIP
  // =========================================================================
  const handleOpenEditModal = (ret: SalesReturn) => {
    setEditingReturn(ret);
    setEditBatchId(ret.batchId || "");
    setEditBatchNumber(ret.batchNumber || "");
    setEditQty(Number(ret.returnQuantity) || 1);
    setEditGrossPrice(Number(ret.grossUnitPrice ?? ret.unitCreditPrice) || 0);
    setEditDiscountPct(Number(ret.discountPercentage) || 0);
    setEditUnitCost(Number(ret.unitCost) || 0);
    setEditReason(ret.returnReason || "pharmacy_overstock");
    setEditDisposition(ret.disposition || "restocked");
    setEditResolution(ret.customerResolution || "khata_credit");
    setEditReplacementBatchId(ret.replacementBatchId || "");
    setEditRemarks(ret.notes || "");
  };

  const handleSaveEditReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReturn) return;

    const qtyNum = Math.max(1, Math.floor(Number(editQty) || 1));
    if (
      editingReturn.returnMode === "invoice_return" &&
      typeof editingReturn.soldQuantity === "number" &&
      editingReturn.soldQuantity > 0 &&
      qtyNum > editingReturn.soldQuantity
    ) {
      alert(
        `Return Qty (${qtyNum}) cannot exceed original Bill Qty (${editingReturn.soldQuantity}).`
      );
      return;
    }

    const isSupplierReturn =
      editingReturn.sourceBillType === "purchase_bill" ||
      editingReturn.sourceBillType === "manufacturer_payment";

    if (
      !isSupplierReturn &&
      editResolution === "replacement" &&
      editingReturn.productId !== VOUCHER_PRODUCT_ID
    ) {
      const repBatch = batches.find((b) => b.id === editReplacementBatchId);
      const effectiveAvail =
        (repBatch?.remainingQuantity || 0) +
        (editingReturn.customerResolution === "replacement" &&
        editingReturn.replacementBatchId === editReplacementBatchId
          ? Number(editingReturn.returnQuantity) || 0
          : 0);
      if (!repBatch || effectiveAvail < qtyNum) {
        alert(
          `Not enough fresh stock in selected replacement batch (${effectiveAvail} available, need ${qtyNum}).`
        );
        return;
      }
    }

    setIsSavingEdit(true);
    try {
      const beforeSnapshot = { ...editingReturn };

      // 1. Reverse old slip impact cleanly
      await reverseSalesReturnImpact(editingReturn);

      // 2. Build updated SalesReturn record
      const grossPrice = Math.max(0, Number(editGrossPrice) || 0);
      const discPct = Math.min(100, Math.max(0, Number(editDiscountPct) || 0));
      const netUnitRate = computeNetUnitCredit(grossPrice, discPct);
      const discAmtPerUnit = Number(Math.max(0, grossPrice - netUnitRate).toFixed(2));
      const effectiveRes: CustomerReturnResolution = isSupplierReturn
        ? "khata_credit"
        : editResolution;
      const newTotalCredit =
        effectiveRes === "replacement" ? 0 : Math.round(qtyNum * netUnitRate);

      const repBatch =
        !isSupplierReturn && effectiveRes === "replacement"
          ? batches.find((b) => b.id === editReplacementBatchId)
          : undefined;

      const updatedReturn: SalesReturn = {
        ...editingReturn,
        batchId: editBatchId || undefined,
        batchNumber: editBatchNumber.toUpperCase().trim() || editingReturn.batchNumber,
        replacementBatchId: repBatch?.id,
        replacementBatchNumber: repBatch?.batchNumber,
        returnQuantity: qtyNum,
        grossUnitPrice: grossPrice,
        discountPercentage: discPct,
        discountAmountPerUnit: discAmtPerUnit,
        unitCreditPrice: effectiveRes === "replacement" ? 0 : netUnitRate,
        unitCost: Math.max(0, Number(editUnitCost) || 0),
        totalCreditAmount: newTotalCredit,
        returnReason: editReason,
        disposition: isSupplierReturn ? "restocked" : editDisposition,
        customerResolution: effectiveRes,
        notes: editRemarks.trim() || undefined,
      };

      // 3. Apply new impact cleanly
      const prod = productMap.get(String(updatedReturn.productId));
      const impact = await applyReturnRecordImpact({ ret: updatedReturn, prod });
      updatedReturn.movementId = impact.movementId;
      updatedReturn.extraMovementId = impact.extraMovementId;
      updatedReturn.manufacturerLedgerEntryId = impact.manufacturerLedgerEntryId;

      const nextList = returns.map((r) => (r.id === updatedReturn.id ? updatedReturn : r));
      await saveReturns(nextList);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "update",
        entityType: "sales_return",
        entityId: updatedReturn.id,
        entityTitle: `${updatedReturn.returnNoteNumber} - ${updatedReturn.customerName}`,
        details: `Edited return slip ${updatedReturn.returnNoteNumber}: Qty ${beforeSnapshot.returnQuantity} → ${updatedReturn.returnQuantity}, Net ${formatPKR(beforeSnapshot.totalCreditAmount)} → ${formatPKR(updatedReturn.totalCreditAmount)}.`,
        snapshotBefore: beforeSnapshot,
        snapshotAfter: updatedReturn,
        canUndo: false,
      }).catch(console.warn);

      await loadData();
      setEditingReturn(null);
      showNotice(`Return Slip ${updatedReturn.returnNoteNumber} updated & stock/khata recalculated!`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // =========================================================================
  // DELETE RETURN SLIP (SINGLE & BULK)
  // =========================================================================
  const handleDeleteSingleReturn = async (ret: SalesReturn) => {
    setIsDeletingLoading(true);
    try {
      await reverseSalesReturnImpact(ret);
      const nextList = returns.filter((r) => r.id !== ret.id);
      await saveReturns(nextList, [ret.id]);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "sales_return",
        entityId: ret.id,
        entityTitle: `${ret.returnNoteNumber} - ${ret.customerName}`,
        details: `Deleted return slip ${ret.returnNoteNumber} (${ret.productName} x${ret.returnQuantity}, ${formatPKR(ret.totalCreditAmount)}) and reversed stock & khata.`,
        snapshotBefore: ret,
        canUndo: true,
      }).catch(console.warn);

      setSelectedReturnIds((prev) => prev.filter((id) => id !== ret.id));
      setDeletingReturn(null);
      await loadData();
      showNotice(
        `Return Slip ${ret.returnNoteNumber} deleted — stock & khata balance cleanly reversed!`
      );
    } finally {
      setIsDeletingLoading(false);
    }
  };

  const handleBulkDeleteReturns = async () => {
    const toDelete = returns.filter((r) => selectedReturnIds.includes(r.id));
    if (toDelete.length === 0) return;

    setIsDeletingLoading(true);
    try {
      for (const ret of toDelete) {
        await reverseSalesReturnImpact(ret);
      }
      const delIds = toDelete.map((r) => r.id);
      const nextList = returns.filter((r) => !delIds.includes(r.id));
      await saveReturns(nextList, delIds);

      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "sales_return",
        entityId: delIds.join(","),
        entityTitle: `${toDelete.length} Return Slips Deleted`,
        details: `Bulk deleted ${toDelete.length} return slips (${toDelete.map((r) => r.returnNoteNumber).join(", ")}) and reversed stock & khata.`,
        snapshotBefore: toDelete,
        canUndo: true,
      }).catch(console.warn);

      setSelectedReturnIds([]);
      setIsBulkDeleting(false);
      await loadData();
      showNotice(`${toDelete.length} return slips deleted & stock/khata cleanly reversed!`);
    } finally {
      setIsDeletingLoading(false);
    }
  };

  const filtered = useMemo(() => {
    return returns.filter((r) => {
      if (!isRecordInDateRange(r.returnDate, dateFilter)) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        r.returnNoteNumber.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.batchNumber.toLowerCase().includes(q) ||
        (r.invoiceReference || "").toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q)
      );
    });
  }, [returns, search, dateFilter]);

  const totalCreditIssued = filtered.reduce((sum, r) => sum + (Number(r.totalCreditAmount) || 0), 0);
  const selectedReturnsTotal = returns
    .filter((r) => selectedReturnIds.includes(r.id))
    .reduce((sum, r) => sum + (Number(r.totalCreditAmount) || 0), 0);

  const isAllFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedReturnIds.includes(r.id));

  const handleToggleSelectReturn = (id: string) => {
    setSelectedReturnIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllReturns = () => {
    if (isAllFilteredSelected) {
      setSelectedReturnIds([]);
    } else {
      setSelectedReturnIds(filtered.map((r) => r.id));
    }
  };

  const billMeta = selectedBillObj ? getBillTypeMeta(selectedBillObj.billType) : null;
  const isSupplierBillSelected =
    selectedBillObj?.billType === "purchase_bill" ||
    selectedBillObj?.billType === "manufacturer_payment";
  const allReturnableBillRowsChecked =
    draftRows.filter((r) => (r.maxReturnableQty ?? 0) > 0).length > 0 &&
    draftRows
      .filter((r) => (r.maxReturnableQty ?? 0) > 0)
      .every((r) => r.selected && r.returnQuantity > 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Returns &amp; Reversals
            </span>
            <span className="text-xs text-slate-400">
              Sale Bills, Buying Bills, Payments &amp; Open Returns
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Medicine &amp; Bill Returns (Wapis Stock)
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => handleOpenModal("invoice_return")}
            className="px-4 py-2.5 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all btn-interactive"
          >
            <Receipt className="w-4 h-4" /> Return Against Bill
          </button>

          <button
            type="button"
            onClick={() => handleOpenModal("open_return")}
            className="px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 border border-slate-700 shadow-sm transition-all btn-interactive"
          >
            <Plus className="w-4 h-4 text-teal-400" /> Open Sale Return (No Bill)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Returns Recorded
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-slate-100">
            {returns.length} Slips
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Bill Returns, Company Returns &amp; Open Returns
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Total Return Value
          </span>
          <span className="text-2xl font-black font-mono text-rose-600">
            {formatPKR(totalCreditIssued)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Adjusted in Khata / Refunded
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Quarantine / Near Expiry Returns
          </span>
          <span className="text-2xl font-black text-amber-600">
            {returns.filter((r) => r.disposition === "quarantine_batch").length} Batches
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Kept aside for Company Claim (do not sell)
          </span>
        </div>
      </div>

      {/* Success Toast Notice */}
      {successNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Universal Date Filter */}
      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={filtered.length}
      />

      {/* Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between text-xs">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search return slip #, bill #, shop/company, medicine, batch or remarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Sleek Floating Bulk Delete Bar */}
      {canManageReturns && (
        <FloatingBulkActionBar
          count={selectedReturnIds.length}
          singularLabel="Return Slip Selected"
          pluralLabel="Return Slips Selected"
          subtitle={formatPKR(selectedReturnsTotal)}
          onClear={() => setSelectedReturnIds([])}
          onDelete={() => setIsBulkDeleting(true)}
        />
      )}

      {/* Returns Table & Mobile Cards */}
      <div
        className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 ${
          selectedReturnIds.length > 0 ? "pb-20 lg:pb-16" : ""
        }`}
      >
        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {canManageReturns && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1 text-xs">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllFilteredSelected}
                  onChange={handleToggleSelectAllReturns}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700 cursor-pointer"
                />
                <span>
                  {isAllFilteredSelected
                    ? `Deselect All (${filtered.length})`
                    : `Select All (${filtered.length})`}
                </span>
              </label>
              <span className="font-mono text-[11px] text-slate-400 font-semibold">
                {filtered.length} slips
              </span>
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No return slips found.
            </div>
          ) : (
            filtered.map((ret) => {
              const badge = getSourceBillBadge(ret);
              const isSelected = selectedReturnIds.includes(ret.id);
              return (
                <div
                  key={ret.id}
                  className={`p-3.5 rounded-xl border space-y-2.5 text-xs transition-all ${
                    isSelected
                      ? "border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/20 dark:bg-teal-950/20"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      {canManageReturns && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectReturn(ret.id)}
                          className="w-4 h-4 mt-0.5 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700 cursor-pointer shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                          {ret.customerName}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400">
                            {ret.returnNoteNumber} • {formatKarachiDate(ret.returnDate)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {canManageReturns && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(ret)}
                            title="Edit Return Slip"
                            aria-label="Edit Return Slip"
                            className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingReturn(ret)}
                            title="Delete Return Slip"
                            aria-label="Delete Return Slip"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-800 dark:text-slate-200 block">
                          {ret.productName}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          Batch: {ret.batchNumber}
                          {typeof ret.soldQuantity === "number" && ret.soldQuantity > 0
                            ? ` • Bill Qty: ${ret.soldQuantity}`
                            : ""}
                        </span>
                      </div>
                      <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0">
                        {ret.returnQuantity} packs
                      </span>
                    </div>

                    {ret.customerResolution !== "replacement" && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                        <span>
                          Rate: <strong>{formatPKR(ret.grossUnitPrice ?? ret.unitCreditPrice)}</strong>
                        </span>
                        {Number(ret.discountPercentage) > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-bold">
                            Disc: {ret.discountPercentage}%
                          </span>
                        )}
                        <span className="ml-auto font-black text-rose-600">
                          {formatPKR(ret.totalCreditAmount)}
                        </span>
                      </div>
                    )}
                  </div>

                  {ret.notes && (
                    <div className="px-2.5 py-1.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50 text-[11px] text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span>
                        <strong>Remarks:</strong> {ret.notes}
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-slate-500 capitalize">
                      Reason:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {ret.returnReason === "expired"
                          ? "Expired"
                          : ret.returnReason === "near_expiry"
                          ? "Near Expiry"
                          : ret.returnReason === "transit_damage"
                          ? "Broken / Damaged"
                          : ret.returnReason === "pharmacy_overstock"
                          ? "Fresh / Overstock"
                          : ret.returnReason.replace("_", " ")}
                      </strong>
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ret.sourceBillType === "purchase_bill"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                          : ret.disposition === "quarantine_batch"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : ret.disposition === "scrap_writeoff"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {ret.sourceBillType === "purchase_bill"
                        ? "RETURNED TO COMPANY"
                        : ret.sourceBillType === "manufacturer_payment"
                        ? "COMPANY ADJUSTMENT"
                        : ret.disposition === "quarantine_batch"
                        ? "QUARANTINE (CLAIM)"
                        : ret.disposition === "scrap_writeoff"
                        ? "WRITTEN OFF (LOSS)"
                        : "ADDED BACK TO STOCK"}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                {canManageReturns && (
                  <th className="p-2.5 w-9 text-center">
                    <input
                      type="checkbox"
                      checked={isAllFilteredSelected}
                      onChange={handleToggleSelectAllReturns}
                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                    />
                  </th>
                )}
                <th className="p-2.5">Return Slip #</th>
                <th className="p-2.5">Party &amp; Bill Reference</th>
                <th className="p-2.5">Medicine &amp; Batch</th>
                <th className="p-2.5">Rate &amp; Discount</th>
                <th className="p-2.5">Reason &amp; Remarks</th>
                <th className="p-2.5">Stock Routing</th>
                <th className="p-2.5 text-right">Amount (-)</th>
                {canManageReturns && <th className="p-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((ret) => {
                const badge = getSourceBillBadge(ret);
                const isSelected = selectedReturnIds.includes(ret.id);
                return (
                  <tr
                    key={ret.id}
                    className={`transition-colors ${
                      isSelected
                        ? "bg-teal-50/40 dark:bg-teal-950/20"
                        : "hover:bg-slate-50/60 dark:hover:bg-slate-800/40"
                    }`}
                  >
                    {canManageReturns && (
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectReturn(ret.id)}
                          className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                        />
                      </td>
                    )}
                    <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400 whitespace-nowrap">
                      {ret.returnNoteNumber}
                      <span className="text-[10px] text-slate-400 block font-normal font-sans">
                        {formatKarachiDate(ret.returnDate)}
                      </span>
                    </td>
                    <td className="p-2.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        {ret.customerName}
                      </span>
                      <span
                        className={`inline-flex items-center whitespace-nowrap mt-0.5 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">
                      <span className="font-semibold block">{ret.productName}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Batch: {ret.batchNumber} • <strong>{ret.returnQuantity} packs</strong>
                        {typeof ret.soldQuantity === "number" && ret.soldQuantity > 0
                          ? ` (Bill: ${ret.soldQuantity})`
                          : ""}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono whitespace-nowrap">
                      {ret.customerResolution === "replacement" ? (
                        <span className="text-slate-400 text-[11px]">1-to-1 Replacement</span>
                      ) : (
                        <div>
                          <span className="text-slate-800 dark:text-slate-200 font-bold block">
                            {formatPKR(ret.unitCreditPrice)} / pack
                          </span>
                          {Number(ret.discountPercentage) > 0 ? (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                              Gross {formatPKR(ret.grossUnitPrice || ret.unitCreditPrice)} (-
                              {ret.discountPercentage}%)
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">0% Disc</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400 max-w-[210px]">
                      <span className="font-semibold capitalize block text-slate-700 dark:text-slate-300">
                        {ret.returnReason === "expired"
                          ? "Expired"
                          : ret.returnReason === "near_expiry"
                          ? "Near Expiry"
                          : ret.returnReason === "transit_damage"
                          ? "Broken / Damaged"
                          : ret.returnReason === "pharmacy_overstock"
                          ? "Fresh / Shop Overstock"
                          : ret.returnReason.replace("_", " ")}
                      </span>
                      {ret.notes && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5 break-words">
                          &ldquo;{ret.notes}&rdquo;
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold ${
                          ret.sourceBillType === "purchase_bill"
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                            : ret.sourceBillType === "manufacturer_payment"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                            : ret.disposition === "quarantine_batch"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : ret.disposition === "scrap_writeoff"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        }`}
                      >
                        {ret.sourceBillType === "purchase_bill"
                          ? "RETURNED TO COMPANY"
                          : ret.sourceBillType === "manufacturer_payment"
                          ? "COMPANY LEDGER ADJ"
                          : ret.disposition === "quarantine_batch"
                          ? "QUARANTINE (CLAIM PENDING)"
                          : ret.disposition === "scrap_writeoff"
                          ? "WRITTEN OFF (LOSS)"
                          : "ADDED BACK TO STOCK"}
                      </span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold whitespace-nowrap">
                      {ret.customerResolution === "replacement" ? (
                        <span className="text-teal-600 text-[11px]">
                          Replaced (#{ret.replacementBatchNumber || "FRESH"})
                        </span>
                      ) : (
                        <span className="text-rose-600">
                          {formatPKR(ret.totalCreditAmount)}
                          <span className="block text-[9px] text-slate-400 font-sans">
                            {ret.sourceBillType === "purchase_bill" ||
                            ret.sourceBillType === "manufacturer_payment"
                              ? "Company Khata"
                              : ret.customerResolution === "cash_refund"
                              ? "Cash Refund"
                              : "Khata Credit"}
                          </span>
                        </span>
                      )}
                    </td>
                    {canManageReturns && (
                      <td className="p-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(ret)}
                            title="Edit Return Slip"
                            className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/60 text-amber-600 transition-colors btn-interactive"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingReturn(ret)}
                            title="Delete Return Slip (Reverse Stock & Khata)"
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/60 text-rose-500 hover:text-rose-700 transition-colors btn-interactive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* CREATE RETURN MODAL (UNIVERSAL BILL RETURN vs OPEN SALE RETURN)           */}
      {/* ========================================================================= */}
      {isProcessing && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-teal-600" /> Record Return (Wapis Maal / Bill)
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Kisi bhi Bill / PO / Order / Payment number se sara data auto-load karein ya Open
                  Return lagayein
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePriceRights}
                  disabled={!canEditPriceRights}
                  title={
                    canEditPriceRights
                      ? "Click to lock/unlock manual editing of Return Price & Discount %"
                      : "Only Owner / users with Pricing Edit rights can unlock Price & Discount"
                  }
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border transition-all ${
                    canModifyPriceAndDiscount
                      ? "bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 shadow-sm"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  } ${!canEditPriceRights ? "opacity-60 cursor-not-allowed" : "btn-interactive"}`}
                >
                  {canModifyPriceAndDiscount ? (
                    <>
                      <Unlock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Price &amp; Discount Rights: OPEN</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Price &amp; Discount Rights: LOCKED</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setIsProcessing(false)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80">
              <button
                type="button"
                onClick={() => handleSwitchMode("invoice_return")}
                className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
                  returnMode === "invoice_return"
                    ? "bg-teal-600 text-white shadow-md shadow-teal-600/20"
                    : "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/50"
                }`}
              >
                <Receipt className="w-4 h-4 shrink-0" />
                <span>1. Return Against Bill / PO / Voucher (Number Se)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchMode("open_return")}
                className={`py-2.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
                  returnMode === "open_return"
                    ? "bg-slate-900 dark:bg-teal-600 text-white shadow-md"
                    : "text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/50"
                }`}
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>2. Open Sale Return (Bina Bill Ke)</span>
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="space-y-4 text-xs">
              {/* =============================================================== */}
              {/* MODE 1: UNIVERSAL BILL / VOUCHER LOOKUP RETURN                  */}
              {/* =============================================================== */}
              {returnMode === "invoice_return" && (
                <div className="space-y-3 p-3.5 sm:p-4 rounded-2xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/40 dark:bg-teal-950/20">
                  {/* Bill Category Filter Chips */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      { id: "all", label: "All Bills & Vouchers", icon: Receipt },
                      { id: "sale_invoice", label: "Sale Bills (INV)", icon: Receipt },
                      { id: "purchase_bill", label: "Stock Buying Bills (PO/GRN)", icon: ShoppingBag },
                      { id: "online_order", label: "Courier Orders", icon: Truck },
                      { id: "manufacturer_payment", label: "Company Payments", icon: Factory },
                      { id: "customer_payment", label: "Customer Receipts", icon: Wallet },
                    ].map((chip) => {
                      const Icon = chip.icon;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => setBillTypeFilter(chip.id as any)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border transition-all ${
                            billTypeFilter === chip.id
                              ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span>{chip.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                        Step 1: Enter Any Bill / PO / Voucher No. or Party Name *
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="e.g. INV-1002, PO-2026-001, ORD-101, PV-..."
                          value={invoiceSearchQuery}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInvoiceSearchQuery(val);
                            setInvoiceError("");
                            const clean = val.trim().toLowerCase();
                            if (!clean) return;
                            const exact = universalBills.find(
                              (b) =>
                                b.refNumber.toLowerCase() === clean ||
                                b.altRefs.some((r) => r.toLowerCase() === clean)
                            );
                            if (exact) {
                              handleSelectUniversalBill(exact);
                            }
                          }}
                          className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                        Select Matched Bill ({matchingBills.length} found) *
                      </label>
                      <select
                        value={selectedBillKey}
                        onChange={(e) => {
                          const found =
                            universalBills.find((b) => b.key === e.target.value) || null;
                          handleSelectUniversalBill(found);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                      >
                        <option value="">-- Select Any Sale Bill / Buying Bill / Payment --</option>
                        {matchingBills.map((b) => {
                          const meta = getBillTypeMeta(b.billType);
                          return (
                            <option key={b.key} value={b.key}>
                              [{meta.tag}] {b.refNumber} — {b.partyName} (
                              {formatKarachiDate(b.date)} • {formatPKR(b.totalAmount)})
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {invoiceError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{invoiceError}</span>
                    </div>
                  )}

                  {!selectedBillObj ? (
                    <div className="p-4 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-dashed border-teal-300 dark:border-teal-800 text-center text-slate-500">
                      <Receipt className="w-7 h-7 text-teal-600 mx-auto mb-1 opacity-75" />
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        You must select a bill / invoice to auto-load its items &amp; discounts
                      </p>
                      <p className="text-[11px] mt-0.5">
                        Sale Invoice, Stock Buying Bill (PO/GRN), Courier Order ya Company Payment
                        voucher ka number dalein — sara data aur default Return Qty khud fill ho
                        jayegi.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-teal-600 text-white font-mono font-bold text-[11px]">
                            {billMeta?.tag}: {selectedBillObj.refNumber}
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">
                            {selectedBillObj.partyName}
                          </span>
                          <span className="text-slate-400">
                            • Date: {formatKarachiDate(selectedBillObj.date)}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          Bill Total: {formatPKR(selectedBillObj.totalAmount)}
                        </div>
                      </div>

                      {/* Bill Items Table (Return Qty auto-filled = Sold/Bought Qty & Editable!) */}
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="p-2.5 w-9 text-center">
                                <input
                                  type="checkbox"
                                  title="Select / Unselect all items"
                                  checked={allReturnableBillRowsChecked}
                                  onChange={(e) => handleToggleSelectAllBillRows(e.target.checked)}
                                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                                />
                              </th>
                              <th className="p-2.5">Medicine / Item &amp; Batch</th>
                              <th className="p-2.5 text-center whitespace-nowrap">
                                {billMeta?.qtyLabel || "Sold Qty"}
                              </th>
                              <th className="p-2.5 text-right whitespace-nowrap">
                                {billMeta?.priceLabel || "Price"}{" "}
                                {canModifyPriceAndDiscount ? "(Edit)" : "🔒"}
                              </th>
                              <th className="p-2.5 text-right whitespace-nowrap">
                                Disc % {canModifyPriceAndDiscount ? "(Edit)" : "🔒"}
                              </th>
                              <th className="p-2.5 text-right whitespace-nowrap">Net Rate</th>
                              <th className="p-2.5 text-center whitespace-nowrap w-28">
                                Return Qty *
                              </th>
                              <th className="p-2.5 text-right whitespace-nowrap">Return Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {draftRows.map((row) => {
                              const netRate = computeNetUnitCredit(
                                row.grossUnitPrice,
                                row.discountPercentage
                              );
                              const rowTotal =
                                row.selected && row.returnQuantity > 0
                                  ? Math.round(row.returnQuantity * netRate)
                                  : 0;
                              const isFullyReturned = (row.maxReturnableQty ?? 0) <= 0;

                              return (
                                <tr
                                  key={row.rowId}
                                  className={`${
                                    row.selected && row.returnQuantity > 0
                                      ? "bg-teal-50/50 dark:bg-teal-950/30"
                                      : ""
                                  }`}
                                >
                                  <td className="p-2.5 text-center">
                                    <input
                                      type="checkbox"
                                      disabled={isFullyReturned}
                                      checked={row.selected && row.returnQuantity > 0}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        const fallbackQty = row.maxReturnableQty ?? 1;
                                        updateDraftRow(row.rowId, {
                                          selected: checked,
                                          returnQuantity: checked
                                            ? row.returnQuantity > 0
                                              ? Math.min(row.returnQuantity, fallbackQty)
                                              : fallbackQty
                                            : 0,
                                        });
                                      }}
                                      className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-2.5">
                                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                                      {row.productName}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-500">
                                      Batch: #{row.batchNumber}
                                      {row.packSize ? ` • ${row.packSize}` : ""}
                                    </span>
                                  </td>
                                  <td className="p-2.5 text-center font-mono whitespace-nowrap">
                                    <span className="font-extrabold text-slate-800 dark:text-slate-200">
                                      {row.soldQuantity}
                                    </span>
                                    {Number(row.bonusQuantity) > 0 && (
                                      <span className="block text-[10px] text-teal-600 font-bold">
                                        +{row.bonusQuantity} Bonus
                                      </span>
                                    )}
                                    {Number(row.alreadyReturnedQty) > 0 && (
                                      <span className="block text-[10px] text-rose-500 font-bold">
                                        Returned: {row.alreadyReturnedQty}
                                      </span>
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right font-mono whitespace-nowrap">
                                    <input
                                      type="number"
                                      min="0"
                                      step="any"
                                      disabled={!canModifyPriceAndDiscount}
                                      value={row.grossUnitPrice}
                                      onChange={(e) =>
                                        updateDraftRow(row.rowId, {
                                          grossUnitPrice: Math.max(0, Number(e.target.value) || 0),
                                        })
                                      }
                                      className={`w-24 px-2 py-1 rounded-lg border text-right font-mono font-bold ${
                                        canModifyPriceAndDiscount
                                          ? "border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                          : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
                                      }`}
                                    />
                                  </td>
                                  <td className="p-2.5 text-right font-mono whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1 justify-end">
                                      <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="any"
                                        disabled={!canModifyPriceAndDiscount}
                                        value={row.discountPercentage}
                                        onChange={(e) =>
                                          updateDraftRow(row.rowId, {
                                            discountPercentage: Math.min(
                                              100,
                                              Math.max(0, Number(e.target.value) || 0)
                                            ),
                                          })
                                        }
                                        className={`w-16 px-2 py-1 rounded-lg border text-right font-mono font-bold ${
                                          canModifyPriceAndDiscount
                                            ? "border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300"
                                            : "border-amber-200/80 dark:border-amber-900/50 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 cursor-not-allowed"
                                        }`}
                                      />
                                      <span className="text-[11px] font-bold text-amber-600">%</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-bold text-teal-700 dark:text-teal-300 whitespace-nowrap">
                                    {formatPKR(netRate)}
                                  </td>
                                  <td className="p-2.5 text-center whitespace-nowrap">
                                    {isFullyReturned ? (
                                      <span className="text-[10px] font-bold text-rose-500 uppercase">
                                        All Returned
                                      </span>
                                    ) : (
                                      <input
                                        type="number"
                                        min="0"
                                        max={row.maxReturnableQty}
                                        value={row.returnQuantity === 0 ? "" : row.returnQuantity}
                                        placeholder="0"
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          const parsed =
                                            raw === "" ? 0 : Math.floor(Number(raw) || 0);
                                          const clamped = Math.min(
                                            Math.max(0, parsed),
                                            row.maxReturnableQty ?? parsed
                                          );
                                          updateDraftRow(row.rowId, {
                                            selected: clamped > 0,
                                            returnQuantity: clamped,
                                          });
                                        }}
                                        className="w-20 px-2 py-1 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-center font-mono font-extrabold text-slate-900 dark:text-slate-100"
                                      />
                                    )}
                                  </td>
                                  <td className="p-2.5 text-right font-mono font-extrabold text-rose-600 whitespace-nowrap">
                                    {formatPKR(rowTotal)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Tip: Return Qty default par full bill quantity par auto-fill hoti hai — agar
                        customer kam quantity wapis kar raha ho (maslan 3 me se 1) to aap directly
                        box me <strong>1</strong> likh sakte hain ya kisi item ko uncheck kar sakte
                        hain.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* =============================================================== */}
              {/* MODE 2: OPEN SALE RETURN (WITHOUT BILL)                         */}
              {/* =============================================================== */}
              {returnMode === "open_return" && (
                <div className="space-y-3 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
                      Open Sale Return Mode: Bina Bill Number ke direct kisi bhi medicine ki return
                      lagayein
                    </span>

                    <button
                      type="button"
                      onClick={() => setDraftRows((prev) => [...prev, createEmptyOpenRow()])}
                      className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm btn-interactive"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Another Medicine
                    </button>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Medical Store / Pharmacy (Customer) *
                    </label>
                    <select
                      required
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                    >
                      <option value="">-- Choose Shop / Customer --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Udhaar: {formatPKR(c.currentOutstandingBalance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Open Return Medicine Lines */}
                  <div className="space-y-3">
                    {draftRows.map((row, idx) => {
                      const prodBatches = batches.filter((b) => b.productId === row.productId);
                      const netRate = computeNetUnitCredit(
                        row.grossUnitPrice,
                        row.discountPercentage
                      );
                      const lineNetTotal = Math.round((Number(row.returnQuantity) || 0) * netRate);

                      return (
                        <div
                          key={row.rowId}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-2.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-[11px] uppercase tracking-wider text-teal-600">
                              Return Item #{idx + 1}
                            </span>
                            {draftRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setDraftRows((prev) => prev.filter((r) => r.rowId !== row.rowId))
                                }
                                className="text-rose-500 hover:text-rose-700 p-1 rounded-lg flex items-center gap-1 text-[11px] font-bold"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Remove
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            <div>
                              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Medicine *
                              </label>
                              <select
                                required
                                value={row.productId}
                                onChange={(e) => handleOpenRowProductChange(row.rowId, e.target.value)}
                                className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                              >
                                <option value="">-- Choose Medicine --</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Returned Batch No. *
                              </label>
                              <div className="flex gap-1.5">
                                {prodBatches.length > 0 && (
                                  <select
                                    value={row.batchId}
                                    onChange={(e) => {
                                      const bId = e.target.value;
                                      const found = prodBatches.find((b) => b.id === bId);
                                      updateDraftRow(row.rowId, {
                                        batchId: bId,
                                        batchNumber: found ? found.batchNumber : row.batchNumber,
                                      });
                                    }}
                                    className="w-1/2 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px]"
                                  >
                                    <option value="">Pick Batch</option>
                                    {prodBatches.map((b) => (
                                      <option key={b.id} value={b.id}>
                                        #{b.batchNumber}
                                      </option>
                                    ))}
                                  </select>
                                )}
                                <input
                                  type="text"
                                  required
                                  placeholder="Batch #"
                                  value={row.batchNumber}
                                  onChange={(e) =>
                                    updateDraftRow(row.rowId, { batchNumber: e.target.value })
                                  }
                                  className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Return Qty (Packs) *
                              </label>
                              <input
                                type="number"
                                min="1"
                                required
                                value={row.returnQuantity === 0 ? "" : row.returnQuantity}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  updateDraftRow(row.rowId, {
                                    returnQuantity: raw === "" ? 0 : Math.max(0, Number(raw) || 0),
                                  });
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 font-mono font-bold"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                            <div>
                              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Price / Pack {canModifyPriceAndDiscount ? "(Edit)" : "🔒"}
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                disabled={!canModifyPriceAndDiscount}
                                value={row.grossUnitPrice}
                                onChange={(e) =>
                                  updateDraftRow(row.rowId, {
                                    grossUnitPrice: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className={`w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold ${
                                  canModifyPriceAndDiscount
                                    ? "border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                                    : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
                                }`}
                              />
                            </div>

                            <div>
                              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Discount % {canModifyPriceAndDiscount ? "(Edit)" : "🔒"}
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="any"
                                  disabled={!canModifyPriceAndDiscount}
                                  value={row.discountPercentage}
                                  onChange={(e) =>
                                    updateDraftRow(row.rowId, {
                                      discountPercentage: Math.min(
                                        100,
                                        Math.max(0, Number(e.target.value) || 0)
                                      ),
                                    })
                                  }
                                  className={`w-full pr-7 pl-2.5 py-1.5 rounded-lg border font-mono font-bold ${
                                    canModifyPriceAndDiscount
                                      ? "border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300"
                                      : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
                                  }`}
                                />
                                <Percent className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                              </div>
                            </div>

                            <div>
                              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                                Cost / Pack (Kharid)
                              </label>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={row.unitCost}
                                onChange={(e) =>
                                  updateDraftRow(row.rowId, {
                                    unitCost: Math.max(0, Number(e.target.value) || 0),
                                  })
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                              />
                            </div>

                            <div className="flex flex-col justify-end p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700">
                              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                                Net Rate: {formatPKR(netRate)}
                              </span>
                              <span className="font-mono font-extrabold text-sm text-rose-600">
                                Total: {formatPKR(lineNetTotal)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* =============================================================== */}
              {/* REASON, STOCK ROUTING & REMARKS                                 */}
              {/* =============================================================== */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Return Condition / Reason (Wapis Kyun Hua?) *
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => handleReasonSelect(e.target.value as SalesReturnReason)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="pharmacy_overstock">
                      Fresh Maal / Dead Stock / Shop Overstock
                    </option>
                    <option value="expired">Expired Medicine</option>
                    <option value="near_expiry">Near Expiry (&lt; 3 Months)</option>
                    <option value="transit_damage">Broken / Damaged in Transit</option>
                    <option value="wrong_supply">Wrong Medicine Supplied</option>
                    <option value="recall">Company Recall</option>
                  </select>
                </div>

                {!isSupplierBillSelected ? (
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Where to Route Returned Stock? *
                    </label>
                    <select
                      value={disposition}
                      onChange={(e) => setDisposition(e.target.value as SalesReturnDisposition)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                    >
                      <option value="restocked">
                        Good / Fresh Condition -&gt; Add Back to Sellable Stock
                      </option>
                      <option value="quarantine_batch">
                        Quarantine (Lock for Company Claim — Do Not Sell)
                      </option>
                      <option value="scrap_writeoff">
                        Expired / Broken -&gt; Write-off as P&amp;L Loss
                      </option>
                    </select>
                  </div>
                ) : (
                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center text-indigo-800 dark:text-indigo-200 font-semibold">
                    Company Bill Return: Warehouse stock minus hoga aur Company Khata me Debit Note
                    auto-add hoga.
                  </div>
                )}
              </div>

              {/* Remarks Input */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Remarks / Custom Reason Note (ریمارکس / واپس کرنے کی وجہ)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bill nahi tha, dead stock tha, 3 me se 1 pack wapis liya, etc."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Customer Settlement Mode (Only for Customer Returns) */}
              {!isSupplierBillSelected && (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block">
                    How Do You Settle With Customer? (Customer Ko Kya Dena Hai?) *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "khata_credit", label: "Minus Udhaar / Khata Credit" },
                      { id: "cash_refund", label: "Cash Wapis Diya" },
                      { id: "replacement", label: "Fresh Maal Badlay Mein" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setCustomerResolution(opt.id as CustomerReturnResolution)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                          customerResolution === opt.id
                            ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                            : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {customerResolution === "replacement" && activeReturnRows.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">
                        Select Fresh Replacement Batch for Returned Item(s) *
                      </span>
                      {activeReturnRows
                        .filter((r) => r.productId !== VOUCHER_PRODUCT_ID)
                        .map((row) => {
                          const repBatches = getActiveReplacementBatchesForProduct(row.productId);
                          return (
                            <div
                              key={row.rowId}
                              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                            >
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                {row.productName} ({row.returnQuantity} packs)
                              </span>
                              <select
                                required
                                value={row.replacementBatchId}
                                onChange={(e) =>
                                  updateDraftRow(row.rowId, { replacementBatchId: e.target.value })
                                }
                                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px]"
                              >
                                <option value="">-- Pick Active Non-Expired Batch --</option>
                                {repBatches.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    #{b.batchNumber} • Avail: {b.remainingQuantity} • Exp:{" "}
                                    {formatKarachiDate(b.expiryDate)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}

              {/* Live Calculation Summary */}
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    Selected Items: <strong>{activeReturnRows.length}</strong> (
                    <strong>{returnTotals.totalPacks}</strong> packs)
                  </span>
                  {(isSupplierBillSelected || customerResolution !== "replacement") && (
                    <span className="font-mono">
                      Gross: <strong>{formatPKR(returnTotals.grossAmount)}</strong>
                      {returnTotals.discountAmount > 0
                        ? ` • Less Discount: -${formatPKR(returnTotals.discountAmount)}`
                        : ""}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-rose-200/70 dark:border-rose-800/60 font-extrabold text-sm">
                  <span className="text-rose-900 dark:text-rose-200">
                    {isSupplierBillSelected
                      ? "Net Debit Note / Adjustment in Company Khata:"
                      : customerResolution === "replacement"
                      ? "Fresh Replacement Stock Given (Udhaar Unchanged):"
                      : customerResolution === "cash_refund"
                      ? "Net Cash Refund to Customer:"
                      : "Net Return Amount Deducted from Customer Udhaar:"}
                  </span>
                  <span className="font-mono text-base text-rose-600 dark:text-rose-400">
                    {!isSupplierBillSelected && customerResolution === "replacement"
                      ? `${returnTotals.totalPacks} packs`
                      : formatPKR(returnTotals.netCreditAmount)}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsProcessing(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold shadow-md shadow-teal-600/20 btn-interactive"
                >
                  Save Return Slip &amp; Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EDIT RETURN SLIP MODAL                                                    */}
      {/* ========================================================================= */}
      {editingReturn && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-amber-600" /> Edit Return Slip{" "}
                  <span className="font-mono text-teal-600">{editingReturn.returnNoteNumber}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  {editingReturn.customerName} • {editingReturn.productName} ({editingReturn.invoiceReference})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingReturn(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Price &amp; Discount Editing:
              </span>
              <button
                type="button"
                onClick={togglePriceRights}
                disabled={!canEditPriceRights}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 border ${
                  canModifyPriceAndDiscount
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                    : "bg-white dark:bg-slate-900 text-slate-600 border-slate-200 dark:border-slate-700"
                }`}
              >
                {canModifyPriceAndDiscount ? (
                  <>
                    <Unlock className="w-3 h-3" /> OPEN
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3" /> LOCKED
                  </>
                )}
              </button>
            </div>

            <form onSubmit={handleSaveEditReturn} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Return Qty (Packs) *
                    {editingReturn.soldQuantity ? ` (Max ${editingReturn.soldQuantity})` : ""}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={editingReturn.soldQuantity || undefined}
                    required
                    value={editQty === 0 ? "" : editQty}
                    onChange={(e) =>
                      setEditQty(e.target.value === "" ? 0 : Math.max(0, Number(e.target.value) || 0))
                    }
                    className="w-full px-3 py-2 rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Batch No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={editBatchNumber}
                    onChange={(e) => setEditBatchNumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Price {canModifyPriceAndDiscount ? "" : "🔒"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    disabled={!canModifyPriceAndDiscount}
                    value={editGrossPrice}
                    onChange={(e) => setEditGrossPrice(Math.max(0, Number(e.target.value) || 0))}
                    className={`w-full px-2.5 py-2 rounded-xl border font-mono font-bold ${
                      canModifyPriceAndDiscount
                        ? "border-emerald-300 bg-white dark:bg-slate-800"
                        : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
                    }`}
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Disc % {canModifyPriceAndDiscount ? "" : "🔒"}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    disabled={!canModifyPriceAndDiscount}
                    value={editDiscountPct}
                    onChange={(e) =>
                      setEditDiscountPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
                    }
                    className={`w-full px-2.5 py-2 rounded-xl border font-mono font-bold ${
                      canModifyPriceAndDiscount
                        ? "border-emerald-300 bg-white dark:bg-slate-800"
                        : "border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/60 text-slate-500 cursor-not-allowed"
                    }`}
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Cost / Pack
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editUnitCost}
                    onChange={(e) => setEditUnitCost(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Return Reason
                  </label>
                  <select
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value as SalesReturnReason)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="pharmacy_overstock">Fresh Maal / Dead Stock / Overstock</option>
                    <option value="expired">Expired Medicine</option>
                    <option value="near_expiry">Near Expiry</option>
                    <option value="transit_damage">Broken / Damaged</option>
                    <option value="wrong_supply">Wrong Supply</option>
                    <option value="recall">Company Recall</option>
                  </select>
                </div>

                {editingReturn.sourceBillType !== "purchase_bill" &&
                  editingReturn.sourceBillType !== "manufacturer_payment" && (
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Stock Routing
                      </label>
                      <select
                        value={editDisposition}
                        onChange={(e) =>
                          setEditDisposition(e.target.value as SalesReturnDisposition)
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        <option value="restocked">Add Back to Sellable Stock</option>
                        <option value="quarantine_batch">Quarantine (Company Claim)</option>
                        <option value="scrap_writeoff">Write-off Loss</option>
                      </select>
                    </div>
                  )}
              </div>

              {editingReturn.sourceBillType !== "purchase_bill" &&
                editingReturn.sourceBillType !== "manufacturer_payment" && (
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Customer Settlement
                    </label>
                    <select
                      value={editResolution}
                      onChange={(e) =>
                        setEditResolution(e.target.value as CustomerReturnResolution)
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="khata_credit">Minus Udhaar / Khata Credit</option>
                      <option value="cash_refund">Cash Refund</option>
                      <option value="replacement">Fresh Maal Replacement</option>
                    </select>
                  </div>
                )}

              {editResolution === "replacement" &&
                editingReturn.sourceBillType !== "purchase_bill" &&
                editingReturn.productId !== VOUCHER_PRODUCT_ID && (
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Fresh Replacement Batch *
                    </label>
                    <select
                      required
                      value={editReplacementBatchId}
                      onChange={(e) => setEditReplacementBatchId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    >
                      <option value="">-- Select Fresh Batch --</option>
                      {getActiveReplacementBatchesForProduct(editingReturn.productId).map((b) => (
                        <option key={b.id} value={b.id}>
                          #{b.batchNumber} • Avail: {b.remainingQuantity} • Exp:{" "}
                          {formatKarachiDate(b.expiryDate)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Remarks / Reason Note
                </label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between font-extrabold">
                <span className="text-amber-900 dark:text-amber-200">Updated Net Return Amount:</span>
                <span className="font-mono text-rose-600 text-sm">
                  {editResolution === "replacement" &&
                  editingReturn.sourceBillType !== "purchase_bill"
                    ? `${editQty} packs (Replacement)`
                    : formatPKR(
                        Math.round(editQty * computeNetUnitCredit(editGrossPrice, editDiscountPct))
                      )}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingReturn(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-sm disabled:opacity-50 btn-interactive"
                >
                  {isSavingEdit ? "Updating..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SINGLE RETURN DELETE CONFIRMATION MODAL                                   */}
      {/* ========================================================================= */}
      {deletingReturn && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Delete Return Slip {deletingReturn.returnNoteNumber}?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                <strong>{deletingReturn.customerName}</strong> — {deletingReturn.productName} (
                {deletingReturn.returnQuantity} packs, {formatPKR(deletingReturn.totalCreditAmount)})
              </p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-2.5 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Is slip ko delete karne par stock batches, stock history aur customer/company
                  khata balance automatically pehle jaisa reverse ho jayega.
                </span>
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={() => setDeletingReturn(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={() => handleDeleteSingleReturn(deletingReturn)}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 btn-interactive"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingLoading ? "Deleting..." : "Delete & Reverse"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* BULK RETURN DELETE CONFIRMATION MODAL                                     */}
      {/* ========================================================================= */}
      {isBulkDeleting && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                Delete {selectedReturnIds.length} Selected Return Slips?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Total Return Value:{" "}
                <strong className="font-mono text-rose-600">
                  {formatPKR(selectedReturnsTotal)}
                </strong>
              </p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-2.5 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 flex items-start gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Tamam muntakhib return slips delete ho jayengi aur unka stock + khata balance
                  automatically pehle jaisa reverse ho jayega.
                </span>
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={() => setIsBulkDeleting(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingLoading}
                onClick={handleBulkDeleteReturns}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-1.5 disabled:opacity-50 btn-interactive"
              >
                <Trash2 className="w-4 h-4" />
                <span>
                  {isDeletingLoading ? "Deleting..." : `Delete ${selectedReturnIds.length} Slips`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
