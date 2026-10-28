"use client";

import React, { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Receipt,
  Plus,
  Barcode,
  CreditCard,
  MapPin,
  Menu,
} from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { OfflineBanner } from "./OfflineBanner";
import { CategoryProvider } from "@/context/CategoryContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { offlineDb } from "@/lib/offline/db";
import type { StaffMonitoringProfile } from "@/types";

function detectMobileDeviceName(): string {
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
  if (/Realme|RMX/i.test(ua)) return "Realme Smartphone";
  if (/Tecno/i.test(ua)) return "Tecno Smartphone";
  if (/iPhone/i.test(ua)) return "Apple iPhone";
  if (/iPad/i.test(ua)) return "Apple iPad";
  if (/Android/i.test(ua)) return "Android Smartphone";
  if (/Windows/i.test(ua)) return "Windows PC / Laptop";
  if (/Macintosh/i.test(ua)) return "MacBook / macOS";
  return "Staff Mobile Device";
}

function MainAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const { currentUser, loading, logout } = useAuth();

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

    // Global enhancement for numeric & text inputs: auto-select on focus and smooth backspace
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
          // If input has only 1 character or single zero, clear it immediately
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

  // Automatic Background Live Telemetry Sync (Mobile Model + Real-time Battery % + Live GPS) for Logged-In User
  useEffect(() => {
    if (!currentUser) return;

    let watchId: number | null = null;
    let batteryObj: any = null;
    let isUnmounted = false;

    const monitorId = `user_${currentUser.id}`;
    const roleMap: Record<string, StaffMonitoringProfile["roleTitle"]> = {
      sales_rep: "Order Booker",
      medical_rep: "Medical Rep",
      recovery_officer: "Recovery Officer",
      warehouse_staff: "Field Supervisor",
      accountant: "Field Supervisor",
      admin: "Field Supervisor",
    };

    const syncTelemetryToDatabase = async (
      coords?: { lat: number; lng: number; acc: number }
    ) => {
      if (isUnmounted) return;
      try {
        let pct = 100;
        let charging = false;
        if (typeof navigator !== "undefined" && "getBattery" in navigator) {
          try {
            const bat = await (navigator as any).getBattery();
            pct = Math.round((bat.level ?? 1) * 100);
            charging = Boolean(bat.charging);
          } catch {}
        }

        const existing = await offlineDb.staffMonitors.get(monitorId);
        const lat = coords?.lat ?? existing?.lat ?? 24.8607;
        const lng = coords?.lng ?? existing?.lng ?? 67.0011;
        const acc = Math.round(coords?.acc ?? existing?.gpsAccuracyMeters ?? 10);
        const signal: StaffMonitoringProfile["gpsSignal"] =
          acc <= 15 ? "High Accuracy Active" : acc <= 40 ? "Moderate Signal" : "Weak Signal";

        const profile: StaffMonitoringProfile = {
          id: monitorId,
          name: currentUser.displayName || currentUser.email,
          roleTitle: roleMap[currentUser.role] || "Order Booker",
          phone: currentUser.phone || currentUser.email,
          vehicleType: existing?.vehicleType || "bike",
          territory: existing?.territory || "Karachi",
          liveState: "moving",
          statusHeadline: "Online (Auto-Synced)",
          currentSpeedKmh: existing?.currentSpeedKmh || 0,
          currentRoadOrLocation: coords
            ? `Live GPS (${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E)`
            : existing?.currentRoadOrLocation && !existing.currentRoadOrLocation.includes("Click")
            ? existing.currentRoadOrLocation
            : `Live Session Active (${detectMobileDeviceName()})`,
          shiftStartTime: existing?.shiftStartTime || "09:00 AM",
          batteryLevel: pct,
          isCharging: charging,
          gpsAccuracyMeters: acc,
          gpsSignal: signal,
          lastPingTime: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
          deviceModel: detectMobileDeviceName(),
          lat,
          lng,
          x: existing?.x ?? 50,
          y: existing?.y ?? 50,
          dayRoute: existing?.dayRoute || [],
        };

        await offlineDb.staffMonitors.put(profile);
      } catch {}
    };

    // Initial immediate sync on login / mount
    syncTelemetryToDatabase();

    // Watch live GPS coordinates automatically
    if (typeof navigator !== "undefined" && "geolocation" in navigator) {
      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            syncTelemetryToDatabase({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              acc: pos.coords.accuracy || 8,
            });
          },
          () => {},
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );

        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            syncTelemetryToDatabase({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              acc: pos.coords.accuracy || 8,
            });
          },
          () => {},
          { enableHighAccuracy: true, maximumAge: 30000 }
        );
      } catch {}
    }

    // Listen to real-time battery level & charging changes
    const handleBatteryChange = () => {
      syncTelemetryToDatabase();
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

    // Heartbeat every 45 seconds so lastPingTime & online status stay fresh
    const heartbeat = setInterval(() => {
      syncTelemetryToDatabase();
    }, 45000);

    return () => {
      isUnmounted = true;
      if (watchId !== null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (batteryObj) {
        try {
          batteryObj.removeEventListener("levelchange", handleBatteryChange);
          batteryObj.removeEventListener("chargingchange", handleBatteryChange);
        } catch {}
      }
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

      {/* Offline and Sync Banner */}
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
        <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          isSidebarCollapsed ? "lg:pl-20" : "lg:pl-72"
        } print:pl-0 print:bg-white print:min-h-0`}>
          <Header
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            currentUser={currentUser}
            onLogout={logout}
          />

          <main className="flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6 pb-24 lg:pb-8 print:p-0 print:m-0 print:max-w-none print:w-full print:pb-0 print:bg-white print:min-h-0">
            {children}
          </main>
        </div>
      </div>

      {/* Modern Ergonomic Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className={`no-print print:hidden lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-2xl px-1 sm:px-2 py-1 transition-all duration-300 ease-in-out ${
          sidebarOpen ? "translate-y-full opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="max-w-md mx-auto grid grid-cols-7 items-center justify-items-center">
          {/* 1. Dashboard */}
          <Link
            href="/"
            prefetch={true}
            className={`flex flex-col items-center justify-center w-full py-0.5 rounded-xl text-center transition-all btn-interactive ${
              isExactActive("/")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isExactActive("/") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Home</span>
          </Link>

          {/* 2. Field Visits */}
          <Link
            href="/crm/visits"
            prefetch={true}
            className={`flex flex-col items-center justify-center w-full py-0.5 rounded-xl text-center transition-all btn-interactive ${
              isPrefixActive("/crm/visits")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isPrefixActive("/crm/visits") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Visits</span>
          </Link>

          {/* 3. Invoices List (Bills) */}
          <Link
            href="/sales/invoices"
            prefetch={true}
            className={`flex flex-col items-center justify-center w-full py-0.5 rounded-xl text-center transition-all btn-interactive ${
              isExactActive("/sales/invoices")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isExactActive("/sales/invoices") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <Receipt className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Bills</span>
          </Link>

          {/* 4. Center Elevated Quick Make Bill Action (Full Circle + Clean Label Spacing) */}
          <Link
            href="/sales/invoices/new"
            prefetch={true}
            aria-label="Make New Bill"
            className="flex flex-col items-center justify-center -mt-6 group btn-interactive"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-teal-600 to-teal-500 text-white shadow-lg shadow-teal-600/30 flex items-center justify-center transition-all transform group-active:scale-95 group-hover:scale-105 ring-4 ring-white dark:ring-slate-900 mb-1.5">
              <Plus className="w-6 h-6 stroke-[2.5]" />
            </div>
            <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 leading-none uppercase tracking-wider">
              Bill
            </span>
          </Link>

          {/* 5. Stock Batches */}
          <Link
            href="/inventory/batches"
            prefetch={true}
            className={`flex flex-col items-center justify-center w-full py-0.5 rounded-xl text-center transition-all btn-interactive ${
              isPrefixActive("/inventory")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isPrefixActive("/inventory") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <Barcode className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Stock</span>
          </Link>

          {/* 6. Khata / Credit */}
          <Link
            href="/finance/credit"
            prefetch={true}
            className={`flex flex-col items-center justify-center w-full py-0.5 rounded-xl text-center transition-all btn-interactive ${
              isPrefixActive("/finance")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isPrefixActive("/finance") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <CreditCard className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-none">Khata</span>
          </Link>

          {/* 7. Menu (Toggle Sidebar) */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Open Navigation Menu"
            className="flex flex-col items-center justify-center w-full py-0.5 rounded-xl text-center transition-all btn-interactive text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
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
    // Service Worker handling
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.endsWith(".local");

      if (isLocalhost) {
        // In local development, unregister any active service worker to prevent stale webpack chunk lockups
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      } else {
        // Register in production for full offline-first PWA caching
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("Noxderma Service Worker registered successfully:", reg.scope);
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
