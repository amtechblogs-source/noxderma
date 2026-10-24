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
  Compass,
  Barcode,
  ShoppingBag,
  ArrowRight,
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

const APP_NAVIGATION_SEARCH_ITEMS = [
  { name: "Customer Bills (Invoices)", path: "/sales/invoices", module: "Sales", keywords: "bill invoice sale memo receipt" },
  { name: "Make New Bill (New Invoice)", path: "/sales/invoices/new", module: "Sales", keywords: "new bill create invoice add medicine" },
  { name: "Medicine Catalog", path: "/products", module: "Inventory", keywords: "products medicine items skus" },
  { name: "Stock & Low-Stock Alerts", path: "/inventory", module: "Inventory", keywords: "stock godown warehouse alert reorder" },
  { name: "Batch Stock & Expiry Dates", path: "/inventory/batches", module: "Inventory", keywords: "batch expiry near fefo date" },
  { name: "Buy Stock (Purchases / GRN)", path: "/purchases", module: "Purchases", keywords: "purchase po grn vendor supplier buy" },
  { name: "Pharmacies & Medical Stores", path: "/customers", module: "Clients", keywords: "customer pharmacy shop medical store client" },
  { name: "Market Udhaar (Pending Credit)", path: "/finance/credit", module: "Finance", keywords: "udhaar credit balance receive ledger khata" },
  { name: "Customer Khata (Receivables)", path: "/finance/ledgers/customers", module: "Finance", keywords: "khata ledger customer statement" },
  { name: "Company Khata (Payables)", path: "/finance/ledgers/manufacturers", module: "Finance", keywords: "khata company manufacturer payment" },
  { name: "Profit & Loss Report (Kamai)", path: "/finance/pnl", module: "Finance", keywords: "profit loss pnl kamai margin" },
  { name: "Staff Accounts & Permissions", path: "/users", module: "Settings", keywords: "users staff login permission rbac roles" },
  { name: "Company Settings & Themes", path: "/settings", module: "Settings", keywords: "settings theme logo profile address print" },
  { name: "Medicine Categories", path: "/categories", module: "Catalog", keywords: "category categories classification" },
  { name: "Field Staff Orders", path: "/sales/bookings", module: "Sales", keywords: "booking order rep staff" },
  { name: "Customer Returns", path: "/sales/returns", module: "Sales", keywords: "return credit note damage expired refund" },
];

