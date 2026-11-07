"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { offlineDb } from "@/lib/offline/db";
import type { DynamicCategory } from "@/types";

interface CategoryContextType {
  selectedCategoryId: string; // "all" or specific category ID
  selectedCategory: DynamicCategory | null;
  categories: DynamicCategory[];
  setSelectedCategoryId: (id: string) => void;
  refreshCategories: () => Promise<void>;
  filterProductsByCategory: <T extends { categoryId?: string }>(items: T[]) => T[];
}

const CategoryContext = createContext<CategoryContextType | undefined>(undefined);

const STORAGE_KEY = "noxderma_selected_category";

export function CategoryProvider({ children }: { children: React.ReactNode }) {
  const [selectedCategoryId, setSelectedCategoryIdState] = useState<string>("all");
  const [categories, setCategories] = useState<DynamicCategory[]>([]);

  const refreshCategories = useCallback(async () => {
    try {
      const list = await offlineDb.categories.toArray();
      const activeList = list.filter((c) => c.active).sort((a, b) => a.displayOrder - b.displayOrder);
      setCategories((prev) => {
        if (prev.length === activeList.length && JSON.stringify(prev) === JSON.stringify(activeList)) {
          return prev;
        }
        return activeList;
      });
    } catch (err) {
      console.warn("Could not load categories in CategoryProvider:", err);
    }
  }, []);

  useEffect(() => {
    // Load persisted selection
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSelectedCategoryIdState(saved);
      }
    }
    refreshCategories();

    // Listen for custom category changes across windows or components
    const handleCategoryEvent = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      if (customEvent.detail) {
        setSelectedCategoryIdState(customEvent.detail);
      }
    };

    const handleCloudSynced = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (Array.isArray(detail?.tables) && !detail.tables.includes("categories")) {
        return;
      }
      refreshCategories();
    };

    window.addEventListener("noxderma_category_changed", handleCategoryEvent);
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => {
      window.removeEventListener("noxderma_category_changed", handleCategoryEvent);
      window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
    };
  }, [refreshCategories]);

  const setSelectedCategoryId = useCallback((id: string) => {
    setSelectedCategoryIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent("noxderma_category_changed", { detail: id }));
    }
  }, []);

  const selectedCategory = useMemo(() => {
    return selectedCategoryId === "all"
      ? null
      : categories.find((c) => c.id === selectedCategoryId) || null;
  }, [selectedCategoryId, categories]);

  const filterProductsByCategory = useCallback(<T extends { categoryId?: string }>(items: T[]): T[] => {
    if (selectedCategoryId === "all") return items;
    return items.filter((item) => item.categoryId === selectedCategoryId);
  }, [selectedCategoryId]);

  const categoryContextValue = useMemo(() => ({
    selectedCategoryId,
    selectedCategory,
    categories,
    setSelectedCategoryId,
    refreshCategories,
    filterProductsByCategory,
  }), [selectedCategoryId, selectedCategory, categories, setSelectedCategoryId, refreshCategories, filterProductsByCategory]);

  return (
    <CategoryContext.Provider value={categoryContextValue}>
      {children}
    </CategoryContext.Provider>
  );
}

export function useCategory() {
  const context = useContext(CategoryContext);
  if (!context) {
    throw new Error("useCategory must be used within a CategoryProvider");
  }
  return context;
}
