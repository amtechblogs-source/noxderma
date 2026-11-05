"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Printer, Download, X, FileText, Loader2, CheckCircle2 } from "lucide-react";

declare global {
  interface Window {
    __nativePrint?: () => void;
  }
}

interface PrintableDocMeta {
  title: string;
  docRef: string;
  filename: string;
}

function sanitizeFilenamePart(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolvePrintableTarget(): HTMLElement {
  const salarySlip = document.getElementById("printable-salary-slip");
  if (salarySlip) return salarySlip;

  const partnerVoucher = document.getElementById("printable-partner-voucher");
  if (partnerVoucher) return partnerVoucher;

  const printPages = Array.from(document.querySelectorAll<HTMLElement>(".print-page"));
  if (printPages.length > 0) {
    // Prefer the last or active print-page
    return printPages[printPages.length - 1];
  }

  return (document.querySelector("main") as HTMLElement) || document.body;
}

function detectDocumentMeta(): PrintableDocMeta {
  const target = resolvePrintableTarget();
  const headerEl =
    target.querySelector<HTMLElement>('[data-print-header="true"]') ||
    document.querySelector<HTMLElement>('[data-print-header="true"]');

  const rawTitle =
    headerEl?.getAttribute("data-print-title") ||
    document.querySelector("h1")?.textContent ||
    "Official Document";
  const rawRef = headerEl?.getAttribute("data-print-ref") || "";

  const datePart = new Date().toISOString().slice(0, 10);
  const cleanTitle = sanitizeFilenamePart(rawTitle) || "Noxderma-Document";
  const cleanRef = sanitizeFilenamePart(rawRef);

  const filename = cleanRef
    ? `${cleanTitle}-${cleanRef}.pdf`
    : `${cleanTitle}-${datePart}.pdf`;

  return {
    title: rawTitle.trim(),
    docRef: rawRef.trim(),
    filename,
  };
}

/**
 * Extracts all CSS rules nested inside `@media print` across active stylesheets
 * so that Tailwind `print:*` classes and custom `@media print` rules apply 1:1
 * during direct A4 PDF generation.
 */
function collectPrintMediaCssRules(): string {
  const collected: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      // Cross-origin stylesheet; skip safely
      continue;
    }
    if (!rules) continue;

    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule && rule.media.mediaText.includes("print")) {
        for (const innerRule of Array.from(rule.cssRules)) {
          collected.push(innerRule.cssText);
        }
      }
    }
  }

  return collected.join("\n");
}

/**
 * Finds a clean horizontal break row near `targetY` on the canvas by scanning
 * upward for a predominantly white row so text lines are not cut in half.
 */
function findSmartPageBreakY(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  targetY: number,
  minY: number
): number {
  const searchHeight = Math.min(110, Math.max(0, targetY - minY));
  if (searchHeight <= 4) return targetY;

  const startY = targetY - searchHeight;
  try {
    const imgData = ctx.getImageData(0, startY, canvasWidth, searchHeight);
    const data = imgData.data;
    const stepX = 4; // sample every 4th pixel for speed

    for (let row = searchHeight - 1; row >= 0; row--) {
      let nonWhiteCount = 0;
      const rowOffset = row * canvasWidth * 4;

      for (let x = 0; x < canvasWidth; x += stepX) {
        const idx = rowOffset + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (a > 10 && (r < 245 || g < 245 || b < 245)) {
          nonWhiteCount++;
          if (nonWhiteCount > 3) break;
        }
      }

      if (nonWhiteCount === 0) {
        return startY + row;
      }
    }
  } catch {
    // Fallback to exact targetY if canvas read fails
  }

  return targetY;
}

