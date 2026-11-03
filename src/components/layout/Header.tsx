"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
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
  ArrowLeft,
  Scale,
  CreditCard,
  Calculator,
  Ticket,
  Factory,
  Truck,
  Camera,
  Loader2,
} from "lucide-react";
import { formatPKR } from "@/lib/formatting";
import { syncManager } from "@/lib/offline/sync";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import {
  getUserRoleLabel,
  isRoleRedundantForName,
  normalizeUserDisplayName,
  type DynamicCategory,
  type UserProfile,
  type Permission,
} from "@/types";

interface HeaderProps {
  onToggleSidebar: () => void;
  currentUser?: UserProfile | null;
  onLogout?: () => void;
}

interface SearchNavItem {
  name: string;
  path: string;
  module: string;
  keywords: string;
  requiredPermission?: Permission;
  requiredAnyPermissions?: Permission[];
}

const APP_NAVIGATION_SEARCH_ITEMS: SearchNavItem[] = [
  // Dashboard / Home
  {
    name: "Business Dashboard (Daily Overview)",
    path: "/",
    module: "Dashboard",
    keywords: "dashboard home overview today sales cash stats quick stats business overview rozana karobar",
  },

  // Products & Costing Estimator
  {
    name: "New Product Price Estimator & Margin Calculator",
    path: "/products/price-estimator",
    module: "Products",
    keywords: "estimator price estimate new product formula costing cost margin calculator packaging markup profit roi batch sizing batch size tablet syrup ointment raw material excipient formula qeemat andaza",
    requiredPermission: "pricing:view",
  },
  {
    name: "Medicine Catalog & Products",
    path: "/products",
    module: "Inventory",
    keywords: "products product medicine medicines items skus catalog list all medicines tablet capsule syrup derma cream serum lotion price dawai adwiyat",
    requiredAnyPermissions: ["products:view", "products:edit"],
  },
  {
    name: "Stock & Low-Stock Alerts",
    path: "/inventory",
    module: "Inventory",
    keywords: "stock godown warehouse alert reorder low stock inventory count available stock quantity mal godam kam stock",
    requiredPermission: "inventory:view",
  },
  {
    name: "Batch Stock & FEFO Expiry Dates",
    path: "/inventory/batches",
    module: "Inventory",
    keywords: "batch batches expiry near fefo date expiry alert expired batches stock remaining quantity miad tareekh",
    requiredPermission: "inventory:view",
  },
  {
    name: "Stock Movement History & Audit",
    path: "/inventory/movements",
    module: "Inventory",
    keywords: "stock movements stock history audit stock in stock out transfer adjustment batch tracking damage inventory history mal ki harkat",
    requiredPermission: "inventory:view",
  },
  {
    name: "Medicine Categories & Types",
    path: "/categories",
    module: "Catalog",
    keywords: "category categories classification types derma antibiotic syrup tablet ointments iqsam qisam",
    requiredPermission: "categories:manage",
  },

  // Sales & Invoicing
  {
    name: "Customer Bills (Invoices)",
    path: "/sales/invoices",
    module: "Sales",
    keywords: "bill bills invoice invoices sale sales memo receipt history invoices list sales record farokht parchi",
    requiredPermission: "invoices:view",
  },
  {
    name: "Make New Bill (New Sale Invoice)",
    path: "/sales/invoices/new",
    module: "Sales",
    keywords: "new bill make bill create invoice add medicine sell billing pos counter instant invoice naya bill parchi",
    requiredPermission: "invoices:create",
  },
  {
    name: "Field Staff Orders (Bookings)",
    path: "/sales/bookings",
    module: "Sales",
    keywords: "booking bookings order orders rep staff field orders approval order booking medical rep dcr",
    requiredPermission: "invoices:create",
  },
  {
    name: "Customer Returns & Damage Claims",
    path: "/sales/returns",
    module: "Sales",
    keywords: "return returns credit note damage expired refund exchange return goods claim wapsi nuqsan",
    requiredPermission: "invoices:reverse",
  },
  {
    name: "Courier & Online Pharmacy Orders",
    path: "/sales/online-orders",
    module: "Sales",
    keywords: "online order orders web app pharmacy portal courier tcs leopards checkout booking store incoming orders dak",
    requiredPermission: "invoices:view",
  },

  // Purchases & Suppliers
  {
    name: "Buy Stock (Purchases / GRN)",
    path: "/purchases",
    module: "Purchases",
    keywords: "purchase purchases po grn vendor supplier buy inward stock receiving order raw stock khareedari mal lena",
    requiredPermission: "inventory:receive",
  },
  {
    name: "Pharmaceutical Manufacturers",
    path: "/manufacturers",
    module: "Suppliers",
    keywords: "manufacturer manufacturers supplier vendor factory pharma company brand producer source direct karakhana factory",
    requiredAnyPermissions: ["products:view", "products:edit"],
  },
  {
    name: "Distributors & Supply Network",
    path: "/distributors",
    module: "Suppliers",
    keywords: "distributor distributors distribution supply network wholesale dealer agency vendor agency mal",
    requiredPermission: "crm:customers",
  },

  // Clients & CRM
  {
    name: "Pharmacies & Medical Stores",
    path: "/customers",
    module: "Clients",
    keywords: "customer customers pharmacy pharmacies shop medical store client clients chemist hospital clinic address phone dukandar grahak",
    requiredPermission: "crm:customers",
  },
  {
    name: "CRM Leads & Prospective Doctors",
    path: "/crm/leads",
    module: "CRM",
    keywords: "crm lead leads doctor clinic prospect prospective new customer inquiry call pipeline raabta naye doctor",
    requiredPermission: "crm:leads",
  },
  {
    name: "Doctor & Pharmacy Field Visits",
    path: "/crm/visits",
    module: "CRM",
    keywords: "visit visits doctor visit field call tour dcr daily call report rep visit tracking logs chakkar mulakat",
    requiredPermission: "crm:visits",
  },

  // Finance & Ledgers
  {
    name: "Market Udhaar (Pending Credit Balance)",
    path: "/finance/credit",
    module: "Finance",
    keywords: "udhaar credit balance receive ledger khata market recovery pending aging outstanding baqaya wasooli udhar",
    requiredPermission: "finance:aging",
  },
  {
    name: "Customer Khata (Receivables Ledger)",
    path: "/finance/ledgers/customers",
    module: "Finance",
    keywords: "khata ledger customer customers statement receivable account balance payment receipt slip hisab kitab grahak khata",
    requiredPermission: "finance:ledgers",
  },
  {
    name: "Company Khata (Payables / Vendors)",
    path: "/finance/ledgers/manufacturers",
    module: "Finance",
    keywords: "khata company manufacturer vendor payable supplier payment clear cheques company ka hisab dena",
    requiredPermission: "finance:ledgers",
  },
  {
    name: "Partners Khata (Capital, Investment & Profit Sharing)",
    path: "/finance/partners",
    module: "Finance",
    keywords: "partners khata partner hisab sharakat capital drawings profit withdrawal investment share partner 1 partner 2 sarmaya munafa sharakat dar partnership",
    requiredPermission: "finance:pnl",
  },
  {
    name: "Staff Salaries & Payroll (Tankhwah)",
    path: "/finance/salaries",
    module: "Finance",
    keywords: "salary salaries staff tankhwah payroll allowances deductions net salary pay slip bank cash slip finance employee wages tankhah tankhwa",
    requiredPermission: "finance:pnl",
  },
  {
    name: "Profit & Loss Statement (P&L / Kamai)",
    path: "/finance/pnl",
    module: "Finance",
    keywords: "profit loss pnl kamai margin revenue net profit gross income finance report munafa nuqsan bachath",
    requiredPermission: "finance:pnl",
  },

  // Marketing & Promotions
  {
    name: "Promotional Coupons & Privilege Codes",
    path: "/marketing/coupons",
    module: "Marketing",
    keywords: "coupon coupons promo code discount privilege offer discount voucher campaign privilege discount riayat chhoot",
    requiredPermission: "marketing:manage",
  },
  {
    name: "WhatsApp Campaigns & Bulk Messaging",
    path: "/marketing/whatsapp",
    module: "Marketing",
    keywords: "whatsapp campaign marketing message broadcast offer promo blast alert paighamat paigham",
    requiredPermission: "marketing:manage",
  },
  {
    name: "Marketing Hub & Promotion Overview",
    path: "/marketing",
    module: "Marketing",
    keywords: "marketing promotion discount schemes privilege loyalty campaigns ads ishtihar tarweej",
    requiredPermission: "marketing:manage",
  },

  // Staff & HR
  {
    name: "Staff Live Location & Multi-Device Battery",
    path: "/employees/monitoring",
    module: "HR / Staff",
    keywords: "staff live location gps mobile battery charging phone model multi device computer tracking field map mulazmeen location",
    requiredPermission: "staff:monitoring",
  },
  {
    name: "Sales Targets & Staff Performance",
    path: "/employees/targets",
    module: "HR / Staff",
    keywords: "target targets employee staff performance kpi quota rep achievement commission target sheet hadaf",
    requiredPermission: "staff:targets",
  },
  {
    name: "Staff Accounts & Permissions (RBAC)",
    path: "/users",
    module: "Settings",
    keywords: "users staff login permission rbac roles user management account employee access mulazmeen access ijazat",
    requiredPermission: "users:manage",
  },

  // Reports & Analytics
  {
    name: "Business Reports & Analytics",
    path: "/reports",
    module: "Analytics",
    keywords: "reports analytics charts sales report inventory report ledger summary export pdf excel karobari report",
    requiredPermission: "finance:pnl",
  },

  // System & Settings
  {
    name: "Company Settings, Branding & Theme",
    path: "/settings",
    module: "Settings",
    keywords: "settings theme logo profile address print bill format invoice setup config company details tareeqat setting",
    requiredPermission: "settings:manage",
  },
  {
    name: "System Notifications & Alerts",
    path: "/notifications",
    module: "Settings",
    keywords: "notifications alerts system messages expiry low stock credit warnings itilahaat paigham",
    requiredPermission: "settings:manage",
  },
  {
    name: "External Integrations & Webhooks",
    path: "/integrations",
    module: "Settings",
    keywords: "integrations api webhooks whatsapp gateway cloud connection external sync rabtay jor",
    requiredPermission: "settings:manage",
  },
  {
    name: "Data Sync & Offline Cloud Status",
    path: "/sync",
    module: "System",
    keywords: "sync offline online backup cloud pending queue storage dexie indexeddb status mehfooz backup",
    requiredPermission: "sync:reconcile",
  },
  {
    name: "Action History & Audit Logs (Owner)",
    path: "/audit",
    module: "Owner / Security",
    keywords: "audit logs history tracker who did what undo activity logs owner changes delete revert restore roll back khata tareekh karwayi",
    requiredPermission: "audit:view",
  },
];

