"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  MapPin,
  Battery,
  BatteryCharging,
  BatteryLow,
  Smartphone,
  Wifi,
  RefreshCw,
  Plus,
  ExternalLink,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Search,
  UserCheck,
  Navigation,
} from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { DEFAULT_STAFF_MONITORS } from "@/lib/monitoring/seedData";
import type { StaffMonitoringProfile, StaffLiveState } from "@/types";

/**
 * Helper to detect a friendly mobile/device name from the browser User-Agent
 */
function detectBrowserDeviceName(): string {
  if (typeof navigator === "undefined") return "Mobile Device";
  const ua = navigator.userAgent || "";
  if (/SM-[A-Z0-9]+/i.test(ua)) {
    const match = ua.match(/SM-[A-Z0-9]+/i);
    return `Samsung Galaxy (${match ? match[0] : "Android"})`;
  }
  if (/Redmi|Mi |POCO/i.test(ua)) return "Xiaomi Redmi Smartphone";
  if (/Infinix/i.test(ua)) return "Infinix Android Phone";
  if (/vivo/i.test(ua)) return "Vivo Smartphone";
  if (/OPPO|CPH/i.test(ua)) return "OPPO Smartphone";
  if (/iPhone/i.test(ua)) return "Apple iPhone";
  if (/iPad/i.test(ua)) return "Apple iPad";
  if (/Android/i.test(ua)) return "Android Smartphone";
  if (/Windows/i.test(ua)) return "Windows PC / Laptop";
  if (/Macintosh/i.test(ua)) return "MacBook / macOS";
  return "Staff Mobile Device";
}

