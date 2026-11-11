import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { formatPKR } from "@/lib/formatting";
import type {
  ExpiryClaimStatus,
  InventoryBatch,
  Product,
  ProductPricing,
  SalesReturn,
  StockMovement,
} from "@/types";

export interface CostLookupMaps {
  pricingMap: Map<string, ProductPricing>;
  productMap: Map<string, Product>;
  batchMap: Map<string, InventoryBatch>;
}

/**
 * Resolves the actual purchase cost per pack for a medicine/batch.
 * Never returns Trade Price or MRP — always resolves cost price for honest accounting.
 */
export function resolveUnitPurchaseCost({
  productId,
  batchId,
  explicitUnitCost,
  pricingMap,
  productMap,
  batchMap,
  fallbackLegacy = 0,
}: {
  productId?: string;
  batchId?: string;
  explicitUnitCost?: number;
  pricingMap: Map<string, ProductPricing>;
  productMap: Map<string, Product>;
  batchMap: Map<string, InventoryBatch>;
  fallbackLegacy?: number;
}): number {
  if (typeof explicitUnitCost === "number" && explicitUnitCost > 0) {
    return explicitUnitCost;
  }
  const batch = batchId ? batchMap.get(String(batchId)) : undefined;
  if (batch && Number((batch as any).purchasePrice || (batch as any).unitCost) > 0) {
    return Number((batch as any).purchasePrice || (batch as any).unitCost);
  }
  if (productId) {
    const pricing = pricingMap.get(String(productId));
    if (pricing && Number(pricing.purchaseCostPerPack) > 0) {
      return Number(pricing.purchaseCostPerPack);
    }
    const prod = productMap.get(String(productId));
    if (prod && Number((prod as any).purchaseCostPerPack || (prod as any).costPrice) > 0) {
      return Number((prod as any).purchaseCostPerPack || (prod as any).costPrice);
    }
  }
  return fallbackLegacy;
}

export interface StockLossMetrics {
  damagedStockLoss: number;
  sampleExpense: number;
  expiryWriteOffLoss: number;
  expiryGrossCost: number;
  expiryRecoveredAmount: number;
  expiryWrittenOffUnits: number;
  expiryReturnedUnits: number;
  expiryClaimCount: number;
}

/**
 * Shared expense calculator for damaged stock, free doctor samples, expired write-offs,
 * and unrecovered manufacturer expiry claims. Used identically by Dashboard & P&L.
 */
