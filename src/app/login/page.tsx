"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building2,
  ArrowRight,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { offlineDb } from "@/lib/offline/db";
import type { UserProfile } from "@/types";

export default function LoginPage() {
  const router = useRouter();
  const { login, currentUser } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [systemUsers, setSystemUsers] = useState<UserProfile[]>([]);

  useEffect(() => {
    async function loadRegisteredUsers() {
      try {
        const list = await (offlineDb as any).users?.toArray();
        if (list && list.length > 0) {
          setSystemUsers(list);
        } else {
          const local = localStorage.getItem("noxderma_users");
          if (local) {
            setSystemUsers(JSON.parse(local));
          }
        }
      } catch {}
    }
    loadRegisteredUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login(email, password);
      if (res.success) {
        router.push("/");
      } else {
        setError(res.error || "Login nakam raha. Barah-e-karam apna email aur password check karein.");
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during login.");
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (userEmail: string, userPass?: string) => {
    setEmail(userEmail);
    setPassword(userPass || "admin");
    setLoading(true);
    setError(null);
    const res = await login(userEmail, userPass || "admin");
    if (res.success) {
      router.push("/");
    } else {
      setError(res.error || "Quick login failed.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-teal-500 to-teal-400 shadow-xl shadow-teal-500/20 text-white font-extrabold text-2xl tracking-tight mb-2">
            ND
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            NOX<span className="text-teal-400">DERMA</span> PHARMA
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Medicine Distribution, Billing & Role-Based Access Control
          </p>
        </div>

        {/* Login Card */}
        <div className="p-6 sm:p-8 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white">System Sign In</h2>
              <p className="text-xs text-slate-400">Apna Account Email aur Password Darj Karein</p>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Secure Login
            </span>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-teal-400" />
                Staff Email Address
              </label>
              <div className="relative">
                <input
                  type="email"
                  required
                  placeholder="admin@noxderma.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-xs sm:text-sm"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-teal-400" />
                  Account Password
                </label>
                <span className="text-[10px] text-slate-500">Default: admin</span>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all text-xs sm:text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-teal-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {loading ? (
                "Logging In..."
              ) : (
                <>
                  <span>Sign In to ERP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Login Accounts Helper */}
          <div className="pt-4 border-t border-slate-800/80 space-y-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Quick Test Login (Localhost Preview):
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("admin@noxderma.com", "admin")}
                className="p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-left transition-colors flex items-center gap-2 text-xs"
              >
                <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold shrink-0 text-[11px]">
                  AD
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-slate-200 truncate">System Admin</div>
                  <div className="text-[10px] text-purple-400">Full Permissions</div>
                </div>
              </button>

              {systemUsers
                .filter((u) => u.email !== "admin@noxderma.com")
                .slice(0, 3)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleQuickLogin(u.email, (u as any).password || "admin")}
                    className="p-2.5 rounded-xl border border-slate-800 bg-slate-800/50 hover:bg-slate-800 text-left transition-colors flex items-center gap-2 text-xs"
                  >
                    <div className="w-7 h-7 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold shrink-0 text-[11px]">
                      {u.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-slate-200 truncate">{u.displayName}</div>
                      <div className="text-[10px] text-teal-400 capitalize">{u.role.replace("_", " ")}</div>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-slate-400">
          Noxderma ERP &bull; Works 100% Offline &bull; Cloud Ready (Firebase / Netlify)
        </div>
      </div>
    </div>
  );
}
