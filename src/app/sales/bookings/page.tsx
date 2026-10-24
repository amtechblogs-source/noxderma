"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  ClipboardList,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Building2,
  ArrowRight,
  PackageCheck,
  Send,
  UserCheck,
  Truck,
  Boxes,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import type { Customer, Product, InventoryBatch, StockMovement } from "@/types";

interface SalesBooking {
  id: string;
  bookingRef: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  customerPhone?: string;
  salesRepName: string;
  bookingDate: string;
  deliveryDate: string;
  status: "pending_approval" | "approved" | "dispatched" | "delivered" | "cancelled";
  stockDeducted?: boolean;
  items: {
    productId: string;
    productName: string;
    packSize: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  totalAmount: number;
  paymentTerms: string;
  notes?: string;
}

export default function SalesBookingsPage() {
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [bookings, setBookings] = useState<SalesBooking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Booking Creation Modal State
  const [isCreating, setIsCreating] = useState(false);
  const [customerMode, setCustomerMode] = useState<"saved" | "manual">("saved");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [manualCustomerName, setManualCustomerName] = useState("");
  const [manualCustomerCity, setManualCustomerCity] = useState("");
  const [manualCustomerPhone, setManualCustomerPhone] = useState("");

  const [productMode, setProductMode] = useState<"saved" | "manual">("saved");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [manualProductName, setManualProductName] = useState("");
  const [manualPackSize, setManualPackSize] = useState("");

  const [orderQty, setOrderQty] = useState(1);
  const [orderPrice, setOrderPrice] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [bookingStatus, setBookingStatus] = useState<SalesBooking["status"]>("pending_approval");
  const [notes, setNotes] = useState("");

  const loadData = async () => {
    try {
      const [custList, prodList, batchList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
        offlineDb.inventoryBatches.toArray(),
      ]);
      setCustomers(custList);
      setProducts(prodList);
      setBatches(batchList);

      try {
        const dbBookings = await (offlineDb as any).salesBookings?.toArray();
        if (dbBookings && dbBookings.length > 0) {
          setBookings(dbBookings as SalesBooking[]);
          return;
        }
      } catch {
        // fallback
      }

      const saved = localStorage.getItem("noxderma_sales_bookings");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setBookings(parsed);
          } else {
            setBookings([]);
          }
        } catch {
          setBookings([]);
        }
      } else {
        setBookings([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveBookings = async (updated: SalesBooking[]) => {
    setBookings(updated);
    localStorage.setItem("noxderma_sales_bookings", JSON.stringify(updated));
    try {
      if ((offlineDb as any).salesBookings) {
        await (offlineDb as any).salesBookings.clear();
        if (updated.length > 0) {
          await (offlineDb as any).salesBookings.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync salesBookings to offlineDb:", err);
    }
  };

  // Real-time stock deduction when booking is delivered
  const deliverBookingAndDeductStock = async (bookingId: string, currentBookingList?: SalesBooking[]) => {
    const list = currentBookingList || bookings;
    const booking = list.find((b) => b.id === bookingId);
    if (!booking) return;

    if (booking.stockDeducted) {
      alert("Stock has already been deducted for this booking.");
      return;
    }

    try {
      const now = new Date().toISOString();
      const allBatches = await offlineDb.inventoryBatches.toArray();

      for (const item of booking.items) {
        // Find matching batches with remaining quantity
        const matchingBatches = allBatches
          .filter((b) => b.productId === item.productId && b.remainingQuantity > 0)
          .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());

        let needed = item.quantity;
        for (const batch of matchingBatches) {
          if (needed <= 0) break;
          const deductFromThis = Math.min(batch.remainingQuantity, needed);
          const newRemaining = batch.remainingQuantity - deductFromThis;

          // Update Dexie batch in real-time
          await offlineDb.inventoryBatches.update(batch.id, {
            remainingQuantity: newRemaining,
            updatedAt: now,
          });

          // Record stock movement
          await offlineDb.stockMovements.add({
            id: `mov_book_${Date.now()}_${batch.id}`,
            productId: item.productId,
            productName: item.productName,
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            type: "sales_deduction",
            quantityChange: -deductFromThis,
            balanceAfter: newRemaining,
            referenceId: booking.bookingRef,
            referenceType: "booking",
            userId: "usr_active_rep",
            userName: booking.salesRepName || "Sales Rep",
            reason: `Order delivered to ${booking.customerName} (${deductFromThis} packs)`,
            timestamp: now,
          });

          needed -= deductFromThis;
        }

        // If no matching batch exists in Dexie (e.g. manual product), log movement record
        if (matchingBatches.length === 0) {
          await offlineDb.stockMovements.add({
            id: `mov_book_${Date.now()}_${item.productId}`,
            productId: item.productId,
            productName: item.productName,
            type: "sales_deduction",
            quantityChange: -item.quantity,
            balanceAfter: 0,
            referenceId: booking.bookingRef,
            referenceType: "booking",
            userId: "usr_active_rep",
            userName: booking.salesRepName || "Sales Rep",
            reason: `Order delivered to ${booking.customerName} (${item.quantity} packs)`,
            timestamp: now,
          });
        }
      }

      const updated = list.map((b) =>
        b.id === bookingId ? { ...b, status: "delivered" as const, stockDeducted: true } : b
      );
      saveBookings(updated);
      alert(
        `✓ Order ${booking.bookingRef} successfully DELIVERED!\n\nStock for ${booking.items
          .map((i) => `${i.productName} (${i.quantity} packs)`)
          .join(", ")} was deducted in real-time from Godown inventory.`
      );
      await loadData();
    } catch (err: any) {
      console.error("Failed to deduct stock on delivery:", err);
      alert("Error deducting stock: " + (err.message || "Unknown error"));
    }
  };

  const handleUpdateStatus = async (bookingId: string, nextStatus: SalesBooking["status"]) => {
    if (nextStatus === "delivered") {
      await deliverBookingAndDeductStock(bookingId);
    } else {
      const updated = bookings.map((b) => (b.id === bookingId ? { ...b, status: nextStatus } : b));
      saveBookings(updated);
    }
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();

    // Customer resolution (saved or manual)
    let finalCustId = "cust_manual";
    let finalCustName = manualCustomerName.trim();
    let finalCustCity = manualCustomerCity.trim() || "Karachi";
    let finalPaymentTerms = "30 Days Credit";

    if (customerMode === "saved") {
      const cust = customers.find((c) => c.id === selectedCustomerId) || customers[0];
      if (cust) {
        finalCustId = cust.id;
        finalCustName = cust.name;
        finalCustCity = cust.city;
        finalPaymentTerms = `${cust.creditTermsDays || 30} Days Credit`;
      }
    }

    if (!finalCustName) {
      alert("Please select a customer or type the medical store / clinic name.");
      return;
    }

    // Product resolution (saved or manual)
    let finalProdId = `prod_${Date.now()}`;
    let finalProdName = manualProductName.trim() || "Pharmaceutical Product";
    let finalPackSize = manualPackSize.trim() || "Pack of 30";

    if (productMode === "saved") {
      const prod = products.find((p) => p.id === selectedProductId) || products[0];
      if (prod) {
        finalProdId = prod.id;
        finalProdName = prod.name;
        finalPackSize = prod.packSize;
      }
    }

    const refNum = `ORD-BK-2026-${(bookings.length + 103).toString().padStart(3, "0")}`;
    const newBooking: SalesBooking = {
      id: `book_${Date.now()}`,
      bookingRef: refNum,
      customerId: finalCustId,
      customerName: finalCustName,
      customerCity: finalCustCity,
      customerPhone: manualCustomerPhone,
      salesRepName: "Zubair Ahmed (Med Rep)",
      bookingDate: new Date().toISOString().slice(0, 10),
      deliveryDate: deliveryDate || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      status: bookingStatus,
      stockDeducted: false,
      items: [
        {
          productId: finalProdId,
          productName: finalProdName,
          packSize: finalPackSize,
          quantity: Number(orderQty),
          unitPrice: Number(orderPrice),
          lineTotal: Number(orderQty) * Number(orderPrice),
        },
      ],
      totalAmount: Number(orderQty) * Number(orderPrice),
      paymentTerms: finalPaymentTerms,
      notes: notes || "Order taken during medical store / clinic visit.",
    };

    const updatedList = [newBooking, ...bookings];
    saveBookings(updatedList);
    setIsCreating(false);
    setNotes("");

    // If initial status was selected as "delivered", deduct stock immediately!
    if (bookingStatus === "delivered") {
      await deliverBookingAndDeductStock(newBooking.id, updatedList);
    } else {
      alert(`Order ${refNum} recorded successfully! Status: ${bookingStatus.toUpperCase()}`);
    }
  };

  // Category isolation
  const activeCategoryObj =
    selectedCategoryId === "all" ? null : categories.find((c) => c.id === selectedCategoryId);

  const displayProducts =
    selectedCategoryId === "all"
      ? products
      : products.filter((p) => p.categoryId === selectedCategoryId);

  const categoryProductIds = new Set(displayProducts.map((p) => p.id));

  const displayBookings =
    selectedCategoryId === "all"
      ? bookings
      : bookings.filter((b) => b.items.some((item) => categoryProductIds.has(item.productId)));

  const filtered = displayBookings.filter((b) => {
    const matchesSearch =
      b.bookingRef.toLowerCase().includes(search.toLowerCase()) ||
      b.customerName.toLowerCase().includes(search.toLowerCase()) ||
      b.salesRepName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalBookingValue = displayBookings.reduce((sum, b) => sum + b.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Orders Taken by Staff
            </span>
            <span className="text-xs text-slate-400">Orders Taken Before Making Bill</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Orders Taken by Field Staff (Bookings)
          </h1>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Take New Order
        </button>
      </div>

      {/* Active Category Filter Alert */}
      {selectedCategoryId !== "all" && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-200 text-xs md:text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-600 animate-pulse" />
            <span>
              Orders isolated for category: <strong>{activeCategoryObj?.name || "Selected Category"}</strong>
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Orders Taken
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalBookingValue)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{displayBookings.length} Orders in Line</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Waiting for Approval
          </span>
          <span className="text-2xl font-black text-amber-600">
            {displayBookings.filter((b) => b.status === "pending_approval").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Checking customer credit</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider block mb-1">
            Approved / Dispatched
          </span>
          <span className="text-2xl font-black text-sky-600">
            {displayBookings.filter((b) => b.status === "approved" || b.status === "dispatched").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Ready to Deliver</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Delivered (Stock Deducted)
          </span>
          <span className="text-2xl font-black text-emerald-600">
            {displayBookings.filter((b) => b.status === "delivered").length} Delivered
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Real-time Godown Deducted</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search order no, shop name, or staff name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {(["all", "pending_approval", "approved", "dispatched", "delivered"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg font-bold capitalize shrink-0 transition-all ${
                statusFilter === st
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st === "all"
                ? "All Orders"
                : st === "pending_approval"
                ? "Waiting Approval"
                : st === "approved"
                ? "Approved"
                : st === "dispatched"
                ? "Dispatched"
                : "Delivered (Stock Deducted)"}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Order No.</th>
                <th className="p-2.5">Medical Store / Clinic & City</th>
                <th className="p-2.5">Medicine & Quantity</th>
                <th className="p-2.5">Staff / Rep Name</th>
                <th className="p-2.5 text-right">Total Amount</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Delivery & Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((b) => {
                const item = b.items[0];
                return (
                  <tr
                    key={b.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="p-2.5 font-mono font-bold text-teal-600 dark:text-teal-400">
                      {b.bookingRef}
                    </td>
                    <td className="p-2.5">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        {b.customerName}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {b.customerCity} {b.customerPhone ? `• ${b.customerPhone}` : ""}
                      </span>
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">
                      {item ? (
                        <div>
                          <span className="font-semibold block">{item.productName}</span>
                          <span className="text-[10px] text-slate-400">{item.quantity} packs ({item.packSize})</span>
                        </div>
                      ) : (
                        "Multi-item"
                      )}
                    </td>
                    <td className="p-2.5 text-slate-600 dark:text-slate-400">
                      <div>{b.salesRepName}</div>
                      <span className="text-[10px] text-slate-400">{b.bookingDate}</span>
                    </td>
                    <td className="p-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                      {formatPKR(b.totalAmount)}
                    </td>
                    <td className="p-2.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          b.status === "delivered"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : b.status === "dispatched"
                            ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                            : b.status === "approved"
                            ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            : b.status === "pending_approval"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {b.status === "delivered" && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                        {b.status === "delivered"
                          ? "DELIVERED (Stock -)"
                          : b.status === "dispatched"
                          ? "DISPATCHED"
                          : b.status === "approved"
                          ? "APPROVED"
                          : b.status === "pending_approval"
                          ? "WAITING APPROVAL"
                          : b.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {b.status === "pending_approval" && (
                          <button
                            onClick={() => handleUpdateStatus(b.id, "approved")}
                            className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] shadow-sm"
                          >
                            Approve
                          </button>
                        )}

                        {b.status === "approved" && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(b.id, "dispatched")}
                              className="px-2 py-1 rounded bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 hover:bg-purple-100 font-bold text-[10px]"
                            >
                              Dispatch
                            </button>
                            <button
                              onClick={() => deliverBookingAndDeductStock(b.id)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-sm flex items-center gap-1"
                            >
                              <Truck className="w-3 h-3" /> Deliver & Deduct Stock
                            </button>
                          </>
                        )}

                        {b.status === "dispatched" && (
                          <button
                            onClick={() => deliverBookingAndDeductStock(b.id)}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-sm flex items-center gap-1"
                          >
                            <Truck className="w-3 h-3" /> Mark Delivered (Deduct Stock)
                          </button>
                        )}

                        {b.status === "delivered" && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                            Stock Deducted ✓
                          </span>
                        )}

                        <Link
                          href={`/sales/invoices/new?customerId=${b.customerId}`}
                          className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-[10px] inline-flex items-center gap-0.5"
                          title="Generate Official Cash Memo / Bill"
                        >
                          Make Bill <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Booking Modal with Saved Dropdown & Manual Input */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-teal-600" /> Take New Order / Booking
                </h2>
                <p className="text-[11px] text-slate-500">Pick saved customer/medicine or type manual details</p>
              </div>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="space-y-4 text-xs">
              {/* Customer Mode Selection */}
              <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    Customer / Medical Store / Clinic *
                  </label>
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setCustomerMode("saved")}
                      className={`px-2 py-0.5 rounded ${
                        customerMode === "saved"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Saved List
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomerMode("manual")}
                      className={`px-2 py-0.5 rounded ${
                        customerMode === "manual"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Type Manual
                    </button>
                  </div>
                </div>

                {customerMode === "saved" ? (
                  <div>
                    <select
                      required
                      value={selectedCustomerId}
                      onChange={(e) => {
                        setSelectedCustomerId(e.target.value);
                        const c = customers.find((cust) => cust.id === e.target.value);
                        if (c) {
                          setManualCustomerName(c.name);
                          setManualCustomerCity(c.city);
                          setManualCustomerPhone(c.phone);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                    >
                      <option value="">-- Choose From Saved Customer List --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.city}) — Udhaar Limit: {formatPKR(c.creditLimit)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="sm:col-span-2">
                      <label className="text-[10px] text-slate-400 font-bold block mb-0.5">
                        Medical Store / Clinic Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Al-Madina Medicos"
                        value={manualCustomerName}
                        onChange={(e) => setManualCustomerName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-0.5">City</label>
                      <input
                        type="text"
                        placeholder="e.g. Karachi"
                        value={manualCustomerCity}
                        onChange={(e) => setManualCustomerCity(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="text-[10px] text-slate-400 font-bold block mb-0.5">
                        Phone / WhatsApp (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="+92 300 1234567"
                        value={manualCustomerPhone}
                        onChange={(e) => setManualCustomerPhone(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Medicine Item Mode Selection */}
              <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-teal-600" />
                    Medicine / Item *
                  </label>
                  <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold">
                    <button
                      type="button"
                      onClick={() => setProductMode("saved")}
                      className={`px-2 py-0.5 rounded ${
                        productMode === "saved"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      From Catalog
                    </button>
                    <button
                      type="button"
                      onClick={() => setProductMode("manual")}
                      className={`px-2 py-0.5 rounded ${
                        productMode === "manual"
                          ? "bg-teal-600 text-white"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      Type Item
                    </button>
                  </div>
                </div>

                {productMode === "saved" ? (
                  <div>
                    <select
                      required
                      value={selectedProductId}
                      onChange={(e) => {
                        setSelectedProductId(e.target.value);
                        const prod = displayProducts.find((p) => p.id === e.target.value);
                        if (prod) {
                          setManualProductName(prod.name);
                          setManualPackSize(prod.packSize);
                        }
                      }}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                    >
                      <option value="">-- Choose Medicine from Catalog --</option>
                      {displayProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) — {p.packSize}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-0.5">
                        Medicine Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Paracetamol 500mg"
                        value={manualProductName}
                        onChange={(e) => setManualProductName(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-0.5">Pack Size</label>
                      <input
                        type="text"
                        placeholder="e.g. Box of 30 Tablets"
                        value={manualPackSize}
                        onChange={(e) => setManualPackSize(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity and Price */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Quantity to Order (Packs) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={orderQty}
                    onChange={(e) => setOrderQty(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Price per Pack (PKR) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Status and Delivery Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Delivery Status
                  </label>
                  <select
                    value={bookingStatus}
                    onChange={(e) => setBookingStatus(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                  >
                    <option value="pending_approval">Waiting Approval (Standard)</option>
                    <option value="approved">Approved</option>
                    <option value="dispatched">Dispatched</option>
                    <option value="delivered">Delivered (Deduct Stock Now!)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Delivery Date Needed
                  </label>
                  <input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Urgent stock needed, deliver in morning..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-xs flex justify-between font-bold">
                <span>Total Order Amount:</span>
                <span className="font-mono text-teal-700 dark:text-teal-300 text-sm">
                  {formatPKR(orderQty * orderPrice)}
                </span>
              </div>

              {bookingStatus === "delivered" && (
                <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-[11px] font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Real-time stock deduction: {orderQty} packs will be immediately deducted from Godown batches upon saving.</span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Order
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
