"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  RotateCcw,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Receipt,
  ShieldAlert,
  Boxes,
  DollarSign,
  FileText,
} from "lucide-react";
import { formatPKR, formatNumber, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import { recordActivity } from "@/lib/audit/auditTracker";
import { resolveUnitPurchaseCost } from "@/lib/inventory/expiryUtils";
import type {
  Customer,
  Product,
  ProductPricing,
  InventoryBatch,
  StockMovement,
  SalesReturn,
  SalesReturnReason,
  SalesReturnDisposition,
  CustomerReturnResolution,
} from "@/types";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
} from "@/lib/dateFilter";

export default function SalesReturnsPage() {
  const { currentUser } = useAuth();
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productPricings, setProductPricings] = useState<ProductPricing[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));
  const [isProcessing, setIsProcessing] = useState(false);

  // Form State
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [batchNum, setBatchNum] = useState("");
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const [qty, setQty] = useState(1);
  const [unitCredit, setUnitCredit] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const [reason, setReason] = useState<SalesReturnReason>("expired");
  const [disposition, setDisposition] = useState<SalesReturnDisposition>("quarantine_batch");
  const [customerResolution, setCustomerResolution] =
    useState<CustomerReturnResolution>("khata_credit");
  const [replacementBatchId, setReplacementBatchId] = useState("");

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

  const loadData = async () => {
    try {
      const [custList, prodList, pricingList, batchList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
        offlineDb.productPricing ? offlineDb.productPricing.toArray() : Promise.resolve([]),
        offlineDb.inventoryBatches.toArray(),
      ]);
      setCustomers(custList);
      setProducts(prodList);
      setProductPricings(pricingList || []);
      setBatches(batchList || []);

      try {
        const dbReturns = await (offlineDb as any).salesReturns?.toArray();
        const isCloudInit = localStorage.getItem("noxderma_cloud_init_salesReturns") === "true";
        if (dbReturns && (dbReturns.length > 0 || isCloudInit)) {
          const sorted = [...(dbReturns as SalesReturn[])].sort((a, b) =>
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
            const sorted = [...parsed].sort((a, b) =>
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

  // Auto-populate suggested purchase cost & trade price when medicine/batch changes
  const productBatches = useMemo(
    () => batches.filter((b) => b.productId === selectedProductId),
    [batches, selectedProductId]
  );

  const activeReplacementBatches = useMemo(() => {
    const nowTime = Date.now();
    return productBatches.filter(
      (b) =>
        (b.remainingQuantity || 0) > 0 &&
        b.status !== "expired" &&
        b.status !== "quarantine" &&
        new Date(b.expiryDate).getTime() > nowTime
    );
  }, [productBatches]);

  const handleProductSelect = (prodId: string) => {
    setSelectedProductId(prodId);
    const matchingBatches = batches.filter((b) => b.productId === prodId);
    const firstBatch = matchingBatches[0];
    setSelectedBatchId(firstBatch?.id || "");
    setBatchNum(firstBatch?.batchNumber || "");

    const resolvedCost = resolveUnitPurchaseCost({
      productId: prodId,
      batchId: firstBatch?.id,
      pricingMap,
      productMap,
      batchMap,
    });
    setUnitCost(resolvedCost);

    const pricing = pricingMap.get(String(prodId));
    const suggestedSalePrice = Number(pricing?.tradePricePerPack || pricing?.mrpPerPack || 0);
    if (suggestedSalePrice > 0) {
      setUnitCredit(suggestedSalePrice);
    }

    const firstValidRep = matchingBatches.find(
      (b) =>
        (b.remainingQuantity || 0) > 0 &&
        b.status !== "expired" &&
        b.status !== "quarantine" &&
        new Date(b.expiryDate).getTime() > Date.now()
    );
    setReplacementBatchId(firstValidRep?.id || "");
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

  const handleProcessReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId);
    const prod = products.find((p) => p.id === selectedProductId);
    if (!cust || !prod || qty <= 0) return;

    const cleanBatchNum = batchNum.toUpperCase().trim();
    const qtyNum = Math.max(1, Math.floor(Number(qty) || 1));
    const safeCost = Math.max(0, Number(unitCost) || 0);
    const repBatch =
      customerResolution === "replacement"
        ? batches.find((b) => b.id === replacementBatchId)
        : undefined;

    if (customerResolution === "replacement") {
      if (!repBatch || (repBatch.remainingQuantity || 0) < qtyNum) {
        alert(
          `Not enough fresh stock in selected replacement batch (${repBatch?.remainingQuantity || 0} available, need ${qtyNum}).`
        );
        return;
      }
    }

    const now = new Date().toISOString();
    const cnNumber = `CN-2026-${(returns.length + 10).toString().padStart(3, "0")}`;
    const totalCredit =
      customerResolution === "replacement" ? 0 : qtyNum * Math.max(0, Number(unitCredit) || 0);

    // Find matching batch for returned goods (if exists)
    const matchedBatch =
      batches.find((b) => b.id === selectedBatchId) ||
      batches.find(
        (b) =>
          b.productId === prod.id &&
          b.batchNumber?.toUpperCase().trim() === cleanBatchNum
      );

    const newReturn: SalesReturn = {
      id: `ret_${Date.now()}`,
      returnNoteNumber: cnNumber,
      invoiceReference: invoiceRef.trim() || "DIRECT-RETURN",
      customerId: cust.id,
      customerName: cust.name,
      productId: prod.id,
      productName: prod.name,
      batchId: matchedBatch?.id,
      batchNumber: cleanBatchNum,
      replacementBatchId: repBatch?.id,
      replacementBatchNumber: repBatch?.batchNumber,
      returnQuantity: qtyNum,
      unitCreditPrice: customerResolution === "replacement" ? 0 : Number(unitCredit) || 0,
      unitCost: safeCost,
      totalCreditAmount: totalCredit,
      returnReason: reason,
      disposition,
      customerResolution,
      status: "approved",
      returnDate: now.slice(0, 10),
      recordedByName: currentUser?.displayName || "Owner",
    };

    const allProductRemaining = batches
      .filter((b) => b.productId === prod.id)
      .reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);

    let prevBatchSnapshot: InventoryBatch | null = matchedBatch ? { ...matchedBatch } : null;
    let createdBatchId: string | null = null;
    let prevReplacementSnapshot: InventoryBatch | null = null;
    let movement: StockMovement;
    let extraMovement: StockMovement | null = null;

    if (disposition === "restocked") {
      // Good / Sellable stock returns back into active batch
      if (matchedBatch) {
        const nextRem = (Number(matchedBatch.remainingQuantity) || 0) + qtyNum;
        await offlineDb.inventoryBatches.update(matchedBatch.id, {
          remainingQuantity: nextRem,
          status:
            new Date(matchedBatch.expiryDate).getTime() <= Date.now()
              ? "expired"
              : "active",
          updatedAt: now,
        });
      } else {
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        const createdBatch: InventoryBatch = {
          id: `bch_ret_${Date.now()}`,
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

      movement = {
        id: `mov_ret_${Date.now()}`,
        productId: prod.id,
        productName: prod.name,
        batchId: matchedBatch?.id || createdBatchId || undefined,
        batchNumber: cleanBatchNum,
        type: "sales_return",
        quantityChange: qtyNum,
        balanceAfter: allProductRemaining + qtyNum,
        referenceId: cnNumber,
        referenceType: "customer_return",
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        unitCost: safeCost,
        totalCostValue: qtyNum * safeCost,
        reason: `Customer Good Return (${cust.name}) -> Added Back to Sellable Stock`,
        timestamp: now,
      };
      await offlineDb.stockMovements.put(movement);
    } else if (disposition === "quarantine_batch") {
      // Expired / Near-expiry held in Quarantine for Manufacturer Claim (NEVER added to sellable stock!)
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
          expiryClaimNotes: `Customer return ${cnNumber} (${cust.name})`,
          expiryClaimUpdatedAt: now,
          updatedAt: now,
        });
      } else {
        const createdQuarantine: InventoryBatch = {
          id: `bch_qret_${Date.now()}`,
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
          expiryClaimNotes: `Customer expired return ${cnNumber} (${cust.name})`,
          expiryClaimUpdatedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        createdBatchId = createdQuarantine.id;
        await offlineDb.inventoryBatches.put(createdQuarantine);
      }

      movement = {
        id: `mov_ret_${Date.now()}`,
        productId: prod.id,
        productName: prod.name,
        batchId: matchedBatch?.id || createdBatchId || undefined,
        batchNumber: cleanBatchNum,
        type: "reconciliation_adjustment",
        quantityChange: 0,
        balanceAfter: allProductRemaining,
        referenceId: cnNumber,
        referenceType: "customer_return",
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        unitCost: safeCost,
        totalCostValue: qtyNum * safeCost,
        recoveredAmount: 0,
        netLossAmount: 0,
        claimOutcome: "quarantined_pending_claim",
        reason: `Customer Return (${reason}) -> Locked in Quarantine for Company Claim (Not Added to Sale Stock)`,
        timestamp: now,
      };
      await offlineDb.stockMovements.put(movement);
    } else {
      // disposition === "scrap_writeoff" (Expired / Broken -> Destroy & Hit P&L Immediately)
      const isExpiry = reason === "expired" || reason === "near_expiry";
      const lossVal = qtyNum * safeCost;
      movement = {
        id: `mov_ret_${Date.now()}`,
        productId: prod.id,
        productName: prod.name,
        batchId: matchedBatch?.id,
        batchNumber: cleanBatchNum,
        type: isExpiry ? "expiry_write_off" : "damaged_stock",
        quantityChange: 0, // Customer's returned item discarded, warehouse sellable stock untouched unless replacement issued
        balanceAfter: allProductRemaining,
        referenceId: cnNumber,
        referenceType: "customer_return",
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        unitCost: safeCost,
        totalCostValue: lossVal,
        recoveredAmount: 0,
        netLossAmount: lossVal,
        claimOutcome: "direct_write_off",
        reason: `Customer ${isExpiry ? "Expired" : "Broken/Damaged"} Return (${cust.name}) -> Discarded / Written Off Loss (${formatPKR(lossVal)})`,
        timestamp: now,
      };
      await offlineDb.stockMovements.put(movement);
    }

    // If customer received Fresh Replacement Stock from godown, deduct replacement batch!
    if (customerResolution === "replacement" && repBatch) {
      prevReplacementSnapshot = { ...repBatch };
      const nextRepRemaining = Math.max(0, (Number(repBatch.remainingQuantity) || 0) - qtyNum);
      await offlineDb.inventoryBatches.update(repBatch.id, {
        remainingQuantity: nextRepRemaining,
        status: nextRepRemaining === 0 ? "depleted" : repBatch.status,
        updatedAt: now,
      });

      extraMovement = {
        id: `mov_repout_${Date.now() + 1}`,
        productId: prod.id,
        productName: prod.name,
        batchId: repBatch.id,
        batchNumber: repBatch.batchNumber,
        type: "sales_deduction",
        quantityChange: -qtyNum,
        balanceAfter:
          (disposition === "restocked" ? allProductRemaining + qtyNum : allProductRemaining) - qtyNum,
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
        timestamp: new Date(Date.now() + 1).toISOString(),
      };
      await offlineDb.stockMovements.put(extraMovement);
    }

    // 2. Adjust Customer Outstanding Balance only for Khata Credit (allows Advance Balance if over-credited!)
    const prevBalance = Number(cust.currentOutstandingBalance) || 0;
    const newBal =
      customerResolution === "khata_credit" ? prevBalance - totalCredit : prevBalance;

    if (customerResolution === "khata_credit") {
      await offlineDb.customers.update(cust.id, {
        currentOutstandingBalance: newBal,
        updatedAt: now,
      });
    }

    await saveReturns([newReturn, ...returns]);
    await recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      userEmail: currentUser?.email,
      action: "create",
      entityType: "sales_return",
      entityId: newReturn.id,
      entityTitle: `${newReturn.returnNoteNumber} - ${newReturn.customerName}`,
      details: `Recorded customer return ${newReturn.returnNoteNumber} for ${newReturn.customerName}: ${newReturn.productName} (${newReturn.returnQuantity} packs, ${customerResolution === "replacement" ? `Fresh Replacement Batch #${repBatch?.batchNumber}` : customerResolution === "cash_refund" ? `Cash Refund ${formatPKR(totalCredit)}` : `Khata Credit ${formatPKR(totalCredit)}`}, Disposition: ${disposition}).`,
      snapshotBefore: {
        customerId: cust.id,
        prevBalance,
        batch: prevBatchSnapshot,
        replacementBatch: prevReplacementSnapshot,
      },
      snapshotAfter: {
        returnRecord: newReturn,
        movementId: movement.id,
        extraMovementId: extraMovement?.id || null,
        createdBatchId,
        customerId: cust.id,
        newBalance: newBal,
      },
      canUndo: true,
    }).catch(console.warn);

    await loadData();
    setIsProcessing(false);
    alert(
      customerResolution === "replacement"
        ? `Replacement Slip ${cnNumber} saved! ${qtyNum} fresh packs deducted from Batch #${repBatch?.batchNumber} and returned stock routed to ${disposition === "quarantine_batch" ? "Quarantine (Company Claim)" : "Write-off"}.`
        : customerResolution === "cash_refund"
        ? `Cash Refund Return ${cnNumber} (${formatPKR(totalCredit)}) recorded for ${cust.name}.`
        : `Credit Note ${cnNumber} for ${formatPKR(totalCredit)} applied to ${cust.name}'s Khata.`
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
        r.batchNumber.toLowerCase().includes(q)
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
            <span className="text-xs text-slate-400">Medicine Returns & Balance Deduction</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Customer Medicine Returns (Wapis Stock)
          </h1>
        </div>

        <button
          onClick={() => setIsProcessing(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Record Customer Return
        </button>
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
          <span className="text-[10px] text-slate-500 block mt-0.5">Returns from Medical Stores</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-rose-600 uppercase tracking-wider block mb-1">
            Total Return Amount (Deducted from Udhaar)
          </span>
          <span className="text-2xl font-black font-mono text-rose-600">
            {formatPKR(totalCreditIssued)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Subtracted from Customer Khata</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Broken / Near Expiry Returns
          </span>
          <span className="text-2xl font-black text-amber-600">
            {returns.filter((r) => r.disposition === "quarantine_batch").length} Batches
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Kept aside (do not sell)</span>
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
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search return no, shop name, medicine or batch..."
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
            filtered.map((ret) => (
              <div
                key={ret.id}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {ret.customerName}
                    </p>
                    <p className="font-mono text-[11px] font-bold text-teal-600 dark:text-teal-400">
                      {ret.returnNoteNumber} • {formatKarachiDate(ret.returnDate)}
                    </p>
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
                          {ret.customerResolution === "cash_refund" ? "Cash Refund" : "Khata Minus (-)"}
                        </span>
                        <span className="font-mono font-black text-rose-600">
                          {formatPKR(ret.totalCreditAmount)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block">
                      {ret.productName}
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      Batch: {ret.batchNumber} • Bill: {ret.invoiceReference}
                    </span>
                  </div>
                  <span className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono font-bold text-slate-800 dark:text-slate-200 shrink-0">
                    {ret.returnQuantity} packs
                  </span>
                </div>
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
                            ? "Shop Overstock"
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
            ))
          )}
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Return Slip #</th>
                <th className="p-2.5">Medical Store & Bill No.</th>
                <th className="p-2.5">Medicine & Batch</th>
                <th className="p-2.5">Reason</th>
                <th className="p-2.5">Where Stock is Kept</th>
                <th className="p-2.5 text-right">Amount Deducted (-)</th>
                <th className="p-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((ret) => (
                <tr
                  key={ret.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                    {ret.returnNoteNumber}
                    <span className="text-[10px] text-slate-400 block font-normal font-sans">
                      {formatKarachiDate(ret.returnDate)}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {ret.customerName}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">{ret.invoiceReference}</span>
                  </td>
                  <td className="p-2.5 text-slate-700 dark:text-slate-300">
                    <span className="font-semibold block">{ret.productName}</span>
                    <span className="font-mono text-[10px] text-slate-500">
                      Batch: {ret.batchNumber} • {ret.returnQuantity} packs
                    </span>
                  </td>
                  <td className="p-2.5 capitalize text-slate-600 dark:text-slate-400">
                    {ret.returnReason === "expired"
                      ? "Expired"
                      : ret.returnReason === "near_expiry"
                      ? "Near Expiry"
                      : ret.returnReason === "transit_damage"
                      ? "Broken / Damaged"
                      : ret.returnReason === "pharmacy_overstock"
                      ? "Shop Overstock"
                      : ret.returnReason.replace("_", " ")}
                  </td>
                  <td className="p-2.5">
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
                        ? "QUARANTINE (CLAIM PENDING)"
                        : ret.disposition === "scrap_writeoff"
                        ? "WRITTEN OFF (LOSS)"
                        : "ADDED BACK TO STOCK"}
                    </span>
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold">
                    {ret.customerResolution === "replacement" ? (
                      <span className="text-teal-600 text-[11px]">
                        Replaced (#{ret.replacementBatchNumber || "FRESH"})
                      </span>
                    ) : (
                      <span className="text-rose-600">
                        {formatPKR(ret.totalCreditAmount)}
                        <span className="block text-[9px] text-slate-400 font-sans">
                          {ret.customerResolution === "cash_refund" ? "Cash Refund" : "Khata Credit"}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      APPROVED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Note Modal */}
      {isProcessing && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-teal-600" /> Record Medicine Return from Customer
              </h2>
              <button
                onClick={() => setIsProcessing(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessReturn} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Medical Store / Pharmacy *
                </label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Shop / Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Udhaar: {formatPKR(c.currentOutstandingBalance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Original Bill No. (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. OFF-DEV01-20261015-001"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Returned Medicine *
                </label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => handleProductSelect(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Medicine --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Returned Batch No. *
                  </label>
                  {productBatches.length > 0 && (
                    <select
                      value={selectedBatchId}
                      onChange={(e) => {
                        const bId = e.target.value;
                        setSelectedBatchId(bId);
                        const found = productBatches.find((b) => b.id === bId);
                        if (found) setBatchNum(found.batchNumber);
                      }}
                      className="w-full mb-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-[11px]"
                    >
                      <option value="">-- Type manually or pick batch --</option>
                      {productBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          #{b.batchNumber} (Exp: {formatKarachiDate(b.expiryDate)})
                        </option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    required
                    value={batchNum}
                    onChange={(e) => setBatchNum(e.target.value)}
                    placeholder="e.g. B-2025-X"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Qty (Packs) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="0"
                      value={qty === 0 ? "" : qty}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setQty(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
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
                      value={unitCost === 0 ? "0" : unitCost}
                      onChange={(e) => setUnitCost(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Why is it Returned?
                  </label>
                  <select
                    value={reason}
                    onChange={(e) => handleReasonSelect(e.target.value as SalesReturnReason)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="expired">Expired Medicine</option>
                    <option value="near_expiry">Near Expiry</option>
                    <option value="transit_damage">Broken / Damaged</option>
                    <option value="pharmacy_overstock">Shop Overstock / Slow Moving</option>
                    <option value="wrong_supply">Wrong Medicine Supplied</option>
                    <option value="recall">Company Recall</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Where to Route Returned Stock?
                  </label>
                  <select
                    value={disposition}
                    onChange={(e) => setDisposition(e.target.value as SalesReturnDisposition)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="quarantine_batch">Quarantine (Lock for Company Claim)</option>
                    <option value="scrap_writeoff">Expired / Broken -&gt; Write-off Loss</option>
                    <option value="restocked">Good Condition -&gt; Add to Sellable Stock</option>
                  </select>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  How Do You Settle With Customer? (Customer Ko Kya Dena Hai?) *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {[
                    { id: "khata_credit", label: "Minus Udhaar / Credit" },
                    { id: "cash_refund", label: "Cash Wapis Diya" },
                    { id: "replacement", label: "Fresh Maal Badlay Mein" },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setCustomerResolution(opt.id as CustomerReturnResolution)}
                      className={`py-2 px-2.5 rounded-lg text-[11px] font-bold border transition-all ${
                        customerResolution === opt.id
                          ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                          : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {customerResolution === "replacement" ? (
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Choose Fresh Batch to Give Customer *
                    </label>
                    <select
                      required
                      value={replacementBatchId}
                      onChange={(e) => setReplacementBatchId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-[11px]"
                    >
                      <option value="">-- Pick Active Non-Expired Batch --</option>
                      {activeReplacementBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          #{b.batchNumber} • Avail: {b.remainingQuantity} • Exp:{" "}
                          {formatKarachiDate(b.expiryDate)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Return Sale Rate / Pack (PKR) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="0"
                      value={unitCredit === 0 ? "" : unitCredit}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setUnitCredit(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs flex justify-between font-bold">
                <span className="text-rose-900 dark:text-rose-200">
                  {customerResolution === "replacement"
                    ? "Fresh Packs Given (Udhaar Unchanged):"
                    : customerResolution === "cash_refund"
                    ? "Total Cash Refunded (Net Sales Reduced):"
                    : "Total Credit Deducted from Udhaar:"}
                </span>
                <span className="font-mono text-rose-600 dark:text-rose-400">
                  {customerResolution === "replacement"
                    ? `${qty} packs (Loss if written off: ${formatPKR(
                        disposition === "scrap_writeoff" ? qty * unitCost : 0
                      )})`
                    : formatPKR(qty * unitCredit)}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsProcessing(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Return &amp; Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
