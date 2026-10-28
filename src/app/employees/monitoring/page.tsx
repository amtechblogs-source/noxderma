"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import {
  MapPin,
  Play,
  Pause,
  RotateCcw,
  Navigation,
  Battery,
  BatteryCharging,
  BatteryLow,
  BatteryWarning,
  Wifi,
  ShoppingBag,
  Banknote,
  CheckCircle2,
  Clock,
  Camera,
  Plus,
  ShieldCheck,
  AlertTriangle,
  UserCheck,
  Compass,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Smartphone,
  Sparkles,
  Eye,
  Flag,
  Check,
  X,
  Calendar,
  Route,
  Building2,
  Stethoscope,
  Activity,
} from "lucide-react";
import { formatPKR } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import { recordActivity } from "@/lib/audit/auditTracker";
import { useAuth } from "@/context/AuthContext";
import {
  DEFAULT_STAFF_MONITORS,
  DEFAULT_BEAT_PLANS,
  DEFAULT_LIVE_MAP_PINS,
  DEFAULT_GEO_PHOTOS,
  burnGeoWatermarkOnImage,
} from "@/lib/monitoring/seedData";
import type {
  StaffMonitoringProfile,
  StaffLiveState,
  DailyBeatPlan,
  BeatShopItem,
  LiveMapTransactionPin,
  GeoVerifiedPhoto,
  Customer,
} from "@/types";

