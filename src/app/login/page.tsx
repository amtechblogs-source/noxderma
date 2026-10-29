"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  RefreshCw,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { offlineDb } from "@/lib/offline/db";

export default function LoginPage() {
  const router = useRouter();
  const { login, logout, currentUser } = useAuth();

  // Clean, empty form state - strictly requiring credentials to log in
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Dynamic Brand Info
  const [uiLogo, setUiLogo] = useState<string | null>(null);
  const [brandName, setBrandName] = useState<string>("Noxderma");

  useEffect(() => {
    async function loadBrandSettings() {
      try {
        const stored = await offlineDb.settings.get("primary");
        if (stored) {
          if (stored.appLogoUrl) setUiLogo(stored.appLogoUrl);
          else if (stored.businessLogoUrl) setUiLogo(stored.businessLogoUrl);

          if (stored.brandName) setBrandName(stored.brandName);
        }
      } catch (err) {
        console.warn("Could not load local settings:", err);
      }

      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data?.settings) {
            if (data.settings.appLogoUrl) setUiLogo(data.settings.appLogoUrl);
            else if (data.settings.businessLogoUrl) setUiLogo(data.settings.businessLogoUrl);

            if (data.settings.brandName) setBrandName(data.settings.brandName);
          }
        }
      } catch {}
    }

    loadBrandSettings();

    const handleSettingsUpdated = () => loadBrandSettings();
    window.addEventListener("noxderma_settings_updated", handleSettingsUpdated);
    return () => window.removeEventListener("noxderma_settings_updated", handleSettingsUpdated);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    const cleanPass = password.trim();

    if (!cleanEmail || !cleanPass) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await login(cleanEmail, cleanPass, rememberMe);
      if (res.success) {
        router.push("/");
      } else {
        setError(res.error || "Incorrect email or password. Please try again.");
      }
    } catch {
      setError("Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#080d16] text-slate-100 relative overflow-hidden font-sans selection:bg-teal-500 selection:text-white">
      {/* Ambient Lighting Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-teal-500/15 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[550px] h-[550px] rounded-full bg-cyan-600/15 blur-[160px] pointer-events-none" />

      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-35 pointer-events-none" />

      {/* Centered Form Container */}
      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
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
                <span className="font-black text-white text-2xl tracking-tight">
                  {brandName.slice(0, 2).toUpperCase() || "ND"}
                </span>
              </div>
            )}
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              {brandName}
            </h1>
          </div>
        </div>

        {/* Existing Session Prompt (if user is already logged in) */}
        {currentUser && (
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-teal-500/30 shadow-xl backdrop-blur-xl flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <div className="font-semibold text-slate-100 truncate">
                Signed in as {currentUser.displayName || currentUser.email}
              </div>
              <div className="text-teal-400 text-[11px] truncate mt-0.5">
                Your session is active
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => logout()}
                className="px-2.5 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1 font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold transition-all shadow-md shadow-teal-600/30 flex items-center gap-1"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Clean, Focused Sign In Card */}
        <div className="rounded-3xl bg-slate-900/85 border border-slate-800/90 shadow-2xl backdrop-blur-2xl p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-white">
              Sign In
            </h2>
            <p className="text-xs sm:text-sm text-slate-400">
              Enter your email and password to access your account
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Address */}
            <div className="space-y-1.5">
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-slate-300"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-700/80 bg-slate-950/70 text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-300"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-700/80 bg-slate-950/70 text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-white transition-colors"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-400 hover:text-slate-200">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-slate-700 text-teal-600 focus:ring-teal-500 bg-slate-950 w-3.5 h-3.5 cursor-pointer"
                />
                <span className="text-xs font-medium">Remember me</span>
              </label>

              <span className="text-xs text-slate-500">
                Forgot password? Contact Owner
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-bold text-sm bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 active:scale-[0.99] transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-600/25 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-500">
          © {new Date().getFullYear()} {brandName}. All rights reserved.
        </div>
      </div>
    </div>
  );
}
