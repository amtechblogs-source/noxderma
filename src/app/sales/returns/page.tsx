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
  X,
  AlertCircle,
  FileText,
  Percent,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import { recordActivity } from "@/lib/audit/auditTracker";
import { resolveUnitPurchaseCost } from "@/lib/inventory/expiryUtils";
import type {
  Customer,
  Product,
  ProductPricing,
  InventoryBatch,
  Invoice,
  StockMovement,
  SalesReturn,
  SalesReturnMode,
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

export default function SalesReturnsPage() {
  const { currentUser, hasPermission } = useAuth();
  const canEditPriceRights = hasPermission("pricing:edit");

  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productPricings, setProductPricings] = useState<ProductPricing[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [isProcessing, setIsProcessing] = useState(false);

  // Return Mode: "invoice_return" (Against Sale Bill) vs "open_return" (Without Bill)
  const [returnMode, setReturnMode] = useState<SalesReturnMode>("invoice_return");

  // Price & Discount Rights Lock (Default locked = false so staff/owner don't accidentally alter rates unless unlocked)
  const [isPriceRightsUnlocked, setIsPriceRightsUnlocked] = useState(false);

  // Invoice Return State
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceError, setInvoiceError] = useState("");

  // Shared Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [draftRows, setDraftRows] = useState<ReturnDraftRow[]>([]);
  const [reason, setReason] = useState<SalesReturnReason>("pharmacy_overstock");
  const [disposition, setDisposition] = useState<SalesReturnDisposition>("restocked");
  const [customerResolution, setCustomerResolution] =
    useState<CustomerReturnResolution>("khata_credit");
  const [remarks, setRemarks] = useState("");

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

  const loadData = async () => {
    try {
      const [custList, prodList, pricingList, batchList, invList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
        offlineDb.productPricing ? offlineDb.productPricing.toArray() : Promise.resolve([]),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.invoices ? offlineDb.invoices.toArray() : Promise.resolve([]),
      ]);
      setCustomers(custList);
      setProducts(prodList);
      setProductPricings(pricingList || []);
      setBatches(batchList || []);

      const sortedInvoices = [...(invList || [])].sort(
        (a, b) =>
          String(b.invoiceDate || b.createdAt || "").localeCompare(
            String(a.invoiceDate || a.createdAt || "")
          ) || String(b.id || "").localeCompare(String(a.id || ""))
      );
      setInvoices(sortedInvoices);

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
    } finally {
      setLoading(false);
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

  const saveReturns = async (updated: SalesReturn[]) => {
    setReturns(updated);
    localStorage.setItem("noxderma_sales_returns", JSON.stringify(updated));
    try {
      if ((offlineDb as any).salesReturns) {
        await (offlineDb as any).salesReturns.clear();
        if (updated.length > 0) {
          await (offlineDb as any).salesReturns.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync salesReturns to offlineDb:", err);
    }
  };

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
    setInvoiceSearchQuery("");
    setSelectedInvoiceId("");
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
      setSelectedInvoiceId("");
      if (draftRows.length === 0 || draftRows[0]?.lineId) {
        setDraftRows([createEmptyOpenRow()]);
      }
    } else {
      setDraftRows([]);
      setSelectedInvoiceId("");
    }
  };

  // Build rows from a selected sale invoice
  const handleSelectInvoice = (inv: Invoice | null) => {
    if (!inv) {
      setSelectedInvoiceId("");
      setDraftRows([]);
      return;
    }

    setSelectedInvoiceId(inv.id);
    setInvoiceError("");
    if (inv.customerId && customers.some((c) => c.id === inv.customerId)) {
      setSelectedCustomerId(inv.customerId);
    } else {
      const byName = customers.find(
        (c) => c.name.toLowerCase().trim() === (inv.customerName || "").toLowerCase().trim()
      );
      setSelectedCustomerId(byName?.id || inv.customerId || "");
    }

    const builtRows: ReturnDraftRow[] = (inv.lines || []).map((line, idx) => {
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

      return {
        rowId: `invline_${inv.id}_${line.id || idx}`,
        lineId: line.id,
        productId: line.productId,
        productName: line.productName,
        packSize: line.packSize,
        batchId: matchedBatch?.id || alloc?.batchId || "",
        batchNumber: alloc?.batchNumber || matchedBatch?.batchNumber || "BILL-BATCH",
        soldQuantity: soldQty,
        bonusQuantity: Number(line.bonusQuantity) || 0,
        alreadyReturnedQty: alreadyRet,
        maxReturnableQty: maxRet,
        selected: (inv.lines || []).length === 1 && maxRet > 0,
        returnQuantity: (inv.lines || []).length === 1 && maxRet > 0 ? 1 : 0,
        grossUnitPrice: grossPrice,
        discountPercentage: effectiveDiscPct,
        unitCost: resolvedCost,
        replacementBatchId: repBatches[0]?.id || "",
      };
    });

    setDraftRows(builtRows);
  };

  // Filtered invoices for lookup dropdown
  const matchingInvoices = useMemo(() => {
    const q = invoiceSearchQuery.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (selectedCustomerId && inv.customerId && inv.customerId !== selectedCustomerId) {
        // Still allow direct invoice number match even if customer filter differs
        if (
          !q ||
          (!inv.provisionalReference?.toLowerCase().includes(q) &&
            !inv.officialReference?.toLowerCase().includes(q) &&
            !inv.id.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      if (!q) return true;
      return (
        (inv.provisionalReference || "").toLowerCase().includes(q) ||
        (inv.officialReference || "").toLowerCase().includes(q) ||
        inv.id.toLowerCase().includes(q) ||
        (inv.customerName || "").toLowerCase().includes(q) ||
        (inv.customerPhone || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, invoiceSearchQuery, selectedCustomerId]);

  const selectedInvoiceObj = useMemo(
    () => invoices.find((i) => i.id === selectedInvoiceId) || null,
    [invoices, selectedInvoiceId]
  );

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

  // Active rows that have a valid medicine and returnQuantity > 0
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

  // Totals across active return rows
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
      totalCostAmount += qtyNum * (Math.max(0, Number(r.unitCost) || 0));
    }

    return {
      totalPacks,
      grossAmount: Math.round(grossAmount),
      discountAmount: Math.round(discountAmount),
      netCreditAmount: Math.round(netCreditAmount),
      totalCostAmount: Math.round(totalCostAmount),
    };
  }, [activeReturnRows, customerResolution]);

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. In Invoice Return Mode, enforce selecting a retail/sale invoice first!
    if (returnMode === "invoice_return" && !selectedInvoiceObj) {
      setInvoiceError(
        "You must select a sale invoice first! (Pehle Bill Number select karein, ya agar bill nahi hai to upar 'Open Sale Return' chunein)."
      );
      return;
    }

    const cust =
      customers.find((c) => c.id === selectedCustomerId) ||
      (selectedInvoiceObj
        ? {
            id: selectedInvoiceObj.customerId || "cust_walkin",
            name: selectedInvoiceObj.customerName || "Walk-in Customer",
            currentOutstandingBalance: 0,
          }
        : null);

    if (!cust) {
      alert("Please select a Medical Store / Customer first.");
      return;
    }

    if (activeReturnRows.length === 0) {
      alert(
        returnMode === "invoice_return"
          ? "Please select at least one medicine from the bill and enter Return Qty > 0."
          : "Please select a medicine and enter Return Qty > 0."
      );
      return;
    }

    // Validate quantities and replacement batches
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
      if (customerResolution === "replacement") {
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
    let runningCustomerBalance = Number(cust.currentOutstandingBalance) || 0;

    // Keep track of live batch quantities in case multiple rows touch the same product/batch
    const localBatchRemaining = new Map<string, number>();
    products.forEach((p) => {
      const totalRem = batches
        .filter((b) => b.productId === p.id)
        .reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);
      localBatchRemaining.set(p.id, totalRem);
    });

    for (let i = 0; i < activeReturnRows.length; i++) {
      const row = activeReturnRows[i];
      const prod = productMap.get(String(row.productId));
      if (!prod) continue;

      const cleanBatchNum = row.batchNumber.toUpperCase().trim() || "RET-BATCH";
      const qtyNum = Math.max(1, Math.floor(Number(row.returnQuantity) || 1));
      const safeCost = Math.max(0, Number(row.unitCost) || 0);
      const grossPrice = Math.max(0, Number(row.grossUnitPrice) || 0);
      const discPct = Math.min(100, Math.max(0, Number(row.discountPercentage) || 0));
      const netUnitRate = computeNetUnitCredit(grossPrice, discPct);
      const discAmtPerUnit = Number(Math.max(0, grossPrice - netUnitRate).toFixed(2));
      const lineTotalCredit =
        customerResolution === "replacement" ? 0 : Math.round(qtyNum * netUnitRate);

      const cnNumber =
        activeReturnRows.length === 1
          ? `CN-2026-${baseReturnIndex.toString().padStart(3, "0")}`
          : `CN-2026-${baseReturnIndex.toString().padStart(3, "0")}-${i + 1}`;

      const matchedBatch =
        batches.find((b) => b.id === row.batchId) ||
        batches.find(
          (b) =>
            b.productId === prod.id &&
            b.batchNumber?.toUpperCase().trim() === cleanBatchNum
        );

      const repBatch =
        customerResolution === "replacement"
          ? batches.find((b) => b.id === row.replacementBatchId)
          : undefined;

      const invoiceRefLabel =
        returnMode === "invoice_return" && selectedInvoiceObj
          ? selectedInvoiceObj.provisionalReference ||
            selectedInvoiceObj.officialReference ||
            selectedInvoiceObj.id
          : "OPEN-RETURN";

      const newReturn: SalesReturn = {
        id: `ret_${Date.now()}_${i}`,
        returnNoteNumber: cnNumber,
        returnMode,
        invoiceId: returnMode === "invoice_return" ? selectedInvoiceObj?.id : undefined,
        invoiceReference: invoiceRefLabel,
        customerId: cust.id,
        customerName: cust.name,
        productId: prod.id,
        productName: prod.name,
        batchId: matchedBatch?.id,
        batchNumber: cleanBatchNum,
        replacementBatchId: repBatch?.id,
        replacementBatchNumber: repBatch?.batchNumber,
        soldQuantity: row.soldQuantity,
        returnQuantity: qtyNum,
        grossUnitPrice: grossPrice,
        discountPercentage: discPct,
        discountAmountPerUnit: discAmtPerUnit,
        unitCreditPrice: customerResolution === "replacement" ? 0 : netUnitRate,
        unitCost: safeCost,
        totalCreditAmount: lineTotalCredit,
        returnReason: reason,
        disposition,
        customerResolution,
        status: "approved",
        returnDate: now.slice(0, 10),
        recordedByName: currentUser?.displayName || "Owner",
        notes: remarks.trim() || undefined,
      };

      const currentProdRemaining = localBatchRemaining.get(prod.id) || 0;
      const prevBatchSnapshot: InventoryBatch | null = matchedBatch ? { ...matchedBatch } : null;
      let createdBatchId: string | null = null;
      let prevReplacementSnapshot: InventoryBatch | null = null;
      let movement: StockMovement;
      let extraMovement: StockMovement | null = null;

      if (disposition === "restocked") {
        if (matchedBatch) {
          const freshBatch = await offlineDb.inventoryBatches.get(matchedBatch.id);
          const baseRem = Number((freshBatch || matchedBatch).remainingQuantity) || 0;
          const nextRem = baseRem + qtyNum;
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
            id: `bch_ret_${Date.now()}_${i}`,
            productId: prod.id,
            productName: prod.name,
            batchNumber: cleanBatchNum || "RET-GOOD",
            manufacturerId: prod.manufacturerId || "",
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
          await offlineDb.inventoryBatches.put(createdBatch);
        }

        localBatchRemaining.set(prod.id, currentProdRemaining + qtyNum);
        movement = {
          id: `mov_ret_${Date.now()}_${i}`,
          productId: prod.id,
          productName: prod.name,
          batchId: matchedBatch?.id || createdBatchId || undefined,
          batchNumber: cleanBatchNum,
          type: "sales_return",
          quantityChange: qtyNum,
          balanceAfter: currentProdRemaining + qtyNum,
          referenceId: cnNumber,
          referenceType: "customer_return",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: safeCost,
          totalCostValue: qtyNum * safeCost,
          reason: `Customer Good Return (${cust.name}, ${invoiceRefLabel})${remarks.trim() ? ` - ${remarks.trim()}` : ""} -> Added Back to Sellable Stock`,
          timestamp: now,
        };
        await offlineDb.stockMovements.put(movement);
      } else if (disposition === "quarantine_batch") {
        if (matchedBatch) {
          const freshBatch = await offlineDb.inventoryBatches.get(matchedBatch.id);
          const baseBlocked = Number((freshBatch || matchedBatch).blockedQuantity) || 0;
          const nextBlocked = baseBlocked + qtyNum;
          const nextStatus =
            (Number((freshBatch || matchedBatch).remainingQuantity) || 0) === 0
              ? "quarantine"
              : matchedBatch.status;
          await offlineDb.inventoryBatches.update(matchedBatch.id, {
            blockedQuantity: nextBlocked,
            status: nextStatus,
            expiryClaimStatus: "quarantined_pending_claim",
            expiryClaimNotes: `Customer return ${cnNumber} (${cust.name})${remarks.trim() ? `: ${remarks.trim()}` : ""}`,
            expiryClaimUpdatedAt: now,
            updatedAt: now,
          });
        } else {
          const createdQuarantine: InventoryBatch = {
            id: `bch_qret_${Date.now()}_${i}`,
            productId: prod.id,
            productName: prod.name,
            batchNumber: cleanBatchNum || "RET-EXP",
            manufacturerId: prod.manufacturerId || "",
            expiryDate: now.slice(0, 10),
            receivedQuantity: 0,
            remainingQuantity: 0,
            blockedQuantity: qtyNum,
            purchasePrice: safeCost,
            unitCost: safeCost,
            status: "quarantine",
            expiryClaimStatus: "quarantined_pending_claim",
            expiryClaimNotes: `Customer expired return ${cnNumber} (${cust.name})${remarks.trim() ? `: ${remarks.trim()}` : ""}`,
            expiryClaimUpdatedAt: now,
            createdAt: now,
            updatedAt: now,
          };
          createdBatchId = createdQuarantine.id;
          await offlineDb.inventoryBatches.put(createdQuarantine);
        }

        movement = {
          id: `mov_ret_${Date.now()}_${i}`,
          productId: prod.id,
          productName: prod.name,
          batchId: matchedBatch?.id || createdBatchId || undefined,
          batchNumber: cleanBatchNum,
          type: "reconciliation_adjustment",
          quantityChange: 0,
          balanceAfter: currentProdRemaining,
          referenceId: cnNumber,
          referenceType: "customer_return",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: safeCost,
          totalCostValue: qtyNum * safeCost,
          recoveredAmount: 0,
          netLossAmount: 0,
          claimOutcome: "quarantined_pending_claim",
          reason: `Customer Return (${reason}) -> Locked in Quarantine for Company Claim${remarks.trim() ? ` (${remarks.trim()})` : ""}`,
          timestamp: now,
        };
        await offlineDb.stockMovements.put(movement);
      } else {
        const isExpiry = reason === "expired" || reason === "near_expiry";
        const lossVal = qtyNum * safeCost;
        movement = {
          id: `mov_ret_${Date.now()}_${i}`,
          productId: prod.id,
          productName: prod.name,
          batchId: matchedBatch?.id,
          batchNumber: cleanBatchNum,
          type: isExpiry ? "expiry_write_off" : "damaged_stock",
          quantityChange: 0,
          balanceAfter: currentProdRemaining,
          referenceId: cnNumber,
          referenceType: "customer_return",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: safeCost,
          totalCostValue: lossVal,
          recoveredAmount: 0,
          netLossAmount: lossVal,
          claimOutcome: "direct_write_off",
          reason: `Customer ${isExpiry ? "Expired" : "Broken/Damaged"} Return (${cust.name}) -> Written Off Loss (${formatPKR(lossVal)})${remarks.trim() ? ` - ${remarks.trim()}` : ""}`,
          timestamp: now,
        };
        await offlineDb.stockMovements.put(movement);
      }

      if (customerResolution === "replacement" && repBatch) {
        prevReplacementSnapshot = { ...repBatch };
        const freshRep = await offlineDb.inventoryBatches.get(repBatch.id);
        const baseRepRem = Number((freshRep || repBatch).remainingQuantity) || 0;
        const nextRepRemaining = Math.max(0, baseRepRem - qtyNum);
        await offlineDb.inventoryBatches.update(repBatch.id, {
          remainingQuantity: nextRepRemaining,
          status: nextRepRemaining === 0 ? "depleted" : repBatch.status,
          updatedAt: now,
        });

        const afterRestockBal = localBatchRemaining.get(prod.id) || 0;
        localBatchRemaining.set(prod.id, Math.max(0, afterRestockBal - qtyNum));

        extraMovement = {
          id: `mov_repout_${Date.now()}_${i}`,
          productId: prod.id,
          productName: prod.name,
          batchId: repBatch.id,
          batchNumber: repBatch.batchNumber,
          type: "sales_deduction",
          quantityChange: -qtyNum,
          balanceAfter: Math.max(0, afterRestockBal - qtyNum),
          referenceId: cnNumber,
          referenceType: "customer_return",
          userId: currentUser?.id || "usr_admin",
          userName: currentUser?.displayName || "Owner",
          unitCost: resolveUnitPurchaseCost({
            productId: prod.id,
            batchId: repBatch.id,
            pricingMap,
            productMap,
            batchMap,
          }),
          reason: `Fresh Replacement Given to ${cust.name} against Return ${cnNumber} (From Batch #${repBatch.batchNumber})`,
          timestamp: new Date(Date.now() + i + 1).toISOString(),
        };
        await offlineDb.stockMovements.put(extraMovement);
      }

      const prevBalanceForRow = runningCustomerBalance;
      const nextBalanceForRow =
        customerResolution === "khata_credit"
          ? prevBalanceForRow - lineTotalCredit
          : prevBalanceForRow;
      runningCustomerBalance = nextBalanceForRow;

      if (customerResolution === "khata_credit" && customers.some((c) => c.id === cust.id)) {
        await offlineDb.customers.update(cust.id, {
          currentOutstandingBalance: nextBalanceForRow,
          updatedAt: now,
        });
      }

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
        details: `Recorded ${returnMode === "invoice_return" ? `Invoice Return (${invoiceRefLabel})` : "Open Sale Return"} ${newReturn.returnNoteNumber} for ${newReturn.customerName}: ${newReturn.productName} (${newReturn.returnQuantity} packs, Rate: ${formatPKR(grossPrice)}, Disc: ${discPct}%, Net: ${formatPKR(lineTotalCredit)})${remarks.trim() ? ` | Remarks: ${remarks.trim()}` : ""}.`,
        snapshotBefore: {
          customerId: cust.id,
          prevBalance: prevBalanceForRow,
          batch: prevBatchSnapshot,
          replacementBatch: prevReplacementSnapshot,
        },
        snapshotAfter: {
          returnRecord: newReturn,
          movementId: movement.id,
          extraMovementId: extraMovement?.id || null,
          createdBatchId,
          customerId: cust.id,
          newBalance: nextBalanceForRow,
        },
        canUndo: true,
      }).catch(console.warn);
    }

    await saveReturns([...newReturnRecords, ...returns]);
    await loadData();
    setIsProcessing(false);

    alert(
      customerResolution === "replacement"
        ? `Replacement Return (${newReturnRecords.length} item${newReturnRecords.length > 1 ? "s" : ""}, ${returnTotals.totalPacks} packs) saved!`
        : customerResolution === "cash_refund"
        ? `Cash Refund Return (${formatPKR(returnTotals.netCreditAmount)}) recorded for ${cust.name}.`
        : `Sale Return (${formatPKR(returnTotals.netCreditAmount)}) applied to ${cust.name}'s Khata.`
    );
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

  const totalCreditIssued = filtered.reduce((sum, r) => sum + r.totalCreditAmount, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Customer Returns
            </span>
            <span className="text-xs text-slate-400">Invoice Return &amp; Open Return</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Customer Medicine Returns (Wapis Stock)
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
            {returns.length} Returns
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Bill Returns &amp; Open Returns
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Total Return Amount (Deducted from Udhaar)
          </span>
          <span className="text-2xl font-black font-mono text-rose-600">
            {formatPKR(totalCreditIssued)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Subtracted from Customer Khata / Refunded
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
            placeholder="Search return no, bill no, shop name, medicine, batch or remarks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>
      </div>

      {/* Returns Table & Mobile Cards */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        {/* Mobile Card View */}
        <div className="block md:hidden space-y-3">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No customer return records found.
            </div>
          ) : (
            filtered.map((ret) => {
              const isOpenMode =
                ret.returnMode === "open_return" ||
                ret.invoiceReference === "OPEN-RETURN" ||
                ret.invoiceReference === "DIRECT-RETURN";
              return (
                <div
                  key={ret.id}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {ret.customerName}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400">
                          {ret.returnNoteNumber} • {formatKarachiDate(ret.returnDate)}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            isOpenMode
                              ? "bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                              : "bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300"
                          }`}
                        >
                          {isOpenMode ? "Open Return" : `Bill: ${ret.invoiceReference}`}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {ret.customerResolution === "replacement" ? (
                        <>
                          <span className="text-[10px] font-bold text-teal-600 uppercase block">
                            Replaced
                          </span>
                          <span className="font-mono font-black text-teal-600">
                            Batch #{ret.replacementBatchNumber || "FRESH"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-[10px] font-bold text-rose-600 uppercase block">
                            {ret.customerResolution === "cash_refund"
                              ? "Cash Refund"
                              : "Khata Minus (-)"}
                          </span>
                          <span className="font-mono font-black text-rose-600">
                            {formatPKR(ret.totalCreditAmount)}
                          </span>
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
                            ? ` • Sold on Bill: ${ret.soldQuantity}`
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
                        <span className="ml-auto font-bold text-slate-800 dark:text-slate-200">
                          Net/Pack: {formatPKR(ret.unitCreditPrice)}
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
                        ret.disposition === "quarantine_batch"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : ret.disposition === "scrap_writeoff"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                      }`}
                    >
                      {ret.disposition === "quarantine_batch"
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
                <th className="p-2.5">Return Slip #</th>
                <th className="p-2.5">Medical Store &amp; Mode / Bill</th>
                <th className="p-2.5">Medicine &amp; Batch</th>
                <th className="p-2.5">Rate &amp; Discount</th>
                <th className="p-2.5">Reason &amp; Remarks</th>
                <th className="p-2.5">Where Stock is Kept</th>
                <th className="p-2.5 text-right">Amount Deducted (-)</th>
                <th className="p-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((ret) => {
                const isOpenMode =
                  ret.returnMode === "open_return" ||
                  ret.invoiceReference === "OPEN-RETURN" ||
                  ret.invoiceReference === "DIRECT-RETURN";
                return (
                  <tr
                    key={ret.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
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
                        className={`inline-flex items-center whitespace-nowrap mt-0.5 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${
                          isOpenMode
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                            : "bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300"
                        }`}
                      >
                        {isOpenMode ? "OPEN RETURN" : `Bill: ${ret.invoiceReference}`}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">
                      <span className="font-semibold block">{ret.productName}</span>
                      <span className="font-mono text-[10px] text-slate-500">
                        Batch: {ret.batchNumber} • <strong>{ret.returnQuantity} packs</strong>
                        {typeof ret.soldQuantity === "number" && ret.soldQuantity > 0
                          ? ` (Sold: ${ret.soldQuantity})`
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
                    <td className="p-2.5 text-slate-600 dark:text-slate-400 max-w-[220px]">
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
                          ret.disposition === "quarantine_batch"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : ret.disposition === "scrap_writeoff"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        }`}
                      >
                        {ret.disposition === "quarantine_batch"
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
                            {ret.customerResolution === "cash_refund"
                              ? "Cash Refund"
                              : "Khata Credit"}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        APPROVED
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SALE RETURN MODAL (TWO MODES: AGAINST INVOICE vs OPEN SALE RETURN)        */}
      {/* ========================================================================= */}
      {isProcessing && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-teal-600" /> Record Sale Return (Wapis Maal)
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Bill number se auto-discount return lagayein ya bina bill ke Open Return darj karein
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* Rights Lock / Unlock Toggle for Price & Discount */}
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
                <span>1. Return Against Sale Invoice (Bill No. Se)</span>
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
              {/* MODE 1: RETURN AGAINST SALE INVOICE                             */}
              {/* =============================================================== */}
              {returnMode === "invoice_return" && (
                <div className="space-y-3 p-3.5 sm:p-4 rounded-2xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/40 dark:bg-teal-950/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                        Step 1: Search Bill No. or Customer *
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Type Bill No (e.g. INV-1002) or Pharmacy..."
                          value={invoiceSearchQuery}
                          onChange={(e) => {
                            const val = e.target.value;
                            setInvoiceSearchQuery(val);
                            setInvoiceError("");
                            const exact = invoices.find(
                              (inv) =>
                                (inv.provisionalReference || "").toLowerCase() ===
                                  val.trim().toLowerCase() ||
                                (inv.officialReference || "").toLowerCase() ===
                                  val.trim().toLowerCase() ||
                                inv.id.toLowerCase() === val.trim().toLowerCase()
                            );
                            if (exact) {
                              handleSelectInvoice(exact);
                            }
                          }}
                          className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 dark:text-slate-200 block mb-1">
                        Select Sale Invoice ({matchingInvoices.length} found) *
                      </label>
                      <select
                        value={selectedInvoiceId}
                        onChange={(e) => {
                          const found = invoices.find((i) => i.id === e.target.value) || null;
                          handleSelectInvoice(found);
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                      >
                        <option value="">-- Select Sale Invoice / Bill No. --</option>
                        {matchingInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.provisionalReference || inv.officialReference || inv.id} —{" "}
                            {inv.customerName} ({formatKarachiDate(inv.invoiceDate || inv.createdAt)}{" "}
                            • {formatPKR(inv.netTotal)})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {invoiceError && (
                    <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 font-bold flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{invoiceError}</span>
                    </div>
                  )}

                  {!selectedInvoiceObj ? (
                    <div className="p-4 rounded-xl bg-white/80 dark:bg-slate-900/70 border border-dashed border-teal-300 dark:border-teal-800 text-center text-slate-500">
                      <Receipt className="w-7 h-7 text-teal-600 mx-auto mb-1 opacity-75" />
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        You must select a sale invoice to load its items &amp; discounts
                      </p>
                      <p className="text-[11px] mt-0.5">
                        Upar Bill Number type karein ya dropdown se select karein — us bill ki tamam
                        medicines, sold quantity aur diya gaya discount % khud show ho jayega.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-teal-600 text-white font-mono font-bold text-[11px]">
                            {selectedInvoiceObj.provisionalReference || selectedInvoiceObj.id}
                          </span>
                          <span className="font-extrabold text-slate-900 dark:text-slate-100">
                            {selectedInvoiceObj.customerName}
                          </span>
                          <span className="text-slate-400">
                            • Date:{" "}
                            {formatKarachiDate(
                              selectedInvoiceObj.invoiceDate || selectedInvoiceObj.createdAt
                            )}
                          </span>
                        </div>
                        <div className="font-mono text-[11px] font-bold text-slate-600 dark:text-slate-300">
                          Bill Net Total: {formatPKR(selectedInvoiceObj.netTotal)}
                        </div>
                      </div>

                      {/* Invoice Items Table */}
                      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
                            <tr>
                              <th className="p-2.5 w-8 text-center">Ret</th>
                              <th className="p-2.5">Medicine &amp; Batch</th>
                              <th className="p-2.5 text-center whitespace-nowrap">Sold Qty</th>
                              <th className="p-2.5 text-right whitespace-nowrap">
                                Sale Price {canModifyPriceAndDiscount ? "(Edit)" : "🔒"}
                              </th>
                              <th className="p-2.5 text-right whitespace-nowrap">
                                Bill Disc % {canModifyPriceAndDiscount ? "(Edit)" : "🔒"}
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
                                        updateDraftRow(row.rowId, {
                                          selected: checked,
                                          returnQuantity: checked
                                            ? Math.min(
                                                Math.max(1, row.returnQuantity || 1),
                                                row.maxReturnableQty || 1
                                              )
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
                                      value={row.grossUnitPrice === 0 ? "" : row.grossUnitPrice}
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
                                          const parsed = raw === "" ? 0 : Math.floor(Number(raw) || 0);
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
                                value={row.grossUnitPrice === 0 ? "" : row.grossUnitPrice}
                                placeholder="0"
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
                                value={row.unitCost === 0 ? "0" : row.unitCost}
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
              </div>

              {/* Remarks / Custom Reason Input */}
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Remarks / Custom Reason Note (ریمارکس / واپس کرنے کی وجہ)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bill nahi tha, dead stock tha, fresh maal wapis liya, etc."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Customer Settlement Mode */}
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
                    {activeReturnRows.map((row) => {
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

              {/* Live Calculation Summary */}
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    Selected Items: <strong>{activeReturnRows.length}</strong> (
                    <strong>{returnTotals.totalPacks}</strong> packs)
                  </span>
                  {customerResolution !== "replacement" && (
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
                    {customerResolution === "replacement"
                      ? "Fresh Replacement Stock Given (Udhaar Unchanged):"
                      : customerResolution === "cash_refund"
                      ? "Net Cash Refund to Customer:"
                      : "Net Return Amount Deducted from Customer Udhaar:"}
                  </span>
                  <span className="font-mono text-base text-rose-600 dark:text-rose-400">
                    {customerResolution === "replacement"
                      ? `${returnTotals.totalPacks} packs`
                      : formatPKR(returnTotals.netCreditAmount)}
                  </span>
                </div>
              </div>

              {/* Submit / Cancel Buttons */}
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
                  Save Sale Return &amp; Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
