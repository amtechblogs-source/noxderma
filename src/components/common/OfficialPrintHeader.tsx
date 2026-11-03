"use client";

import React, { useEffect, useState } from "react";
import { MapPin, Phone, Mail } from "lucide-react";
import { offlineDb } from "@/lib/offline/db";
import { formatKarachiDate } from "@/lib/formatting";
import type { BusinessSettings } from "@/types";

export interface PrintMetaItem {
  label: string;
  value: React.ReactNode;
}

export interface OfficialPrintHeaderProps {
  /** The title displayed inside the official badge on the right (e.g. "SALE INVOICE", "CUSTOMER STATEMENT") */
  title: string;
  /** Subtitle under brand name (defaults to "Derma & Healthcare Solutions") */
  subtitle?: string;
  /** Document reference / number (e.g. "INV-10023", "DOC-REF-20261103") */
  docRef?: string | null;
  /** Date of document or printing (defaults to current date/time in Asia/Karachi) */
  date?: string | Date | null;
  /** Human readable period string (e.g. "01 Nov 2026 to 03 Nov 2026") */
  period?: string | null;
  /** Target entity name (e.g. Customer name, Company name, Employee name) */
  targetName?: string | null;
  /** Label for target entity (e.g. "Customer", "Company", "Employee", defaults to "Target") */
  targetLabel?: string;
  /** Additional custom metadata rows */
  metaItems?: PrintMetaItem[];
  /** Optional preloaded BusinessSettings; if omitted, automatically loads from offlineDb.settings */
  settings?: BusinessSettings | null;
  /** If true, renders visible for on-screen Print Preview modal. If false, renders as "hidden print:flex" */
  showInPreview?: boolean;
  /** Extra container className */
  className?: string;
  /** Additional custom children rendered in the right-side metadata section */
  children?: React.ReactNode;
}

export const OfficialPrintHeader: React.FC<OfficialPrintHeaderProps> = ({
  title,
  subtitle = "Derma & Healthcare Solutions",
  docRef,
  date,
  period,
  targetName,
  targetLabel = "Customer",
  metaItems,
  settings: propSettings,
  showInPreview = false,
  className = "",
  children,
}) => {
  const [internalSettings, setInternalSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    if (propSettings) return;
    let isMounted = true;
    offlineDb.settings.get("primary").then((saved) => {
      if (isMounted && saved) {
        setInternalSettings(saved as BusinessSettings);
      }
    }).catch(() => {
      // Ignore fallback
    });
    return () => {
      isMounted = false;
    };
  }, [propSettings]);

  const activeSettings = propSettings || internalSettings;

  const brandName = activeSettings?.brandName || activeSettings?.legalName || "NOXDERMA PHARMACEUTICALS";
  const address = activeSettings?.address || "Plot 42, Industrial Area, Sector 7, Karachi, Pakistan";
  const phone = activeSettings?.contactPhone || "+92 300 1234567";
  const email = activeSettings?.email || "info@noxderma.com";
  const ntn = activeSettings?.ntnNumber;
  const logoUrl = activeSettings?.invoiceLogoUrl || activeSettings?.appLogoUrl;

  return (
    <div
      className={`justify-between items-start pb-4 border-b-2 border-black gap-4 text-black ${
        showInPreview ? "flex" : "hidden print:flex"
      } ${className}`}
    >
      {/* Left Branding Block */}
      <div className="flex items-start gap-3.5">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Official Logo"
            className="h-16 w-auto max-w-[160px] object-contain shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-base shrink-0">
            ND
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-black leading-tight">
            {brandName}
          </h1>
          <p className="text-[11px] font-bold text-slate-700">
            {subtitle}
          </p>
          <div className="mt-1 space-y-0.5 text-[10px] sm:text-xs font-semibold text-slate-800">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-black shrink-0" />
              <span>{address}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-black shrink-0" />
              <span>{phone}</span>
              {ntn && (
                <>
                  <span className="text-slate-400">•</span>
                  <span>NTN: {ntn}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-black shrink-0" />
              <span>{email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Document Metadata Block */}
      <div className="text-right shrink-0">
        <span className="inline-block px-3 py-1 rounded text-[11px] sm:text-xs font-black uppercase tracking-wider bg-slate-100 border border-black text-black mb-1">
          {title}
        </span>

        {docRef && (
          <p className="font-mono text-xs sm:text-sm font-black text-black mt-1">
            {docRef}
          </p>
        )}

        <p className="text-[10px] sm:text-xs text-slate-700 mt-0.5">
          <strong>Printed:</strong> {formatKarachiDate(date || new Date(), true)}
        </p>

        {period && (
          <p className="text-[10px] sm:text-xs text-slate-700">
            <strong>Period:</strong> {period}
          </p>
        )}

        {targetName && (
          <p className="text-[10px] sm:text-xs text-slate-700">
            <strong>{targetLabel}:</strong> {targetName}
          </p>
        )}

        {metaItems?.map((item, idx) => (
          <p key={idx} className="text-[10px] sm:text-xs text-slate-700">
            <strong>{item.label}:</strong> {item.value}
          </p>
        ))}

        {children}
      </div>
    </div>
  );
};

