"use client";

import React, { useEffect, useState } from "react";
import { MapPin, Phone, Mail } from "lucide-react";
import { formatKarachiDate } from "@/lib/formatting";
import {
  getCachedBusinessSettings,
  loadAuthoritativeBusinessSettings,
  mergeBusinessSettings,
  resolvePrintLogoUrl,
} from "@/lib/settings";
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
  const [internalSettings, setInternalSettings] = useState<BusinessSettings | null>(() =>
    getCachedBusinessSettings()
  );

  useEffect(() => {
    let isMounted = true;
    const loadSavedSettings = () => {
      const cached = getCachedBusinessSettings();
      if (isMounted && cached) {
        setInternalSettings((prev) => mergeBusinessSettings(prev, cached));
      }
      loadAuthoritativeBusinessSettings()
        .then((saved) => {
          if (isMounted && saved) {
            setInternalSettings(saved);
          }
        })
        .catch(() => {});
    };
    loadSavedSettings();

    const handleSettingsUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && isMounted) {
        setInternalSettings((prev) => mergeBusinessSettings(prev, detail));
      } else {
        loadSavedSettings();
      }
    };

    const handleCloudSynced = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (Array.isArray(detail?.tables) && !detail.tables.includes("settings")) {
        return;
      }
      loadSavedSettings();
    };

    window.addEventListener("noxderma_settings_updated", handleSettingsUpdated);
    window.addEventListener("noxderma-cloud-synced", handleCloudSynced);
    return () => {
      isMounted = false;
      window.removeEventListener("noxderma_settings_updated", handleSettingsUpdated);
      window.removeEventListener("noxderma-cloud-synced", handleCloudSynced);
    };
  }, []);

  const activeSettings = mergeBusinessSettings(propSettings, internalSettings);

  const brandName = activeSettings?.brandName || activeSettings?.legalName || "NOXDERMA PHARMACEUTICALS";
  const address = activeSettings?.address || "Plot 42, Industrial Area, Sector 7, Karachi, Pakistan";
  const phone = activeSettings?.contactPhone || "+92 300 1234567";
  const email = activeSettings?.email || "info@noxderma.com";
  const ntn = activeSettings?.ntnNumber;
  const logoUrl = resolvePrintLogoUrl(activeSettings);

  return (
    <div
      data-print-header="true"
      data-print-title={title}
      data-print-ref={docRef || ""}
      className={`flex-col sm:flex-row print:flex-row justify-between items-start pb-3.5 sm:pb-4 border-b-2 border-black gap-3 sm:gap-5 print:gap-5 text-slate-900 dark:text-slate-100 print:text-black w-full max-w-full overflow-visible ${
        showInPreview ? "flex" : "hidden print:flex"
      } ${className}`}
    >
      {/* Left Branding Block */}
      <div className="flex items-start gap-2.5 sm:gap-3.5 w-full sm:flex-1 print:flex-1 min-w-0">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Official Logo"
            loading="eager"
            decoding="sync"
            data-print-logo="true"
            className="h-12 sm:h-16 print:h-16 w-auto min-w-[44px] max-w-[110px] sm:max-w-[150px] print:max-w-[150px] object-contain shrink-0 rounded-lg"
          />
        ) : (
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm sm:text-base shrink-0">
            ND
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-base sm:text-xl print:text-xl font-black uppercase tracking-tight text-slate-900 dark:text-slate-100 print:text-black leading-tight break-words">
            {brandName}
          </h1>
          <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 print:text-slate-700 leading-snug mt-0.5">
            {subtitle}
          </p>
          <div className="mt-1 space-y-0.5 text-[10px] sm:text-xs print:text-[11px] font-semibold text-slate-700 dark:text-slate-300 print:text-slate-800 leading-snug">
            <div className="flex items-start gap-1.5">
              <MapPin className="w-[14px] h-[14px] overflow-visible text-slate-900 dark:text-slate-200 print:text-black shrink-0 mt-[1px]" />
              <span className="break-words">{address}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Phone className="w-[14px] h-[14px] overflow-visible text-slate-900 dark:text-slate-200 print:text-black shrink-0" />
              <span>{phone}</span>
              {ntn && (
                <>
                  <span className="text-slate-400">•</span>
                  <span>NTN: {ntn}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Mail className="w-[14px] h-[14px] overflow-visible text-slate-900 dark:text-slate-200 print:text-black shrink-0" />
              <span className="break-all">{email}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Document Metadata Block */}
      <div className="w-full sm:w-auto print:w-auto sm:max-w-[46%] print:max-w-[46%] flex flex-col items-start sm:items-end print:items-end text-left sm:text-right print:text-right sm:shrink-0 print:shrink-0 pt-2.5 sm:pt-0 print:pt-0 border-t border-slate-200/80 dark:border-slate-700/80 sm:border-t-0 print:border-t-0">
        <div className="inline-flex items-center justify-center max-w-full px-2.5 sm:px-3 py-1.5 rounded-md text-[10px] sm:text-[11px] print:text-[11px] leading-snug font-black uppercase tracking-wider bg-slate-100 dark:bg-slate-800 print:bg-slate-100 border border-slate-900 dark:border-slate-500 print:border-black text-slate-900 dark:text-slate-100 print:text-black mb-1.5 text-center">
          <span className="break-words">{title}</span>
        </div>

        {docRef && (
          <p className="font-mono text-xs sm:text-sm print:text-xs font-black text-slate-900 dark:text-slate-100 print:text-black mt-0.5 break-all leading-snug">
            {docRef}
          </p>
        )}

        <p className="text-[10px] sm:text-xs print:text-[11px] text-slate-600 dark:text-slate-300 print:text-slate-800 mt-0.5 leading-snug break-words">
          <strong>Printed:</strong> {formatKarachiDate(date || new Date(), true)}
        </p>

        {period && (
          <p className="text-[10px] sm:text-xs print:text-[11px] text-slate-600 dark:text-slate-300 print:text-slate-800 leading-snug break-words">
            <strong>Period:</strong> {period}
          </p>
        )}

        {targetName && (
          <p className="text-[10px] sm:text-xs print:text-[11px] text-slate-600 dark:text-slate-300 print:text-slate-800 leading-snug break-words">
            <strong>{targetLabel}:</strong> {targetName}
          </p>
        )}

        {metaItems?.map((item, idx) => (
          <p key={idx} className="text-[10px] sm:text-xs print:text-[11px] text-slate-600 dark:text-slate-300 print:text-slate-800 leading-snug break-words">
            <strong>{item.label}:</strong> {item.value}
          </p>
        ))}

        {children}
      </div>
    </div>
  );
};

