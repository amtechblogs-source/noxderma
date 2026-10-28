import type {
  StaffMonitoringProfile,
  DailyBeatPlan,
  LiveMapTransactionPin,
  GeoVerifiedPhoto,
} from "@/types";

export const DEFAULT_STAFF_MONITORS: StaffMonitoringProfile[] = [
  {
    id: "staff_ali",
    name: "Ali Raza",
    roleTitle: "Order Booker",
    phone: "0300-2418920",
    vehicleType: "bike",
    territory: "Tariq Road, Bahadurabad & Shahrah-e-Faisal",
    liveState: "moving",
    statusHeadline: "Speed: 28 km/h on Shahrah-e-Faisal",
    currentSpeedKmh: 28,
    currentRoadOrLocation: "Shahrah-e-Faisal (Heading to Bahadurabad Chowrangi)",
    shiftStartTime: "09:00 AM",
    batteryLevel: 76,
    isCharging: false,
    gpsAccuracyMeters: 4,
    gpsSignal: "High Accuracy Active",
    lastPingTime: "Just now (Live)",
    deviceModel: "Samsung Galaxy A54 5G",
    lat: 24.8689,
    lng: 67.0612,
    x: 52,
    y: 54,
    dayRoute: [
      {
        id: "stop_ali_1",
        sequence: 1,
        time: "09:00 AM",
        roadOrArea: "Noxderma Head Office Depot (PECHS Block 6)",
        shopName: "Morning Shift Attendance & Sample Bag Check-Out",
        customerType: "checkpoint",
        lat: 24.8607,
        lng: 67.0581,
        x: 34,
        y: 72,
        dwellMinutes: 15,
        speedKmh: 0,
        activityType: "shift_start",
        notes: "Clocked in at 09:00 AM sharp. Loaded promotional literature & booking pad.",
      },
      {
        id: "stop_ali_2",
        sequence: 2,
        time: "09:22 AM",
        roadOrArea: "Shahrah-e-Faisal Service Road (Nursery)",
        shopName: "HealthFirst Medical & General Store",
        customerType: "pharmacy",
        lat: 24.8632,
        lng: 67.0598,
        x: 41,
        y: 65,
        dwellMinutes: 18,
        speedKmh: 26,
        activityType: "order_booked",
        notes: "Checked stock of NoxDerm Cream & NoxWash. Punched refill order.",
        bookingAmountPkr: 18500,
      },
      {
        id: "stop_ali_3",
        sequence: 3,
        time: "09:50 AM",
        roadOrArea: "Shahrah-e-Faisal → Tariq Road Link",
        shopName: "K-Electric Medical Store",
        customerType: "pharmacy",
        lat: 24.8689,
        lng: 67.0612,
        x: 52,
        y: 54,
        dwellMinutes: 24,
        speedKmh: 28,
        activityType: "order_booked",
        notes: "Major wholesale & retail order booked for Derma & Antibiotic range.",
        bookingAmountPkr: 42000,
      },
      {
        id: "stop_ali_4",
        sequence: 4,
        time: "10:25 AM",
        roadOrArea: "Main Tariq Road (Near Dolmen Mall)",
        shopName: "Time Medicos & Skin Pharmacy",
        customerType: "pharmacy",
        lat: 24.8724,
        lng: 67.0619,
        x: 56,
        y: 44,
        dwellMinutes: 20,
        speedKmh: 24,
        activityType: "pharmacy_visit",
        notes: "Audited shelf display & verified near-expiry batches. Snap uploaded.",
        bookingAmountPkr: 27400,
      },
      {
        id: "stop_ali_5",
        sequence: 5,
        time: "11:02 AM",
        roadOrArea: "Khalid Bin Waleed Road",
        shopName: "MedPlus Pharmacy",
        customerType: "pharmacy",
        lat: 24.8758,
        lng: 67.0635,
        x: 61,
        y: 35,
        dwellMinutes: 14,
        speedKmh: 31,
        activityType: "cash_recovery",
        notes: "Collected previous invoice balance + booked 12 packs of NoxAcne Gel.",
        bookingAmountPkr: 14200,
        recoveryAmountPkr: 22000,
      },
      {
        id: "stop_ali_6",
        sequence: 6,
        time: "11:30 AM",
        roadOrArea: "Bahadurabad Alamgir Road",
        shopName: "Al-Khair Medical Centre Pharmacy",
        customerType: "pharmacy",
        lat: 24.8812,
        lng: 67.0674,
        x: 69,
        y: 27,
        dwellMinutes: 22,
        speedKmh: 28,
        activityType: "order_booked",
        notes: "Discussed 10+2 bonus scheme with store manager. Order confirmed.",
        bookingAmountPkr: 35800,
      },
      {
        id: "stop_ali_7",
        sequence: 7,
        time: "12:05 PM",
        roadOrArea: "Bahadurabad Char Minar Chowrangi",
        shopName: "D.Watson Chemist & Derma Bar",
        customerType: "pharmacy",
        lat: 24.8845,
        lng: 67.0715,
        x: 78,
        y: 22,
        dwellMinutes: 19,
        speedKmh: 25,
        activityType: "shift_end",
        notes: "Current active route leg — heading toward remaining 4 beat pharmacies.",
        bookingAmountPkr: 29500,
      },
    ],
  },
  {
    id: "staff_bilal",
    name: "Bilal Ahmed",
    roleTitle: "Medical Rep",
    phone: "0321-8934112",
    vehicleType: "bike",
    territory: "Bahadurabad & Gulshan-e-Iqbal Clinics",
    liveState: "inside_customer",
    statusHeadline: "Meeting with Dr. Ayesha — 12 mins elapsed",
    currentSpeedKmh: 0,
    currentRoadOrLocation: "DermaCare Specialist Clinic, Bahadurabad",
    activeCheckInShop: "DermaCare Specialist Clinic",
    activeCheckInContact: "Dr. Ayesha Khan (Consultant Dermatologist)",
    checkInElapsedMinutes: 12,
    shiftStartTime: "09:15 AM",
    batteryLevel: 88,
    isCharging: true,
    gpsAccuracyMeters: 5,
    gpsSignal: "High Accuracy Active",
    lastPingTime: "10 sec ago",
    deviceModel: "Redmi Note 13 Pro",
    lat: 24.8825,
    lng: 67.0692,
    x: 73,
    y: 25,
    dayRoute: [
      {
        id: "stop_bilal_1",
        sequence: 1,
        time: "09:15 AM",
        roadOrArea: "Noxderma Head Office Depot (PECHS)",
        shopName: "Morning Detailing Briefing & Samples Pickup",
        customerType: "checkpoint",
        lat: 24.8607,
        lng: 67.0581,
        x: 34,
        y: 72,
        dwellMinutes: 20,
        speedKmh: 0,
        activityType: "shift_start",
        notes: "Collected clinical trial literature and 24 physician samples.",
      },
      {
        id: "stop_bilal_2",
        sequence: 2,
        time: "09:55 AM",
        roadOrArea: "Jail Chowrangi Medical Complex",
        shopName: "Skin & Laser Aesthetics Clinic (Dr. Salman)",
        customerType: "clinic",
        lat: 24.8781,
        lng: 67.0628,
        x: 63,
        y: 31,
        dwellMinutes: 28,
        speedKmh: 30,
        activityType: "clinic_visit",
        notes: "Detailed NoxRetinol Serum & SPF 60 Gel. Handed over 4 clinical samples.",
      },
      {
        id: "stop_bilal_3",
        sequence: 3,
        time: "10:40 AM",
        roadOrArea: "Bahadurabad Commercial Area",
        shopName: "City Care Hospital OPD Pharmacy",
        customerType: "pharmacy",
        lat: 24.8805,
        lng: 67.0665,
        x: 68,
        y: 28,
        dwellMinutes: 16,
        speedKmh: 22,
        activityType: "order_booked",
        notes: "Ensured stock availability near OPD before doctor detailing.",
        bookingAmountPkr: 31000,
      },
      {
        id: "stop_bilal_4",
        sequence: 4,
        time: "11:15 AM",
        roadOrArea: "DermaCare Specialist Clinic, Bahadurabad",
        shopName: "Meeting with Dr. Ayesha — 12 mins elapsed",
        customerType: "clinic",
        lat: 24.8825,
        lng: 67.0692,
        x: 73,
        y: 25,
        dwellMinutes: 12,
        speedKmh: 0,
        activityType: "clinic_visit",
        notes: "Currently checked in — presenting clinical efficacy data & prescription desk audit.",
      },
    ],
  },
  {
    id: "staff_kamran",
    name: "Kamran Siddiqui",
    roleTitle: "Recovery Officer",
    phone: "0333-3109844",
    vehicleType: "bike",
    territory: "Saddar, Empress Market & M.A. Jinnah Road",
    liveState: "idle",
    statusHeadline: "Stopped for 29 mins without an active check-in",
    currentSpeedKmh: 0,
    currentRoadOrLocation: "Near Nursery Commercial Tea Stall (Shahrah-e-Faisal)",
    idleMinutes: 29,
    shiftStartTime: "09:30 AM",
    batteryLevel: 34,
    isCharging: false,
    gpsAccuracyMeters: 14,
    gpsSignal: "Moderate Signal",
    lastPingTime: "1 min ago",
    deviceModel: "Infinix Note 30",
    lat: 24.8618,
    lng: 67.0545,
    x: 45,
    y: 68,
    dayRoute: [
      {
        id: "stop_kamran_1",
        sequence: 1,
        time: "09:30 AM",
        roadOrArea: "Saddar Lucky Star",
        shopName: "Al-Shifa Pharmacy & Surgical",
        customerType: "pharmacy",
        lat: 24.8562,
        lng: 67.0312,
        x: 22,
        y: 64,
        dwellMinutes: 15,
        speedKmh: 24,
        activityType: "cash_recovery",
        notes: "Collected overdue invoice cash payment and issued receipt.",
        recoveryAmountPkr: 15000,
      },
      {
        id: "stop_kamran_2",
        sequence: 2,
        time: "10:15 AM",
        roadOrArea: "M.A. Jinnah Road Wholesale Market",
        shopName: "Karachi Medico Traders",
        customerType: "distributor",
        lat: 24.8588,
        lng: 67.0419,
        x: 31,
        y: 66,
        dwellMinutes: 22,
        speedKmh: 20,
        activityType: "cash_recovery",
        notes: "Collected cross-cheque + Rs. 28,500 cash against Ledger Khata.",
        recoveryAmountPkr: 28500,
      },
      {
        id: "stop_kamran_3",
        sequence: 3,
        time: "11:05 AM",
        roadOrArea: "Near Nursery Commercial Area",
        shopName: "Unscheduled Stop (No Active Customer Check-In)",
        customerType: "checkpoint",
        lat: 24.8618,
        lng: 67.0545,
        x: 45,
        y: 68,
        dwellMinutes: 29,
        speedKmh: 0,
        activityType: "idle_stop",
        notes: "⚠️ Alert: Stationary for 29 minutes (>25 min threshold) without any pharmacy check-in.",
      },
    ],
  },
  {
    id: "staff_usman",
    name: "Usman Tariq",
    roleTitle: "Order Booker",
    phone: "0312-9981203",
    vehicleType: "car",
    territory: "Clifton & DHA Phase 2-6",
    liveState: "offline",
    statusHeadline: "Clocked out for the day (Shift completed)",
    currentSpeedKmh: 0,
    currentRoadOrLocation: "Clifton Block 5 (Ziauddin Hospital Road)",
    shiftStartTime: "08:30 AM",
    shiftEndTime: "05:30 PM",
    batteryLevel: 19,
    isCharging: false,
    gpsAccuracyMeters: 9,
    gpsSignal: "Weak Signal",
    lastPingTime: "Clocked out",
    deviceModel: "Vivo Y100",
    lat: 24.8185,
    lng: 67.0325,
    x: 26,
    y: 84,
    dayRoute: [
      {
        id: "stop_usman_1",
        sequence: 1,
        time: "08:30 AM",
        roadOrArea: "Clifton Teen Talwar",
        shopName: "Super Medicos Clifton",
        customerType: "pharmacy",
        lat: 24.8315,
        lng: 67.0342,
        x: 29,
        y: 79,
        dwellMinutes: 18,
        speedKmh: 34,
        activityType: "order_booked",
        notes: "Morning shift start & first pharmacy booking.",
        bookingAmountPkr: 21500,
      },
      {
        id: "stop_usman_2",
        sequence: 2,
        time: "10:10 AM",
        roadOrArea: "Clifton Block 5 (Ziauddin Road)",
        shopName: "South City Aesthetics & Pharmacy",
        customerType: "pharmacy",
        lat: 24.8185,
        lng: 67.0325,
        x: 26,
        y: 84,
        dwellMinutes: 25,
        speedKmh: 0,
        activityType: "shift_end",
        notes: "Completed morning beat and clocked out.",
        bookingAmountPkr: 34000,
      },
    ],
  },
];

