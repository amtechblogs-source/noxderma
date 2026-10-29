"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  MapPin,
  Battery,
  BatteryCharging,
  BatteryLow,
  Smartphone,
  Monitor,
  Tablet,
  RefreshCw,
  Plus,
  ExternalLink,
  ArrowLeft,
  Search,
  Navigation,
  Trash2,
  PlugZap,
  Layers,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import {
  detectDeviceMetadata,
  getOrCreateDeviceInstanceId,
} from "@/lib/monitoring/deviceIdentity";
import type { StaffMonitoringProfile } from "@/types";

const DEMO_OR_LEGACY_PREFIXES = ["staff_ali", "staff_bilal", "staff_kamran", "staff_usman"];

type DeviceFilterTab = "all" | "online" | "mobile" | "desktop" | "low_battery";

type EffectivePresence = {
  tier: "live" | "recent" | "offline";
  badgeText: string;
  lastSeenText: string;
};

function computeEffectivePresence(
  rep: StaffMonitoringProfile,
  nowMs: number
): EffectivePresence {
  if (rep.id.startsWith("unconnected_")) {
    return {
      tier: "offline",
      badgeText: "NOT LOGGED IN YET",
      lastSeenText: "Waiting for device login",
    };
  }

  const parsedMs = rep.lastUpdatedIso ? Date.parse(rep.lastUpdatedIso) : NaN;
  const hasValidIso = Number.isFinite(parsedMs);
  const ageSec = hasValidIso ? Math.max(0, Math.floor((nowMs - parsedMs) / 1000)) : null;

  let relative = rep.lastPingTime || "Unknown";
  if (ageSec !== null) {
    if (ageSec < 12) relative = "Just now";
    else if (ageSec < 60) relative = `${ageSec}s ago`;
    else if (ageSec < 3600) relative = `${Math.floor(ageSec / 60)}m ago`;
    else if (ageSec < 86400) relative = `${Math.floor(ageSec / 3600)}h ago`;
    else relative = `${Math.floor(ageSec / 86400)}d ago`;
  }

  if (rep.liveState === "offline") {
    return {
      tier: "offline",
      badgeText: rep.statusHeadline === "Logged Out" ? "LOGGED OUT" : "OFFLINE",
      lastSeenText: relative,
    };
  }

  // If lastUpdatedIso is present, verify staleness so closed browsers or expired data packages don't stay green forever
  if (ageSec !== null) {
    if (ageSec <= 50) {
      return {
        tier: "live",
        badgeText: rep.hasRealGpsFix ? "LIVE GPS ACTIVE" : "ONLINE SESSION",
        lastSeenText: relative,
      };
    }
    if (ageSec <= 180) {
      return {
        tier: "recent",
        badgeText: "IDLE / RECENT",
        lastSeenText: relative,
      };
    }
    return {
      tier: "offline",
      badgeText: "OFFLINE (INACTIVE)",
      lastSeenText: `Last seen ${relative}`,
    };
  }

  // Manual custom device record without ISO timestamp
  return {
    tier: "recent",
    badgeText: "MANUAL TRACKER",
    lastSeenText: relative,
  };
}

