"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  X,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
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
      { name: "Download Reports & Excel", href: "/reports", icon: FileSpreadsheet, requiredPermission: "finance:aging" },
    ],
  },
  {
    title: "Promotions & WhatsApp",
    items: [
      { name: "Special Offers & Schemes", href: "/marketing", icon: Megaphone, requiredPermission: "marketing:manage" },
      { name: "Create WhatsApp Offer Card", href: "/marketing/whatsapp", icon: Share2, requiredPermission: "marketing:manage" },
    ],
  },
  {
    title: "System & Settings",
    items: [
      { name: "Save Offline Data to Cloud", href: "/sync", icon: Database, requiredPermission: "sync:reconcile" },
      { name: "Staff Accounts & Logins", href: "/users", icon: UserCog, requiredPermission: "users:manage" },
      { name: "Alert Messages & Reminders", href: "/notifications", icon: BellRing },
      { name: "Connected Tools & APIs", href: "/integrations", icon: PlugZap, requiredPermission: "settings:manage" },
      { name: "Company Profile & Settings", href: "/settings", icon: Settings, requiredPermission: "settings:manage" },
    ],
  },
];

export function Sidebar({ isOpen, onClose, isCollapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { currentUser, hasPermission, logout } = useAuth();
  const [uiLogo, setUiLogo] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>("NOXDERMA");

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

  // Filter navigation items according to user permissions
  const visibleSections = ALL_NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (!item.requiredPermission) return true;
      if (!currentUser) return false;
      if (currentUser.role === "admin") return true;
      return hasPermission(item.requiredPermission);
    }),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Aside */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        } ${
          isCollapsed ? "w-72 lg:w-20" : "w-72"
        }`}
      >
        {/* Brand Header */}
        <div className={`flex items-center justify-between h-16 border-b border-slate-800 shrink-0 transition-all ${
          isCollapsed ? "px-2.5 lg:justify-center" : "px-4 sm:px-5"
        }`}>
          {!isCollapsed ? (
            <Link href="/" className="flex items-center gap-2.5 min-w-0" onClick={onClose}>
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
                  Pharma ERP &bull; {currentUser?.role === "admin" ? "Admin" : currentUser?.role?.replace("_", " ")}
                </span>
              </div>
            </Link>
          ) : (
            <div className="hidden lg:flex items-center justify-center gap-1.5 w-full">
              <Link href="/" onClick={onClose} title={`${brandName} - Pharma ERP`}>
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

          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className={`flex-1 overflow-y-auto ${isCollapsed ? "px-2 py-4 space-y-3" : "px-3 py-4 space-y-6"}`}>
          {visibleSections.map((section, sIdx) => (
            <div key={section.title} className="space-y-1">
              {!isCollapsed ? (
                <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {section.title}
                </h3>
              ) : (
                sIdx > 0 && <div className="h-px bg-slate-800/80 mx-2 my-2" />
              )}
              <div className="space-y-1 pt-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      title={isCollapsed ? item.name : undefined}
                      className={`flex items-center rounded-xl text-sm font-medium min-h-[44px] transition-all btn-interactive relative group ${
                        isCollapsed
                          ? "justify-center px-0 py-2.5 mx-auto w-11 h-11"
                          : "gap-3 px-3.5 py-2.5"
                      } ${
                        isActive
                          ? "bg-teal-600 text-white font-semibold shadow-md shadow-teal-600/30"
                          : "text-slate-300 hover:text-white hover:bg-slate-800/80 active:bg-slate-800"
                      }`}
                    >
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                      {!isCollapsed && <span className="truncate">{item.name}</span>}

                      {/* Tooltip on desktop hover in collapsed mode */}
                      {isCollapsed && (
                        <div className="hidden lg:group-hover:flex absolute left-full ml-3 px-3 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold whitespace-nowrap shadow-2xl border border-slate-700 z-50 pointer-events-none items-center gap-1.5 animate-in fade-in duration-100">
                          <span>{item.name}</span>
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* User Session & Collapse/Expand Footer */}
        <div className="p-2.5 border-t border-slate-800/80 bg-slate-950/60 pb-safe sm:pb-3">
          {!isCollapsed ? (
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-800/40 border border-slate-800">
              <div className="min-w-0">
                <div className="font-bold text-white truncate text-xs">
                  {currentUser?.displayName || "System Administrator"}
                </div>
                <div className="text-xs text-teal-400 truncate font-mono">
                  {currentUser?.email || "admin@noxderma.com"}
                </div>
              </div>

              {/* Desktop: Collapse Button in place of logout */}
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title="Collapse sidebar (Sidebar chota kijiye)"
                  aria-label="Collapse sidebar"
                  className="hidden lg:flex p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-xl transition-colors shrink-0 min-h-[38px] min-w-[38px] items-center justify-center btn-interactive"
                >
                  <PanelLeftClose className="w-4 h-4 text-teal-400" />
                </button>
              )}

              {/* Mobile: Logout button */}
              <button
                onClick={() => logout()}
                title="Logout / Sign Out"
                aria-label="Logout"
                className="lg:hidden p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors shrink-0 min-h-[38px] min-w-[38px] flex items-center justify-center btn-interactive"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2">
              <div
                className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-white"
                title={`${currentUser?.displayName || "Admin User"} (${currentUser?.email || "admin@noxderma.com"})`}
              >
                {currentUser?.displayName ? currentUser.displayName[0].toUpperCase() : "A"}
              </div>

              {/* Desktop: Expand Button in collapsed mode */}
              {onToggleCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title="Expand sidebar (Sidebar bara kijiye)"
                  aria-label="Expand sidebar"
                  className="hidden lg:flex p-2 text-slate-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-xl transition-colors min-h-[36px] min-w-[36px] items-center justify-center btn-interactive"
                >
                  <PanelLeftOpen className="w-4 h-4 text-teal-400" />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