export const DEFAULT_BEAT_PLANS: DailyBeatPlan[] = [
  {
    id: "beat_ali_today",
    staffId: "staff_ali",
    staffName: "Ali Raza",
    date: new Date().toISOString().split("T")[0],
    beatTitle: "Tariq Road & Bahadurabad — 14 Pharmacies",
    territory: "Tariq Road & Bahadurabad",
    stops: [
      {
        id: "bs_1",
        shopName: "HealthFirst Medical Store",
        contactPerson: "Haji Rafiq",
        area: "Shahrah-e-Faisal (Nursery)",
        category: "pharmacy",
        visited: true,
        visitedAt: "09:22 AM",
        orderBookedPkr: 18500,
        lat: 24.8632,
        lng: 67.0598,
        x: 41,
        y: 65,
      },
      {
        id: "bs_2",
        shopName: "K-Electric Medical Store",
        contactPerson: "Zubair Bhai",
        area: "Shahrah-e-Faisal Link",
        category: "pharmacy",
        visited: true,
        visitedAt: "09:50 AM",
        orderBookedPkr: 42000,
        lat: 24.8689,
        lng: 67.0612,
        x: 52,
        y: 54,
      },
      {
        id: "bs_3",
        shopName: "Time Medicos & Skin Pharmacy",
        contactPerson: "Imran Sheikh",
        area: "Main Tariq Road",
        category: "pharmacy",
        visited: true,
        visitedAt: "10:25 AM",
        orderBookedPkr: 27400,
        lat: 24.8724,
        lng: 67.0619,
        x: 56,
        y: 44,
      },
      {
        id: "bs_4",
        shopName: "Liberty Chemist Tariq Road",
        contactPerson: "Adnan Malik",
        area: "Tariq Road Block 2",
        category: "pharmacy",
        visited: true,
        visitedAt: "10:44 AM",
        orderBookedPkr: 11800,
        lat: 24.8740,
        lng: 67.0602,
        x: 50,
        y: 41,
      },
      {
        id: "bs_5",
        shopName: "MedPlus Pharmacy",
        contactPerson: "Kashif Raza",
        area: "Khalid Bin Waleed Rd",
        category: "pharmacy",
        visited: true,
        visitedAt: "11:02 AM",
        orderBookedPkr: 14200,
        recoveryCollectedPkr: 22000,
        lat: 24.8758,
        lng: 67.0635,
        x: 61,
        y: 35,
      },
      {
        id: "bs_6",
        shopName: "CureWell Medical Store",
        contactPerson: "Sohail Ahmed",
        area: "PECHS Block 2",
        category: "pharmacy",
        visited: true,
        visitedAt: "11:16 AM",
        orderBookedPkr: 9500,
        lat: 24.8772,
        lng: 67.0589,
        x: 47,
        y: 34,
      },
      {
        id: "bs_7",
        shopName: "Al-Khair Medical Centre Pharmacy",
        contactPerson: "Tariq Mehmood",
        area: "Bahadurabad Alamgir Rd",
        category: "pharmacy",
        visited: true,
        visitedAt: "11:30 AM",
        orderBookedPkr: 35800,
        lat: 24.8812,
        lng: 67.0674,
        x: 69,
        y: 27,
      },
      {
        id: "bs_8",
        shopName: "DermaGlow Skin Clinic & Pharmacy",
        contactPerson: "Dr. Hina / Salman",
        area: "Bahadurabad Block 3",
        category: "clinic",
        visited: true,
        visitedAt: "11:46 AM",
        orderBookedPkr: 16000,
        lat: 24.8829,
        lng: 67.0685,
        x: 72,
        y: 24,
      },
      {
        id: "bs_9",
        shopName: "LifeCare Chemist Bahadurabad",
        contactPerson: "Noman Ali",
        area: "Bahadurabad Chowrangi",
        category: "pharmacy",
        visited: true,
        visitedAt: "11:55 AM",
        recoveryCollectedPkr: 12500,
        lat: 24.8835,
        lng: 67.0702,
        x: 75,
        y: 20,
      },
      {
        id: "bs_10",
        shopName: "D.Watson Chemist & Derma Bar",
        contactPerson: "Farhan Qureshi",
        area: "Char Minar Chowrangi",
        category: "pharmacy",
        visited: true,
        visitedAt: "12:05 PM",
        orderBookedPkr: 29500,
        lat: 24.8845,
        lng: 67.0715,
        x: 78,
        y: 22,
      },
      // 4 Unvisited Shops (Appear in Grey on Map until visited!)
      {
        id: "bs_11",
        shopName: "Dvago Pharmacy (Bahadurabad Branch)",
        contactPerson: "Branch Manager",
        area: "Sharfabad / Bahadurabad",
        category: "pharmacy",
        visited: false,
        lat: 24.8868,
        lng: 67.0734,
        x: 83,
        y: 18,
      },
      {
        id: "bs_12",
        shopName: "Agha Khan Collection Point Medicos",
        contactPerson: "Waqas Siddiqui",
        area: "Shaheed-e-Millat Road",
        category: "pharmacy",
        visited: false,
        lat: 24.8794,
        lng: 67.0752,
        x: 84,
        y: 34,
      },
      {
        id: "bs_13",
        shopName: "Noorani Medical & General Store",
        contactPerson: "Haji Noor",
        area: "Tariq Road Signal 3",
        category: "pharmacy",
        visited: false,
        lat: 24.8710,
        lng: 67.0680,
        x: 68,
        y: 47,
      },
      {
        id: "bs_14",
        shopName: "Hill Park General Hospital Pharmacy",
        contactPerson: "Chief Pharmacist",
        area: "Shaheed-e-Millat / Hill Park",
        category: "pharmacy",
        visited: false,
        lat: 24.8742,
        lng: 67.0765,
        x: 86,
        y: 43,
      },
    ],
  },
];

