"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";

interface OnlineOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingAddress: string;
  city: string;
  itemsSummary: string;
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
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");

  // Booking Modal
  const [isBooking, setIsBooking] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [city, setCity] = useState("Lahore");
  const [address, setAddress] = useState("");
  const [itemsSummary, setItemsSummary] = useState("NoxAmox 500mg (2 Packs)");
  const [totalAmount, setTotalAmount] = useState(1500);
  const [courier, setCourier] = useState<OnlineOrder["courier"]>("TCS");

  useEffect(() => {
    const saved = localStorage.getItem("noxderma_online_orders");
    if (saved) {
      setOrders(JSON.parse(saved));
    } else {
      const initialOrders: OnlineOrder[] = [
        {
          id: "ord_101",
          orderNumber: "NXD-ONL-8910",
          customerName: "Dr. Ayesha Tariq (Aesthetic Clinic)",
          customerPhone: "+92 301 8899112",
          shippingAddress: "House 45, Street 12, DHA Phase 5",
          city: "Lahore",
          itemsSummary: "DermaClear Soothing Cream (5 Tubes)",
          totalAmount: 3750,
          codAmount: 3750,
          deliveryCharge: 250,
          courier: "TCS",
          trackingNumber: "TCS-771829012",
          status: "in_transit",
          orderDate: "2026-10-21",
          dispatchedDate: "2026-10-21",
        },
        {
          id: "ord_102",
          orderNumber: "NXD-ONL-8911",
          customerName: "Skin & Laser Wellness Center",
          customerPhone: "+92 321 4455667",
          shippingAddress: "Suite 302, Park Towers, Clifton",
          city: "Karachi",
          itemsSummary: "Nox-D3 200,000 IU (10 Boxes)",
          totalAmount: 8500,
          codAmount: 8500,
          deliveryCharge: 350,
          courier: "Trax",
          trackingNumber: "TRX-PK-991204",
          status: "delivered",
          orderDate: "2026-10-19",
          dispatchedDate: "2026-10-19",
        },
        {
          id: "ord_103",
          orderNumber: "NXD-ONL-8912",
          customerName: "Al-Razi Healthcare Clinic",
          customerPhone: "+92 333 5511223",
          shippingAddress: "Main Peshawar Road",
          city: "Rawalpindi",
          itemsSummary: "NoxAmox 500mg Capsules (4 Packs)",
          totalAmount: 3000,
          codAmount: 3000,
          deliveryCharge: 250,
          courier: "Leopards",
          status: "pending",
          orderDate: "2026-10-22",
        },
      ];
      setOrders(initialOrders);
      localStorage.setItem("noxderma_online_orders", JSON.stringify(initialOrders));
    }
  }, []);

  const saveOrders = (updated: OnlineOrder[]) => {
    setOrders(updated);
    localStorage.setItem("noxderma_online_orders", JSON.stringify(updated));
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !customerPhone || !address) return;

    const ordNum = `NXD-ONL-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrd: OnlineOrder = {
      id: `ord_${Date.now()}`,
      orderNumber: ordNum,
      customerName,
      customerPhone,
      shippingAddress: address,
      city,
      itemsSummary,
      totalAmount: Number(totalAmount),
      codAmount: Number(totalAmount),
      deliveryCharge: 250,
      courier,
      status: "pending",
      orderDate: new Date().toISOString().slice(0, 10),
    };

    saveOrders([newOrd, ...orders]);
    setIsBooking(false);
    setCustomerName("");
    setCustomerPhone("");
    setAddress("");
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

  const handleMarkDelivered = (orderId: string) => {
    const updated = orders.map((o) =>
      o.id === orderId ? { ...o, status: "delivered" as const } : o
    );
    saveOrders(updated);
  };

  const filtered = orders.filter((o) => {
    const matchesSearch =
      o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
      o.customerName.toLowerCase().includes(search.toLowerCase()) ||
      o.city.toLowerCase().includes(search.toLowerCase()) ||
      (o.trackingNumber && o.trackingNumber.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    const matchesCourier = courierFilter === "all" || o.courier === courierFilter;
    return matchesSearch && matchesStatus && matchesCourier;
  });

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
              E-Commerce & Courier Dispatch
            </span>
            <span className="text-xs text-slate-400">COD Integration Hub</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Online Orders & Courier Tracking
          </h1>
        </div>

        <button
          onClick={() => setIsBooking(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Book Online Delivery
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider block mb-1">
            Pending Courier Dispatch
          </span>
          <span className="text-2xl font-black text-amber-600">{pendingDispatches} Orders</span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Awaiting airway bill generation</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider block mb-1">
            In-Transit with Courier
          </span>
          <span className="text-2xl font-black text-teal-600 dark:text-teal-400">
            {inTransitCount} Parcels
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">TCS, Trax, Leopards</span>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider block mb-1">
            COD Delivered & Realized
          </span>
          <span className="text-2xl font-black font-mono text-emerald-600">
            {formatPKR(totalDeliveredVolume)}
          </span>
          <span className="text-[10px] text-slate-500 block mt-0.5">Completed Cash Collections</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between text-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search order #, customer, city or tracking..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0">
            <Filter className="w-3.5 h-3.5" /> Status:
          </span>
          {(["all", "pending", "in_transit", "delivered", "returned"] as const).map((st) => (
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

      {/* Orders Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Order Number</th>
                <th className="p-2.5">Customer & Destination</th>
                <th className="p-2.5">Items Summary</th>
                <th className="p-2.5">Courier & Tracking</th>
                <th className="p-2.5 text-right">COD Value</th>
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
                  <td className="p-2.5 text-slate-700 dark:text-slate-300 max-w-[220px] truncate">
                    {ord.itemsSummary}
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
                      {ord.status.replace("_", " ").toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2.5 text-right">
                    {ord.status === "pending" ? (
                      <button
                        onClick={() => handleDispatch(ord.id)}
                        className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-700 text-white font-bold text-[10px] shadow-sm"
                      >
                        Book Parcel
                      </button>
                    ) : ord.status === "in_transit" ? (
                      <button
                        onClick={() => handleMarkDelivered(ord.id)}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] shadow-sm"
                      >
                        Delivered
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Archived</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Booking Modal */}
      {isBooking && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Globe2 className="w-5 h-5 text-teal-600" /> Book Courier Delivery
              </h2>
              <button
                onClick={() => setIsBooking(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Recipient Name / Clinic *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dr. Salman Khan"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Phone *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="+92 300 ..."
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Destination City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Delivery Address *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="House, street, sector..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Items Summary
                </label>
                <input
                  type="text"
                  value={itemsSummary}
                  onChange={(e) => setItemsSummary(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    COD Amount (PKR)
                  </label>
                  <input
                    type="number"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Courier Partner
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
              </div>

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
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Save Booking
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
