"use client";

import React from "react";
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
} from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Operations & Sales",
    items: [
      { name: "Executive Dashboard", href: "/", icon: LayoutDashboard },
      { name: "Sales Invoices", href: "/sales/invoices", icon: Receipt },
      { name: "Sales Bookings", href: "/sales/bookings", icon: ClipboardList },
      { name: "Online Orders & Courier", href: "/sales/online-orders", icon: Globe2 },
      { name: "Sales Returns", href: "/sales/returns", icon: RotateCcw },
    ],
  },
  {
    title: "Catalog & Batches",
    items: [
      { name: "Product Catalog", href: "/products", icon: PackageCheck },
      { name: "Batch Inventory (FEFO)", href: "/inventory/batches", icon: Barcode },
      { name: "Stock Projections", href: "/inventory", icon: Boxes },
      { name: "Stock Movements", href: "/inventory/movements", icon: ArrowLeftRight },
      { name: "Purchases & Goods Receipts", href: "/purchases", icon: ShoppingBag },
      { name: "Manufacturers", href: "/manufacturers", icon: Factory },
    ],
  },
  {
    title: "CRM & Field Visits",
    items: [
      { name: "Customers & Pharmacies", href: "/customers", icon: Building2 },
      { name: "Distributor Directory", href: "/distributors", icon: Truck },
      { name: "Leads & Prospects", href: "/crm/leads", icon: Users2 },
      { name: "Field Visits & Market Intel", href: "/crm/visits", icon: MapPin },
      { name: "Sales Targets & Reps", href: "/employees/targets", icon: Target },
    ],
  },
  {
    title: "Finance & Ledgers",
    items: [
      { name: "3-Way Credit & Aging", href: "/finance/credit", icon: CreditCard },
      { name: "Manufacturer Ledgers", href: "/finance/ledgers/manufacturers", icon: BookOpen },
      { name: "Customer Ledgers", href: "/finance/ledgers/customers", icon: Scale },
      { name: "Profit & Loss (P&L)", href: "/finance/pnl", icon: TrendingUp },
      { name: "Reports & Exports", href: "/reports", icon: FileSpreadsheet },
    ],
  },
  {
    title: "Marketing & Growth",
    items: [
      { name: "Marketing Campaigns", href: "/marketing", icon: Megaphone },
      { name: "WhatsApp Sharing", href: "/marketing/whatsapp", icon: Share2 },
    ],
  },
  {
    title: "System & Administration",
    items: [
      { name: "Offline Sync & Reconciliation", href: "/sync", icon: Database },
      { name: "User Management & Roles", href: "/users", icon: UserCog },
      { name: "Notifications & Reminders", href: "/notifications", icon: BellRing },
      { name: "Integration Services", href: "/integrations", icon: PlugZap },
      { name: "Business Settings", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

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
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-slate-800 shrink-0">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/20">
              <span className="font-extrabold text-white text-base">ND</span>
            </div>
            <div className="flex flex-col">
              <span className="text-base font-extrabold tracking-tight text-white">
                NOX<span className="text-teal-400">DERMA</span>
              </span>
              <span className="text-[10px] font-semibold text-slate-400 tracking-wider uppercase">
                Enterprise Pharma ERP
              </span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title} className="space-y-1">
              <h3 className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {section.title}
              </h3>
              <div className="space-y-0.5 pt-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs md:text-sm font-medium transition-all ${
                        isActive
                          ? "bg-teal-600 text-white shadow-md shadow-teal-600/30"
                          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`} />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-800/80 bg-slate-950/40 text-center">
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Offline Engine Active</span>
            <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 font-mono font-bold">
              v1.0-PWA
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
