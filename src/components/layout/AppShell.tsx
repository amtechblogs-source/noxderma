"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { OfflineBanner } from "./OfflineBanner";
import { CategoryProvider } from "@/context/CategoryContext";
import type { UserProfile } from "@/types";

interface AppShellProps {
  children: React.ReactNode;
  initialUser?: UserProfile | null;
}

export function AppShell({ children, initialUser }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(initialUser || null);

  // Initialize offline default user profile if none provided
  useEffect(() => {
    if (!user) {
      setUser({
        id: "usr_admin",
        email: "admin@noxderma.com",
        displayName: "System Administrator",
        role: "admin",
        active: true,
        createdAt: new Date().toISOString(),
      });
    }

    // Register Service Worker for PWA offline caching
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Noxderma Service Worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.warn("Service Worker registration failed:", err);
        });
    }
  }, [user]);

  const handleLogout = () => {
    // In production connects to Firebase Auth signOut
    alert("Signed out of session.");
  };

  return (
    <CategoryProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100 antialiased selection:bg-teal-500 selection:text-white">
        {/* Offline and Sync Banner */}
        <OfflineBanner />

        <div className="flex flex-1 min-h-[calc(100vh-theme(spacing.10))]">
          {/* Navigation Sidebar */}
          <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

          {/* Main Content Area */}
          <div className="flex-1 flex flex-col min-w-0 lg:pl-72 transition-all">
            <Header
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
              currentUser={user}
              onLogout={handleLogout}
            />

            <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
              {children}
            </main>
          </div>
        </div>
      </div>
    </CategoryProvider>
  );
}
