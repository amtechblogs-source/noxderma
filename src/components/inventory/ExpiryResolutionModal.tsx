"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  Factory,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { formatKarachiDate, formatNumber, formatPKR } from "@/lib/formatting";
import {
  executeExpiryResolution,
  type ExpiryResolutionAction,
} from "@/lib/inventory/expiryUtils";
import type { InventoryBatch } from "@/types";

interface ManufacturerLite {
  id: string;
  name: string;
  payableBalance?: number;
}

interface ExpiryResolutionModalProps {
  isOpen: boolean;
  batch: InventoryBatch | null;
  defaultCostPerPack: number;
  manufacturers: ManufacturerLite[];
  user: {
    id?: string;
    name?: string;
    role?: string;
    email?: string;
  };
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
}

export function ExpiryResolutionModal({
  isOpen,
  batch,
  defaultCostPerPack,
  manufacturers,
  user,
  onClose,
  onSuccess,
}: ExpiryResolutionModalProps) {
  const [sourcePool, setSourcePool] = useState<"remaining" | "blocked">("remaining");
  const [action, setAction] = useState<ExpiryResolutionAction>("quarantine");
  const [qty, setQty] = useState<number>(1);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [manufacturerId, setManufacturerId] = useState<string>("");
  const [creditAmount, setCreditAmount] = useState<number>(0);
  const [replacementQty, setReplacementQty] = useState<number>(1);
  const [replacementBatchNumber, setReplacementBatchNumber] = useState<string>("");
  const [replacementExpiryDate, setReplacementExpiryDate] = useState<string>("");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    if (!isOpen || !batch) return;
    const rem = Number(batch.remainingQuantity) || 0;
    const blocked = Number(batch.blockedQuantity) || 0;
    const initialPool: "remaining" | "blocked" = rem > 0 ? "remaining" : "blocked";
    const poolQty = initialPool === "remaining" ? rem : blocked;
    const resolvedCost = Math.max(0, Number(defaultCostPerPack) || 0);

    setSourcePool(initialPool);
    setAction(initialPool === "blocked" ? "full_credit" : "quarantine");
    setQty(poolQty > 0 ? poolQty : 1);
    setUnitCost(resolvedCost);
    setManufacturerId(
      batch.manufacturerId || manufacturers[0]?.id || ""
    );
    setCreditAmount(poolQty * resolvedCost);
    setReplacementQty(poolQty > 0 ? poolQty : 1);
    setReplacementBatchNumber("");
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    setReplacementExpiryDate(nextYear.toISOString().slice(0, 10));
    setReferenceNumber(`EXP-${Date.now().toString().slice(-6)}`);
    setNotes("");
    setErrorMsg("");
  }, [isOpen, batch, defaultCostPerPack, manufacturers]);

  const maxPoolQty = useMemo(() => {
    if (!batch) return 0;
    return sourcePool === "blocked"
      ? Number(batch.blockedQuantity) || 0
      : Number(batch.remainingQuantity) || 0;
  }, [batch, sourcePool]);

  const handlePoolChange = (nextPool: "remaining" | "blocked") => {
    if (!batch) return;
    setSourcePool(nextPool);
    const poolMax =
      nextPool === "blocked"
        ? Number(batch.blockedQuantity) || 0
        : Number(batch.remainingQuantity) || 0;
    const nextQty = poolMax > 0 ? poolMax : 1;
    setQty(nextQty);
    setCreditAmount(nextQty * unitCost);
    setReplacementQty(nextQty);
    if (nextPool === "blocked" && action === "quarantine") {
      setAction("full_credit");
    }
    if (nextPool === "remaining" && action === "rejected_write_off") {
      setAction("direct_write_off");
    }
  };

  if (!isOpen || !batch) return null;

  const totalCostValue = Math.max(0, (Number(qty) || 0) * (Number(unitCost) || 0));
  const selectedMfr = manufacturers.find((m) => m.id === manufacturerId);

  const previewLoss = (() => {
    if (action === "quarantine") return 0;
    if (action === "direct_write_off" || action === "rejected_write_off") {
      return totalCostValue;
    }
    if (action === "full_credit" || action === "partial_credit") {
      return Math.max(0, totalCostValue - (Number(creditAmount) || 0));
    }
    // replaced
    const repVal = Math.max(0, (Number(replacementQty) || 0) * (Number(unitCost) || 0));
    return Math.max(0, totalCostValue - repVal);
  })();

  const previewRecovered = Math.max(0, totalCostValue - previewLoss);

  const availableOptions: Array<{
    key: ExpiryResolutionAction;
    title: string;
    subtitle: string;
    badge: string;
    color: string;
    icon: React.ReactNode;
  }> = [
    ...(sourcePool === "remaining"
      ? [
          {
            key: "quarantine" as const,
            title: "Hold / Quarantine (Company Claim Pending)",
            subtitle: "Stock locked from sale; P&L loss holds until company replies",
            badge: "LOCK & WAIT",
            color: "border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-800",
            icon: <Clock className="w-4 h-4 text-amber-600 shrink-0" />,
          },
        ]
      : []),
    {
      key: "full_credit",
      title: "Return to Company -> Full Credit Note (100%)",
      subtitle: "Reduces Company Khata payable; P&L Net Loss = Rs 0",
      badge: "NO LOSS",
      color: "border-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-800",
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />,
    },
    {
      key: "partial_credit",
      title: "Return to Company -> Partial Credit + Loss",
      subtitle: "Approved credit reduces Company Khata; remaining goes to P&L Loss",
      badge: "PARTIAL",
      color: "border-sky-300 bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-800",
      icon: <DollarSign className="w-4 h-4 text-sky-600 shrink-0" />,
    },
    {
      key: "replaced",
      title: "Company Gave Fresh Replacement Batch",
      subtitle: "Removes expired packs & adds new fresh batch with new expiry date",
      badge: "REPLACEMENT",
      color: "border-teal-300 bg-teal-50/70 dark:bg-teal-950/30 dark:border-teal-800",
      icon: <RefreshCw className="w-4 h-4 text-teal-600 shrink-0" />,
    },
    {
      key: sourcePool === "blocked" ? "rejected_write_off" : "direct_write_off",
      title:
        sourcePool === "blocked"
          ? "Claim Rejected by Company -> Record Full Loss"
          : "Write-off Expired Stock as Loss (No Return)",
      subtitle: "Company refuses return or stock destroyed; hits P&L Expenses at cost",
      badge: "P&L LOSS",
      color: "border-rose-300 bg-rose-50/70 dark:bg-rose-950/30 dark:border-rose-800",
      icon: <Trash2 className="w-4 h-4 text-rose-600 shrink-0" />,
    },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (qty <= 0 || qty > maxPoolQty) {
      setErrorMsg(`Please enter a valid quantity between 1 and ${maxPoolQty}.`);
      return;
    }

    if (action === "replaced" && (!replacementBatchNumber.trim() || !replacementExpiryDate)) {
      setErrorMsg("New Replacement Batch # and Future Expiry Date are required.");
      return;
    }

    setIsSaving(true);
    try {
      await executeExpiryResolution({
        batch,
        action,
        quantity: qty,
        sourcePool,
        unitCost,
        manufacturerId: selectedMfr?.id || manufacturerId || batch.manufacturerId,
        manufacturerName: selectedMfr?.name || batch.manufacturerName,
        creditAmount,
        replacementQty,
        replacementBatchNumber,
        replacementExpiryDate,
        referenceNumber,
        notes,
        user,
      });
      await onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to process expiry resolution.");
    } finally {
      setIsSaving(false);
    }
  };

  const needsManufacturer =
    action === "quarantine" ||
    action === "full_credit" ||
    action === "partial_credit" ||
    action === "replaced" ||
    action === "rejected_write_off";

  return (
    <div className="fixed inset-0 !mt-0 z-[110] bg-slate-950/65 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
              <h2 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100">
                Resolve Expired / Claim Stock
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {batch.productName} • Batch{" "}
              <span className="font-mono font-bold text-teal-600">#{batch.batchNumber}</span> • Exp:{" "}
              <span className="font-semibold text-rose-600">{formatKarachiDate(batch.expiryDate)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Pool switcher if batch has both active and quarantined quantities */}
          {(batch.remainingQuantity || 0) > 0 && (batch.blockedQuantity || 0) > 0 && (
            <div className="grid grid-cols-2 gap-2 p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => handlePoolChange("remaining")}
                className={`py-2 px-3 rounded-lg font-bold transition-all ${
                  sourcePool === "remaining"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Godown Stock ({formatNumber(batch.remainingQuantity)} packs)
              </button>
              <button
                type="button"
                onClick={() => handlePoolChange("blocked")}
                className={`py-2 px-3 rounded-lg font-bold transition-all ${
                  sourcePool === "blocked"
                    ? "bg-white dark:bg-slate-900 text-amber-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Quarantined Claim ({formatNumber(batch.blockedQuantity)} packs)
              </button>
            </div>
          )}

          {/* Quantity & Cost Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Packs to Process (Max: {formatNumber(maxPoolQty)}) *
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setQty(maxPoolQty);
                    setCreditAmount(maxPoolQty * unitCost);
                    setReplacementQty(maxPoolQty);
                  }}
                  className="text-[10px] font-bold text-teal-600 hover:underline"
                >
                  Select All ({maxPoolQty})
                </button>
              </div>
              <input
                type="number"
                min={1}
                max={Math.max(1, maxPoolQty)}
                required
                value={qty === 0 ? "" : qty}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  setQty(val);
                  if (action === "full_credit") setCreditAmount(val * unitCost);
                  if (action === "replaced") setReplacementQty(val);
                }}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
              />
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Purchase Cost / Pack (PKR) *
              </label>
              <input
                type="number"
                min={0}
                step="any"
                required
                value={unitCost === 0 ? "" : unitCost}
                onChange={(e) => {
                  const val = Math.max(0, Number(e.target.value) || 0);
                  setUnitCost(val);
                  if (action === "full_credit") setCreditAmount(qty * val);
                }}
                placeholder="Cost price per pack"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Total Purchase Value: <strong className="text-slate-700 dark:text-slate-200">{formatPKR(totalCostValue)}</strong>
              </span>
            </div>
          </div>

          {/* Resolution Possibility Selection */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 dark:text-slate-300 block">
              Choose Business Outcome (Kaise Handle Karna Hai?) *
            </label>
            <div className="grid grid-cols-1 gap-2">
              {availableOptions.map((opt) => {
                const selected = action === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setAction(opt.key);
                      if (opt.key === "full_credit") {
                        setCreditAmount(qty * unitCost);
                      } else if (opt.key === "partial_credit") {
                        setCreditAmount(Math.round(qty * unitCost * 0.5));
                      } else if (opt.key === "replaced") {
                        setReplacementQty(qty);
                      }
                    }}
                    className={`w-full text-left p-2.5 sm:p-3 rounded-xl border transition-all flex items-start justify-between gap-2.5 ${
                      selected
                        ? `${opt.color} ring-2 ring-teal-500/70`
                        : "border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100/70 dark:hover:bg-slate-800/70"
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5">{opt.icon}</div>
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 dark:text-slate-100 block leading-tight">
                          {opt.title}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                          {opt.subtitle}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-200 border border-slate-200/70 dark:border-slate-700 shrink-0">
                      {opt.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditional Fields */}
          {needsManufacturer && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
                  <Factory className="w-3.5 h-3.5 text-teal-600" /> Manufacturer / Supplier
                </label>
                <select
                  value={manufacturerId}
                  onChange={(e) => setManufacturerId(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-semibold"
                >
                  <option value="">-- Select Company --</option>
                  {manufacturers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (Payable: {formatPKR(m.payableBalance || 0)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Claim Slip / Debit Note #
                </label>
                <input
                  type="text"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder="EXP-123456"
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              {(action === "full_credit" || action === "partial_credit") && (
                <div className="sm:col-span-2">
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Credit Note Amount Approved by Company (PKR) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={creditAmount === 0 ? "0" : creditAmount}
                    onChange={(e) => setCreditAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold text-emerald-700 dark:text-emerald-400"
                  />
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    This amount will be credited (deducted) in{" "}
                    <strong>Company Khata (Debit Note)</strong>. Any shortfall automatically hits P&amp;L as Expiry Loss.
                  </span>
                </div>
              )}

              {action === "replaced" && (
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Fresh Packs Given *
                    </label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={replacementQty === 0 ? "" : replacementQty}
                      onChange={(e) => setReplacementQty(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      New Fresh Batch # *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. NX-2027-B"
                      value={replacementBatchNumber}
                      onChange={(e) => setReplacementBatchNumber(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      New Expiry Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={replacementExpiryDate}
                      onChange={(e) => setReplacementExpiryDate(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Notes / Courier / Claim Details (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Sent to distributor courier / DRAP quarantine box #2..."
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          {/* Live Financial Impact Preview */}
          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 space-y-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
              Financial &amp; Stock Impact Summary
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block">Stock Purchase Value</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {formatPKR(totalCostValue)}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] text-emerald-600 block">Recovered (Company)</span>
                <span className="font-mono font-bold text-emerald-600">
                  {action === "quarantine" ? "Pending" : formatPKR(previewRecovered)}
                </span>
              </div>
              <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <span className="text-[10px] text-rose-600 block">P&amp;L Net Loss</span>
                <span className="font-mono font-bold text-rose-600">
                  {action === "quarantine" ? "On Hold (Rs 0)" : `-${formatPKR(previewLoss)}`}
                </span>
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold shadow-md shadow-teal-600/20 flex items-center gap-1.5"
            >
              <PackageCheck className="w-4 h-4" />
              <span>{isSaving ? "Saving..." : "Confirm & Update Stock / Accounts"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