export const DEFAULT_LIVE_MAP_PINS: LiveMapTransactionPin[] = [
  {
    id: "pin_booking_ke",
    type: "booking",
    staffId: "staff_ali",
    staffName: "Ali Raza",
    shopName: "K-Electric Medical Store",
    area: "Shahrah-e-Faisal Link",
    amountPkr: 42000,
    referenceNo: "BK-2026-0891",
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    timeLabel: "09:50 AM",
    lat: 24.8689,
    lng: 67.0612,
    x: 52,
    y: 54,
  },
  {
    id: "pin_recovery_alshifa",
    type: "recovery",
    staffId: "staff_kamran",
    staffName: "Kamran Siddiqui",
    shopName: "Al-Shifa Pharmacy",
    area: "Saddar Lucky Star",
    amountPkr: 15000,
    referenceNo: "REC-2026-441",
    timestamp: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
    timeLabel: "09:30 AM",
    lat: 24.8562,
    lng: 67.0312,
    x: 22,
    y: 64,
  },
  {
    id: "pin_booking_alkhair",
    type: "booking",
    staffId: "staff_ali",
    staffName: "Ali Raza",
    shopName: "Al-Khair Medical Centre Pharmacy",
    area: "Bahadurabad Alamgir Rd",
    amountPkr: 35800,
    referenceNo: "BK-2026-0894",
    timestamp: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    timeLabel: "11:30 AM",
    lat: 24.8812,
    lng: 67.0674,
    x: 69,
    y: 27,
  },
  {
    id: "pin_recovery_medplus",
    type: "recovery",
    staffId: "staff_ali",
    staffName: "Ali Raza",
    shopName: "MedPlus Pharmacy",
    area: "Khalid Bin Waleed Rd",
    amountPkr: 22000,
    referenceNo: "REC-2026-445",
    timestamp: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    timeLabel: "11:02 AM",
    lat: 24.8758,
    lng: 67.0635,
    x: 61,
    y: 35,
  },
];

