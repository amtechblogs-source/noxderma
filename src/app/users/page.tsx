"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  UserCog,
  Plus,
  Search,
  Filter,
  Shield,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Lock,
  EyeOff,
  UserCheck,
  Clock,
} from "lucide-react";
import type { UserProfile, UserRole } from "@/types";
import { offlineDb } from "@/lib/offline/db";

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Form State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("booking_user");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    async function loadUsers() {
      const defaultAdminUser: UserProfile = {
        id: "usr_admin",
        email: "admin@noxderma.com",
        displayName: "System Administrator",
        role: "admin",
        active: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };

      try {
        const dbUsers = await (offlineDb as any).users?.toArray();
        if (dbUsers && dbUsers.length > 0) {
          setUsers(dbUsers as UserProfile[]);
          return;
        }
      } catch {
        // fallback
      }

      const saved = localStorage.getItem("noxderma_users");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setUsers(parsed);
            return;
          }
        } catch {
          // fallback
        }
      }

      setUsers([defaultAdminUser]);
      localStorage.setItem("noxderma_users", JSON.stringify([defaultAdminUser]));
      try {
        await (offlineDb as any).users?.put(defaultAdminUser);
      } catch {}
    }
    loadUsers();
  }, []);

  const saveUsers = async (updated: UserProfile[]) => {
    setUsers(updated);
    localStorage.setItem("noxderma_users", JSON.stringify(updated));
    try {
      if ((offlineDb as any).users) {
        await (offlineDb as any).users.clear();
        if (updated.length > 0) {
          await (offlineDb as any).users.bulkPut(updated);
        }
      }
    } catch (err) {
      console.error("Failed to sync users to offlineDb:", err);
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !email) return;

    const newUser: UserProfile = {
      id: `usr_${Date.now()}`,
      email,
      displayName,
      role,
      active: true,
      createdAt: new Date().toISOString(),
    };

    saveUsers([newUser, ...users]);
    setIsAddingUser(false);
    setDisplayName("");
    setEmail("");
  };

  const filtered = users.filter((u) => {
    const matchesSearch =
      u.displayName.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Staff Accounts
            </span>
            <span className="text-xs text-slate-400">Logins & Security</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Staff Accounts & Login Permissions
          </h1>
        </div>

        <button
          onClick={() => setIsAddingUser(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" /> + Add New Staff User
        </button>
      </div>

      {/* Role Segregation Security Alert Box */}
      <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-extrabold block">Important Security Rules for Staff</span>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <strong>Godown Staff</strong> cannot see your secret buying costs or profit numbers.
            <strong>Order Staff</strong> can only take orders from shops and make bills — they cannot change company accounts or old bills.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">Staff Name</th>
                <th className="p-2.5">Login Email</th>
                <th className="p-2.5">Job Role</th>
                <th className="p-2.5">What They Can Do</th>
                <th className="p-2.5">Last Used</th>
                <th className="p-2.5 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((user) => (
                <tr
                  key={user.id}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <td className="p-2.5">
                    <span className="font-bold text-slate-900 dark:text-slate-100 block">
                      {user.displayName}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">{user.id}</span>
                  </td>
                  <td className="p-2.5 text-slate-700 dark:text-slate-300 font-mono">
                    {user.email}
                  </td>
                  <td className="p-2.5">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                          : user.role === "warehouse_staff"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                      }`}
                    >
                      {user.role === "admin"
                        ? "ADMIN / OWNER"
                        : user.role === "warehouse_staff"
                        ? "GODOWN STAFF"
                        : "ORDER BOOKER"}
                    </span>
                  </td>
                  <td className="p-2.5 text-[11px] text-slate-500">
                    {user.role === "admin"
                      ? "Full control of software, profits, and bank accounts"
                      : user.role === "warehouse_staff"
                      ? "Can receive stock and dispatch boxes (cannot see profit/costs)"
                      : "Can visit shops, take orders, and make bills in market"}
                  </td>
                  <td className="p-2.5 text-slate-400 font-mono text-[10px]">
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "Never"}
                  </td>
                  <td className="p-2.5 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      ACTIVE
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {isAddingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserCog className="w-5 h-5 text-teal-600" /> Create Login for Staff
              </h2>
              <button
                onClick={() => setIsAddingUser(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Staff Member Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tariq Mehmood"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Login Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Role & Permissions *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                >
                  <option value="booking_user">Order Booker (Sales Staff in Market)</option>
                  <option value="warehouse_staff">Godown Staff (Stock In/Out - Costs Hidden)</option>
                  <option value="admin">Owner / Administrator (Full Control)</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-md shadow-teal-600/20"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
