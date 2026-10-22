/**
 * Format monetary amount in Pakistani Rupees (PKR)
 * Prevents floating-point errors by treating values with standard precision rounding.
 */
export function formatPKR(amount: number, showSymbol: boolean = true): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return showSymbol ? "₨ 0" : "0";
  }

  const rounded = Math.round((amount + Number.EPSILON) * 100) / 100;
  const formattedNumber = new Intl.NumberFormat("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(rounded);

  return showSymbol ? `₨ ${formattedNumber}` : formattedNumber;
}

/**
 * Format date string with Asia/Karachi timezone awareness.
 */
export function formatKarachiDate(dateInput: string | Date | number, includeTime: boolean = false): string {
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return "—";

    const options: Intl.DateTimeFormatOptions = {
      timeZone: "Asia/Karachi",
      day: "2-digit",
      month: "short",
      year: "numeric",
      ...(includeTime
        ? {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }
        : {}),
    };

    return new Intl.DateTimeFormat("en-PK", options).format(d);
  } catch {
    return String(dateInput);
  }
}

/**
 * Standard integer / quantity formatter.
 */
export function formatNumber(qty: number): string {
  if (isNaN(qty) || qty === null || qty === undefined) return "0";
  return new Intl.NumberFormat("en-PK").format(qty);
}
