"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Receipt,
  Plus,
  Barcode,
  CreditCard,
} from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { OfflineBanner } from "./OfflineBanner";
import { CategoryProvider } from "@/context/CategoryContext";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ThemeProvider } from "@/context/ThemeContext";

function MainAppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { currentUser, logout } = useAuth();

  useEffect(() => {
    try {
      const saved = localStorage.getItem("noxderma_sidebar_collapsed");
      if (saved === "true") {
        setIsSidebarCollapsed(true);
      }
    } catch {}
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

  // If on login page, render children cleanly without ERP chrome
  if (pathname === "/login") {
    return <main className="min-h-screen w-full">{children}</main>;
  }

  const isExactActive = (path: string) => pathname === path;
  const isPrefixActive = (path: string) => pathname.startsWith(path);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100 antialiased selection:bg-teal-500 selection:text-white">
      {/* Offline and Sync Banner */}
      <OfflineBanner />

      <div className="flex flex-1 min-h-[calc(100vh-theme(spacing.10))]">
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
        }`}>
          <Header
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            currentUser={currentUser}
            onLogout={logout}
          />

          <main className="flex-1 p-3.5 sm:p-5 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6 pb-24 lg:pb-8">
            {children}
          </main>
        </div>
      </div>

      {/* Modern Ergonomic Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 shadow-2xl px-2 py-1.5 transition-colors"
      >
        <div className="max-w-md mx-auto grid grid-cols-5 items-center justify-items-center">
          {/* 1. Dashboard */}
          <Link
            href="/"
            className={`flex flex-col items-center justify-center w-full py-1 rounded-xl text-center transition-all ${
              isExactActive("/")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isExactActive("/") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Home</span>
          </Link>

          {/* 2. Invoices List */}
          <Link
            href="/sales/invoices"
            className={`flex flex-col items-center justify-center w-full py-1 rounded-xl text-center transition-all ${
              isExactActive("/sales/invoices")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isExactActive("/sales/invoices") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <Receipt className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Bills</span>
          </Link>

          {/* 3. Center Elevated Quick Make Bill Action */}
          <Link
            href="/sales/invoices/new"
            aria-label="Make New Bill"
            className="flex flex-col items-center justify-center -mt-5 group"
          >
            <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-500 text-white shadow-lg shadow-teal-600/30 flex items-center justify-center transition-all transform group-active:scale-95 group-hover:scale-105 ring-4 ring-white dark:ring-slate-900">
              <Plus className="w-7 h-7 stroke-[2.5]" />
            </div>
            <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 mt-1 uppercase tracking-wider">
              + Bill
            </span>
          </Link>

          {/* 4. Stock Batches */}
          <Link
            href="/inventory/batches"
            className={`flex flex-col items-center justify-center w-full py-1 rounded-xl text-center transition-all ${
              isPrefixActive("/inventory")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isPrefixActive("/inventory") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <Barcode className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Stock</span>
          </Link>

          {/* 5. Khata / Credit */}
          <Link
            href="/finance/credit"
            className={`flex flex-col items-center justify-center w-full py-1 rounded-xl text-center transition-all ${
              isPrefixActive("/finance")
                ? "text-teal-600 dark:text-teal-400 font-bold"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <div className={`p-1 rounded-lg transition-transform ${isPrefixActive("/finance") ? "bg-teal-50 dark:bg-teal-950/60 scale-105" : ""}`}>
              <CreditCard className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Khata</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Register Service Worker for PWA offline caching
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Noxderma Service Worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service Worker registration failed:", err);
        });
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