export default function StaffLocationAndPhoneStatusPage() {
  const [staffList, setStaffList] = useState<StaffMonitoringProfile[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [filterTab, setFilterTab] = useState<DeviceFilterTab>("all");
  const [currentDeviceId, setCurrentDeviceId] = useState<string>("");
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Add Custom Staff Device Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [staffName, setStaffName] = useState<string>("");
  const [staffRole, setStaffRole] = useState<StaffMonitoringProfile["roleTitle"]>("Order Booker");
  const [staffPhone, setStaffPhone] = useState<string>("");
  const [deviceModel, setDeviceModel] = useState<string>("");
  const [currentLocationText, setCurrentLocationText] = useState<string>("");
  const [batteryPct, setBatteryPct] = useState<number>(100);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    setCurrentDeviceId(getOrCreateDeviceInstanceId());
  }, []);

  const loadAndAutoFetchStaff = useCallback(async () => {
    try {
      const [dbRecords, realUsers] = await Promise.all([
        offlineDb.staffMonitors?.toArray() || Promise.resolve([]),
        offlineDb.users?.toArray() || Promise.resolve([]),
      ]);

      const validSessions: StaffMonitoringProfile[] = [];
      const legacyIdsToDelete: string[] = [];

      for (const s of dbRecords) {
        if (!s || !s.id) continue;
        // Purge demo entries & old single-key `user_*` records that caused PC/Mobile battery conflicts
        if (DEMO_OR_LEGACY_PREFIXES.includes(s.id) || s.id.startsWith("user_")) {
          legacyIdsToDelete.push(s.id);
          continue;
        }
        validSessions.push(s);
      }

      if (legacyIdsToDelete.length > 0) {
        await offlineDb.staffMonitors?.bulkDelete(legacyIdsToDelete).catch(() => {});
      }

      const roleMap: Record<string, StaffMonitoringProfile["roleTitle"]> = {
        owner: "Owner / Admin",
        admin: "Owner / Admin",
        manager: "Field Supervisor",
        accountant: "Accountant",
        warehouse_staff: "Store Staff",
        sales_rep: "Order Booker",
        booking_user: "Order Booker",
        medical_rep: "Medical Rep",
        recovery_officer: "Recovery Officer",
      };

      const userById = new Map(realUsers.map((u) => [u.id, u]));

      // Enrich each device session with latest user displayName / role / phone without touching its independent battery or deviceModel
      const enrichedSessions = validSessions.map((session) => {
        const matchedUser = session.userId ? userById.get(session.userId) : undefined;
        if (!matchedUser) return session;
        return {
          ...session,
          name: matchedUser.displayName || matchedUser.email || session.name,
          roleTitle: roleMap[matchedUser.role] || session.roleTitle,
          phone: matchedUser.phone || matchedUser.email || session.phone,
          userEmail: matchedUser.email,
        };
      });

      // Add read-only placeholder cards ONLY for registered staff accounts that have 0 logged-in devices so far
      const usersWithSessions = new Set(
        enrichedSessions.map((s) => s.userId).filter(Boolean) as string[]
      );

      const unconnectedPlaceholders: StaffMonitoringProfile[] = [];
      for (const u of realUsers) {
        if (!usersWithSessions.has(u.id)) {
          unconnectedPlaceholders.push({
            id: `unconnected_${u.id}`,
            userId: u.id,
            userEmail: u.email,
            accountRole: u.role,
            name: u.displayName || u.email,
            roleTitle: roleMap[u.role] || "Order Booker",
            phone: u.phone || u.email,
            vehicleType: "bike",
            territory: "Karachi",
            liveState: "offline",
            statusHeadline: "Not Logged In Yet",
            currentSpeedKmh: 0,
            currentRoadOrLocation: "Waiting for staff login on mobile/PC",
            shiftStartTime: "--:--",
            batteryLevel: 0,
            isCharging: false,
            hasBatteryApi: false,
            hasRealGpsFix: false,
            gpsAccuracyMeters: 0,
            gpsSignal: "GPS Disabled",
            lastPingTime: "Never",
            deviceModel: "No Device Connected",
            lat: 24.8607,
            lng: 67.0011,
            x: 50,
            y: 50,
            dayRoute: [],
          });
        }
      }

      const now = Date.now();
      setNowMs(now);

      const combined = [...enrichedSessions, ...unconnectedPlaceholders].sort((a, b) => {
        const presA = computeEffectivePresence(a, now);
        const presB = computeEffectivePresence(b, now);
        const rank = { live: 0, recent: 1, offline: 2 };
        if (rank[presA.tier] !== rank[presB.tier]) {
          return rank[presA.tier] - rank[presB.tier];
        }
        const timeA = a.lastUpdatedIso ? Date.parse(a.lastUpdatedIso) : 0;
        const timeB = b.lastUpdatedIso ? Date.parse(b.lastUpdatedIso) : 0;
        return timeB - timeA;
      });

      setStaffList(combined);
      setSelectedStaffId((prevId) => {
        if (prevId && combined.some((s) => s.id === prevId)) return prevId;
        return combined[0]?.id || "";
      });
    } catch (err) {
      console.warn("Staff monitoring load warning:", err);
    }
  }, []);

  // Auto-refresh on Cloud Firestore sync events + every 10 seconds
  useEffect(() => {
    loadAndAutoFetchStaff();

    const handleCloudUpdate = () => {
      loadAndAutoFetchStaff();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudUpdate);
    const pollInterval = setInterval(loadAndAutoFetchStaff, 10_000); // 10-second refresh delay

    return () => {
      window.removeEventListener("noxderma-cloud-synced", handleCloudUpdate);
      clearInterval(pollInterval);
    };
  }, [loadAndAutoFetchStaff]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadAndAutoFetchStaff();
    setTimeout(() => setIsRefreshing(false), 400);
  };

  const handleRemoveDeviceSession = async (rep: StaffMonitoringProfile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (rep.id.startsWith("unconnected_")) return;
    try {
      await offlineDb.staffMonitors?.delete(rep.id);
      await loadAndAutoFetchStaff();
      showToast(`Removed device session "${rep.deviceModel}" for ${rep.name}.`);
    } catch {}
  };

  // Count how many distinct devices each userId has logged in on, and assign per-user mobile index (#1, #2...)
  const multiDeviceInfo = useMemo(() => {
    const countsByUser = new Map<string, number>();
    const mobileIdxBySession = new Map<string, number>();
    const userMobileCounter = new Map<string, number>();

    for (const s of staffList) {
      if (s.id.startsWith("unconnected_") || !s.userId) continue;
      countsByUser.set(s.userId, (countsByUser.get(s.userId) || 0) + 1);
    }

    for (const s of staffList) {
      if (s.id.startsWith("unconnected_") || !s.userId) continue;
      if (s.deviceCategory !== "desktop") {
        const nextNum = (userMobileCounter.get(s.userId) || 0) + 1;
        userMobileCounter.set(s.userId, nextNum);
        mobileIdxBySession.set(s.id, nextNum);
      }
    }

    return { countsByUser, mobileIdxBySession };
  }, [staffList]);

  // Add manual staff mobile tracker
  const handleAddStaffMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName.trim()) return;

    const meta = await detectDeviceMetadata();
    const idx = staffList.length + 1;
    const now = new Date();
    const newStaff: StaffMonitoringProfile = {
      id: `manual_device_${Date.now()}`,
      deviceCategory: "mobile",
      hasBatteryApi: true,
      hasRealGpsFix: false,
      lastUpdatedIso: now.toISOString(),
      name: staffName.trim(),
      roleTitle: staffRole,
      phone: staffPhone.trim() || "0300-0000000",
      vehicleType: "bike",
      territory: currentLocationText.trim() || "Karachi",
      liveState: "moving",
      statusHeadline: "Manual Device Entry",
      currentSpeedKmh: 0,
      currentRoadOrLocation: currentLocationText.trim() || "Tariq Road, Karachi",
      shiftStartTime: now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      batteryLevel: Math.min(100, Math.max(1, Number(batteryPct) || 85)),
      isCharging: false,
      gpsAccuracyMeters: 10,
      gpsSignal: "Moderate Signal",
      lastPingTime: "Just now",
      deviceModel: deviceModel.trim() || meta.deviceModel,
      lat: 24.8689 + (idx % 5) * 0.004,
      lng: 67.0612 + (idx % 5) * 0.004,
      x: 30 + ((idx * 14) % 50),
      y: 28 + ((idx * 12) % 48),
      dayRoute: [],
    };

    await offlineDb.staffMonitors?.put(newStaff);
    await loadAndAutoFetchStaff();
    setSelectedStaffId(newStaff.id);
    setStaffName("");
    setStaffPhone("");
    setDeviceModel("");
    setIsAddModalOpen(false);
    showToast(`Added ${newStaff.name} (${newStaff.deviceModel}) to device monitor.`);
  };

  const connectedDevices = useMemo(
    () => staffList.filter((s) => !s.id.startsWith("unconnected_")),
    [staffList]
  );

  const onlineLiveCount = useMemo(
    () =>
      connectedDevices.filter((s) => {
        const p = computeEffectivePresence(s, nowMs);
        return p.tier === "live" || p.tier === "recent";
      }).length,
    [connectedDevices, nowMs]
  );

  const lowBatteryCount = useMemo(
    () =>
      connectedDevices.filter(
        (s) =>
          !s.isDesktopAcPower &&
          s.hasBatteryApi !== false &&
          s.deviceCategory !== "desktop" &&
          s.batteryLevel > 0 &&
          s.batteryLevel <= 20
      ).length,
    [connectedDevices]
  );

  const filteredStaff = useMemo(() => {
    return staffList.filter((s) => {
      const q = search.trim().toLowerCase();
      if (q) {
        const matchesQuery =
          s.name.toLowerCase().includes(q) ||
          s.deviceModel.toLowerCase().includes(q) ||
          s.currentRoadOrLocation.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          s.roleTitle.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      const presence = computeEffectivePresence(s, nowMs);
      if (filterTab === "online") return presence.tier === "live" || presence.tier === "recent";
      if (filterTab === "mobile")
        return !s.id.startsWith("unconnected_") && s.deviceCategory !== "desktop";
      if (filterTab === "desktop")
        return !s.id.startsWith("unconnected_") && s.deviceCategory === "desktop";
      if (filterTab === "low_battery")
        return (
          !s.id.startsWith("unconnected_") &&
          !s.isDesktopAcPower &&
          s.hasBatteryApi !== false &&
          s.batteryLevel <= 20
        );
      return true;
    });
  }, [staffList, search, filterTab, nowMs]);

  const selectedStaff = useMemo(
    () =>
      filteredStaff.find((s) => s.id === selectedStaffId) ||
      staffList.find((s) => s.id === selectedStaffId) ||
      filteredStaff[0] ||
      staffList[0],
    [filteredStaff, staffList, selectedStaffId]
  );

  const renderDeviceIcon = (cat?: "mobile" | "tablet" | "desktop", className = "w-4 h-4") => {
    if (cat === "desktop") return <Monitor className={className} />;
    if (cat === "tablet") return <Tablet className={className} />;
    return <Smartphone className={className} />;
  };

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
            <MapPin className="w-6 h-6 text-teal-600 shrink-0" />
            <span>Staff Live Location &amp; Multi-Device Battery</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Har logged-in mobile aur computer alag alag (independent battery, charging &amp; live GPS) ke sath har 10s baad auto-sync hota hai.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="px-3 py-2 rounded-xl border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span>Auto-Sync (10s)</span>
          </div>

          <button
            type="button"
            onClick={handleManualRefresh}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5"
            title="Refresh live device statuses"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-teal-600" : ""}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/20"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Manual Mobile</span>
          </button>
        </div>
      </div>

      {/* 3 SUMMARY KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Active Logged-In Devices
            </span>
            <span className="text-2xl font-black text-emerald-600">
              {onlineLiveCount} / {connectedDevices.length}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Separate per Mobile &amp; Computer
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
            <Navigation className="w-5 h-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Selected Device Session
            </span>
            <span className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 truncate block mt-0.5">
              {selectedStaff?.deviceModel || "No Device Selected"}
            </span>
            <span className="text-[11px] text-teal-600 dark:text-teal-400 font-semibold truncate block mt-0.5">
              {selectedStaff ? `${selectedStaff.name} (${selectedStaff.roleTitle})` : "—"}
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 flex items-center justify-center shrink-0">
            {renderDeviceIcon(selectedStaff?.deviceCategory, "w-5 h-5")}
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Low Battery Mobiles (&le;20%)
            </span>
            <span
              className={`text-2xl font-black ${
                lowBatteryCount > 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"
              }`}
            >
              {lowBatteryCount} {lowBatteryCount === 1 ? "Mobile" : "Mobiles"}
            </span>
            <span className="text-[11px] text-slate-500 block mt-0.5">
              Computers on AC excluded
            </span>
          </div>
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center shrink-0">
            <Battery className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* FILTER PILLS & SEARCH BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {(
            [
              { id: "all", label: `All (${staffList.length})` },
              { id: "online", label: `Online Now (${onlineLiveCount})` },
              {
                id: "mobile",
                label: `Mobiles (${connectedDevices.filter((s) => s.deviceCategory !== "desktop").length})`,
              },
              {
                id: "desktop",
                label: `Computers (${connectedDevices.filter((s) => s.deviceCategory === "desktop").length})`,
              },
              { id: "low_battery", label: `Low Battery (${lowBatteryCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-all ${
                filterTab === tab.id
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff, phone model, PC, area..."
            className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* MAIN CONTENT: DEVICE SESSIONS LIST (LEFT) + LIVE LOCATION MAP (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 7 COLUMNS: SEPARATE DEVICE CARDS */}
        <div className="lg:col-span-7 space-y-3 min-w-0">
          {filteredStaff.length === 0 ? (
            <div className="p-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-2">
              <Smartphone className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                No matching staff devices found
              </p>
              <p className="text-xs text-slate-500">
                Try switching the filter tab above or clearing your search query.
              </p>
            </div>
          ) : (
            filteredStaff.map((rep) => {
              const isSelected = rep.id === selectedStaff?.id;
              const isPlaceholder = rep.id.startsWith("unconnected_");
              const isThisBrowser = Boolean(currentDeviceId && rep.deviceId === currentDeviceId);
              const presence = computeEffectivePresence(rep, nowMs);
              const userDeviceCount = rep.userId
                ? multiDeviceInfo.countsByUser.get(rep.userId) || 1
                : 1;
              const mobileNumber = multiDeviceInfo.mobileIdxBySession.get(rep.id) || 1;
              const isDesktop = rep.deviceCategory === "desktop";

              const deviceTypeBadge = isPlaceholder
                ? "Not Connected"
                : isDesktop
                ? "Computer / PC"
                : rep.deviceCategory === "tablet"
                ? "Tablet"
                : userDeviceCount > 1 &&
                  staffList.filter(
                    (x) =>
                      !x.id.startsWith("unconnected_") &&
                      x.userId === rep.userId &&
                      x.deviceCategory !== "desktop"
                  ).length > 1
                ? `Mobile #${mobileNumber}`
                : "Mobile Phone";

              return (
                <div
                  key={rep.id}
                  onClick={() => setSelectedStaffId(rep.id)}
                  className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm cursor-pointer transition-all ${
                    isSelected
                      ? "border-teal-500 ring-2 ring-teal-500/20"
                      : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                  }`}
                >
                  {/* Top Row: Staff Name, Role, Multi-Device Badges & Live Presence */}
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-sm text-white shrink-0 ${
                          presence.tier === "live"
                            ? "bg-teal-600"
                            : presence.tier === "recent"
                            ? "bg-amber-600"
                            : "bg-slate-500"
                        }`}
                      >
                        {renderDeviceIcon(rep.deviceCategory, "w-5 h-5")}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">
                            {rep.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {rep.roleTitle}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isDesktop
                                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300"
                                : "bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300"
                            }`}
                          >
                            {deviceTypeBadge}
                          </span>
                          {isThisBrowser && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-600 text-white inline-flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> This Device
                            </span>
                          )}
                          {userDeviceCount > 1 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 inline-flex items-center gap-1">
                              <Layers className="w-2.5 h-2.5" /> {userDeviceCount} Devices Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span className="truncate">{rep.phone}</span>
                          <span>&bull;</span>
                          <span className="inline-flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
                            <Clock className="w-3 h-3" /> {presence.lastSeenText}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1.5 ${
                          presence.tier === "live"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                            : presence.tier === "recent"
                            ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            presence.tier === "live"
                              ? "bg-emerald-500 animate-pulse"
                              : presence.tier === "recent"
                              ? "bg-amber-500"
                              : "bg-slate-400"
                          }`}
                        />
                        {presence.badgeText}
                      </span>

                      {!isPlaceholder && !isThisBrowser && (
                        <button
                          type="button"
                          onClick={(e) => handleRemoveDeviceSession(rep, e)}
                          title="Remove disconnected/old device session"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 3 Independent Info Boxes: 1. Device Model, 2. Independent Power / Battery, 3. Live Location */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    {/* 1. DEVICE MODEL */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 mb-0.5">
                        {renderDeviceIcon(rep.deviceCategory, "w-3 h-3 text-teal-500")}
                        {isDesktop ? "Computer / Browser" : "Mobile Model"}
                      </span>
                      <p className="font-extrabold text-slate-900 dark:text-slate-100 truncate">
                        {rep.deviceModel}
                      </p>
                      <span className="text-[10px] text-slate-500 block truncate">
                        {rep.hasRealGpsFix
                          ? `GPS: ${rep.gpsSignal} (±${rep.gpsAccuracyMeters}m)`
                          : isPlaceholder
                          ? "Awaiting first login"
                          : "GPS: Permission Off / Session Mode"}
                      </span>
                    </div>

                    {/* 2. INDEPENDENT POWER / BATTERY */}
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                      <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1 mb-0.5">
                        {isPlaceholder ? (
                          <Battery className="w-3.5 h-3.5 text-slate-400" />
                        ) : rep.isDesktopAcPower ? (
                          <PlugZap className="w-3.5 h-3.5 text-indigo-500" />
                        ) : rep.isCharging ? (
                          <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
                        ) : rep.batteryLevel <= 20 ? (
                          <BatteryLow className="w-3.5 h-3.5 text-rose-500" />
                        ) : (
                          <Battery className="w-3.5 h-3.5 text-emerald-500" />
                        )}
                        {isDesktop ? "Power Status" : "Mobile Battery"}
                      </span>

                      {isPlaceholder ? (
                        <>
                          <span className="font-bold text-xs text-slate-400 block">—</span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            No device active
                          </span>
                        </>
                      ) : rep.isDesktopAcPower ? (
                        <>
                          <span className="font-extrabold text-xs text-indigo-600 dark:text-indigo-400 block">
                            ⚡ AC Wall Power (PC)
                          </span>
                          <div className="w-full h-1.5 rounded-full bg-indigo-100 dark:bg-indigo-950 overflow-hidden mt-1.5">
                            <div className="h-full w-full bg-indigo-500 rounded-full" />
                          </div>
                        </>
                      ) : rep.hasBatteryApi === false ? (
                        <>
                          <span className="font-bold text-xs text-slate-600 dark:text-slate-300 block">
                            Browser Protected
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            iOS / Safari restricts battery %
                          </span>
                        </>
                      ) : (
                        <>
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
                              style={{ width: `${Math.min(100, Math.max(0, rep.batteryLevel))}%` }}
                              className={`h-full transition-all duration-500 ${
                                rep.batteryLevel <= 20
                                  ? "bg-rose-500"
                                  : rep.batteryLevel <= 40
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                          </div>
                        </>
                      )}
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
                      <div className="flex items-center justify-between mt-0.5 gap-1">
                        <span className="text-[10px] font-mono text-slate-500 truncate">
                          {isPlaceholder
                            ? "—"
                            : `${rep.lat.toFixed(4)}°N, ${rep.lng.toFixed(4)}°E`}
                        </span>
                        {!isPlaceholder && (
                          <a
                            href={`https://www.google.com/maps?q=${rep.lat},${rep.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] font-bold text-teal-600 dark:text-teal-400 hover:underline inline-flex items-center gap-0.5 shrink-0"
                          >
                            Map <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RIGHT 5 COLUMNS: LIVE LOCATION MAP VIEW FOR SELECTED DEVICE SESSION */}
        <div className="lg:col-span-5">
          {selectedStaff && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden sticky top-20">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400 block">
                    Selected Device GPS Pin
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">
                    {selectedStaff.name} — {selectedStaff.deviceModel}
                  </h3>
                </div>

                {!selectedStaff.id.startsWith("unconnected_") && (
                  <a
                    href={`https://www.google.com/maps?q=${selectedStaff.lat},${selectedStaff.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                  >
                    Google Maps <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

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

                <div className="absolute bottom-3 left-3 right-3 p-3 rounded-xl bg-slate-950/90 text-white border border-slate-800 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-extrabold text-teal-300 truncate">
                      📍 {selectedStaff.currentRoadOrLocation}
                    </p>
                    <p className="text-[11px] text-slate-300 truncate">
                      {selectedStaff.deviceModel} &bull;{" "}
                      {selectedStaff.isDesktopAcPower
                        ? "⚡ AC Wall Power (PC)"
                        : selectedStaff.hasBatteryApi === false
                        ? "Battery Hidden"
                        : `🔋 ${selectedStaff.batteryLevel}% ${
                            selectedStaff.isCharging ? "(Charging)" : ""
                          }`}
                    </p>
                  </div>
                  <span className="px-2 py-1 rounded bg-emerald-600 text-white font-mono text-[10px] font-bold shrink-0">
                    {selectedStaff.hasRealGpsFix
                      ? `±${selectedStaff.gpsAccuracyMeters}m GPS`
                      : "Default Pin"}
                  </span>
                </div>
              </div>

              <div className="p-4 space-y-2 text-xs bg-slate-50/50 dark:bg-slate-900">
                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 dark:border-slate-800 gap-2">
                  <span className="text-slate-500">Account &amp; Role:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-right">
                    {selectedStaff.name} ({selectedStaff.roleTitle})
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 dark:border-slate-800 gap-2">
                  <span className="text-slate-500">Device &amp; Session ID:</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100 text-right truncate">
                    {selectedStaff.deviceModel}
                    {selectedStaff.deviceId ? ` (${selectedStaff.deviceId.slice(-6)})` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 border-b border-slate-200/70 dark:border-slate-800 gap-2">
                  <span className="text-slate-500">Power / Battery:</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    {selectedStaff.id.startsWith("unconnected_")
                      ? "Not Connected"
                      : selectedStaff.isDesktopAcPower
                      ? "AC Wall Power (Plugged In ⚡)"
                      : selectedStaff.hasBatteryApi === false
                      ? "Browser Restricted"
                      : `${selectedStaff.batteryLevel}% ${
                          selectedStaff.isCharging ? "(Charging ⚡)" : "(On Battery)"
                        }`}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1 gap-2">
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

      {/* ADD MANUAL STAFF MOBILE MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Add Manual Staff Mobile Tracker
              </h3>
              <button
                type="button"
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
