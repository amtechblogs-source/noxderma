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
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Customer, Product } from "@/types";

interface SalesBooking {
  id: string;
  bookingRef: string;
  customerId: string;
  customerName: string;
  customerCity: string;
  salesRepName: string;
  bookingDate: string;
  deliveryDate: string;
  status: "pending_approval" | "approved" | "dispatched" | "cancelled";
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
  const [bookings, setBookings] = useState<SalesBooking[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Booking Creation Modal
  const [isCreating, setIsCreating] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [orderQty, setOrderQty] = useState(25);
  const [orderPrice, setOrderPrice] = useState(650);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  const loadData = async () => {
    try {
      const [custList, prodList] = await Promise.all([
        offlineDb.customers.toArray(),
        offlineDb.products.toArray(),
      ]);
      setCustomers(custList);
      setProducts(prodList);

      const saved = localStorage.getItem("noxderma_sales_bookings");
      if (saved) {
        setBookings(JSON.parse(saved));
      } else {
        const initialBookings: SalesBooking[] = [
          {
            id: "book_01",
            bookingRef: "ORD-BK-2026-101",
            customerId: "cust_al_shifa_lahore",
            customerName: "Al-Shifa Medicos & Pharmacy",
            customerCity: "Lahore",
            salesRepName: "Zubair Ahmed (Med Rep)",
            bookingDate: "2026-10-21",
            deliveryDate: "2026-10-24",
            status: "pending_approval",
            items: [
              {
                productId: "prod_amox_500",
                productName: "NoxAmox 500mg Capsules",
                packSize: "Pack of 30 Capsules",
                quantity: 40,
                unitPrice: 650,
                lineTotal: 26000,
              },
            ],
            totalAmount: 26000,
            paymentTerms: "30 Days Credit",
            notes: "Urgent delivery requested for Saturday OPD rush.",
          },
          {
            id: "book_02",
            bookingRef: "ORD-BK-2026-102",
            customerId: "cust_fazal_din_karachi",
            customerName: "Fazal Din & Sons Super Medicos",
            customerCity: "Karachi",
            salesRepName: "Farhan Ali (Med Rep)",
            bookingDate: "2026-10-22",
            deliveryDate: "2026-10-26",
            status: "approved",
            items: [
              {
                productId: "prod_nox_d3",
                productName: "Nox-D3 200,000 IU Injections",
                packSize: "Box of 5 Ampoules",
                quantity: 50,
                unitPrice: 850,
                lineTotal: 42500,
              },
            ],
            totalAmount: 42500,
            paymentTerms: "30 Days Credit",
            notes: "Approved by Sales Manager. Awaiting dispatch.",
          },
        ];
        setBookings(initialBookings);
        localStorage.setItem("noxderma_sales_bookings", JSON.stringify(initialBookings));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveBookings = (updated: SalesBooking[]) => {
    setBookings(updated);
    localStorage.setItem("noxderma_sales_bookings", JSON.stringify(updated));
  };

  const handleCreateBooking = (e: React.FormEvent) => {
    e.preventDefault();
    const cust = customers.find((c) => c.id === selectedCustomerId) || customers[0];
    const prod = products.find((p) => p.id === selectedProductId) || products[0];
    if (!cust || !prod) return;

    const refNum = `ORD-BK-2026-${(bookings.length + 103).toString().padStart(3, "0")}`;
    const newBooking: SalesBooking = {
      id: `book_${Date.now()}`,
      bookingRef: refNum,
      customerId: cust.id,
      customerName: cust.name,
      customerCity: cust.city,
      salesRepName: "Zubair Ahmed (Med Rep)",
      bookingDate: new Date().toISOString().slice(0, 10),
      deliveryDate: deliveryDate || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
      status: "pending_approval",
      items: [
        {
          productId: prod.id,
          productName: prod.name,
          packSize: prod.packSize,
          quantity: Number(orderQty),
          unitPrice: Number(orderPrice),
          lineTotal: Number(orderQty) * Number(orderPrice),
        },
      ],
      totalAmount: Number(orderQty) * Number(orderPrice),
      paymentTerms: `${cust.creditTermsDays || 30} Days Credit`,
      notes: notes || "Order taken during morning pharmacy market visit.",
    };

    saveBookings([newBooking, ...bookings]);
    setIsCreating(false);
    setNotes("");
  };

  const handleApprove = (bookingId: string) => {
    const updated = bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "approved" as const } : b
    );
    saveBookings(updated);
  };

  const filtered = bookings.filter((b) => {
    const matchesSearch =
      b.bookingRef.toLowerCase().includes(search.toLowerCase()) ||
      b.customerName.toLowerCase().includes(search.toLowerCase()) ||
      b.salesRepName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalBookingValue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Field Force Orders
            </span>
            <span className="text-xs text-slate-400">Pre-billing Reservations</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Field Sales Order Bookings
          </h1>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Take Order Booking
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
            Total Pipeline Orders
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {formatPKR(totalBookingValue)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">{bookings.length} Bookings Taken</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Pending Manager Approval
          </span>
          <span className="text-2xl font-black text-amber-600">
            {bookings.filter((b) => b.status === "pending_approval").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Credit limit verification</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            Approved & Ready to Dispatch
          </span>
          <span className="text-2xl font-black text-emerald-600">
            {bookings.filter((b) => b.status === "approved").length} Orders
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Ready for invoice conversion</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search booking ref, customer or rep..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {(["all", "pending_approval", "approved", "dispatched"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded-lg font-bold capitalize shrink-0 transition-all ${
                statusFilter === st
                  ? "bg-teal-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st.replace("_", " ")}
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
                <th className="p-2.5">Booking Ref</th>
                <th className="p-2.5">Customer & City</th>
                <th className="p-2.5">Product & Units</th>
                <th className="p-2.5">Booked By</th>
                <th className="p-2.5 text-right">Order Value</th>
                <th className="p-2.5 text-center">Status</th>
                <th className="p-2.5 text-right">Action</th>
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
                      <span className="text-[11px] text-slate-400">{b.customerCity}</span>
                    </td>
                    <td className="p-2.5 text-slate-700 dark:text-slate-300">
                      {item ? `${item.productName} (${item.quantity} packs)` : "Multi-item"}
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
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          b.status === "approved"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : b.status === "pending_approval"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {b.status.replace("_", " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      {b.status === "pending_approval" ? (
                        <button
                          onClick={() => handleApprove(b.id)}
                          className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] shadow-sm"
                        >
                          Approve
                        </button>
                      ) : (
                        <Link
                          href={`/sales/invoices/new?customerId=${b.customerId}`}
                          className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold hover:bg-emerald-100 text-[10px] inline-flex items-center gap-1"
                        >
                          Dispatch <ArrowRight className="w-3 h-3" />
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Booking Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-teal-600" /> Book Pharmacy Order
              </h2>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBooking} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Customer / Pharmacy *
                </label>
                <select
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                >
                  <option value="">-- Choose Customer --</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Product Item *
                </label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
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
                    Booked Quantity (Packs) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={orderQty}
                    onChange={(e) => setOrderQty(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Trade Price / Pack (PKR) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Required Delivery Date
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Visit Notes & Instructions
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Urgent stock needed, doctor prescribing..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs flex justify-between font-bold">
                <span>Order Total:</span>
                <span className="font-mono text-teal-600">{formatPKR(orderQty * orderPrice)}</span>
              </div>

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
                  Confirm Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
