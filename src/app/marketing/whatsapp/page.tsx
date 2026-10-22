"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Share2,
  Copy,
  ExternalLink,
  Sparkles,
  Tag,
  PackageCheck,
  CheckCircle2,
  Percent,
  Calendar,
  Building2,
  ArrowLeft,
  DollarSign,
  Layers,
} from "lucide-react";
import { formatPKR, formatNumber } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Product, ProductPricing } from "@/types";

export default function WhatsAppMarketingPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [campaignType, setCampaignType] = useState<
    "bulk_discount" | "near_expiry_clearance" | "new_launch" | "bonus_scheme"
  >("bulk_discount");
  const [discountPercent, setDiscountPercent] = useState<number>(10);
  const [bonusSchemeText, setBonusSchemeText] = useState<string>("Buy 10 Packs, Get 1 Free!");
  const [validUntil, setValidUntil] = useState<string>(
    new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const loadProducts = async () => {
      const prodList = await offlineDb.products.toArray();
      setProducts(prodList);
      if (prodList.length > 0) {
        setSelectedProductId(prodList[0].id);
      }
    };
    loadProducts();
  }, []);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  const primaryImage =
    selectedProduct?.images?.[0]?.url ||
    "https://ik.imagekit.io/h7g4dsggt/products/default-med.png";

  // Build transformed ImageKit preview URL
  const imageKitTransformedUrl = `${primaryImage}?tr=w-600,h-600,cm-pad_resize,bg-F8FAFC`;

  // Calculated Pricing
  const regularTradePrice = 650;
  const discountedPrice = Math.round(regularTradePrice * (1 - discountPercent / 100));

  // WhatsApp formatted text
  const whatsappMessage = selectedProduct
    ? `🌟 *SPECIAL TRADE PROMOTION — NOXDERMA PHARMA* 🌟
    
Dear Doctor / Pharmacy Partner,

We are pleased to announce an exclusive limited-time commercial offer on:

📦 *Product:* ${selectedProduct.name}
💊 *Generic:* ${selectedProduct.genericName || "Pharmaceutical Grade Formulation"}
🏷️ *Pack Formulation:* ${selectedProduct.packSize}
🏭 *Manufacturer:* ${selectedProduct.manufacturerName}

💰 *Standard Trade Price (TP):* ${formatPKR(regularTradePrice)}
🔥 *Special Offer Price:* ${formatPKR(discountedPrice)} (${discountPercent}% OFF)
🎁 *Scheme:* ${
        campaignType === "bonus_scheme"
          ? bonusSchemeText
          : campaignType === "near_expiry_clearance"
          ? "Special Near-Expiry Clearance Discount"
          : "Volume Tier Discount"
      }

⏰ *Offer Validity:* Valid till ${validUntil} (or till stock lasts).
✅ *Batch Quality:* DRAP / GMP Certified • Genuine Cold-chain guaranteed.

*To place your direct order or inquire:*
📞 Call/WhatsApp: +92 300 1234567 / +92 42 35889911
🌐 Web App: https://noxderma.web.app/

*Noxderma Pharmaceuticals Distribution*
Excellence in Healthcare & Clinical Formulations`
    : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
              Commercial Marketing
            </span>
            <span className="text-xs text-slate-400">ImageKit Media Transforms</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            WhatsApp Promotional Card Generator
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/marketing"
            className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All Campaigns
          </Link>
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all"
          >
            {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? "Copied to Clipboard!" : "Copy WhatsApp Message"}
          </button>
        </div>
      </div>

      {/* Main Generator Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Promotion Setup */}
        <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4 text-xs">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600" /> 1. Configure Promotion Campaign
          </h3>

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Select Product from Catalog *
            </label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Campaign Theme
              </label>
              <select
                value={campaignType}
                onChange={(e) => setCampaignType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-semibold"
              >
                <option value="bulk_discount">Bulk Volume Discount</option>
                <option value="bonus_scheme">Bonus Pack Scheme (e.g. 10+1)</option>
                <option value="near_expiry_clearance">Near Expiry Clearance</option>
                <option value="new_launch">New Product Launch</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Discount Percentage (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-mono"
              />
            </div>
          </div>

          {campaignType === "bonus_scheme" && (
            <div>
              <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Bonus Pack Description
              </label>
              <input
                type="text"
                value={bonusSchemeText}
                onChange={(e) => setBonusSchemeText(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Valid Until Date
            </label>
            <input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            />
          </div>

          {/* Pricing Preview Pill */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-500">Regular Trade Price:</span>
              <span className="line-through text-slate-400 font-mono">
                {formatPKR(regularTradePrice)}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm font-bold">
              <span className="text-slate-900 dark:text-slate-100">Special Promo Trade Price:</span>
              <span className="text-emerald-600 font-mono text-base font-extrabold">
                {formatPKR(discountedPrice)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Visual WhatsApp Card & Formatted Text */}
        <div className="space-y-4">
          {/* Visual Card Preview */}
          <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <span className="font-bold text-xs text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Share2 className="w-3.5 h-3.5 text-emerald-600" /> WhatsApp Visual Media Card
              </span>
              <span className="text-[10px] text-teal-600 font-mono font-bold">
                ImageKit: {selectedProduct?.images?.[0]?.provider || "ik.imagekit.io"}
              </span>
            </div>

            {/* Generated Marketing Visual Card */}
            <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800 dark:to-slate-900 p-5 relative shadow-md">
              {/* Badge Overlay */}
              <div className="absolute top-4 right-4 bg-rose-600 text-white font-black text-xs px-3 py-1 rounded-full shadow-lg">
                {discountPercent}% OFF
              </div>

              <div className="flex gap-4 items-center">
                <div className="w-28 h-28 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 flex items-center justify-center shrink-0 shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageKitTransformedUrl}
                    alt={selectedProduct?.name}
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="space-y-1 min-w-0">
                  <span className="text-[10px] font-extrabold text-teal-600 uppercase tracking-wider block">
                    {selectedProduct?.brand || "Noxderma Pharma"}
                  </span>
                  <h4 className="font-black text-slate-900 dark:text-slate-100 text-sm leading-snug">
                    {selectedProduct?.name}
                  </h4>
                  <p className="text-[11px] text-slate-500 truncate">
                    {selectedProduct?.genericName}
                  </p>
                  <p className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
                    {selectedProduct?.packSize}
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block">Offer Price / Pack:</span>
                  <span className="text-base font-black text-emerald-600 font-mono">
                    {formatPKR(discountedPrice)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block">Valid Until:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{validUntil}</span>
                </div>
              </div>
            </div>

            {/* Formatted Text Box */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 font-mono text-[11px] whitespace-pre-line text-slate-700 dark:text-slate-300 max-h-48 overflow-y-auto">
              {whatsappMessage}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleCopy}
                className="flex-1 py-2 rounded-lg border border-slate-300 dark:border-slate-700 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Text
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
              >
                <Share2 className="w-3.5 h-3.5" /> Share to WhatsApp
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
