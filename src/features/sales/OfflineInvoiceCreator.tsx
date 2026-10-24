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
  Search,
  X,
  PackageCheck,
  Check,
  DollarSign,
  Boxes,
} from "lucide-react";
import { formatPKR, formatKarachiDate, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { generateCollisionSafeInvoiceReference, getDeviceId } from "@/lib/offline/device";
import { enqueueOperation } from "@/lib/offline/outbox";
import { syncManager } from "@/lib/offline/sync";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import type {
  Customer,
  InventoryBatch,
  Invoice,
  InvoiceLine,
  CustomerCategory,
  Product,
  ProductPricing,
  BusinessSettings,
} from "@/types";

export function OfflineInvoiceCreator() {
  const router = useRouter();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const { currentUser } = useAuth();

  // Master Data State
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pricings, setPricings] = useState<ProductPricing[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  // Invoice Form State
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

  // Duplicate product warning & highlight
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [highlightedLineIndex, setHighlightedLineIndex] = useState<number | null>(null);

  // Product Selection Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Load available local records safely
  const loadMasterData = async () => {
    try {
      const [custList, allBatches, prodList, pricingList, settingsRecord] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.inventoryBatches.toArray(),
        offlineDb.products.toArray(),
        offlineDb.productPricing.toArray(),
        offlineDb.settings.get("primary"),
      ]);

      setCustomers(custList || []);
      // Filter batches with remainingQuantity > 0 safely in-memory
      const validBatches = (allBatches || []).filter((b) => Number(b.remainingQuantity || 0) > 0);
      setBatches(validBatches);
      setProducts(prodList || []);
      setPricings(pricingList || []);
      if (settingsRecord) setBusinessSettings(settingsRecord);
    } catch (err) {
      console.error("Failed to load master data in OfflineInvoiceCreator:", err);
    }
  };

  useEffect(() => {
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

  const availableProducts =
    selectedCategoryId === "all"
      ? products
      : products.filter((p) => p.categoryId === selectedCategoryId);

  const activeCategoryObj =
    selectedCategoryId === "all" ? null : categories.find((c) => c.id === selectedCategoryId);

  // Filtered products inside Medicine Selection Modal
  const modalProducts = (selectedCategoryId === "all" ? products : availableProducts).filter((p) => {
    if (!productSearch.trim()) return true;
    const q = productSearch.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.genericName && p.genericName.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.includes(q))
    );
  });

  // Add line item from modal selection
  const handleSelectProduct = (prod: Product, specificBatch?: InventoryBatch) => {
    // 0. Prevent duplicate product in the same invoice
    const existingIndex = lines.findIndex((l) => l.productId === prod.id);
    if (existingIndex !== -1) {
      setDuplicateWarning(
        `"${prod.name}" pehle se is invoice mein shamil hai! Duplicate row add nahi ki ja sakti. Quantity barhane ke liye maujuda line item ko update karein.`
      );
      setHighlightedLineIndex(existingIndex);
      setTimeout(() => {
        setHighlightedLineIndex(null);
      }, 5000);
      return;
    }

    // 1. Find product's pricing
    const pricing = pricings.find((p) => p.productId === prod.id);
    const defaultPrice = pricing?.tradePricePerPack || pricing?.mrpPerPack || 0;

    // 2. Find batches for this product (FEFO)
    const prodBatches = batches
      .filter((b) => b.productId === prod.id && Number(b.remainingQuantity || 0) > 0)
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    const chosenBatch = specificBatch || prodBatches[0];

    const batchId = chosenBatch ? chosenBatch.id : `bch_gen_${prod.id}`;
    const batchNumber = chosenBatch ? chosenBatch.batchNumber : "GEN-STOCK";
    const expiryDate = chosenBatch
      ? chosenBatch.expiryDate
      : new Date(Date.now() + 2 * 365 * 86400000).toISOString().slice(0, 10);
    const availableQty = chosenBatch ? Number(chosenBatch.remainingQuantity) : 999;

    setLines([
      ...lines,
      {
        productId: prod.id,
        productName: prod.name,
        packSize: prod.packSize || "1 Pack",
        batchId,
        batchNumber,
        expiryDate,
        availableQuantity: availableQty,
        quantity: 1,
        unitPrice: defaultPrice,
        discountPercent: 0,
      },
    ]);

    setDuplicateWarning(null);
    setIsProductModalOpen(false);
    setProductSearch("");
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleUpdateLine = (index: number, field: string, value: unknown) => {
    const updated = [...lines];
    const current = { ...updated[index] };

    if (field === "batchId") {
      const selectedBatch = batches.find((b) => b.id === value);
      if (selectedBatch) {
        current.batchId = selectedBatch.id;
        current.batchNumber = selectedBatch.batchNumber;
        current.expiryDate = selectedBatch.expiryDate;
        current.availableQuantity = Number(selectedBatch.remainingQuantity || 0);
        if (current.quantity > current.availableQuantity) {
          current.quantity = Math.max(1, current.availableQuantity);
        }
      }
    } else if (field === "quantity") {
      const qty = Math.max(1, Number(value) || 1);
      current.quantity = current.availableQuantity > 0 ? Math.min(qty, current.availableQuantity) : qty;
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
      alert("Please add at least one medicine line.");
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
      const creditDays = businessSettings?.defaultCreditTermsDays || 30;
      const dueDate = new Date(now.getTime() + creditDays * 24 * 3600 * 1000).toISOString();

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

      const currentUserId = currentUser?.id || "usr_admin";
      const currentUserName = currentUser?.displayName || "System Administrator";

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
        salesRepId: currentUserId,
        salesRepName: currentUserName,
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
              const newRemaining = Math.max(0, Number(batch.remainingQuantity || 0) - line.quantity);
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
                userId: currentUserId,
                userName: currentUserName,
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
              recordedByUserId: currentUserId,
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
            currentUserId,
            currentUserName
          );
        }
      );

      setCreatedInvoice(newInvoice);
      await loadMasterData();
      syncManager.syncNow();
    } catch (err) {
      console.error("Failed to commit offline invoice transaction:", err);
      alert("Failed to save invoice locally. Check browser storage permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // If invoice is successfully created, render printable Enterprise Receipt view
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
            deducted immediately.
          </div>
        </div>

        {/* Printable Official Invoice Card */}
        <div className="print-page p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-6 text-slate-900 dark:text-slate-100">
          {/* Header with Print Logo support */}
          <div className="flex justify-between items-start pb-6 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3">
              {businessSettings?.invoiceLogoUrl && (
                <img
                  src={businessSettings.invoiceLogoUrl}
                  alt="Invoice Logo"
                  className="h-12 w-auto max-w-[140px] object-contain shrink-0"
                />
              )}
              <div>
                <div className="text-xl font-extrabold tracking-tight">
                  {businessSettings?.brandName || "NOXDERMA PHARMA"}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {businessSettings?.address || "Plot 42, Industrial Sector 7, Karachi"}
                </p>
                <p className="text-xs text-slate-500">
                  Phone: {businessSettings?.contactPhone || "+92 300 1234567"} &bull;{" "}
                  {businessSettings?.email || "info@noxderma.com"}
                </p>
              </div>
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
              <p className="text-[11px] text-slate-500">
                Due Date: {formatKarachiDate(createdInvoice.dueDate)}
              </p>
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
                    ? "Partial Paid"
                    : "Unpaid (Udhaar)"}
                </span>
              </p>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 border-y border-slate-200 dark:border-slate-700 font-bold text-slate-500">
                <tr>
                  <th className="py-2.5 px-3">Item Name</th>
                  <th className="py-2.5 px-3">Batch & Expiry</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {createdInvoice.lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                      {line.productName}
                      <span className="block text-[10px] text-slate-400 font-normal">{line.packSize}</span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {line.batchAllocations?.[0]?.batchNumber || "GEN"} &bull;{" "}
                      {line.batchAllocations?.[0]?.expiryDate ? formatKarachiDate(line.batchAllocations[0].expiryDate) : "N/A"}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold">{line.quantity}</td>
                    <td className="py-2.5 px-3 text-right font-mono">{formatPKR(line.unitPrice)}</td>
                    <td className="py-2.5 px-3 text-right font-bold font-mono">{formatPKR(line.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Box */}
          <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="w-64 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Gross Total:</span>
                <span className="font-mono">{formatPKR(createdInvoice.subtotal)}</span>
              </div>
              {createdInvoice.invoiceDiscountAmount > 0 && (
                <div className="flex justify-between text-rose-500 font-semibold">
                  <span>Discount:</span>
                  <span className="font-mono">-{formatPKR(createdInvoice.invoiceDiscountAmount)}</span>
                </div>
              )}
              {createdInvoice.deliveryCharge > 0 && (
                <div className="flex justify-between text-slate-500">
                  <span>Delivery Charge:</span>
                  <span className="font-mono">{formatPKR(createdInvoice.deliveryCharge)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-teal-600 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>Net Payable:</span>
                <span className="font-mono">{formatPKR(createdInvoice.netTotal)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold text-emerald-600">
                <span>Amount Paid:</span>
                <span className="font-mono">{formatPKR(createdInvoice.paidAmount)}</span>
              </div>
              {createdInvoice.outstandingBalance > 0 && (
                <div className="flex justify-between text-xs font-bold text-rose-600 pt-1">
                  <span>Balance (Udhaar):</span>
                  <span className="font-mono">{formatPKR(createdInvoice.outstandingBalance)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 text-center">
            {businessSettings?.invoiceFooter || "Thank you for partnering with Noxderma. Distributed with integrity."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/sales/invoices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Customer Bills
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Receipt className="w-6 h-6 text-teal-600" />
            Make Customer Bill (Invoice)
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Works 100% offline without internet. Real-time warehouse inventory and FEFO batch selection.
          </p>
        </div>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Bill restricted to category: <strong>{activeCategoryObj?.name || "Selected Category"}</strong> ({availableBatches.length} batches in stock)
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedCategoryId("all")}
            className="text-xs font-bold text-teal-700 dark:text-teal-300 underline hover:text-teal-900"
          >
            Show All Categories (Tamam Medicines)
          </button>
        </div>
      )}

      <form onSubmit={handleCreateInvoice} className="space-y-6">
        {/* Step 1: Customer Selection */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Building className="w-4 h-4 text-teal-600" />
            1. Select Customer / Pharmacy
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-bold mb-1.5 text-slate-700 dark:text-slate-300">
                Choose Saved Customer
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium"
              >
                <option value="">-- Choose From List or Enter New Below --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.category === "pharmacy" ? "Medical Store" : c.category.toUpperCase()}) &bull; Udhaar Limit: {formatPKR(c.creditLimit)}
                  </option>
                ))}
              </select>
            </div>

            {!selectedCustomerId && (
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5 text-slate-700 dark:text-slate-300">
                  New Customer / Medical Store Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. LifeCare Pharmacy"
                  value={customCustomerName}
                  onChange={(e) => setCustomCustomerName(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 placeholder-slate-400"
                />
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Line Items with FEFO Selection */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Barcode className="w-4 h-4 text-teal-600" />
              2. Add Medicines to Bill
            </h2>
            <button
              type="button"
              onClick={() => {
                setDuplicateWarning(null);
                setIsProductModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-bold shadow-md shadow-teal-600/20 transition-all btn-interactive"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              Add Medicine
            </button>
          </div>

          {/* Duplicate Product Warning Banner */}
          {duplicateWarning && (
            <div className="p-3.5 sm:p-4 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2.5 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>{duplicateWarning}</span>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateWarning(null)}
                className="p-1 text-amber-600 hover:text-amber-800 dark:hover:text-amber-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {lines.length === 0 ? (
            <div className="py-10 text-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <p className="text-sm font-medium">No medicines added yet. Tap &quot;Add Medicine&quot; to pick from your catalog.</p>
              <button
                type="button"
                onClick={() => {
                  setDuplicateWarning(null);
                  setIsProductModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-sm font-bold hover:bg-teal-100 btn-interactive"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                Add Medicine
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line, idx) => {
                // Find all available batches for this product
                const itemBatches = batches.filter((b) => b.productId === line.productId && Number(b.remainingQuantity || 0) > 0);
                const isHighlighted = idx === highlightedLineIndex;

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-center text-xs sm:text-sm card-interactive transition-all ${
                      isHighlighted
                        ? "border-amber-500 ring-4 ring-amber-500/30 bg-amber-50/80 dark:bg-amber-950/60"
                        : "border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                    }`}
                  >
                    {/* Medicine & Batch Selection */}
                    <div className="sm:col-span-5">
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                        Medicine & Batch ({line.productName})
                      </label>
                      {itemBatches.length > 1 ? (
                        <select
                          value={line.batchId}
                          onChange={(e) => handleUpdateLine(idx, "batchId", e.target.value)}
                          className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-sm"
                        >
                          {itemBatches.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.batchNumber} &bull; Exp: {formatKarachiDate(b.expiryDate)} &bull; Left: {b.remainingQuantity}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="px-3 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                          <span className="font-bold text-sm">{line.productName}</span>
                          <span className="text-xs text-teal-600 font-mono font-bold">
                            Batch: {line.batchNumber} (Stock: {line.availableQuantity})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                        Qty (Stock: {line.availableQuantity})
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={line.availableQuantity}
                        value={line.quantity}
                        onChange={(e) => handleUpdateLine(idx, "quantity", e.target.value)}
                        className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-center text-base"
                      />
                    </div>

                    {/* Price */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                        Price (PKR)
                      </label>
                      <input
                        type="number"
                        value={line.unitPrice}
                        onChange={(e) => handleUpdateLine(idx, "unitPrice", e.target.value)}
                        className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono font-bold text-sm sm:text-base"
                      />
                    </div>

                    {/* Line Total */}
                    <div className="sm:col-span-2 text-right">
                      <span className="block text-xs font-bold uppercase text-slate-400 mb-1">Total (Rs)</span>
                      <span className="font-extrabold text-base sm:text-lg font-mono text-teal-600">
                        {formatPKR(line.quantity * line.unitPrice)}
                      </span>
                    </div>

                    {/* Delete */}
                    <div className="sm:col-span-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        aria-label="Remove medicine"
                        className="p-2.5 min-h-[42px] min-w-[42px] text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors btn-interactive inline-flex items-center justify-center"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step 3: Payment & Summary */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-teal-600" />
            3. Payment Method & Summary
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-bold mb-1.5">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold"
              >
                <option value="credit">Market Udhaar (Credit 30 Days)</option>
                <option value="cash">Cash on Delivery (Naqad)</option>
                <option value="bank_transfer">Bank Transfer (Meezan / HBL)</option>
              </select>
            </div>

            {paymentMethod === "credit" && (
              <div>
                <label className="block text-xs sm:text-sm font-bold mb-1.5">Cash Collected Now (Advance)</label>
                <input
                  type="number"
                  min={0}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(Number(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono text-emerald-600"
                />
              </div>
            )}

            <div>
              <label className="block text-xs sm:text-sm font-bold mb-1.5">Extra Discount (PKR)</label>
              <input
                type="number"
                min={0}
                value={invoiceDiscount}
                onChange={(e) => setInvoiceDiscount(Number(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-semibold"
              />
            </div>
          </div>

          {/* Totals Summary */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Gross Total:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatPKR(subtotal)}</span>
            </div>
            {invoiceDiscount > 0 && (
              <div className="flex justify-between text-rose-500 font-semibold">
                <span>Total Discount:</span>
                <span className="font-mono">-{formatPKR(invoiceDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg sm:text-xl font-extrabold text-teal-600 pt-2 border-t border-slate-200 dark:border-slate-700">
              <span>Net Bill Total:</span>
              <span className="font-mono">{formatPKR(netTotal)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold text-emerald-600">
              <span>Paid Right Now:</span>
              <span className="font-mono">{formatPKR(effectivePaid)}</span>
            </div>
            {outstandingBalance > 0 && (
              <div className="flex justify-between text-sm font-bold text-rose-600">
                <span>Remaining Market Udhaar (Baqaya):</span>
                <span className="font-mono">{formatPKR(outstandingBalance)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Submit */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
          <Link
            href="/sales/invoices"
            className="px-5 py-3 min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm text-center flex items-center justify-center btn-interactive"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || lines.length === 0}
            className="px-8 py-3 min-h-[48px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-teal-600/30 transition-all disabled:opacity-50 btn-interactive flex items-center justify-center"
          >
            {isSubmitting ? "Saving Bill Offline..." : "Create & Save Bill (Invoice)"}
          </button>
        </div>
      </form>

      {/* Product & Stock Selector Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
                  <PackageCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    Select Medicine to Add to Bill
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Click any product to add with FEFO oldest-expiry batch and trade price.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsProductModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Filter Notice inside modal */}
            {selectedCategoryId !== "all" && (
              <div className="px-4 py-2 bg-teal-50 dark:bg-teal-950/40 border-b border-teal-200/60 dark:border-teal-900 flex items-center justify-between text-xs">
                <span className="text-teal-800 dark:text-teal-200">
                  Showing category: <strong>{activeCategoryObj?.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId("all")}
                  className="font-bold text-teal-600 dark:text-teal-300 underline"
                >
                  Show All Categories
                </button>
              </div>
            )}

            {/* Search Box */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search medicine name, formula, SKU, or barcode..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 min-h-[46px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* In-Modal Duplicate Product Warning */}
            {duplicateWarning && (
              <div className="mx-4 mt-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs sm:text-sm font-bold flex items-center justify-between gap-2.5 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>{duplicateWarning}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning(null)}
                  className="p-1 text-amber-600 hover:text-amber-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Products List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5">
              {modalProducts.length === 0 ? (
                <div className="py-10 text-center text-slate-400 space-y-3">
                  <p className="text-sm font-medium">No medicines found matching &quot;{productSearch}&quot;.</p>
                  <Link
                    href="/products"
                    className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[42px] rounded-xl bg-teal-600 text-white text-sm font-bold btn-interactive shadow-md shadow-teal-600/20"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    Add Product in Catalog First
                  </Link>
                </div>
              ) : (
                modalProducts.map((prod) => {
                  const pricing = pricings.find((p) => p.productId === prod.id);
                  const price = pricing?.tradePricePerPack || pricing?.mrpPerPack || 0;
                  const isAlreadyInInvoice = lines.some((l) => l.productId === prod.id);

                  // Find in-stock batches
                  const prodBatches = batches.filter(
                    (b) => b.productId === prod.id && Number(b.remainingQuantity || 0) > 0
                  );
                  const totalStock = prodBatches.reduce(
                    (sum, b) => sum + Number(b.remainingQuantity || 0),
                    0
                  );

                  return (
                    <div
                      key={prod.id}
                      onClick={() => handleSelectProduct(prod)}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs sm:text-sm card-interactive active:scale-[0.99] min-h-[60px] ${
                        isAlreadyInInvoice
                          ? "border-amber-300 dark:border-amber-700/80 bg-amber-50/30 dark:bg-amber-950/20 hover:border-amber-400"
                          : "border-slate-200/90 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50/20 dark:hover:bg-teal-950/20"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base text-slate-900 dark:text-slate-100">
                            {prod.name}
                          </span>
                          <span className="text-xs text-slate-400 font-mono font-medium">
                            {prod.packSize || "1 Pack"}
                          </span>
                          {isAlreadyInInvoice && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-amber-600" />
                              Pehle se Shamil Hai (In Bill)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {prod.genericName || prod.categoryName} &bull; SKU: {prod.sku}
                        </div>
                        {prodBatches.length > 0 && (
                          <div className="text-xs text-teal-600 dark:text-teal-400 mt-1 font-mono font-semibold">
                            Earliest Batch: {prodBatches[0].batchNumber} (Exp:{" "}
                            {formatKarachiDate(prodBatches[0].expiryDate)})
                          </div>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono font-extrabold text-base text-slate-900 dark:text-slate-100">
                          {formatPKR(price)}
                        </div>
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold font-mono mt-1 ${
                            totalStock > 0
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {totalStock > 0 ? `${totalStock} in Stock` : "Add Custom Batch"}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