/**
 * Generates a realistic SVG data-URI preview image with embedded Geo-Stamp Watermark
 * for the initial audit gallery, and also provides an HTML5 Canvas watermark burner
 * for live camera/file uploads.
 */
export function createSampleGeoStampedSvgDataUrl(params: {
  title: string;
  shopName: string;
  staffName: string;
  dateTimeLabel: string;
  lat: number;
  lng: number;
  areaName: string;
  themeColor: string;
  type: "shelf" | "desk";
}): string {
  const { title, shopName, staffName, dateTimeLabel, lat, lng, areaName, themeColor, type } = params;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="520" viewBox="0 0 800 520">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#0f172a"/>
        <stop offset="50%" stop-color="#1e293b"/>
        <stop offset="100%" stop-color="${themeColor}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="520" fill="url(#bg)"/>
    <!-- Simulated Pharmacy Shelf / Clinic Desk Scene -->
    ${
      type === "shelf"
        ? `
      <rect x="50" y="45" width="700" height="16" rx="4" fill="#334155"/>
      <rect x="50" y="165" width="700" height="16" rx="4" fill="#334155"/>
      <rect x="50" y="285" width="700" height="16" rx="4" fill="#334155"/>
      <!-- Medicine boxes on shelves -->
      <rect x="80" y="75" width="75" height="86" rx="6" fill="#14b8a6"/>
      <text x="117" y="115" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">NOXDERM</text>
      <text x="117" y="132" fill="#ccfbf1" font-family="sans-serif" font-size="9" text-anchor="middle">Cream 30g</text>
      <rect x="170" y="75" width="75" height="86" rx="6" fill="#0d9488"/>
      <text x="207" y="115" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">NOXDERM</text>
      <text x="207" y="132" fill="#ccfbf1" font-family="sans-serif" font-size="9" text-anchor="middle">Cream 30g</text>
      <rect x="260" y="82" width="82" height="79" rx="6" fill="#3b82f6"/>
      <text x="301" y="118" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">NOXACNE</text>
      <text x="301" y="135" fill="#dbeafe" font-family="sans-serif" font-size="9" text-anchor="middle">Wash 100ml</text>
      <rect x="358" y="82" width="82" height="79" rx="6" fill="#6366f1"/>
      <text x="399" y="118" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">NOXGLOW</text>
      <text x="399" y="135" fill="#e0e7ff" font-family="sans-serif" font-size="9" text-anchor="middle">Serum 30ml</text>
      <rect x="458" y="78" width="90" height="83" rx="6" fill="#f59e0b"/>
      <text x="503" y="118" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">NOX-SPF60</text>
      <text x="503" y="135" fill="#fef3c7" font-family="sans-serif" font-size="9" text-anchor="middle">Sunblock</text>
      <rect x="565" y="78" width="130" height="83" rx="8" fill="#0f766e" stroke="#2dd4bf" stroke-width="2"/>
      <text x="630" y="112" fill="#5eead4" font-family="sans-serif" font-size="10" font-weight="bold" text-anchor="middle">COUNTER DISPLAY</text>
      <text x="630" y="130" fill="#ffffff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">NOXDERMA</text>
      <!-- Second shelf -->
      <rect x="85" y="195" width="95" height="86" rx="6" fill="#10b981"/>
      <text x="132" y="238" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">NOXBIOTIC</text>
      <rect x="195" y="195" width="95" height="86" rx="6" fill="#059669"/>
      <text x="242" y="238" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">NOXRETINOL</text>
      <rect x="305" y="195" width="110" height="86" rx="6" fill="#0284c7"/>
      <text x="360" y="238" fill="#fff" font-family="sans-serif" font-size="11" font-weight="bold" text-anchor="middle">HYDRA-MOIST</text>
      `
        : `
      <rect x="70" y="55" width="660" height="245" rx="14" fill="#1e293b" stroke="#475569" stroke-width="2"/>
      <rect x="110" y="80" width="230" height="190" rx="8" fill="#f8fafc"/>
      <text x="225" y="110" fill="#0f766e" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Dr. Ayesha Khan (FCPS)</text>
      <text x="225" y="128" fill="#64748b" font-family="sans-serif" font-size="10" text-anchor="middle">DermaCare Specialist Clinic</text>
      <line x1="130" y1="140" x2="320" y2="140" stroke="#cbd5e1" stroke-width="2"/>
      <text x="135" y="168" fill="#0f172a" font-family="monospace" font-size="14" font-weight="bold">Rx: NoxDerm Cream 30g</text>
      <text x="135" y="192" fill="#0f172a" font-family="monospace" font-size="13">Rx: NoxAcne Face Wash</text>
      <text x="135" y="216" fill="#0f172a" font-family="monospace" font-size="13">Rx: Nox-SPF 60 Sunblock</text>
      <rect x="380" y="95" width="300" height="165" rx="10" fill="#0f766e" stroke="#2dd4bf" stroke-width="2"/>
      <text x="530" y="145" fill="#5eead4" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">PHYSICIAN DESK SAMPLE KIT</text>
      <text x="530" y="175" fill="#ffffff" font-family="sans-serif" font-size="18" font-weight="bold" text-anchor="middle">NOXDERMA PHARMA</text>
      <text x="530" y="202" fill="#ccfbf1" font-family="sans-serif" font-size="11" text-anchor="middle">Clinical Literature &amp; Samples Placed</text>
      `
    }
    <text x="400" y="340" fill="#e2e8f0" font-family="sans-serif" font-size="16" font-weight="bold" text-anchor="middle">${title}</text>
    <!-- Tamper-Evident Geo-Stamp Watermark Overlay Bar -->
    <rect x="0" y="370" width="800" height="150" fill="rgba(2, 6, 23, 0.88)"/>
    <line x1="0" y1="370" x2="800" y2="370" stroke="#14b8a6" stroke-width="3"/>
    <rect x="24" y="388" width="215" height="26" rx="5" fill="#0d9488"/>
    <text x="131" y="405" fill="#ffffff" font-family="monospace" font-size="11" font-weight="bold" text-anchor="middle">✓ NOXDERMA GEO-VERIFIED AUDIT</text>
    <text x="24" y="438" fill="#f8fafc" font-family="monospace" font-size="16" font-weight="bold">📍 ${shopName} (${areaName})</text>
    <text x="24" y="466" fill="#38bdf8" font-family="monospace" font-size="13" font-weight="bold">GPS: ${lat.toFixed(5)}° N, ${lng.toFixed(5)}° E  •  Accuracy: ±4m (High)</text>
    <text x="24" y="494" fill="#cbd5e1" font-family="monospace" font-size="13">🕒 ${dateTimeLabel} (PKT)  •  👤 Rep: ${staffName}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_GEO_PHOTOS: GeoVerifiedPhoto[] = [
  {
    id: "photo_audit_1",
    staffId: "staff_ali",
    staffName: "Ali Raza",
    shopName: "Time Medicos & Skin Pharmacy",
    category: "shelf_display",
    caption: "Counter shelf display audit — Full range of NoxDerm Cream, NoxAcne Wash & Sunblock placed at eye level.",
    watermarkedDataUrl: createSampleGeoStampedSvgDataUrl({
      title: "Pharmacy Shelf Display & Counter Standee Audit",
      shopName: "Time Medicos & Skin Pharmacy",
      staffName: "Ali Raza (Order Booker)",
      dateTimeLabel: "28 Oct 2026, 10:31:18 AM",
      lat: 24.87241,
      lng: 67.06194,
      areaName: "Main Tariq Road, Karachi",
      themeColor: "#0f766e",
      type: "shelf",
    }),
    capturedAt: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    capturedTimeLabel: "10:31 AM Today",
    lat: 24.87241,
    lng: 67.06194,
    areaName: "Main Tariq Road, Karachi",
    x: 56,
    y: 44,
    batteryAtCapture: 81,
    auditStatus: "verified",
  },
  {
    id: "photo_audit_2",
    staffId: "staff_bilal",
    staffName: "Bilal Ahmed",
    shopName: "DermaCare Specialist Clinic (Dr. Ayesha)",
    category: "prescription_desk",
    caption: "Doctor prescription desk verification — Sample kit & clinical detailing folder placed on Dr. Ayesha's desk.",
    watermarkedDataUrl: createSampleGeoStampedSvgDataUrl({
      title: "Clinic Prescription Desk & Sample Handover Proof",
      shopName: "DermaCare Specialist Clinic",
      staffName: "Bilal Ahmed (Medical Rep)",
      dateTimeLabel: "28 Oct 2026, 11:18:42 AM",
      lat: 24.88253,
      lng: 67.06921,
      areaName: "Bahadurabad Block 4, Karachi",
      themeColor: "#1d4ed8",
      type: "desk",
    }),
    capturedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    capturedTimeLabel: "11:18 AM Today",
    lat: 24.88253,
    lng: 67.06921,
    areaName: "Bahadurabad Block 4, Karachi",
    x: 73,
    y: 25,
    batteryAtCapture: 88,
    auditStatus: "verified",
  },
];

/**
 * Watermarks an uploaded/captured image File using HTML5 <canvas> with exact
 * Date, Time, GPS Coordinates, Shop Name, and Staff Name.
 */
export async function burnGeoWatermarkOnImage(
  file: File,
  meta: {
    staffName: string;
    shopName: string;
    areaName: string;
    lat: number;
    lng: number;
    batteryLevel: number;
    categoryLabel: string;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const targetW = 900;
        const scale = targetW / img.width;
        const targetH = Math.max(520, Math.round(img.height * scale));
        canvas.width = targetW;
        canvas.height = targetH;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }

        // Draw original photo
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(img, 0, 0, targetW, targetH);

        // Draw bottom tamper-evident watermark banner
        const bannerH = 148;
        const bannerY = targetH - bannerH;
        ctx.fillStyle = "rgba(2, 6, 23, 0.86)";
        ctx.fillRect(0, bannerY, targetW, bannerH);

        // Top accent line
        ctx.fillStyle = "#14b8a6";
        ctx.fillRect(0, bannerY, targetW, 4);

        // Verified badge pill
        ctx.fillStyle = "#0d9488";
        ctx.fillRect(24, bannerY + 14, 290, 26);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 12px monospace";
        ctx.fillText(`✓ NOXDERMA GEO-VERIFIED • ${meta.categoryLabel.toUpperCase()}`, 34, bannerY + 31);

        // Shop & Area
        ctx.fillStyle = "#f8fafc";
        ctx.font = "bold 18px monospace";
        ctx.fillText(`📍 ${meta.shopName} — ${meta.areaName}`, 24, bannerY + 66);

        // GPS Coordinates
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 14px monospace";
        ctx.fillText(
          `GPS: ${meta.lat.toFixed(5)}° N, ${meta.lng.toFixed(5)}° E  |  Accuracy: High (±4m)  |  Battery: ${meta.batteryLevel}%`,
          24,
          bannerY + 95
        );

        // Timestamp & Staff
        const nowStr = new Date().toLocaleString("en-PK", {
          dateStyle: "medium",
          timeStyle: "medium",
        });
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "14px monospace";
        ctx.fillText(`🕒 ${nowStr} (PKT)   •   👤 Staff: ${meta.staffName}`, 24, bannerY + 124);

        resolve(canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