export function computeStockLossMetrics(
  movements: StockMovement[],
  maps: CostLookupMaps
): StockLossMetrics {
  let damagedStockLoss = 0;
  let sampleExpense = 0;
  let expiryWriteOffLoss = 0;
  let expiryGrossCost = 0;
  let expiryRecoveredAmount = 0;
  let expiryWrittenOffUnits = 0;
  let expiryReturnedUnits = 0;
  let expiryClaimCount = 0;

  for (const m of movements) {
    const qtyAbs = Math.abs(Number(m.quantityChange) || 0);

    if (m.type === "damaged_stock") {
      const unitCost = resolveUnitPurchaseCost({
        productId: m.productId,
        batchId: m.batchId,
        explicitUnitCost: m.unitCost,
        ...maps,
        fallbackLegacy: 350,
      });
      damagedStockLoss +=
        typeof m.netLossAmount === "number" ? Math.max(0, m.netLossAmount) : qtyAbs * unitCost;
      continue;
    }

    if (m.type === "sample_issue") {
      const unitCost = resolveUnitPurchaseCost({
        productId: m.productId,
        batchId: m.batchId,
        explicitUnitCost: m.unitCost,
        ...maps,
        fallbackLegacy: 350,
      });
      sampleExpense +=
        typeof m.totalCostValue === "number" ? Math.max(0, m.totalCostValue) : qtyAbs * unitCost;
      continue;
    }

    if (m.type === "expiry_write_off") {
      const unitCost = resolveUnitPurchaseCost({
        productId: m.productId,
        batchId: m.batchId,
        explicitUnitCost: m.unitCost,
        ...maps,
        fallbackLegacy: 0,
      });
      const costVal =
        typeof m.totalCostValue === "number" ? Math.max(0, m.totalCostValue) : qtyAbs * unitCost;
      const lossVal =
        typeof m.netLossAmount === "number" ? Math.max(0, m.netLossAmount) : costVal;
      expiryGrossCost += costVal;
      expiryWriteOffLoss += lossVal;
      expiryWrittenOffUnits += qtyAbs;
      expiryClaimCount += 1;
      continue;
    }

    if (m.type === "supplier_return") {
      const unitCost = resolveUnitPurchaseCost({
        productId: m.productId,
        batchId: m.batchId,
        explicitUnitCost: m.unitCost,
        ...maps,
        fallbackLegacy: 0,
      });
      const costVal =
        typeof m.totalCostValue === "number" ? Math.max(0, m.totalCostValue) : qtyAbs * unitCost;
      const recovered =
        typeof m.recoveredAmount === "number"
          ? Math.max(0, m.recoveredAmount)
          : typeof m.netLossAmount === "number"
          ? Math.max(0, costVal - m.netLossAmount)
          : costVal;
      const netLoss =
        typeof m.netLossAmount === "number" ? Math.max(0, m.netLossAmount) : 0;

      expiryGrossCost += costVal;
      expiryRecoveredAmount += recovered;
      expiryWriteOffLoss += netLoss;
      expiryReturnedUnits += qtyAbs;
      expiryClaimCount += 1;
    }
  }

  return {
    damagedStockLoss,
    sampleExpense,
    expiryWriteOffLoss,
    expiryGrossCost,
    expiryRecoveredAmount,
    expiryWrittenOffUnits,
    expiryReturnedUnits,
    expiryClaimCount,
  };
}

export interface SalesReturnAdjustments {
  salesReturnsTotal: number;
  cogsReversal: number;
  returnsCount: number;
}

/**
 * Computes net sales reduction and original COGS reversal from customer returns
 * that issued a Credit Note / Cash Refund (excludes 1-to-1 replacements where invoice stands).
 */
export function computeSalesReturnAdjustments(
  returns: SalesReturn[],
  maps: CostLookupMaps
): SalesReturnAdjustments {
  let salesReturnsTotal = 0;
  let cogsReversal = 0;
  let returnsCount = 0;

  for (const r of returns) {
    if (!r || r.customerResolution === "replacement") continue;
    const credit = Number(r.totalCreditAmount) || 0;
    const qty = Number(r.returnQuantity) || 0;
    const unitCost = resolveUnitPurchaseCost({
      productId: r.productId,
      batchId: r.batchId,
      explicitUnitCost: r.unitCost,
      ...maps,
      fallbackLegacy: 0,
    });
    salesReturnsTotal += credit;
    cogsReversal += qty * unitCost;
    returnsCount += 1;
  }

  return { salesReturnsTotal, cogsReversal, returnsCount };
}

export interface UnsettledExpirySummary {
  expiredUnsettledBatches: InventoryBatch[];
  expiredUnsettledPacks: number;
  expiredUnsettledCost: number;
  nearExpiryBatches: InventoryBatch[];
  nearExpiryPacks: number;
  nearExpiryCost: number;
  quarantinedBatches: InventoryBatch[];
  quarantinedPacks: number;
  quarantinedCost: number;
}

/**
 * Scans batches to find:
 * 1. Expired batches with sellable remainingQuantity still > 0 (not yet written off or claimed)
 * 2. Near-expiry batches (<= 90 days) with remainingQuantity > 0
 * 3. Quarantined batches (blockedQuantity > 0) waiting on manufacturer decision
 */
