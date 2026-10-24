"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { offlineDb } from "@/lib/offline/db";
import {
  UserProfile,
  UserRole,
  Permission,
  ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
} from "@/types";

export interface AuthenticatedUser extends UserProfile {
  permissions: Permission[];
}

interface AuthContextType {
  currentUser: AuthenticatedUser | null;
  loading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (permission: Permission) => boolean;
  hasAnyPermission: (permissions: Permission[]) => boolean;
  hasModuleAccess: (moduleKey: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACTIVE_USER_STORAGE_KEY = "noxderma_active_user_session";

export const DEFAULT_ADMIN_USER: AuthenticatedUser = {
  id: "usr_admin",
  email: "admin@noxderma.com",
  displayName: "System Administrator (Admin)",
  role: "admin",
  password: "admin",
  permissions: ALL_PERMISSIONS,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Auth state from storage / offlineDb
  useEffect(() => {
    async function initAuth() {
      try {
        // Ensure default admin user is seeded into offlineDb.users if not present
        const dbUsers = await (offlineDb as any).users?.toArray();
        const existingAdmin = (dbUsers || []).find(
          (u: UserProfile) => u.email.toLowerCase() === DEFAULT_ADMIN_USER.email.toLowerCase()
        );

        if (!existingAdmin) {
          try {
            await (offlineDb as any).users?.put({
              ...DEFAULT_ADMIN_USER,
              permissions: ALL_PERMISSIONS,
            });
          } catch (e) {
            console.warn("Could not seed default admin into offlineDb:", e);
          }
        }

        // Check if there is an active session stored
        if (typeof window !== "undefined") {
          const session = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
          if (session) {
            try {
              const parsed = JSON.parse(session) as AuthenticatedUser;
              if (parsed && parsed.email) {
                // Ensure permissions array is populated
                const perms =
                  parsed.permissions && parsed.permissions.length > 0
                    ? parsed.permissions
                    : ROLE_PERMISSIONS[parsed.role] || [];
                setCurrentUser({ ...parsed, permissions: perms });
                setLoading(false);
                return;
              }
            } catch {
              localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
            }
          }
        }

        // If no session found, we default to null (requires login) or default admin for instant localhost preview
        // For smooth onboarding we set default admin session if none exists
        setCurrentUser(DEFAULT_ADMIN_USER);
        if (typeof window !== "undefined") {
          localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(DEFAULT_ADMIN_USER));
        }
      } catch (err) {
        console.error("Auth initialization error:", err);
        setCurrentUser(DEFAULT_ADMIN_USER);
      } finally {
        setLoading(false);
      }
    }

    initAuth();
  }, []);

  const login = useCallback(
    async (
      email: string,
      password?: string
    ): Promise<{ success: boolean; error?: string }> => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPass = (password || "").trim();

      try {
        // 1. Check default admin credentials
        if (
          cleanEmail === DEFAULT_ADMIN_USER.email.toLowerCase() &&
          (cleanPass === "admin" || cleanPass === "admin123" || !cleanPass)
        ) {
          const adminSession: AuthenticatedUser = {
            ...DEFAULT_ADMIN_USER,
            lastLoginAt: new Date().toISOString(),
          };
          setCurrentUser(adminSession);
          if (typeof window !== "undefined") {
            localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(adminSession));
          }
          return { success: true };
        }

        // 2. Look up user in offlineDb
        const dbUsers: UserProfile[] = (await (offlineDb as any).users?.toArray()) || [];
        const user = dbUsers.find((u) => u.email.toLowerCase() === cleanEmail);

        if (!user) {
          // Also check localStorage users
          const localSaved = localStorage.getItem("noxderma_users");
          if (localSaved) {
            try {
              const parsed = JSON.parse(localSaved) as UserProfile[];
              const localUser = parsed.find((u) => u.email.toLowerCase() === cleanEmail);
              if (localUser) {
                if (!localUser.active) {
                  return { success: false, error: "Yeh account deactivate kar diya gaya hai. Admin se rabta karein." };
                }
                if (localUser.password && cleanPass && localUser.password !== cleanPass) {
                  return { success: false, error: "Ghalat Password darj kiya gaya hai." };
                }

                const resolvedPerms =
                  localUser.permissions && localUser.permissions.length > 0
                    ? localUser.permissions
                    : ROLE_PERMISSIONS[localUser.role] || [];

                const authSession: AuthenticatedUser = {
                  ...localUser,
                  permissions: resolvedPerms,
                  lastLoginAt: new Date().toISOString(),
                };

                setCurrentUser(authSession);
                if (typeof window !== "undefined") {
                  localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(authSession));
                }
                return { success: true };
              }
            } catch {}
          }

          return {
            success: false,
            error: "Email address system ma darj nahi hai. Admin se account banwayen.",
          };
        }

        if (!user.active) {
          return {
            success: false,
            error: "Yeh account deactivate hai. Administrator se rabta karein.",
          };
        }

        if (user.password && cleanPass && user.password !== cleanPass) {
          return { success: false, error: "Ghalat Password darj kiya gaya hai." };
        }

        const permissions =
          user.permissions && user.permissions.length > 0
            ? user.permissions
            : ROLE_PERMISSIONS[user.role] || [];

        const sessionUser: AuthenticatedUser = {
          ...user,
          permissions,
          lastLoginAt: new Date().toISOString(),
        };

        setCurrentUser(sessionUser);
        if (typeof window !== "undefined") {
          localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(sessionUser));
        }

        // Update last login in db
        try {
          await (offlineDb as any).users?.update(user.id, {
            lastLoginAt: sessionUser.lastLoginAt,
          });
        } catch {}

        return { success: true };
      } catch (err: any) {
        console.error("Login attempt failed:", err);
        return { success: false, error: err.message || "Login karne ma khata hui." };
      }
    },
    []
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    }
    router.push("/login");
  }, [router]);

  const hasPermission = useCallback((permission: Permission): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    return (currentUser.permissions || []).includes(permission);
  }, [currentUser]);

  const hasAnyPermission = useCallback((permissions: Permission[]): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    const userPerms = currentUser.permissions || [];
    return permissions.some((p) => userPerms.includes(p));
  }, [currentUser]);

  const hasModuleAccess = useCallback((moduleKey: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;

    switch (moduleKey) {
      case "dashboard":
        return true;
      case "sales":
      case "invoices":
        return hasAnyPermission(["invoices:create", "invoices:view", "invoices:edit", "invoices:reverse"]);
      case "inventory":
      case "stock":
        return hasAnyPermission(["inventory:view", "inventory:receive", "inventory:damage", "inventory:samples"]);
      case "products":
      case "catalog":
        return hasAnyPermission(["products:view", "products:edit"]);
      case "crm":
      case "customers":
        return hasAnyPermission(["crm:customers", "crm:visits", "crm:leads"]);
      case "finance":
      case "accounts":
        return hasAnyPermission(["finance:payments", "finance:aging", "finance:ledgers", "finance:pnl"]);
      case "marketing":
        return hasPermission("marketing:manage");
      case "users":
        return hasPermission("users:manage");
      case "settings":
        return hasPermission("settings:manage");
      default:
        return true;
    }
  }, [currentUser, hasAnyPermission, hasPermission]);

  const authContextValue = useMemo(() => ({
    currentUser,
    loading,
    login,
    logout,
    hasPermission,
    hasAnyPermission,
    hasModuleAccess,
  }), [currentUser, loading, login, logout, hasPermission, hasAnyPermission, hasModuleAccess]);

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
