import { ROLE_PERMISSIONS, type Permission, type UserProfile, type UserRole } from "@/types";

export function hasPermission(user: UserProfile | null, permission: Permission): boolean {
  if (!user || !user.active) return false;
  const userPerms = ROLE_PERMISSIONS[user.role] || [];
  return userPerms.includes(permission);
}

export function canViewPricing(role?: UserRole): boolean {
  if (!role) return false;
  return role === "admin" || role === "booking_user";
}

export function canViewPurchaseCosts(role?: UserRole): boolean {
  return role === "admin";
}

export function canAccessLedgers(role?: UserRole): boolean {
  return role === "admin";
}

export function canManageUsers(role?: UserRole): boolean {
  return role === "admin";
}

export function canManageSettings(role?: UserRole): boolean {
  return role === "admin";
}

export function canCreateInvoices(role?: UserRole): boolean {
  return role === "admin" || role === "booking_user" || role === "sales_rep";
}

export function canManageBatches(role?: UserRole): boolean {
  return role === "admin" || role === "warehouse_staff";
}
