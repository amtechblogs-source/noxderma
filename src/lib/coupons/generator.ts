import type { CouponCode, CouponDeveloperExportItem } from "@/types";

/**
 * Generate a clean, branded random coupon code.
 * Example: NOX-VIP15-8M2K or DERMA-20-4P9Z
 */
export function generateRandomCouponCode(
  prefix: string = "NOX",
  discountPercent: number = 15
): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluding confusing chars like 0, O, 1, I
  let randomPart = "";
  for (let i = 0; i < 4; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const cleanPrefix = (prefix || "NOX").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `${cleanPrefix}-${discountPercent}-${randomPart}`;
}

export { normalizePhoneForWhatsApp } from "@/lib/whatsapp/share";

export type WhatsAppMessageTone = "roman_urdu" | "formal_english" | "urdu_nastaliq";

interface WhatsAppCouponParams {
  customerName: string;
  businessName?: string;
  couponCode: string;
  discountPercent: number;
  validUntil: string;
  minOrderPkr?: number;
  websiteUrl?: string;
  brandName?: string;
  tone?: WhatsAppMessageTone;
}

/**
 * Generate high-converting, professional WhatsApp notification text.
 */
export function buildWhatsAppCouponMessage({
  customerName,
  businessName,
  couponCode,
  discountPercent,
  validUntil,
  minOrderPkr = 0,
  websiteUrl = "https://noxderma.com",
  brandName = "Noxderma",
  tone = "roman_urdu",
}: WhatsAppCouponParams): string {
  const cleanBiz = (businessName || "").trim();
  const cleanCust = (customerName || "").trim();
  const hasDistinctNames =
    Boolean(cleanBiz && cleanCust) &&
    cleanBiz.toLowerCase() !== cleanCust.toLowerCase();

  const recipient = hasDistinctNames
    ? `${cleanBiz} (${cleanCust})`
    : cleanBiz || cleanCust || "Valued Partner";
  const cleanUrl = websiteUrl?.startsWith("http") ? websiteUrl : `https://${websiteUrl || "noxderma.com"}`;

  const isNoExpiry = !validUntil || validUntil === "no_expiry" || validUntil.startsWith("9999");
  const formattedDate = isNoExpiry
    ? "Lifetime (No Expiry)"
    : new Date(validUntil).toLocaleDateString("en-PK", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

  if (tone === "formal_english") {
    return (
      `🌟 *EXCLUSIVE PRIVILEGE DISCOUNT FROM ${brandName.toUpperCase()}* 🌟\n\n` +
      `Dear *${recipient}*,\n\n` +
      `We value your partnership with ${brandName}. As a gesture of our appreciation, we have activated an exclusive promotional coupon code for your account.\n\n` +
      `🏷️ *Your Coupon Code:* *${couponCode}*\n` +
      `💰 *Discount Offer:* *${discountPercent}% FLAT OFF* on all dermatological products & medicines\n` +
      `📅 *Validity:* ${isNoExpiry ? "*Lifetime (No Expiry / Always Valid)*" : `Valid until *${formattedDate}*`}\n` +
      `${minOrderPkr > 0 ? `🛒 *Min Order Value:* Rs. ${minOrderPkr.toLocaleString()}\n` : ""}` +
      `🌐 *Redeem Online:* ${cleanUrl}\n\n` +
      `*How to Redeem Your Discount:*\n` +
      `1️⃣ Visit *${cleanUrl}*\n` +
      `2️⃣ Select your required medicines, serums or skincare packs\n` +
      `3️⃣ Enter coupon code *${couponCode}* at checkout\n` +
      `4️⃣ Enjoy instant *${discountPercent}% discount* with fast delivery!\n\n` +
      `For direct booking or inquiry, feel free to reply to this chat.\n\n` +
      `Best Regards,\n` +
      `*${brandName} Team* 🌿\n` +
      `${cleanUrl}`
    );
  }

  if (tone === "urdu_nastaliq") {
    return (
      `🌟 *نوکس ڈرما کی طرف سے خصوصی ڈسکاؤنٹ واؤچر* 🌟\n\n` +
      `محترم *${recipient}* صاحب،\n` +
      `السلام علیکم!\n\n` +
      `ہمیں خوشی ہے کہ آپ ہمارے قابلِ قدر پارٹنر ہیں۔ آپ کے لیے خصوصی ڈسکاؤنٹ کوپن کوڈ جاری کر دیا گیا ہے:\n\n` +
      `🏷️ *کوپن کوڈ:* *${couponCode}*\n` +
      `💰 *ڈسکاؤنٹ:* *${discountPercent}% فلیٹ رعایت*\n` +
      `📅 *آخری تاریخ:* *${isNoExpiry ? "بغیر کسی میعاد کے (ہمیشہ کے لیے قابلِ قبول)" : formattedDate}*\n` +
      `🌐 *ویب سائٹ:* ${cleanUrl}\n\n` +
      `*طریقہ کار:*\n` +
      `1️⃣ ہماری ویب سائٹ *${cleanUrl}* اوپن کریں\n` +
      `2️⃣ اپنی مطلوبہ میڈیسن اور سکن کیئر پراڈکٹس کارٹ میں شامل کریں\n` +
      `3️⃣ چیک آؤٹ پر کوپن کوڈ *${couponCode}* درج کریں\n` +
      `4️⃣ فوری *${discountPercent}% ڈسکاؤنٹ* حاصل کریں!\n\n` +
      `شکریہ!\n` +
      `*${brandName} ٹیم*`
    );
  }

  // Default: Professional Roman Urdu + English (Most popular & effective for Pakistan Market)
  return (
    `🌟 *SPECIAL PRIVILEGE DISCOUNT FROM ${brandName.toUpperCase()}* 🌟\n\n` +
    `Mohtaram *${recipient}*,\n` +
    `Assalam-o-Alaikum!\n\n` +
    `Aap ki regular partnership k shukriya k tor par, ${brandName} ne aap k liye ek exclusive discount coupon code activate kar diya hai:\n\n` +
    `🏷️ *Aapka Coupon Code:* *${couponCode}*\n` +
    `💰 *Discount:* *${discountPercent}% FLAT OFF* (Tamam Derma Products & Medicines par)\n` +
    `📅 *Last Date (Validity):* *${isNoExpiry ? "Hamesha k liye (No Expiry / Lifetime)" : formattedDate}*\n` +
    `${minOrderPkr > 0 ? `🛒 *Minimum Order:* Rs. ${minOrderPkr.toLocaleString()}\n` : ""}` +
    `🌐 *Online Order Website:* ${cleanUrl}\n\n` +
    `*Discount Hasil Karne Ka Asan Tareeqa:*\n` +
    `1️⃣ Hamari website *${cleanUrl}* open karein\n` +
    `2️⃣ Apni zaroorat k serums, creams ya medicines cart mein add karein\n` +
    `3️⃣ Checkout screen par coupon code *${couponCode}* enter karein\n` +
    `4️⃣ Foran *${discountPercent}% Discount* apply ho jaye ga!\n\n` +
    `Aap is code ko direct hamare booking staff ya is WhatsApp number par bhi bata kar discount avail kar saktay hain.\n\n` +
    `Shukriya!\n` +
    `*${brandName} Customer Care* 🌿\n` +
    `${cleanUrl}`
  );
}

/**
 * Formats all active coupons into clean developer-ready JSON.
 */
export function exportCouponsForWebDevelopers(coupons: CouponCode[]): CouponDeveloperExportItem[] {
  return coupons.map((c) => ({
    code: c.code,
    discountPercentage: c.discountPercent,
    assignedTo: c.customerName || "All Customers",
    customerPhone: c.customerPhone || undefined,
    minOrderAmountPkr: c.minOrderPkr || 0,
    validUntil: c.validUntil,
    status: c.status,
    websiteRedeemUrl: c.websiteUrl || "https://noxderma.com",
  }));
}
