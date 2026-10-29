export type StaffLiveState = "moving" | "inside_customer" | "idle" | "offline";

export type GpsSignalStrength = "High Accuracy Active" | "Moderate Signal" | "Weak Signal" | "GPS Disabled";

export interface RouteStopPoint {
  id: string;
  sequence: number;
  time: string; // e.g. "09:00 AM"
  isoTimestamp?: string;
  roadOrArea: string;
  shopName?: string;
  customerType?: "pharmacy" | "clinic" | "distributor" | "checkpoint";
  lat: number;
  lng: number;
  x: number; // Normalized 0-100 map coordinate X
  y: number; // Normalized 0-100 map coordinate Y
  dwellMinutes: number; // How long they stayed at this stop
  speedKmh: number;
  activityType: "shift_start" | "transit" | "pharmacy_visit" | "clinic_visit" | "order_booked" | "cash_recovery" | "idle_stop" | "shift_end";
  notes: string;
  bookingAmountPkr?: number;
  recoveryAmountPkr?: number;
}

export interface BeatShopItem {
  id: string;
  shopName: string;
  contactPerson?: string;
  area: string;
  category: "pharmacy" | "clinic" | "distributor";
  visited: boolean;
  visitedAt?: string;
  orderBookedPkr?: number;
  recoveryCollectedPkr?: number;
  lat: number;
  lng: number;
  x: number; // 0-100 map coordinate
  y: number; // 0-100 map coordinate
}

export interface DailyBeatPlan {
  id: string;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  beatTitle: string; // e.g. "Tariq Road & Bahadurabad — 14 Pharmacies"
  territory: string;
  stops: BeatShopItem[];
}

export interface LiveMapTransactionPin {
  id: string;
  type: "booking" | "recovery";
  staffId: string;
  staffName: string;
  shopName: string;
  area: string;
  amountPkr: number;
  referenceNo?: string;
  timestamp: string;
  timeLabel: string;
  lat: number;
  lng: number;
  x: number;
  y: number;
}

export interface GeoVerifiedPhoto {
  id: string;
  staffId: string;
  staffName: string;
  shopName: string;
  category: "shelf_display" | "prescription_desk" | "shop_check_in";
  caption: string;
  watermarkedDataUrl: string;
  capturedAt: string;
  capturedTimeLabel: string;
  lat: number;
  lng: number;
  areaName: string;
  x: number;
  y: number;
  batteryAtCapture: number;
  auditStatus: "verified" | "pending_review" | "flagged";
}

export interface StaffMonitoringProfile {
  id: string;
  userId?: string;
  userEmail?: string;
  accountRole?: string;
  deviceId?: string;
  deviceCategory?: "mobile" | "tablet" | "desktop";
  browserName?: string;
  isDesktopAcPower?: boolean;
  hasBatteryApi?: boolean;
  hasRealGpsFix?: boolean;
  lastUpdatedIso?: string;
  name: string;
  roleTitle: "Order Booker" | "Medical Rep" | "Recovery Officer" | "Field Supervisor" | "Owner" | "Accountant" | "Store Staff";
  phone: string;
  vehicleType: "bike" | "car";
  territory: string;
  liveState: StaffLiveState;
  statusHeadline: string; // e.g., "Speed: 28 km/h on Shahrah-e-Faisal" or "Meeting with Dr. Ayesha — 12 mins elapsed"
  currentSpeedKmh: number;
  currentRoadOrLocation: string;
  activeCheckInShop?: string;
  activeCheckInContact?: string;
  checkInElapsedMinutes?: number;
  idleMinutes?: number;
  shiftStartTime: string;
  shiftEndTime?: string;
  // Battery & Device Health
  batteryLevel: number; // 0-100
  isCharging: boolean;
  gpsAccuracyMeters: number;
  gpsSignal: GpsSignalStrength;
  lastPingTime: string;
  deviceModel: string;
  // Current map coordinates
  lat: number;
  lng: number;
  x: number;
  y: number;
  // Day route breadcrumbs
  dayRoute: RouteStopPoint[];
}

