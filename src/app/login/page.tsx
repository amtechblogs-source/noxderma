"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Crown,
  Users,
  Sparkles,
  Building2,
  UserCheck,
  RefreshCw,
  KeyRound,
  Check,
  LogOut,
  Pill,
} from "lucide-react";
import { useAuth, DEFAULT_ADMIN_USER } from "@/context/AuthContext";
import { offlineDb } from "@/lib/offline/db";
import type { UserProfile, UserRole } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const { login, logout, currentUser } = useAuth();

  // Mode: "owner" (Business Owner / Admin) | "staff" (Created Staff Members)
  const [loginMode, setLoginMode] = useState<"owner" | "staff">("owner");

  // Form State
  const [email, setEmail] = useState("admin@noxderma.com");
  const [password, setPassword] = useState("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dynamic UI Logo & Brand Settings
  const [uiLogo, setUiLogo] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>("Noxderma Pharma");
  const [legalName, setLegalName] = useState<string>("Noxderma Pharmaceuticals Ltd.");

  // System Users List (Loaded from Database / LocalStorage)
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);
  const [selectedStaffUser, setSelectedStaffUser] = useState<UserProfile | null>(null);

  // 1. Load Dynamic UI Logo & Business Settings
  useEffect(() => {
    async function loadBrandSettings() {
      // Step A: Local IndexedDB read
      try {
        const stored = await offlineDb.settings.get("primary");
        if (stored) {
          if (stored.appLogoUrl) setUiLogo(stored.appLogoUrl);
          else if (stored.businessLogoUrl) setUiLogo(stored.businessLogoUrl);

          if (stored.brandName) setBrandName(stored.brandName);
          if (stored.legalName) setLegalName(stored.legalName);
        }
      } catch (err) {
        console.warn("Could not load local settings:", err);
      }

      // Step B: Cloud / API settings fetch
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data?.settings) {
            if (data.settings.appLogoUrl) setUiLogo(data.settings.appLogoUrl);
            else if (data.settings.businessLogoUrl) setUiLogo(data.settings.businessLogoUrl);

            if (data.settings.brandName) setBrandName(data.settings.brandName);
            if (data.settings.legalName) setLegalName(data.settings.legalName);
          }
        }
      } catch {}
    }

    loadBrandSettings();

    // Listen for real-time logo/brand updates from Settings page
    const handleSettingsUpdated = () => loadBrandSettings();
    window.addEventListener("noxderma_settings_updated", handleSettingsUpdated);
    return () => window.removeEventListener("noxderma_settings_updated", handleSettingsUpdated);
  }, []);

  // 2. Load Registered / Created Users from Database
  useEffect(() => {
    async function loadUsers() {
      try {
        const list = await (offlineDb as any).users?.toArray();
        if (list && list.length > 0) {
          setSystemUsers(list);
          return;
        }
      } catch (e) {
        console.warn("Error reading users from offlineDb:", e);
      }

      // Fallback to localStorage
      try {
        const local = localStorage.getItem("noxderma_users");
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setSystemUsers(parsed);
          }
        }
      } catch {}
    }

    loadUsers();
  }, []);

  // Filter created non-admin staff users
  const staffUsers = useMemo(() => {
    return systemUsers.filter((u) => u.email.toLowerCase() !== "admin@noxderma.com");
  }, [systemUsers]);

  // Handle Tab Switch (Owner vs Staff)
  const handleSwitchMode = (mode: "owner" | "staff") => {
    setLoginMode(mode);
    setError(null);

    if (mode === "owner") {
      setEmail("admin@noxderma.com");
      setPassword("admin");
      setSelectedStaffUser(null);
    } else {
      if (staffUsers.length > 0) {
        const first = staffUsers[0];
        setSelectedStaffUser(first);
        setEmail(first.email);
        setPassword((first as any).password || "admin");
      } else {
        setEmail("");
        setPassword("");
        setSelectedStaffUser(null);
      }
    }
  };

  // Select a specific staff member from the list
  const handleSelectStaff = (u: UserProfile) => {
    setSelectedStaffUser(u);
    setEmail(u.email);
    setPassword((u as any).password || "admin");
    setError(null);
  };

  // Submit Sign In
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        router.push("/");
      } else {
        setError(res.error || "Ghalat credentials darj kiye gaye hain. Email aur password dobara check karein.");
      }
    } catch (err: any) {
      setError(err?.message || "Login karne mein khata pesh aayi. Dobara koshish karein.");
    } finally {
      setLoading(false);
    }
  };

  // Get color badges for user roles
  const getRoleBadge = (role: UserRole | string) => {
    switch (role) {
      case "admin":
        return { label: "Owner / Super Admin", bg: "bg-amber-500/10 text-amber-400 border-amber-500/20" };
      case "manager":
        return { label: "General Manager", bg: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
      case "sales_rep":
        return { label: "Sales Representative", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
      case "accountant":
        return { label: "Head Accountant", bg: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
      case "warehouse_staff":
        return { label: "Warehouse Staff", bg: "bg-violet-500/10 text-violet-400 border-violet-500/20" };
      case "booking_user":
        return { label: "Order Booking Staff", bg: "bg-teal-500/10 text-teal-400 border-teal-500/20" };
      default:
        return { label: (role as string).replace("_", " "), bg: "bg-slate-500/10 text-slate-300 border-slate-700" };
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#080d16] text-slate-100 relative overflow-hidden font-sans selection:bg-teal-500 selection:text-white">
      {/* Background Ambient Lighting Effect */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-teal-500/15 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] rounded-full bg-cyan-600/15 blur-[160px] pointer-events-none" />
      <div className="absolute top-[40%] right-[30%] w-[350px] h-[350px] rounded-full bg-emerald-500/10 blur-[130px] pointer-events-none" />

      {/* Subtle Grid Lines Overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-35 pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-lg relative z-10 space-y-6">
        {/* Brand Header with Software UI Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center p-2 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl shadow-black/40 backdrop-blur-md">
            {uiLogo && uiLogo !== "/brand/logo.svg" ? (
              <img
                src={uiLogo}
                alt={brandName}
                className="w-14 h-14 object-contain rounded-xl bg-white/5 p-1 border border-slate-700/60"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-tr from-teal-500 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/25">
                <span className="font-black text-white text-2xl tracking-tighter">
                  {brandName.slice(0, 2).toUpperCase() || "ND"}
                </span>
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center justify-center gap-2">
              <span>{brandName.split(" ")[0]}</span>
              <span className="text-teal-400">{brandName.split(" ").slice(1).join(" ") || "PHARMA"}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5 font-medium">
              Enterprise Medicine ERP &bull; Distribution & Accounting Portal
            </p>
          </div>
        </div>

        {/* If Already Logged In: Fast-Track Dashboard Banner */}
        {currentUser && (
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-teal-500/30 shadow-xl backdrop-blur-xl flex items-center justify-between gap-3 text-xs animate-in fade-in">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold text-sm shrink-0 border border-teal-500/30">
                {currentUser.displayName ? currentUser.displayName.slice(0, 2).toUpperCase() : "ND"}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-slate-100 truncate">
                  {currentUser.displayName}
                </div>
                <div className="text-[11px] text-teal-400 flex items-center gap-1.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                  Currently Signed In ({currentUser.role.replace("_", " ")})
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => logout()}
                className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors flex items-center gap-1"
                title="Sign out current user"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold transition-all shadow-md shadow-teal-600/30 flex items-center gap-1"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Modern Glassmorphic Login Card */}
        <div className="rounded-3xl bg-slate-900/85 border border-slate-800/90 shadow-2xl backdrop-blur-2xl p-6 sm:p-8 space-y-6">
          {/* Dual Persona Switcher (Owner vs Created Staff) */}
          <div className="p-1 rounded-2xl bg-slate-950/80 border border-slate-800/80 grid grid-cols-2 gap-1 text-xs">
            <button
              type="button"
              onClick={() => handleSwitchMode("owner")}
              className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                loginMode === "owner"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <Crown className="w-4 h-4 text-amber-200" />
              <span>Business Owner</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode("staff")}
              className={`py-2.5 px-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${
                loginMode === "staff"
                  ? "bg-gradient-to-r from-teal-600 to-teal-500 text-white shadow-md shadow-teal-600/20"
                  : "text-slate-400 hover:text-white hover:bg-slate-800/50"
              }`}
            >
              <Users className="w-4 h-4 text-teal-200" />
              <span>Created Users ({staffUsers.length})</span>
            </button>
          </div>

          {/* Mode Sub-Banner Description */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                {loginMode === "owner" ? (
                  <>
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span>Owner / Super Admin Sign In</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4 text-teal-400" />
                    <span>Staff & Operator Login</span>
                  </>
                )}
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {loginMode === "owner"
                  ? "Full access to Company settings, profit margins, pricing & users"
                  : "Role-based restricted access assigned by the business owner"}
              </p>
            </div>

            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
              Offline Safe
            </span>
          </div>

          {/* Error Message Toast */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Quick Staff Selection Carousel / Pills if in "staff" mode */}
          {loginMode === "staff" && (
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Select Created User Account:</span>
                <span className="text-teal-400 text-[10px]">Tap to Auto-Fill</span>
              </label>

              {staffUsers.length === 0 ? (
                <div className="p-3.5 rounded-xl border border-dashed border-slate-700 bg-slate-950/40 text-center space-y-1">
                  <div className="text-xs text-slate-300 font-bold">Abhi koi extra user create nahi hua</div>
                  <div className="text-[10px] text-slate-500">
                    Aap pehle Business Owner ke tor par login karein aur &quot;Users Management&quot; me ja kar staff banayein.
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {staffUsers.map((u) => {
                    const badge = getRoleBadge(u.role);
                    const isSelected = email.toLowerCase() === u.email.toLowerCase();
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectStaff(u)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                          isSelected
                            ? "bg-teal-950/40 border-teal-500 text-white shadow-soft shadow-teal-500/20"
                            : "bg-slate-800/40 border-slate-800 hover:bg-slate-800/80 text-slate-300"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected ? "bg-teal-500 text-white" : "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {u.displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate text-slate-100 flex items-center gap-1">
                            <span>{u.displayName}</span>
                            {isSelected && <Check className="w-3 h-3 text-teal-400 shrink-0" />}
                          </div>
                          <span
                            className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Email Input */}
            <div className="space-y-1.5">
              <label className="font-bold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-teal-400" />
                  Email Address
                </span>
                {loginMode === "owner" && (
                  <span className="text-[10px] text-amber-400/90 font-medium">Default: admin@noxderma.com</span>
                )}
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@noxderma.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700/80 bg-slate-950/60 text-white placeholder-slate-500 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>
            </div>

            {/* Password Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-400" />
                  Account Password
                </label>
                <span className="text-[10px] text-slate-500">Default: admin</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-700/80 bg-slate-950/60 text-white placeholder-slate-500 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Toggle */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-400 hover:text-slate-200">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-700 text-teal-600 focus:ring-teal-500 bg-slate-950 w-3.5 h-3.5"
                />
                <span className="text-[11px] font-medium">Remember on this device</span>
              </label>

              <span className="text-[10px] text-slate-500">Role-Based Auth</span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 rounded-xl text-white font-extrabold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 btn-interactive ${
                loginMode === "owner"
                  ? "bg-gradient-to-r from-amber-500 via-teal-600 to-teal-500 hover:from-amber-600 hover:to-teal-600 shadow-teal-500/25"
                  : "bg-teal-600 hover:bg-teal-500 shadow-teal-600/30"
              }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>
                    Sign In as {loginMode === "owner" ? "Business Owner" : "Staff Member"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Credentials Bar */}
          <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Forgot password? Contact Owner: <strong>admin@noxderma.com</strong>
            </span>
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Offline Ready
            </span>
          </div>
        </div>

        {/* Legal & Security Footer */}
        <div className="text-center space-y-1 text-[11px] text-slate-500">
          <div>
            {legalName} &bull; Pharmacy Management System
          </div>
          <div className="text-[10px] text-slate-600">
            Encrypted Local Storage &bull; Multi-Device Cloud Sync Ready &bull; Fast Delivery
          </div>
        </div>
      </div>
    </div>
  );
}