export function computeUnsettledExpirySummary(
  batches: InventoryBatch[],
  maps: CostLookupMaps
): UnsettledExpirySummary {
  const now = Date.now();
  const ninetyDaysFromNow = now + 90 * 24 * 3600 * 1000;

  const expiredUnsettledBatches: InventoryBatch[] = [];
  let expiredUnsettledPacks = 0;
  let expiredUnsettledCost = 0;

  const nearExpiryBatches: InventoryBatch[] = [];
  let nearExpiryPacks = 0;
  let nearExpiryCost = 0;

  const quarantinedBatches: InventoryBatch[] = [];
  let quarantinedPacks = 0;
  let quarantinedCost = 0;

  for (const b of batches) {
    const expTime = new Date(b.expiryDate).getTime();
    const rem = Number(b.remainingQuantity) || 0;
    const blocked = Number(b.blockedQuantity) || 0;
    const unitCost = resolveUnitPurchaseCost({
      productId: b.productId,
      batchId: b.id,
      ...maps,
      fallbackLegacy: 0,
    });

    if (rem > 0 && !Number.isNaN(expTime)) {
      if (expTime <= now || b.status === "expired") {
        expiredUnsettledBatches.push(b);
        expiredUnsettledPacks += rem;
        expiredUnsettledCost += rem * unitCost;
      } else if (expTime <= ninetyDaysFromNow) {
        nearExpiryBatches.push(b);
        nearExpiryPacks += rem;
        nearExpiryCost += rem * unitCost;
      }
    }

    if (blocked > 0) {
      quarantinedBatches.push(b);
      quarantinedPacks += blocked;
      quarantinedCost += blocked * unitCost;
    }
  }

  return {
    expiredUnsettledBatches,
    expiredUnsettledPacks,
    expiredUnsettledCost,
    nearExpiryBatches,
    nearExpiryPacks,
    nearExpiryCost,
    quarantinedBatches,
    quarantinedPacks,
    quarantinedCost,
  };
}

export type ExpiryResolutionAction =
  | "direct_write_off"
  | "quarantine"
  | "full_credit"
  | "partial_credit"
  | "replaced"
  | "rejected_write_off";

export interface ExecuteExpiryResolutionParams {
  batch: InventoryBatch;
  action: ExpiryResolutionAction;
  quantity: number;
  sourcePool: "remaining" | "blocked";
  unitCost: number;
  manufacturerId?: string;
  manufacturerName?: string;
  creditAmount?: number;
  replacementQty?: number;
  replacementBatchNumber?: string;
  replacementExpiryDate?: string;
  referenceNumber?: string;
  notes?: string;
  user: {
    id?: string;
    name?: string;
    role?: string;
    email?: string;
  };
}

/**
 * Atomically resolves expired / near-expiry / quarantined batch stock across all business scenarios:
 * - Quarantine for pending manufacturer claim (locks stock without hitting P&L prematurely)
 * - Direct write-off or Rejected claim (logs expiry_write_off loss for P&L)
 * - Full / Partial manufacturer credit note (debits Company Khata + logs shortfall as P&L loss)
 * - Manufacturer fresh batch replacement (logs supplier_return + creates new active batch + logs any shortfall)
 */
