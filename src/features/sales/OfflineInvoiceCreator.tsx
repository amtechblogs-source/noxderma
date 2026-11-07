"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
  Pill,
  MapPin,
  Mail,
  Pencil,
} from "lucide-react";
import { formatPKR, formatKarachiDate, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { generateCollisionSafeInvoiceReference, getDeviceId } from "@/lib/offline/device";
import { enqueueOperation } from "@/lib/offline/outbox";
import { syncManager } from "@/lib/offline/sync";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import { OfficialPrintHeader } from "@/components/common/OfficialPrintHeader";
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

// Helper: Resolve product image from various schemas (images array, imageUrl, image, thumbnailUrl)
export function getProductImageUrl(prod?: Product | null): string {
  if (!prod) return "";
  const pAny = prod as unknown as Record<string, unknown>;

  // 1. Array of images
  if (Array.isArray(prod.images) && prod.images.length > 0) {
    const primary = prod.images.find((img) => img && typeof img === "object" && (img as any).isPrimary);
    if (primary && typeof (primary as any).url === "string" && (primary as any).url.trim()) {
      return (primary as any).url.trim();
    }
    const first = prod.images[0] as unknown;
    if (first) {
      if (typeof first === "string" && (first as string).trim()) return (first as string).trim();
      if (typeof (first as Record<string, unknown>).url === "string" && ((first as Record<string, unknown>).url as string).trim()) {
        return ((first as Record<string, unknown>).url as string).trim();
      }
      if (typeof (first as Record<string, unknown>).thumbnailUrl === "string" && ((first as Record<string, unknown>).thumbnailUrl as string).trim()) {
        return ((first as Record<string, unknown>).thumbnailUrl as string).trim();
      }
    }
  }

  // 2. Direct string fields
  if (typeof pAny.imageUrl === "string" && pAny.imageUrl.trim()) return pAny.imageUrl.trim();
  if (typeof pAny.image === "string" && pAny.image.trim()) return pAny.image.trim();
  if (typeof pAny.thumbnailUrl === "string" && pAny.thumbnailUrl.trim()) return pAny.thumbnailUrl.trim();
  if (typeof pAny.photo === "string" && pAny.photo.trim()) return pAny.photo.trim();

  return "";
}

// Helper: Resolve default price with multi-tier fallback (tradePrice > mrp > batch price)
export function getProductDefaultPrice(
  prod?: Product | null,
  pricingsList?: ProductPricing[],
  batch?: InventoryBatch | null
): number {
  if (!prod) return 0;

  // 1. Look in productPricing table
  if (Array.isArray(pricingsList)) {
    const pricing = pricingsList.find(
      (p) => String(p.productId).trim() === String(prod.id).trim()
    );
    if (pricing) {
      if (Number(pricing.tradePricePerPack) > 0) return Number(pricing.tradePricePerPack);
      if (Number(pricing.mrpPerPack) > 0) return Number(pricing.mrpPerPack);
      if (Number(pricing.distributorPricePerPack) > 0) return Number(pricing.distributorPricePerPack);
      if (Number(pricing.purchaseCostPerPack) > 0) return Number(pricing.purchaseCostPerPack);
    }
  }

  // 2. Look in product direct fields
  const pAny = prod as unknown as Record<string, unknown>;
  const directFields = [
    pAny.tradePricePerPack,
    pAny.tradePrice,
    pAny.mrpPerPack,
    pAny.mrp,
    pAny.price,
    pAny.salePrice,
    pAny.unitPrice,
    pAny.distributorPricePerPack,
    pAny.purchaseCostPerPack,
    pAny.costPrice,
  ];
  for (const field of directFields) {
    const num = Number(field);
    if (!isNaN(num) && num > 0) return num;
  }

  // 3. Look in batch pricing
  if (batch) {
    const bAny = batch as unknown as Record<string, unknown>;
    const batchFields = [bAny.tradePrice, bAny.price, bAny.mrp, bAny.purchasePrice, bAny.costPrice];
    for (const field of batchFields) {
      const num = Number(field);
      if (!isNaN(num) && num > 0) return num;
    }
  }

  return 0;
}

export interface OfflineInvoiceCreatorProps {
  editInvoiceId?: string;
}

export function OfflineInvoiceCreator({ editInvoiceId: propEditId }: OfflineInvoiceCreatorProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editInvoiceId = propEditId || searchParams?.get("id") || searchParams?.get("editId") || undefined;
  const initialCustomerId = searchParams?.get("customerId") || undefined;

  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const { currentUser } = useAuth();

  // Edit Mode State
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);
  const [isLoadingInvoice, setIsLoadingInvoice] = useState<boolean>(!!editInvoiceId);
  const [invoiceNotFound, setInvoiceNotFound] = useState<boolean>(false);

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
      imageUrl?: string;
      packSize: string;
      batchId: string;
      batchNumber: string;
      expiryDate: string;
      availableQuantity: number;
      quantity: number; // Paid Qty
      bonusQuantity: number; // Free promotional bonus units (e.g. 5+1)
      extraDiscountPercent: number; // Line extra discount percentage
      unitPrice: number;
      discountPercent: number;
    }>
  >([]);

  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank_transfer" | "credit">("credit");
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [deliveryCharge, setDeliveryCharge] = useState<number>(0);
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [notes, setNotes] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null);

  // Duplicate product warning & highlight
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [highlightedLineIndex, setHighlightedLineIndex] = useState<number | null>(null);

  // Product Selection Modal State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Helper to compute effective available quantity for a batch, accounting for already-allocated items in edit mode
  const getBatchEffectiveAvailable = (batchId: string, currentBatchRem: number) => {
    let extra = 0;
    if (originalInvoice) {
      for (const l of originalInvoice.lines || []) {
        for (const a of l.batchAllocations || []) {
          if (a.batchId === batchId) {
            extra += Number(a.quantity || 0);
          }
        }
      }
    }
    return currentBatchRem + extra;
  };

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
      setProducts(prodList || []);
      setPricings(pricingList || []);

      let invToEdit: Invoice | null = null;
      if (editInvoiceId) {
        setIsLoadingInvoice(true);
        const existing = await offlineDb.invoices.get(editInvoiceId);
        if (existing) {
          invToEdit = existing;
          setOriginalInvoice(existing);
          setSelectedCustomerId(existing.customerId || "");
          setCustomCustomerName(existing.customerName || "");
          setCustomCustomerCategory(existing.customerCategory || "pharmacy");
          setCustomCustomerPhone(existing.customerPhone || "");
          setCustomCustomerAddress(existing.customerAddress || "");
          setPaymentMethod(existing.paymentMethod === "split" ? "credit" : (existing.paymentMethod || "credit"));
          setPaidAmount(existing.paidAmount || 0);
          setDeliveryCharge(existing.deliveryCharge || 0);
          setNotes(existing.notes || "");

          if (existing.invoiceDiscountPercentage && existing.invoiceDiscountPercentage > 0) {
            setDiscountType("percentage");
            setDiscountPercent(existing.invoiceDiscountPercentage);
            setInvoiceDiscount(0);
          } else {
            setDiscountType("fixed");
            setDiscountPercent(0);
            setInvoiceDiscount(existing.invoiceDiscountAmount || 0);
          }

          // Populate lines with effective available quantities
          const mappedLines = (existing.lines || []).map((l) => {
            const alloc = l.batchAllocations?.[0];
            const batchId = alloc?.batchId || "";
            const batch = (allBatches || []).find((b) => b.id === batchId);
            const currentRem = Number(batch?.remainingQuantity || 0);
            const allocatedOnThisInvoice = Number(alloc?.quantity || l.quantity || 0);
            const effectiveAvail = currentRem + allocatedOnThisInvoice;

            return {
              productId: l.productId,
              productName: l.productName,
              imageUrl: l.imageUrl || getProductImageUrl((prodList || []).find((p) => p.id === l.productId)),
              packSize: l.packSize || "1 Pack",
              batchId: batchId || `bch_${l.productId}`,
              batchNumber: alloc?.batchNumber || "BATCH",
              expiryDate: alloc?.expiryDate || "",
              availableQuantity: effectiveAvail > 0 ? effectiveAvail : 999,
              quantity: l.quantity,
              bonusQuantity: l.bonusQuantity || 0,
              extraDiscountPercent: l.extraDiscountPercent || l.lineDiscountPercentage || 0,
              unitPrice: l.unitPrice,
              discountPercent: l.lineDiscountPercentage || 0,
            };
          });
          setLines(mappedLines);
        } else {
          setInvoiceNotFound(true);
        }
        setIsLoadingInvoice(false);
      } else if (initialCustomerId) {
        // Pre-select customer if customerId passed in query
        const found = custList?.find((c) => c.id === initialCustomerId);
        if (found) {
          setSelectedCustomerId(found.id);
          setCustomCustomerName(found.name || "");
          setCustomCustomerPhone(found.phone || "");
          setCustomCustomerAddress(found.address || "");
          setCustomCustomerCategory(found.category || "pharmacy");
        }
      }

      // Filter batches: batches with remainingQuantity > 0 OR allocated in the invoice being edited
      const validBatches = (allBatches || []).filter((b) => {
        const isAllocatedInEdit = invToEdit?.lines?.some((l) =>
          l.batchAllocations?.some((a) => a.batchId === b.id)
        );
        return Number(b.remainingQuantity || 0) > 0 || !!isAllocatedInEdit;
      });
      setBatches(validBatches);

      if (settingsRecord) {
        setBusinessSettings(settingsRecord);
      } else {
        try {
          const res = await fetch("/api/settings");
          if (res.ok) {
            const data = await res.json();
            if (data?.settings) {
              setBusinessSettings(data.settings);
              if (!data.isDefaultFallback) {
                await offlineDb.settings.put(data.settings);
              }
            }
          }
        } catch {}
      }
    } catch (err) {
      console.error("Failed to load master data in OfflineInvoiceCreator:", err);
      setIsLoadingInvoice(false);
    }
  };

  useEffect(() => {
    loadMasterData();
    const handleCloudSynced = async () => {
      try {
        const [custList, allBatches, prodList, pricingList, settingsRecord] = await Promise.all([
          offlineDb.customers.toArray(),
          offlineDb.inventoryBatches.toArray(),
          offlineDb.products.toArray(),
          offlineDb.productPricing.toArray(),
          offlineDb.settings.get("primary"),
        ]);
        setCustomers(custList || []);
        setProducts(prodList || []);
        setPricings(pricingList || []);
        if (settingsRecord) setBusinessSettings(settingsRecord);
        const validBatches = (allBatches || []).filter(
          (b) => Number(b.remainingQuantity || 0) > 0
        );
        setBatches(validBatches);
      } catch {}
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, [editInvoiceId]);

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

    // 1. Find batches for this product (FEFO)
    const prodBatches = batches
      .filter((b) => {
        if (b.productId !== prod.id) return false;
        const eff = getBatchEffectiveAvailable(b.id, Number(b.remainingQuantity || 0));
        return eff > 0;
      })
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

    const chosenBatch = specificBatch || prodBatches[0];

    // 2. Auto-fetch product's pricing & image with comprehensive fallbacks
    const defaultPrice = getProductDefaultPrice(prod, pricings, chosenBatch);
    const primaryImg = getProductImageUrl(prod);

    const batchId = chosenBatch ? chosenBatch.id : `bch_gen_${prod.id}`;
    const batchNumber = chosenBatch ? chosenBatch.batchNumber : "GEN-STOCK";
    const expiryDate = chosenBatch
      ? chosenBatch.expiryDate
      : new Date(Date.now() + 2 * 365 * 86400000).toISOString().slice(0, 10);
    const availableQty = chosenBatch
      ? getBatchEffectiveAvailable(chosenBatch.id, Number(chosenBatch.remainingQuantity || 0))
      : 999;

    setLines([
      ...lines,
      {
        productId: prod.id,
        productName: prod.name,
        imageUrl: primaryImg,
        packSize: prod.packSize || "1 Pack",
        batchId,
        batchNumber,
        expiryDate,
        availableQuantity: availableQty,
        quantity: 1,
        bonusQuantity: 0,
        extraDiscountPercent: 0,
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
        const effAvail = getBatchEffectiveAvailable(selectedBatch.id, Number(selectedBatch.remainingQuantity || 0));
        current.batchId = selectedBatch.id;
        current.batchNumber = selectedBatch.batchNumber;
        current.expiryDate = selectedBatch.expiryDate;
        current.availableQuantity = effAvail;
        if (current.quantity > current.availableQuantity && effAvail > 0) {
          current.quantity = Math.max(1, current.availableQuantity);
        }
      }
    } else if (field === "quantity") {
      const raw = typeof value === "string" ? value.replace(/^0+(?=\d)/, "") : value;
      const qty = raw === "" ? 0 : Number(raw);
      current.quantity = isNaN(qty) ? 0 : Math.max(0, qty);
    } else if (field === "bonusQuantity") {
      const raw = typeof value === "string" ? value.replace(/^0+(?=\d)/, "") : value;
      const bQty = raw === "" ? 0 : Number(raw);
      current.bonusQuantity = isNaN(bQty) ? 0 : Math.max(0, bQty);
    } else if (field === "extraDiscountPercent" || field === "discountPercent") {
      const raw = typeof value === "string" ? value.replace(/^0+(?=\d)/, "") : value;
      const pct = raw === "" ? 0 : Number(raw);
      const cleanPct = isNaN(pct) ? 0 : Math.min(100, Math.max(0, pct));
      current.extraDiscountPercent = cleanPct;
      current.discountPercent = cleanPct;
    } else if (field === "unitPrice") {
      const raw = typeof value === "string" ? value.replace(/^0+(?=\d)/, "") : value;
      const price = raw === "" ? 0 : Number(raw);
      current.unitPrice = isNaN(price) ? 0 : Math.max(0, price);
    }

    updated[index] = current;
    setLines(updated);
  };

  // Calculations
  const subtotal = lines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalLineDiscount = lines.reduce(
    (sum, item) => sum + (item.quantity * item.unitPrice * (item.extraDiscountPercent || item.discountPercent || 0)) / 100,
    0
  );
  const totalBonusUnits = lines.reduce((sum, item) => sum + Number(item.bonusQuantity || 0), 0);
  const totalPaidUnits = lines.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const totalDeliveredUnits = totalPaidUnits + totalBonusUnits;

  const eligibleBaseForDiscount = Math.max(0, subtotal - totalLineDiscount);
  const effectiveInvoiceDiscount =
    discountType === "percentage"
      ? Math.round((eligibleBaseForDiscount * (discountPercent || 0)) / 100)
      : invoiceDiscount;
  const totalDiscount = totalLineDiscount + effectiveInvoiceDiscount;
  const netTotal = Math.max(0, subtotal - totalLineDiscount - effectiveInvoiceDiscount + deliveryCharge);
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
    const finalCustomerName =
      customCustomerName.trim() || (selectedCust ? selectedCust.name : "");
    const finalCustomerPhone =
      customCustomerPhone.trim() || (selectedCust?.phone ? selectedCust.phone : "");
    const finalCustomerAddress =
      customCustomerAddress.trim() || (selectedCust?.address ? selectedCust.address : "");

    if (!finalCustomerName) {
      alert("Please provide customer / pharmacy name.");
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
        const bonusQty = Number(l.bonusQuantity || 0);
        const totalDelivered = Number(l.quantity || 0) + bonusQty;
        const lineDiscountPct = Number(l.extraDiscountPercent || l.discountPercent || 0);
        const lineDiscountAmt = (l.quantity * l.unitPrice * lineDiscountPct) / 100;
        const lineTotal = Math.max(0, l.quantity * l.unitPrice - lineDiscountAmt);

        const matchingPricing = pricings.find((p) => p.productId === l.productId);
        const matchingBatch = batches.find((b) => b.id === l.batchId);
        const matchingProd = products.find((p) => p.id === l.productId);
        const unitCost =
          matchingPricing?.purchaseCostPerPack ||
          (matchingBatch as any)?.purchasePrice ||
          (matchingBatch as any)?.unitCost ||
          (matchingProd as any)?.purchaseCostPerPack ||
          (matchingProd as any)?.costPrice ||
          0;

        return {
          id: `line_${idx + 1}`,
          productId: l.productId,
          productName: l.productName,
          packSize: l.packSize,
          imageUrl: l.imageUrl,
          quantity: l.quantity,
          bonusQuantity: bonusQty,
          totalUnitsDelivered: totalDelivered,
          extraDiscountPercent: lineDiscountPct,
          unitPrice: l.unitPrice,
          lineDiscountPercentage: lineDiscountPct,
          lineDiscountAmount: lineDiscountAmt,
          lineTotal,
          batchAllocations: [
            {
              batchId: l.batchId,
              batchNumber: l.batchNumber,
              expiryDate: l.expiryDate,
              quantity: totalDelivered,
              unitCostAtAllocation: Number(unitCost) || 0,
            },
          ],
        };
      });

      const currentUserId = currentUser?.id || "usr_admin";
      const currentUserName = currentUser?.displayName || "Owner";

      if (originalInvoice) {
        // ==========================================
        // EDIT MODE: UPDATE ALREADY SAVED INVOICE
        // ==========================================
        const updatedInvoice: Invoice = {
          ...originalInvoice,
          customerId: selectedCustomerId || "cust_guest",
          customerName: finalCustomerName,
          customerCategory: selectedCust ? selectedCust.category : customCustomerCategory,
          customerPhone: finalCustomerPhone,
          customerAddress: finalCustomerAddress,
          lines: invoiceLines,
          subtotal,
          invoiceDiscountAmount: totalDiscount,
          invoiceDiscountPercentage: discountType === "percentage" ? discountPercent : undefined,
          deliveryCharge,
          grossTotal: subtotal,
          netTotal,
          paidAmount: effectivePaid,
          outstandingBalance,
          paymentStatus: outstandingBalance === 0 ? "paid" : effectivePaid > 0 ? "partially_paid" : "unpaid",
          paymentMethod,
          notes,
          salesRepId: currentUserId,
          salesRepName: currentUserName,
          syncStatus: "pending_sync",
          updatedAt: now.toISOString(),
        };

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
            // 1. Revert previous inventory allocations from originalInvoice
            for (const oldLine of originalInvoice.lines || []) {
              for (const alloc of oldLine.batchAllocations || []) {
                if (alloc.batchId) {
                  const b = await offlineDb.inventoryBatches.get(alloc.batchId);
                  if (b) {
                    const restoredQty = Number(b.remainingQuantity || 0) + Number(alloc.quantity || 0);
                    await offlineDb.inventoryBatches.update(alloc.batchId, {
                      remainingQuantity: restoredQty,
                      updatedAt: now.toISOString(),
                    });

                    await offlineDb.stockMovements.add({
                      id: `mov_rev_${Date.now()}_${alloc.batchId}_${Math.random().toString(36).slice(2, 6)}`,
                      productId: oldLine.productId,
                      productName: oldLine.productName,
                      batchId: alloc.batchId,
                      batchNumber: alloc.batchNumber || b.batchNumber,
                      type: "sales_return",
                      quantityChange: Number(alloc.quantity || 0),
                      balanceAfter: restoredQty,
                      referenceId: originalInvoice.id,
                      referenceType: "invoice",
                      userId: currentUserId,
                      userName: currentUserName,
                      reason: `Reverted allocation for invoice edit: ${originalInvoice.provisionalReference}`,
                      timestamp: now.toISOString(),
                    });
                  }
                }
              }
            }

            // 2. Revert previous customer outstanding balance
            if (originalInvoice.customerId && originalInvoice.outstandingBalance > 0) {
              const oldCust = await offlineDb.customers.get(originalInvoice.customerId);
              if (oldCust) {
                const revertedBal = Math.max(0, (oldCust.currentOutstandingBalance || 0) - originalInvoice.outstandingBalance);
                await offlineDb.customers.update(originalInvoice.customerId, {
                  currentOutstandingBalance: revertedBal,
                  updatedAt: now.toISOString(),
                });
              }
            }

            // 3. Deduct new inventory batches and log movements
            for (const newLine of lines) {
              const b = await offlineDb.inventoryBatches.get(newLine.batchId);
              if (b) {
                const totalUnits = Number(newLine.quantity || 0) + Number(newLine.bonusQuantity || 0);
                const newRemaining = Math.max(0, Number(b.remainingQuantity || 0) - totalUnits);
                await offlineDb.inventoryBatches.update(newLine.batchId, {
                  remainingQuantity: newRemaining,
                  updatedAt: now.toISOString(),
                });

                await offlineDb.stockMovements.add({
                  id: `mov_new_${Date.now()}_${newLine.batchId}_${Math.random().toString(36).slice(2, 6)}`,
                  productId: newLine.productId,
                  productName: newLine.productName,
                  batchId: newLine.batchId,
                  batchNumber: newLine.batchNumber || b.batchNumber,
                  type: "sales_deduction",
                  quantityChange: -totalUnits,
                  balanceAfter: newRemaining,
                  referenceId: originalInvoice.id,
                  referenceType: "invoice",
                  userId: currentUserId,
                  userName: currentUserName,
                  reason: `Deducted for updated invoice: ${originalInvoice.provisionalReference} (${newLine.quantity} paid + ${newLine.bonusQuantity || 0} bonus)`,
                  timestamp: now.toISOString(),
                });
              }
            }

            // 4. Apply new customer balance
            const targetCustomerId = selectedCustomerId || "cust_guest";
            if (targetCustomerId && outstandingBalance > 0) {
              const targetCust = await offlineDb.customers.get(targetCustomerId);
              if (targetCust) {
                const updatedBal = (targetCust.currentOutstandingBalance || 0) + outstandingBalance;
                await offlineDb.customers.update(targetCustomerId, {
                  currentOutstandingBalance: updatedBal,
                  updatedAt: now.toISOString(),
                });
              }
            }

            // 5. Update, record, or remove payment on bill edit
            const allPayments = await offlineDb.payments.toArray();
            const existingPayments = allPayments.filter(
              (p) =>
                (originalInvoice.provisionalReference &&
                  p.referenceNumber === originalInvoice.provisionalReference) ||
                p.allocations?.some((a) => a.invoiceId === originalInvoice.id)
            );

            if (effectivePaid > 0) {
              const payMethodMapped = paymentMethod === "credit" ? "cash" : paymentMethod;

              if (existingPayments.length > 0) {
                await offlineDb.payments.update(existingPayments[0].id, {
                  amount: effectivePaid,
                  customerId: targetCustomerId,
                  customerName: finalCustomerName,
                  paymentMethod: payMethodMapped,
                  allocations: [
                    {
                      invoiceId: originalInvoice.id,
                      invoiceReference: originalInvoice.provisionalReference,
                      amountAllocated: effectivePaid,
                    },
                  ],
                  notes: `Updated on bill edit (${paymentMethod})`,
                });
              } else {
                await offlineDb.payments.add({
                  id: `pay_${Date.now()}`,
                  customerId: targetCustomerId,
                  customerName: finalCustomerName,
                  amount: effectivePaid,
                  paymentDate: now.toISOString().slice(0, 10),
                  paymentMethod: payMethodMapped,
                  referenceNumber: originalInvoice.provisionalReference,
                  allocations: [
                    {
                      invoiceId: originalInvoice.id,
                      invoiceReference: originalInvoice.provisionalReference,
                      amountAllocated: effectivePaid,
                    },
                  ],
                  unallocatedAmount: 0,
                  recordedByUserId: currentUserId,
                  notes: `Payment recorded on bill edit (${paymentMethod})`,
                  syncStatus: "local_only",
                  createdAt: now.toISOString(),
                });
              }
            } else if (existingPayments.length > 0) {
              for (const ep of existingPayments) {
                await offlineDb.payments.delete(ep.id);
              }
            }

            // 6. Put updated invoice
            await offlineDb.invoices.put(updatedInvoice);

            // 7. Enqueue update outbox sync
            await enqueueOperation(
              "invoice",
              originalInvoice.id,
              "update",
              updatedInvoice as unknown as Record<string, unknown>,
              currentUserId,
              currentUserName
            );
          }
        );

        setCreatedInvoice(updatedInvoice);
        await recordActivity({
          userId: currentUserId,
          userName: currentUserName,
          userRole: currentUser?.role || "owner",
          userEmail: currentUser?.email,
          action: "update",
          entityType: "invoice",
          entityId: originalInvoice.id,
          entityTitle: `Bill #${originalInvoice.provisionalReference}`,
          details: `Updated bill for "${finalCustomerName}". Total: PKR ${netTotal.toLocaleString()} (Paid: PKR ${effectivePaid.toLocaleString()}, Baqaya: PKR ${outstandingBalance.toLocaleString()})`,
          snapshotBefore: originalInvoice,
          snapshotAfter: updatedInvoice,
          canUndo: true,
        });
        await loadMasterData();
        syncManager.syncNow();
        return;
      }

      // ==========================================
      // CREATE MODE: BRAND NEW INVOICE
      // ==========================================
      const newInvoice: Invoice = {
        id: invoiceId,
        provisionalReference: provisionalRef,
        customerId: selectedCustomerId || "cust_guest",
        customerName: finalCustomerName,
        customerCategory: selectedCust ? selectedCust.category : customCustomerCategory,
        customerPhone: finalCustomerPhone,
        customerAddress: finalCustomerAddress,
        lines: invoiceLines,
        subtotal,
        invoiceDiscountAmount: totalDiscount,
        invoiceDiscountPercentage: discountType === "percentage" ? discountPercent : undefined,
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
              const totalUnits = Number(line.quantity || 0) + Number(line.bonusQuantity || 0);
              const newRemaining = Math.max(0, Number(batch.remainingQuantity || 0) - totalUnits);
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
                quantityChange: -totalUnits,
                balanceAfter: newRemaining,
                referenceId: invoiceId,
                referenceType: "invoice",
                userId: currentUserId,
                userName: currentUserName,
                reason: `Sold via invoice ${provisionalRef} (${line.quantity} paid + ${line.bonusQuantity || 0} bonus units)`,
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
      await recordActivity({
        userId: currentUserId,
        userName: currentUserName,
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "create",
        entityType: "invoice",
        entityId: invoiceId,
        entityTitle: `Bill #${provisionalRef}`,
        details: `Issued new sale invoice for "${finalCustomerName}" with ${invoiceLines.length} medicine(s) totaling PKR ${netTotal.toLocaleString()}`,
        snapshotAfter: newInvoice,
        canUndo: true,
      });
      await loadMasterData();
      syncManager.syncNow();
    } catch (err) {
      console.error("Failed to commit offline invoice transaction:", err);
      alert("Failed to save invoice locally. Check browser storage permissions.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Guard 1: Loading state when fetching invoice to edit
  if (isLoadingInvoice) {
    return (
      <div className="max-w-md mx-auto p-12 text-center text-slate-500 space-y-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-soft">
        <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Loading invoice for editing...</p>
        <p className="text-xs text-slate-400">Bill ka data IndexedDB se load ho raha hai...</p>
      </div>
    );
  }

  // Guard 2: Invoice not found
  if (invoiceNotFound) {
    return (
      <div className="max-w-md mx-auto p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-4 shadow-soft">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950 text-amber-600 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
          Bill Not Found (بل نہیں ملا)
        </h2>
        <p className="text-xs text-slate-500">
          Yeh bill offline database mein dastyab nahi hai ya shayad delete ho chuka hai.
        </p>
        <Link
          href="/sales/invoices"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Customer Bills (بلز کی لسٹ)
        </Link>
      </div>
    );
  }

  // If invoice is successfully created or updated, render printable Enterprise Receipt view
  if (createdInvoice) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 print:max-w-none print:w-full print:m-0 print:p-0 print:space-y-0 print:bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 no-print print:hidden">
          <Link
            href="/sales/invoices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Customer Bills
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold shadow-sm transition-all btn-interactive"
            >
              <Printer className="w-4 h-4" />
              Print Invoice Now
            </button>
            <Link
              href="/sales/invoices"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold shadow-sm transition-all btn-interactive"
            >
              <Receipt className="w-4 h-4" />
              All Bills (بلز کی لسٹ)
            </Link>
            <button
              onClick={() => {
                setCreatedInvoice(null);
                setOriginalInvoice(null);
                setLines([]);
                setInvoiceDiscount(0);
                setDiscountPercent(0);
                setDiscountType("fixed");
                setSelectedCustomerId("");
                setCustomCustomerName("");
                setCustomCustomerPhone("");
                setCustomCustomerAddress("");
                router.push("/sales/invoices/new");
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-bold shadow-sm transition-all btn-interactive"
            >
              <Plus className="w-4 h-4" />
              Make Another Bill
            </button>
          </div>
        </div>

        {/* Success Alert */}
        <div className="p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs sm:text-sm no-print print:hidden flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-teal-600 shrink-0" />
          <div>
            <strong>
              {originalInvoice
                ? "Bill Updated Successfully! (بل کامیابی سے تبدیل اور اپ ڈیٹ ہو گیا)"
                : "Bill Saved Offline Successfully! (بل کامیابی سے محفوظ ہو گیا)"}
            </strong>{" "}
            Bill No: <span className="font-mono font-bold">{createdInvoice.provisionalReference}</span>.
            {originalInvoice
              ? " Inventory allocations and customer balance have been re-calculated."
              : " Stock deducted immediately."}
          </div>
        </div>

        {/* Printable Official Invoice Card - Optimized for Clean A4 Fit */}
        <div className="print-page p-3.5 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl space-y-5 sm:space-y-6 text-slate-900 dark:text-slate-100 overflow-hidden print:overflow-visible print:p-1 print:m-0 print:border-none print:rounded-none print:shadow-none print:bg-white print:text-black">
          {/* Header with Print Logo support */}
          <OfficialPrintHeader
            title={createdInvoice.paymentMethod === "cash" ? "Cash Invoice" : "Sale Invoice"}
            docRef={createdInvoice.provisionalReference}
            date={createdInvoice.invoiceDate}
            metaItems={[
              ...(createdInvoice.dueDate ? [{ label: "Due Date", value: formatKarachiDate(createdInvoice.dueDate) }] : []),
            ]}
            settings={businessSettings}
            showInPreview={true}
            className="pb-5"
          />

          {/* Customer & Payment Details Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
            <div
              className="invoice-info-card p-3.5 sm:p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:bg-white print:border-slate-400 print:!p-4 min-w-0"
            >
              <span className="text-slate-500 print:text-slate-600 font-black uppercase text-[11px] tracking-wider block">
                CUSTOMER / PHARMACY:
              </span>
              <p className="font-black text-base sm:text-lg text-slate-900 print:text-black mt-1 break-words">
                {createdInvoice.customerName}
              </p>
              {createdInvoice.customerPhone && (
                <div className="flex items-center gap-1.5 font-bold text-slate-700 print:text-black mt-1 text-xs sm:text-sm break-all">
                  <Phone className="w-3.5 h-3.5 text-teal-600 print:text-black shrink-0" />
                  <span>{createdInvoice.customerPhone}</span>
                </div>
              )}
              {createdInvoice.customerAddress && (
                <div className="flex items-center gap-1.5 font-semibold text-slate-700 print:text-slate-800 mt-0.5 text-xs sm:text-sm break-words">
                  <MapPin className="w-3.5 h-3.5 text-teal-600 print:text-black shrink-0" />
                  <span>{createdInvoice.customerAddress}</span>
                </div>
              )}
            </div>
            <div
              className="invoice-info-card p-3.5 sm:p-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 print:bg-white print:border-slate-400 print:!p-4 min-w-0"
            >
              <span className="text-slate-500 print:text-slate-600 font-black uppercase text-[11px] tracking-wider block">
                PAYMENT DETAILS:
              </span>
              <p className="font-black text-base sm:text-lg text-slate-900 print:text-black capitalize mt-1">
                Paid Via: {createdInvoice.paymentMethod === "credit" ? "Udhaar (Credit)" : createdInvoice.paymentMethod?.replace("_", " ")}
              </p>
              <p className="font-bold text-slate-700 print:text-black mt-0.5">
                Payment Status:{" "}
                <span className="font-black text-teal-700 print:text-black uppercase">
                  {createdInvoice.paymentStatus === "paid"
                    ? "FULL PAID"
                    : createdInvoice.paymentStatus === "partially_paid"
                    ? "PARTIAL PAID"
                    : "UNPAID (UDHAAR)"}
                </span>
              </p>
            </div>
          </div>

          {/* Line Items Table with Product Images & High-Contrast Typography */}
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-left border-collapse">
              <thead className="border-y-2 border-slate-900 bg-slate-100 dark:bg-slate-800 print:bg-slate-100 text-slate-900 print:text-black font-black text-xs sm:text-sm uppercase">
                <tr>
                  <th className="py-2.5 px-3">Item Details</th>
                  <th className="py-2.5 px-3 text-center">Qty</th>
                  <th className="py-2.5 px-3 text-right">Price (PKR)</th>
                  <th className="py-2.5 px-3 text-right">Total (PKR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 print:divide-slate-300 text-xs sm:text-sm">
                {createdInvoice.lines.map((line, idx) => {
                  const lineImg =
                    line.imageUrl ||
                    getProductImageUrl(products.find((p) => p.id === line.productId));

                  return (
                    <tr key={idx} className="border-b border-slate-200 dark:border-slate-800 print:border-slate-300">
                      <td className="py-2.5 px-3 text-slate-900 print:text-black">
                        <div className="flex items-center gap-3">
                          {lineImg ? (
                            <img
                              src={lineImg}
                              alt={line.productName}
                              className="w-10 h-10 object-contain rounded-lg border border-slate-200 bg-white p-0.5 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
                              <Pill className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                          <div>
                            <span className="font-black text-sm sm:text-base text-slate-900 print:text-black block leading-tight">
                              {line.productName}
                            </span>
                            <span className="text-xs text-slate-500 print:text-slate-700 font-semibold">
                              {line.packSize}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-900 print:text-black">
                        <span className="font-black text-sm sm:text-base block">{line.quantity}</span>
                        {Boolean(line.bonusQuantity && line.bonusQuantity > 0) && (
                          <span className="text-[10px] font-bold text-teal-700 dark:text-teal-400 print:text-black bg-teal-50 dark:bg-teal-950/60 print:bg-slate-100 px-1.5 py-0.5 rounded border border-teal-200 dark:border-teal-800 print:border-slate-300 block mt-0.5">
                            +{line.bonusQuantity} Bonus ({line.quantity + (line.bonusQuantity || 0)} Total)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-sm sm:text-base text-slate-900 print:text-black">
                        {formatPKR(line.unitPrice)}
                        {Boolean(line.extraDiscountPercent && line.extraDiscountPercent > 0) && (
                          <span className="text-[10px] font-bold text-rose-600 block">
                            (-{line.extraDiscountPercent}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-sm sm:text-base text-slate-900 print:text-black">
                        {formatPKR(line.lineTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary Box */}
          <div className="flex justify-end pt-4 border-t-2 border-slate-900 dark:border-slate-700 print:border-black">
            <div className="w-full sm:w-80 print:w-80 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between text-slate-600 print:text-slate-800 font-bold">
                <span>Gross Total:</span>
                <span className="font-mono text-slate-900 print:text-black font-black">{formatPKR(createdInvoice.subtotal)}</span>
              </div>
              {createdInvoice.invoiceDiscountAmount > 0 && (
                <div className="flex justify-between text-rose-600 dark:text-rose-400 print:text-rose-700 font-black">
                  <span>
                    Extra Discount
                    {createdInvoice.invoiceDiscountPercentage
                      ? ` (${createdInvoice.invoiceDiscountPercentage}%):`
                      : ":"}
                  </span>
                  <span className="font-mono">-{formatPKR(createdInvoice.invoiceDiscountAmount)}</span>
                </div>
              )}
              {createdInvoice.deliveryCharge > 0 && (
                <div className="flex justify-between text-slate-600 print:text-slate-800 font-bold">
                  <span>Delivery Charge:</span>
                  <span className="font-mono text-slate-900 print:text-black font-black">{formatPKR(createdInvoice.deliveryCharge)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg sm:text-2xl font-black text-slate-900 print:text-black pt-2 border-t-2 border-slate-900 dark:border-slate-700 print:border-black">
                <span>Net Payable:</span>
                <span className="font-mono text-teal-700 print:text-black">{formatPKR(createdInvoice.netTotal)}</span>
              </div>
              <div className="flex justify-between text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400 print:text-emerald-800">
                <span>Amount Paid:</span>
                <span className="font-mono font-black">{formatPKR(createdInvoice.paidAmount)}</span>
              </div>
              {createdInvoice.outstandingBalance > 0 && (
                <div className="flex justify-between text-sm sm:text-base font-black text-rose-600 dark:text-rose-400 print:text-rose-800 pt-1 border-t border-dashed border-slate-300">
                  <span>Balance (Baqaya Udhaar):</span>
                  <span className="font-mono">{formatPKR(createdInvoice.outstandingBalance)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Official Signatures Section */}
          <div className="pt-8 pb-3 grid grid-cols-1 sm:grid-cols-2 print:grid-cols-2 gap-6 sm:gap-10 text-xs font-bold text-slate-700 print:text-black">
            <div className="border-t-2 border-slate-400 pt-2 text-center">
              <span>Received By (Customer Signature & Stamp)</span>
            </div>
            <div className="border-t-2 border-slate-400 pt-2 text-center">
              <span>Authorized Signature & Stamp ({businessSettings?.brandName || "Noxderma Pharma"})</span>
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 text-center font-medium">
            {businessSettings?.invoiceFooter || "Thank you for partnering with Noxderma. Quality healthcare distributed with integrity."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 gap-3">
        <div>
          <Link
            href="/sales/invoices"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Customer Bills
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Receipt className="w-6 h-6 text-teal-600" />
              {originalInvoice ? "Edit Customer Bill (بل تبدیل کریں)" : "Make Customer Bill (Invoice)"}
            </h1>
            {originalInvoice && (
              <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                Bill #{originalInvoice.provisionalReference || originalInvoice.id}
              </span>
            )}
          </div>
          <p className="text-xs md:text-sm text-slate-500">
            {originalInvoice
              ? "Saved bill mein items, prices, discounts ya customer details tabdeel karein. Stock aur baqaya khata khud ba khud adjust hoga."
              : "Works 100% offline without internet. Real-time warehouse inventory and FEFO batch selection."}
          </p>
        </div>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Showing items for: <strong>{activeCategoryObj?.name || "Selected Category"}</strong> ({availableBatches.length} batches in stock)
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
        {/* Step 1: Customer Details */}
        <div className="p-5 sm:p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Building className="w-4 h-4 text-teal-600" />
              1. Customer / Buyer Details
            </h2>

            {customers.length > 0 && (
              <div className="w-full sm:w-80">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    const custId = e.target.value;
                    setSelectedCustomerId(custId);
                    if (custId) {
                      const found = customers.find((c) => c.id === custId);
                      if (found) {
                        setCustomCustomerName(found.name || "");
                        setCustomCustomerPhone(found.phone || "");
                        setCustomCustomerAddress(found.address || "");
                        setCustomCustomerCategory(found.category || "pharmacy");
                      }
                    }
                  }}
                  className="w-full px-3 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold"
                >
                  <option value="">⚡ Quick-Fill From Saved Customer List</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                Customer / Pharmacy Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. LifeCare Pharmacy or Ahmed Khan"
                value={customCustomerName}
                onChange={(e) => setCustomCustomerName(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold placeholder-slate-400 focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                Phone / Mobile Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  placeholder="e.g. 0300 1234567"
                  value={customCustomerPhone}
                  onChange={(e) => setCustomCustomerPhone(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium placeholder-slate-400 focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="sm:col-span-2 md:col-span-1">
              <label className="block text-xs font-bold uppercase text-slate-500 dark:text-slate-400 mb-1.5">
                Address / City (Optional)
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="e.g. Sector 7, Karachi"
                  value={customCustomerAddress}
                  onChange={(e) => setCustomCustomerAddress(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium placeholder-slate-400 focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>
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

                const paidQty = Number(line.quantity || 0);
                const bonusQty = Number(line.bonusQuantity || 0);
                const totalDelivered = paidQty + bonusQty;
                const unitPrice = Number(line.unitPrice || 0);
                const billedSubtotal = paidQty * unitPrice;
                const extraPct = Number(line.extraDiscountPercent || line.discountPercent || 0);
                const lineDiscountAmt = (billedSubtotal * extraPct) / 100;
                const netLineTotal = Math.max(0, billedSubtotal - lineDiscountAmt);

                // Pharmacy Effective Cost & Benefit Calculation
                const effectiveCostPerUnit = totalDelivered > 0 ? netLineTotal / totalDelivered : unitPrice;
                const nominalDeliveredValue = totalDelivered * unitPrice;
                const pharmacyBenefitPercent =
                  nominalDeliveredValue > 0
                    ? ((nominalDeliveredValue - netLineTotal) / nominalDeliveredValue) * 100
                    : 0;

                return (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border space-y-3.5 text-xs sm:text-sm card-interactive transition-all ${
                      isHighlighted
                        ? "border-amber-500 ring-4 ring-amber-500/30 bg-amber-50/80 dark:bg-amber-950/60"
                        : "border-slate-200/80 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40"
                    }`}
                  >
                    {/* Top Row: Medicine Info & Delete */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                          {(() => {
                            const itemImg =
                              line.imageUrl ||
                              getProductImageUrl(products.find((p) => p.id === line.productId));
                            return itemImg ? (
                              <img
                                src={itemImg}
                                alt={line.productName}
                                className="w-full h-full object-contain p-0.5"
                              />
                            ) : (
                              <Pill className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                            );
                          })()}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 truncate">
                              {line.productName}
                            </span>
                            <span className="text-[11px] font-semibold text-slate-400">
                              ({line.packSize})
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            {itemBatches.length > 1 ? (
                              <select
                                value={line.batchId}
                                onChange={(e) => handleUpdateLine(idx, "batchId", e.target.value)}
                                className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                              >
                                {itemBatches.map((b) => (
                                  <option key={b.id} value={b.id}>
                                    Batch: {b.batchNumber} &bull; Exp: {formatKarachiDate(b.expiryDate)} &bull; Stock: {b.remainingQuantity}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-[11px] text-teal-600 font-mono font-bold bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-md border border-teal-200 dark:border-teal-800">
                                Batch: {line.batchNumber} (Stock: {line.availableQuantity})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        aria-label="Remove medicine"
                        className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors btn-interactive shrink-0"
                        title="Remove medicine"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Inputs Row: Paid Qty, Bonus Qty, Extra %, Price */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {/* 1. Paid Qty */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                            Paid Qty (تعداد) *
                          </label>
                        </div>
                        <input
                          type="number"
                          min={1}
                          placeholder="1"
                          value={line.quantity === 0 ? "" : line.quantity}
                          onChange={(e) => handleUpdateLine(idx, "quantity", e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-center text-sm sm:text-base focus:ring-2 focus:ring-teal-500"
                        />
                      </div>

                      {/* 2. Bonus Qty (Free units) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-teal-700 dark:text-teal-400 uppercase flex items-center gap-1">
                            <span>Bonus Qty</span>
                            <span className="text-[10px] bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 px-1 rounded font-black">
                              Free
                            </span>
                          </label>
                        </div>
                        <input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={line.bonusQuantity === 0 ? "" : line.bonusQuantity}
                          onChange={(e) => handleUpdateLine(idx, "bonusQuantity", e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/30 dark:bg-teal-950/30 font-bold text-center text-sm sm:text-base text-teal-700 dark:text-teal-300 focus:ring-2 focus:ring-teal-500"
                        />
                      </div>

                      {/* 3. Extra % (Line Discount) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                            Extra % (اضافی)
                          </label>
                        </div>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          placeholder="0%"
                          value={line.extraDiscountPercent === 0 ? "" : line.extraDiscountPercent}
                          onChange={(e) => handleUpdateLine(idx, "extraDiscountPercent", e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-center text-sm sm:text-base font-mono focus:ring-2 focus:ring-teal-500"
                        />
                      </div>

                      {/* 4. Price (PKR) */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase">
                            Price (PKR)
                          </label>
                        </div>
                        <input
                          type="number"
                          placeholder="0"
                          value={line.unitPrice === 0 ? "" : line.unitPrice}
                          onChange={(e) => handleUpdateLine(idx, "unitPrice", e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className="w-full px-3 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-right font-mono font-bold text-sm sm:text-base focus:ring-2 focus:ring-teal-500"
                        />
                      </div>
                    </div>

                    {/* Promotional Scheme Preview & Pharmacy Margin/Benefit Bar */}
                    <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        {/* Scheme Delivered Badge */}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/80 border border-teal-200 dark:border-teal-800 font-bold text-teal-800 dark:text-teal-200">
                          <Boxes className="w-3.5 h-3.5 text-teal-600" />
                          <span>Delivered: {totalDelivered} units ({paidQty} Paid + {bonusQty} Free)</span>
                        </span>

                        {bonusQty > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 font-extrabold text-[11px] border border-emerald-300 dark:border-emerald-700">
                            🎁 {paidQty} + {bonusQty} Scheme
                          </span>
                        )}

                        {totalDelivered > 0 && (bonusQty > 0 || extraPct > 0) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[11px]">
                            Effective Cost: <strong className="font-mono text-slate-900 dark:text-slate-100">{formatPKR(Math.round(effectiveCostPerUnit))}</strong>/unit
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">({pharmacyBenefitPercent.toFixed(1)}% benefit)</span>
                          </span>
                        )}
                      </div>

                      {/* Net Line Total */}
                      <div className="text-right sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase sm:mb-0.5">
                          Billed Total (Bill sirf {paidQty} units ka)
                        </span>
                        <div className="flex items-center gap-1.5">
                          {extraPct > 0 && (
                            <span className="text-[10px] text-rose-500 font-bold line-through">
                              {formatPKR(billedSubtotal)}
                            </span>
                          )}
                          <span className="font-black text-base sm:text-lg font-mono text-teal-600 dark:text-teal-400">
                            {formatPKR(netLineTotal)}
                          </span>
                        </div>
                      </div>
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
                  placeholder="0"
                  value={paidAmount === 0 ? "" : paidAmount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/^0+(?=\d)/, "");
                    setPaidAmount(raw === "" ? 0 : Number(raw) || 0);
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-3.5 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold font-mono text-emerald-600"
                />
              </div>
            )}

            <div className={paymentMethod === "credit" ? "" : "sm:col-span-2"}>
              <div className="flex items-center justify-between mb-1.5 gap-2">
                <label className="block text-xs sm:text-sm font-bold">Extra Discount</label>
                {/* Segmented Switch: PKR vs % */}
                <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-slate-700 text-xs font-bold shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType("fixed");
                      if (discountPercent > 0 && eligibleBaseForDiscount > 0) {
                        setInvoiceDiscount(Math.round((eligibleBaseForDiscount * discountPercent) / 100));
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] sm:text-xs transition-all ${
                      discountType === "fixed"
                        ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    PKR (Rs.)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDiscountType("percentage");
                      if (invoiceDiscount > 0 && eligibleBaseForDiscount > 0) {
                        setDiscountPercent(parseFloat(((invoiceDiscount / eligibleBaseForDiscount) * 100).toFixed(1)));
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] sm:text-xs transition-all ${
                      discountType === "percentage"
                        ? "bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    % Percentage
                  </button>
                </div>
              </div>

              {discountType === "percentage" ? (
                <div className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.5"
                      placeholder="0"
                      value={discountPercent === 0 ? "" : discountPercent}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, "");
                        const val = raw === "" ? 0 : parseFloat(raw);
                        setDiscountPercent(isNaN(val) ? 0 : Math.min(100, Math.max(0, val)));
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full pl-3.5 pr-10 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-teal-500/50 dark:border-teal-500/40 bg-teal-50/20 dark:bg-teal-950/20 font-mono font-bold focus:ring-2 focus:ring-teal-500 transition-all text-teal-700 dark:text-teal-300"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-sm font-extrabold text-teal-600 dark:text-teal-400 pointer-events-none">
                      %
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-medium">
                      Calculated: <strong className="text-rose-600 dark:text-rose-400 font-mono">-{formatPKR(effectiveInvoiceDiscount)}</strong>
                    </span>
                    {/* Quick percentage chips */}
                    <div className="flex items-center gap-1">
                      {[2, 5, 7.5, 10, 15].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDiscountPercent(preset)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${
                            discountPercent === preset
                              ? "bg-teal-600 text-white border-teal-600 shadow-sm"
                              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-500"
                          }`}
                        >
                          {preset}%
                        </button>
                      ))}
                      {discountPercent > 0 && (
                        <button
                          type="button"
                          onClick={() => setDiscountPercent(0)}
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold text-rose-500 hover:text-rose-700"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      placeholder="0"
                      value={invoiceDiscount === 0 ? "" : invoiceDiscount}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/^0+(?=\d)/, "");
                        const val = raw === "" ? 0 : parseFloat(raw);
                        setInvoiceDiscount(isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      onFocus={(e) => e.target.select()}
                      className="w-full pl-3.5 pr-14 py-2.5 min-h-[44px] text-sm sm:text-base rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono font-semibold focus:ring-2 focus:ring-teal-500 transition-all"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                      PKR
                    </span>
                  </div>

                  {eligibleBaseForDiscount > 0 && invoiceDiscount > 0 && (
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span>
                        Equivalent to: <strong className="font-mono text-teal-600 dark:text-teal-400">{((invoiceDiscount / eligibleBaseForDiscount) * 100).toFixed(1)}%</strong> of bill subtotal
                      </span>
                      <button
                        type="button"
                        onClick={() => setInvoiceDiscount(0)}
                        className="text-[10px] font-bold text-rose-500 hover:text-rose-700"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Totals Summary */}
          <div className="p-4 sm:p-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Gross Total:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{formatPKR(subtotal)}</span>
            </div>
            {totalBonusUnits > 0 && (
              <div className="flex justify-between text-teal-700 dark:text-teal-300 font-bold text-xs bg-teal-50 dark:bg-teal-950/60 p-2 rounded-lg border border-teal-200 dark:border-teal-800">
                <span className="flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-teal-600" />
                  Free Bonus Delivered:
                </span>
                <span className="font-mono">+{totalBonusUnits} units free ({totalDeliveredUnits} total units)</span>
              </div>
            )}
            {totalDiscount > 0 && (
              <div className="flex justify-between text-rose-500 font-semibold">
                <span>
                  Extra Discount
                  {discountType === "percentage" && discountPercent > 0 ? ` (${discountPercent}%):` : ":"}
                </span>
                <span className="font-mono">-{formatPKR(totalDiscount)}</span>
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

        {/* Sticky Mobile Bottom Action Bar (Raised cleanly above center nav button) */}
        <div className="sticky bottom-[92px] z-30 md:hidden no-print print:hidden -mx-1 px-3 py-2.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-teal-500/30 dark:border-teal-500/40 shadow-2xl flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Net Payable
              </span>
              <span className="px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 font-mono text-[10px] font-bold">
                {lines.length} {lines.length === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="font-mono font-black text-base text-teal-600 dark:text-teal-400 leading-tight truncate">
              {formatPKR(netTotal)}
            </div>
            {outstandingBalance > 0 && (
              <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 truncate">
                Udhaar: {formatPKR(outstandingBalance)}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsProductModalOpen(true)}
              className="px-2.5 py-2.5 min-h-[42px] rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold text-xs flex items-center gap-1 btn-interactive"
              title="Add Medicine"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Item</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting || lines.length === 0}
              className="px-4 py-2.5 min-h-[42px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-xs shadow-lg shadow-teal-600/30 transition-all disabled:opacity-50 btn-interactive flex items-center justify-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isSubmitting
                  ? "Saving..."
                  : originalInvoice
                    ? "Update Bill"
                    : "Save & Print Bill"}
              </span>
            </button>
          </div>
        </div>

        {/* Submit */}
        <div className="flex flex-col sm:flex-row justify-end gap-3 pt-2">
          <Link
            href="/sales/invoices"
            className="px-5 py-3 min-h-[48px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm text-center flex items-center justify-center btn-interactive"
          >
            Cancel (منسوخ کریں)
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || lines.length === 0}
            className="px-8 py-3 min-h-[48px] rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-extrabold text-sm sm:text-base shadow-xl shadow-teal-600/30 transition-all disabled:opacity-50 btn-interactive flex items-center justify-center"
          >
            {isSubmitting
              ? originalInvoice
                ? "Updating Bill Offline..."
                : "Saving Bill Offline..."
              : originalInvoice
              ? "Update & Save Bill (بل تبدیل کریں)"
              : "Create & Save Bill (Invoice)"}
          </button>
        </div>
      </form>

      {/* Product & Stock Selector Modal */}
      {isProductModalOpen && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
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
                  // Find in-stock batches
                  const prodBatches = batches.filter(
                    (b) => b.productId === prod.id && Number(b.remainingQuantity || 0) > 0
                  );
                  const totalStock = prodBatches.reduce(
                    (sum, b) => sum + Number(b.remainingQuantity || 0),
                    0
                  );

                  const price = getProductDefaultPrice(prod, pricings, prodBatches[0]);
                  const prodImage = getProductImageUrl(prod);
                  const isAlreadyInInvoice = lines.some((l) => l.productId === prod.id);

                  return (
                    <div
                      key={prod.id}
                      onClick={() => handleSelectProduct(prod)}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs sm:text-sm card-interactive active:scale-[0.99] min-h-[64px] ${
                        isAlreadyInInvoice
                          ? "border-amber-300 dark:border-amber-700/80 bg-amber-50/30 dark:bg-amber-950/20 hover:border-amber-400"
                          : "border-slate-200/90 dark:border-slate-800 hover:border-teal-500 hover:bg-teal-50/20 dark:hover:bg-teal-950/20"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Product Image Thumbnail */}
                        <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                          {prodImage ? (
                            <img
                              src={prodImage}
                              alt={prod.name}
                              className="w-full h-full object-contain p-0.5"
                            />
                          ) : (
                            <Pill className="w-6 h-6 text-teal-600 dark:text-teal-400" />
                          )}
                        </div>

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