export function Header({ onToggleSidebar, currentUser, onLogout }: HeaderProps) {
  const router = useRouter();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Universal Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<{
    navItems: { name: string; path: string; module: string }[];
    products: { id: string; name: string; sku: string; categoryName: string }[];
    customers: { id: string; name: string; city: string; phone: string }[];
    invoices: { id: string; ref: string; customerName: string; netTotal: number }[];
    batches: { id: string; batchNumber: string; productName: string; remainingQuantity: number }[];
  }>({ navItems: [], products: [], customers: [], invoices: [], batches: [] });

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global Ctrl+K / '/' shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      } else if (e.key === "/" && (e.target as HTMLElement).tagName !== "INPUT" && (e.target as HTMLElement).tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchOpen(true);
      } else if (e.key === "Escape") {
        setIsSearchOpen(false);
        setIsMobileSearchOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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

  // Debounced search query against offlineDb & module pages
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) {
      setSearchResults({ navItems: [], products: [], customers: [], invoices: [], batches: [] });
      setIsSearchOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        // 1. Navigation items matching
        const matchedNav = APP_NAVIGATION_SEARCH_ITEMS.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            item.keywords.toLowerCase().includes(q) ||
            item.module.toLowerCase().includes(q)
        ).slice(0, 3);

        // 2. Database records matching
        const [allProds, allCusts, allInvs, allBatches] = await Promise.all([
          offlineDb.products.toArray(),
          offlineDb.customers.toArray(),
          offlineDb.invoices.toArray(),
          offlineDb.inventoryBatches.toArray(),
        ]);

        const matchedProds = allProds
          .filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.sku.toLowerCase().includes(q) ||
              (p.genericName && p.genericName.toLowerCase().includes(q)) ||
              (p.barcode && p.barcode.includes(q))
          )
          .slice(0, 4)
          .map((p) => ({ id: p.id, name: p.name, sku: p.sku, categoryName: p.categoryName }));

        const matchedCusts = allCusts
          .filter(
            (c) =>
              c.name.toLowerCase().includes(q) ||
              (c.phone && c.phone.includes(q)) ||
              (c.city && c.city.toLowerCase().includes(q))
          )
          .slice(0, 4)
          .map((c) => ({ id: c.id, name: c.name, city: c.city || "", phone: c.phone }));

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

        const matchedBatches = allBatches
          .filter(
            (b) =>
              (b.batchNumber && b.batchNumber.toLowerCase().includes(q)) ||
              (b.productName && b.productName.toLowerCase().includes(q))
          )
          .slice(0, 3)
          .map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            productName: b.productName,
            remainingQuantity: b.remainingQuantity || 0,
          }));

        setSearchResults({
          navItems: matchedNav,
          products: matchedProds,
          customers: matchedCusts,
          invoices: matchedInvs,
          batches: matchedBatches,
        });
        setIsSearchOpen(true);
      } catch (err) {
        console.error("Universal search error:", err);
      }
    }, 150);

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

  const handleNavigateToResult = (url: string) => {
    setIsSearchOpen(false);
    setIsMobileSearchOpen(false);
    setSearchQuery("");
    router.push(url);
  };

  const roleLabel =
    currentUser?.role === "admin"
      ? "Owner / Admin"
      : currentUser?.role === "manager"
      ? "Manager"
      : currentUser?.role === "accountant"
      ? "Accountant"
      : currentUser?.role === "warehouse_staff"
      ? "Store & Stock Staff"
      : currentUser?.role === "booking_user"
      ? "Order Booking Staff"
      : "Medical Rep";

  const hasAnyResults =
    searchResults.navItems.length > 0 ||
    searchResults.products.length > 0 ||
    searchResults.customers.length > 0 ||
    searchResults.invoices.length > 0 ||
    searchResults.batches.length > 0;

  return (
    <header className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between px-3 sm:px-4 md:px-6 h-16 gap-2 sm:gap-3">
        {/* Left: Mobile Sidebar Toggle & Category Switcher */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={onToggleSidebar}
            aria-label="Toggle navigation menu"
            className="p-2.5 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 btn-interactive"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Dynamic Category Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              className="flex items-center gap-2 px-3 sm:px-3.5 py-2 min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm btn-interactive"
            >
              <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="hidden sm:inline">Category:</span>
              <span className="text-teal-700 dark:text-teal-300 font-bold truncate max-w-[130px] sm:max-w-[180px]">
                {selectedCategoryId === "all"
                  ? "All Categories"
                  : categories.find((c) => c.id === selectedCategoryId)?.name || "Category"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {isCategoryMenuOpen && (
              <div
                className="absolute left-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-dropdown border border-slate-200 dark:border-slate-700 py-2.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={() => setIsCategoryMenuOpen(false)}
              >
                <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Medicine Categories
                </div>
                <button
                  onClick={() => setSelectedCategoryId("all")}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                    selectedCategoryId === "all"
                      ? "bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold"
                      : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <span>All Categories (Tamam Medicines)</span>
                  {selectedCategoryId === "all" && <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-sm" />}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors ${
                      selectedCategoryId === cat.id
                        ? "bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold"
                        : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span>{cat.name}</span>
                    {selectedCategoryId === cat.id && <span className="w-2.5 h-2.5 rounded-full bg-teal-500 shadow-sm" />}
                  </button>
                ))}
                <div className="border-t border-slate-100 dark:border-slate-800 my-1.5" />
                <Link
                  href="/categories"
                  className="block px-4 py-2 text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline"
                >
                  Manage / Add Categories →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Center: Universal Search Bar (Desktop) */}
        <div ref={searchContainerRef} className="hidden md:flex items-center flex-1 max-w-lg mx-4 relative">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchQuery.trim().length >= 2) setIsSearchOpen(true);
              }}
              placeholder="Universal Search (e.g. Panadol, Invoices, Stock, Khata)..."
              className="w-full pl-10 pr-20 py-2 text-xs md:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-sm"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery ? (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setIsSearchOpen(false);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-400 bg-slate-100 dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600">
                  Ctrl K
                </kbd>
              )}
            </div>
          </div>

          {/* Floating Universal Search Results Dropdown */}
          {isSearchOpen && (
            <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 py-2 z-50 max-h-[70vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-100 divide-y divide-slate-100 dark:divide-slate-800">
              {!hasAnyResults ? (
                <div className="p-5 text-center text-xs text-slate-400">
                  No records or modules found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                <>
                  {/* Modules / Navigation Shortcuts */}
                  {searchResults.navItems.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                        <Compass className="w-3 h-3" /> System Pages & Modules
                      </div>
                      {searchResults.navItems.map((item) => (
                        <button
                          key={item.path}
                          onClick={() => handleNavigateToResult(item.path)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between group transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                              {item.name}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {item.module}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Products / Medicines */}
                  {searchResults.products.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 flex items-center gap-1.5">
                        <Pill className="w-3 h-3" /> Medicines & Products
                      </div>
                      {searchResults.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => handleNavigateToResult(`/products/detail?id=${encodeURIComponent(p.id)}`)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between group transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-teal-600 dark:group-hover:text-teal-400">
                              {p.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              SKU: {p.sku} &bull; {p.categoryName}
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-teal-600 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Customers / Pharmacies */}
                  {searchResults.customers.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                        <Users className="w-3 h-3" /> Customers / Pharmacies
                      </div>
                      {searchResults.customers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handleNavigateToResult(`/customers/detail?id=${encodeURIComponent(c.id)}`)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between group transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                              {c.name}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {c.city} &bull; {c.phone}
                            </div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-transform group-hover:translate-x-0.5" />
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Invoices / Bills */}
                  {searchResults.invoices.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                        <Receipt className="w-3 h-3" /> Invoices / Bills
                      </div>
                      {searchResults.invoices.map((inv) => (
                        <button
                          key={inv.id}
                          onClick={() => handleNavigateToResult(`/sales/invoices`)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between group transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                              Bill: {inv.ref}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Customer: {inv.customerName}
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {formatPKR(inv.netTotal)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Batches & Stock */}
                  {searchResults.batches.length > 0 && (
                    <div className="py-1">
                      <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                        <Barcode className="w-3 h-3" /> Stock Batches
                      </div>
                      {searchResults.batches.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => handleNavigateToResult(`/inventory/batches`)}
                          className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between group transition-colors"
                        >
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-400">
                              Batch: {b.batchNumber}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {b.productName}
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded">
                            {b.remainingQuantity} Boxes Left
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

        {/* Right: Search (Mobile), Online Status, Sync, Theme, Profile */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Mobile Search Button */}
          <button
            onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
            aria-label="Open Universal Search"
            className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Search className="w-5 h-5" />
          </button>

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

          {/* Pending Sync Counter */}
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

          {/* Mobile Universal Search Trigger */}
          <button
            onClick={() => setIsMobileSearchOpen(true)}
            aria-label="Universal Search"
            className="md:hidden p-2.5 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 btn-interactive"
          >
            <Search className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="p-2.5 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors btn-interactive"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1.5 min-h-[44px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all btn-interactive"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : "A"}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {currentUser?.displayName || "Admin User"}
                </span>
                <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 leading-tight">
                  {roleLabel}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {isProfileMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-dropdown border border-slate-200 dark:border-slate-700 py-2.5 z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={() => setIsProfileMenuOpen(false)}
              >
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {currentUser?.displayName || "Shop Owner / Admin"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {currentUser?.email || "admin@noxderma.com"}
                  </p>
                  <span className="inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-lg text-xs font-bold bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    <Shield className="w-3.5 h-3.5" />
                    {roleLabel}
                  </span>
                </div>

                <Link
                  href="/settings"
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors font-medium"
                >
                  <User className="w-4 h-4 text-slate-400" />
                  <span>My Profile & Settings</span>
                </Link>

                <div className="border-t border-slate-100 dark:border-slate-800 my-1.5" />

                <button
                  onClick={onLogout}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors font-semibold"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out (Sign Out)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Search Modal Overlay */}
      {isMobileSearchOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md p-4 flex flex-col animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-3">
            <span className="font-extrabold text-base text-white flex items-center gap-2">
              <Search className="w-4 h-4 text-teal-400" />
              Universal Search
            </span>
            <button
              onClick={() => setIsMobileSearchOpen(false)}
              aria-label="Close search"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 min-h-[40px] min-w-[40px] flex items-center justify-center btn-interactive"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search anything (Medicines, bills, stores)..."
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-700 bg-slate-900 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 text-base shadow-inner"
            />
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto mt-3 rounded-2xl bg-slate-900 border border-slate-800 p-2.5 space-y-2 pb-safe">
            {!hasAnyResults ? (
              <div className="p-8 text-center text-sm text-slate-400">
                Type at least 2 characters to search across medicines, bills, khata, and modules
              </div>
            ) : (
              <>
                {searchResults.navItems.map((item) => (
                  <button
                    key={item.path}
                    onClick={() => handleNavigateToResult(item.path)}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/60 active:bg-slate-800 flex items-center justify-between min-h-[50px] btn-interactive"
                  >
                    <span className="text-sm font-bold text-teal-400">{item.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">{item.module}</span>
                  </button>
                ))}
                {searchResults.products.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleNavigateToResult(`/products/detail?id=${encodeURIComponent(p.id)}`)}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/60 active:bg-slate-800 flex items-center justify-between min-h-[50px] btn-interactive"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{p.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">SKU: {p.sku}</div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </button>
                ))}
                {searchResults.customers.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleNavigateToResult(`/customers/detail?id=${encodeURIComponent(c.id)}`)}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/60 active:bg-slate-800 flex items-center justify-between min-h-[50px] btn-interactive"
                  >
                    <div>
                      <div className="text-sm font-bold text-white">{c.name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{c.city} &bull; {c.phone}</div>
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </button>
                ))}
                {searchResults.invoices.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => handleNavigateToResult(`/sales/invoices`)}
                    className="w-full text-left p-3 rounded-xl bg-slate-800/60 active:bg-slate-800 flex items-center justify-between min-h-[50px] btn-interactive"
                  >
                    <div>
                      <div className="text-sm font-bold text-emerald-400 font-mono">{inv.ref}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{inv.customerName}</div>
                    </div>
                    <span className="text-sm font-bold text-white font-mono">{formatPKR(inv.netTotal)}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
