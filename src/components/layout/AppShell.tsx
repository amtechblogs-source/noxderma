"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Receipt,
  Plus,
  Barcode,
  CreditCard,
  Menu,
  ShieldAlert,
  ArrowLeft,
  Stethoscope,
  Building2,
  Pill,
  ShoppingBag,
  Boxes,
} from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { OfflineBanner } from "./OfflineBanner";
import { CategoryProvider } from "@/context/CategoryContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { offlineDb } from "@/lib/offline/db";
import {
  buildSessionMonitorId,
  detectDeviceMetadata,
  readDevicePowerState,
} from "@/lib/monitoring/deviceIdentity";
import { normalizeUserDisplayName, type StaffMonitoringProfile } from "@/types";

const TELEMETRY_AUTO_SYNC_DELAY_MS = 10_000; // 10-second throttle for GPS & battery updates

function MainAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { currentUser, loading, logout, hasPermission, hasAnyPermission } = useAuth();

  // Telemetry throttling refs (10s auto-sync cadence)
  const lastTelemetryWriteMsRef = useRef<number>(0);
  const trailingTelemetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestCoordsRef = useRef<{ lat: number; lng: number; acc: number; speedKmh: number } | undefined>(
    undefined
  );

  // Reset top progress bar on route complete
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname]);

  // Global instantaneous tactile route transition indicator
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (href && href.startsWith("/") && href !== pathname && !href.startsWith("/#") && !anchor.target) {
        setIsNavigating(true);
      }
    };

    document.addEventListener("click", handleLinkClick);
    return () => document.removeEventListener("click", handleLinkClick);
  }, [pathname]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("noxderma_sidebar_collapsed");
      if (saved === "true") {
        setIsSidebarCollapsed(true);
      }
    } catch {}

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement &&
        (target.type === "number" || target.inputMode === "numeric" || target.inputMode === "decimal")
      ) {
        target.select();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Backspace") {
        const target = e.target;
        if (
          target instanceof HTMLInputElement &&
          (target.type === "number" || target.inputMode === "numeric" || target.inputMode === "decimal")
        ) {
          if (target.value === "0" || target.value.length === 1) {
            e.preventDefault();
            const proto = window.HTMLInputElement.prototype;
            const nativeSet = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            nativeSet?.call(target, "");
            target.dispatchEvent(new Event("input", { bubbles: true }));
            target.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
    };

    window.addEventListener("focusin", handleFocusIn);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("focusin", handleFocusIn);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleToggleCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("noxderma_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Redirect unauthenticated visitors to the login page
  useEffect(() => {
    if (!loading && !currentUser && pathname !== "/login") {
      router.push("/login");
    }
  }, [currentUser, loading, pathname, router]);

  // Multi-Device Per-Session Live Telemetry Sync (Device Model + Independent Battery/AC Power + Live GPS)
  // Throttled to 10-second intervals so multiple devices on the same account never conflict or spam
  useEffect(() => {
    if (!currentUser) return;

    let watchId: number | null = null;
    let batteryObj: any = null;
    let isUnmounted = false;

    const roleMap: Record<string, StaffMonitoringProfile["roleTitle"]> = {
      owner: "Owner",
      admin: "Owner",
      manager: "Field Supervisor",
      accountant: "Accountant",
      warehouse_staff: "Store Staff",
      sales_rep: "Order Booker",
      booking_user: "Order Booker",
      medical_rep: "Medical Rep",
      recovery_officer: "Recovery Officer",
    };

    // Remove legacy single-key record (`user_<id>`) if present so it never glitches across devices
    offlineDb.staffMonitors.delete(`user_${currentUser.id}`).catch(() => {});

    const flushTelemetryNow = async (
      coordsOverride?: { lat: number; lng: number; acc: number; speedKmh: number }
    ) => {
      if (isUnmounted) return;
      lastTelemetryWriteMsRef.current = Date.now();

      try {
        const meta = await detectDeviceMetadata();
        if (isUnmounted) return;

        const power = await readDevicePowerState(meta.deviceCategory);
        if (isUnmounted) return;

        const monitorId = buildSessionMonitorId(currentUser.id, meta.deviceId);
        const existing = await offlineDb.staffMonitors.get(monitorId);
        const coords = coordsOverride || latestCoordsRef.current;

        const hasRealGps = Boolean(coords) || Boolean(existing?.hasRealGpsFix);
        const lat = coords?.lat ?? existing?.lat ?? 24.8607;
        const lng = coords?.lng ?? existing?.lng ?? 67.0011;
        const acc = Math.round(coords?.acc ?? existing?.gpsAccuracyMeters ?? (hasRealGps ? 12 : 0));
        const speedKmh = coords?.speedKmh ?? existing?.currentSpeedKmh ?? 0;

        const signal: StaffMonitoringProfile["gpsSignal"] = !hasRealGps
          ? "GPS Disabled"
          : acc <= 18
          ? "High Accuracy Active"
          : acc <= 45
          ? "Moderate Signal"
          : "Weak Signal";

        const locationLabel = coords
          ? `Live GPS (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`
          : existing?.hasRealGpsFix && existing.currentRoadOrLocation
          ? existing.currentRoadOrLocation
          : meta.deviceCategory === "desktop"
          ? `Computer Session (${meta.deviceModel})`
          : `Mobile Session (${meta.deviceModel})`;

        const now = new Date();
        const profile: StaffMonitoringProfile = {
          id: monitorId,
          userId: currentUser.id,
          userEmail: currentUser.email,
          accountRole: currentUser.role,
          deviceId: meta.deviceId,
          deviceCategory: meta.deviceCategory,
          browserName: meta.browserName,
          isDesktopAcPower: power.isDesktopAcPower,
          hasBatteryApi: power.hasBatteryApi,
          hasRealGpsFix: hasRealGps,
          lastUpdatedIso: now.toISOString(),
          name: normalizeUserDisplayName(
            currentUser.displayName,
            currentUser.role === "owner" || currentUser.role === "admin"
              ? "Owner"
              : currentUser.email
          ),
          roleTitle: roleMap[currentUser.role] || "Order Booker",
          phone: currentUser.phone || currentUser.email,
          vehicleType: existing?.vehicleType || (meta.deviceCategory === "desktop" ? "car" : "bike"),
          territory: existing?.territory || "Karachi",
          liveState: speedKmh > 3 ? "moving" : "idle",
          statusHeadline: hasRealGps
            ? speedKmh > 3
              ? `Moving (${speedKmh} km/h)`
              : "Online • Live GPS Active"
            : "Online • Session Active",
          currentSpeedKmh: speedKmh,
          currentRoadOrLocation: locationLabel,
          shiftStartTime:
            existing?.shiftStartTime ||
            now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          batteryLevel: power.batteryLevel,
          isCharging: power.isCharging,
          gpsAccuracyMeters: acc,
          gpsSignal: signal,
          lastPingTime: now.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          deviceModel: meta.deviceModel,
          lat,
          lng,
          x: existing?.x ?? 50,
          y: existing?.y ?? 50,
          dayRoute: existing?.dayRoute || [],
        };

        await offlineDb.staffMonitors.put(profile);
      } catch {}
    };

    const scheduleThrottledTelemetrySync = (
      coords?: { lat: number; lng: number; acc: number; speedKmh: number },
      forceImmediate = false
    ) => {
      if (isUnmounted) return;
      if (coords) {
        latestCoordsRef.current = coords;
      }

      const elapsed = Date.now() - lastTelemetryWriteMsRef.current;
      if (forceImmediate || elapsed >= TELEMETRY_AUTO_SYNC_DELAY_MS) {
        if (trailingTelemetryTimerRef.current) {
          clearTimeout(trailingTelemetryTimerRef.current);
          trailingTelemetryTimerRef.current = null;
        }
        flushTelemetryNow(coords);
      } else if (!trailingTelemetryTimerRef.current) {
        const remainingMs = Math.max(500, TELEMETRY_AUTO_SYNC_DELAY_MS - elapsed);
        trailingTelemetryTimerRef.current = setTimeout(() => {
          trailingTelemetryTimerRef.current = null;
          flushTelemetryNow();
        }, remainingMs);
      }
    };

    // 1. Immediate registration of this device session on login / mount
    scheduleThrottledTelemetrySync(undefined, true);

    // 2. Watch live GPS coordinates (throttled to 10-second database syncs)
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            scheduleThrottledTelemetrySync(
              {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                acc: pos.coords.accuracy || 10,
                speedKmh:
                  typeof pos.coords.speed === "number" && pos.coords.speed > 0
                    ? Math.round(pos.coords.speed * 3.6)
                    : 0,
              },
              true
            );
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 }
        );

        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            scheduleThrottledTelemetrySync({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              acc: pos.coords.accuracy || 10,
              speedKmh:
                typeof pos.coords.speed === "number" && pos.coords.speed > 0
                  ? Math.round(pos.coords.speed * 3.6)
                  : 0,
            });
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 10000 }
        );
      } catch {}
    }

    // 3. Real-time battery & charging listeners (throttled to 10-second cadence)
    const handleBatteryChange = () => {
      scheduleThrottledTelemetrySync();
    };
    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      (navigator as any)
        .getBattery()
        .then((bat: any) => {
          if (isUnmounted) return;
          batteryObj = bat;
          bat.addEventListener("levelchange", handleBatteryChange);
          bat.addEventListener("chargingchange", handleBatteryChange);
        })
        .catch(() => {});
    }

    // 4. Periodic 10-second heartbeat while app is visible so online status & battery stay accurate
    const heartbeat = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      scheduleThrottledTelemetrySync();
    }, TELEMETRY_AUTO_SYNC_DELAY_MS);

    const handleVisibilityResume = () => {
      if (document.visibilityState === "visible") {
        scheduleThrottledTelemetrySync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityResume);

    return () => {
      isUnmounted = true;
      if (trailingTelemetryTimerRef.current) {
        clearTimeout(trailingTelemetryTimerRef.current);
        trailingTelemetryTimerRef.current = null;
      }
      if (watchId !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (batteryObj) {
        try {
          batteryObj.removeEventListener("levelchange", handleBatteryChange);
          batteryObj.removeEventListener("chargingchange", handleBatteryChange);
        } catch {}
      }
      document.removeEventListener("visibilitychange", handleVisibilityResume);
      clearInterval(heartbeat);
    };
  }, [currentUser]);

  // If on login page, render children cleanly without layout chrome
  if (pathname === "/login") {
    return <main className="min-h-screen w-full">{children}</main>;
  }

  // Session verification loading state
  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#080d16] text-slate-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-slate-400">Loading...</span>
        </div>
      </div>
    );
  }

  // Prevent flash of protected UI while redirecting
  if (!currentUser) {
    return null;
  }

  const isExactActive = (path: string) => pathname === path;
  const isPrefixActive = (path: string) => pathname.startsWith(path);

  // Strict Zero-Leak Route-Level Permission Check (Specific subroutes checked BEFORE parent prefixes)
  const isRouteAllowed = (() => {
    if (pathname === "/" || pathname === "/login") return true;

    // Sales & Invoicing sub-permissions
    if (pathname.startsWith("/sales/invoices/edit")) {
      return hasPermission("invoices:edit");
    }
    if (pathname.startsWith("/sales/invoices/new") || pathname.startsWith("/sales/bookings")) {
      return hasPermission("invoices:create");
    }
    if (pathname.startsWith("/sales/returns")) {
      return hasPermission("invoices:reverse");
    }
    if (pathname.startsWith("/sales/invoices") || pathname.startsWith("/sales/online-orders") || pathname.startsWith("/sales")) {
      return hasPermission("invoices:view");
    }

    // Products, Pricing & Categories
    if (pathname.startsWith("/products/price-estimator")) {
      return hasPermission("pricing:view");
    }
    if (pathname.startsWith("/products/new")) {
      return hasPermission("products:edit");
    }
    if (pathname.startsWith("/products") || pathname.startsWith("/manufacturers")) {
      return hasAnyPermission(["products:view", "products:edit"]);
    }
    if (pathname.startsWith("/categories")) {
      return hasPermission("categories:manage");
    }

    // Purchases & Warehouse Stock
    if (pathname.startsWith("/purchases")) {
      return hasPermission("inventory:receive");
    }
    if (pathname.startsWith("/inventory")) {
      return hasPermission("inventory:view");
    }

    // CRM, Clients & Staff
    if (pathname.startsWith("/customers") || pathname.startsWith("/distributors")) {
      return hasPermission("crm:customers");
    }
    if (pathname.startsWith("/crm/leads")) {
      return hasPermission("crm:leads");
    }
    if (pathname.startsWith("/crm/visits")) {
      return hasPermission("crm:visits");
    }
    if (pathname.startsWith("/employees/monitoring")) {
      return hasPermission("staff:monitoring");
    }
    if (pathname.startsWith("/employees/targets")) {
      return hasPermission("staff:targets");
    }
    if (pathname.startsWith("/employees/salaries") || pathname.startsWith("/finance/salaries")) {
      return hasAnyPermission(["finance:pnl", "finance:payments", "users:manage"]);
    }

    // Finance, Khata & Reports
    if (pathname.startsWith("/finance/credit")) {
      return hasPermission("finance:aging");
    }
    if (pathname.startsWith("/finance/ledgers")) {
      return hasPermission("finance:ledgers");
    }
    if (pathname.startsWith("/finance/pnl") || pathname.startsWith("/reports")) {
      return hasPermission("finance:pnl");
    }
    if (pathname.startsWith("/finance")) {
      return hasAnyPermission(["finance:aging", "finance:ledgers", "finance:payments", "finance:pnl"]);
    }

    // Marketing, Audit, Sync, Users & Settings
    if (pathname.startsWith("/marketing")) {
      return hasPermission("marketing:manage");
    }
    if (pathname.startsWith("/audit")) {
      return hasPermission("audit:view");
    }
    if (pathname.startsWith("/sync")) {
      return hasPermission("sync:reconcile");
    }
    if (pathname.startsWith("/users")) {
      return hasPermission("users:manage");
    }
    if (
      pathname.startsWith("/settings") ||
      pathname.startsWith("/notifications") ||
      pathname.startsWith("/integrations")
    ) {
      return hasPermission("settings:manage");
    }
    return false;
  })();

  // Role-Aware Center Elevated Circle Action (Default: Doctor Visit; smart zero-leak fallbacks for non-CRM roles)
  const centerCircleAction = (() => {
    if (hasPermission("crm:visits")) {
      return {
        href: "/crm/visits",
        label: "Visit",
        ariaLabel: "Doctor & Pharmacy Visits",
        Icon: Stethoscope,
        isActive: isPrefixActive("/crm/visits"),
      };
    }
    if (hasPermission("invoices:create")) {
      return {
        href: "/sales/invoices/new",
        label: "New Bill",
        ariaLabel: "Make New Bill",
        Icon: Plus,
        isActive: isExactActive("/sales/invoices/new"),
      };
    }
    if (hasPermission("inventory:receive")) {
      return {
        href: "/purchases",
        label: "Add Stock",
        ariaLabel: "Add Stock (Purchases / GRN)",
        Icon: ShoppingBag,
        isActive: isPrefixActive("/purchases"),
      };
    }
    if (hasPermission("finance:aging")) {
      return {
        href: "/finance/credit",
        label: "Udhaar",
        ariaLabel: "Market Udhaar & Recovery",
        Icon: CreditCard,
        isActive: isPrefixActive("/finance/credit"),
      };
    }
    if (hasPermission("inventory:view")) {
      return {
        href: "/inventory",
        label: "Stock",
        ariaLabel: "Current Medicine Stock",
        Icon: Boxes,
        isActive: isPrefixActive("/inventory"),
      };
    }
    if (hasPermission("products:view")) {
      return {
        href: "/products",
        label: "Items",
        ariaLabel: "Medicine Catalog",
        Icon: Pill,
        isActive: isPrefixActive("/products"),
      };
    }
    return null;
  })();

  // Slot 2 (Replacing old Visits tab with Clients / Pharmacies, or Medicines Catalog if Clients not permitted)
  const secondaryLeftTab = (() => {
    if (hasPermission("crm:customers") && centerCircleAction?.href !== "/customers") {
      return {
        href: "/customers",
        label: "Clients",
        Icon: Building2,
        isActive: isPrefixActive("/customers"),
      };
    }
    if (hasPermission("products:view") && centerCircleAction?.href !== "/products") {
      return {
        href: "/products",
        label: "Items",
        Icon: Pill,
        isActive: isPrefixActive("/products"),
      };
    }
    return null;
  })();

  // Slot 6 (Khata / Finance tab strictly mapped to the exact finance sub-module permitted)
  const financeTab = (() => {
    if (hasPermission("finance:aging") && centerCircleAction?.href !== "/finance/credit") {
      return {
        href: "/finance/credit",
        label: "Khata",
        isActive: isPrefixActive("/finance"),
      };
    }
    if (hasPermission("finance:ledgers")) {
      return {
        href: "/finance/ledgers/customers",
        label: "Khata",
        isActive: isPrefixActive("/finance/ledgers"),
      };
    }
    if (hasPermission("finance:pnl")) {
      return {
        href: "/finance/pnl",
        label: "P&L",
        isActive: isPrefixActive("/finance/pnl"),
      };
    }
    return null;
  })();

  const CenterIcon = centerCircleAction?.Icon;
  const SecondaryLeftIcon = secondaryLeftTab?.Icon;

  return (
    <div className="min-h-screen w-full max-w-[100vw] overflow-x-hidden bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100 antialiased selection:bg-teal-500 selection:text-white print:bg-white print:min-h-0 print:text-black">
      {/* Instant Ultra-Slim Top Route Progress Bar */}
      {isNavigating && (
        <div
          role="progressbar"
          aria-label="Loading page"
          className="fixed top-0 left-0 right-0 h-[2.5px] z-[9999] bg-gradient-to-r from-teal-500 via-emerald-400 to-teal-500 animate-pulse shadow-sm shadow-teal-500/50"
        />
      )}

      {/* Offline and Sync Coordinator */}
      <OfflineBanner />

      <div className="flex flex-1 min-h-[calc(100vh-theme(spacing.10))] print:min-h-0 print:bg-white">
        {/* Navigation Sidebar */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        {/* Main Content Area */}
        <div
          className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
            isSidebarCollapsed ? "lg:pl-20" : "lg:pl-72"
          } print:pl-0 print:bg-white print:min-h-0`}
        >
          <Header
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            currentUser={currentUser}
            onLogout={logout}
          />

          <main className="flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6 pb-28 lg:pb-8 print:p-0 print:m-0 print:max-w-none print:w-full print:pb-0 print:bg-white print:min-h-0">
            {isRouteAllowed ? (
              children
            ) : (
              <div className="max-w-lg mx-auto my-12 p-6 sm:p-8 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-white dark:bg-slate-900 shadow-lg text-center space-y-4">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
                  <ShieldAlert className="w-7 h-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100">
                    Module Access Restricted
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                    Aap ke account (<strong>{currentUser.displayName}</strong> &bull;{" "}
                    <span className="uppercase">{currentUser.role.replace("_", " ")}</span>) ko is module ki access nahi di gayi. Sirf assigned modules hi open kiye ja sakte hain.
                  </p>
                </div>
                <div className="pt-2">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-bold shadow-md shadow-teal-600/20"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Dashboard
                  </Link>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Modern Ergonomic Mobile Bottom Navigation Bar (Strictly Filtered by User Permissions) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className={`no-print print:hidden lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-2xl px-1 sm:px-2 pt-1 pb-1.5 transition-all duration-300 ease-in-out ${
          sidebarOpen ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="max-w-md mx-auto flex items-end justify-around">
          {/* 1. Home / Dashboard */}
          <Link
            href="/"
            prefetch={true}
            className={`flex flex-col items-center justify-end flex-1 py-0.5 rounded-xl text-center transition-all btn-interactive ${
              isExactActive("/")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div
              className={`p-1 rounded-lg transition-transform ${
                isExactActive("/") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Home</span>
          </Link>

          {/* 2. Clients (Pharmacies & Stores) or Items (Medicines Catalog) — Replaces old Visits slot */}
          {secondaryLeftTab && SecondaryLeftIcon && (
            <Link
              href={secondaryLeftTab.href}
              prefetch={true}
              className={`flex flex-col items-center justify-end flex-1 py-0.5 rounded-xl text-center transition-all btn-interactive ${
                secondaryLeftTab.isActive
                  ? "text-teal-600 dark:text-teal-400 font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  secondaryLeftTab.isActive ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""
                }`}
              >
                <SecondaryLeftIcon className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                {secondaryLeftTab.label}
              </span>
            </Link>
          )}

          {/* 3. Customer Bills (Only if invoices:view permitted, or Make Bill if invoices:create permitted & not already center) */}
          {hasPermission("invoices:view") ? (
            <Link
              href="/sales/invoices"
              prefetch={true}
              className={`flex flex-col items-center justify-end flex-1 py-0.5 rounded-xl text-center transition-all btn-interactive ${
                isExactActive("/sales/invoices")
                  ? "text-teal-600 dark:text-teal-400 font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  isExactActive("/sales/invoices") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""
                }`}
              >
                <Receipt className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 leading-none">Bills</span>
            </Link>
          ) : (
            hasPermission("invoices:create") &&
            centerCircleAction?.href !== "/sales/invoices/new" && (
              <Link
                href="/sales/invoices/new"
                prefetch={true}
                className={`flex flex-col items-center justify-end flex-1 py-0.5 rounded-xl text-center transition-all btn-interactive ${
                  isExactActive("/sales/invoices/new")
                    ? "text-teal-600 dark:text-teal-400 font-bold"
                    : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <div
                  className={`p-1 rounded-lg transition-transform ${
                    isExactActive("/sales/invoices/new")
                      ? "bg-teal-50 dark:bg-teal-950/60 scale-105"
                      : ""
                  }`}
                >
                  <Receipt className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight mt-0.5 leading-none">New Bill</span>
              </Link>
            )
          )}

          {/* 4. Center Elevated Full-Circle Action Button (Default: Doctor Visit with Stethoscope & clear gap above "Visit") */}
          {centerCircleAction && CenterIcon && (
            <Link
              href={centerCircleAction.href}
              prefetch={true}
              aria-label={centerCircleAction.ariaLabel}
              className="flex flex-col items-center justify-end flex-1 py-0.5 group btn-interactive"
            >
              <div
                className={`-mt-8 mb-2.5 w-12 h-12 rounded-full text-white shadow-lg flex items-center justify-center transition-all transform group-active:scale-95 group-hover:scale-105 ring-4 ring-white dark:ring-slate-900 ${
                  centerCircleAction.isActive
                    ? "bg-gradient-to-tr from-teal-700 to-emerald-500 shadow-teal-600/40"
                    : "bg-gradient-to-tr from-teal-600 to-teal-500 shadow-teal-600/30"
                }`}
              >
                <CenterIcon className="w-5 h-5 stroke-[2.3]" />
              </div>
              <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 leading-none tracking-tight">
                {centerCircleAction.label}
              </span>
            </Link>
          )}

          {/* 5. Stock Batches (Only if inventory:view permitted & not already center) */}
          {hasPermission("inventory:view") && centerCircleAction?.href !== "/inventory" && (
            <Link
              href="/inventory/batches"
              prefetch={true}
              className={`flex flex-col items-center justify-end flex-1 py-0.5 rounded-xl text-center transition-all btn-interactive ${
                isPrefixActive("/inventory")
                  ? "text-teal-600 dark:text-teal-400 font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  isPrefixActive("/inventory") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""
                }`}
              >
                <Barcode className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 leading-none">Stock</span>
            </Link>
          )}

          {/* 6. Khata / Finance (Only if permitted) */}
          {financeTab && (
            <Link
              href={financeTab.href}
              prefetch={true}
              className={`flex flex-col items-center justify-end flex-1 py-0.5 rounded-xl text-center transition-all btn-interactive ${
                financeTab.isActive
                  ? "text-teal-600 dark:text-teal-400 font-bold"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <div
                className={`p-1 rounded-lg transition-transform ${
                  financeTab.isActive ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""
                }`}
              >
                <CreditCard className="w-5 h-5" />
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 leading-none">
                {financeTab.label}
              </span>
            </Link>
          )}

          {/* 7. Menu (Toggle Sidebar) */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Open Navigation Menu"
            className="flex flex-col items-center justify-end flex-1 py-0.5 rounded-xl text-center transition-all btn-interactive text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
          >
            <div className="p-1 rounded-lg transition-transform hover:bg-slate-100 dark:hover:bg-slate-800">
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Menu</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.endsWith(".local");

      if (isLocalhost) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      } else {
        navigator.serviceWorker
          .register("/sw.js", { updateViaCache: "none" })
          .then((reg) => {
            reg.update().catch(() => {});
            if (reg.waiting) {
              reg.waiting.postMessage({ type: "SKIP_WAITING" });
            }
            reg.addEventListener("updatefound", () => {
              const installing = reg.installing;
              if (!installing) return;
              installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  installing.postMessage({ type: "SKIP_WAITING" });
                }
              });
            });
          })
          .catch((err) => {
            console.warn("Service Worker registration failed:", err);
          });
      }
    }
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <CategoryProvider>
          <MainAppLayout>{children}</MainAppLayout>
        </CategoryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
