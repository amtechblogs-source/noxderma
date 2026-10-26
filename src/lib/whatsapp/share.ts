/**
 * Robust WhatsApp Sharing Utility for Noxderma Pharma
 * 
 * WHY THIS UTILITY EXISTS:
 * 1. wa.me shortlinks perform an HTTP 302 redirect whose Location header corrupts
 *    4-byte UTF-8 emojis into '%EF%BF%BD' (Unicode replacement character ).
 * 2. On desktop WhatsApp Web, complex emojis with variation selectors (like 1️⃣, 🏷️)
 *    frequently fail URL decoding and render as question marks or boxes.
 * 3. By providing sanitized, clean markdown for WhatsApp URL params and simultaneously
 *    copying the original rich text (with full emojis) to the clipboard, users get
 *    flawless, question-mark-free messages every time.
 */

/**
 * Normalizes phone numbers for WhatsApp.
 * Handles Pakistani standard formats (e.g. 03001234567, 0324-7946676, +92 300 1234567)
 * as well as international numbers.
 */
export function normalizePhoneForWhatsApp(phone?: string | null): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith("0")) {
    cleaned = "92" + cleaned.slice(1);
  } else if (!cleaned.startsWith("92") && cleaned.length === 10) {
    cleaned = "92" + cleaned;
  }
  return cleaned;
}

/**
 * Checks if the current browser environment is on a mobile device.
 */
export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || ""
  );
}

/**
 * Converts emojis and compound keycaps to clean, safe symbols for WhatsApp URL parameters.
 * Eliminates all '' and '?' artifacts caused by URL encoding/decoding.
 */
export function sanitizeTextForWhatsAppUrl(text: string): string {
  if (!text) return "";
  return text
    // Convert numbered keycaps: 1️⃣ -> 1., 2️⃣ -> 2., etc.
    .replace(/([0-9])(?:[\uFE0E\uFE0F])?[\u20E3]/gu, (_m, d) => `${d}. `)
    .replace(/🔟/gu, "10. ")
    // Remove decorative stars/sparkles
    .replace(/🌟|⭐|✨/gu, "")
    // Convert common UI emojis into crisp markdown bullets/headers
    .replace(/🏷️|🏷/gu, "*")
    .replace(/💰/gu, "*")
    .replace(/📅|⏰/gu, "*")
    .replace(/🌐/gu, "*")
    .replace(/🛒|📦|💊|🏭|🔥|🎁|✅|📞|🌿|🌱|🧾|📄|💳/gu, "*")
    // Strip any remaining Unicode pictographs, surrogate pairs, and variation selectors
    .replace(/[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}]/gu, "")
    // Tidy formatting
    .replace(/^[ \t]+\*/gm, "*")
    .replace(/\*[ \t]+\*/g, "*")
    .replace(/^[ \t]+/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Builds a direct, redirect-free WhatsApp URL.
 * Routes directly to WhatsApp Web (web.whatsapp.com) on desktop and
 * official API (api.whatsapp.com) on mobile to completely bypass wa.me redirects.
 */
export function buildWhatsAppUrl(options: {
  phone?: string | null;
  text?: string;
  sanitize?: boolean;
}): string {
  const { phone, text = "", sanitize = true } = options;
  const cleanPhone = normalizePhoneForWhatsApp(phone);
  const processedText = sanitize ? sanitizeTextForWhatsAppUrl(text) : text;
  const encodedText = encodeURIComponent(processedText);

  const isMobile = isMobileDevice();
  // On desktop browsers, web.whatsapp.com opens directly without redirects
  // On mobile devices, api.whatsapp.com launches the native WhatsApp app smoothly
  const baseUrl = isMobile
    ? "https://api.whatsapp.com/send"
    : "https://web.whatsapp.com/send";

  const queryParts: string[] = [];
  if (cleanPhone) {
    queryParts.push(`phone=${cleanPhone}`);
  }
  if (encodedText) {
    queryParts.push(`text=${encodedText}`);
  }

  const queryStr = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
  return `${baseUrl}${queryStr}`;
}

/**
 * Opens WhatsApp safely from browser user interactions.
 * 1. Automatically copies the full rich text (WITH original emojis) to the clipboard.
 * 2. Opens WhatsApp Web / App with the clean, question-mark-free sanitized URL text.
 */
export async function openWhatsAppShare(options: {
  phone?: string | null;
  rawText: string;
  autoCopyFull?: boolean;
}): Promise<string> {
  const { phone, rawText, autoCopyFull = true } = options;
  const cleanPhone = normalizePhoneForWhatsApp(phone);

  if (autoCopyFull && typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(rawText);
    } catch (e) {
      console.warn("Clipboard auto-copy failed:", e);
    }
  }

  const url = buildWhatsAppUrl({
    phone: cleanPhone,
    text: rawText,
    sanitize: true,
  });

  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return url;
}
