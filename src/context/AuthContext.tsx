"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db as firestoreDb } from "@/lib/firebase/config";
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
  login: (email: string, password?: string, rememberMe?: boolean) => Promise<{ success: boolean; error?: string }>;
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
  displayName: "System Administrator (Owner)",
  role: "owner",
  password: "admin",
  permissions: ALL_PERMISSIONS,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize Auth state from storage / offlineDb & keep permissions synced in real-time
  useEffect(() => {
    async function initAuth() {
      try {
        // Ensure default admin user is seeded into offlineDb.users if not present
        const dbUsers: UserProfile[] = (await (offlineDb as any).users?.toArray()) || [];
        const existingAdmin = dbUsers.find(
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

        // Check if there is an active session stored in localStorage or sessionStorage
        if (typeof window !== "undefined") {
          const session =
            localStorage.getItem(ACTIVE_USER_STORAGE_KEY) ||
            sessionStorage.getItem(ACTIVE_USER_STORAGE_KEY);
          if (session) {
            try {
              const parsed = JSON.parse(session) as AuthenticatedUser;
              if (parsed && parsed.email) {
                // Always prefer the latest user record from offlineDb.users so permission changes apply immediately
                const latestDbUser = dbUsers.find(
                  (u) =>
                    u.id === parsed.id ||
                    u.email.trim().toLowerCase() === parsed.email.trim().toLowerCase()
                );

                if (latestDbUser && !latestDbUser.active && latestDbUser.id !== "usr_admin") {
                  localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
                  sessionStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
                  setCurrentUser(null);
                  setLoading(false);
                  return;
                }

                const baseUser = latestDbUser || parsed;
                const isPrimaryOwner =
                  baseUser.id === "usr_admin" ||
                  baseUser.email.toLowerCase() === DEFAULT_ADMIN_USER.email.toLowerCase() ||
                  baseUser.role === "owner";

                const perms = isPrimaryOwner
                  ? ALL_PERMISSIONS
                  : Array.isArray(baseUser.permissions)
                  ? baseUser.permissions
                  : ROLE_PERMISSIONS[baseUser.role] || [];

                const syncedSession: AuthenticatedUser = {
                  ...parsed,
                  ...baseUser,
                  permissions: perms,
                };

                setCurrentUser(syncedSession);
                if (localStorage.getItem(ACTIVE_USER_STORAGE_KEY)) {
                  localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(syncedSession));
                } else {
                  sessionStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(syncedSession));
                }
                setLoading(false);
                return;
              }
            } catch {
              localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
              sessionStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
            }
          }
        }

        // If no active session exists, user must log in
        setCurrentUser(null);
      } catch (err) {
        console.error("Auth initialization error:", err);
        setCurrentUser(null);
      } finally {
        setLoading(false);
      }
    }

    initAuth();

    const handleLiveUserSync = () => {
      initAuth();
    };
    window.addEventListener("noxderma-cloud-synced", handleLiveUserSync);
    window.addEventListener("noxderma-users-updated", handleLiveUserSync);
    return () => {
      window.removeEventListener("noxderma-cloud-synced", handleLiveUserSync);
      window.removeEventListener("noxderma-users-updated", handleLiveUserSync);
    };
  }, []);

  const login = useCallback(
    async (
      email: string,
      password?: string,
      rememberMe: boolean = true
    ): Promise<{ success: boolean; error?: string }> => {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPass = (password || "").trim();

      if (!cleanEmail || !cleanPass) {
        return { success: false, error: "Please enter both email and password." };
      }

      try {
        // Fetch all system users from offlineDb and fallback localStorage
        let dbUsers: UserProfile[] = [];
        try {
          dbUsers = (await (offlineDb as any).users?.toArray()) || [];
        } catch (e) {
          console.warn("Could not load users from offlineDb:", e);
        }

        if (dbUsers.length === 0 && typeof window !== "undefined") {
          try {
            const localSaved = localStorage.getItem("noxderma_users");
            if (localSaved) {
              const parsed = JSON.parse(localSaved);
              if (Array.isArray(parsed)) dbUsers = parsed;
            }
          } catch {}
        }

        // 1. Look for user in database (and fallback to live Cloud Firestore if not yet synced locally)
        let user = dbUsers.find((u) => u.email.trim().toLowerCase() === cleanEmail);

        if (!user) {
          try {
            const snap = await getDocs(collection(firestoreDb, "users"));
            const remoteUsers: UserProfile[] = [];
            snap.forEach((docSnap) => {
              remoteUsers.push({ ...(docSnap.data() as UserProfile), id: docSnap.id });
            });
            if (remoteUsers.length > 0) {
              await (offlineDb as any).users?.bulkPut(remoteUsers);
              user = remoteUsers.find((u) => u.email.trim().toLowerCase() === cleanEmail);
            }
          } catch {}
        }

        if (user) {
          if (!user.active) {
            return {
              success: false,
              error: "This account has been deactivated. Please contact your administrator.",
            };
          }

          const expectedPass = user.password || "admin";
          if (cleanPass !== expectedPass) {
            return {
              success: false,
              error: "Incorrect email or password. Please try again.",
            };
          }

          const isPrimaryOwner =
            user.id === "usr_admin" ||
            user.email.toLowerCase() === DEFAULT_ADMIN_USER.email.toLowerCase() ||
            user.role === "owner";

          const resolvedPerms = isPrimaryOwner
            ? ALL_PERMISSIONS
            : Array.isArray(user.permissions)
            ? user.permissions
            : ROLE_PERMISSIONS[user.role] || [];

          const authSession: AuthenticatedUser = {
            ...user,
            permissions: resolvedPerms,
            lastLoginAt: new Date().toISOString(),
          };

          setCurrentUser(authSession);
          if (typeof window !== "undefined") {
            if (rememberMe) {
              localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(authSession));
              sessionStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
            } else {
              sessionStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(authSession));
              localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
            }
          }

          try {
            await (offlineDb as any).users?.update(user.id, {
              lastLoginAt: authSession.lastLoginAt,
            });
          } catch {}

          return { success: true };
        }

        // 2. Check default admin user if not present in dbUsers array
        if (cleanEmail === DEFAULT_ADMIN_USER.email.toLowerCase()) {
          const expectedAdminPass = DEFAULT_ADMIN_USER.password || "admin";
          if (cleanPass !== expectedAdminPass) {
            return {
              success: false,
              error: "Incorrect email or password. Please try again.",
            };
          }

          const adminSession: AuthenticatedUser = {
            ...DEFAULT_ADMIN_USER,
            lastLoginAt: new Date().toISOString(),
          };

          setCurrentUser(adminSession);
          if (typeof window !== "undefined") {
            if (rememberMe) {
              localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(adminSession));
              sessionStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
            } else {
              sessionStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(adminSession));
              localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
            }
          }
          return { success: true };
        }

        // If no user matched
        return {
          success: false,
          error: "Incorrect email or password. Please try again.",
        };
      } catch (err: any) {
        console.error("Login attempt failed:", err);
        return { success: false, error: "Unable to sign in. Please try again." };
      }
    },
    []
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
      sessionStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
    }
    router.push("/login");
  }, [router]);

  const hasPermission = useCallback((permission: Permission): boolean => {
    if (!currentUser) return false;
    if (
      currentUser.role === "owner" ||
      currentUser.id === "usr_admin" ||
      currentUser.email.toLowerCase() === DEFAULT_ADMIN_USER.email.toLowerCase()
    ) {
      return true;
    }
    return (currentUser.permissions || []).includes(permission);
  }, [currentUser]);

  const hasAnyPermission = useCallback((permissions: Permission[]): boolean => {
    if (!currentUser) return false;
    if (
      currentUser.role === "owner" ||
      currentUser.id === "usr_admin" ||
      currentUser.email.toLowerCase() === DEFAULT_ADMIN_USER.email.toLowerCase()
    ) {
      return true;
    }
    const userPerms = currentUser.permissions || [];
    return permissions.some((p) => userPerms.includes(p));
  }, [currentUser]);

  const hasModuleAccess = useCallback((moduleKey: string): boolean => {
    if (!currentUser) return false;
    if (
      currentUser.role === "owner" ||
      currentUser.id === "usr_admin" ||
      currentUser.email.toLowerCase() === DEFAULT_ADMIN_USER.email.toLowerCase()
    ) {
      return true;
    }

    switch (moduleKey) {
      case "dashboard":
        return true;
      case "audit":
      case "logs":
        return hasPermission("audit:view");
      case "sales":
      case "invoices":
        return hasAnyPermission(["invoices:create", "invoices:view", "invoices:edit", "invoices:reverse"]);
      case "inventory":
      case "stock":
        return hasAnyPermission(["inventory:view", "inventory:receive", "inventory:damage", "inventory:samples", "inventory:adjust"]);
      case "products":
      case "catalog":
        return hasAnyPermission(["products:view", "products:edit"]);
      case "crm":
      case "customers":
        return hasAnyPermission(["crm:customers", "crm:visits", "crm:leads", "staff:monitoring", "staff:targets"]);
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
