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
  const [receivedQty, setReceivedQty] = useState(100);
  const [baseInvoiceCost, setBaseInvoiceCost] = useState(380);
  const [freightCharges, setFreightCharges] = useState(2500);
  const [customsAndTaxes, setCustomsAndTaxes] = useState(1500);
  const [packagingCosts, setPackagingCosts] = useState(500);

  // New PO Modal
  const [isCreatingPO, setIsCreatingPO] = useState(false);
  const [newMfrName, setNewMfrName] = useState("Bayer Healthcare PK");
  const [newSelectedProdId, setNewSelectedProdId] = useState("");
  const [newPOQty, setNewPOQty] = useState(200);
  const [newPOPrice, setNewPOPrice] = useState(420);

  const loadData = async () => {
    try {
      const [prodList] = await Promise.all([offlineDb.products.toArray()]);
      setProducts(prodList);

      // Preload standard POs if empty in local state
      const savedPOs = localStorage.getItem("noxderma_purchase_orders");
      if (savedPOs) {
        setPurchases(JSON.parse(savedPOs));
      } else {
        const initialPOs: PurchaseOrder[] = [
          {
            id: "po_101",
            poNumber: "PO-2026-089",
            manufacturerId: "mfr_bayer_pk",
            manufacturerName: "Bayer Healthcare PK",
            orderDate: "2026-10-15",
            expectedDeliveryDate: "2026-10-25",
            status: "received",
            grnReference: "GRN-2026-042",
            receivedDate: "2026-10-21",
            items: [
              {
                productId: "prod_amox_500",
                productName: "NoxAmox 500mg Capsules",
                packSize: "Pack of 30 Capsules",
                quantity: 200,
                unitPrice: 380,
                lineTotal: 76000,
              },
            ],
            totalAmount: 76000,
          },
          {
            id: "po_102",
            poNumber: "PO-2026-092",
            manufacturerId: "mfr_gsk_pk",
            manufacturerName: "GlaxoSmithKline PK",
            orderDate: "2026-10-18",
            expectedDeliveryDate: "2026-10-28",
            status: "ordered",
            items: [
              {
                productId: "prod_dermaclear_cream",
                productName: "DermaClear Soothing Cream 50g",
                packSize: "50g Tube",
                quantity: 150,
                unitPrice: 280,
                lineTotal: 42000,
              },
            ],
            totalAmount: 42000,
          },
          {
            id: "po_103",
            poNumber: "PO-2026-095",
            manufacturerId: "mfr_nox_laboratories",
            manufacturerName: "Nox Laboratories PK",
            orderDate: "2026-10-20",
            expectedDeliveryDate: "2026-10-30",
            status: "ordered",
            items: [
              {
                productId: "prod_nox_d3",
                productName: "Nox-D3 200,000 IU Injections",
                packSize: "Box of 5 Ampoules",
                quantity: 300,
                unitPrice: 520,
                lineTotal: 156000,
              },
            ],
            totalAmount: 156000,
          },
        ];
        setPurchases(initialPOs);
        localStorage.setItem("noxderma_purchase_orders", JSON.stringify(initialPOs));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const savePOsToStorage = (updatedList: PurchaseOrder[]) => {
    setPurchases(updatedList);
    localStorage.setItem("noxderma_purchase_orders", JSON.stringify(updatedList));
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
      userId: "usr_admin",
      userName: "Dr. Asim (Admin)",
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
      `GRN ${grnNumber} processed successfully! Batch ${receivingBatchNumber} added to inventory with landed cost of ${formatPKR(
        landedCostPerUnit
      )}.`
    );
  };

  const handleCreatePO = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = products.find((p) => p.id === newSelectedProdId) || products[0];
    if (!prod) return;

    const poNum = `PO-2026-${(purchases.length + 90).toString().padStart(3, "0")}`;
    const newPO: PurchaseOrder = {
      id: `po_${Date.now()}`,
      poNumber: poNum,
      manufacturerId: prod.manufacturerId,
      manufacturerName: newMfrName,
      orderDate: new Date().toISOString().slice(0, 10),
      expectedDeliveryDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      status: "ordered",
      items: [
        {
          productId: prod.id,
          productName: prod.name,
          packSize: prod.packSize,
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

  const filtered = purchases.filter((po) => {
    const matchesSearch =
      po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
      po.manufacturerName.toLowerCase().includes(search.toLowerCase()) ||
      (po.grnReference && po.grnReference.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || po.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalPurchasesAmount = purchases.reduce((sum, p) => sum + p.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Procurement & Inward Stock
            </span>
            <span className="text-xs text-slate-400">Landed Cost Accounting</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Purchases & Goods Receipts (GRN)
          </h1>
        </div>

        <button
          onClick={() => setIsCreatingPO(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Issue Purchase Order
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Purchase Volume
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalPurchasesAmount)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            {purchases.length} Purchase Orders Recorded
          </span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Pending Delivery Inward
          </span>
          <span className="text-2xl font-black text-amber-600">
            {purchases.filter((p) => p.status === "ordered").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Awaiting GRN & Batch Allocation</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Completed Receipts (GRN)
          </span>
          <span className="text-2xl font-black text-emerald-600">
            {purchases.filter((p) => p.status === "received").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">
            FEFO Batches Active in Warehouse
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search PO number, manufacturer or GRN..."
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
              {st}
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
                <th className="p-2.5">PO Number</th>
                <th className="p-2.5">Manufacturer</th>
                <th className="p-2.5">Product & Quantity</th>
                <th className="p-2.5">Order Date</th>
                <th className="p-2.5 text-right">PO Total</th>
                <th className="p-2.5">GRN Ref</th>
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
                        {po.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      {po.status === "ordered" ? (
                        <button
                          onClick={() => handleOpenGRN(po)}
                          className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] shadow-sm flex items-center gap-1 ml-auto"
                        >
                          <Calculator className="w-3 h-3" /> Receive (GRN)
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-600 font-semibold">
                          ✓ Stock Received
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
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-teal-600" /> Landed Cost & Goods Receipt (GRN)
                </h2>
                <p className="text-xs text-slate-400">
                  Allocating freight, customs and packaging directly into batch purchase cost
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
                  <span className="text-slate-400 block text-[10px]">Purchase Order:</span>
                  <span className="font-bold font-mono text-teal-600">{selectedPO.poNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Manufacturer:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {selectedPO.manufacturerName}
                  </span>
                </div>
              </div>

              {/* Batch & Expiry Allocation */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-700 dark:text-slate-300">
                  1. FEFO Batch Identification
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="font-semibold text-slate-600 dark:text-slate-400 block mb-1">
                      Batch # *
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
                      Mfg Date
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
                    Received Quantity (Packs) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={receivedQty}
                    onChange={(e) => setReceivedQty(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Base Invoice Cost / Pack (PKR) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={baseInvoiceCost}
                    onChange={(e) => setBaseInvoiceCost(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              {/* Landed Cost Allocation Engine */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <h4 className="font-bold text-slate-700 dark:text-slate-300">
                  2. Incurred Freight & Import Allocation
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Freight (PKR)</label>
                    <input
                      type="number"
                      value={freightCharges}
                      onChange={(e) => setFreightCharges(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Customs/Taxes (PKR)</label>
                    <input
                      type="number"
                      value={customsAndTaxes}
                      onChange={(e) => setCustomsAndTaxes(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-500 block mb-1">Packaging (PKR)</label>
                    <input
                      type="number"
                      value={packagingCosts}
                      onChange={(e) => setPackagingCosts(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Calculated Real Landed Cost Summary Box */}
              <div className="p-3.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-teal-900 dark:text-teal-200 font-semibold">
                    Additional Landed Cost / Pack:
                  </span>
                  <span className="font-mono font-bold text-teal-900 dark:text-teal-200">
                    +{formatPKR(additionalCostPerUnit)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm pt-1 border-t border-teal-200 dark:border-teal-800">
                  <span className="text-teal-950 dark:text-teal-100 font-extrabold">
                    Final Landed Unit Cost:
                  </span>
                  <span className="font-mono font-black text-teal-700 dark:text-teal-300 text-base">
                    {formatPKR(landedCostPerUnit)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px] text-teal-700 dark:text-teal-400">
                  <span>Total Inward Batch Valuation:</span>
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
                  Confirm & Post GRN to Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create PO Modal */}
      {isCreatingPO && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Issue Purchase Order
              </h2>
              <button
                onClick={() => setIsCreatingPO(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePO} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Manufacturer Name *
                </label>
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
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Product *
                </label>
                <select
                  value={newSelectedProdId}
                  onChange={(e) => setNewSelectedProdId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.sku})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Order Quantity (Packs)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newPOQty}
                    onChange={(e) => setNewPOQty(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Estimated Cost / Pack (PKR)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newPOPrice}
                    onChange={(e) => setNewPOPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs flex justify-between font-bold">
                <span>Total PO Valuation:</span>
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
                  Issue PO
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