export function PrintChoiceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [docMeta, setDocMeta] = useState<PrintableDocMeta>({
    title: "Official Document",
    docRef: "",
    filename: "Noxderma-Document.pdf",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.__nativePrint) {
      window.__nativePrint = window.print.bind(window);
    }

    const customPrintInterceptor = () => {
      setDocMeta(detectDocumentMeta());
      setIsOpen(true);
    };

    window.print = customPrintInterceptor;

    return () => {
      if (window.__nativePrint) {
        window.print = window.__nativePrint;
      }
    };
  }, []);

  const handleBrowserPrint = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => {
      if (window.__nativePrint) {
        window.__nativePrint();
      }
    }, 90);
  }, []);

  const handleDownloadA4Pdf = useCallback(async () => {
    if (isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    const htmlEl = document.documentElement;
    const wasDark = htmlEl.classList.contains("dark");
    const targetEl = resolvePrintableTarget();
    const prevTargetId = targetEl.getAttribute("data-pdf-capture-target");

    let tempStyleEl: HTMLStyleElement | null = null;

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Refresh metadata right before capture
      const currentMeta = detectDocumentMeta();
      targetEl.setAttribute("data-pdf-capture-target", "active");

      if (wasDark) {
        htmlEl.classList.remove("dark");
      }

      const printRulesCss = collectPrintMediaCssRules();
      tempStyleEl = document.createElement("style");
      tempStyleEl.id = "active-pdf-print-styles";
      tempStyleEl.textContent = `
        ${printRulesCss}
        [data-pdf-capture-target="active"] {
          display: block !important;
          width: 794px !important;
          min-width: 794px !important;
          max-width: 794px !important;
          height: auto !important;
          max-height: none !important;
          overflow: visible !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #000000 !important;
          padding: 20px !important;
          margin: 0 !important;
          box-sizing: border-box !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }
        [data-pdf-capture-target="active"] .no-print {
          display: none !important;
        }
        #print-choice-modal-backdrop {
          display: flex !important;
        }
      `;
      document.head.appendChild(tempStyleEl);

      // Allow browser layout to settle with A4 print rules applied
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      const canvas = await html2canvas(targetEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        windowWidth: 794,
        width: 794,
        ignoreElements: (el) => el.id === "print-choice-modal-backdrop",
      });

      // Standard A4 Portrait dimensions in mm: 210mm x 297mm
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const marginX = 9;
      const marginY = 9;
      const printableWidthMm = pageWidthMm - marginX * 2; // 192mm
      const printableHeightMm = pageHeightMm - marginY * 2; // 279mm

      const pxPerMm = canvas.width / printableWidthMm;
      const maxPageHeightPx = Math.floor(printableHeightMm * pxPerMm);
      const ctx = canvas.getContext("2d");

      let yOffsetPx = 0;
      let pageIndex = 0;

      while (yOffsetPx < canvas.height - 2) {
        if (pageIndex > 0) {
          pdf.addPage("a4", "portrait");
        }

        const remainingPx = canvas.height - yOffsetPx;
        let sliceHeightPx = Math.min(maxPageHeightPx, remainingPx);

        if (remainingPx > maxPageHeightPx && ctx) {
          const smartBreakY = findSmartPageBreakY(
            ctx,
            canvas.width,
            yOffsetPx + maxPageHeightPx,
            yOffsetPx + Math.floor(maxPageHeightPx * 0.65)
          );
          sliceHeightPx = Math.max(64, smartBreakY - yOffsetPx);
        }

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;
        const sliceCtx = sliceCanvas.getContext("2d");

        if (sliceCtx) {
          sliceCtx.fillStyle = "#ffffff";
          sliceCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          sliceCtx.drawImage(
            canvas,
            0,
            yOffsetPx,
            canvas.width,
            sliceHeightPx,
            0,
            0,
            canvas.width,
            sliceHeightPx
          );
        }

        const sliceImgData = sliceCanvas.toDataURL("image/jpeg", 0.96);
        const sliceHeightMm = sliceHeightPx / pxPerMm;

        pdf.addImage(
          sliceImgData,
          "JPEG",
          marginX,
          marginY,
          printableWidthMm,
          sliceHeightMm,
          undefined,
          "FAST"
        );

        yOffsetPx += sliceHeightPx;
        pageIndex++;
      }

      pdf.save(currentMeta.filename);
      setIsOpen(false);
    } catch (err) {
      console.error("Failed to generate A4 PDF:", err);
      alert("PDF generate karne mein masla aaya. Aap Print option bhi istemal kar sakte hain.");
    } finally {
      if (tempStyleEl && tempStyleEl.parentNode) {
        tempStyleEl.parentNode.removeChild(tempStyleEl);
      }
      if (prevTargetId === null) {
        targetEl.removeAttribute("data-pdf-capture-target");
      } else {
        targetEl.setAttribute("data-pdf-capture-target", prevTargetId);
      }
      if (wasDark) {
        htmlEl.classList.add("dark");
      }
      setIsGeneratingPdf(false);
    }
  }, [isGeneratingPdf]);

  if (!isOpen) return null;

  return (
    <div
      id="print-choice-modal-backdrop"
      className="fixed inset-0 !mt-0 z-[99999] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in no-print print:hidden"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-5 sm:p-6 space-y-4 animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">
                Print or Download A4 PDF
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {docMeta.title}
                {docMeta.docRef ? ` • ${docMeta.docRef}` : ""}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="space-y-3">
          {/* Option 1: Print with Printer Dialog */}
          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={handleBrowserPrint}
            className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 bg-slate-50/70 dark:bg-slate-800/50 hover:bg-teal-50/40 dark:hover:bg-teal-950/30 text-left transition-all flex items-center gap-3.5 group disabled:opacity-50 btn-interactive"
          >
            <div className="w-11 h-11 rounded-xl bg-slate-900 dark:bg-slate-700 group-hover:bg-teal-600 text-white flex items-center justify-center shrink-0 transition-colors shadow-sm">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-sm text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                Print Document (Choose Printer)
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Opens printer dialogue so you can select your printer &amp; print
              </p>
            </div>
          </button>

          {/* Option 2: Direct A4 PDF Download (Bypasses Print Dialog) */}
          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={handleDownloadA4Pdf}
            className="w-full p-4 rounded-xl border-2 border-teal-500/40 hover:border-teal-600 bg-teal-50/50 dark:bg-teal-950/30 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-left transition-all flex items-center gap-3.5 group disabled:opacity-70 btn-interactive"
          >
            <div className="w-11 h-11 rounded-xl bg-teal-600 group-hover:bg-teal-700 text-white flex items-center justify-center shrink-0 transition-colors shadow-sm shadow-teal-600/20">
              {isGeneratingPdf ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Download className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-sm text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                <span>
                  {isGeneratingPdf ? "Generating A4 PDF..." : "Download A4 PDF Directly"}
                </span>
              </div>
              <p className="text-xs text-teal-700/80 dark:text-teal-300/80 mt-0.5">
                {isGeneratingPdf
                  ? "Formatting A4 pages and downloading file..."
                  : "Instantly downloads A4 size PDF without opening print popup"}
              </p>
            </div>
          </button>
        </div>

        {/* Footer Info */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1 font-medium text-teal-600 dark:text-teal-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> Standard A4 Size (210mm &times; 297mm)
          </span>
          <button
            type="button"
            disabled={isGeneratingPdf}
            onClick={() => setIsOpen(false)}
            className="font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

