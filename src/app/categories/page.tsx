"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Layers,
  Plus,
  ArrowLeft,
  CheckCircle2,
  Trash2,
  Edit2,
  MoveUp,
  MoveDown,
  Archive,
  RotateCcw,
} from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { INITIAL_DEFAULT_CATEGORIES } from "@/types";
import type { DynamicCategory } from "@/types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const refreshCategories = async () => {
    const list = await offlineDb.categories.toArray();
    if (list.length === 0) {
      const now = new Date().toISOString();
      const initial = INITIAL_DEFAULT_CATEGORIES.map((c) => ({
        ...c,
        createdAt: now,
        updatedAt: now,
      }));
      await offlineDb.categories.bulkPut(initial);
      setCategories(initial.sort((a, b) => a.displayOrder - b.displayOrder));
    } else {
      setCategories(list.sort((a, b) => a.displayOrder - b.displayOrder));
    }
  };

  useEffect(() => {
    refreshCategories();
  }, []);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const now = new Date().toISOString();
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

    if (editingId) {
      await offlineDb.categories.update(editingId, {
        name: name.trim(),
        slug,
        description: description.trim(),
        updatedAt: now,
      });
      setEditingId(null);
    } else {
      const newCat: DynamicCategory = {
        id: `cat_${Date.now()}`,
        name: name.trim(),
        slug,
        description: description.trim(),
        displayOrder: categories.length + 1,
        active: true,
        productCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await offlineDb.categories.add(newCat);
      setIsAdding(false);
    }

    setName("");
    setDescription("");
    await refreshCategories();
  };

  const handleToggleActive = async (cat: DynamicCategory) => {
    await offlineDb.categories.update(cat.id, {
      active: !cat.active,
      updatedAt: new Date().toISOString(),
    });
    await refreshCategories();
  };

  const handleReorder = async (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === categories.length - 1)) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const current = categories[index];
    const target = categories[targetIndex];

    const currentOrder = current.displayOrder;
    const targetOrder = target.displayOrder;

    await offlineDb.transaction("rw", offlineDb.categories, async () => {
      await offlineDb.categories.update(current.id, { displayOrder: targetOrder });
      await offlineDb.categories.update(target.id, { displayOrder: currentOrder });
    });

    await refreshCategories();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Layers className="w-6 h-6 text-teal-600" />
            Dynamic Business Categories
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Define, rename, and reorder commercial categories (e.g. Pharmacy, Cosmeceuticals, Supplements) without code changes.
          </p>
        </div>

        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setEditingId(null);
            setName("");
            setDescription("");
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel" : "Add Dynamic Category"}
        </button>
      </div>

      {/* Add / Edit Form */}
      {(isAdding || editingId) && (
        <form
          onSubmit={handleSaveCategory}
          className="p-5 rounded-xl border border-teal-500/30 bg-teal-50/20 dark:bg-slate-900 shadow-sm space-y-4 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            {editingId ? "Edit Category" : "Create New Dynamic Category"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Category Title *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ayurvedic Formulations"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of clinical sector..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-bold"
            >
              Save Category
            </button>
          </div>
        </form>
      )}

      {/* Category List */}
      <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {categories.map((cat, idx) => (
            <div key={cat.id} className="py-3.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold flex items-center justify-center text-[10px]">
                  {cat.displayOrder}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                      {cat.name}
                    </strong>
                    {!cat.active && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">
                        ARCHIVED
                      </span>
                    )}
                  </div>
                  {cat.description && <p className="text-slate-500 mt-0.5">{cat.description}</p>}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleReorder(idx, "up")}
                  disabled={idx === 0}
                  title="Move Up"
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                >
                  <MoveUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleReorder(idx, "down")}
                  disabled={idx === categories.length - 1}
                  title="Move Down"
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 disabled:opacity-30"
                >
                  <MoveDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    setEditingId(cat.id);
                    setName(cat.name);
                    setDescription(cat.description || "");
                    setIsAdding(false);
                  }}
                  title="Edit Category"
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-teal-600"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleToggleActive(cat)}
                  title={cat.active ? "Archive Category" : "Restore Category"}
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-amber-600"
                >
                  {cat.active ? <Archive className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
