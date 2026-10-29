export interface DetectedDeviceMetadata {
  deviceId: string;
  deviceModel: string;
  deviceCategory: "mobile" | "tablet" | "desktop";
  browserName: string;
}

export interface DevicePowerSnapshot {
  batteryLevel: number;
  isCharging: boolean;
  isDesktopAcPower: boolean;
  hasBatteryApi: boolean;
}

const DEVICE_INSTANCE_STORAGE_KEY = "noxderma_device_instance_id";

let cachedMetadataPromise: Promise<DetectedDeviceMetadata> | null = null;

/**
 * Generates and persists a unique per-browser / per-device ID so multiple phones or computers
 * logged into the same account appear as separate, independent sessions without overwriting each other.
 */
export function getOrCreateDeviceInstanceId(): string {
  if (typeof window === "undefined") return "dev_server";
  try {
    const existing = localStorage.getItem(DEVICE_INSTANCE_STORAGE_KEY);
    if (existing && existing.startsWith("dev_")) {
      return existing;
    }
    const generated = `dev_${Date.now().toString(36).slice(-5)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    localStorage.setItem(DEVICE_INSTANCE_STORAGE_KEY, generated);
    return generated;
  } catch {
    return "dev_fallback";
  }
}

export function buildSessionMonitorId(userId: string, deviceId?: string): string {
  const cleanDeviceId = deviceId || getOrCreateDeviceInstanceId();
  return `session_${userId}_${cleanDeviceId}`;
}

function detectBrowserLabel(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return "Samsung Browser";
  if (/EdgA|EdgiOS|Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/FxiOS|Firefox\//i.test(ua)) return "Firefox";
  if (/CriOS|Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Browser";
}

function formatAndroidBrandFromModel(rawModel: string): string {
  const m = rawModel.trim();
  if (!m) return "Android Smartphone";
  if (/^SM-/i.test(m)) return `Samsung Galaxy (${m})`;
  if (/Redmi|POCO|Mi /i.test(m)) return m.includes("Xiaomi") ? m : `Xiaomi ${m}`;
  if (/^(21|22|23|24|25)\d{2}[A-Z0-9]+$/i.test(m)) return `Xiaomi / Redmi (${m})`;
  if (/Infinix/i.test(m)) return m;
  if (/^X6\d{3}/i.test(m)) return `Infinix (${m})`;
  if (/TECNO/i.test(m)) return m;
  if (/^(CK|CH|CG|CL|KJ|KL|LI|LG|BG|BF)\d/i.test(m)) return `Tecno (${m})`;
  if (/^CPH\d{4}/i.test(m)) return `OPPO (${m})`;
  if (/^RMX\d{4}/i.test(m)) return `Realme (${m})`;
  if (/^V2\d{3}/i.test(m)) return `Vivo (${m})`;
  if (/Pixel/i.test(m)) return m.startsWith("Google") ? m : `Google ${m}`;
  if (/OnePlus/i.test(m)) return m;
  return m;
}

export async function detectDeviceMetadata(): Promise<DetectedDeviceMetadata> {
  if (cachedMetadataPromise) return cachedMetadataPromise;

  cachedMetadataPromise = (async () => {
    const deviceId = getOrCreateDeviceInstanceId();
    if (typeof navigator === "undefined") {
      return {
        deviceId,
        deviceModel: "Staff Device",
        deviceCategory: "mobile",
        browserName: "Browser",
      };
    }

    const ua = navigator.userAgent || "";
    const browserName = detectBrowserLabel(ua);
    const uaData = (navigator as any).userAgentData;

    let entropyModel = "";
    let entropyPlatform = "";
    if (uaData && typeof uaData.getHighEntropyValues === "function") {
      try {
        const high = await uaData.getHighEntropyValues(["model", "platform"]);
        entropyModel = String(high?.model || "").trim();
        entropyPlatform = String(high?.platform || "").trim();
      } catch {}
    }

    // Determine category: tablet vs mobile vs desktop
    const isIpad =
      /iPad/i.test(ua) ||
      (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
    const isIphone = /iPhone|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua) || /Android/i.test(entropyPlatform);
    const isAndroidTablet = isAndroid && !/Mobile/i.test(ua);

    let deviceCategory: "mobile" | "tablet" | "desktop" = "desktop";
    if (isIpad || isAndroidTablet) {
      deviceCategory = "tablet";
    } else if (isIphone || isAndroid || Boolean(uaData?.mobile)) {
      deviceCategory = "mobile";
    }

    // Build clear human-friendly device model name
    let deviceModel = "";
    if (entropyModel) {
      deviceModel = formatAndroidBrandFromModel(entropyModel);
    } else if (/SM-[A-Z0-9]+/i.test(ua)) {
      const match = ua.match(/SM-[A-Z0-9]+/i);
      deviceModel = `Samsung Galaxy (${match ? match[0] : "Android"})`;
    } else if (/Redmi[^;)]*/i.test(ua)) {
      const match = ua.match(/Redmi[^;)]*/i);
      deviceModel = match ? `Xiaomi ${match[0].trim()}` : "Xiaomi Redmi Phone";
    } else if (/POCO[^;)]*/i.test(ua)) {
      const match = ua.match(/POCO[^;)]*/i);
      deviceModel = match ? match[0].trim() : "POCO Smartphone";
    } else if (/Infinix[^;)]*/i.test(ua)) {
      const match = ua.match(/Infinix[^;)]*/i);
      deviceModel = match ? match[0].trim() : "Infinix Smartphone";
    } else if (/TECNO[^;)]*/i.test(ua)) {
      const match = ua.match(/TECNO[^;)]*/i);
      deviceModel = match ? match[0].trim() : "Tecno Smartphone";
    } else if (/vivo[^;)]*/i.test(ua)) {
      const match = ua.match(/vivo[^;)]*/i);
      deviceModel = match ? match[0].trim() : "Vivo Smartphone";
    } else if (/CPH\d{4}|OPPO/i.test(ua)) {
      const match = ua.match(/CPH\d{4}/i);
      deviceModel = match ? `OPPO (${match[0].toUpperCase()})` : "OPPO Smartphone";
    } else if (/RMX\d{4}|Realme/i.test(ua)) {
      const match = ua.match(/RMX\d{4}/i);
      deviceModel = match ? `Realme (${match[0].toUpperCase()})` : "Realme Smartphone";
    } else if (/Pixel[^;)]*/i.test(ua)) {
      const match = ua.match(/Pixel[^;)]*/i);
      deviceModel = match ? `Google ${match[0].trim()}` : "Google Pixel";
    } else if (isIphone) {
      deviceModel = `Apple iPhone (${browserName})`;
    } else if (isIpad) {
      deviceModel = `Apple iPad (${browserName})`;
    } else if (isAndroid) {
      // Try extracting generic Build/... model token from Android UA
      const buildMatch = ua.match(/Android\s[\d.]+;\s*([^;)]+?)(?:\s+Build\/|\))/i);
      const token = buildMatch?.[1]?.trim();
      if (token && token !== "K" && token.length >= 2) {
        deviceModel = formatAndroidBrandFromModel(token);
      } else {
        deviceModel = `Android Phone (${browserName})`;
      }
    } else if (/Windows/i.test(ua)) {
      deviceModel = `Windows Computer (${browserName})`;
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      deviceModel = `Mac Computer (${browserName})`;
    } else if (/Linux/i.test(ua)) {
      deviceModel = `Linux Computer (${browserName})`;
    } else {
      deviceModel = `Device (${browserName})`;
    }

    return {
      deviceId,
      deviceModel,
      deviceCategory,
      browserName,
    };
  })();

  return cachedMetadataPromise;
}

export async function readDevicePowerState(
  deviceCategory: "mobile" | "tablet" | "desktop"
): Promise<DevicePowerSnapshot> {
  if (typeof navigator === "undefined" || !("getBattery" in navigator)) {
    return {
      batteryLevel: 100,
      isCharging: deviceCategory === "desktop",
      isDesktopAcPower: deviceCategory === "desktop",
      hasBatteryApi: false,
    };
  }

  try {
    const bat = await (navigator as any).getBattery();
    const pct = Math.min(100, Math.max(0, Math.round((bat.level ?? 1) * 100)));
    const charging = Boolean(bat.charging);

    // Desktop PCs on wall power report level=1, charging=true, chargingTime=0, dischargingTime=Infinity
    const looksLikeDesktopWallPower =
      deviceCategory === "desktop" &&
      pct === 100 &&
      charging &&
      bat.chargingTime === 0 &&
      !Number.isFinite(bat.dischargingTime);

    return {
      batteryLevel: pct,
      isCharging: charging,
      isDesktopAcPower: looksLikeDesktopWallPower,
      hasBatteryApi: true,
    };
  } catch {
    return {
      batteryLevel: 100,
      isCharging: deviceCategory === "desktop",
      isDesktopAcPower: deviceCategory === "desktop",
      hasBatteryApi: false,
    };
  }
}
