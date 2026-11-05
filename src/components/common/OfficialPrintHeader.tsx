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
    const loadSavedSettings = () => {
      offlineDb.settings
        .get("primary")
        .then((saved) => {
          if (isMounted && saved) {
            setInternalSettings(saved as BusinessSettings);
          }
        })
        .catch(() => {});
    };
    loadSavedSettings();

    window.addEventListener("noxderma_settings_updated", loadSavedSettings);
    window.addEventListener("noxderma-cloud-synced", loadSavedSettings);
    return () => {
      isMounted = false;
      window.removeEventListener("noxderma_settings_updated", loadSavedSettings);
      window.removeEventListener("noxderma-cloud-synced", loadSavedSettings);
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
      data-print-header="true"
      data-print-title={title}
      data-print-ref={docRef || ""}
      className={`flex-col sm:flex-row print:flex-row justify-between items-start pb-3.5 sm:pb-4 border-b-2 border-black gap-3 sm:gap-4 text-slate-900 dark:text-slate-100 print:text-black w-full max-w-full overflow-hidden ${
        showInPreview ? "flex" : "hidden print:flex"
      } ${className}`}
    >
      {/* Left Branding Block */}
      <div className="flex items-start gap-2.5 sm:gap-3.5 w-full sm:w-auto print:w-auto min-w-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Official Logo"
            className="h-12 sm:h-16 print:h-16 w-auto max-w-[110px] sm:max-w-[160px] print:max-w-[160px] object-contain shrink-0 rounded-lg"
          />
        ) : (
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shrink-0">
            ND
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-2xl print:text-2xl font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 print:text-black leading-tight break-words">
            {brandName}
          </h1>
          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 print:text-slate-700">
            {subtitle}
          </p>
          <div className="mt-1 space-y-0.5 text-[10px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 print:text-slate-800">
            <div className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-900 dark:text-slate-200 print:text-black shrink-0 mt-0.5" />
              <span className="break-words">{address}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-900 dark:text-slate-200 print:text-black shrink-0" />
              <span>{phone}</span>
              {ntn && (
                <>
                  <span className="text-slate-400">•</span>
                  <span>NTN: {ntn}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-900 dark:text-slate-200 print:text-black shrink-0" />
              <span className="break-all">{email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Document Metadata Block */}
      <div className="w-full sm:w-auto print:w-auto text-left sm:text-right print:text-right sm:shrink-0 print:shrink-0 pt-2.5 sm:pt-0 print:pt-0 border-t border-slate-200/80 dark:border-slate-700/80 sm:border-t-0 print:border-t-0">
        <span className="inline-block max-w-full break-words px-2.5 sm:px-3 py-1 rounded text-[10px] sm:text-xs font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 print:bg-slate-100 border border-slate-900 dark:border-slate-500 print:border-black text-slate-900 dark:text-slate-100 print:text-black mb-1">
          {title}
        </span>

        {docRef && (
          <p className="font-mono text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 print:text-black mt-0.5 sm:mt-1 break-all">
            {docRef}
          </p>
        )}

        <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 print:text-slate-700 mt-0.5">
          <strong>Printed:</strong> {formatKarachiDate(date || new Date(), true)}
        </p>

        {period && (
          <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 print:text-slate-700">
            <strong>Period:</strong> {period}
          </p>
        )}

        {targetName && (
          <p className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 print:text-slate-700">
            <strong>{targetLabel}:</strong> {targetName}
          </p>
        )}

        {metaItems?.map((item, idx) => (
          <p key={idx} className="text-[10px] sm:text-xs text-slate-600 dark:text-slate-300 print:text-slate-700">
            <strong>{item.label}:</strong> {item.value}
          </p>
        ))}

        {children}
      </div>
    </div>
  );
};

