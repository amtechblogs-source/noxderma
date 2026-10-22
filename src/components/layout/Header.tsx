"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Menu,
  Search,
  Bell,
  Wifi,
  WifiOff,
  RefreshCw,
  Sun,
  Moon,
  ChevronDown,
  Layers,
  Shield,
  User,
  LogOut,
} from "lucide-react";
import { syncManager } from "@/lib/offline/sync";
import { offlineDb } from "@/lib/offline/db";
import { INITIAL_DEFAULT_CATEGORIES } from "@/types";
import type { DynamicCategory, UserProfile } from "@/types";

interface HeaderProps {
  onToggleSidebar: () => void;
  currentUser?: UserProfile | null;
  onLogout?: () => void;
}

export function Header({ onToggleSidebar, currentUser, onLogout }: HeaderProps) {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Sync state subscription
  useEffect(() => {
    const unsub = syncManager.subscribe((st) => {
      setIsOnline(st.isOnline);
      setPendingCount(st.pendingCount);
      setIsSyncing(st.isSyncing);
    });
    return () => unsub();
  }, []);

  // Load dynamic categories from IndexedDB or defaults
  useEffect(() => {
    async function loadCategories() {
      try {
        const local = await offlineDb.categories.toArray();
        if (local.length > 0) {
          setCategories(local.filter((c) => c.active).sort((a, b) => a.displayOrder - b.displayOrder));
        } else {
          // Pre-populate initial default categories
          const now = new Date().toISOString();
          const initial = INITIAL_DEFAULT_CATEGORIES.map((c) => ({
            ...c,
            createdAt: now,
            updatedAt: now,
          }));
          await offlineDb.categories.bulkPut(initial);
          setCategories(initial);
        }
      } catch {
        // Fallback
        const now = new Date().toISOString();
        setCategories(
          INITIAL_DEFAULT_CATEGORIES.map((c) => ({
            ...c,
            createdAt: now,
            updatedAt: now,
          }))
        );
      }
    }
    loadCategories();
  }, []);

  // Theme toggle
  const toggleTheme = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  const handleManualSync = async () => {
    await syncManager.syncNow();
  };

  const roleLabel =
    currentUser?.role === "admin"
      ? "Administrator"
      : currentUser?.role === "warehouse_staff"
      ? "Warehouse Staff"
      : currentUser?.role === "booking_user"
      ? "Booking Agent"
      : "Field Sales Rep";

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between px-3 md:px-6 h-16 gap-3">
        {/* Left: Mobile Sidebar Toggle & Brand Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Dynamic Category Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs md:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm"
            >
              <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <span className="hidden sm:inline">Category:</span>
              <span className="text-teal-700 dark:text-teal-300">
                {selectedCategory === "all"
                  ? "All Sectors"
                  : categories.find((c) => c.id === selectedCategory)?.name || "Category"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isCategoryMenuOpen && (
              <div
                className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setIsCategoryMenuOpen(false)}
              >
                <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Business Divisions
                </div>
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`w-full text-left px-3 py-2 text-xs md:text-sm flex items-center justify-between ${
                    selectedCategory === "all"
                      ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <span>All Divisions & Products</span>
                  {selectedCategory === "all" && <span className="w-2 h-2 rounded-full bg-teal-500" />}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`w-full text-left px-3 py-2 text-xs md:text-sm flex items-center justify-between ${
                      selectedCategory === cat.id
                        ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <span>{cat.name}</span>
                    {selectedCategory === cat.id && <span className="w-2 h-2 rounded-full bg-teal-500" />}
                  </button>
                ))}
                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                <Link
                  href="/categories"
                  className="block px-3 py-1.5 text-xs text-teal-600 dark:text-teal-400 font-medium hover:underline"
                >
                  + Manage Dynamic Categories
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <div className="hidden lg:flex items-center flex-1 max-w-md mx-4">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search products, SKU, batches, invoices, customers..."
              className="w-full pl-9 pr-4 py-1.5 text-xs md:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
            />
          </div>
        </div>

        {/* Right: Sync Status, Theme Toggle, Profile */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Online/Offline Status Indicator */}
          <div
            title={isOnline ? "System Online" : "Offline Mode Active"}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isOnline
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse" />
            )}
            <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
          </div>

          {/* Pending Sync Counter & Manual Action Button */}
          {pendingCount > 0 && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline}
              title={`${pendingCount} pending offline operations. Click to sync.`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-semibold hover:bg-teal-100 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-teal-600" : ""}`} />
              <span>{pendingCount}</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : "A"}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {currentUser?.displayName || "Admin User"}
                </span>
                <span className="text-[10px] font-medium text-teal-600 dark:text-teal-400 leading-tight">
                  {roleLabel}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isProfileMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setIsProfileMenuOpen(false)}
              >
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {currentUser?.displayName || "System Administrator"}
                  </p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {currentUser?.email || "admin@noxderma.com"}
                  </p>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    <Shield className="w-3 h-3" />
                    {roleLabel}
                  </span>
                </div>

                <Link
                  href="/settings"
                  className="w-full text-left px-4 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Profile & Business Settings</span>
                </Link>

                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />

                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
