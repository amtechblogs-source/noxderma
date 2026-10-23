"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Receipt,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Building,
  CreditCard,
  Barcode,
  Layers,
  Phone,
  Clock,
} from "lucide-react";
import { formatPKR, formatKarachiDate, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { generateCollisionSafeInvoiceReference, getDeviceId } from "@/lib/offline/device";
import { enqueueOperation } from "@/lib/offline/outbox";
import { syncManager } from "@/lib/offline/sync";
import { useCategory } from "@/context/CategoryContext";
import type { Customer, InventoryBatch, Invoice, InvoiceLine, CustomerCategory, Product } from "@/types";

export function OfflineInvoiceCreator() {
  const router = useRouter();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();

  // State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customCustomerName, setCustomCustomerName] = useState<string>("");
  const [customCustomerCategory, setCustomCustomerCategory] = useState<CustomerCategory>("pharmacy");
  const [customCustomerPhone, setCustomCustomerPhone] = useState<string>("");
  const [customCustomerAddress, setCustomCustomerAddress] = useState<string>("");

  const [lines, setLines] = useState<
    Array<{
      productId: string;
      productName: string;
      packSize: string;
      batchId: string;
      batchNumber: string;
      expiryDate: string;
      availableQuantity: number;
      quantity: number;
      unitPrice: number;
      discountPercent: number;
    }>
  >([]);

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "credit">("credit");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0);
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);

  // Load available local records
  useEffect(() => {
    async function loadMasterData() {
      const [custList, batchList, prodList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.inventoryBatches.where("remainingQuantity").above(0).toArray(),
        offlineDb.products.toArray(),
      ]);

      setCustomers(custList);
      setBatches(batchList);
      setProducts(prodList);
    }

    loadMasterData();
  }, []);

  // Category isolation
  const categoryProductIds = new Set(
    selectedCategoryId === "all"
      ? products.map((p) => p.id)
      : products.filter((p) => p.categoryId === selectedCategoryId).map((p) => p.id)
  );

  const availableBatches =
    selectedCategoryId === "all"
      ? batches
      : batches.filter((b) => categoryProductIds.has(b.productId));

  const activeCategoryObj =
    selectedCategoryId === "all" ? null : categories.find((c) => c.id === selectedCategoryId);

  // Add line item
  const handleAddLine = () => {
    if (availableBatches.length === 0) {
      if (selectedCategoryId !== "all") {
        alert(
          `No stock batches found for category "${activeCategoryObj?.name || selectedCategoryId}". Please switch category or add inventory stock.`
        );
      } else {
        alert("No batches available in inventory. Please seed or add stock first.");
      }
      return;
    }

    // Default to earliest expiry batch (FEFO)
    const sorted = [...availableBatches].sort(
      (a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    );
    const earliest = sorted[0];

    setLines([
      ...lines,
      {
        productId: earliest.productId,
        productName: earliest.productName,
        packSize: "Pack of 30",
        batchId: earliest.id,
        batchNumber: earliest.batchNumber,
        expiryDate: earliest.expiryDate,
        availableQuantity: earliest.remainingQuantity,
        quantity: 1,
        unitPrice: 650,
        discountPercent: 0,
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleUpdateLine = (index: number, field: string, value: unknown) => {
    const updated = [...lines];
    const current = { ...updated[index] };

    if (field === "batchId") {
      const selectedBatch = availableBatches.find((b) => b.id === value) || batches.find((b) => b.id === value);
      if (selectedBatch) {
        current.batchId = selectedBatch.id;
        current.productId = selectedBatch.productId;
        current.productName = selectedBatch.productName;
        current.batchNumber = selectedBatch.batchNumber;
        current.expiryDate = selectedBatch.expiryDate;
        current.availableQuantity = selectedBatch.remainingQuantity;
      }
    } else if (field === "quantity") {
      const qty = Math.max(1, Number(value) || 1);
      current.quantity = Math.min(qty, current.availableQuantity);
    } else if (field === "unitPrice") {
      current.unitPrice = Math.max(0, Number(value) || 0);
    } else if (field === "discountPercent") {
      current.discountPercent = Math.min(100, Math.max(0, Number(value) || 0));
    }

    updated[index] = current;
    setLines(updated);
  };

  // Calculations
  const subtotal = lines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalLineDiscount = lines.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice * (item.discountPercent || 0)) / 100,
    0
  );
  const netTotal = Math.max(0, subtotal - totalLineDiscount - invoiceDiscount + deliveryCharge);
  const effectivePaid = paymentMethod === "credit" ? paidAmount : netTotal;
  const outstandingBalance = Math.max(0, netTotal - effectivePaid);

  // Submit invoice
  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lines.length === 0) {
      alert("Please add at least one product line.");
      return;
    }

    const selectedCust = customers.find((c) => c.id === selectedCustomerId);
    const finalCustomerName = selectedCust ? selectedCust.name : customCustomerName.trim();
    if (!finalCustomerName) {
      alert("Please select a customer or provide a customer name.");
      return;
    }

    setIsSubmitting(true);
    try {
      const now = new Date();
      const provisionalRef = generateCollisionSafeInvoiceReference();
      const invoiceId = `inv_${Date.now()}_${provisionalRef}`;
      const deviceId = getDeviceId();
      const dueDate = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();

      const invoiceLines: InvoiceLine[] = lines.map((l, idx) => {
        const lineTotal = l.quantity * l.unitPrice * (1 - l.discountPercent / 100);
        return {
          id: `line_${idx + 1}`,
          productId: l.productId,
          productName: l.productName,
          packSize: l.packSize,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineDiscountPercentage: l.discountPercent,
          lineDiscountAmount: (l.quantity * l.unitPrice * l.discountPercent) / 100,
          lineTotal,
          batchAllocations: [
            {
              batchId: l.batchId,
              batchNumber: l.batchNumber,
              expiryDate: l.expiryDate,
              quantity: l.quantity,
            },
          ],
        };
      });

      const newInvoice: Invoice = {
        id: invoiceId,
        provisionalReference: provisionalRef,
        customerId: selectedCustomerId || "cust_guest",
        customerName: finalCustomerName,
        customerCategory: selectedCust ? selectedCust.category : customCustomerCategory,
        customerPhone: selectedCust ? selectedCust.phone : customCustomerPhone,
        customerAddress: selectedCust ? selectedCust.address : customCustomerAddress,
        lines: invoiceLines,
        subtotal,
        invoiceDiscountAmount: invoiceDiscount + totalLineDiscount,
        taxAmount: 0,
        deliveryCharge,
        grossTotal: subtotal,
        netTotal,
        paidAmount: effectivePaid,
        outstandingBalance,
        paymentStatus: outstandingBalance === 0 ? "paid" : effectivePaid > 0 ? "partially_paid" : "unpaid",
        paymentMethod,
        invoiceDate: now.toISOString(),
        dueDate,
        deliveryStatus: "pending",
        salesRepId: "usr_active_rep",
        salesRepName: "Field Agent",
        notes,
        syncStatus: "pending_sync",
        deviceId,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      // Atomic Dexie transaction: persist invoice, deduct batches, create stock movement, update customer balance, record payment, enqueue outbox
      await offlineDb.transaction(
        "rw",
        [
          offlineDb.invoices,
          offlineDb.inventoryBatches,
          offlineDb.stockMovements,
          offlineDb.customers,
          offlineDb.payments,
          offlineDb.outboxQueue,
        ],
        async () => {
          // 1. Save invoice
          await offlineDb.invoices.add(newInvoice);

          // 2. Deduct batches and record stock movements
          for (const line of lines) {
            const batch = await offlineDb.inventoryBatches.get(line.batchId);
            if (batch) {
              const newRemaining = Math.max(0, batch.remainingQuantity - line.quantity);
              await offlineDb.inventoryBatches.update(line.batchId, {
                remainingQuantity: newRemaining,
                updatedAt: now.toISOString(),
              });

              await offlineDb.stockMovements.add({
                id: `mov_${Date.now()}_${line.batchId}`,
                productId: line.productId,
                productName: line.productName,
                batchId: line.batchId,
                batchNumber: line.batchNumber,
                type: "sales_deduction",
                quantityChange: -line.quantity,
                balanceAfter: newRemaining,
                referenceId: invoiceId,
                referenceType: "invoice",
                userId: "usr_active_rep",
                userName: "Field Agent",
                timestamp: now.toISOString(),
              });
            }
          }

          // 3. Update customer outstanding balance if selected existing customer
          if (selectedCustomerId && outstandingBalance > 0) {
            const custRecord = await offlineDb.customers.get(selectedCustomerId);
            if (custRecord) {
              const updatedBal = (custRecord.currentOutstandingBalance || 0) + outstandingBalance;
              await offlineDb.customers.update(selectedCustomerId, {
                currentOutstandingBalance: updatedBal,
                updatedAt: now.toISOString(),
              });
            }
          }

          // 4. Record payment receipt if cash / bank transfer was collected immediately
          if (effectivePaid > 0) {
            const payMethodMapped = paymentMethod === "credit" ? "cash" : paymentMethod;
            await offlineDb.payments.add({
              id: `pay_${Date.now()}`,
              customerId: selectedCustomerId || "cust_guest",
              customerName: finalCustomerName,
              amount: effectivePaid,
              paymentDate: now.toISOString().slice(0, 10),
              paymentMethod: payMethodMapped,
              referenceNumber: provisionalRef,
              allocations: [
                {
                  invoiceId: invoiceId,
                  invoiceReference: provisionalRef,
                  amountAllocated: effectivePaid,
                },
              ],
              unallocatedAmount: 0,
              recordedByUserId: "usr_active_rep",
              notes: `Immediate collection at invoice issuance (${paymentMethod})`,
              syncStatus: "local_only",
              createdAt: now.toISOString(),
            });
          }

          // 5. Add to Outbox Queue for idempotent sync
          await enqueueOperation(
            "invoice",
            invoiceId,
            "create",
            newInvoice as unknown as Record<string, unknown>,
            "usr_active_rep",
            "Field Agent"
          );
        }
      );

      setCreatedInvoice(newInvoice);
      // Trigger background sync attempt if internet is active
      syncManager.syncNow();
    } catch (err) {
      console.error("Failed to commit offline invoice transaction:", err);
      alert("Failed to save invoice locally. Check browser storage permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If invoice is successfully created, render the printable Enterprise Receipt view
  if (createdInvoice) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between no-print">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              Print Invoice
            </button>
            <button
              onClick={() => {
                setCreatedInvoice(null);
                setLines([]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              New Invoice
            </button>
          </div>
        </div>

        {/* Success Alert */}
        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs no-print flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
          <div>
            <strong>Bill Saved Offline Successfully!</strong> Bill No:{" "}
            <span className="font-mono font-bold">{createdInvoice.provisionalReference}</span>. Stock has been
            deducted immediately. This bill will automatically upload to the cloud once internet connects.
          </div>
        </div>

        {/* Printable Official Invoice Card */}
        <div className="print-page p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-6 text-slate-900 dark:text-slate-100">
          {/* Header */}
          <div className="flex justify-between items-start pb-6 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div className="text-xl font-extrabold tracking-tight">
                NOX<span className="text-teal-600">DERMA</span> PHARMA
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Plot 42, Industrial Sector 7, Karachi</p>
              <p className="text-xs text-slate-500">Phone: +92 300 1234567 • info@noxderma.com</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                SALES BILL / CASH MEMO
              </span>
              <p className="font-mono text-sm font-bold text-teal-600 mt-1">
                {createdInvoice.provisionalReference}
              </p>
              <p className="text-[11px] text-slate-500">
                Date: {formatKarachiDate(createdInvoice.invoiceDate, true)}
              </p>
              <p className="text-[11px] text-slate-500">Due Date: {formatKarachiDate(createdInvoice.dueDate)} (30 Days)</p>
            </div>
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Customer / Pharmacy:</span>
              <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5">
                {createdInvoice.customerName}
              </p>
              <p className="text-slate-500">{createdInvoice.customerAddress || "Walk-in Counter"}</p>
              <p className="text-slate-500">{createdInvoice.customerPhone}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Payment Details:</span>
              <p className="font-bold text-sm text-slate-900 dark:text-slate-100 mt-0.5 capitalize">
                Paid Via: {createdInvoice.paymentMethod === "credit" ? "Udhaar (Credit)" : createdInvoice.paymentMethod?.replace("_", " ")}
              </p>
              <p className="text-slate-500">
                Payment Status:{" "}
                <span className="font-bold text-teal-600 uppercase">
                  {createdInvoice.paymentStatus === "paid"
                    ? "Full Paid"
                    : createdInvoice.paymentStatus === "partially_paid"
                    ? "Half / Partial Paid"
                    : "Unpaid (Udhaar)"}
                </span>
              </p>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2">Medicine Name</th>
                <th className="py-2">Batch & Expiry</th>
                <th className="py-2 text-right">Quantity</th>
                <th className="py-2 text-right">Price</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {createdInvoice.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2.5 font-medium">
                    {l.productName}
                    <span className="block text-[10px] text-slate-500">{l.packSize}</span>
                  </td>
                  <td className="py-2.5 font-mono text-[11px]">
                    {l.batchAllocations[0]?.batchNumber || "—"}{" "}
                    <span className="text-slate-400 text-[10px]">
                      (Exp: {formatKarachiDate(l.batchAllocations[0]?.expiryDate)})
                    </span>
                  </td>
                  <td className="py-2.5 text-right font-bold">{l.quantity}</td>
                  <td className="py-2.5 text-right">{formatPKR(l.unitPrice)}</td>
                  <td className="py-2.5 text-right font-bold">{formatPKR(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Financial Breakdown */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Medicines Subtotal:</span>
                <span>{formatPKR(createdInvoice.subtotal)}</span>
              </div>
              {createdInvoice.invoiceDiscountAmount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount Given:</span>
                  <span>-{formatPKR(createdInvoice.invoiceDiscountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500">
                <span>Delivery Charges:</span>
                <span>{formatPKR(createdInvoice.deliveryCharge)}</span>
              </div>
              <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-800">
                <span>Total Bill:</span>
                <span>{formatPKR(createdInvoice.netTotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Cash Paid Now:</span>
                <span>{formatPKR(createdInvoice.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-bold">
                <span>Remaining Balance (Baqaya):</span>
                <span>{formatPKR(createdInvoice.outstandingBalance)}</span>
              </div>
            </div>
          </div>

          {/* Footer Notice */}
          <div className="pt-6 border-t border-slate-100 dark:border-slate-800 text-center text-[10px] text-slate-400">
            <p>
              Thank you for your business! Please keep this bill for your accounts and warranty records.
            </p>
            <p className="mt-1">Bank: Meezan Bank • Account Title: Noxderma Pharma • IBAN: PK00MEZN0001234567890123</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-teal-600" />
            Make Customer Bill (Invoice)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Works 100% offline without internet. Oldest expiry medicine batches are chosen first.
          </p>
        </div>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Bill restricted to category: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCategoryId("all")}
            className="text-xs font-semibold text-teal-700 dark:text-teal-300 underline hover:text-teal-900"
          >
            Show All Categories
          </button>
        </div>
      )}

      <form onSubmit={handleCreateInvoice} className="space-y-6">
        {/* Step 1: Customer Selection */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Building className="w-4 h-4 text-teal-600" />
            1. Select Customer / Pharmacy
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                Choose Saved Customer
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 text-xs md:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="">-- Choose From List or Enter New Below --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.category === "pharmacy" ? "Medical Store" : c.category.toUpperCase()}) — Udhaar Limit: {formatPKR(c.creditLimit)}
                  </option>
                ))}
              </select>
            </div>

            {!selectedCustomerId && (
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  New Customer / Medical Store Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. LifeCare Pharmacy"
                  value={customCustomerName}
                  onChange={(e) => setCustomCustomerName(e.target.value)}
                  className="w-full px-3 py-2 text-xs md:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Line Items with FEFO Selection */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Barcode className="w-4 h-4 text-teal-600" />
              2. Add Medicines to Bill
            </h2>
            <button
              type="button"
              onClick={handleAddLine}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100"
            >
              <Plus className="w-3.5 h-3.5" />
              + Add Medicine
            </button>
          </div>

          {lines.length === 0 ? (
            <div className="py-8 text-center text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
              <p className="text-xs">No medicines added yet. Click &quot;+ Add Medicine&quot; to begin.</p>
              {selectedCategoryId !== "all" && availableBatches.length === 0 && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-semibold">
                  (Note: No in-stock batches found for category &quot;{activeCategoryObj?.name}&quot;. Switch category or add stock first.)
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs"
                >
                  {/* Batch Selection */}
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Medicine & Batch (Oldest Expiry First)
                    </label>
                    <select
                      value={line.batchId}
                      onChange={(e) => handleUpdateLine(idx, "batchId", e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
                    >
                      {availableBatches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.productName} [Batch: {b.batchNumber} | Exp: {formatKarachiDate(b.expiryDate)} | Stock: {b.remainingQuantity}]
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Qty (Available: {line.availableQuantity})
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={line.availableQuantity}
                      value={line.quantity}
                      onChange={(e) => handleUpdateLine(idx, "quantity", e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-center"
                    />
                  </div>

                  {/* Price */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Price per Box (Rs)
                    </label>
                    <input
                      type="number"
                      value={line.unitPrice}
                      onChange={(e) => handleUpdateLine(idx, "unitPrice", e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-medium"
                    />
                  </div>

                  {/* Line Total */}
                  <div className="sm:col-span-2 text-right">
                    <span className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Total (Rs)</span>
                    <span className="font-extrabold text-teal-600">
                      {formatPKR(line.quantity * line.unitPrice)}
                    </span>
                  </div>

                  {/* Delete */}
                  <div className="sm:col-span-1 text-center">
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Step 3: Payment & Summary */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-teal-600" />
            3. Payment Mode & Due Balance
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold mb-1 text-slate-700 dark:text-slate-300">
                  Payment Mode
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["credit", "cash", "bank_transfer"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 px-3 rounded-lg border font-bold capitalize transition-all ${
                        paymentMethod === m
                          ? "bg-teal-50 dark:bg-teal-950/60 border-teal-500 text-teal-700 dark:text-teal-300"
                          : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {m === "credit" ? "Udhaar (Credit)" : m === "cash" ? "Cash" : "Bank Transfer"}
                    </button>
                  ))}
                </div>
                {paymentMethod === "credit" && (
                  <p className="text-[11px] text-teal-600 mt-1 flex items-center gap-1 font-medium">
                    <Clock className="w-3.5 h-3.5" />
                    Udhaar bill selected. 30 days due payment.
                  </p>
                )}
              </div>

              {paymentMethod === "credit" && (
                <div>
                  <label className="block font-semibold mb-1">Cash Paid Right Now (Rs)</label>
                  <input
                    type="number"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold mb-1">Bill / Delivery Note</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional delivery instructions or customer note..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            {/* Totals Box */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Medicines Subtotal:</span>
                <span className="font-semibold">{formatPKR(subtotal)}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Delivery / Transport:</span>
                <span className="font-semibold">{formatPKR(deliveryCharge)}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-slate-900 dark:text-slate-100 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>Total Bill Amount:</span>
                <span className="text-teal-600">{formatPKR(netTotal)}</span>
              </div>
              <div className="flex justify-between text-emerald-600 font-semibold">
                <span>Cash Paid Now:</span>
                <span>{formatPKR(effectivePaid)}</span>
              </div>
              <div className="flex justify-between text-rose-600 font-extrabold text-sm">
                <span>Remaining Udhaar (Baqaya):</span>
                <span>{formatPKR(outstandingBalance)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/"
            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </Link>

          <button
            type="submit"
            disabled={isSubmitting || lines.length === 0}
            className="px-6 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50"
          >
            {isSubmitting ? "Saving Bill..." : "Save & Print Bill"}
          </button>
        </div>
      </form>
    </div>
  );
}
