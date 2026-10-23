"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  Pill,
  Users,
  Receipt,
  X,
} from "lucide-react";
import { formatPKR } from "@/lib/formatting";
import { syncManager } from "@/lib/offline/sync";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import type { DynamicCategory, UserProfile } from "@/types";

interface HeaderProps {
  onToggleSidebar: () => void;
  currentUser?: UserProfile | null;
  onLogout?: () => void;
}

export function Header({ onToggleSidebar, currentUser, onLogout }: HeaderProps) {
  const router = useRouter();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Global Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    products: { id: string; name: string; sku: string; categoryName: string }[];
    customers: { id: string; name: string; city: string; phone: string }[];
    invoices: { id: string; ref: string; customerName: string; netTotal: number }[];
  }>({ products: [], customers: [], invoices: [] });
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search query against offlineDb
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      setSearchResults({ products: [], customers: [], invoices: [] });
      setIsSearchOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const [allProds, allCusts, allInvs] = await Promise.all([
          offlineDb.products.toArray(),
          offlineDb.customers.toArray(),
          offlineDb.invoices.toArray(),
        ]);

        const matchedProds = allProds
          .filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.sku.toLowerCase().includes(q) ||
              (p.genericName && p.genericName.toLowerCase().includes(q))
          )
          .slice(0, 4)
          .map((p) => ({ id: p.id, name: p.name, sku: p.sku, categoryName: p.categoryName }));

        const matchedCusts = allCusts
          .filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              c.phone.includes(q) ||
              c.city.toLowerCase().includes(q)
          )
          .slice(0, 4)
          .map((c) => ({ id: c.id, name: c.name, city: c.city, phone: c.phone }));

        const matchedInvs = allInvs
          .filter(
            (i) =>
              (i.provisionalReference && i.provisionalReference.toLowerCase().includes(q)) ||
              (i.customerName && i.customerName.toLowerCase().includes(q))
          )
          .slice(0, 4)
          .map((i) => ({
            id: i.id,
            ref: i.provisionalReference || i.id,
            customerName: i.customerName,
            netTotal: i.netTotal,
          }));

        setSearchResults({
          products: matchedProds,
          customers: matchedCusts,
          invoices: matchedInvs,
        });
        setIsSearchOpen(true);
      } catch (err) {
        console.error("Global search error:", err);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync state subscription
  useEffect(() => {
    const unsub = syncManager.subscribe((st) => {
      setIsOnline(st.isOnline);
      setPendingCount(st.pendingCount);
      setIsSyncing(st.isSyncing);
    });
    return () => unsub();
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
      ? "Owner / Admin"
      : currentUser?.role === "warehouse_staff"
      ? "Store & Stock Staff"
      : currentUser?.role === "booking_user"
      ? "Order Booking Staff"
      : "Medical Rep";

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
                {selectedCategoryId === "all"
                  ? "All Categories"
                  : categories.find((c) => c.id === selectedCategoryId)?.name || "Category"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isCategoryMenuOpen && (
              <div
                className="absolute left-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setIsCategoryMenuOpen(false)}
              >
                <div className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Medicine Categories
                </div>
                <button
                  onClick={() => setSelectedCategoryId("all")}
                  className={`w-full text-left px-3 py-2 text-xs md:text-sm flex items-center justify-between ${
                    selectedCategoryId === "all"
                      ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                  }`}
                >
                  <span>All Categories (Tamam Categories)</span>
                  {selectedCategoryId === "all" && <span className="w-2 h-2 rounded-full bg-teal-500" />}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`w-full text-left px-3 py-2 text-xs md:text-sm flex items-center justify-between ${
                      selectedCategoryId === cat.id
                        ? "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <span>{cat.name}</span>
                    {selectedCategoryId === cat.id && <span className="w-2 h-2 rounded-full bg-teal-500" />}
                  </button>
                ))}
                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />
                <Link
                  href="/categories"
                  className="block px-3 py-1.5 text-xs text-teal-600 dark:text-teal-400 font-medium hover:underline"
                >
                  + Add / Edit Categories
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Center: Global Search Bar */}
        <div ref={searchContainerRef} className="hidden lg:flex items-center flex-1 max-w-md mx-4 relative">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim().length >= 2) setIsSearchOpen(true);
              }}
              placeholder="Search medicines, bills, customers..."
              className="w-full pl-9 pr-8 py-1.5 text-xs md:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Floating Search Results Dropdown */}
          {isSearchOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 z-50 max-h-96 overflow-y-auto animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100 dark:divide-slate-700/50">
              {searchResults.products.length === 0 &&
              searchResults.customers.length === 0 &&
              searchResults.invoices.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">
                  No records found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                <>
                  {/* Products */}
                  {searchResults.products.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                        <Pill className="w-3 h-3" /> Medicines / Products
                      </div>
                      {searchResults.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery("");
                            router.push(`/products/${p.id}`);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between group transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              SKU: {p.sku} • {p.categoryName}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Customers */}
                  {searchResults.customers.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <Users className="w-3 h-3" /> Customers / Pharmacies
                      </div>
                      {searchResults.customers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery("");
                            router.push(`/customers/${c.id}`);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between group transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              {c.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {c.city} • {c.phone}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Invoices */}
                  {searchResults.invoices.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <Receipt className="w-3 h-3" /> Invoices / Bills
                      </div>
                      {searchResults.invoices.map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => {
                            setIsSearchOpen(false);
                            setSearchQuery("");
                            router.push(`/sales`);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center justify-between group transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                              {inv.ref}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {inv.customerName}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {formatPKR(inv.netTotal)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: Sync Status, Theme Toggle, Profile */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Online/Offline Status Indicator */}
          <div
            title={isOnline ? "Connected to Internet" : "Working Offline (No Internet)"}
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
              title={`${pendingCount} items waiting to save online. Click to save.`}
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
                    {currentUser?.displayName || "Shop Owner / Admin"}
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
                  <span>My Profile & Settings</span>
                </Link>

                <div className="border-t border-slate-100 dark:border-slate-700 my-1" />

                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-2 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
