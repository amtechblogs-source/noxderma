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

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Form State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("booking_user");
  const [phone, setPhone] = useState("+92 300 ");

  useEffect(() => {
    const saved = localStorage.getItem("noxderma_users");
    if (saved) {
      setUsers(JSON.parse(saved));
    } else {
      const initialUsers: UserProfile[] = [
        {
          id: "usr_admin",
          email: "admin@noxderma.com",
          displayName: "Dr. Asim (Chief Executive)",
          role: "admin",
          active: true,
          createdAt: "2026-09-01T08:00:00Z",
          lastLoginAt: new Date().toISOString(),
        },
        {
          id: "usr_rep_zubair",
          email: "zubair@noxderma.com",
          displayName: "Zubair Ahmed",
          role: "booking_user",
          active: true,
          createdAt: "2026-09-10T08:00:00Z",
          lastLoginAt: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: "usr_wh_rashid",
          email: "rashid@noxderma.com",
          displayName: "Rashid Minhas",
          role: "warehouse_staff",
          active: true,
          createdAt: "2026-09-12T08:00:00Z",
          lastLoginAt: new Date(Date.now() - 7200000).toISOString(),
        },
      ];
      setUsers(initialUsers);
      localStorage.setItem("noxderma_users", JSON.stringify(initialUsers));
    }
  }, []);

  const saveUsers = (updated: UserProfile[]) => {
    setUsers(updated);
    localStorage.setItem("noxderma_users", JSON.stringify(updated));
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
              Access Governance
            </span>
            <span className="text-xs text-slate-400">Strict RBAC & Audit Trails</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            User Management & Role Permissions
          </h1>
        </div>

        <button
          onClick={() => setIsAddingUser(true)}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" /> Add Team Member
        </button>
      </div>

      {/* Role Segregation Security Alert Box */}
      <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-extrabold block">Strict Role Segregation Enforced</span>
          <p className="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <strong>Warehouse Staff</strong> are permanently restricted from viewing purchase costs,
            wholesale profit margins, and financial ledgers. <strong>Booking Agents</strong> can create
            provisional offline orders but cannot overwrite past batch historical prices or financial records.
          </p>
        </div>
      </div>

      {/* Users Table */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-2.5">User Name & ID</th>
                <th className="p-2.5">Email Address</th>
                <th className="p-2.5">Assigned System Role</th>
                <th className="p-2.5">Permission Summary</th>
                <th className="p-2.5">Last Login</th>
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
                      {user.role.replace("_", " ").toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2.5 text-[11px] text-slate-500">
                    {user.role === "admin"
                      ? "Full System & Financial Access"
                      : user.role === "warehouse_staff"
                      ? "FEFO Batches & Dispatch (No Costs/Prices)"
                      : "Catalog, Field Visits & Offline Billing"}
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
                <UserCog className="w-5 h-5 text-teal-600" /> Add Team Member
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
                  Full Name *
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
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@noxderma.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Select Role & Security Level *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
                >
                  <option value="booking_user">Booking User (Field Rep)</option>
                  <option value="warehouse_staff">Warehouse Staff (Restricted Costs)</option>
                  <option value="admin">Administrator (Full Control)</option>
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
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