export default function StaffWorkingMonitorPage() {
  const { currentUser } = useAuth();

  // Core State
  const [staffList, setStaffList] = useState<StaffMonitoringProfile[]>(DEFAULT_STAFF_MONITORS);
  const [selectedStaffId, setSelectedStaffId] = useState<string>("staff_ali");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [statusFilter, setStatusFilter] = useState<StaffLiveState | "all">("all");

  // Beat Plans, Live Pins & Geo Photos
  const [beatPlans, setBeatPlans] = useState<DailyBeatPlan[]>(DEFAULT_BEAT_PLANS);
  const [livePins, setLivePins] = useState<LiveMapTransactionPin[]>(DEFAULT_LIVE_MAP_PINS);
  const [geoPhotos, setGeoPhotos] = useState<GeoVerifiedPhoto[]>(DEFAULT_GEO_PHOTOS);
  const [savedCustomers, setSavedCustomers] = useState<Customer[]>([]);

  // Map Controls & Layer Filters
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [mapDarkTheme, setMapDarkTheme] = useState<boolean>(true);
  const [showLayerBreadcrumbs, setShowLayerBreadcrumbs] = useState<boolean>(true);
  const [showLayerBeatShops, setShowLayerBeatShops] = useState<boolean>(true);
  const [showLayerOrderCashPins, setShowLayerOrderCashPins] = useState<boolean>(true);
  const [showLayerAllStaff, setShowLayerAllStaff] = useState<boolean>(true);
  const [activeMapPopup, setActiveMapPopup] = useState<{
    title: string;
    subtitle: string;
    badge: string;
    badgeColor: string;
    details: string;
    x: number;
    y: number;
  } | null>(null);

  // 2. InDrive-Style Day Route Playback State
  const [isPlayingRoute, setIsPlayingRoute] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(100); // 0 to 100
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);
  const animFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);

  // 6. Real HTML5 Battery & Geolocation Hardware Telemetry State
  const [hardwareTelemetry, setHardwareTelemetry] = useState<{
    supported: boolean;
    level: number;
    charging: boolean;
    gpsStatus: string;
    lat?: number;
    lng?: number;
    accuracy?: number;
    lastSyncedAt?: string;
  }>({
    supported: false,
    level: 76,
    charging: false,
    gpsStatus: "High Accuracy Active",
  });

  // Modals State
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pinType, setPinType] = useState<"booking" | "recovery">("booking");
  const [pinShopName, setPinShopName] = useState<string>("K-Electric Medical Store");
  const [pinAreaName, setPinAreaName] = useState<string>("Shahrah-e-Faisal Link");
  const [pinAmountPkr, setPinAmountPkr] = useState<number>(42000);

  const [isBeatModalOpen, setIsBeatModalOpen] = useState<boolean>(false);
  const [newBeatShopName, setNewBeatShopName] = useState<string>("");
  const [newBeatShopArea, setNewBeatShopArea] = useState<string>("Tariq Road");
  const [newBeatShopContact, setNewBeatShopContact] = useState<string>("");
  const [newBeatShopCategory, setNewBeatShopCategory] = useState<"pharmacy" | "clinic" | "distributor">("pharmacy");

  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState<boolean>(false);
  const [photoShopName, setPhotoShopName] = useState<string>("K-Electric Medical Store");
  const [photoAreaName, setPhotoAreaName] = useState<string>("Tariq Road, Karachi");
  const [photoCategory, setPhotoCategory] = useState<"shelf_display" | "prescription_desk" | "shop_check_in">("shelf_display");
  const [photoCaption, setPhotoCaption] = useState<string>("");
  const [isProcessingPhoto, setIsProcessingPhoto] = useState<boolean>(false);
  const [previewLightboxPhoto, setPreviewLightboxPhoto] = useState<GeoVerifiedPhoto | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Load persisted data from IndexedDB / localStorage + sync with real bookings/payments
  useEffect(() => {
    async function loadMonitoringData() {
      try {
        const custs = await offlineDb.customers.toArray();
        setSavedCustomers(custs);
      } catch {}

      // 1. Staff Monitors
      try {
        const dbStaff = await offlineDb.staffMonitors?.toArray();
        if (dbStaff && dbStaff.length > 0) {
          setStaffList(dbStaff);
        } else {
          const saved = localStorage.getItem("noxderma_staff_monitors");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) setStaffList(parsed);
          } else {
            await offlineDb.staffMonitors?.bulkPut(DEFAULT_STAFF_MONITORS);
          }
        }
      } catch {}

      // 2. Beat Plans
      try {
        const dbBeats = await offlineDb.dailyBeatPlans?.toArray();
        if (dbBeats && dbBeats.length > 0) {
          setBeatPlans(dbBeats);
        } else {
          const saved = localStorage.getItem("noxderma_daily_beat_plans");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) setBeatPlans(parsed);
          } else {
            await offlineDb.dailyBeatPlans?.bulkPut(DEFAULT_BEAT_PLANS);
          }
        }
      } catch {}

      // 3. Live Order & Cash Recovery Pins (+ merge real salesBookings / payments if present)
      try {
        let basePins = DEFAULT_LIVE_MAP_PINS;
        const dbPins = await offlineDb.liveMapPins?.toArray();
        if (dbPins && dbPins.length > 0) {
          basePins = dbPins;
        } else {
          const saved = localStorage.getItem("noxderma_live_map_pins");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) basePins = parsed;
          } else {
            await offlineDb.liveMapPins?.bulkPut(DEFAULT_LIVE_MAP_PINS);
          }
        }

        // Check real salesBookings and payments in offlineDb to surface on radar
        const [realBookings, realPayments] = await Promise.all([
          (offlineDb as any).salesBookings?.toArray().catch(() => []) || [],
          offlineDb.payments.toArray().catch(() => []),
        ]);

        const mergedMap = new Map<string, LiveMapTransactionPin>();
        basePins.forEach((p) => mergedMap.set(p.id, p));

        if (Array.isArray(realBookings)) {
          realBookings.slice(0, 5).forEach((bk: any, idx: number) => {
            const pinId = `pin_bk_${bk.id}`;
            if (!mergedMap.has(pinId) && bk.totalAmount > 0) {
              mergedMap.set(pinId, {
                id: pinId,
                type: "booking",
                staffId: "staff_ali",
                staffName: bk.salesRepName || "Ali Raza",
                shopName: bk.customerName || "Medical Store",
                area: bk.customerCity || "Karachi",
                amountPkr: Number(bk.totalAmount) || 0,
                referenceNo: bk.bookingRef,
                timestamp: bk.bookingDate || new Date().toISOString(),
                timeLabel: "Live Sync",
                lat: 24.87 + idx * 0.003,
                lng: 67.06 + idx * 0.003,
                x: 44 + ((idx * 11) % 38),
                y: 32 + ((idx * 9) % 42),
              });
            }
          });
        }

        if (Array.isArray(realPayments)) {
          realPayments.slice(0, 5).forEach((pay: any, idx: number) => {
            const pinId = `pin_pay_${pay.id}`;
            if (!mergedMap.has(pinId) && pay.amount > 0) {
              mergedMap.set(pinId, {
                id: pinId,
                type: "recovery",
                staffId: "staff_kamran",
                staffName: pay.receivedBy || "Kamran Siddiqui",
                shopName: pay.customerName || "Pharmacy Client",
                area: "Karachi Market",
                amountPkr: Number(pay.amount) || 0,
                referenceNo: pay.referenceNumber,
                timestamp: pay.paymentDate || new Date().toISOString(),
                timeLabel: "Live Sync",
                lat: 24.86 + idx * 0.004,
                lng: 67.04 + idx * 0.004,
                x: 28 + ((idx * 13) % 45),
                y: 48 + ((idx * 7) % 30),
              });
            }
          });
        }

        setLivePins(Array.from(mergedMap.values()));
      } catch {}

      // 4. Geo-Stamped Photos
      try {
        const dbPhotos = await offlineDb.geoVerifiedPhotos?.toArray();
        if (dbPhotos && dbPhotos.length > 0) {
          setGeoPhotos(dbPhotos);
        } else {
          const saved = localStorage.getItem("noxderma_geo_photos");
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) setGeoPhotos(parsed);
          } else {
            await offlineDb.geoVerifiedPhotos?.bulkPut(DEFAULT_GEO_PHOTOS);
          }
        }
      } catch {}
    }

    loadMonitoringData();
  }, []);

  // 6. Connect to HTML5 Battery Status API automatically on mount
  useEffect(() => {
    let batteryObj: any = null;

    async function initBatteryApi() {
      if (typeof navigator !== "undefined" && "getBattery" in navigator) {
        try {
          batteryObj = await (navigator as any).getBattery();
          const updateBattery = () => {
            const pct = Math.round((batteryObj.level ?? 0.76) * 100);
            const chg = Boolean(batteryObj.charging);
            setHardwareTelemetry((prev) => ({
              ...prev,
              supported: true,
              level: pct,
              charging: chg,
            }));
          };
          updateBattery();
          batteryObj.addEventListener("levelchange", updateBattery);
          batteryObj.addEventListener("chargingchange", updateBattery);
        } catch {
          // fallback if blocked
        }
      }
    }

    initBatteryApi();
  }, []);

  // Persist helpers
  const persistStaffList = async (updated: StaffMonitoringProfile[]) => {
    setStaffList(updated);
    localStorage.setItem("noxderma_staff_monitors", JSON.stringify(updated));
    try {
      await offlineDb.staffMonitors?.clear();
      await offlineDb.staffMonitors?.bulkPut(updated);
    } catch {}
  };

  const persistBeatPlans = async (updated: DailyBeatPlan[]) => {
    setBeatPlans(updated);
    localStorage.setItem("noxderma_daily_beat_plans", JSON.stringify(updated));
    try {
      await offlineDb.dailyBeatPlans?.clear();
      await offlineDb.dailyBeatPlans?.bulkPut(updated);
    } catch {}
  };

  const persistLivePins = async (updated: LiveMapTransactionPin[]) => {
    setLivePins(updated);
    localStorage.setItem("noxderma_live_map_pins", JSON.stringify(updated));
    try {
      await offlineDb.liveMapPins?.clear();
      await offlineDb.liveMapPins?.bulkPut(updated);
    } catch {}
  };

  const persistGeoPhotos = async (updated: GeoVerifiedPhoto[]) => {
    setGeoPhotos(updated);
    localStorage.setItem("noxderma_geo_photos", JSON.stringify(updated));
    try {
      await offlineDb.geoVerifiedPhotos?.clear();
      await offlineDb.geoVerifiedPhotos?.bulkPut(updated);
    } catch {}
  };

  // Currently selected staff member
  const selectedStaff = useMemo(
    () => staffList.find((s) => s.id === selectedStaffId) || staffList[0],
    [staffList, selectedStaffId]
  );

  // Active Beat Plan for selected staff (falls back to primary beat plan)
  const activeBeatPlan = useMemo(
    () =>
      beatPlans.find((b) => b.staffId === selectedStaff?.id) ||
      beatPlans[0],
    [beatPlans, selectedStaff]
  );

  // 2. Day Route Playback Animation Loop (60fps smooth interpolation along route segments)
  useEffect(() => {
    if (!isPlayingRoute) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      lastFrameTimeRef.current = null;
      return;
    }

    const step = (timestamp: number) => {
      if (lastFrameTimeRef.current === null) {
        lastFrameTimeRef.current = timestamp;
      }
      const deltaMs = timestamp - lastFrameTimeRef.current;
      lastFrameTimeRef.current = timestamp;

      // Full route takes ~14 seconds at 1x speed
      const increment = (deltaMs / 14000) * 100 * playbackSpeed;

      setPlaybackProgress((prev) => {
        if (prev + increment >= 100) {
          setIsPlayingRoute(false);
          return 100;
        }
        return prev + increment;
      });

      animFrameRef.current = requestAnimationFrame(step);
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlayingRoute, playbackSpeed]);

  // Compute interpolated position & active breadcrumb stop during Day Route Playback
  const playbackState = useMemo(() => {
    const route = selectedStaff?.dayRoute || [];
    if (route.length === 0) {
      return {
        x: selectedStaff?.x || 50,
        y: selectedStaff?.y || 50,
        activeStop: null,
        segmentIndex: 0,
        angleDeg: 0,
      };
    }
    if (route.length === 1 || playbackProgress >= 100) {
      const last = route[route.length - 1];
      return {
        x: last.x,
        y: last.y,
        activeStop: last,
        segmentIndex: route.length - 1,
        angleDeg: 0,
      };
    }
    if (playbackProgress <= 0) {
      const first = route[0];
      return {
        x: first.x,
        y: first.y,
        activeStop: first,
        segmentIndex: 0,
        angleDeg: 0,
      };
    }

    const totalSegments = route.length - 1;
    const exactIndex = (playbackProgress / 100) * totalSegments;
    const segIdx = Math.min(totalSegments - 1, Math.floor(exactIndex));
    const t = exactIndex - segIdx;

    const p1 = route[segIdx];
    const p2 = route[segIdx + 1];

    const x = p1.x + (p2.x - p1.x) * t;
    const y = p1.y + (p2.y - p1.y) * t;
    const angleDeg = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
    const activeStop = t < 0.5 ? p1 : p2;

    return {
      x,
      y,
      activeStop,
      segmentIndex: segIdx,
      angleDeg,
    };
  }, [selectedStaff, playbackProgress]);

  const handlePlayDayRoute = () => {
    setShowLayerBreadcrumbs(true);
    if (playbackProgress >= 99) {
      setPlaybackProgress(0);
    }
    setIsPlayingRoute(true);
  };

  // Sync live browser HTML5 Battery + Geolocation to selected staff member
  const handleSyncHardwareBatteryAndGps = async () => {
    let pct = hardwareTelemetry.level;
    let charging = hardwareTelemetry.charging;

    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      try {
        const bat = await (navigator as any).getBattery();
        pct = Math.round((bat.level ?? 0.76) * 100);
        charging = Boolean(bat.charging);
      } catch {}
    }

    const updateStaffWithTelemetry = (lat: number, lng: number, acc: number) => {
      const signal: StaffMonitoringProfile["gpsSignal"] =
        acc <= 10 ? "High Accuracy Active" : acc <= 30 ? "Moderate Signal" : "Weak Signal";

      setHardwareTelemetry({
        supported: true,
        level: pct,
        charging,
        gpsStatus: `${signal} (±${Math.round(acc)}m)`,
        lat,
        lng,
        accuracy: Math.round(acc),
        lastSyncedAt: new Date().toLocaleTimeString(),
      });

      const updated = staffList.map((s) =>
        s.id === selectedStaff.id
          ? {
              ...s,
              batteryLevel: pct,
              isCharging: charging,
              gpsAccuracyMeters: Math.round(acc),
              gpsSignal: signal,
              lastPingTime: "Just now (Hardware Synced)",
              lat,
              lng,
            }
          : s
      );
      persistStaffList(updated);
      showToast(
        `✅ Synced Hardware Telemetry for ${selectedStaff.name}: ${pct}% Battery (${
          charging ? "Charging" : "On Battery"
        }), GPS ${signal}`
      );
    };

    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          updateStaffWithTelemetry(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy || 4
          );
        },
        () => {
          updateStaffWithTelemetry(selectedStaff.lat, selectedStaff.lng, 4);
        },
        { enableHighAccuracy: true, timeout: 4000 }
      );
    } else {
      updateStaffWithTelemetry(selectedStaff.lat, selectedStaff.lng, 4);
    }
  };

  // Change live status of a staff member (Section 3)
  const handleUpdateStaffState = (staffId: string, newState: StaffLiveState) => {
    const updated = staffList.map((s) => {
      if (s.id !== staffId) return s;
      let headline = s.statusHeadline;
      let speed = s.currentSpeedKmh;
      if (newState === "moving") {
        speed = 28;
        headline = `Speed: 28 km/h on Shahrah-e-Faisal`;
      } else if (newState === "inside_customer") {
        speed = 0;
        headline = `Meeting with ${s.activeCheckInContact || "Dr. Ayesha"} — 12 mins elapsed`;
      } else if (newState === "idle") {
        speed = 0;
        headline = `Stopped for 29 mins without an active check-in`;
      } else if (newState === "offline") {
        speed = 0;
        headline = `Clocked out for the day`;
      }
      return {
        ...s,
        liveState: newState,
        currentSpeedKmh: speed,
        statusHeadline: headline,
        lastPingTime: "Just now",
      };
    });
    persistStaffList(updated);
    showToast(`Updated live radar status for staff member.`);
  };

  // Toggle Visited / Unvisited on Daily Beat Plan (Section 5)
  const handleToggleBeatStopVisited = (stopId: string) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updatedPlans = beatPlans.map((plan) => {
      if (plan.id !== activeBeatPlan.id) return plan;
      return {
        ...plan,
        stops: plan.stops.map((st) => {
          if (st.id !== stopId) return st;
          const nextVisited = !st.visited;
          return {
            ...st,
            visited: nextVisited,
            visitedAt: nextVisited ? nowTime : undefined,
          };
        }),
      };
    });
    persistBeatPlans(updatedPlans);
    showToast(`Beat stop status updated on map & route adherence gauge!`);
  };

  // Add new shop to Morning Beat Plan (Section 5)
  const handleAddShopToBeat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBeatShopName.trim()) return;

    const idx = activeBeatPlan.stops.length + 1;
    const newStop: BeatShopItem = {
      id: `bs_${Date.now()}`,
      shopName: newBeatShopName.trim(),
      contactPerson: newBeatShopContact.trim() || "Store Manager",
      area: newBeatShopArea.trim() || "Tariq Road",
      category: newBeatShopCategory,
      visited: false,
      lat: 24.872 + (idx % 5) * 0.003,
      lng: 67.062 + (idx % 5) * 0.003,
      x: 38 + ((idx * 9) % 48),
      y: 24 + ((idx * 11) % 52),
    };

    const updatedPlans = beatPlans.map((plan) => {
      if (plan.id !== activeBeatPlan.id) return plan;
      const nextStops = [...plan.stops, newStop];
      return {
        ...plan,
        beatTitle: `${plan.territory} — ${nextStops.length} Pharmacies`,
        stops: nextStops,
      };
    });

    persistBeatPlans(updatedPlans);
    setNewBeatShopName("");
    setNewBeatShopContact("");
    setIsBeatModalOpen(false);
    showToast(`Added "${newStop.shopName}" to morning beat plan (Unvisited Grey Pin placed on map).`);
  };

  // Punch Live Order Booking or Cash Recovery Pin on the Map (Section 4)
  const handleCreateLiveMapPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinShopName.trim() || pinAmountPkr <= 0) return;

    const matchedStop = activeBeatPlan.stops.find(
      (s) => s.shopName.toLowerCase() === pinShopName.trim().toLowerCase()
    );

    const newPin: LiveMapTransactionPin = {
      id: `pin_${Date.now()}`,
      type: pinType,
      staffId: selectedStaff.id,
      staffName: selectedStaff.name,
      shopName: pinShopName.trim(),
      area: pinAreaName.trim() || "Tariq Road",
      amountPkr: Number(pinAmountPkr),
      referenceNo:
        pinType === "booking"
          ? `BK-2026-${Math.floor(1000 + Math.random() * 9000)}`
          : `REC-2026-${Math.floor(100 + Math.random() * 900)}`,
      timestamp: new Date().toISOString(),
      timeLabel: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      lat: matchedStop ? matchedStop.lat : selectedStaff.lat + 0.002,
      lng: matchedStop ? matchedStop.lng : selectedStaff.lng + 0.002,
      x: matchedStop ? matchedStop.x : Math.min(88, Math.max(16, selectedStaff.x + 4)),
      y: matchedStop ? matchedStop.y : Math.min(85, Math.max(18, selectedStaff.y - 4)),
    };

    const nextPins = [newPin, ...livePins];
    await persistLivePins(nextPins);

    // If the shop is on today's beat plan, automatically mark it visited (green)
    if (matchedStop) {
      const updatedPlans = beatPlans.map((plan) => {
        if (plan.id !== activeBeatPlan.id) return plan;
        return {
          ...plan,
          stops: plan.stops.map((st) =>
            st.id === matchedStop.id
              ? {
                  ...st,
                  visited: true,
                  visitedAt: newPin.timeLabel,
                  orderBookedPkr:
                    pinType === "booking"
                      ? (st.orderBookedPkr || 0) + Number(pinAmountPkr)
                      : st.orderBookedPkr,
                  recoveryCollectedPkr:
                    pinType === "recovery"
                      ? (st.recoveryCollectedPkr || 0) + Number(pinAmountPkr)
                      : st.recoveryCollectedPkr,
                }
              : st
          ),
        };
      });
      await persistBeatPlans(updatedPlans);
    }

    await recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName,
      userRole: currentUser?.role,
      action: pinType === "booking" ? "booking_created" : "payment_collected",
      entityType: "staff_monitor_pin",
      entityId: newPin.id,
      entityTitle: `${pinType === "booking" ? "Live Booking" : "Cash Recovery"} — ${newPin.shopName}`,
      details: `${selectedStaff.name} punched ${
        pinType === "booking" ? "New Booking" : "Recovery Collected"
      }: ${formatPKR(newPin.amountPkr)} at ${newPin.shopName}`,
    });

    setIsPinModalOpen(false);
    setShowLayerOrderCashPins(true);
    setActiveMapPopup({
      title:
        pinType === "booking"
          ? `🛍️ New Booking: ${formatPKR(newPin.amountPkr)} — ${newPin.shopName}`
          : `💵 Recovery Collected: ${formatPKR(newPin.amountPkr)} Cash`,
      subtitle: `${newPin.shopName} (${newPin.area})`,
      badge: pinType === "booking" ? "ORDER BOOKED" : "CASH RECOVERY",
      badgeColor: pinType === "booking" ? "bg-violet-600" : "bg-emerald-600",
      details: `Punched by ${newPin.staffName} at ${newPin.timeLabel} • Ref: ${newPin.referenceNo}`,
      x: newPin.x,
      y: newPin.y,
    });
    showToast(
      pinType === "booking"
        ? `🛍️ Dropped Pin: "New Booking: ${formatPKR(newPin.amountPkr)} — ${newPin.shopName}"`
        : `💵 Dropped Badge: "Recovery Collected: ${formatPKR(newPin.amountPkr)} Cash — ${newPin.shopName}"`
    );
  };

  // 7. Handle Geo-Stamped Photo Upload & Watermarking
  const handleCaptureGeoPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPhoto(true);
    try {
      const catLabel =
        photoCategory === "shelf_display"
          ? "Shelf Display Audit"
          : photoCategory === "prescription_desk"
          ? "Clinic Prescription Desk"
          : "Shop Signboard Check-In";

      const watermarkedDataUrl = await burnGeoWatermarkOnImage(file, {
        staffName: `${selectedStaff.name} (${selectedStaff.roleTitle})`,
        shopName: photoShopName.trim() || "K-Electric Medical Store",
        areaName: photoAreaName.trim() || "Tariq Road, Karachi",
        lat: selectedStaff.lat,
        lng: selectedStaff.lng,
        batteryLevel: selectedStaff.batteryLevel,
        categoryLabel: catLabel,
      });

      const newPhoto: GeoVerifiedPhoto = {
        id: `photo_${Date.now()}`,
        staffId: selectedStaff.id,
        staffName: selectedStaff.name,
        shopName: photoShopName.trim() || "K-Electric Medical Store",
        category: photoCategory,
        caption:
          photoCaption.trim() ||
          `${catLabel} verified with GPS coordinates and timestamp watermark.`,
        watermarkedDataUrl,
        capturedAt: new Date().toISOString(),
        capturedTimeLabel: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        lat: selectedStaff.lat,
        lng: selectedStaff.lng,
        areaName: photoAreaName.trim() || "Tariq Road, Karachi",
        x: selectedStaff.x,
        y: selectedStaff.y,
        batteryAtCapture: selectedStaff.batteryLevel,
        auditStatus: "verified",
      };

      const updated = [newPhoto, ...geoPhotos];
      await persistGeoPhotos(updated);
      setIsPhotoModalOpen(false);
      setPhotoCaption("");
      setPreviewLightboxPhoto(newPhoto);
      showToast(`📸 Geo-Stamped Photo watermarked with Date, Time & GPS Coordinates!`);
    } catch (err) {
      console.error("Failed to watermark photo:", err);
      showToast("Could not process image file.");
    } finally {
      setIsProcessingPhoto(false);
    }
  };

  const handleUpdatePhotoAuditStatus = (
    photoId: string,
    auditStatus: GeoVerifiedPhoto["auditStatus"]
  ) => {
    const updated = geoPhotos.map((p) => (p.id === photoId ? { ...p, auditStatus } : p));
    persistGeoPhotos(updated);
    if (previewLightboxPhoto?.id === photoId) {
      setPreviewLightboxPhoto({ ...previewLightboxPhoto, auditStatus });
    }
  };

  // Beat Completion Metrics (Section 5)
  const visitedBeatCount = activeBeatPlan.stops.filter((s) => s.visited).length;
  const totalBeatCount = activeBeatPlan.stops.length;
  const beatCompletionPct =
    totalBeatCount > 0 ? Math.round((visitedBeatCount / totalBeatCount) * 100) : 0;

  // Filtered staff list for Section 3
  const filteredStaff = staffList.filter((s) =>
    statusFilter === "all" ? true : s.liveState === statusFilter
  );

  // Polyline SVG points for selected staff's day route
  const routePolylinePoints = useMemo(() => {
    return (selectedStaff?.dayRoute || []).map((pt) => `${pt.x},${pt.y}`).join(" ");
  }, [selectedStaff]);

  return (
    <div className="space-y-6 pb-10">
      {/* Live Notification Toast */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-[90] max-w-md px-4 py-3 rounded-2xl bg-slate-900 text-white border border-teal-500/40 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4">
          <Sparkles className="w-5 h-5 text-teal-400 shrink-0" />
          <span className="text-xs font-bold leading-snug">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-auto text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* TOP COMMAND HEADER */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                LIVE GPS &amp; FIELD TELEMETRY RADAR
              </span>
              <span className="text-xs font-semibold text-slate-400">
                InDrive Route Playback • Order &amp; Recovery Pins • Beat Adherence • Battery &amp; Photo Audit
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
              <Compass className="w-6 h-6 text-teal-600 shrink-0" />
              Field Staff Working Monitor &amp; Live Route Radar
            </h1>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSyncHardwareBatteryAndGps}
              className="px-3 py-2 rounded-xl border border-teal-500/30 bg-teal-50/70 dark:bg-teal-950/50 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 text-xs font-bold flex items-center gap-1.5 transition-all"
              title="Read real HTML5 Battery Status API & GPS from this device"
            >
              <Smartphone className="w-4 h-4" />
              Sync Live Battery &amp; GPS
            </button>

            <button
              onClick={() => {
                setPinType("booking");
                setPinShopName("K-Electric Medical Store");
                setPinAmountPkr(42000);
                setIsPinModalOpen(true);
              }}
              className="px-3 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-violet-600/20 transition-all"
            >
              <ShoppingBag className="w-4 h-4" />
              + Booking / Recovery Pin
            </button>

            <button
              onClick={() => setIsBeatModalOpen(true)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
            >
              <Route className="w-4 h-4 text-teal-400" />
              + Assign Beat Stop
            </button>

            <button
              onClick={() => setIsPhotoModalOpen(true)}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-teal-600/20 transition-all"
            >
              <Camera className="w-4 h-4" />
              Snap Geo-Stamped Photo
            </button>
          </div>
        </div>

        {/* 2. DAY ROUTE BREADCRUMBS & PLAYBACK CONTROL BAR (LIKE INDRIVE) */}
        <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                Select Staff:
              </span>
              <select
                value={selectedStaffId}
                onChange={(e) => {
                  setSelectedStaffId(e.target.value);
                  setIsPlayingRoute(false);
                  setPlaybackProgress(100);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-teal-500"
              >
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.roleTitle}) — {s.batteryLevel}% Bat
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-semibold"
              />
            </div>

            {/* Play Day Route Button */}
            {!isPlayingRoute ? (
              <button
                onClick={handlePlayDayRoute}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-teal-500/25 transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                Play Day Route (InDrive Replay)
              </button>
            ) : (
              <button
                onClick={() => setIsPlayingRoute(false)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25 transition-all"
              >
                <Pause className="w-4 h-4 fill-current" />
                Pause Playback ({Math.round(playbackProgress)}%)
              </button>
            )}

            <button
              onClick={() => {
                setIsPlayingRoute(false);
                setPlaybackProgress(0);
              }}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs"
              title="Reset to 9:00 AM Start"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Speed Selector */}
            <div className="flex items-center rounded-lg bg-slate-800 p-0.5 border border-slate-700">
              {([1, 2, 4] as const).map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaybackSpeed(spd)}
                  className={`px-2 py-1 rounded-md text-[11px] font-extrabold transition-all ${
                    playbackSpeed === spd
                      ? "bg-teal-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Scrubber & Live Stop Readout */}
          <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-3 xl:max-w-xl">
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-teal-300">
                  {playbackState.activeStop
                    ? `🕒 ${playbackState.activeStop.time} — ${
                        playbackState.activeStop.shopName || playbackState.activeStop.roadOrArea
                      }`
                    : "09:00 AM Shift Start"}
                </span>
                <span className="font-mono text-slate-400">
                  {playbackState.activeStop
                    ? `Stayed: ${playbackState.activeStop.dwellMinutes} mins`
                    : ""}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={0.5}
                value={playbackProgress}
                onChange={(e) => {
                  setIsPlayingRoute(false);
                  setPlaybackProgress(Number(e.target.value));
                }}
                className="w-full accent-teal-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. LIVE STATUS RADAR (VISUAL STATE COLOR CODING) */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            Live Status Radar (Visual State Color Coding)
          </h2>

          {/* Visual State Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1 rounded-full font-bold transition-all ${
                statusFilter === "all"
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
              }`}
            >
              All Staff ({staffList.length})
            </button>
            <button
              onClick={() => setStatusFilter("moving")}
              className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 transition-all ${
                statusFilter === "moving"
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
              }`}
            >
              <span>🟢</span> Moving / On Road (
              {staffList.filter((s) => s.liveState === "moving").length})
            </button>
            <button
              onClick={() => setStatusFilter("inside_customer")}
              className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 transition-all ${
                statusFilter === "inside_customer"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-500/30"
              }`}
            >
              <span>🔵</span> Inside Clinic / Pharmacy (
              {staffList.filter((s) => s.liveState === "inside_customer").length})
            </button>
            <button
              onClick={() => setStatusFilter("idle")}
              className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 transition-all ${
                statusFilter === "idle"
                  ? "bg-amber-500 text-slate-950"
                  : "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-500/30"
              }`}
            >
              <span>🟡</span> Idle &gt;25m (
              {staffList.filter((s) => s.liveState === "idle").length})
            </button>
            <button
              onClick={() => setStatusFilter("offline")}
              className={`px-3 py-1 rounded-full font-bold flex items-center gap-1.5 transition-all ${
                statusFilter === "offline"
                  ? "bg-slate-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700"
              }`}
            >
              <span>⚪</span> Shift Ended / Offline (
              {staffList.filter((s) => s.liveState === "offline").length})
            </button>
          </div>
        </div>

        {/* Staff Live Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
          {filteredStaff.map((rep) => {
            const isSelected = rep.id === selectedStaff?.id;

            const stateConfig =
              rep.liveState === "moving"
                ? {
                    dot: "🟢",
                    label: "Moving / On the Road",
                    badgeBg:
                      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
                    borderAccent: isSelected
                      ? "border-emerald-500 ring-2 ring-emerald-500/25"
                      : "border-emerald-500/30",
                  }
                : rep.liveState === "inside_customer"
                ? {
                    dot: "🔵",
                    label: "Inside Clinic / Pharmacy",
                    badgeBg:
                      "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
                    borderAccent: isSelected
                      ? "border-blue-500 ring-2 ring-blue-500/25"
                      : "border-blue-500/30",
                  }
                : rep.liveState === "idle"
                ? {
                    dot: "🟡",
                    label: "Idle / Stationary (>25m)",
                    badgeBg:
                      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
                    borderAccent: isSelected
                      ? "border-amber-500 ring-2 ring-amber-500/25"
                      : "border-amber-500/30",
                  }
                : {
                    dot: "⚪",
                    label: "Shift Ended / Offline",
                    badgeBg:
                      "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
                    borderAccent: isSelected
                      ? "border-slate-500 ring-2 ring-slate-500/25"
                      : "border-slate-200 dark:border-slate-800",
                  };

            return (
              <div
                key={rep.id}
                onClick={() => {
                  setSelectedStaffId(rep.id);
                  setPlaybackProgress(100);
                }}
                className={`p-4 rounded-2xl border bg-white dark:bg-slate-900 shadow-sm cursor-pointer transition-all hover:shadow-md ${stateConfig.borderAccent}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                        {rep.name}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {rep.roleTitle}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{rep.territory}</p>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1 shrink-0 ${stateConfig.badgeBg}`}
                  >
                    <span>{stateConfig.dot}</span>
                    {stateConfig.label}
                  </span>
                </div>

                {/* Live Status Headline */}
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-800 mb-3">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-snug">
                    {rep.statusHeadline}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    📍 {rep.currentRoadOrLocation}
                  </p>
                </div>

                {/* Battery & GPS mini strip (Section 6 preview) */}
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-100 dark:border-slate-800">
                  <span
                    className={`font-bold flex items-center gap-1 ${
                      rep.batteryLevel <= 20
                        ? "text-rose-600 dark:text-rose-400"
                        : rep.batteryLevel <= 40
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {rep.isCharging ? (
                      <BatteryCharging className="w-3.5 h-3.5" />
                    ) : rep.batteryLevel <= 20 ? (
                      <BatteryLow className="w-3.5 h-3.5" />
                    ) : (
                      <Battery className="w-3.5 h-3.5" />
                    )}
                    {rep.batteryLevel}% Battery
                  </span>

                  <span className="text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                    <Wifi className="w-3 h-3 text-teal-500" />
                    GPS: {rep.gpsSignal}
                  </span>
                </div>

                {/* Quick Status Simulator Switcher */}
                <div
                  className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] font-bold text-slate-400">Set State:</span>
                  <div className="flex items-center gap-1">
                    {(
                      [
                        { key: "moving", icon: "🟢", title: "Moving / On Road" },
                        { key: "inside_customer", icon: "🔵", title: "Inside Clinic / Pharmacy" },
                        { key: "idle", icon: "🟡", title: "Idle >25m" },
                        { key: "offline", icon: "⚪", title: "Shift Ended" },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.key}
                        onClick={() => handleUpdateStaffState(rep.id, st.key)}
                        title={st.title}
                        className={`px-1.5 py-0.5 rounded text-[11px] border transition-all ${
                          rep.liveState === st.key
                            ? "bg-slate-900 dark:bg-white border-teal-500 scale-105"
                            : "bg-slate-50 dark:bg-slate-800 border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        {st.icon}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MAIN GRID: INTERACTIVE KARACHI RADAR MAP (LEFT 8 COLS) + SIDE PANELS (RIGHT 4 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 8 COLUMNS: INTERACTIVE MAP + DAY ROUTE BREADCRUMBS TIMELINE */}
        <div className="lg:col-span-8 space-y-4">
          {/* Map Container Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {/* Map Layer Controls Header */}
            <div className="p-3 sm:px-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60 dark:bg-slate-900/60">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="font-extrabold text-slate-500 uppercase mr-1">Map Layers:</span>
                <button
                  onClick={() => setShowLayerBreadcrumbs(!showLayerBreadcrumbs)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    showLayerBreadcrumbs
                      ? "bg-teal-600 text-white border-teal-600"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  🛣️ Route Breadcrumbs ({selectedStaff.dayRoute.length})
                </button>
                <button
                  onClick={() => setShowLayerBeatShops(!showLayerBeatShops)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    showLayerBeatShops
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  🏪 Beat Plan ({visitedBeatCount}/{totalBeatCount})
                </button>
                <button
                  onClick={() => setShowLayerOrderCashPins(!showLayerOrderCashPins)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    showLayerOrderCashPins
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  🛍️💵 Order &amp; Cash Pins ({livePins.length})
                </button>
                <button
                  onClick={() => setShowLayerAllStaff(!showLayerAllStaff)}
                  className={`px-2.5 py-1 rounded-lg font-bold border transition-all ${
                    showLayerAllStaff
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  🛵 All Staff Radar
                </button>
              </div>

              {/* Zoom & Radar Theme Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMapDarkTheme(!mapDarkTheme)}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                >
                  {mapDarkTheme ? "☀️ Light Map" : "🌙 Dark Radar"}
                </button>
                <button
                  onClick={() => setMapZoom((z) => Math.min(1.5, Number((z + 0.15).toFixed(2))))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setMapZoom((z) => Math.max(0.85, Number((z - 0.15).toFixed(2))))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setMapZoom(1);
                    setActiveMapPopup(null);
                  }}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100"
                  title="Reset View"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* KARACHI INTERACTIVE RADAR MAP CANVAS */}
            <div
              className={`relative w-full h-[490px] sm:h-[540px] overflow-hidden select-none transition-colors ${
                mapDarkTheme ? "bg-[#0b1324]" : "bg-[#eef4f8]"
              }`}
            >
              {/* Zoomable Map Stage */}
              <div
                style={{
                  transform: `scale(${mapZoom})`,
                  transformOrigin: "center center",
                }}
                className="w-full h-full relative transition-transform duration-200"
              >
                {/* Vector Street & Sector Map of Karachi */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="w-full h-full absolute inset-0 pointer-events-none"
                >
                  <defs>
                    <pattern id="radarGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path
                        d="M 10 0 L 0 0 0 10"
                        fill="none"
                        stroke={mapDarkTheme ? "rgba(51, 65, 85, 0.28)" : "rgba(148, 163, 184, 0.25)"}
                        strokeWidth="0.2"
                      />
                    </pattern>
                  </defs>

                  {/* Background Grid */}
                  <rect width="100" height="100" fill="url(#radarGrid)" />

                  {/* Arabian Sea / Clifton Coastline in South-West */}
                  <path
                    d="M 0,85 Q 20,88 38,95 L 0,100 Z"
                    fill={mapDarkTheme ? "rgba(14, 116, 144, 0.22)" : "rgba(56, 189, 248, 0.25)"}
                  />

                  {/* Green Parks (Hill Park / Bagh-e-Jinnah) */}
                  <circle
                    cx="82"
                    cy="42"
                    r="6"
                    fill={mapDarkTheme ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.15)"}
                  />
                  <circle
                    cx="42"
                    cy="48"
                    r="4.5"
                    fill={mapDarkTheme ? "rgba(16, 185, 129, 0.08)" : "rgba(16, 185, 129, 0.15)"}
                  />

                  {/* Secondary Arterial Streets */}
                  <g
                    stroke={mapDarkTheme ? "#1e293b" : "#cbd5e1"}
                    strokeWidth="0.8"
                    fill="none"
                  >
                    {/* Clifton to Saddar */}
                    <path d="M 26,84 L 29,79 L 22,64 L 31,66 L 45,68" />
                    {/* PECHS & Tariq Road Grid */}
                    <path d="M 34,72 L 50,41 L 69,27" />
                    <path d="M 41,65 L 56,44 L 68,47 L 86,43" />
                    <path d="M 47,34 L 61,35 L 84,34" />
                    {/* Bahadurabad & Gulshan Link */}
                    <path d="M 63,31 L 69,27 L 75,20 L 83,18" />
                  </g>

                  {/* Major Karachi Highways (Shahrah-e-Faisal, M.A. Jinnah Rd, Tariq Rd, Shaheed-e-Millat) */}
                  <g
                    stroke={mapDarkTheme ? "#334155" : "#94a3b8"}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    fill="none"
                  >
                    {/* Shahrah-e-Faisal (South-West Saddar through Nursery/PECHS to Airport North-East) */}
                    <path d="M 10,78 Q 35,70 52,54 T 96,30" />
                    {/* Main Tariq Road & Bahadurabad Corridor */}
                    <path d="M 42,64 L 56,44 L 69,27 L 82,12" />
                    {/* M.A. Jinnah Road to Jail Chowrangi & University Road */}
                    <path d="M 8,62 L 31,66 L 63,31 L 92,8" />
                    {/* Shaheed-e-Millat Expressway */}
                    <path d="M 48,82 L 68,47 L 84,34 L 88,10" />
                  </g>

                  {/* 2. SELECTED STAFF DAY ROUTE BREADCRUMB POLYLINE */}
                  {showLayerBreadcrumbs && selectedStaff.dayRoute.length > 1 && (
                    <>
                      {/* Outer Glow */}
                      <polyline
                        fill="none"
                        stroke="#14b8a6"
                        strokeOpacity="0.25"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={routePolylinePoints}
                      />
                      {/* Dashed Animated Route Line */}
                      <polyline
                        fill="none"
                        stroke="#2dd4bf"
                        strokeWidth="1.1"
                        strokeDasharray="2 1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        points={routePolylinePoints}
                      />
                    </>
                  )}
                </svg>

                {/* Major Karachi Sector & Road Labels on Map */}
                <div className="absolute inset-0 pointer-events-none text-[10px] font-extrabold uppercase tracking-wider">
                  <span
                    style={{ left: "16%", top: "60%" }}
                    className="absolute text-slate-500/70 dark:text-slate-400/60"
                  >
                    Saddar &amp; M.A. Jinnah Rd
                  </span>
                  <span
                    style={{ left: "35%", top: "73%" }}
                    className="absolute text-teal-600/70 dark:text-teal-400/60"
                  >
                    Shahrah-e-Faisal (PECHS / Nursery)
                  </span>
                  <span
                    style={{ left: "44%", top: "45%" }}
                    className="absolute text-slate-500/80 dark:text-slate-300/60"
                  >
                    Main Tariq Road
                  </span>
                  <span
                    style={{ left: "65%", top: "14%" }}
                    className="absolute text-slate-500/80 dark:text-slate-300/60"
                  >
                    Bahadurabad &amp; Char Minar
                  </span>
                  <span
                    style={{ left: "76%", top: "46%" }}
                    className="absolute text-slate-500/70 dark:text-slate-400/60"
                  >
                    Shaheed-e-Millat / Hill Park
                  </span>
                  <span
                    style={{ left: "18%", top: "86%" }}
                    className="absolute text-sky-600/70 dark:text-sky-400/60"
                  >
                    Clifton &amp; DHA Phase 5
                  </span>
                </div>

                {/* 5. DAILY BEAT PLAN SHOPS (GREY = UNVISITED, GREEN = VISITED) */}
                {showLayerBeatShops &&
                  activeBeatPlan.stops.map((stop, idx) => (
                    <button
                      key={stop.id}
                      style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
                      onClick={() => {
                        setActiveMapPopup({
                          title: `${idx + 1}. ${stop.shopName}`,
                          subtitle: `${stop.area} • Contact: ${stop.contactPerson || "N/A"}`,
                          badge: stop.visited
                            ? `✓ VISITED (${stop.visitedAt || "Today"})`
                            : "UNVISITED BEAT SHOP",
                          badgeColor: stop.visited ? "bg-emerald-600" : "bg-slate-600",
                          details: stop.visited
                            ? `Route Adherence Verified. ${
                                stop.orderBookedPkr
                                  ? `Order Booked: ${formatPKR(stop.orderBookedPkr)}`
                                  : ""
                              } ${
                                stop.recoveryCollectedPkr
                                  ? `Recovery: ${formatPKR(stop.recoveryCollectedPkr)}`
                                  : ""
                              } (Click toggle in Beat list to change)`
                            : `Assigned on Morning Beat Plan. Click "Mark Visited" in Beat list when rep checks in.`,
                          x: stop.x,
                          y: stop.y,
                        });
                      }}
                      title={`${stop.shopName} (${stop.visited ? "Visited" : "Unvisited"})`}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 z-20 group transition-transform hover:scale-125`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-md border-2 ${
                          stop.visited
                            ? "bg-emerald-500 text-white border-white dark:border-slate-900 shadow-emerald-500/40"
                            : "bg-slate-400 dark:bg-slate-600 text-white border-slate-200 dark:border-slate-800 opacity-85"
                        }`}
                      >
                        {stop.visited ? "✓" : idx + 1}
                      </div>
                    </button>
                  ))}

                {/* 2. DAY ROUTE BREADCRUMB NODES (SHOWING STAY DWELL MINUTES) */}
                {showLayerBreadcrumbs &&
                  selectedStaff.dayRoute.map((stop) => (
                    <button
                      key={stop.id}
                      style={{ left: `${stop.x}%`, top: `${stop.y}%` }}
                      onClick={() => {
                        const idx = selectedStaff.dayRoute.findIndex((s) => s.id === stop.id);
                        const total = Math.max(1, selectedStaff.dayRoute.length - 1);
                        setIsPlayingRoute(false);
                        setPlaybackProgress((idx / total) * 100);
                        setActiveMapPopup({
                          title: `${stop.time} — ${stop.shopName || stop.roadOrArea}`,
                          subtitle: stop.roadOrArea,
                          badge: `STAYED ${stop.dwellMinutes} MINS`,
                          badgeColor: "bg-teal-600",
                          details: `${stop.notes}${
                            stop.bookingAmountPkr
                              ? ` • Booking: ${formatPKR(stop.bookingAmountPkr)}`
                              : ""
                          }${
                            stop.recoveryAmountPkr
                              ? ` • Recovery: ${formatPKR(stop.recoveryAmountPkr)}`
                              : ""
                          }`,
                          x: stop.x,
                          y: stop.y,
                        });
                      }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 z-25 group"
                    >
                      <div className="px-1.5 py-0.5 rounded-md bg-slate-900/90 text-teal-300 border border-teal-400/50 text-[9px] font-mono font-bold whitespace-nowrap shadow-md group-hover:scale-110 transition-transform">
                        {stop.time.replace(" AM", "a").replace(" PM", "p")} • {stop.dwellMinutes}m
                      </div>
                    </button>
                  ))}

                {/* 4. LIVE ORDER (🛍️) & CASH RECOVERY (💵) PINS ON THE MAP */}
                {showLayerOrderCashPins &&
                  livePins.map((pin) => (
                    <button
                      key={pin.id}
                      style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
                      onClick={() =>
                        setActiveMapPopup({
                          title:
                            pin.type === "booking"
                              ? `🛍️ New Booking: ${formatPKR(pin.amountPkr)} — ${pin.shopName}`
                              : `💵 Recovery Collected: ${formatPKR(pin.amountPkr)} Cash`,
                          subtitle: `${pin.shopName} (${pin.area})`,
                          badge: pin.type === "booking" ? "SHOPPING CART PIN" : "CASH BADGE",
                          badgeColor:
                            pin.type === "booking" ? "bg-violet-600" : "bg-emerald-600",
                          details: `Rep: ${pin.staffName} • Time: ${pin.timeLabel} • Ref: ${
                            pin.referenceNo || "LIVE"
                          }`,
                          x: pin.x,
                          y: pin.y,
                        })
                      }
                      className="absolute -translate-x-1/2 -translate-y-full z-30 group transition-transform hover:scale-110"
                    >
                      <div
                        className={`px-2 py-1 rounded-xl text-[10px] font-extrabold text-white shadow-xl border flex items-center gap-1 whitespace-nowrap ${
                          pin.type === "booking"
                            ? "bg-violet-600/95 border-violet-300 shadow-violet-600/30"
                            : "bg-emerald-600/95 border-emerald-300 shadow-emerald-600/30"
                        }`}
                      >
                        <span>{pin.type === "booking" ? "🛍️" : "💵"}</span>
                        <span>{formatPKR(pin.amountPkr)}</span>
                      </div>
                    </button>
                  ))}

                {/* 3. ALL OTHER STAFF LIVE RADAR MARKERS */}
                {showLayerAllStaff &&
                  staffList
                    .filter((s) => s.id !== selectedStaff.id)
                    .map((rep) => {
                      const ringColor =
                        rep.liveState === "moving"
                          ? "bg-emerald-500 border-emerald-200"
                          : rep.liveState === "inside_customer"
                          ? "bg-blue-500 border-blue-200"
                          : rep.liveState === "idle"
                          ? "bg-amber-500 border-amber-200"
                          : "bg-slate-500 border-slate-300";

                      return (
                        <button
                          key={rep.id}
                          style={{ left: `${rep.x}%`, top: `${rep.y}%` }}
                          onClick={() => {
                            setSelectedStaffId(rep.id);
                            setPlaybackProgress(100);
                          }}
                          className="absolute -translate-x-1/2 -translate-y-1/2 z-30 group"
                        >
                          <div className="relative flex flex-col items-center">
                            <div
                              className={`w-7 h-7 rounded-full border-2 text-white flex items-center justify-center shadow-lg text-xs font-extrabold ${ringColor}`}
                            >
                              {rep.vehicleType === "bike" ? "🏍️" : "🚗"}
                            </div>
                            <span className="mt-0.5 px-1.5 py-0.5 rounded bg-slate-950/85 text-white text-[9px] font-bold whitespace-nowrap border border-slate-700">
                              {rep.name} ({rep.batteryLevel}%)
                            </span>
                          </div>
                        </button>
                      );
                    })}

                {/* 2. ACTIVE / ANIMATED INDRIVE PLAYBACK MARKER FOR SELECTED STAFF */}
                <div
                  style={{
                    left: `${playbackState.x}%`,
                    top: `${playbackState.y}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none transition-all duration-75"
                >
                  <div className="relative flex flex-col items-center">
                    {/* Pulsing Radar Aura */}
                    <span
                      className={`absolute -inset-3 rounded-full animate-ping opacity-35 ${
                        selectedStaff.liveState === "moving"
                          ? "bg-emerald-400"
                          : selectedStaff.liveState === "inside_customer"
                          ? "bg-blue-400"
                          : selectedStaff.liveState === "idle"
                          ? "bg-amber-400"
                          : "bg-slate-400"
                      }`}
                    />
                    {/* Main Vehicle Avatar */}
                    <div
                      className={`w-10 h-10 rounded-2xl border-2 border-white shadow-2xl flex items-center justify-center text-base ${
                        selectedStaff.liveState === "moving"
                          ? "bg-emerald-600"
                          : selectedStaff.liveState === "inside_customer"
                          ? "bg-blue-600"
                          : selectedStaff.liveState === "idle"
                          ? "bg-amber-500"
                          : "bg-slate-600"
                      }`}
                    >
                      {selectedStaff.vehicleType === "bike" ? "🏍️" : "🚗"}
                    </div>

                    {/* Floating Telemetry Callout Pill */}
                    <div className="mt-1 px-2.5 py-1 rounded-xl bg-slate-950/95 text-white border border-teal-500/50 shadow-2xl text-center whitespace-nowrap">
                      <div className="text-[10px] font-black text-teal-300 flex items-center justify-center gap-1">
                        <span>{selectedStaff.name}</span>
                        <span>•</span>
                        <span>
                          {isPlayingRoute && playbackState.activeStop
                            ? `${playbackState.activeStop.time} (${playbackState.activeStop.speedKmh} km/h)`
                            : selectedStaff.statusHeadline}
                        </span>
                      </div>
                      {playbackState.activeStop && (
                        <div className="text-[9px] text-slate-300">
                          {playbackState.activeStop.shopName ||
                            playbackState.activeStop.roadOrArea}{" "}
                          (Stay: {playbackState.activeStop.dwellMinutes}m)
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Interactive Popup Card inside Map */}
                {activeMapPopup && (
                  <div
                    style={{
                      left: `${Math.min(72, Math.max(20, activeMapPopup.x))}%`,
                      top: `${Math.min(75, Math.max(18, activeMapPopup.y))}%`,
                    }}
                    className="absolute z-50 w-72 p-3.5 rounded-2xl bg-slate-950/95 text-white border border-slate-700 shadow-2xl space-y-1.5 animate-in fade-in zoom-in-95"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${activeMapPopup.badgeColor}`}
                      >
                        {activeMapPopup.badge}
                      </span>
                      <button
                        onClick={() => setActiveMapPopup(null)}
                        className="text-slate-400 hover:text-white text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                    <h4 className="font-extrabold text-xs text-white leading-snug">
                      {activeMapPopup.title}
                    </h4>
                    <p className="text-[11px] text-teal-300 font-semibold">
                      {activeMapPopup.subtitle}
                    </p>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {activeMapPopup.details}
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom Map Legend Bar */}
              <div className="absolute bottom-3 left-3 right-3 z-30 px-3 py-2 rounded-xl bg-slate-950/85 backdrop-blur-md border border-slate-800 text-[10px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3 font-semibold">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    Visited Beat Shop ({visitedBeatCount})
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" />
                    Unvisited Beat Shop ({totalBeatCount - visitedBeatCount})
                  </span>
                  <span className="flex items-center gap-1">
                    <span>🛍️</span> Booking Pin
                  </span>
                  <span className="flex items-center gap-1">
                    <span>💵</span> Cash Recovery Badge
                  </span>
                </div>
                <span className="font-mono text-teal-400 font-bold">
                  Click any pin or breadcrumb stop to inspect
                </span>
              </div>
            </div>
          </div>

          {/* 2. DAY ROUTE BREADCRUMB TIMELINE LOG (9:00 AM START TO SHIFT END) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-teal-600" />
                  Day Route Breadcrumbs &amp; Pharmacy Dwell Time Log — {selectedStaff.name}
                </h3>
                <p className="text-xs text-slate-500">
                  Exact roads taken from {selectedStaff.shiftStartTime}, where they stopped, and how long they stayed at each pharmacy.
                </p>
              </div>
              <button
                onClick={handlePlayDayRoute}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Replay Journey
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedStaff.dayRoute.map((stop, idx) => {
                const isCurrentStop = playbackState.activeStop?.id === stop.id;
                return (
                  <div
                    key={stop.id}
                    onClick={() => {
                      const total = Math.max(1, selectedStaff.dayRoute.length - 1);
                      setIsPlayingRoute(false);
                      setPlaybackProgress((idx / total) * 100);
                    }}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isCurrentStop
                        ? "border-teal-500 bg-teal-50/40 dark:bg-teal-950/30 ring-1 ring-teal-500/30"
                        : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-mono font-extrabold text-teal-700 dark:text-teal-400">
                        Stop #{stop.sequence} • {stop.time}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        ⏱️ Stayed {stop.dwellMinutes} mins
                      </span>
                    </div>
                    <p className="font-bold text-slate-900 dark:text-slate-100">
                      {stop.shopName}
                    </p>
                    <p className="text-[11px] text-slate-500">🛣️ {stop.roadOrArea}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                      {stop.notes}
                    </p>
                    {(stop.bookingAmountPkr || stop.recoveryAmountPkr) && (
                      <div className="flex flex-wrap items-center gap-2 mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                        {stop.bookingAmountPkr && (
                          <span className="px-2 py-0.5 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 font-bold text-[10px]">
                            🛍️ Booking: {formatPKR(stop.bookingAmountPkr)}
                          </span>
                        )}
                        {stop.recoveryAmountPkr && (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
                            💵 Recovery: {formatPKR(stop.recoveryAmountPkr)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT 4 COLUMNS: BEAT PLAN ADHERENCE (5), LIVE ORDER & CASH PINS (4), BATTERY MONITOR (6) */}
        <div className="lg:col-span-4 space-y-5">
          {/* 5. DAILY BEAT PLAN VS. ACTUAL PERFORMANCE (ROUTE ADHERENCE) */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                  Route Adherence &amp; Beat Plan
                </span>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Beat: {activeBeatPlan.beatTitle}
                </h3>
              </div>
              <button
                onClick={() => setIsBeatModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-[11px] font-bold hover:bg-teal-100 shrink-0"
              >
                + Add Shop
              </button>
            </div>

            {/* Live Completion Gauge */}
            <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-2">
              <div className="flex items-center justify-between text-xs font-extrabold">
                <span>
                  📊 Today&apos;s Target: {visitedBeatCount} / {totalBeatCount} Visited (
                  {beatCompletionPct}% Route Completed)
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
                <div
                  style={{ width: `${beatCompletionPct}%` }}
                  className="h-full bg-gradient-to-r from-teal-400 to-emerald-500 transition-all duration-300"
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>🟢 {visitedBeatCount} Visited (Green on Map)</span>
                <span>⚪ {totalBeatCount - visitedBeatCount} Unvisited (Grey on Map)</span>
              </div>
            </div>

            {/* Scrollable Beat Shops List (Click to toggle Visited / Unvisited) */}
            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
              {activeBeatPlan.stops.map((stop, idx) => (
                <div
                  key={stop.id}
                  className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                    stop.visited
                      ? "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/20"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${
                        stop.visited
                          ? "bg-emerald-500 text-white"
                          : "bg-slate-400 dark:bg-slate-600 text-white"
                      }`}
                    >
                      {stop.visited ? "✓" : idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {stop.shopName}
                      </p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {stop.area}{" "}
                        {stop.visited && stop.visitedAt ? `• Visited ${stop.visitedAt}` : "• Unvisited"}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleToggleBeatStopVisited(stop.id)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold shrink-0 transition-all ${
                      stop.visited
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-teal-600 hover:text-white"
                    }`}
                  >
                    {stop.visited ? "Visited ✓" : "Check In"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* 4. LIVE ORDER & CASH RECOVERY PINS FEED */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-violet-600 dark:text-violet-400">
                  Live Field Transactions
                </span>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Order Bookings &amp; Cash Recovery Pins
                </h3>
              </div>
              <button
                onClick={() => setIsPinModalOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold"
              >
                + Drop Pin
              </button>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {livePins.map((pin) => (
                <div
                  key={pin.id}
                  onClick={() =>
                    setActiveMapPopup({
                      title:
                        pin.type === "booking"
                          ? `🛍️ New Booking: ${formatPKR(pin.amountPkr)} — ${pin.shopName}`
                          : `💵 Recovery Collected: ${formatPKR(pin.amountPkr)} Cash`,
                      subtitle: `${pin.shopName} (${pin.area})`,
                      badge: pin.type === "booking" ? "SHOPPING CART PIN" : "CASH BADGE",
                      badgeColor:
                        pin.type === "booking" ? "bg-violet-600" : "bg-emerald-600",
                      details: `Punched by ${pin.staffName} at ${pin.timeLabel}`,
                      x: pin.x,
                      y: pin.y,
                    })
                  }
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    pin.type === "booking"
                      ? "border-violet-500/30 bg-violet-50/40 dark:bg-violet-950/20 hover:border-violet-500"
                      : "border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 hover:border-emerald-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">
                      {pin.type === "booking"
                        ? `🛍️ "New Booking: ${formatPKR(pin.amountPkr)} — ${pin.shopName}"`
                        : `💵 "Recovery Collected: ${formatPKR(pin.amountPkr)} Cash"`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      {pin.shopName} • {pin.staffName}
                    </span>
                    <span className="font-mono">{pin.timeLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. BATTERY & DEVICE HEALTH MONITOR */}
          <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                  HTML5 Battery Status API &amp; GPS Telemetry
                </span>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                  Battery &amp; Device Health Monitor
                </h3>
              </div>
              <button
                onClick={handleSyncHardwareBatteryAndGps}
                className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-teal-600 hover:text-white text-[10px] font-bold transition-all"
              >
                Refresh API
              </button>
            </div>

            <p className="text-[11px] text-slate-500">
              Prevents false <em>&ldquo;My phone died, sir&rdquo;</em> excuses by logging real-time battery percentage &amp; GPS accuracy.
            </p>

            <div className="space-y-2">
              {staffList.map((rep) => (
                <div
                  key={rep.id}
                  className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 dark:text-slate-100">
                      {rep.name}: {rep.batteryLevel}% Battery
                      {rep.isCharging ? " ⚡" : ""}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        rep.gpsSignal === "High Accuracy Active"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          : rep.gpsSignal === "Moderate Signal"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                      }`}
                    >
                      GPS {rep.gpsSignal}
                    </span>
                  </div>

                  {/* Battery Bar */}
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
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

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>📱 {rep.deviceModel}</span>
                    <span>
                      Accuracy: ±{rep.gpsAccuracyMeters}m • Ping: {rep.lastPingTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 7. GEO-STAMPED PHOTO VERIFICATION AUDIT GALLERY */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-600 dark:text-teal-400">
              Tamper-Evident Field Proof
            </span>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Camera className="w-5 h-5 text-teal-600" />
              Geo-Stamped Photo Verification (Shelf Display &amp; Clinic Prescription Desk Audit)
            </h2>
            <p className="text-xs text-slate-500">
              Staff photos are automatically watermarked with exact Date, Time, GPS Coordinates, Shop Name &amp; Battery % for management auditing.
            </p>
          </div>

          <button
            onClick={() => setIsPhotoModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-extrabold flex items-center gap-2 shadow-md shadow-teal-600/20 self-start sm:self-auto"
          >
            <Camera className="w-4 h-4" />
            + Snap / Upload Geo-Stamped Photo
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {geoPhotos.map((photo) => (
            <div
              key={photo.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition-all"
            >
              <div>
                <div
                  onClick={() => setPreviewLightboxPhoto(photo)}
                  className="relative h-48 bg-slate-950 cursor-pointer group overflow-hidden"
                >
                  <img
                    src={photo.watermarkedDataUrl}
                    alt={photo.shopName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-slate-950/80 text-white text-[10px] font-bold flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-teal-400" />
                    {photo.lat.toFixed(4)}° N, {photo.lng.toFixed(4)}° E
                  </div>
                  <div
                    className={`absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                      photo.auditStatus === "verified"
                        ? "bg-emerald-600 text-white"
                        : photo.auditStatus === "flagged"
                        ? "bg-rose-600 text-white"
                        : "bg-amber-500 text-slate-950"
                    }`}
                  >
                    {photo.auditStatus === "verified"
                      ? "✓ Verified"
                      : photo.auditStatus === "flagged"
                      ? "⚑ Flagged"
                      : "Pending Audit"}
                  </div>
                </div>

                <div className="p-3.5 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-bold text-teal-600 dark:text-teal-400 uppercase">
                      {photo.category.replace(/_/g, " ")}
                    </span>
                    <span>{photo.capturedTimeLabel}</span>
                  </div>
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                    {photo.shopName}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    👤 Rep: <strong>{photo.staffName}</strong> • 📍 {photo.areaName} • 🔋{" "}
                    {photo.batteryAtCapture}%
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 pt-1">
                    {photo.caption}
                  </p>
                </div>
              </div>

              <div className="px-3.5 py-2.5 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 bg-white dark:bg-slate-900">
                <button
                  onClick={() => setPreviewLightboxPhoto(photo)}
                  className="text-xs font-bold text-teal-600 dark:text-teal-400 flex items-center gap-1 hover:underline"
                >
                  <Eye className="w-3.5 h-3.5" /> Inspect Watermark
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleUpdatePhotoAuditStatus(photo.id, "verified")}
                    className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" /> Verify
                  </button>
                  <button
                    onClick={() => handleUpdatePhotoAuditStatus(photo.id, "flagged")}
                    className="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[10px] font-bold flex items-center gap-1"
                  >
                    <Flag className="w-3 h-3" /> Flag
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL 1: PUNCH LIVE ORDER BOOKING OR CASH RECOVERY PIN (SECTION 4) */}
      {isPinModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Drop Live Order / Cash Recovery Pin on Map
              </h3>
              <button
                onClick={() => setIsPinModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLiveMapPin} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPinType("booking");
                    setPinShopName("K-Electric Medical Store");
                    setPinAmountPkr(42000);
                  }}
                  className={`p-3 rounded-xl border font-extrabold flex items-center justify-center gap-2 ${
                    pinType === "booking"
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  🛍️ New Order Booking
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinType("recovery");
                    setPinShopName("Al-Shifa Pharmacy");
                    setPinAmountPkr(15000);
                  }}
                  className={`p-3 rounded-xl border font-extrabold flex items-center justify-center gap-2 ${
                    pinType === "recovery"
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  💵 Cash Recovery
                </button>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Pharmacy / Medical Store Name *
                </label>
                <input
                  type="text"
                  required
                  list="beat-shop-suggestions"
                  value={pinShopName}
                  onChange={(e) => setPinShopName(e.target.value)}
                  placeholder="e.g. K-Electric Medical Store"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
                <datalist id="beat-shop-suggestions">
                  {activeBeatPlan.stops.map((s) => (
                    <option key={s.id} value={s.shopName} />
                  ))}
                  {savedCustomers.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Amount (PKR) *
                  </label>
                  <input
                    type="number"
                    min={100}
                    required
                    value={pinAmountPkr}
                    onChange={(e) => setPinAmountPkr(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Road / Area
                  </label>
                  <input
                    type="text"
                    value={pinAreaName}
                    onChange={(e) => setPinAreaName(e.target.value)}
                    placeholder="e.g. Tariq Road"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPinModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md"
                >
                  Drop Live Pin on Map
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ASSIGN / ADD SHOP TO MORNING BEAT PLAN (SECTION 5) */}
      {isBeatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                Assign Pharmacy to Morning Beat Plan
              </h3>
              <button
                onClick={() => setIsBeatModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddShopToBeat} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Pharmacy / Clinic Name *
                </label>
                <input
                  type="text"
                  required
                  list="beat-shop-suggestions"
                  value={newBeatShopName}
                  onChange={(e) => setNewBeatShopName(e.target.value)}
                  placeholder="e.g. Makkah Medicos Bahadurabad"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Area / Road *
                  </label>
                  <input
                    type="text"
                    required
                    value={newBeatShopArea}
                    onChange={(e) => setNewBeatShopArea(e.target.value)}
                    placeholder="e.g. Tariq Road"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Contact Person
                  </label>
                  <input
                    type="text"
                    value={newBeatShopContact}
                    onChange={(e) => setNewBeatShopContact(e.target.value)}
                    placeholder="e.g. Salman Bhai"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Category
                </label>
                <select
                  value={newBeatShopCategory}
                  onChange={(e) => setNewBeatShopCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="pharmacy">Pharmacy / Medical Store</option>
                  <option value="clinic">Doctor Clinic / Hospital</option>
                  <option value="distributor">Wholesale Distributor</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBeatModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md"
                >
                  Add to Beat Route
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: GEO-STAMPED PHOTO VERIFICATION CAPTURE / UPLOAD (SECTION 7) */}
      {isPhotoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Camera className="w-5 h-5 text-teal-600" />
                Geo-Stamped Photo Verification
              </h3>
              <button
                onClick={() => setIsPhotoModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Shop / Clinic Name *
                </label>
                <input
                  type="text"
                  value={photoShopName}
                  onChange={(e) => setPhotoShopName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Verification Type
                  </label>
                  <select
                    value={photoCategory}
                    onChange={(e) => setPhotoCategory(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="shelf_display">Product Display Shelf</option>
                    <option value="prescription_desk">Clinic Prescription Desk</option>
                    <option value="shop_check_in">Shop Signboard Check-In</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Location Area
                  </label>
                  <input
                    type="text"
                    value={photoAreaName}
                    onChange={(e) => setPhotoAreaName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Audit Notes / Caption
                </label>
                <input
                  type="text"
                  value={photoCaption}
                  onChange={(e) => setPhotoCaption(e.target.value)}
                  placeholder="e.g. Counter standee & 12 boxes displayed at eye level"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="p-3 rounded-xl bg-teal-50/70 dark:bg-slate-800 border border-teal-500/30 space-y-1 text-[11px]">
                <p className="font-bold text-teal-800 dark:text-teal-300">
                  Automatic Watermark Stamp Applied:
                </p>
                <p className="text-slate-600 dark:text-slate-400 font-mono">
                  📍 GPS: {selectedStaff.lat.toFixed(5)}° N, {selectedStaff.lng.toFixed(5)}° E • 🔋{" "}
                  {selectedStaff.batteryLevel}% • 👤 {selectedStaff.name}
                </p>
              </div>

              <label className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-center cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20">
                <Camera className="w-4 h-4" />
                {isProcessingPhoto
                  ? "Burning GPS & Timestamp Watermark..."
                  : "Take Camera Photo / Choose Image"}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCaptureGeoPhoto}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL FOR INSPECTING WATERMARKED GEO PHOTO */}
      {previewLightboxPhoto && (
        <div
          onClick={() => setPreviewLightboxPhoto(null)}
          className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full rounded-2xl bg-slate-900 border border-slate-700 overflow-hidden shadow-2xl space-y-3 p-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm text-white">
                  {previewLightboxPhoto.shopName} — Geo-Verified Audit Photo
                </h3>
                <p className="text-xs text-teal-400 font-mono">
                  GPS: {previewLightboxPhoto.lat.toFixed(5)}° N,{" "}
                  {previewLightboxPhoto.lng.toFixed(5)}° E • Captured by{" "}
                  {previewLightboxPhoto.staffName}
                </p>
              </div>
              <button
                onClick={() => setPreviewLightboxPhoto(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <img
              src={previewLightboxPhoto.watermarkedDataUrl}
              alt={previewLightboxPhoto.shopName}
              className="w-full max-h-[70vh] object-contain rounded-xl border border-slate-800 bg-slate-950"
            />

            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>{previewLightboxPhoto.caption}</span>
              <a
                href={previewLightboxPhoto.watermarkedDataUrl}
                download={`geo-audit-${previewLightboxPhoto.id}.jpg`}
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shrink-0"
              >
                Download Watermarked Proof
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
