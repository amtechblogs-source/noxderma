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

const A4_CSS_WIDTH_PX = 794; // Exact 210mm at 96 DPI (210 / 25.4 * 96 = 793.7px)

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
 * Extracts all CSS style rules nested inside `@media print` across active stylesheets
 * so that Tailwind `print:*` classes and custom print rules apply inside the isolated A4 iframe.
 */
function collectPrintMediaCssRules(): string {
  const collected: string[] = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList | undefined;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;

    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSMediaRule && rule.media.mediaText.includes("print")) {
        for (const innerRule of Array.from(rule.cssRules)) {
          // Skip @page rules inside inline style blocks
          if (innerRule.cssText.trim().startsWith("@page")) continue;
          collected.push(innerRule.cssText);
        }
      }
    }
  }

  return collected.join("\n");
}

/**
 * Finds a clean horizontal break row near `targetY` on the canvas by scanning
 * upward for a predominantly white row so text lines and table borders aren't sliced mid-character.
 */
function findSmartPageBreakY(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  targetY: number,
  minY: number
): number {
  const searchHeight = Math.min(140, Math.max(0, targetY - minY));
  if (searchHeight <= 6) return targetY;

  const startY = targetY - searchHeight;
  try {
    const imgData = ctx.getImageData(0, startY, canvasWidth, searchHeight);
    const data = imgData.data;
    const stepX = 4;

    for (let row = searchHeight - 1; row >= 0; row--) {
      let nonWhiteCount = 0;
      const rowOffset = row * canvasWidth * 4;

      for (let x = 0; x < canvasWidth; x += stepX) {
        const idx = rowOffset + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        if (a > 10 && (r < 246 || g < 246 || b < 246)) {
          nonWhiteCount++;
          if (nonWhiteCount > 2) break;
        }
      }

      if (nonWhiteCount === 0) {
        return startY + row;
      }
    }
  } catch {
    // Fallback to targetY if canvas read fails
  }

  return targetY;
}

/**
 * Checks whether a remaining vertical strip at the bottom of the canvas is completely blank/white,
 * preventing an empty trailing page from being appended to the PDF.
 */