export async function executeExpiryResolution(params: ExecuteExpiryResolutionParams) {
  const {
    batch,
    action,
    quantity,
    sourcePool,
    unitCost,
    manufacturerId,
    manufacturerName,
    creditAmount,
    replacementQty,
    replacementBatchNumber,
    replacementExpiryDate,
    referenceNumber,
    notes,
    user,
  } = params;

  const qty = Math.max(0, Math.floor(Number(quantity) || 0));
  if (qty <= 0) {
    throw new Error("Quantity must be greater than zero.");
  }

  const maxAvailable =
    sourcePool === "blocked" ? Number(batch.blockedQuantity) || 0 : Number(batch.remainingQuantity) || 0;
  if (qty > maxAvailable) {
    throw new Error(`Only ${maxAvailable} packs available in selected pool.`);
  }

  const now = new Date().toISOString();
  const safeCost = Math.max(0, Number(unitCost) || 0);
  const totalCostValue = qty * safeCost;
  const claimRef = (referenceNumber || "").trim() || `EXP-${Date.now().toString().slice(-6)}`;
  const prevBatch: InventoryBatch = { ...batch };

  const allBatches = await offlineDb.inventoryBatches.toArray();
  const otherProductRemaining = allBatches
    .filter((b) => b.productId === batch.productId && b.id !== batch.id)
    .reduce((sum, b) => sum + (Number(b.remainingQuantity) || 0), 0);

  let nextRemaining = Number(batch.remainingQuantity) || 0;
  let nextBlocked = Number(batch.blockedQuantity) || 0;

  if (action === "quarantine") {
    nextRemaining = Math.max(0, nextRemaining - qty);
    nextBlocked = nextBlocked + qty;
  } else if (sourcePool === "blocked") {
    nextBlocked = Math.max(0, nextBlocked - qty);
  } else {
    nextRemaining = Math.max(0, nextRemaining - qty);
  }

  const isExpiredByDate = new Date(batch.expiryDate).getTime() <= Date.now();
  let nextStatus: InventoryBatch["status"] = batch.status;
  if (action === "quarantine" || nextBlocked > 0) {
    nextStatus = nextRemaining > 0 ? (isExpiredByDate ? "expired" : batch.status) : "quarantine";
  } else if (nextRemaining === 0 && nextBlocked === 0) {
    nextStatus = isExpiredByDate ? "expired" : "depleted";
  }

  const outcomeMap: Record<ExpiryResolutionAction, ExpiryClaimStatus> = {
    direct_write_off: "direct_write_off",
    quarantine: "quarantined_pending_claim",
    full_credit: "full_credit",
    partial_credit: "partial_credit",
    replaced: "replaced",
    rejected_write_off: "rejected_write_off",
  };
  const claimOutcome = outcomeMap[action];

  const updatedBatch: InventoryBatch = {
    ...batch,
    remainingQuantity: nextRemaining,
    blockedQuantity: nextBlocked,
    status: nextStatus,
    manufacturerId: manufacturerId || batch.manufacturerId,
    manufacturerName: manufacturerName || batch.manufacturerName,
    expiryClaimStatus: claimOutcome,
    expiryClaimReference: claimRef,
    expiryClaimNotes: notes?.trim() || batch.expiryClaimNotes,
    expiryClaimUpdatedAt: now,
    updatedAt: now,
  };

  await offlineDb.inventoryBatches.put(updatedBatch);

  let movement: StockMovement;
  let replacementBatch: InventoryBatch | undefined;
  let replacementMovement: StockMovement | undefined;
  let ledgerEntry: any | undefined;
  let prevManufacturer: any | undefined;

  if (action === "quarantine") {
    movement = {
      id: `mov_quar_${Date.now()}`,
      productId: batch.productId,
      productName: batch.productName,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      type: "reconciliation_adjustment",
      quantityChange: 0,
      balanceAfter: otherProductRemaining + nextRemaining,
      referenceId: claimRef,
      referenceType: "expiry_claim",
      userId: user.id || "usr_admin",
      userName: user.name || "Owner",
      unitCost: safeCost,
      totalCostValue,
      recoveredAmount: 0,
      netLossAmount: 0,
      claimOutcome,
      manufacturerId: manufacturerId || batch.manufacturerId,
      manufacturerName: manufacturerName || batch.manufacturerName,
      reason: `Quarantined ${qty} packs (Batch #${batch.batchNumber}) for Company Expiry Claim${
        manufacturerName ? ` -> ${manufacturerName}` : ""
      }${notes ? ` (${notes})` : ""}`,
      timestamp: now,
    };
    await offlineDb.stockMovements.put(movement);
  } else if (action === "direct_write_off" || action === "rejected_write_off") {
    const netLossAmount = totalCostValue;
    movement = {
      id: `mov_exp_${Date.now()}`,
      productId: batch.productId,
      productName: batch.productName,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      type: "expiry_write_off",
      quantityChange: -qty,
      balanceAfter: otherProductRemaining + nextRemaining,
      referenceId: claimRef,
      referenceType: "expiry_claim",
      userId: user.id || "usr_admin",
      userName: user.name || "Owner",
      unitCost: safeCost,
      totalCostValue,
      recoveredAmount: 0,
      netLossAmount,
      claimOutcome,
      manufacturerId: manufacturerId || batch.manufacturerId,
      manufacturerName: manufacturerName || batch.manufacturerName,
      reason: `${
        action === "rejected_write_off"
          ? "Company Rejected Claim -> Expiry Loss"
          : "Expired Stock Written Off (Loss)"
      }: ${qty} packs x ${formatPKR(safeCost)} = ${formatPKR(netLossAmount)}${
        notes ? ` • ${notes}` : ""
      }`,
      timestamp: now,
    };
    await offlineDb.stockMovements.put(movement);
  } else if (action === "full_credit" || action === "partial_credit") {
    const recoveredAmount =
      action === "full_credit"
        ? Math.max(0, Number(creditAmount ?? totalCostValue))
        : Math.max(0, Number(creditAmount ?? 0));
    const netLossAmount = Math.max(0, totalCostValue - recoveredAmount);

    movement = {
      id: `mov_supret_${Date.now()}`,
      productId: batch.productId,
      productName: batch.productName,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      type: "supplier_return",
      quantityChange: -qty,
      balanceAfter: otherProductRemaining + nextRemaining,
      referenceId: claimRef,
      referenceType: "expiry_claim",
      userId: user.id || "usr_admin",
      userName: user.name || "Owner",
      unitCost: safeCost,
      totalCostValue,
      recoveredAmount,
      netLossAmount,
      claimOutcome,
      manufacturerId: manufacturerId || batch.manufacturerId,
      manufacturerName: manufacturerName || batch.manufacturerName,
      reason: `Returned ${qty} packs to ${
        manufacturerName || "Company"
      } (${action === "full_credit" ? "Full Credit" : "Partial Credit"}: ${formatPKR(
        recoveredAmount
      )}${netLossAmount > 0 ? ` • Loss Shortfall: ${formatPKR(netLossAmount)}` : ""})${
        notes ? ` • ${notes}` : ""
      }`,
      timestamp: now,
    };
    await offlineDb.stockMovements.put(movement);

    if (recoveredAmount > 0) {
      const mfrs = await offlineDb.manufacturers.toArray();
      const matchedMfr =
        mfrs.find((m) => m.id === (manufacturerId || batch.manufacturerId)) ||
        (manufacturerName
          ? mfrs.find((m) => m.name?.toLowerCase() === manufacturerName.toLowerCase())
          : undefined);

      const resolvedMfrId =
        matchedMfr?.id ||
        manufacturerId ||
        batch.manufacturerId ||
        String(manufacturerName || "company")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_");
      const resolvedMfrName = matchedMfr?.name || manufacturerName || batch.manufacturerName || "Medicine Company";

      ledgerEntry = {
        id: `mfr_exp_${Date.now()}`,
        manufacturerId: resolvedMfrId,
        manufacturerName: resolvedMfrName,
        date: now.slice(0, 10),
        referenceNumber: claimRef,
        referenceType: "debit_note" as const,
        description: `Expiry Return Credit Note: ${batch.productName} (Batch #${batch.batchNumber}, ${qty} packs)${
          notes ? ` - ${notes}` : ""
        }`,
        debit: recoveredAmount,
        credit: 0,
        runningBalance: 0,
        createdAt: now,
      };

      await (offlineDb as any).manufacturerLedger?.put(ledgerEntry);
      const allManual = (await (offlineDb as any).manufacturerLedger?.toArray()) || [];
      localStorage.setItem("noxderma_mfr_ledger", JSON.stringify(allManual));

      if (matchedMfr) {
        prevManufacturer = { ...matchedMfr };
        const currentPayable = Number(matchedMfr.payableBalance) || 0;
        const nextPayable = Math.max(0, currentPayable - recoveredAmount);
        await offlineDb.manufacturers.update(matchedMfr.id, {
          payableBalance: nextPayable,
          updatedAt: now,
        });
      }
    }
  } else {
    // action === "replaced"
    const repQty = Math.max(1, Math.floor(Number(replacementQty) || qty));
    const repBatchNum = (replacementBatchNumber || "").trim().toUpperCase();
    if (!repBatchNum || !replacementExpiryDate) {
      throw new Error("Replacement batch number and new expiry date are required.");
    }

    const repValue = Math.min(totalCostValue, repQty * safeCost);
    const netLossAmount = Math.max(0, totalCostValue - repQty * safeCost);

    const newBatchId = `bch_rep_${Date.now()}`;
    replacementBatch = {
      id: newBatchId,
      productId: batch.productId,
      productName: batch.productName,
      batchNumber: repBatchNum,
      manufacturerId: manufacturerId || batch.manufacturerId,
      manufacturerName: manufacturerName || batch.manufacturerName,
      expiryDate: replacementExpiryDate,
      receivedQuantity: repQty,
      remainingQuantity: repQty,
      blockedQuantity: 0,
      purchasePrice: safeCost,
      unitCost: safeCost,
      goodsReceiptId: claimRef,
      status: "active",
      expiryClaimReference: claimRef,
      expiryClaimNotes: `Replacement for expired Batch #${batch.batchNumber}`,
      createdAt: now,
      updatedAt: now,
    };
    await offlineDb.inventoryBatches.put(replacementBatch);

    movement = {
      id: `mov_suprep_${Date.now()}`,
      productId: batch.productId,
      productName: batch.productName,
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      type: "supplier_return",
      quantityChange: -qty,
      balanceAfter: otherProductRemaining + nextRemaining,
      referenceId: claimRef,
      referenceType: "expiry_claim",
      userId: user.id || "usr_admin",
      userName: user.name || "Owner",
      unitCost: safeCost,
      totalCostValue,
      recoveredAmount: repValue,
      netLossAmount,
      claimOutcome,
      manufacturerId: manufacturerId || batch.manufacturerId,
      manufacturerName: manufacturerName || batch.manufacturerName,
      reason: `Returned ${qty} expired packs to ${
        manufacturerName || "Company"
      } -> Replaced with ${repQty} fresh packs (New Batch #${repBatchNum}, Exp: ${replacementExpiryDate})${
        netLossAmount > 0 ? ` • Shortfall Loss: ${formatPKR(netLossAmount)}` : ""
      }`,
      timestamp: now,
    };
    await offlineDb.stockMovements.put(movement);

    replacementMovement = {
      id: `mov_rep_in_${Date.now() + 1}`,
      productId: batch.productId,
      productName: batch.productName,
      batchId: newBatchId,
      batchNumber: repBatchNum,
      type: "purchase_receipt",
      quantityChange: repQty,
      balanceAfter: otherProductRemaining + nextRemaining + repQty,
      referenceId: claimRef,
      referenceType: "expiry_claim",
      userId: user.id || "usr_admin",
      userName: user.name || "Owner",
      unitCost: safeCost,
      totalCostValue: repQty * safeCost,
      manufacturerId: manufacturerId || batch.manufacturerId,
      manufacturerName: manufacturerName || batch.manufacturerName,
      reason: `Fresh Replacement Batch #${repBatchNum} received for expired Batch #${batch.batchNumber}`,
      timestamp: new Date(Date.now() + 1).toISOString(),
    };
    await offlineDb.stockMovements.put(replacementMovement);
  }

  await recordActivity({
    userId: user.id || "usr_admin",
    userName: user.name || "Owner",
    userRole: user.role || "owner",
    userEmail: user.email,
    action: "update",
    entityType: "inventory_batch",
    entityId: batch.id,
    entityTitle: `${batch.productName} (Batch #${batch.batchNumber})`,
    details: movement.reason || `Resolved ${qty} packs via ${action}`,
    snapshotBefore: {
      batch: prevBatch,
      manufacturer: prevManufacturer || null,
    },
    snapshotAfter: {
      batch: updatedBatch,
      movementId: movement.id,
      replacementBatchId: replacementBatch?.id || null,
      replacementMovementId: replacementMovement?.id || null,
      ledgerEntryId: ledgerEntry?.id || null,
    },
    canUndo: true,
  }).catch(console.warn);

  return {
    updatedBatch,
    movement,
    replacementBatch,
    replacementMovement,
    ledgerEntry,
  };
}