export function Header({ onToggleSidebar, currentUser, onLogout }: HeaderProps) {
  const router = useRouter();
  const { selectedCategoryId, setSelectedCategoryId, categories } = useCategory();
  const { hasPermission, hasAnyPermission, updateCurrentUser } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const compressAvatarImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const size = Math.min(img.width, img.height);
          const startX = (img.width - size) / 2;
          const startY = (img.height - size) / 2;

          const canvas = document.createElement("canvas");
          const targetDim = 256;
          canvas.width = targetDim;
          canvas.height = targetDim;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, startX, startY, size, size, 0, 0, targetDim, targetDim);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Image size should be less than 5MB.");
      return;
    }

    setIsUploadingAvatar(true);
    try {
      const compressedDataUrl = await compressAvatarImage(file);
      await updateCurrentUser({ avatarUrl: compressedDataUrl });
    } catch (err: any) {
      console.error("Avatar upload failed:", err);
      alert("Failed to update profile picture: " + (err.message || "Unknown error"));
    } finally {
      setIsUploadingAvatar(false);
      if (e.target) e.target.value = "";
    }
  };

  const handleRemoveAvatar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Kya aap profile picture remove karna chahte hain?")) {
      setIsUploadingAvatar(true);
      try {
        await updateCurrentUser({ avatarUrl: "" });
      } catch (err: any) {
        console.error("Failed to remove avatar:", err);
      } finally {
        setIsUploadingAvatar(false);
      }
    }
  };

  // Universal Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [mobileFilterType, setMobileFilterType] = useState<"all" | "products" | "customers" | "invoices" | "batches" | "nav">("all");
  const [searchResults, setSearchResults] = useState<{
    navItems: { name: string; path: string; module: string }[];
    products: { id: string; name: string; sku: string; categoryName: string }[];
    customers: { id: string; name: string; city: string; phone: string }[];
    invoices: { id: string; ref: string; customerName: string; netTotal: number }[];
    batches: { id: string; batchNumber: string; productName: string; remainingQuantity: number }[];
  }>({ navItems: [], products: [], customers: [], invoices: [], batches: [] });

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
    const isDark =
      document.documentElement.classList.contains("dark") ||
      (typeof window !== "undefined" && localStorage.getItem("noxderma_dark_mode") === "true");
    setIsDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  // Lock background scrolling on mobile when search modal is open
  useEffect(() => {
    if (isMobileSearchOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileSearchOpen]);

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
        setIsCategoryMenuOpen(false);
        setIsProfileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close search, category, and profile dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(target)
      ) {
        setIsSearchOpen(false);
      }
      if (
        categoryMenuRef.current &&
        !categoryMenuRef.current.contains(target)
      ) {
        setIsCategoryMenuOpen(false);
      }
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
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
        // 1. Navigation items matching (strictly filtered by user permissions)
        const canAccessSearchPath = (p: string): boolean => {
          if (p === "/") return true;
          if (p.startsWith("/sales/invoices/edit")) return hasPermission("invoices:edit");
          if (p.startsWith("/sales/invoices/new") || p.startsWith("/sales/bookings")) return hasPermission("invoices:create");
          if (p.startsWith("/sales/returns")) return hasPermission("invoices:reverse");
          if (p.startsWith("/sales")) return hasPermission("invoices:view");
          if (p.startsWith("/products/price-estimator")) return hasPermission("pricing:view");
          if (p.startsWith("/products/new")) return hasPermission("products:edit");
          if (p.startsWith("/products") || p.startsWith("/manufacturers")) return hasAnyPermission(["products:view", "products:edit"]);
          if (p.startsWith("/categories")) return hasPermission("categories:manage");
          if (p.startsWith("/purchases")) return hasPermission("inventory:receive");
          if (p.startsWith("/inventory")) return hasPermission("inventory:view");
          if (p.startsWith("/customers") || p.startsWith("/distributors")) return hasPermission("crm:customers");
          if (p.startsWith("/crm/leads")) return hasPermission("crm:leads");
          if (p.startsWith("/crm/visits")) return hasPermission("crm:visits");
          if (p.startsWith("/employees/monitoring")) return hasPermission("staff:monitoring");
          if (p.startsWith("/employees/targets")) return hasPermission("staff:targets");
          if (p.startsWith("/employees/salaries") || p.startsWith("/finance/salaries")) return hasPermission("finance:pnl");
          if (p.startsWith("/finance/credit")) return hasPermission("finance:aging");
          if (p.startsWith("/finance/ledgers")) return hasPermission("finance:ledgers");
          if (p.startsWith("/finance/partners")) return hasPermission("finance:pnl");
          if (p.startsWith("/finance/pnl") || p.startsWith("/reports")) return hasPermission("finance:pnl");
          if (p.startsWith("/marketing")) return hasPermission("marketing:manage");
          if (p.startsWith("/audit")) return hasPermission("audit:view");
          if (p.startsWith("/sync")) return hasPermission("sync:reconcile");
          if (p.startsWith("/users")) return hasPermission("users:manage");
          if (p.startsWith("/settings") || p.startsWith("/notifications") || p.startsWith("/integrations")) return hasPermission("settings:manage");
          return false;
        };

        const canAccessNavItem = (item: SearchNavItem): boolean => {
          if (item.path === "/") return true;
          if (item.requiredAnyPermissions && item.requiredAnyPermissions.length > 0) {
            return hasAnyPermission(item.requiredAnyPermissions);
          }
          if (item.requiredPermission) {
            return hasPermission(item.requiredPermission);
          }
          return canAccessSearchPath(item.path);
        };

        const qClean = q.trim().toLowerCase();
        const searchTokens = qClean.split(/\s+/).filter(Boolean);

        const isTokenMatch = (targetText: string): boolean => {
          const lower = targetText.toLowerCase();
          if (lower.includes(qClean)) return true;
          return searchTokens.length > 0 && searchTokens.every((token) => lower.includes(token));
        };

        const matchedNav = APP_NAVIGATION_SEARCH_ITEMS.filter((item) => {
          if (!canAccessNavItem(item)) return false;
          const searchableText = `${item.name} ${item.module} ${item.keywords} ${item.path}`;
          return isTokenMatch(searchableText);
        }).slice(0, 10);

        // 2. Database records matching (strictly filtered by user permissions)
        const [allProds, allCusts, allInvs, allBatches] = await Promise.all([
          hasPermission("products:view") ? offlineDb.products.toArray() : Promise.resolve([]),
          hasPermission("crm:customers") ? offlineDb.customers.toArray() : Promise.resolve([]),
          hasPermission("invoices:view") ? offlineDb.invoices.toArray() : Promise.resolve([]),
          hasPermission("inventory:view") ? offlineDb.inventoryBatches.toArray() : Promise.resolve([]),
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
  }, [searchQuery, currentUser, hasPermission, hasAnyPermission]);

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
      try {
        localStorage.setItem("noxderma_dark_mode", "true");
      } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem("noxderma_dark_mode", "false");
      } catch {}
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
    currentUser?.role === "owner" || currentUser?.role === "admin"
      ? "Owner"
      : currentUser?.role === "manager"
      ? "Manager"
      : currentUser?.role === "accountant"
      ? "Accountant"
      : currentUser?.role === "warehouse_staff"
      ? "Store & Stock Staff"
      : currentUser?.role === "sales_rep" || currentUser?.role === "booking_user"
      ? "Order Booking Staff"
      : getUserRoleLabel(currentUser?.role);

  const displayUserName = normalizeUserDisplayName(
    currentUser?.displayName,
    roleLabel === "Owner" ? "Owner" : "Staff"
  );
  const roleIsDuplicateOfName = isRoleRedundantForName(displayUserName, roleLabel);

  const hasAnyResults =
    searchResults.navItems.length > 0 ||
    searchResults.products.length > 0 ||
    searchResults.customers.length > 0 ||
    searchResults.invoices.length > 0 ||
    searchResults.batches.length > 0;

  return (
    <header className="sticky top-0 z-30 w-full max-w-[100vw] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between px-2.5 sm:px-4 md:px-6 h-16 gap-1.5 sm:gap-3">
        {/* Left: Category Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          {/* Dynamic Category Switcher Dropdown */}
          <div ref={categoryMenuRef} className="relative min-w-0">
            <button
              onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shadow-sm btn-interactive"
            >
              <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span className="hidden sm:inline">Category:</span>
              <span className="text-teal-700 dark:text-teal-300 font-bold truncate max-w-[100px] sm:max-w-[180px]">
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
                {hasPermission("categories:manage") && (
                  <>
                    <div className="border-t border-slate-100 dark:border-slate-800 my-1.5" />
                    <Link
                      href="/categories"
                      className="block px-4 py-2 text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline"
                    >
                      Manage / Add Categories →
                    </Link>
                  </>
                )}
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
        <div className="flex items-center gap-1 sm:gap-2 md:gap-3 shrink-0">
          {/* Online/Offline Status Indicator */}
          <div
            title={isOnline ? "Connected to Internet" : "Working Offline (No Internet)"}
            className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-xs font-semibold ${
              isOnline
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
            }`}
          >
            {isOnline ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 animate-pulse shrink-0" />
            )}
            <span className="hidden sm:inline">{isOnline ? "Online" : "Offline"}</span>
          </div>

          {/* Pending Sync Counter */}
          {pendingCount > 0 && (
            <button
              onClick={handleManualSync}
              disabled={isSyncing || !isOnline}
              title={`${pendingCount} items waiting to save online. Click to save.`}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 text-xs font-semibold hover:bg-teal-100 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isSyncing ? "animate-spin text-teal-600" : ""}`} />
              <span>{pendingCount}</span>
            </button>
          )}

          {/* Mobile Universal Search Trigger */}
          <button
            onClick={() => setIsMobileSearchOpen(true)}
            aria-label="Universal Search"
            className="md:hidden p-2 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 btn-interactive"
          >
            <Search className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
          </button>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            className="p-2 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors btn-interactive"
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-400 shrink-0" /> : <Moon className="w-5 h-5 text-slate-600 shrink-0" />}
          </button>

          {/* User Profile Dropdown */}
          <div ref={profileMenuRef} className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-1.5 sm:gap-2 p-1 min-h-[40px] rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all btn-interactive"
              title="Click to view profile or change photo"
            >
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-white font-bold text-sm shadow-sm shrink-0 overflow-hidden ring-2 ring-teal-500/20">
                {currentUser?.avatarUrl ? (
                  <img
                    src={currentUser.avatarUrl}
                    alt={displayUserName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{displayUserName ? displayUserName[0].toUpperCase() : "O"}</span>
                )}
              </div>
              <div className="hidden sm:flex flex-col text-left">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight">
                  {displayUserName}
                </span>
                <span className="text-xs font-semibold text-teal-600 dark:text-teal-400 leading-tight truncate max-w-[140px]">
                  {roleIsDuplicateOfName
                    ? currentUser?.email || "Full Access"
                    : roleLabel}
                </span>
              </div>
              <ChevronDown className="hidden sm:block w-4 h-4 text-slate-400 shrink-0" />
            </button>

            {isProfileMenuOpen && (
              <div
                className="absolute right-0 mt-2 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-dropdown border border-slate-200 dark:border-slate-700 py-2.5 z-50 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="relative group shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-white font-extrabold text-base shadow-md overflow-hidden ring-2 ring-teal-500/30">
                        {isUploadingAvatar ? (
                          <Loader2 className="w-5 h-5 animate-spin text-white" />
                        ) : currentUser?.avatarUrl ? (
                          <img
                            src={currentUser.avatarUrl}
                            alt={displayUserName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span>{displayUserName ? displayUserName[0].toUpperCase() : "O"}</span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={isUploadingAvatar}
                        className="absolute inset-0 bg-slate-950/60 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[9px] font-bold"
                        title="Upload or Change Profile Photo"
                      >
                        <Camera className="w-4 h-4 mb-0.5" />
                        <span>Change</span>
                      </button>
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {displayUserName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {currentUser?.email || "admin@noxderma.com"}
                      </p>
                      <span className="inline-flex items-center gap-1.5 mt-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                        <Shield className="w-3 h-3" />
                        {roleIsDuplicateOfName ? "Full System Access" : roleLabel}
                      </span>
                    </div>
                  </div>

                  {/* Quick Photo Upload & Remove Buttons */}
                  <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={isUploadingAvatar}
                      className="inline-flex items-center gap-1.5 text-teal-600 dark:text-teal-400 hover:text-teal-700 font-bold transition-colors disabled:opacity-50"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>{isUploadingAvatar ? "Uploading..." : currentUser?.avatarUrl ? "Change Photo" : "Upload Photo"}</span>
                    </button>

                    {currentUser?.avatarUrl && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={isUploadingAvatar}
                        className="text-slate-400 hover:text-rose-500 font-semibold transition-colors text-xs"
                        title="Remove profile picture"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>

                <div className="py-1">
                  {hasPermission("settings:manage") && (
                    <Link
                      href="/settings"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 transition-colors font-medium"
                    >
                      <User className="w-4 h-4 text-slate-400" />
                      <span>My Profile &amp; Settings</span>
                    </Link>
                  )}

                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      onLogout?.();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2.5 transition-colors font-semibold"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out (Sign Out)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Full-Screen Native Mobile Search Sheet (Rendered via Portal to avoid backdrop-filter trapping) */}
      {isMounted && isMobileSearchOpen && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Universal Search"
          className="fixed inset-0 z-[100] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col h-dvh w-screen overflow-hidden animate-in fade-in duration-150"
        >
          {/* Top Search App Bar */}
          <div className="p-3 sm:p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-2.5 shrink-0 shadow-sm dark:shadow-lg">
            <div className="flex items-center gap-2">
              {/* Back / Exit Button */}
              <button
                onClick={() => {
                  setIsMobileSearchOpen(false);
                  setSearchQuery("");
                }}
                aria-label="Close search"
                className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] min-w-[44px] flex items-center justify-center btn-interactive shrink-0"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* Search Input Box */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-teal-600 dark:text-teal-400 pointer-events-none" />
                <input
                  autoFocus
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search medicines, bills, khata, shops..."
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 text-base shadow-inner"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear query"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Cancel Button */}
              <button
                onClick={() => {
                  setIsMobileSearchOpen(false);
                  setSearchQuery("");
                }}
                className="px-2 py-1.5 text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 active:scale-95"
              >
                Cancel
              </button>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs">
              {[
                { id: "all", label: "All" },
                { id: "products", label: "Medicines", icon: Pill, count: searchResults.products.length },
                { id: "customers", label: "Pharmacies", icon: Users, count: searchResults.customers.length },
                { id: "invoices", label: "Bills", icon: Receipt, count: searchResults.invoices.length },
                { id: "batches", label: "Batches", icon: Barcode, count: searchResults.batches.length },
                { id: "nav", label: "Pages", icon: Compass, count: searchResults.navItems.length },
              ].map((tab) => {
                const isSelected = mobileFilterType === tab.id;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobileFilterType(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 ${
                      isSelected
                        ? "bg-teal-600 text-white shadow-sm shadow-teal-600/30"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/60"
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    <span>{tab.label}</span>
                    {searchQuery.trim().length >= 2 && tab.count !== undefined && tab.count > 0 && (
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isSelected ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-teal-700 dark:text-teal-300"
                        }`}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Body Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 pb-safe bg-slate-50/70 dark:bg-slate-950">
            {searchQuery.trim().length < 2 ? (
              /* Pre-search Direct Jump Shortcuts */
              <div className="space-y-4 pt-1">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 px-1">
                    ⚡ Quick Access Shortcuts
                  </span>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {[
                      { name: "Price Estimator", path: "/products/price-estimator", desc: "Formulas & Costing", icon: Calculator, color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800/60" },
                      { name: "Make New Bill", path: "/sales/invoices/new", desc: "Create sale invoice", icon: Receipt, color: "text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 border-teal-200 dark:border-teal-800/60" },
                      { name: "Medicine Catalog", path: "/products", desc: "All medicines & prices", icon: Pill, color: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/60" },
                      { name: "Batch Stock", path: "/inventory/batches", desc: "Batches & expiries", icon: Barcode, color: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800/60" },
                      { name: "Pharmacies", path: "/customers", desc: "Medical store clients", icon: Users, color: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800/60" },
                      { name: "Customer Khata", path: "/finance/ledgers/customers", desc: "Client ledgers", icon: Scale, color: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800/60" },
                      { name: "Market Udhaar", path: "/finance/credit", desc: "Pending balances", icon: CreditCard, color: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800/60" },
                      { name: "Promo Coupons", path: "/marketing/coupons", desc: "Privilege discounts", icon: Ticket, color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/60" },
                    ].map((shortcut) => {
                      const Icon = shortcut.icon;
                      return (
                        <button
                          key={shortcut.path}
                          onClick={() => handleNavigateToResult(shortcut.path)}
                          className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 active:bg-slate-100 dark:active:bg-slate-800 flex flex-col gap-1 text-left shadow-sm btn-interactive transition-all"
                        >
                          <div className="flex items-center gap-2">
                            <div className={`p-1.5 rounded-lg border ${shortcut.color}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-white truncate">{shortcut.name}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{shortcut.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 text-center shadow-sm">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Type at least 2 characters to search across medicines, bills, khata, and system modules.
                  </p>
                </div>
              </div>
            ) : !hasAnyResults ? (
              <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No matching records found for &quot;<span className="text-teal-600 dark:text-teal-400 font-semibold">{searchQuery}</span>&quot;
              </div>
            ) : (
              <div className="space-y-3">
                {/* 1. Pages & Modules */}
                {(mobileFilterType === "all" || mobileFilterType === "nav") && searchResults.navItems.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 px-1 flex items-center gap-1.5">
                      <Compass className="w-3 h-3" /> System Pages & Modules
                    </span>
                    {searchResults.navItems.map((item) => (
                      <button
                        key={item.path}
                        onClick={() => handleNavigateToResult(item.path)}
                        className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500/60 active:bg-slate-50 dark:active:bg-slate-800 flex items-center justify-between min-h-[50px] shadow-sm btn-interactive"
                      >
                        <span className="text-sm font-bold text-slate-800 dark:text-white">{item.name}</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-teal-700 dark:text-teal-400 font-mono border border-slate-200 dark:border-slate-700">
                          {item.module}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. Medicines */}
                {(mobileFilterType === "all" || mobileFilterType === "products") && searchResults.products.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 px-1 flex items-center gap-1.5">
                      <Pill className="w-3 h-3" /> Medicines & Products
                    </span>
                    {searchResults.products.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => handleNavigateToResult(`/products/detail?id=${encodeURIComponent(p.id)}`)}
                        className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/60 active:bg-slate-50 dark:active:bg-slate-800 flex items-center justify-between min-h-[52px] shadow-sm btn-interactive"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-sm font-bold text-slate-800 dark:text-white truncate">{p.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            SKU: <span className="font-mono text-teal-600 dark:text-teal-400">{p.sku}</span> &bull; {p.categoryName}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {/* 3. Customers / Pharmacies */}
                {(mobileFilterType === "all" || mobileFilterType === "customers") && searchResults.customers.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 px-1 flex items-center gap-1.5">
                      <Users className="w-3 h-3" /> Customers / Pharmacies
                    </span>
                    {searchResults.customers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleNavigateToResult(`/customers/detail?id=${encodeURIComponent(c.id)}`)}
                        className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/60 active:bg-slate-50 dark:active:bg-slate-800 flex items-center justify-between min-h-[52px] shadow-sm btn-interactive"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-sm font-bold text-slate-800 dark:text-white truncate">{c.name}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {c.city} &bull; {c.phone}
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {/* 4. Invoices / Bills */}
                {(mobileFilterType === "all" || mobileFilterType === "invoices") && searchResults.invoices.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 px-1 flex items-center gap-1.5">
                      <Receipt className="w-3 h-3" /> Invoices / Bills
                    </span>
                    {searchResults.invoices.map((inv) => (
                      <button
                        key={inv.id}
                        onClick={() => handleNavigateToResult(`/sales/invoices`)}
                        className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-emerald-500/60 active:bg-slate-50 dark:active:bg-slate-800 flex items-center justify-between min-h-[52px] shadow-sm btn-interactive"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">{inv.ref}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{inv.customerName}</div>
                        </div>
                        <span className="text-sm font-bold text-slate-800 dark:text-white font-mono shrink-0">{formatPKR(inv.netTotal)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 5. Batches */}
                {(mobileFilterType === "all" || mobileFilterType === "batches") && searchResults.batches.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 px-1 flex items-center gap-1.5">
                      <Barcode className="w-3 h-3" /> Stock Batches
                    </span>
                    {searchResults.batches.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => handleNavigateToResult(`/inventory/batches`)}
                        className="w-full text-left p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-500/60 active:bg-slate-50 dark:active:bg-slate-800 flex items-center justify-between min-h-[52px] shadow-sm btn-interactive"
                      >
                        <div className="min-w-0 pr-2">
                          <div className="text-sm font-bold text-amber-600 dark:text-amber-400 font-mono truncate">Batch: {b.batchNumber}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{b.productName}</div>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 rounded-full shrink-0">
                          {b.remainingQuantity} Left
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
