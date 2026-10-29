"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingBag,
  Plus,
  Search,
  Filter,
  Factory,
  PackageCheck,
  Barcode,
  Calendar,
  DollarSign,
  Truck,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Scale,
  Calculator,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import type {
  Product,
  InventoryBatch,
  StockMovement,
  BatchCostRecord,
} from "@/types";

interface PurchaseOrder {
  id: string;
  poNumber: string;
  manufacturerId: string;
  manufacturerName: string;
  orderDate: string;
  expectedDeliveryDate: string;
  status: "draft" | "ordered" | "received" | "partially_received" | "cancelled";
  items: {
    productId: string;
    productName: string;
    packSize: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  totalAmount: number;
  grnReference?: string;
  receivedDate?: string;
}

export default function PurchasesPage() {
  const { currentUser } = useAuth();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Landed Cost & GRN Modal
  const [isReceivingGRN, setIsReceivingGRN] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [grnNumber, setGrnNumber] = useState("");
  const [receivingBatchNumber, setReceivingBatchNumber] = useState("");
  const [manufacturingDate, setManufacturingDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [receivedQty, setReceivedQty] = useState(1);
  const [baseInvoiceCost, setBaseInvoiceCost] = useState(0);
  const [freightCharges, setFreightCharges] = useState(0);
  const [customsAndTaxes, setCustomsAndTaxes] = useState(0);
  const [packagingCosts, setPackagingCosts] = useState(0);

  // New PO Modal
  const [isCreatingPO, setIsCreatingPO] = useState(false);
  const [mfrMode, setMfrMode] = useState<"saved" | "manual">("saved");
  const [newMfrName, setNewMfrName] = useState("");
  const [prodMode, setProdMode] = useState<"saved" | "manual">("saved");
  const [newSelectedProdId, setNewSelectedProdId] = useState("");
  const [manualProdName, setManualProdName] = useState("");
  const [manualPackSize, setManualPackSize] = useState("");
  const [newPOQty, setNewPOQty] = useState(1);
  const [newPOPrice, setNewPOPrice] = useState(0);

  const loadData = async () => {
    try {
      const [prodList] = await Promise.all([offlineDb.products.toArray()]);
      setProducts(prodList);

      try {
        const dbPOs = await (offlineDb as any).purchaseOrders?.toArray();
        if (dbPOs && dbPOs.length > 0) {
          setPurchases(dbPOs as PurchaseOrder[]);
          return;
        }
      } catch {
        // fallback
      }

      const savedPOs = localStorage.getItem("noxderma_purchase_orders");
      if (savedPOs) {
        try {
          const parsed = JSON.parse(savedPOs);
          if (Array.isArray(parsed)) {
            setPurchases(parsed);
          } else {
            setPurchases([]);
          }
        } catch {
          setPurchases([]);
        }
      } else {
        setPurchases([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const savePOsToStorage = async (updatedList: PurchaseOrder[]) => {
    setPurchases(updatedList);
    localStorage.setItem("noxderma_purchase_orders", JSON.stringify(updatedList));
    try {
      if ((offlineDb as any).purchaseOrders) {
        await (offlineDb as any).purchaseOrders.clear();
        if (updatedList.length > 0) {
          await (offlineDb as any).purchaseOrders.bulkPut(updatedList);
        }
      }
    } catch (err) {
      console.error("Failed to sync purchase orders to offlineDb:", err);
    }
  };

  // Landed Cost Calculation
  const totalAdditionalCosts =
    Number(freightCharges) + Number(customsAndTaxes) + Number(packagingCosts);
  const additionalCostPerUnit =
    receivedQty > 0 ? totalAdditionalCosts / Number(receivedQty) : 0;
  const landedCostPerUnit = Number(baseInvoiceCost) + additionalCostPerUnit;
  const totalLandedBatchValuation = landedCostPerUnit * Number(receivedQty);

  const handleOpenGRN = (po: PurchaseOrder) => {
    setSelectedPO(po);
    const item = po.items[0];
    setGrnNumber(`GRN-${Date.now().toString().slice(-4)}`);
    setReceivingBatchNumber(`BCH-${Date.now().toString().slice(-5)}`);
    setReceivedQty(item ? item.quantity : 100);
    setBaseInvoiceCost(item ? item.unitPrice : 380);
    setManufacturingDate("2026-09-01");
    setExpiryDate("2028-09-01");
    setIsReceivingGRN(true);
  };

  const handleProcessGRN = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPO || !receivingBatchNumber || !expiryDate) return;

    const item = selectedPO.items[0];
    const now = new Date().toISOString();
    const batchId = `bch_${Date.now()}`;

    // 1. Create or update batch in Dexie
    const newBatch: InventoryBatch = {
      id: batchId,
      productId: item ? item.productId : "prod_amox_500",
      productName: item ? item.productName : "Pharmaceutical Product",
      batchNumber: receivingBatchNumber.toUpperCase().trim(),
      manufacturerId: selectedPO.manufacturerId,
      manufacturingDate: manufacturingDate || undefined,
      expiryDate: expiryDate,
      receivedQuantity: Number(receivedQty),
      remainingQuantity: Number(receivedQty),
      blockedQuantity: 0,
      goodsReceiptId: grnNumber,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    await offlineDb.inventoryBatches.put(newBatch);

    // 2. Log Stock Movement
    const movement: StockMovement = {
      id: `mov_grn_${Date.now()}`,
      productId: newBatch.productId,
      productName: newBatch.productName,
      batchId: newBatch.id,
      batchNumber: newBatch.batchNumber,
      type: "purchase_receipt",
      quantityChange: Number(receivedQty),
      balanceAfter: Number(receivedQty),
      referenceId: grnNumber,
      referenceType: "goods_receipt",
      userId: currentUser?.id || "usr_admin",
      userName: currentUser?.displayName || "Owner",
      reason: `Goods Receipt from ${selectedPO.manufacturerName} (Landed Cost: ${formatPKR(
        landedCostPerUnit
      )}/unit)`,
      timestamp: now,
    };

    await offlineDb.stockMovements.put(movement);

    // 3. Mark PO as received
    const updated = purchases.map((po) =>
      po.id === selectedPO.id
        ? {
            ...po,
            status: "received" as const,
            grnReference: grnNumber,
            receivedDate: now.slice(0, 10),
          }
        : po
    );
    savePOsToStorage(updated);

    setIsReceivingGRN(false);
    alert(
      `Stock received successfully! Batch ${receivingBatchNumber} added to stock with total cost of ${formatPKR(
        landedCostPerUnit
      )} per pack.`
    );
  };

  // Category isolation
  const activeCategoryObj =
    selectedCategoryId === "all" ? null : categories.find((c) => c.id === selectedCategoryId);

  const displayProducts =
    selectedCategoryId === "all"
      ? products
      : products.filter((p) => p.categoryId === selectedCategoryId);

  const categoryProductIds = new Set(displayProducts.map((p) => p.id));

  const displayPurchases =
    selectedCategoryId === "all"
      ? purchases
      : purchases.filter((po) => po.items?.some((i) => categoryProductIds.has(i.productId)));

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();

    let prodId = `prod_${Date.now()}`;
    let prodName = manualProdName.trim() || "Pharmaceutical Product";
    let prodPack = manualPackSize.trim() || "Pack of 30";
    let mfrId = "mfr_custom";

    if (prodMode === "saved") {
      const prod = displayProducts.find((p) => p.id === newSelectedProdId) || displayProducts[0] || products[0];
      if (prod) {
        prodId = prod.id;
        prodName = prod.name;
        prodPack = prod.packSize;
        mfrId = prod.manufacturerId;
      }
    }

    const finalMfrName = newMfrName.trim() || "Pharmaceutical Manufacturer";

    const poNum = `PO-2026-${(purchases.length + 90).toString().padStart(3, "0")}`;
    const newPO: PurchaseOrder = {
      id: `po_${Date.now()}`,
      poNumber: poNum,
      manufacturerId: mfrId,
      manufacturerName: finalMfrName,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      status: "ordered",
      items: [
        {
          productId: prodId,
          productName: prodName,
          packSize: prodPack,
          quantity: Number(newPOQty),
          unitPrice: Number(newPOPrice),
          lineTotal: Number(newPOQty) * Number(newPOPrice),
        },
      ],
      totalAmount: Number(newPOQty) * Number(newPOPrice),
    };

    savePOsToStorage([newPO, ...purchases]);
    setIsCreatingPO(false);
  };

  const filtered = displayPurchases.filter((po) => {
    const matchesSearch =
      po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      po.manufacturerName.toLowerCase().includes(search.toLowerCase()) ||
      (po.grnReference && po.grnReference.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPurchasesAmount = displayPurchases.reduce((sum, p) => sum + p.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Buy Stock from Companies
            </span>
            <span className="text-xs text-slate-400">Purchase Price + Delivery/Freight</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Buy Stock (Purchases & Received Stock)
          </h1>
        </div>

        <button
          onClick={() => setIsCreatingPO(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Order Stock from Company
        </button>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Showing purchases for: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
            </span>
          </div>
          <button
            onClick={() => setSelectedCategoryId("all")}
            className="text-xs font-semibold text-teal-700 dark:text-teal-300 underline hover:text-teal-900"
          >
            Show All Categories
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Stock Bought
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalPurchasesAmount)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {purchases.length} Purchase Orders
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Orders Waiting for Delivery
          </span>
          <span className="text-2xl font-black text-amber-600">
            {purchases.filter((p) => p.status === "ordered").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Waiting to Receive Stock in Godown</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Stock Received in Godown
          </span>
          <span className="text-2xl font-black text-emerald-600">
            {purchases.filter((p) => p.status === "received").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            Batches in Godown Ready to Sell
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search order no, company name, or receipt no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {(["all", "ordered", "received", "draft"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg font-bold capitalize shrink-0 transition-all ${
                statusFilter === st
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st === "all" ? "All Orders" : st === "ordered" ? "Ordered (Waiting)" : st === "received" ? "Received in Godown" : "Draft"}
            </button>
          ))}
        </div>
      </div>

      {/* PO & GRN Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Order No.</th>
                <th className="p-2.5">Company Name</th>
                <th className="p-2.5">Medicine & Quantity</th>
                <th className="p-2.5">Order Date</th>
                <th className="p-2.5 text-right">Total Amount</th>
                <th className="p-2.5">Receipt No.</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((po) => {
                const item = po.items[0];
                return (
                  <tr
                    key={po.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                      {po.poNumber}
                    </td>
                    <td className="p-2.5 font-semibold text-slate-900 dark:text-slate-100">
                      {po.manufacturerName}
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">
                      {item ? `${item.productName} (${item.quantity} packs)` : "Multi-item Order"}
                    </td>
                    <td className="p-2.5 text-slate-500 font-mono">{po.orderDate}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatPKR(po.totalAmount)}
                    </td>
                    <td className="p-2.5 font-mono text-slate-500">
                      {po.grnReference || "—"}
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          po.status === "received"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : po.status === "ordered"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {po.status === "received" ? "IN GODOWN" : po.status === "ordered" ? "ORDERED" : po.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      {po.status === "ordered" ? (
                        <button
                          onClick={() => handleOpenGRN(po)}
                          className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] shadow-sm flex items-center gap-1 ml-auto"
                        >
                          <Calculator className="w-3 h-3" /> Receive Stock
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-600 font-semibold">
                          ✓ In Godown
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Landed Cost & GRN Modal */}
      {isReceivingGRN && selectedPO && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-teal-600" /> Receive Stock in Godown (Add Delivery / Freight)
                </h2>
                <p className="text-xs text-slate-400">
                  Add delivery/freight, taxes, and packing to find your real total cost per pack
                </p>
              </div>
              <button
                onClick={() => setIsReceivingGRN(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleProcessGRN} className="space-y-4 text-xs">
              {/* Reference Header */}
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-400 block text-[10px]">Order No:</span>
                  <span className="font-bold font-mono text-teal-600">{selectedPO.poNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Company:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedPO.manufacturerName}
                  </span>
                </div>
              </div>

              {/* Batch & Expiry Allocation */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300">
                  1. Batch Number & Expiry Date
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Batch No. *
                    </label>
                    <input
                      type="text"
                      required
                      value={receivingBatchNumber}
                      onChange={(e) => setReceivingBatchNumber(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono uppercase"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Making Date (Mfg)
                    </label>
                    <input
                      type="date"
                      value={manufacturingDate}
                      onChange={(e) => setManufacturingDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Expiry Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Inward Quantity & Base Invoice Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Quantity Received in Godown (Packs) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                    value={receivedQty === 0 ? "" : receivedQty}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setReceivedQty(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Company Bill Price / Pack (PKR) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="0"
                    value={baseInvoiceCost === 0 ? "" : baseInvoiceCost}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setBaseInvoiceCost(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Landed Cost Allocation Engine */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-700 dark:text-slate-300">
                  2. Extra Costs (Freight, Delivery & Taxes)
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Delivery / Freight (PKR)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={freightCharges === 0 ? "" : freightCharges}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setFreightCharges(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Taxes / Toll (PKR)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={customsAndTaxes === 0 ? "" : customsAndTaxes}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setCustomsAndTaxes(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Packaging / Packing (PKR)</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={packagingCosts === 0 ? "" : packagingCosts}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setPackagingCosts(raw === "" ? 0 : Number(raw) || 0);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Calculated Real Landed Cost Summary Box */}
              <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-teal-900 dark:text-teal-200 font-semibold">
                    Extra Delivery Cost per Pack:
                  </span>
                  <span className="font-mono font-bold text-teal-900 dark:text-teal-200">
                    +{formatPKR(additionalCostPerUnit)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1 border-t border-teal-200 dark:border-teal-800">
                  <span className="text-teal-950 dark:text-teal-100 font-extrabold">
                    Total Cost per Pack (Purchase + Delivery):
                  </span>
                  <span className="font-mono font-black text-teal-700 dark:text-teal-300 text-base">
                    {formatPKR(landedCostPerUnit)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-teal-700 dark:text-teal-400">
                  <span>Total Cost of this Stock:</span>
                  <span className="font-mono font-bold">{formatPKR(totalLandedBatchValuation)}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsReceivingGRN(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Confirm & Add to Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {isCreatingPO && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Order Stock from Company
              </h2>
              <button
                onClick={() => setIsCreatingPO(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="space-y-3 text-xs">
              {/* Company / Manufacturer Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Company / Manufacturer *
                  </label>
                  <div className="inline-flex rounded border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setMfrMode("saved")}
                      className={`px-2 py-0.5 rounded font-bold ${
                        mfrMode === "saved"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      Choose Saved
                    </button>
                    <button
                      type="button"
                      onClick={() => setMfrMode("manual")}
                      className={`px-2 py-0.5 rounded font-bold ${
                        mfrMode === "manual"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      Type Custom
                    </button>
                  </div>
                </div>

                {mfrMode === "saved" ? (
                  <select
                    value={newMfrName}
                    onChange={(e) => setNewMfrName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                  >
                    <option value="Bayer Healthcare PK">Bayer Healthcare PK</option>
                    <option value="GlaxoSmithKline PK">GlaxoSmithKline PK</option>
                    <option value="Nox Laboratories PK">Nox Laboratories PK</option>
                    <option value="Getz Pharma Pakistan">Getz Pharma Pakistan</option>
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ferozsons Laboratories, Bosch Pharma"
                    value={newMfrName}
                    onChange={(e) => setNewMfrName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                  />
                )}
              </div>

              {/* Medicine / Product Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Select Medicine *
                  </label>
                  <div className="inline-flex rounded border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-100 dark:bg-slate-800 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setProdMode("saved")}
                      className={`px-2 py-0.5 rounded font-bold ${
                        prodMode === "saved"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      Catalog List
                    </button>
                    <button
                      type="button"
                      onClick={() => setProdMode("manual")}
                      className={`px-2 py-0.5 rounded font-bold ${
                        prodMode === "manual"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      Custom Medicine
                    </button>
                  </div>
                </div>

                {prodMode === "saved" ? (
                  <select
                    value={newSelectedProdId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setNewSelectedProdId(id);
                      const p = displayProducts.find((item) => item.id === id);
                      if (p) {
                        offlineDb.productPricing.get(id).then((pr) => {
                          if (pr?.purchaseCostPerPack) setNewPOPrice(pr.purchaseCostPerPack);
                        });
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                  >
                    <option value="">-- Choose Medicine --</option>
                    {displayProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.sku})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Medicine Name (e.g. NoxPan 40mg)"
                      value={manualProdName}
                      onChange={(e) => setManualProdName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Pack Size (e.g. 20 Tablets)"
                      value={manualPackSize}
                      onChange={(e) => setManualPackSize(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Quantity to Order (Packs)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="0"
                    value={newPOQty === 0 ? "" : newPOQty}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setNewPOQty(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Estimated Price / Pack (PKR)
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="0"
                    value={newPOPrice === 0 ? "" : newPOPrice}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setNewPOPrice(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs flex justify-between font-bold">
                <span>Total Order Amount:</span>
                <span className="font-mono text-teal-600">{formatPKR(newPOQty * newPOPrice)}</span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingPO(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Purchase Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