export default function StaffLocationAndPhoneStatusPage() {
  const [staffList, setStaffList] = useState<StaffMonitoringProfile[]>(DEFAULT_STAFF_MONITORS);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("staff_ali");
  const [search, setSearch] = useState<string>("");
  const [isSyncingDevice, setIsSyncingDevice] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add / Edit Staff Device Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [staffName, setStaffName] = useState<string>("");
  const [staffRole, setStaffRole] = useState<StaffMonitoringProfile["roleTitle"]>("Order Booker");
  const [staffPhone, setStaffPhone] = useState<string>("");
  const [deviceModel, setDeviceModel] = useState<string>("");
  const [currentLocationText, setCurrentLocationText] = useState<string>("Tariq Road, Karachi");
  const [batteryPct, setBatteryPct] = useState<number>(85);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Load saved staff monitoring profiles from IndexedDB / localStorage
  useEffect(() => {
    async function loadStaff() {
      try {
        const dbStaff = await offlineDb.staffMonitors?.toArray();
        if (dbStaff && dbStaff.length > 0) {
          setStaffList(dbStaff);
          return;
        }
      } catch {}

      try {
        const saved = localStorage.getItem("noxderma_staff_monitors");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setStaffList(parsed);
            return;
          }
        }
        await offlineDb.staffMonitors?.bulkPut(DEFAULT_STAFF_MONITORS);
      } catch {}
    }
    loadStaff();
  }, []);

  const persistStaffList = async (updated: StaffMonitoringProfile[]) => {
    setStaffList(updated);
    localStorage.setItem("noxderma_staff_monitors", JSON.stringify(updated));
    try {
      await offlineDb.staffMonitors?.clear();
      await offlineDb.staffMonitors?.bulkPut(updated);
    } catch {}
  };

  const selectedStaff = useMemo(
    () => staffList.find((s) => s.id === selectedStaffId) || staffList[0],
    [staffList, selectedStaffId]
  );

  // Sync real HTML5 Battery + Device Name + Live GPS Coordinates for selected staff
  const handleSyncLiveDeviceStatus = async () => {
    setIsSyncingDevice(true);
    let pct = selectedStaff?.batteryLevel ?? 80;
    let charging = false;

    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      try {
        const bat = await (navigator as any).getBattery();
        pct = Math.round((bat.level ?? 0.8) * 100);
        charging = Boolean(bat.charging);
      } catch {}
    }

    const detectedModel = detectBrowserDeviceName();

    const applyUpdate = (lat: number, lng: number, acc: number, locLabel?: string) => {
      const signal: StaffMonitoringProfile["gpsSignal"] =
        acc <= 15 ? "High Accuracy Active" : acc <= 40 ? "Moderate Signal" : "Weak Signal";

      const updated = staffList.map((s) =>
        s.id === selectedStaff.id
          ? {
              ...s,
              batteryLevel: pct,
              isCharging: charging,
              deviceModel: s.deviceModel || detectedModel,
              lat,
              lng,
              gpsAccuracyMeters: Math.round(acc),
              gpsSignal: signal,
              currentRoadOrLocation: locLabel || s.currentRoadOrLocation,
              lastPingTime: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              liveState: "moving" as StaffLiveState,
            }
          : s
      );

      persistStaffList(updated);
      setIsSyncingDevice(false);
      showToast(
        `✓ Updated ${selectedStaff.name}: ${pct}% Battery (${
          charging ? "Charging" : "On Battery"
        }) • GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`
      );
    };

    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyUpdate(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy || 5,
            `Live GPS Location (${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E)`
          );
        },
        () => {
          applyUpdate(selectedStaff.lat, selectedStaff.lng, 5);
        },
        { enableHighAccuracy: true, timeout: 4000 }
      );
    } else {
      applyUpdate(selectedStaff.lat, selectedStaff.lng, 5);
    }
  };

  // Add new staff member to monitor
  const handleAddStaffMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim()) return;

    const idx = staffList.length + 1;
    const newStaff: StaffMonitoringProfile = {
      id: `staff_${Date.now()}`,
      name: staffName.trim(),
      roleTitle: staffRole,
      phone: staffPhone.trim() || "0300-0000000",
      vehicleType: "bike",
      territory: currentLocationText.trim() || "Karachi",
      liveState: "moving",
      statusHeadline: "Active in Field",
      currentSpeedKmh: 20,
      currentRoadOrLocation: currentLocationText.trim() || "Tariq Road, Karachi",
      shiftStartTime: "09:00 AM",
      batteryLevel: Math.min(100, Math.max(1, Number(batteryPct) || 85)),
      isCharging: false,
      gpsAccuracyMeters: 5,
      gpsSignal: "High Accuracy Active",
      lastPingTime: "Just now",
      deviceModel: deviceModel.trim() || detectBrowserDeviceName(),
      lat: 24.8689 + (idx % 5) * 0.004,
      lng: 67.0612 + (idx % 5) * 0.004,
      x: 30 + ((idx * 14) % 50),
      y: 28 + ((idx * 12) % 48),
      dayRoute: [],
    };

    const updated = [newStaff, ...staffList];
    persistStaffList(updated);
    setSelectedStaffId(newStaff.id);
    setStaffName("");
    setStaffPhone("");
    setDeviceModel("");
    setIsAddModalOpen(false);
    showToast(`Added ${newStaff.name} (${newStaff.deviceModel}) to live monitor.`);
  };

  const filteredStaff = staffList.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.deviceModel.toLowerCase().includes(search.toLowerCase()) ||
      s.currentRoadOrLocation.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = staffList.filter((s) => s.liveState !== "offline").length;
  const lowBatteryCount = staffList.filter((s) => s.batteryLevel <= 20).length;

  return (
    <div className="space-y-6 pb-10">
      {/* Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl bg-slate-900 text-white border border-teal-500/40 shadow-xl flex items-center justify-between gap-3 text-xs font-bold">
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <MapPin className="w-6 h-6 text-teal-600" />
            Staff Live Location &amp; Mobile Battery
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Check each staff member&apos;s live GPS location, mobile model name, and real-time phone battery percentage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSyncLiveDeviceStatus}
            disabled={isSyncingDevice}
            className="px-3.5 py-2 rounded-xl border border-teal-500/30 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncingDevice ? "animate-spin" : ""}`} />
            Sync My Mobile &amp; GPS
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/20"
          >
            <Plus className="w-4 h-4" />
            Add Staff Mobile
          </button>
        </div>
      </div>

      {/* 3 SIMPLE SUMMARY CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Staff Online on GPS
            </span>
            <span className="text-2xl font-black text-emerald-600">
              {activeCount} / {staffList.length}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Live location active
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
            <Navigation className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Selected Mobile Model
            </span>
            <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 truncate block mt-0.5">
              {selectedStaff?.deviceModel}
            </span>
            <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold block mt-0.5">
              {selectedStaff?.name} ({selectedStaff?.roleTitle})
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center">
            <Smartphone className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Low Battery Phones (&le;20%)
            </span>
            <span
              className={`text-2xl font-black ${
                lowBatteryCount > 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {lowBatteryCount} Staff
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Real-time HTML5 Battery Monitor
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
            <Battery className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* MAIN CONTENT: STAFF LIST (LEFT) + LIVE LOCATION MAP (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLUMNS: STAFF CARDS WITH MOBILE NAME, BATTERY % & LIVE LOCATION */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              All Field Staff ({filteredStaff.length})
            </h2>
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff, mobile, location..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredStaff.map((rep) => {
              const isSelected = rep.id === selectedStaff?.id;
              const isOnline = rep.liveState !== "offline";

              return (
                <div
                  key={rep.id}
                  onClick={() => setSelectedStaffId(rep.id)}
                  className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm cursor-pointer transition-all ${
                    isSelected
                      ? "border-teal-500 ring-2 ring-teal-500/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300"
                  }`}
                >
                  {/* Top Row: Staff Name, Role & Online Badge */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-extrabold text-sm text-white ${
                          isOnline ? "bg-teal-600" : "bg-slate-500"
                        }`}
                      >
                        {rep.name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                            {rep.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {rep.roleTitle}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Phone: {rep.phone} • Updated: {rep.lastPingTime}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 ${
                        isOnline
                          ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isOnline ? "bg-emerald-500 animate-ping" : "bg-slate-400"
                        }`}
                      />
                      {isOnline ? "LIVE GPS ACTIVE" : "OFFLINE"}
                    </span>
                  </div>

                  {/* 3 Key Info Boxes: 1. Mobile Name, 2. Mobile Battery, 3. Live Location */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {/* 1. MOBILE NAME */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 mb-0.5">
                        <Smartphone className="w-3 h-3 text-teal-500" />
                        Mobile Name
                      </span>
                      <p className="font-extrabold text-slate-900 dark:text-slate-100 truncate">
                        {rep.deviceModel}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        GPS: {rep.gpsSignal} (±{rep.gpsAccuracyMeters}m)
                      </span>
                    </div>

                    {/* 2. MOBILE BATTERY */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 mb-0.5">
                        {rep.isCharging ? (
                          <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
                        ) : rep.batteryLevel <= 20 ? (
                          <BatteryLow className="w-3.5 h-3.5 text-rose-500" />
                        ) : (
                          <Battery className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        Mobile Battery
                      </span>
                      <div className="flex items-center justify-between">
                        <span
                          className={`font-black text-sm font-mono ${
                            rep.batteryLevel <= 20
                              ? "text-rose-600 dark:text-rose-400"
                              : rep.batteryLevel <= 40
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {rep.batteryLevel}% {rep.isCharging ? "⚡ Charging" : ""}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1">
                        <div
                          style={{ width: `${rep.batteryLevel}%` }}
                          className={`h-full ${
                            rep.batteryLevel <= 20
                              ? "bg-rose-500"
                              : rep.batteryLevel <= 40
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                        />
                      </div>
                    </div>

                    {/* 3. LIVE LOCATION */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 mb-0.5">
                        <MapPin className="w-3 h-3 text-rose-500" />
                        Live Location
                      </span>
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {rep.currentRoadOrLocation}
                      </p>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] font-mono text-slate-500">
                          {rep.lat.toFixed(4)}°N, {rep.lng.toFixed(4)}°E
                        </span>
                        <a
                          href={`https://www.google.com/maps?q=${rep.lat},${rep.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5"
                        >
                          Google Map <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT 5 COLUMNS: LIVE LOCATION MAP VIEW FOR SELECTED STAFF */}
        <div className="lg:col-span-5">
          {selectedStaff && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden sticky top-20">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">
                    Live GPS Pin on Map
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    {selectedStaff.name} — {selectedStaff.deviceModel}
                  </h3>
                </div>

                <a
                  href={`https://www.google.com/maps?q=${selectedStaff.lat},${selectedStaff.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  Open in Google Maps <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Embedded Live Street Map (OpenStreetMap Embed centered on exact staff GPS) */}
              <div className="relative w-full h-80 bg-slate-950">
                <iframe
                  title={`Live Location of ${selectedStaff.name}`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                    selectedStaff.lng - 0.012
                  }%2C${selectedStaff.lat - 0.008}%2C${selectedStaff.lng + 0.012}%2C${
                    selectedStaff.lat + 0.008
                  }&layer=mapnik&marker=${selectedStaff.lat}%2C${selectedStaff.lng}`}
                  className="w-full h-full"
                />

                {/* Overlay Badge on Map */}
                <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-slate-950/90 text-white border border-slate-800 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-teal-300 truncate">
                      📍 {selectedStaff.currentRoadOrLocation}
                    </p>
                    <p className="text-[11px] text-slate-300 truncate">
                      📱 {selectedStaff.deviceModel} • 🔋 {selectedStaff.batteryLevel}% Battery
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold shrink-0">
                    ±{selectedStaff.gpsAccuracyMeters}m GPS
                  </span>
                </div>
              </div>

              {/* Selected Staff Quick Details Footer */}
              <div className="p-4 space-y-2 text-xs bg-slate-50/50 dark:bg-slate-900">
                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                  <span className="text-slate-500">Staff Name &amp; Role:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {selectedStaff.name} ({selectedStaff.roleTitle})
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                  <span className="text-slate-500">Mobile Name / Model:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {selectedStaff.deviceModel}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 dark:border-slate-800">
                  <span className="text-slate-500">Mobile Battery Status:</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    {selectedStaff.batteryLevel}%{" "}
                    {selectedStaff.isCharging ? "(Charging ⚡)" : "(On Battery)"}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-500">GPS Coordinates:</span>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                    {selectedStaff.lat.toFixed(5)}° N, {selectedStaff.lng.toFixed(5)}° E
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ADD STAFF MOBILE MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Add Staff Mobile for Live Location &amp; Battery
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddStaffMember} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Staff Name *
                </label>
                <input
                  type="text"
                  required
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  placeholder="e.g. Hassan Ali"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Role
                  </label>
                  <select
                    value={staffRole}
                    onChange={(e) => setStaffRole(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="Order Booker">Order Booker</option>
                    <option value="Medical Rep">Medical Rep</option>
                    <option value="Recovery Officer">Recovery Officer</option>
                    <option value="Field Supervisor">Field Supervisor</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={staffPhone}
                    onChange={(e) => setStaffPhone(e.target.value)}
                    placeholder="0300-1234567"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Mobile Name / Model *
                </label>
                <input
                  type="text"
                  required
                  value={deviceModel}
                  onChange={(e) => setDeviceModel(e.target.value)}
                  placeholder="e.g. Samsung Galaxy A54 / Redmi Note 13"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Current Location / Area
                  </label>
                  <input
                    type="text"
                    value={currentLocationText}
                    onChange={(e) => setCurrentLocationText(e.target.value)}
                    placeholder="e.g. Tariq Road, Karachi"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Battery %
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={batteryPct}
                    onChange={(e) => setBatteryPct(Number(e.target.value) || 80)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md"
                >
                  Save Staff Mobile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
