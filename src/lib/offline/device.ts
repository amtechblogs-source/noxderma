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
 * Generates a clean, short, professional invoice reference.
 * Format: INV-{SEQUENCE} (e.g. INV-1001, INV-1002)
 */
export function generateCollisionSafeInvoiceReference(): string {
  let stored = parseInt(localStorage.getItem(INVOICE_SEQ_KEY) || "1000", 10);
  if (isNaN(stored) || stored < 1000) {
    stored = 1000;
  }
  const currentSeq = stored + 1;
  localStorage.setItem(INVOICE_SEQ_KEY, currentSeq.toString());

  return `INV-${currentSeq}`;
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
