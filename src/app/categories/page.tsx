"use client";

import React, { useState, useEffect, useRef } from "react";
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
  AlertTriangle,
  Clock,
  X,
} from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { useCategory } from "@/context/CategoryContext";
import { useAuth } from "@/context/AuthContext";
import { recordActivity } from "@/lib/audit/auditTracker";
import { INITIAL_DEFAULT_CATEGORIES } from "@/types";
import type { DynamicCategory } from "@/types";

export default function CategoriesPage() {
  const { currentUser } = useAuth();
  const { refreshCategories: refreshGlobalCategories, setSelectedCategoryId } = useCategory();
  const [categories, setCategories] = useState<DynamicCategory[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Category Deletion Warning & Countdown State
  const [categoryToDelete, setCategoryToDelete] = useState<DynamicCategory | null>(null);
  const [deleteCountdown, setDeleteCountdown] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const refreshCategories = async () => {
    const list = await offlineDb.categories.toArray();
    setCategories(list.sort((a, b) => a.displayOrder - b.displayOrder));
    await refreshGlobalCategories();
  };

  useEffect(() => {
    refreshCategories();
    const handleCloudSynced = () => {
      refreshCategories();
    };
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Category ka naam likhna zaroori hai.");
      return;
    }

    // Duplicate Category Check (Case-insensitive)
    const isDuplicate = categories.some(
      (c) => c.id !== editingId && c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      setErrorMessage(
        `Duplicate Category Mana Hai! "${trimmedName}" naam ki category pehle se mojood hai. Barah-e-karam mukhtalif naam likhein.`
      );
      return;
    }

    const now = new Date().toISOString();
    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    if (editingId) {
      const prevCat = categories.find((c) => c.id === editingId);
      await offlineDb.categories.update(editingId, {
        name: trimmedName,
        slug,
        description: description.trim(),
        updatedAt: now,
      });
      if (prevCat) {
        const updatedCat: DynamicCategory = {
          ...prevCat,
          name: trimmedName,
          slug,
          description: description.trim(),
          updatedAt: now,
        };
        await recordActivity({
          userId: currentUser?.id,
          userName: currentUser?.displayName || "Owner",
          userRole: currentUser?.role || "owner",
          userEmail: currentUser?.email,
          action: "update",
          entityType: "category",
          entityId: editingId,
          entityTitle: trimmedName,
          details: `Updated medicine category "${prevCat.name}" to "${trimmedName}".`,
          snapshotBefore: prevCat,
          snapshotAfter: updatedCat,
          canUndo: true,
        });
      }
      setSuccessMessage(`Category "${trimmedName}" kamyabi se update ho gai!`);
      setEditingId(null);
    } else {
      const newCat: DynamicCategory = {
        id: `cat_${Date.now()}`,
        name: trimmedName,
        slug,
        description: description.trim(),
        displayOrder: categories.length + 1,
        active: true,
        productCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      await offlineDb.categories.add(newCat);
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "create",
        entityType: "category",
        entityId: newCat.id,
        entityTitle: newCat.name,
        details: `Created new medicine category "${newCat.name}".`,
        snapshotAfter: newCat,
        canUndo: true,
      });
      setSuccessMessage(`Nayi category "${trimmedName}" kamyabi se shamil ho gai!`);
      setIsAdding(false);
    }

    setName("");
    setDescription("");
    await refreshCategories();
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Trigger safety prompt warning with timed countdown
  const startDeletePrompt = (cat: DynamicCategory) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCategoryToDelete(cat);
    setDeleteCountdown(4); // 4 seconds mandatory wait

    timerRef.current = setInterval(() => {
      setDeleteCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelDelete = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setCategoryToDelete(null);
    setDeleteCountdown(0);
  };

  const confirmDelete = async () => {
    if (!categoryToDelete || deleteCountdown > 0) return;

    try {
      const deletedCat = { ...categoryToDelete };
      await offlineDb.categories.delete(categoryToDelete.id);
      await recordActivity({
        userId: currentUser?.id,
        userName: currentUser?.displayName || "Owner",
        userRole: currentUser?.role || "owner",
        userEmail: currentUser?.email,
        action: "delete",
        entityType: "category",
        entityId: deletedCat.id,
        entityTitle: deletedCat.name,
        details: `Deleted medicine category "${deletedCat.name}".`,
        snapshotBefore: deletedCat,
        canUndo: true,
      });
      setSelectedCategoryId("all");
      await refreshCategories();
      setSuccessMessage(`Category "${categoryToDelete.name}" delete ho chuki hai.`);
      cancelDelete();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error("Failed to delete category:", err);
      setErrorMessage("Category delete karne mein masla aya.");
    }
  };

  const handleToggleActive = async (cat: DynamicCategory) => {
    const nowIso = new Date().toISOString();
    await offlineDb.categories.update(cat.id, {
      active: !cat.active,
      updatedAt: nowIso,
    });
    await recordActivity({
      userId: currentUser?.id,
      userName: currentUser?.displayName || "Owner",
      userRole: currentUser?.role || "owner",
      userEmail: currentUser?.email,
      action: "update",
      entityType: "category",
      entityId: cat.id,
      entityTitle: cat.name,
      details: `${!cat.active ? "Shown" : "Hidden"} medicine category "${cat.name}".`,
      snapshotBefore: cat,
      snapshotAfter: { ...cat, active: !cat.active, updatedAt: nowIso },
      canUndo: true,
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
            Back to Home
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Layers className="w-6 h-6 text-teal-600" />
            Medicine Categories
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Add, rename, and organize medicine groups (e.g. Tablets, Injections, Skin Creams, Syrups).
          </p>
        </div>

        <button
          onClick={() => {
            setIsAdding(!isAdding);
            setEditingId(null);
            setName("");
            setDescription("");
            setErrorMessage(null);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs md:text-sm font-bold shadow-md shadow-teal-600/20"
        >
          <Plus className="w-4 h-4" />
          {isAdding ? "Cancel" : "Add New Category"}
        </button>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Add / Edit Form */}
      {(isAdding || editingId) && (
        <form
          onSubmit={handleSaveCategory}
          className="p-5 rounded-xl border border-teal-500/30 bg-teal-50/20 dark:bg-slate-900 shadow-sm space-y-4 text-xs animate-in fade-in"
        >
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            {editingId ? "Change Category Name" : "Add New Category"}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">
                Category Name * <span className="text-[10px] text-slate-400">(Duplicates Not Allowed)</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. Injections, Syrups, Skin Creams..."
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Details / Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional notes about this medicine group..."
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
                setErrorMessage(null);
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
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Registered Categories ({categories.length})
          </span>
          <span className="text-[11px] text-slate-500">
            Use arrows to reorder • Duplicates strictly blocked
          </span>
        </div>

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
                        HIDDEN
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
                    setErrorMessage(null);
                  }}
                  title="Edit Category Name"
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-teal-600"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleToggleActive(cat)}
                  title={cat.active ? "Hide Category" : "Show Category"}
                  className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-amber-600"
                >
                  {cat.active ? <Archive className="w-3.5 h-3.5" /> : <RotateCcw className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => startDeletePrompt(cat)}
                  title="Delete Category"
                  className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Safety Prompt Warning Modal with Delayed Confirm Option */}
      {categoryToDelete && (
        <div className="fixed inset-0 !mt-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-900 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/80 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                  Category Delete Warning!
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Kya aap waqai category{" "}
                  <strong className="text-rose-600 font-bold">
                    &ldquo;{categoryToDelete.name}&rdquo;
                  </strong>{" "}
                  ko hamesha k liye khatam (delete) karna chahte hain?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Safety Lock Activated:
              </p>
              <p>
                Ghalti se delete hone se bachane k liye kuch seconds ka waqfa rakha gaya hai.
              </p>
            </div>

            {/* Countdown State Indicator */}
            {deleteCountdown > 0 ? (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 font-mono">
                <Clock className="w-4 h-4 animate-spin text-teal-600" />
                Confirm button unlocks in: <span className="text-rose-600 text-sm font-extrabold">{deleteCountdown}s</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-xs font-bold text-rose-700 dark:text-rose-300">
                <CheckCircle2 className="w-4 h-4 text-rose-600" />
                Lock Unlocked: You can now confirm deletion safely.
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={cancelDelete}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel (Wapis Jayein)
              </button>

              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleteCountdown > 0}
                className={`px-4 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1.5 shadow-md transition-all ${
                  deleteCountdown > 0
                    ? "bg-rose-400 cursor-not-allowed opacity-60"
                    : "bg-rose-600 hover:bg-rose-700 shadow-rose-600/30"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleteCountdown > 0 ? `Wait (${deleteCountdown}s)...` : "Yes, Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
