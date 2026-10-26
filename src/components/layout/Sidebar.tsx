"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users2,
  Building2,
  MapPin,
  PackageCheck,
  Boxes,
  Barcode,
  ArrowLeftRight,
  Factory,
  ShoppingBag,
  Truck,
  Stethoscope,
  ClipboardList,
  Receipt,
  Globe2,
  RotateCcw,
  BookOpen,
  Scale,
  TrendingUp,
  CreditCard,
  Target,
  Megaphone,
  Share2,
  FileSpreadsheet,
  UserCog,
  BellRing,
  PlugZap,
  Settings,
  Database,
  Calculator,
  Ticket,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  History,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { offlineDb } from "@/lib/offline/db";
import type { Permission } from "@/types";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  requiredPermission?: Permission;
  requiredModule?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const ALL_NAV_SECTIONS: NavSection[] = [
  {
    title: "Daily Sales & Orders",
    items: [
      { name: "Home Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Customer Bills (Invoices)", href: "/sales/invoices", icon: Receipt, requiredPermission: "invoices:view" },
      { name: "Field Staff Orders", href: "/sales/bookings", icon: ClipboardList, requiredPermission: "invoices:create" },
      { name: "Courier & Parcel Deliveries", href: "/sales/online-orders", icon: Globe2, requiredPermission: "invoices:view" },
      { name: "Customer Returns", href: "/sales/returns", icon: RotateCcw, requiredPermission: "invoices:reverse" },
    ],
  },
  {
    title: "Stock & Medicines",
    items: [
      { name: "Medicine Catalog", href: "/products", icon: PackageCheck, requiredPermission: "products:view" },
      { name: "New Product Price Estimator", href: "/products/price-estimator", icon: Calculator, requiredPermission: "pricing:view" },
      { name: "Batch Stock & Expiry Dates", href: "/inventory/batches", icon: Barcode, requiredPermission: "inventory:view" },
      { name: "Stock & Low-Stock Alerts", href: "/inventory", icon: Boxes, requiredPermission: "inventory:view" },
      { name: "Stock In & Out History", href: "/inventory/movements", icon: ArrowLeftRight, requiredPermission: "inventory:view" },
      { name: "Buy Stock (Purchases / GRN)", href: "/purchases", icon: ShoppingBag, requiredPermission: "inventory:receive" },
      { name: "Medicine Companies (Mfrs)", href: "/manufacturers", icon: Factory, requiredPermission: "products:view" },
    ],
  },
  {
    title: "Pharmacies & Visits",
    items: [
      { name: "Pharmacies & Medical Stores", href: "/customers", icon: Building2, requiredPermission: "crm:customers" },
      { name: "Main Distributors", href: "/distributors", icon: Truck, requiredPermission: "crm:customers" },
      { name: "New Client Enquiries (Leads)", href: "/crm/leads", icon: Users2, requiredPermission: "crm:leads" },
      { name: "Doctor & Market Visits", href: "/crm/visits", icon: MapPin, requiredPermission: "crm:visits" },
      { name: "Staff Sales Targets", href: "/employees/targets", icon: Target, requiredPermission: "crm:visits" },
    ],
  },
  {
    title: "Accounts & Balance (Khata)",
    items: [
      { name: "Market Udhaar & Due Payments", href: "/finance/credit", icon: CreditCard, requiredPermission: "finance:aging" },
      { name: "Company Khata (Money to Pay)", href: "/finance/ledgers/manufacturers", icon: BookOpen, requiredPermission: "finance:ledgers" },
      { name: "Customer Khata (Money to Receive)", href: "/finance/ledgers/customers", icon: Scale, requiredPermission: "finance:ledgers" },
      { name: "Profit & Loss Report (Kamai)", href: "/finance/pnl", icon: TrendingUp, requiredPermission: "finance:pnl" },
      { name: "Download Reports", href: "/reports", icon: FileSpreadsheet, requiredPermission: "finance:aging" },
    ],
  },
  {
    title: "Promotions & WhatsApp",
    items: [
      { name: "Special Offers & Schemes", href: "/marketing", icon: Megaphone, requiredPermission: "marketing:manage" },
      { name: "Customer Coupon Codes", href: "/marketing/coupons", icon: Ticket, requiredPermission: "marketing:manage" },
      { name: "Create WhatsApp Offer Card", href: "/marketing/whatsapp", icon: Share2, requiredPermission: "marketing:manage" },
    ],
  },
  {
    title: "System & Settings",
    items: [
      { name: "Action History & Logs (Owner)", href: "/audit", icon: History, requiredPermission: "audit:view" },
      { name: "Save Offline Data to Cloud", href: "/sync", icon: Database, requiredPermission: "sync:reconcile" },
      { name: "Staff Accounts & Logins", href: "/users", icon: UserCog, requiredPermission: "users:manage" },
      { name: "Alert Messages & Reminders", href: "/notifications", icon: BellRing },
      { name: "Connected Tools & APIs", href: "/integrations", icon: PlugZap, requiredPermission: "settings:manage" },
      { name: "Company Profile & Settings", href: "/settings", icon: Settings, requiredPermission: "settings:manage" },
    ],
  },
];

