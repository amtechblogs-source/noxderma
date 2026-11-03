"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Globe2,
  Plus,
  Search,
  Filter,
  Truck,
  PackageCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  MapPin,
  ExternalLink,
  DollarSign,
  Phone,
  Trash2,
  Boxes,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import type { Customer, Product } from "@/types";
import { DateRangeFilterBar } from "@/components/common/DateRangeFilterBar";
import {
  isRecordInDateRange,
  createDefaultDateFilter,
  type DateFilterState,
  getDateFilterDescription,
} from "@/lib/dateFilter";

interface OnlineOrderItem {
  productId: string;
  productName: string;
  packSize: string;
  quantity: number;
  unitPrice: number;
}

interface OnlineOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  itemsSummary: string;
  items?: OnlineOrderItem[];
  stockDeducted?: boolean;
  totalAmount: number;
  codAmount: number;
  deliveryCharge: number;
  courier: "TCS" | "Leopards" | "Trax" | "PostEx" | "M&P";
  trackingNumber?: string;
  status: "pending" | "dispatched" | "in_transit" | "delivered" | "returned";
  orderDate: string;
  dispatchedDate?: string;
}

export default function OnlineOrdersPage() {
  const { selectedCategoryId, categories } = useCategory();
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pricingMap, setPricingMap] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateFilterState>(createDefaultDateFilter("all"));

  // Booking Modal
  const [isBooking, setIsBooking] = useState(false);
  const [customerMode, setCustomerMode] = useState<"saved" | "manual">("saved");
  const [selectedCustId, setSelectedCustId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");

  const [productMode, setProductMode] = useState<"saved" | "manual">("saved");
  const [selectedProdId, setSelectedProdId] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPackSize, setCustomItemPackSize] = useState("Pack");
  const [customItemQty, setCustomItemQty] = useState(1);
  const [customItemPrice, setCustomItemPrice] = useState(0);
  const [parcelItems, setParcelItems] = useState<OnlineOrderItem[]>([]);
  const [itemsSummary, setItemsSummary] = useState("");
  const [totalAmount, setTotalAmount] = useState(0);
  const [courier, setCourier] = useState<OnlineOrder["courier"]>("TCS");
  const [orderStatus, setOrderStatus] = useState<OnlineOrder["status"]>("pending");

  useEffect(() => {
    async function initData() {
      const [custList, prodList, pricesList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
        offlineDb.productPricing.toArray(),
      ]);
      setCustomers(custList);
      setProducts(prodList);

      const pMap: Record<string, number> = {};
      pricesList.forEach((pr) => {
        pMap[pr.productId] = pr.tradePricePerPack;
      });
      setPricingMap(pMap);

      if (prodList.length > 0 && !selectedProdId) {
        setSelectedProdId(prodList[0].id);
      }
      if (custList.length > 0 && !selectedCustId) {
        setSelectedCustId(custList[0].id);
      }

      try {
        const dbOrders = await (offlineDb as any).onlineOrders?.toArray();
        if (dbOrders && dbOrders.length > 0) {
          setOrders(dbOrders as OnlineOrder[]);
          return;
        }
      } catch {
        // fallback
      }

      const saved = localStorage.getItem("noxderma_online_orders");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setOrders(parsed);
          } else {
            setOrders([]);
          }
        } catch {
          setOrders([]);
        }
      } else {
        setOrders([]);
      }
    }
    initData();
  }, []);

  const saveOrders = async (updated: OnlineOrder[]) => {
    setOrders(updated);
    localStorage.setItem("noxderma_online_orders", JSON.stringify(updated));
    try {
      if ((offlineDb as any).onlineOrders) {
        await (offlineDb as any).onlineOrders.clear();
        if (updated.length > 0) {
          await (offlineDb as any).onlineOrders.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync orders to offlineDb:", err);
    }
  };

  // Real-time stock deduction when parcel is delivered
  const deliverOrderAndDeductStock = async (orderId: string, currentOrderList?: OnlineOrder[]) => {
    const list = currentOrderList || orders;
    const order = list.find((o) => o.id === orderId);
    if (!order) return;

    if (order.stockDeducted) {
      alert("Stock has already been deducted for this parcel.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const allBatches = await offlineDb.inventoryBatches.toArray();

      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          const matchingBatches = allBatches
            .filter((b) => b.productId === item.productId && b.remainingQuantity > 0)
            .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

          let needed = item.quantity;
          for (const batch of matchingBatches) {
            if (needed <= 0) break;
            const deduct = Math.min(needed, batch.remainingQuantity);
            const newRemaining = batch.remainingQuantity - deduct;

            await offlineDb.inventoryBatches.update(batch.id, {
              remainingQuantity: newRemaining,
              updatedAt: now,
            });

            await offlineDb.stockMovements.add({
              id: `mov_onl_${Date.now()}_${batch.id}`,
              productId: item.productId,
              productName: item.productName,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              type: "sales_deduction",
              quantityChange: -deduct,
              balanceAfter: newRemaining,
              referenceId: order.orderNumber,
              referenceType: "online_order",
              userId: "usr_active_rep",
              userName: "Courier Sales",
              reason: `Parcel delivered via ${order.courier} to ${order.customerName}`,
              timestamp: now,
            });

            needed -= deduct;
          }

          if (matchingBatches.length === 0) {
            await offlineDb.stockMovements.add({
              id: `mov_onl_${Date.now()}_${item.productId}`,
              productId: item.productId,
              productName: item.productName,
              type: "sales_deduction",
              quantityChange: -item.quantity,
              balanceAfter: 0,
              referenceId: order.orderNumber,
              referenceType: "online_order",
              userId: "usr_active_rep",
              userName: "Courier Sales",
              reason: `Parcel delivered via ${order.courier} to ${order.customerName}`,
              timestamp: now,
            });
          }
        }
      } else {
        // Fallback for summary-only items: match batch by item text
        for (const batch of allBatches) {
          if (
            batch.remainingQuantity > 0 &&
            order.itemsSummary.toLowerCase().includes(batch.productName.toLowerCase())
          ) {
            const deduct = Math.min(1, batch.remainingQuantity);
            const newRemaining = batch.remainingQuantity - deduct;
            await offlineDb.inventoryBatches.update(batch.id, {
              remainingQuantity: newRemaining,
              updatedAt: now,
            });

            await offlineDb.stockMovements.add({
              id: `mov_onl_${Date.now()}_${batch.id}`,
              productId: batch.productId,
              productName: batch.productName,
              batchId: batch.id,
              batchNumber: batch.batchNumber,
              type: "sales_deduction",
              quantityChange: -deduct,
              balanceAfter: newRemaining,
              referenceId: order.orderNumber,
              referenceType: "online_order",
              userId: "usr_active_rep",
              userName: "Courier Sales",
              reason: `Parcel delivered via ${order.courier} to ${order.customerName}`,
              timestamp: now,
            });
            break;
          }
        }
      }

      const updated = list.map((o) =>
        o.id === orderId ? { ...o, status: "delivered" as const, stockDeducted: true } : o
      );
      saveOrders(updated);
      alert(
        `✓ Parcel ${order.orderNumber} successfully marked DELIVERED!\n\nStock for ${order.itemsSummary} was deducted in real-time from Godown inventory.`
      );
    } catch (err: any) {
      console.error("Failed to deduct stock on parcel delivery:", err);
      alert("Error deducting stock: " + (err.message || "Unknown error"));
    }
  };

  // Multi-item parcel helpers
  const syncParcelItems = (newItems: OnlineOrderItem[]) => {
    setParcelItems(newItems);
    const summary = newItems
      .map((i) => `${i.productName} (${i.packSize || "Pack"}) x ${i.quantity}`)
      .join(", ");
    setItemsSummary(summary);
    const sum = newItems.reduce(
      (acc, i) => acc + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0),
      0
    );
    setTotalAmount(sum);
  };

  const handleAddCatalogItem = () => {
    const prod = products.find((p) => p.id === selectedProdId);
    if (!prod) {
      alert("Barah-e-karam pehle list se medicine muntakhib karein.");
      return;
    }
    const qty = Math.max(1, Number(itemQty) || 1);
    const unitPrice = pricingMap[prod.id] || 650;

    const existingIdx = parcelItems.findIndex((it) => it.productId === prod.id);
    let updated: OnlineOrderItem[];
    if (existingIdx >= 0) {
      updated = [...parcelItems];
      updated[existingIdx] = {
        ...updated[existingIdx],
        quantity: updated[existingIdx].quantity + qty,
      };
    } else {
      updated = [
        ...parcelItems,
        {
          productId: prod.id,
          productName: prod.name,
          packSize: prod.packSize || "Pack",
          quantity: qty,
          unitPrice,
        },
      ];
    }
    syncParcelItems(updated);
    setItemQty(1);
  };

  const handleAddCustomItem = () => {
    if (!customItemName.trim()) {
      alert("Barah-e-karam medicine / item ka naam darj karein.");
      return;
    }
    const qty = Math.max(1, Number(customItemQty) || 1);
    const price = Math.max(0, Number(customItemPrice) || 0);

    const newItem: OnlineOrderItem = {
      productId: `custom_${Date.now()}`,
      productName: customItemName.trim(),
      packSize: customItemPackSize.trim() || "Item",
      quantity: qty,
      unitPrice: price,
    };
    syncParcelItems([...parcelItems, newItem]);
    setCustomItemName("");
    setCustomItemPackSize("Pack");
    setCustomItemQty(1);
    setCustomItemPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    const updated = parcelItems.filter((_, i) => i !== index);
    syncParcelItems(updated);
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index);
      return;
    }
    const updated = [...parcelItems];
    updated[index] = { ...updated[index], quantity: newQty };
    syncParcelItems(updated);
  };

  const openBookingModal = () => {
    setCustomerMode("saved");
    const firstCust = customers[0];
    if (firstCust) {
      setSelectedCustId(firstCust.id);
      setCustomerName(firstCust.name);
      setCustomerPhone(firstCust.phone || firstCust.whatsappNumber || "");
      setCity(firstCust.city || "Karachi");
      setAddress(firstCust.address || "");
    } else {
      setSelectedCustId("");
      setCustomerName("");
      setCustomerPhone("");
      setCity("");
      setAddress("");
    }
    setProductMode("saved");
    const activeProds =
      selectedCategoryId === "all"
        ? products
        : products.filter((p) => p.categoryId === selectedCategoryId);
    if (activeProds.length > 0) {
      setSelectedProdId(activeProds[0].id);
    } else if (products.length > 0) {
      setSelectedProdId(products[0].id);
    }
    setItemQty(1);
    setCustomItemName("");
    setCustomItemPackSize("Pack");
    setCustomItemQty(1);
    setCustomItemPrice(0);
    setParcelItems([]);
    setItemsSummary("");
    setTotalAmount(0);
    setCourier("TCS");
    setOrderStatus("pending");
    setIsBooking(true);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();

    let finalCustName = customerName.trim();
    let finalPhone = customerPhone.trim();
    let finalCity = city.trim();
    let finalAddress = address.trim();

    if (customerMode === "saved") {
      const cust = customers.find((c) => c.id === selectedCustId);
      if (cust) {
        finalCustName = cust.name;
        finalPhone = cust.phone || cust.whatsappNumber || finalPhone;
        finalCity = cust.city || finalCity;
        finalAddress = cust.address || finalAddress;
      }
    }

    if (!finalCustName || !finalPhone || !finalAddress) {
      alert("Please provide customer name, phone, and delivery address.");
      return;
    }

    let orderItems: OnlineOrderItem[] = [...parcelItems];

    // If user selected a product but didn't click "Add Medicine", auto-add it so it's not missed
    if (orderItems.length === 0) {
      if (productMode === "saved" && selectedProdId) {
        const prod = products.find((p) => p.id === selectedProdId);
        if (prod) {
          const qty = Math.max(1, Number(itemQty) || 1);
          orderItems = [
            {
              productId: prod.id,
              productName: prod.name,
              packSize: prod.packSize || "Pack",
              quantity: qty,
              unitPrice: pricingMap[prod.id] || 650,
            },
          ];
        }
      } else if (productMode === "manual" && customItemName.trim()) {
        orderItems = [
          {
            productId: `custom_${Date.now()}`,
            productName: customItemName.trim(),
            packSize: customItemPackSize.trim() || "Item",
            quantity: Math.max(1, Number(customItemQty) || 1),
            unitPrice: Math.max(0, Number(customItemPrice) || 0),
          },
        ];
      }
    }

    if (orderItems.length === 0 && !itemsSummary.trim()) {
      alert("Barah-e-karam parcel mein kam az kam aik medicine shamil karein (Please add at least one medicine to the parcel).");
      return;
    }

    let finalItemsSummary = itemsSummary.trim();
    if (!finalItemsSummary && orderItems.length > 0) {
      finalItemsSummary = orderItems
        .map((i) => `${i.productName} (${i.packSize || "Pack"}) x ${i.quantity}`)
        .join(", ");
    } else if (orderItems.length === 0 && finalItemsSummary) {
      orderItems = [
        {
          productId: "manual_text",
          productName: finalItemsSummary,
          packSize: "Unit",
          quantity: 1,
          unitPrice: Number(totalAmount) || 0,
        },
      ];
    }

    const calculatedSubtotal = orderItems.reduce(
      (acc, i) => acc + (Number(i.unitPrice) || 0) * (Number(i.quantity) || 0),
      0
    );
    const finalAmount = totalAmount > 0 ? Number(totalAmount) : calculatedSubtotal;

    const ordNum = `NXD-ONL-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrd: OnlineOrder = {
      id: `ord_${Date.now()}`,
      orderNumber: ordNum,
      customerName: finalCustName,
      customerPhone: finalPhone,
      shippingAddress: finalAddress,
      city: finalCity,
      itemsSummary: finalItemsSummary,
      items: orderItems,
      stockDeducted: false,
      totalAmount: finalAmount,
      codAmount: finalAmount,
      deliveryCharge: 250,
      courier,
      status: orderStatus,
      orderDate: new Date().toISOString().slice(0, 10),
    };

    const updated = [newOrd, ...orders];
    saveOrders(updated);
    setIsBooking(false);

    // If initial status was "delivered", deduct stock immediately!
    if (orderStatus === "delivered") {
      await deliverOrderAndDeductStock(newOrd.id, updated);
    } else {
      alert(`Parcel ${ordNum} booked successfully! Status: ${orderStatus.toUpperCase()}`);
    }
  };

  const handleDispatch = (orderId: string) => {
    const updated = orders.map((o) => {
      if (o.id === orderId) {
        const tracking = `${o.courier}-${Math.floor(100000000 + Math.random() * 900000000)}`;
        return {
          ...o,
          status: "in_transit" as const,
          trackingNumber: tracking,
          dispatchedDate: new Date().toISOString().slice(0, 10),
        };
      }
      return o;
    });
    saveOrders(updated);
  };

  const handleMarkDelivered = async (orderId: string) => {
    await deliverOrderAndDeductStock(orderId);
  };

  // Category isolation
  const displayProducts =
    selectedCategoryId === "all"
      ? products
      : products.filter((p) => p.categoryId === selectedCategoryId);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const matchesSearch =
        o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        o.customerName.toLowerCase().includes(search.toLowerCase()) ||
        o.city.toLowerCase().includes(search.toLowerCase()) ||
        (o.trackingNumber && o.trackingNumber.toLowerCase().includes(search.toLowerCase()));
      const matchesStatus = statusFilter === "all" || o.status === statusFilter;
      const matchesCourier = courierFilter === "all" || o.courier === courierFilter;
      const matchesDate = isRecordInDateRange(o.orderDate || o.dispatchedDate, dateFilter);
      return matchesSearch && matchesStatus && matchesCourier && matchesDate;
    });
  }, [orders, search, statusFilter, courierFilter, dateFilter]);

  const totalDeliveredVolume = orders
    .filter((o) => o.status === "delivered")
    .reduce((sum, o) => sum + o.totalAmount, 0);

  const pendingDispatches = orders.filter((o) => o.status === "pending").length;
  const inTransitCount = orders.filter((o) => o.status === "in_transit").length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Parcel Delivery & Courier
            </span>
            <span className="text-xs text-slate-400">Cash on Delivery (TCS / Trax)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Parcel Delivery & Courier (TCS / Trax)
          </h1>
        </div>

        <button
          onClick={openBookingModal}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Send New Parcel (Book Courier)
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Parcels Waiting to Send
          </span>
          <span className="text-2xl font-black text-amber-600">{pendingDispatches} Orders</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Waiting for Courier Pick Up</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            Parcels on the Way
          </span>
          <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
            {inTransitCount} Parcels
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">On delivery road with Courier</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Cash Collected from Delivered Parcels
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600">
            {formatPKR(totalDeliveredVolume)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Cash Received Safely</span>
        </div>
      </div>

      {/* Universal Date Filter */}
      <DateRangeFilterBar
        filter={dateFilter}
        onChange={setDateFilter}
        count={filtered.length}
      />

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search parcel no, customer name, city, or tracking no..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {(["all", "pending", "in_transit", "delivered", "returned"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-2.5 sm:px-3 py-1 rounded-lg font-bold capitalize transition-all text-xs ${
                statusFilter === st
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st === "all" ? "All Parcels" : st === "pending" ? "Waiting to Send" : st === "in_transit" ? "On the Way" : st === "delivered" ? "Delivered" : "Returned (Wapis)"}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Parcel No.</th>
                <th className="p-2.5">Customer & City</th>
                <th className="p-2.5">Medicines in Parcel</th>
                <th className="p-2.5">Courier & Tracking No.</th>
                <th className="p-2.5 text-right">Cash to Collect (COD)</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((ord) => (
                <tr
                  key={ord.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                    {ord.orderNumber}
                    <span className="text-[10px] text-slate-400 block font-sans font-normal">
                      {ord.orderDate}
                    </span>
                  </td>
                  <td className="p-2.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {ord.customerName}
                    </span>
                    <span className="text-[11px] text-slate-400">{ord.city} • {ord.customerPhone}</span>
                  </td>
                  <td className="p-2.5 text-slate-700 dark:text-slate-300 max-w-[240px]">
                    <div className="font-medium text-slate-800 dark:text-slate-200 text-xs line-clamp-2">
                      {ord.itemsSummary}
                    </div>
                    {ord.items && ord.items.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {ord.items.map((it, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60"
                          >
                            {it.productName} × {it.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                      <Truck className="w-3.5 h-3.5 text-teal-600" /> {ord.courier}
                    </div>
                    {ord.trackingNumber ? (
                      <span className="font-mono text-[11px] text-slate-500 block">
                        {ord.trackingNumber}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-600 font-medium block">
                        Not Dispatched
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    {formatPKR(ord.codAmount)}
                  </td>
                  <td className="p-2.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        ord.status === "delivered"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : ord.status === "in_transit"
                          ? "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                          : ord.status === "returned"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                    >
                      {ord.status === "delivered"
                        ? "DELIVERED"
                        : ord.status === "in_transit"
                        ? "ON THE WAY"
                        : ord.status === "returned"
                        ? "RETURNED"
                        : "WAITING TO SEND"}
                    </span>
                    {ord.stockDeducted && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        ✓ Godown Stock Deducted
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {ord.status === "pending" && (
                        <button
                          onClick={() => handleDispatch(ord.id)}
                          className="px-2 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] shadow-sm flex items-center gap-1"
                        >
                          <Truck className="w-3 h-3" /> Send Courier
                        </button>
                      )}
                      {ord.status !== "delivered" && (
                        <button
                          onClick={() => handleMarkDelivered(ord.id)}
                          className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-sm flex items-center gap-1"
                          title="Marks parcel delivered and immediately reduces quantity from godown batches (FEFO)"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Deliver & Deduct Stock
                        </button>
                      )}
                      {ord.status === "delivered" && (
                        <span className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Delivered & Recorded
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Modal */}
      {isBooking && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Globe2 className="w-5 h-5 text-teal-600" /> Send New Parcel (Book Courier)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Select saved customer/clinic & medicines, or type details manually.
                </p>
              </div>
              <button
                onClick={() => setIsBooking(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-4 text-xs">
              {/* Section 1: Customer / Recipient Selection */}
              <div className="p-3.5 rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/40 dark:bg-teal-950/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider text-teal-800 dark:text-teal-300 text-[11px]">
                    1. Customer / Clinic / Recipient Info
                  </span>
                  <div className="inline-flex rounded-lg border border-teal-300 dark:border-teal-700 p-0.5 bg-white dark:bg-slate-800 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setCustomerMode("saved")}
                      className={`px-2 py-0.5 rounded font-bold ${
                        customerMode === "saved"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      Saved Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode("manual")}
                      className={`px-2 py-0.5 rounded font-bold ${
                        customerMode === "manual"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      Type Manually
                    </button>
                  </div>
                </div>

                {customerMode === "saved" ? (
                  <div>
                    <label className="font-semibold block mb-1">Choose Saved Customer / Clinic</label>
                    <select
                      value={selectedCustId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setSelectedCustId(id);
                        const c = customers.find((cust) => cust.id === id);
                        if (c) {
                          setCustomerName(c.name);
                          setCustomerPhone(c.phone || c.whatsappNumber || "");
                          setCity(c.city || "Karachi");
                          setAddress(c.address || "");
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                    >
                      <option value="">-- Choose From Saved Directory --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.contactPerson ? `Contact: ${c.contactPerson}` : ""} — {c.city})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="font-semibold block mb-1">Recipient / Clinic Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Salman Khan / Prime Skin Clinic"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold block mb-1">Phone Number *</label>
                    <input
                      type="text"
                      required
                      placeholder="0300 1234567"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="font-semibold block mb-1">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-semibold block mb-1">Delivery Address *</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="House, street, sector, clinic landmark..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Section 2: Medicine / Items Selection */}
              <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 text-[11px] flex items-center gap-1.5">
                      <PackageCheck className="w-3.5 h-3.5 text-teal-600" />
                      2. Medicines & Items in Parcel
                    </span>
                    {parcelItems.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300">
                        {parcelItems.length} {parcelItems.length === 1 ? "Item" : "Items"} ({parcelItems.reduce((acc, i) => acc + i.quantity, 0)} packs)
                      </span>
                    )}
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-800 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setProductMode("saved")}
                      className={`px-2.5 py-1 rounded font-bold transition-colors ${
                        productMode === "saved"
                          ? "bg-teal-600 text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                      }`}
                    >
                      From Catalog
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductMode("manual")}
                      className={`px-2.5 py-1 rounded font-bold transition-colors ${
                        productMode === "manual"
                          ? "bg-teal-600 text-white shadow-sm"
                          : "text-slate-600 dark:text-slate-300 hover:text-slate-900"
                      }`}
                    >
                      Custom Items
                    </button>
                  </div>
                </div>

                {/* Add Item Box */}
                {productMode === "saved" ? (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-6">
                        <label className="font-semibold block mb-1 text-[11px] text-slate-700 dark:text-slate-300">
                          Select Medicine from Catalog
                        </label>
                        <select
                          value={selectedProdId}
                          onChange={(e) => setSelectedProdId(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-teal-500 outline-none"
                        >
                          <option value="">-- Choose Medicine --</option>
                          {displayProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.packSize || "Pack"}) — TP: {formatPKR(pricingMap[p.id] || 650)}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3">
                        <label className="font-semibold block mb-1 text-[11px] text-slate-700 dark:text-slate-300">
                          Qty (Packs)
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={itemQty}
                          onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <button
                          type="button"
                          onClick={handleAddCatalogItem}
                          className="w-full py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Medicine
                        </button>
                      </div>
                    </div>

                    {selectedProdId && (
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 px-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <span>Rate (TP): <strong className="text-slate-700 dark:text-slate-200 font-semibold">{formatPKR(pricingMap[selectedProdId] || 650)}</strong></span>
                        <span>Line Subtotal: <strong className="text-teal-600 font-mono font-bold">{formatPKR((pricingMap[selectedProdId] || 650) * itemQty)}</strong></span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-2 shadow-sm">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                      <div className="sm:col-span-5">
                        <label className="font-semibold block mb-1 text-[11px] text-slate-700 dark:text-slate-300">
                          Item / Medicine Name
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Skin Whitening Kit"
                          value={customItemName}
                          onChange={(e) => setCustomItemName(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-semibold block mb-1 text-[11px] text-slate-700 dark:text-slate-300">
                          Qty
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={customItemQty}
                          onChange={(e) => setCustomItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <label className="font-semibold block mb-1 text-[11px] text-slate-700 dark:text-slate-300">
                          Price (PKR)
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={customItemPrice === 0 ? "" : customItemPrice}
                          onChange={(e) => setCustomItemPrice(Number(e.target.value) || 0)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold focus:ring-2 focus:ring-teal-500 outline-none"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <button
                          type="button"
                          onClick={handleAddCustomItem}
                          className="w-full py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Item
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Medicines List in Parcel */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-3 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                    <span className="font-bold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Boxes className="w-3.5 h-3.5 text-teal-600" />
                      Medicines Included in Parcel ({parcelItems.length})
                    </span>
                    {parcelItems.length > 0 && (
                      <span className="font-mono text-[11px] font-bold text-teal-700 dark:text-teal-300">
                        Value: {formatPKR(parcelItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0))}
                      </span>
                    )}
                  </div>

                  {parcelItems.length === 0 ? (
                    <div className="p-3.5 text-center text-slate-400 dark:text-slate-500 text-xs">
                      Koi medicine shamil nahi ki gayi. Upar se medicine select kar ke &quot;+ Add Medicine&quot; dabayein.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                      {parcelItems.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 flex items-center justify-between gap-2.5 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {item.productName}
                            </p>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                              <span>{item.packSize || "Pack"}</span>
                              <span>•</span>
                              <span>Rate: {formatPKR(item.unitPrice)}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800">
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(idx, item.quantity - 1)}
                                className="px-2 py-0.5 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                title="Kam karein"
                              >
                                -
                              </button>
                              <span className="px-2 py-0.5 text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateItemQty(idx, item.quantity + 1)}
                                className="px-2 py-0.5 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                                title="Barhayein"
                              >
                                +
                              </button>
                            </div>

                            <div className="text-right min-w-[65px]">
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 text-xs block">
                                {formatPKR(item.quantity * item.unitPrice)}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                              title="Delete from parcel"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Auto-generated Summary */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold block text-[11px] text-slate-700 dark:text-slate-300">
                      Medicines Summary (Print on Parcel Label)
                    </label>
                    <span className="text-[10px] text-slate-400">Auto-filled from above items</span>
                  </div>
                  <input
                    type="text"
                    value={itemsSummary}
                    onChange={(e) => setItemsSummary(e.target.value)}
                    placeholder="e.g. Cream (Pack of 6) x 2, Sunblock (1) x 1"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              {/* Section 3: Amount, Courier & Initial Status */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Cash to Collect (COD PKR)
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={totalAmount === 0 ? "" : totalAmount}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setTotalAmount(raw === "" ? 0 : Number(raw) || 0);
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold text-teal-600"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Courier Company
                  </label>
                  <select
                    value={courier}
                    onChange={(e) => setCourier(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="TCS">TCS Express</option>
                    <option value="Trax">Trax Logistics</option>
                    <option value="Leopards">Leopards Courier</option>
                    <option value="PostEx">PostEx COD</option>
                    <option value="M&P">M&P Express</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Booking Status
                  </label>
                  <select
                    value={orderStatus}
                    onChange={(e) => setOrderStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold text-teal-600"
                  >
                    <option value="pending">Waiting to Send (Pending)</option>
                    <option value="in_transit">On the Road (In Transit)</option>
                    <option value="delivered">Delivered Now (Deduct Stock!)</option>
                  </select>
                </div>
              </div>

              {orderStatus === "delivered" && (
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Real-Time Stock Notice:</strong> Saving with <strong>Delivered</strong> status will immediately deduct quantity from warehouse batches (FEFO) and log a stock movement.
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBooking(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Book & Save Parcel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
