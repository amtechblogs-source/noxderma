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
  Eye,
  EyeOff,
  UserCheck,
  Clock,
  Edit2,
  Trash2,
  Check,
  Sliders,
  ChevronDown,
  X,
} from "lucide-react";
import type { UserProfile, UserRole, Permission } from "@/types";
import {
  PERMISSION_GROUPS,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
} from "@/types/auth";
import { offlineDb } from "@/lib/offline/db";

export default function UserManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  // Form State
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("admin");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("booking_user");
  const [phone, setPhone] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<Permission[]>(
    ROLE_PERMISSIONS.booking_user
  );
  const [activeTab, setActiveTab] = useState<string>(PERMISSION_GROUPS[0].moduleName);

  useEffect(() => {
    async function loadUsers() {
      const defaultAdminUser: UserProfile = {
        id: "usr_admin",
        email: "admin@noxderma.com",
        displayName: "System Administrator (Owner)",
        role: "admin",
        password: "admin",
        permissions: ALL_PERMISSIONS,
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

  // Open modal for new user
  const handleOpenAddModal = () => {
    setEditingUserId(null);
    setDisplayName("");
    setEmail("");
    setPassword("admin");
    setRole("booking_user");
    setPhone("");
    setSelectedPermissions(ROLE_PERMISSIONS.booking_user);
    setIsModalOpen(true);
  };

  // Open modal for editing user
  const handleOpenEditModal = (u: UserProfile) => {
    setEditingUserId(u.id);
    setDisplayName(u.displayName);
    setEmail(u.email);
    setPassword(u.password || "admin");
    setRole(u.role);
    setPhone(u.phone || "");
    const perms =
      u.permissions && u.permissions.length > 0
        ? u.permissions
        : ROLE_PERMISSIONS[u.role] || [];
    setSelectedPermissions(perms);
    setIsModalOpen(true);
  };

  // When role changes, pre-select that role's default permissions
  const handleRoleChange = (newRole: UserRole) => {
    setRole(newRole);
    const defaults = ROLE_PERMISSIONS[newRole] || [];
    setSelectedPermissions(defaults);
  };

  // Toggle single permission (modular access: choose more or less)
  const togglePermission = (permKey: Permission) => {
    if (selectedPermissions.includes(permKey)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p !== permKey));
    } else {
      setSelectedPermissions([...selectedPermissions, permKey]);
    }
  };

  // Select all or reset
  const handleSelectAll = () => setSelectedPermissions([...ALL_PERMISSIONS]);
  const handleResetToRoleDefaults = () => setSelectedPermissions([...ROLE_PERMISSIONS[role]]);
  const handleClearAll = () => setSelectedPermissions([]);

  // Save or update user
  const handleSubmitUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim() || !email.trim()) return;

    if (editingUserId) {
      // Update existing
      const updated = users.map((u) =>
        u.id === editingUserId
          ? {
              ...u,
              displayName: displayName.trim(),
              email: email.trim().toLowerCase(),
              role,
              password: password.trim() || "admin",
              phone: phone.trim() || undefined,
              permissions: selectedPermissions,
            }
          : u
      );
      saveUsers(updated);
    } else {
      // Create new
      const newUser: UserProfile = {
        id: `usr_${Date.now()}`,
        email: email.trim().toLowerCase(),
        displayName: displayName.trim(),
        role,
        password: password.trim() || "admin",
        phone: phone.trim() || undefined,
        permissions: selectedPermissions,
        active: true,
        createdAt: new Date().toISOString(),
      };
      saveUsers([newUser, ...users]);
    }

    setIsModalOpen(false);
  };

  // Toggle user active status
  const toggleUserActive = (userId: string) => {
    if (userId === "usr_admin") {
      alert("System Administrator account ko deactivate nahi kiya ja sakta.");
      return;
    }
    const updated = users.map((u) => (u.id === userId ? { ...u, active: !u.active } : u));
    saveUsers(updated);
  };

  // Delete user
  const handleDeleteUser = (userId: string) => {
    if (userId === "usr_admin") {
      alert("System Administrator account delete nahi kiya ja sakta.");
      return;
    }
    if (confirm("Kiya aap waqai is staff user ko delete karna chahte hain?")) {
      const updated = users.filter((u) => u.id !== userId);
      saveUsers(updated);
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
              Modular Access Control (RBAC)
            </span>
            <span className="text-xs text-slate-400">Staff Logins & Modular Permissions</span>
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <UserCog className="w-7 h-7 text-teal-600" />
            Staff Accounts & Access Nizam
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Har role k liye pre-selected permissions set hain, or har user k liye kam ya zyada access choose karein.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm shadow-soft shadow-teal-600/20 btn-interactive self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add New Staff User
        </button>
      </div>

      {/* Role Segregation Security Alert Box */}
      <div className="p-4 sm:p-5 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-xs sm:text-sm text-amber-900 dark:text-amber-200 flex items-start gap-3.5">
        <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-extrabold block text-sm sm:text-base">Modular Role Access Security</span>
          <p className="text-xs sm:text-sm leading-relaxed text-amber-800 dark:text-amber-300">
            Aap kisi bhi staff member ko banatay huway unka role select karein. Role select hoty hi unki standard permissions auto-check ho jayengi, lakin aap apni marzi se kisi bhi box ko tick ya untick kar k access barha ya ghata saktay hain.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between text-xs sm:text-sm">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search staff name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-slate-400 font-semibold flex items-center gap-1 shrink-0 text-xs">
            <Filter className="w-3.5 h-3.5" /> Role:
          </span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-auto min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">All Roles</option>
            <option value="owner">Company Owner</option>
            <option value="admin">Administrator (Admin)</option>
            <option value="manager">Manager</option>
            <option value="accountant">Accountant</option>
            <option value="warehouse_staff">Warehouse / Godown Staff</option>
            <option value="booking_user">Order Booker</option>
            <option value="sales_rep">Medical Rep</option>
          </select>
        </div>
      </div>

      {/* Users Mobile Card View (< md) */}
      <div className="block md:hidden space-y-3.5">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
            No staff accounts found.
          </div>
        ) : (
          filtered.map((user) => {
            const userPermCount = user.permissions?.length || ROLE_PERMISSIONS[user.role]?.length || 0;
            return (
              <div
                key={user.id}
                className="p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft card-interactive space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base leading-snug">
                      {user.displayName}
                    </h3>
                    <p className="font-mono text-xs text-slate-400 font-medium">{user.email}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${
                      user.role === "owner"
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 ring-1 ring-amber-500/30"
                        : user.role === "admin"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                        : user.role === "manager"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        : user.role === "accountant"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : user.role === "warehouse_staff"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        : "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                    }`}
                  >
                    {user.role === "owner" ? "Owner" : user.role.replace("_", " ")}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Modular Permissions:</span>
                    <span className="font-bold text-teal-600 dark:text-teal-400">
                      {user.role === "owner" || user.role === "admin" ? "All (Full Access)" : `${userPermCount} Selected`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Password:</span>
                    <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{user.password || "admin"}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800 gap-2">
                  <button
                    onClick={() => toggleUserActive(user.id)}
                    className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-bold btn-interactive ${
                      user.active
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                    }`}
                  >
                    {user.active ? "STATUS: ACTIVE" : "STATUS: INACTIVE"}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditModal(user)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs inline-flex items-center gap-1.5 btn-interactive"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-teal-600" />
                      Edit
                    </button>
                    {user.id !== "usr_admin" && (
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="min-h-[38px] min-w-[38px] p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 flex items-center justify-center btn-interactive"
                        title="Delete User"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Users Table: Desktop View (>= md) */}
      <div className="hidden md:block p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-soft space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-700 text-xs uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3">Staff Member</th>
                <th className="py-3 px-3">Login Email & Password</th>
                <th className="py-3 px-3">Job Role</th>
                <th className="py-3 px-3">Modular Permissions Active</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((user) => {
                const userPermCount = user.permissions?.length || ROLE_PERMISSIONS[user.role]?.length || 0;
                return (
                  <tr
                    key={user.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-3">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">
                        {user.displayName}
                      </span>
                      <span className="font-mono text-xs text-slate-400">{user.id}</span>
                    </td>

                    <td className="py-3.5 px-3 text-slate-700 dark:text-slate-300 font-mono text-xs">
                      <div>{user.email}</div>
                      <div className="text-slate-400">Pass: {user.password || "admin"}</div>
                    </td>

                    <td className="py-3.5 px-3">
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${
                          user.role === "owner"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 ring-1 ring-amber-500/30"
                            : user.role === "admin"
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                            : user.role === "manager"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                            : user.role === "accountant"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : user.role === "warehouse_staff"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
                        }`}
                      >
                        {user.role === "owner" ? "Owner" : user.role.replace("_", " ")}
                      </span>
                    </td>

                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-1 rounded-md font-bold font-mono text-xs bg-slate-100 dark:bg-slate-800 text-teal-600 dark:text-teal-400">
                          {user.role === "owner" || user.role === "admin" ? "All (Full Access)" : `${userPermCount} Selected`}
                        </span>
                        <span className="text-xs text-slate-400">
                          {user.role === "owner" || user.role === "admin"
                            ? "Master Unrestricted"
                            : user.permissions
                            ? "Customized"
                            : "Role Default"}
                        </span>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 text-center">
                      <button
                        onClick={() => toggleUserActive(user.id)}
                        className={`min-h-[32px] px-3 py-1 rounded-full text-xs font-bold btn-interactive ${
                          user.active
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                        }`}
                      >
                        {user.active ? "ACTIVE" : "INACTIVE"}
                      </button>
                    </td>

                    <td className="py-3.5 px-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(user)}
                          title="Edit User & Permissions"
                          className="min-h-[36px] min-w-[36px] p-2 text-slate-600 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors btn-interactive"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {user.id !== "usr_admin" && (
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            title="Delete Staff Account"
                            className="min-h-[36px] min-w-[36px] p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors btn-interactive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal with Modular Access Nizam */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 flex items-center justify-center">
                  <UserCog className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-extrabold text-base text-slate-900 dark:text-slate-100">
                    {editingUserId ? "Edit Staff Account & Access" : "Create New Staff Account"}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Pre-selected modular permissions for every job role with custom options.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitUser} className="flex-1 overflow-y-auto p-5 space-y-5 text-xs sm:text-sm">
              {/* Account Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Staff Member Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Muhammad Asif"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Staff Email (Login ID) *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="asif@noxderma.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Login Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[44px] pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 btn-interactive"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs sm:text-sm font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
                    Job Role (Pre-selects Permissions) *
                  </label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                    className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-semibold text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="owner">Company Owner (Master Access & Audit Undo)</option>
                    <option value="admin">System Administrator (Full All Modules)</option>
                    <option value="manager">Operations Manager (Sales, Stock, Khata)</option>
                    <option value="accountant">Accountant / Cashier (Khata, Payments, P&L)</option>
                    <option value="warehouse_staff">Warehouse / Godown Staff (Stock In/Out, GRN)</option>
                    <option value="booking_user">Order Booker (Take Orders & Make Bills in Market)</option>
                    <option value="sales_rep">Field Medical Rep (Doctors, Samples, Orders)</option>
                  </select>
                </div>
              </div>

              {/* Modular Access Permissions Selector */}
              <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-700">
                  <div>
                    <h3 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-teal-600" />
                      Modular Access Permissions ({selectedPermissions.length} Active)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Pre-selected based on role &bull; Check or uncheck any individual module permission.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={handleResetToRoleDefaults}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-xs font-bold text-slate-700 dark:text-slate-200 btn-interactive"
                    >
                      Reset Defaults
                    </button>
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 text-xs font-bold btn-interactive"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="min-h-[34px] px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 text-xs font-bold btn-interactive"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Module Categories Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
                  {PERMISSION_GROUPS.map((group) => {
                    const groupSelectedCount = group.permissions.filter((p) =>
                      selectedPermissions.includes(p.key)
                    ).length;
                    const isActive = activeTab === group.moduleName;

                    return (
                      <button
                        key={group.moduleName}
                        type="button"
                        onClick={() => setActiveTab(group.moduleName)}
                        className={`min-h-[38px] px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-colors flex items-center gap-2 btn-interactive ${
                          isActive
                            ? "bg-teal-600 text-white shadow-soft"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                        }`}
                      >
                        <span>{group.moduleName}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            isActive
                              ? "bg-white/20 text-white"
                              : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                          }`}
                        >
                          {groupSelectedCount}/{group.permissions.length}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Active Tab Permissions List */}
                {PERMISSION_GROUPS.filter((g) => g.moduleName === activeTab).map((group) => (
                  <div key={group.moduleName} className="space-y-2.5 pt-1">
                    <p className="text-xs text-slate-500 italic">{group.description}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {group.permissions.map((p) => {
                        const isChecked = selectedPermissions.includes(p.key);
                        return (
                          <label
                            key={p.key}
                            className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                              isChecked
                                ? "border-teal-500/50 bg-teal-50/50 dark:bg-teal-950/30 text-teal-950 dark:text-teal-200 shadow-sm"
                                : "border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:bg-slate-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePermission(p.key)}
                              className="mt-0.5 rounded text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-xs sm:text-sm block text-slate-900 dark:text-slate-100">
                                {p.label}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 block leading-tight mt-0.5">
                                {p.desc}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Form Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[44px] px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-sm btn-interactive"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-sm shadow-soft shadow-teal-600/20 btn-interactive"
                >
                  {editingUserId ? "Save Changes" : "Create Staff Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