export function Sidebar({ isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, hasPermission } = useAuth();
  const [uiLogo, setUiLogo] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>("NOXDERMA");
  const [hoveredTooltip, setHoveredTooltip] = useState<{ text: string; top: number } | null>(null);

  useEffect(() => {
    setHoveredTooltip(null);
  }, [isCollapsed]);

  // Pre-warm the most frequent application routes for instant client-side transitions
  useEffect(() => {
    const coreRoutes = [
      "/",
      "/sales/invoices",
      "/sales/invoices/new",
      "/products",
      "/inventory/batches",
      "/inventory",
      "/customers",
      "/finance/credit",
      "/purchases",
    ];
    coreRoutes.forEach((route) => {
      try {
        router.prefetch(route);
      } catch {}
    });
  }, [router]);

  useEffect(() => {
    async function loadBrandLogo() {
      // 1. Instant local read from IndexedDB
      try {
        const stored = await offlineDb.settings.get("primary");
        if (stored) {
          if (stored.appLogoUrl && stored.appLogoUrl !== "/brand/logo.svg") {
            setUiLogo(stored.appLogoUrl);
          }
          if (stored.brandName) {
            setBrandName(stored.brandName);
          }
        }
      } catch {}

      // 2. Authoritative server database fetch (survives cookie & site data clearing)
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data?.settings) {
            if (data.settings.appLogoUrl && data.settings.appLogoUrl !== "/brand/logo.svg") {
              setUiLogo(data.settings.appLogoUrl);
            }
            if (data.settings.brandName) {
              setBrandName(data.settings.brandName);
            }
            await offlineDb.settings.put(data.settings);
          }
        }
      } catch {}
    }
    loadBrandLogo();

    // Listen for settings change
    const handleSettingsUpdated = () => loadBrandLogo();
    window.addEventListener("noxderma_settings_updated", handleSettingsUpdated);
    return () => window.removeEventListener("noxderma_settings_updated", handleSettingsUpdated);
  }, []);

  // Close on Escape key and lock background scroll on mobile
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Filter navigation items according to user permissions (Memoized to prevent unnecessary re-filtering)
  const visibleSections = useMemo(() => {
    return ALL_NAV_SECTIONS.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (!currentUser) return false;
        if (item.href === "/audit") {
          return currentUser.role === "owner" || currentUser.role === "admin" || hasPermission("audit:view");
        }
        if (!item.requiredPermission) return true;
        if (currentUser.role === "admin" || currentUser.role === "owner") return true;
        return hasPermission(item.requiredPermission);
      }),
    })).filter((section) => section.items.length > 0);
  }, [currentUser, hasPermission]);

  return (
    <>
      {/* Mobile Backdrop Overlay - Click outside to close drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm lg:hidden transition-opacity animate-in fade-in duration-200 cursor-pointer"
          onClick={onClose}
          aria-label="Close navigation overlay"
        />
      )}

      {/* Sidebar Aside Drawer */}
      <aside
        className={`no-print print:hidden fixed top-0 bottom-0 left-0 z-[70] bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 overflow-x-hidden ${
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        } w-72 sm:w-80 max-w-[85vw] ${
          isCollapsed ? "lg:w-20" : "lg:w-72"
        }`}
      >
        {/* Brand Header */}
        <div
          className={`flex items-center justify-between h-16 border-b border-slate-800 shrink-0 transition-all px-4 sm:px-5 ${
            isCollapsed ? "lg:px-2.5 lg:justify-center" : ""
          }`}
        >
          {/* Mobile: Always Full Brand | Desktop: Full Brand when !isCollapsed */}
          <div className={`${isCollapsed ? "flex lg:hidden" : "flex"} items-center gap-2.5 min-w-0 flex-1`}>
            <Link href="/" prefetch={true} className="flex items-center gap-2.5 min-w-0" onClick={onClose}>
              {uiLogo ? (
                <img
                  src={uiLogo}
                  alt="App Logo"
                  className="w-9 h-9 rounded-xl object-contain bg-white/10 p-1 border border-slate-700 shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/20 shrink-0">
                  <span className="font-extrabold text-white text-base">ND</span>
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-base font-extrabold tracking-tight text-white truncate">
                  {brandName}
                </span>
                <span className="text-[10px] font-semibold text-teal-400 tracking-wider uppercase truncate">
                  Pharma ERP &bull; {currentUser?.role === "owner" ? "Owner" : currentUser?.role === "admin" ? "Admin" : currentUser?.role?.replace("_", " ")}
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Compact Brand Icon when isCollapsed */}
          {isCollapsed && (
            <div className="hidden lg:flex items-center justify-center w-full">
              <Link href="/" prefetch={true} onClick={onClose} title={`${brandName} - Pharma ERP`}>
                {uiLogo ? (
                  <img
                    src={uiLogo}
                    alt="App Logo"
                    className="w-8 h-8 rounded-lg object-contain bg-white/10 p-0.5 border border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-teal-500 to-teal-400 flex items-center justify-center shadow-md shadow-teal-500/20 shrink-0">
                    <span className="font-extrabold text-white text-xs">ND</span>
                  </div>
                )}
              </Link>
            </div>
          )}

          {/* Mobile Close Button (X) */}
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden shrink-0 ml-2 btn-interactive"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections with custom slim bareek vertical scrollbar and strictly no horizontal scroll */}
        <div
          onScroll={() => {
            if (hoveredTooltip) setHoveredTooltip(null);
          }}
          className={`flex-1 sidebar-scrollbar overflow-y-auto overflow-x-hidden px-3 py-4 space-y-6 ${
            isCollapsed ? "lg:px-2 lg:py-4 lg:space-y-3" : ""
          } pb-safe`}
        >
          {visibleSections.map((section, sIdx) => (
            <div key={section.title} className="space-y-1">
              {/* Section Title: Always visible on mobile; hidden on desktop only when collapsed */}
              <h3
                className={`px-3 text-xs font-bold uppercase tracking-wider text-slate-400 ${
                  isCollapsed ? "block lg:hidden" : "block"
                }`}
              >
                {section.title}
              </h3>
              {isCollapsed && sIdx > 0 && (
                <div className="hidden lg:block h-px bg-slate-800/80 mx-2 my-2" />
              )}

              <div className="space-y-1 pt-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={true}
                      onClick={onClose}
                      title={item.name}
                      onMouseEnter={(e) => {
                        router.prefetch(item.href);
                        if (!isCollapsed) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredTooltip({
                          text: item.name,
                          top: rect.top + rect.height / 2,
                        });
                      }}
                      onTouchStart={() => {
                        router.prefetch(item.href);
                      }}
                      onMouseLeave={() => {
                        if (isCollapsed) {
                          setHoveredTooltip(null);
                        }
                      }}
                      className={`flex items-center rounded-xl text-sm font-medium min-h-[44px] transition-all btn-interactive relative group ${
                        isCollapsed
                          ? "gap-3 px-3.5 py-2.5 lg:justify-center lg:px-0 lg:w-11 lg:h-11 lg:mx-auto"
                          : "gap-3 px-3.5 py-2.5"
                      } ${
                        isActive
                          ? "bg-teal-600 text-white font-semibold shadow-md shadow-teal-600/30"
                          : "text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800"
                      }`}
                    >
                      <Icon
                        className={`w-5 h-5 shrink-0 ${
                          isActive ? "text-white" : "text-slate-400"
                        }`}
                      />
                      {/* Item label: Always visible on mobile, hidden on desktop only when collapsed */}
                      <span
                        className={`truncate ${
                          isCollapsed ? "inline lg:hidden" : "inline"
                        }`}
                      >
                        {item.name}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop-Only Expand / Collapse Toggle Button Footer (Hidden on Mobile) */}
        {onToggleCollapse && (
          <div className="hidden lg:block p-2.5 border-t border-slate-800/80 bg-slate-950/60 shrink-0">
            {!isCollapsed ? (
              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar (Sidebar chota kijiye)"
                aria-label="Collapse sidebar"
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-slate-400 hover:text-teal-400 hover:bg-slate-800/60 border border-slate-800/80 transition-all btn-interactive"
              >
                <span className="text-xs font-semibold text-slate-300">Collapse Sidebar</span>
                <PanelLeftClose className="w-4 h-4 text-teal-400 shrink-0" />
              </button>
            ) : (
              <button
                onClick={onToggleCollapse}
                title="Expand sidebar (Sidebar bara kijiye)"
                aria-label="Expand sidebar"
                className="w-full p-2.5 text-slate-400 hover:text-teal-400 hover:bg-slate-800/60 border border-slate-800/80 rounded-xl transition-all min-h-[40px] flex items-center justify-center btn-interactive"
              >
                <PanelLeftOpen className="w-4 h-4 text-teal-400 shrink-0" />
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Floating Tooltip in Desktop Collapsed Mode (Rendered outside scroll container to prevent horizontal scrollbars and clipping) */}
      {isCollapsed && hoveredTooltip && (
        <div
          style={{ top: `${hoveredTooltip.top}px` }}
          className="hidden lg:flex fixed left-[84px] -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shadow-2xl border border-slate-700 z-[60] pointer-events-none items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100"
        >
          <span>{hoveredTooltip.text}</span>
        </div>
      )}
    </>
  );
}
