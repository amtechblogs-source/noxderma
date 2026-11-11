"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  X,
  DollarSign,
  CheckCircle2,
  Building2,
  Receipt,
  Calendar,
  CreditCard,
  Loader2,
  Wallet,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useAuth } from "@/context/AuthContext";
import { recordActivity } from "@/lib/audit/auditTracker";
import type { Customer, Invoice, Payment } from "@/types";

interface ReceivePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (payment: Payment) => void;
  initialCustomerId?: string;
  initialInvoice?: Invoice | null;
}

export function ReceivePaymentModal({
  isOpen,
  onClose,
  onSuccess,
  initialCustomerId,
  initialInvoice,
}: ReceivePaymentModalProps) {
  const { currentUser } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("fifo");
  const [amountStr, setAmountStr] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [paymentMethod, setPaymentMethod] = useState<Payment["paymentMethod"]>("cash");
  const [referenceNumber, setReferenceNumber] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setSavedSuccess(false);
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPaymentMethod("cash");
    setReferenceNumber("");
    setNotes("");

    async function loadModalData() {
      const [custList, invList, payList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.invoices.toArray(),
        offlineDb.payments.toArray(),
      ]);
      setCustomers(custList || []);
      setInvoices(invList || []);
      setPayments(payList || []);

      if (initialInvoice) {
        setSelectedCustomerId(initialInvoice.customerId);
        setSelectedInvoiceId(initialInvoice.id);
        setAmountStr(
          initialInvoice.outstandingBalance > 0
            ? String(initialInvoice.outstandingBalance)
            : ""
        );
      } else if (initialCustomerId && initialCustomerId !== "all") {
        setSelectedCustomerId(initialCustomerId);
        setSelectedInvoiceId("fifo");
        const custUnpaid = (invList || [])
          .filter(
            (i) =>
              i.customerId === initialCustomerId &&
              (i as any).status !== "cancelled" &&
              (i.outstandingBalance || 0) > 0
          )
          .reduce((sum, i) => sum + (i.outstandingBalance || 0), 0);
        const custObj = (custList || []).find((c) => c.id === initialCustomerId);
        const defaultAmt = custUnpaid || custObj?.currentOutstandingBalance || 0;
        setAmountStr(defaultAmt > 0 ? String(defaultAmt) : "");
      } else {
        // Default to first customer who has unpaid balance
        const withDebt = (custList || []).find((c) => (c.currentOutstandingBalance || 0) > 0);
        const firstId = withDebt?.id || custList?.[0]?.id || "";
        setSelectedCustomerId(firstId);
        setSelectedInvoiceId("fifo");
        if (firstId) {
          const custUnpaid = (invList || [])
            .filter(
              (i) =>
                i.customerId === firstId &&
                (i as any).status !== "cancelled" &&
                (i.outstandingBalance || 0) > 0
            )
            .reduce((sum, i) => sum + (i.outstandingBalance || 0), 0);
          const custObj = (custList || []).find((c) => c.id === firstId);
          const defaultAmt = custUnpaid || custObj?.currentOutstandingBalance || 0;
          setAmountStr(defaultAmt > 0 ? String(defaultAmt) : "");
        } else {
          setAmountStr("");
        }
      }
    }

    loadModalData();
  }, [isOpen, initialCustomerId, initialInvoice]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  // Unpaid invoices for selected customer (oldest first for FIFO)
  const customerUnpaidInvoices = useMemo(() => {
    if (!selectedCustomerId) return [];
    return invoices
      .filter(
        (i) =>
          (i.customerId === selectedCustomerId ||
            (selectedCustomer &&
              i.customerName?.trim().toLowerCase() ===
                selectedCustomer.name.trim().toLowerCase())) &&
          (i as any).status !== "cancelled" &&
          (i.outstandingBalance || 0) > 0
      )
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [invoices, selectedCustomerId, selectedCustomer]);

  const totalUnpaidFromBills = useMemo(
    () => customerUnpaidInvoices.reduce((sum, i) => sum + (i.outstandingBalance || 0), 0),
    [customerUnpaidInvoices]
  );

  // Compute true net balance for any customer (positive = Udhaar owed, negative = Advance credit)
  const getCustomerNetBalance = (c: Customer | null): number => {
    if (!c) return totalUnpaidFromBills;
    const cInvoices = invoices.filter(
      (i) =>
        (i.customerId === c.id ||
          i.customerName?.trim().toLowerCase() === c.name.trim().toLowerCase()) &&
        (i as any).status !== "cancelled"
    );
    const cPayments = payments.filter(
      (p) =>
        p.customerId === c.id ||
        p.customerName?.trim().toLowerCase() === c.name.trim().toLowerCase()
    );
    if (cInvoices.length > 0 || cPayments.length > 0) {
      const totalDebit = cInvoices.reduce((s, i) => s + (Number(i.netTotal) || 0), 0);
      const totalCredit = cPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const ledgerNet = totalDebit - totalCredit;
      const unpaidSum = cInvoices.reduce(
        (s, i) => s + Math.max(0, Number(i.outstandingBalance) || 0),
        0
      );
      if (ledgerNet < 0) return ledgerNet;
      return Math.max(unpaidSum, ledgerNet);
    }
    return Number(c.currentOutstandingBalance) || 0;
  };

  const currentCustomerUdhaar = selectedCustomer
    ? getCustomerNetBalance(selectedCustomer)
    : totalUnpaidFromBills;

  const selectedSpecificInvoice = useMemo(
    () =>
      selectedInvoiceId !== "fifo"
        ? customerUnpaidInvoices.find((i) => i.id === selectedInvoiceId) || null
        : null,
    [customerUnpaidInvoices, selectedInvoiceId]
  );

  const numericAmount = Math.max(0, Number(amountStr) || 0);
  // Can be negative when customer pays more than their Udhaar (Advance Credit / ایڈوانس)
  const balanceAfterPayment = currentCustomerUdhaar - numericAmount;
  const remainingUdhaarAfter = Math.max(0, balanceAfterPayment);
  const advanceAfterPayment = balanceAfterPayment < 0 ? Math.abs(balanceAfterPayment) : 0;

  const handleCustomerChange = (newCustId: string) => {
    setSelectedCustomerId(newCustId);
    setSelectedInvoiceId("fifo");
    const custUnpaid = invoices
      .filter(
        (i) =>
          i.customerId === newCustId &&
          (i as any).status !== "cancelled" &&
          (i.outstandingBalance || 0) > 0
      )
      .reduce((sum, i) => sum + (i.outstandingBalance || 0), 0);
    const custObj = customers.find((c) => c.id === newCustId);
    const defaultAmt = custUnpaid || custObj?.currentOutstandingBalance || 0;
    setAmountStr(defaultAmt > 0 ? String(defaultAmt) : "");
  };

  const handleInvoiceChange = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (invId === "fifo") {
      if (currentCustomerUdhaar > 0) setAmountStr(String(currentCustomerUdhaar));
    } else {
      const target = customerUnpaidInvoices.find((i) => i.id === invId);
      if (target && target.outstandingBalance > 0) {
        setAmountStr(String(target.outstandingBalance));
      }
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer && !initialInvoice) {
      alert("Please select a customer.");
      return;
    }
    if (numericAmount <= 0) {
      alert("Please enter a valid received cash amount greater than 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const paymentId = `pay_${Date.now()}`;
      const custId = selectedCustomer?.id || initialInvoice?.customerId || `cust_${Date.now()}`;
      const custName = selectedCustomer?.name || initialInvoice?.customerName || "Customer";

      let remainingToAllocate = numericAmount;
      const allocations: Payment["allocations"] = [];

      // Order invoices: if a specific bill was picked, allocate to it FIRST, then FIFO for any excess
      const orderedUnpaid: Invoice[] = [];
      if (selectedSpecificInvoice) {
        orderedUnpaid.push(selectedSpecificInvoice);
      }
      for (const inv of customerUnpaidInvoices) {
        if (!orderedUnpaid.some((o) => o.id === inv.id)) {
          orderedUnpaid.push(inv);
        }
      }

      for (const inv of orderedUnpaid) {
        if (remainingToAllocate <= 0) break;
        const allocateNow = Math.min(inv.outstandingBalance, remainingToAllocate);
        if (allocateNow <= 0) continue;

        const invRef = inv.officialReference || inv.provisionalReference || inv.id;
        allocations.push({
          invoiceId: inv.id,
          invoiceReference: invRef,
          amountAllocated: allocateNow,
        });

        const newOutstanding = Math.max(0, (inv.outstandingBalance || 0) - allocateNow);
        const newPaid = (inv.paidAmount || 0) + allocateNow;
        const newStatus = newOutstanding === 0 ? "paid" : "partially_paid";

        await offlineDb.invoices.update(inv.id, {
          outstandingBalance: newOutstanding,
          paidAmount: newPaid,
          paymentStatus: newStatus,
          updatedAt: nowIso,
        });

        remainingToAllocate -= allocateNow;
      }

      const defaultRef =
        referenceNumber.trim() ||
        (selectedSpecificInvoice
          ? selectedSpecificInvoice.officialReference ||
            selectedSpecificInvoice.provisionalReference
          : `RCPT-${Date.now().toString().slice(-6)}`);

      const paymentRecord: Payment = {
        id: paymentId,
        customerId: custId,
        customerName: custName,
        amount: numericAmount,
        paymentDate: paymentDate || nowIso.slice(0, 10),
        paymentMethod,
        referenceNumber: defaultRef,
        allocations,
        unallocatedAmount: remainingToAllocate > 0 ? remainingToAllocate : 0,
        recordedByUserId: currentUser?.id || "usr_admin",
        notes:
          notes.trim() ||
          (selectedSpecificInvoice
            ? `Cash received against Bill #${
                selectedSpecificInvoice.officialReference ||
                selectedSpecificInvoice.provisionalReference
              }`
            : "Udhaar / Credit payment received"),
        syncStatus: "local_only",
        createdAt: nowIso,
      };

      await offlineDb.payments.put(paymentRecord);

      // Update customer's currentOutstandingBalance accurately (negative = Advance Credit)
      if (selectedCustomer) {
        const finalCustomerBalance = currentCustomerUdhaar - numericAmount;

        await offlineDb.customers.update(selectedCustomer.id, {
          currentOutstandingBalance: finalCustomerBalance,
          updatedAt: nowIso,
        });
      }

      await recordActivity({
        userId: currentUser?.id || "usr_admin",
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "create",
        entityType: "payment",
        entityId: paymentId,
        entityTitle: `Cash Vasooli ${formatPKR(numericAmount)} — ${custName}`,
        details: `Received ${formatPKR(numericAmount)} (${paymentMethod.replace(
          /_/g,
          " "
        )}) from ${custName}. ${
          balanceAfterPayment < 0
            ? `Advance Credit: Adv ${formatPKR(Math.abs(balanceAfterPayment))}`
            : `Remaining Udhaar: ${formatPKR(remainingUdhaarAfter)}`
        }.`,
        snapshotAfter: paymentRecord,
        canUndo: true,
      }).catch(() => {});

      setSavedSuccess(true);
      if (onSuccess) {
        onSuccess(paymentRecord);
      }
      setTimeout(() => {
        onClose();
      }, 650);
    } catch (err) {
      console.error("Failed to record customer payment:", err);
      alert("Could not save payment. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto no-print">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-extrabold leading-tight">
                Receive Customer Cash (ادھار وصولی)
              </h3>
              <p className="text-[11px] text-emerald-100">
                Credit customer se milnay wali cash ya bank payment darj karein
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {/* 1. Select Customer */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-teal-600" />
              1. Customer / Medical Store
            </label>
            <select
              value={selectedCustomerId}
              onChange={(e) => handleCustomerChange(e.target.value)}
              disabled={Boolean(initialInvoice)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold disabled:opacity-75"
            >
              <option value="">-- Select Customer --</option>
              {customers.map((c) => {
                const displayNet = getCustomerNetBalance(c);
                return (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.city ? `(${c.city})` : ""} —{" "}
                    {displayNet < 0
                      ? `Advance: Adv ${formatPKR(Math.abs(displayNet))}`
                      : `Baqaya: ${formatPKR(displayNet)}`}
                  </option>
                );
              })}
            </select>
          </div>

          {/* 2. Select Specific Unpaid Bill or Auto FIFO */}
          {customerUnpaidInvoices.length > 0 && (
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                <Receipt className="w-3.5 h-3.5 text-teal-600" />
                2. Bill / Invoice to Settle
              </label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => handleInvoiceChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-xs"
              >
                <option value="fifo">
                  Auto-Adjust Oldest Unpaid Bills First ({customerUnpaidInvoices.length} unpaid bill
                  {customerUnpaidInvoices.length !== 1 ? "s" : ""} • Total:{" "}
                  {formatPKR(totalUnpaidFromBills)})
                </option>
                {customerUnpaidInvoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    Bill #{inv.officialReference || inv.provisionalReference} (
                    {formatKarachiDate(inv.invoiceDate || inv.createdAt)}) — Remaining:{" "}
                    {formatPKR(inv.outstandingBalance)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Summary Bar: Current Udhaar vs Receiving vs Remaining / Advance */}
          <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 text-center">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 block">
                {currentCustomerUdhaar < 0 ? "Current Advance" : "Total Baqaya Udhaar"}
              </span>
              <span
                className={`font-mono font-black text-xs sm:text-sm ${
                  currentCustomerUdhaar < 0
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {currentCustomerUdhaar < 0
                  ? `Adv ${formatPKR(Math.abs(currentCustomerUdhaar))}`
                  : formatPKR(currentCustomerUdhaar)}
              </span>
            </div>
            <div className="border-x border-slate-200 dark:border-slate-700 px-1">
              <span className="text-[10px] font-bold uppercase text-emerald-600 block">
                Cash Receiving Now
              </span>
              <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                {formatPKR(numericAmount)}
              </span>
            </div>
            <div>
              <span
                className={`text-[10px] font-bold uppercase block ${
                  advanceAfterPayment > 0
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-slate-400"
                }`}
              >
                {advanceAfterPayment > 0 ? "Advance (ایڈوانس جمع)" : "Remaining Baqaya"}
              </span>
              <span
                className={`font-mono font-black text-xs sm:text-sm ${
                  advanceAfterPayment > 0
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {advanceAfterPayment > 0
                  ? `Adv ${formatPKR(advanceAfterPayment)}`
                  : formatPKR(remainingUdhaarAfter)}
              </span>
            </div>
          </div>

          {advanceAfterPayment > 0 && (
            <div className="p-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800/70 text-sky-800 dark:text-sky-200 text-xs font-semibold flex items-center justify-between gap-2">
              <span>
                ✨ Extra <strong className="font-mono">{formatPKR(advanceAfterPayment)}</strong>{" "}
                customer ke Khata mein <strong>Advance (ایڈوانس جمع)</strong> ke tor par save ho jayega!
              </span>
            </div>
          )}

          {/* 3. Amount & Quick Fill Buttons */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                3. Cash Received Amount (PKR) *
              </label>
              <div className="flex items-center gap-1.5">
                {selectedSpecificInvoice && selectedSpecificInvoice.outstandingBalance > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountStr(String(selectedSpecificInvoice.outstandingBalance))}
                    className="px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-[10px] font-bold hover:bg-teal-100"
                  >
                    Full Bill ({formatPKR(selectedSpecificInvoice.outstandingBalance)})
                  </button>
                )}
                {currentCustomerUdhaar > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountStr(String(currentCustomerUdhaar))}
                    className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold hover:bg-emerald-100"
                  >
                    Full Udhaar ({formatPKR(currentCustomerUdhaar)})
                  </button>
                )}
              </div>
            </div>
            <input
              type="number"
              min="1"
              step="any"
              required
              placeholder="Enter amount received e.g. 5000"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border-2 border-emerald-500/60 focus:border-emerald-600 bg-white dark:bg-slate-900 font-mono text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 outline-none"
            />
          </div>

          {/* 4. Payment Method & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                Payment Mode
              </label>
              <select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as Payment["paymentMethod"])
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-xs"
              >
                <option value="cash">💵 Cash (نقد وصولی)</option>
                <option value="bank_transfer">🏦 Bank Transfer / Raast</option>
                <option value="online">📱 EasyPaisa / JazzCash / Online</option>
                <option value="cheque">🧾 Cheque</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                Receiving Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono text-xs"
              />
            </div>
          </div>

          {/* 5. Optional Reference & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1 text-xs">
                Receipt / Slip / Cheque # (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. RCPT-104 or TID..."
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-400 mb-1 text-xs">
                Note / Detail (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Collected by Medical Rep"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || savedSuccess || numericAmount <= 0}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Payment...
                </>
              ) : savedSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Payment Recorded!
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Save Cash Receipt ({formatPKR(numericAmount)})
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

