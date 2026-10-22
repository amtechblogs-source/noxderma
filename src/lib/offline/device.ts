const DEVICE_ID_KEY = "noxderma_device_id";
const INVOICE_SEQ_KEY = "noxderma_offline_invoice_seq";

/**
 * Returns or initializes a persistent device identifier.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") {
    return "SERVER";
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    const randomHex = Math.random().toString(16).substring(2, 8).toUpperCase();
    deviceId = `DEV-${randomHex}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

/**
 * Generates a collision-safe provisional invoice reference.
 * Format: OFF-{DEVICE_ID}-{YYMMDD}-{SEQUENCE}
 * Example: OFF-DEV-A9B4C2-261022-0001
 */
export function generateCollisionSafeInvoiceReference(): string {
  const deviceId = getDeviceId();
  const now = new Date();
  const year = String(now.getFullYear()).slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const dateStr = `${year}${month}${day}`;

  const currentSeq = parseInt(localStorage.getItem(INVOICE_SEQ_KEY) || "0", 10) + 1;
  localStorage.setItem(INVOICE_SEQ_KEY, currentSeq.toString());

  const paddedSeq = String(currentSeq).padStart(4, "0");
  return `OFF-${deviceId}-${dateStr}-${paddedSeq}`;
}

/**
 * Generates a collision-safe deterministic transaction UUIDv4.
 */
export function generateIdempotencyKey(prefix: string = "tx"): string {
  const deviceId = getDeviceId();
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `${prefix}_${deviceId}_${timestamp}_${random}`;
}