function isCanvasStripBlank(
  ctx: CanvasRenderingContext2D | null,
  canvasWidth: number,
  startY: number,
  height: number
): boolean {
  if (!ctx || height <= 0) return true;
  if (height > 180) return false;

  try {
    const imgData = ctx.getImageData(0, startY, canvasWidth, height);
    const data = imgData.data;
    const step = 16; // sample pixels quickly
    for (let i = 0; i < data.length; i += step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a > 15 && (r < 242 || g < 242 || b < 242)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

async function waitForStylesheetsAndAssets(iframeDoc: Document): Promise<void> {
  const linkEls = Array.from(iframeDoc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
  await Promise.all(
    linkEls.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet) {
            resolve();
            return;
          }
          const timer = setTimeout(resolve, 2500);
          link.addEventListener(
            "load",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
          link.addEventListener(
            "error",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        })
    )
  );

  // Wait for web fonts inside the iframe (with safe timeout)
  if (iframeDoc.fonts && iframeDoc.fonts.ready) {
    await Promise.race([
      iframeDoc.fonts.ready.catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 1500)),
    ]);
  }

  // Wait for any embedded images (logos / medicine thumbnails) to settle
  const imgs = Array.from(iframeDoc.querySelectorAll<HTMLImageElement>("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            if (img.naturalWidth === 0 && img.getAttribute("src")) {
              img.style.display = "none";
            }
            resolve();
            return;
          }
          const timer = setTimeout(() => resolve(), 2200);
          img.addEventListener(
            "load",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
          img.addEventListener(
            "error",
            () => {
              clearTimeout(timer);
              img.style.display = "none";
              resolve();
            },
            { once: true }
          );
        })
    )
  );
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

    let offscreenIframe: HTMLIFrameElement | null = null;

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const currentMeta = detectDocumentMeta();
      const targetEl = resolvePrintableTarget();

      // Create an isolated offscreen 794px (A4-width) iframe so mobile viewports (360px)
      // never clip the left/right edges and sm:/md: desktop table breakpoints activate naturally!
      offscreenIframe = document.createElement("iframe");
      offscreenIframe.setAttribute("aria-hidden", "true");
      offscreenIframe.style.cssText = [
        "position: fixed",
        "left: -10000px",
        "top: 0",
        `width: ${A4_CSS_WIDTH_PX}px`,
        "height: 1123px",
        "border: 0",
        "margin: 0",
        "padding: 0",
        "opacity: 0",
        "pointer-events: none",
        "z-index: -9999",
        "background: #ffffff",
      ].join(";");
      document.body.appendChild(offscreenIframe);

      const iframeDoc = offscreenIframe.contentDocument;
      if (!iframeDoc) {
        throw new Error("Could not initialize PDF render frame");
      }

      iframeDoc.open();
      iframeDoc.write("<!DOCTYPE html><html lang=\"en\"><head></head><body></body></html>");
      iframeDoc.close();

      // Copy Next.js font CSS variable classes onto html & body (excluding dark mode)
      const htmlClasses = Array.from(document.documentElement.classList).filter(
        (c) => c !== "dark"
      );
      if (htmlClasses.length > 0) {
        iframeDoc.documentElement.className = htmlClasses.join(" ");
      }
      const bodyFontClasses = Array.from(document.body.classList).filter(
        (c) => c.startsWith("__") || c === "font-sans" || c === "antialiased"
      );
      iframeDoc.body.className = bodyFontClasses.join(" ");

      // Base href ensures relative logos / fonts resolve accurately
      const baseEl = iframeDoc.createElement("base");
      baseEl.href = `${window.location.origin}/`;
      iframeDoc.head.appendChild(baseEl);

      // Copy active stylesheets & inline style blocks into the isolated iframe
      const headNodes = Array.from(
        document.head.querySelectorAll<HTMLElement>('link[rel="stylesheet"], style')
      );
      for (const node of headNodes) {
        if (node.id === "active-pdf-print-styles") continue;
        iframeDoc.head.appendChild(node.cloneNode(true));
      }

      // Append unwrapped @media print CSS rules + html2canvas baseline & A4 layout fixes
      const printRulesCss = collectPrintMediaCssRules();
      const masterStyle = iframeDoc.createElement("style");
      masterStyle.id = "pdf-a4-master-override";
      masterStyle.textContent = `
        ${printRulesCss}

        /* CRITICAL FIX for html2canvas + Tailwind CSS Preflight text vertical shift ("text uper neechy"):
           html2canvas measures font baselines by inserting <img width="1" height="1"> next to a <span>.
           Tailwind Preflight sets img { display: block; vertical-align: middle; height: auto; },
           which pushes html2canvas's 1x1 probe onto a new line and shifts all PDF text downward! */
        img {
          display: inline-block;
        }
        img[width="1"][height="1"] {
          display: inline !important;
          width: 1px !important;
          height: 1px !important;
          max-width: none !important;
        }

        html, body {
          margin: 0 !important;
          padding: 0 !important;
          width: ${A4_CSS_WIDTH_PX}px !important;
          min-width: ${A4_CSS_WIDTH_PX}px !important;
          max-width: ${A4_CSS_WIDTH_PX}px !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #000000 !important;
          overflow: visible !important;
          -webkit-font-smoothing: antialiased;
        }

        #pdf-page-sheet {
          width: ${A4_CSS_WIDTH_PX}px !important;
          min-width: ${A4_CSS_WIDTH_PX}px !important;
          max-width: ${A4_CSS_WIDTH_PX}px !important;
          margin: 0 !important;
          padding: 4px 32px 12px 32px !important;
          box-sizing: border-box !important;
          background: #ffffff !important;
          background-color: #ffffff !important;
          color: #000000 !important;
          overflow: visible !important;
        }

        #pdf-page-sheet > [data-pdf-cloned-root="true"] {
          display: block !important;
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          overflow: visible !important;
          background: #ffffff !important;
          color: #000000 !important;
        }

        #pdf-page-sheet > .print-page[data-pdf-cloned-root="true"] {
          padding: 0 !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
        }

        #pdf-page-sheet > #printable-partner-voucher[data-pdf-cloned-root="true"],
        #pdf-page-sheet > #printable-salary-slip[data-pdf-cloned-root="true"] {
          padding: 24px !important;
          border: 1.5px solid #0f172a !important;
          border-radius: 12px !important;
          box-shadow: none !important;
          box-sizing: border-box !important;
        }

        .no-print,
        .print\\:hidden,
        nav,
        header,
        aside,
        footer,
        button:not(.print-allow) {
          display: none !important;
        }
        .print\\:block {
          display: block !important;
        }
        .print\\:flex {
          display: flex !important;
        }
        .print\\:inline-flex {
          display: inline-flex !important;
        }
        .print\\:grid {
          display: grid !important;
        }
        .print\\:inline {
          display: inline !important;
        }
        .print\\:inline-block {
          display: inline-block !important;
        }
        .print\\:table {
          display: table !important;
        }
        .overflow-x-auto {
          overflow: visible !important;
        }
      `;
      iframeDoc.head.appendChild(masterStyle);

      // Build A4 sheet wrapper and clone printable target inside
      const sheetEl = iframeDoc.createElement("div");
      sheetEl.id = "pdf-page-sheet";

      const clonedTarget = targetEl.cloneNode(true) as HTMLElement;
      clonedTarget.setAttribute("data-pdf-cloned-root", "true");
      sheetEl.appendChild(clonedTarget);
      iframeDoc.body.appendChild(sheetEl);

      // Wait for stylesheets, fonts, and images inside the offscreen A4 frame
      await waitForStylesheetsAndAssets(iframeDoc);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );

      const contentHeightPx = Math.max(sheetEl.scrollHeight, sheetEl.offsetHeight, 120);
      offscreenIframe.style.height = `${contentHeightPx + 40}px`;

      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const canvas = await html2canvas(sheetEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        width: A4_CSS_WIDTH_PX,
        windowWidth: A4_CSS_WIDTH_PX,
        height: contentHeightPx,
        windowHeight: contentHeightPx + 40,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        logging: false,
      });

      // Standard ISO A4 Portrait: 210mm x 297mm
      // Horizontal margins (8.5mm each side) are already baked cleanly into #pdf-page-sheet (32px padding on 794px)
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidthMm = 210;
      const pageHeightMm = 297;
      const marginY = 9; // 9mm top & bottom margin on every A4 page
      const printableWidthMm = pageWidthMm; // 210mm full sheet width
      const printableHeightMm = pageHeightMm - marginY * 2; // 279mm vertical content per page

      const pxPerMm = canvas.width / printableWidthMm;
      const maxPageHeightPx = Math.floor(printableHeightMm * pxPerMm);
      const ctx = canvas.getContext("2d");

      let yOffsetPx = 0;
      let pageIndex = 0;

      while (yOffsetPx < canvas.height - 4) {
        const remainingPx = canvas.height - yOffsetPx;

        // Avoid adding an extra blank page if only trailing bottom whitespace remains
        if (pageIndex > 0 && isCanvasStripBlank(ctx, canvas.width, yOffsetPx, remainingPx)) {
          break;
        }

        if (pageIndex > 0) {
          pdf.addPage("a4", "portrait");
        }

        let sliceHeightPx = Math.min(maxPageHeightPx, remainingPx);

        if (remainingPx > maxPageHeightPx && ctx) {
          const smartBreakY = findSmartPageBreakY(
            ctx,
            canvas.width,
            yOffsetPx + maxPageHeightPx,
            yOffsetPx + Math.floor(maxPageHeightPx * 0.68)
          );
          sliceHeightPx = Math.max(80, smartBreakY - yOffsetPx);
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
          0,
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
      if (offscreenIframe && offscreenIframe.parentNode) {
        offscreenIframe.parentNode.removeChild(offscreenIframe);
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
