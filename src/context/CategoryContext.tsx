"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
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

  const refreshCategories = async () => {
    try {
      const list = await offlineDb.categories.toArray();
      const activeList = list.filter((c) => c.active).sort((a, b) => a.displayOrder - b.displayOrder);
      setCategories(activeList);
    } catch (err) {
      console.warn("Could not load categories in CategoryProvider:", err);
    }
  };

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

    window.addEventListener("noxderma_category_changed", handleCategoryEvent);
    return () => {
      window.removeEventListener("noxderma_category_changed", handleCategoryEvent);
    };
  }, []);

  const setSelectedCategoryId = (id: string) => {
    setSelectedCategoryIdState(id);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, id);
      window.dispatchEvent(new CustomEvent("noxderma_category_changed", { detail: id }));
    }
  };

  const selectedCategory =
    selectedCategoryId === "all"
      ? null
      : categories.find((c) => c.id === selectedCategoryId) || null;

  const filterProductsByCategory = <T extends { categoryId?: string }>(items: T[]): T[] => {
    if (selectedCategoryId === "all") return items;
    return items.filter((item) => item.categoryId === selectedCategoryId);
  };

  return (
    <CategoryContext.Provider
      value={{
        selectedCategoryId,
        selectedCategory,
        categories,
        setSelectedCategoryId,
        refreshCategories,
        filterProductsByCategory,
      }}
    >
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
