import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@/types";
import { adminDb, isFirebaseAdminReady } from "@/lib/firebase/admin";
import { db as firestoreDb } from "@/lib/firebase/config";
import { doc, getDoc, setDoc } from "firebase/firestore";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {}
}

function readLocalSettings(): BusinessSettings | null {
  try {
    ensureDataDir();
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Could not read local settings file:", err);
  }
  return null;
}

function writeLocalSettings(settings: BusinessSettings) {
  try {
    ensureDataDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch {}
}

async function fetchFirestoreSettings(): Promise<BusinessSettings | null> {
  // 1. Try Firebase Admin if credentials are ready
  if (isFirebaseAdminReady()) {
    try {
      const [snap1, snap2] = await Promise.all([
        adminDb.collection("settings").doc("primary").get(),
        adminDb.collection("organizationSettings").doc("primary").get(),
      ]);
      const data1 = snap1.exists ? (snap1.data() as BusinessSettings) : null;
      const data2 = snap2.exists ? (snap2.data() as BusinessSettings) : null;
      if (data1 && data2) {
        return new Date(data1.updatedAt || 0) >= new Date(data2.updatedAt || 0) ? data1 : data2;
      }
      return data1 || data2;
    } catch (adminErr) {
      console.warn("Admin Firestore fetch failed:", adminErr);
    }
  }

  // 2. Client Web SDK fallback (always works on Vercel Serverless without private key)
  try {
    const [snap1, snap2] = await Promise.all([
      getDoc(doc(firestoreDb, "settings", "primary")),
      getDoc(doc(firestoreDb, "organizationSettings", "primary")),
    ]);
    const data1 = snap1.exists() ? (snap1.data() as BusinessSettings) : null;
    const data2 = snap2.exists() ? (snap2.data() as BusinessSettings) : null;
    if (data1 && data2) {
      return new Date(data1.updatedAt || 0) >= new Date(data2.updatedAt || 0) ? data1 : data2;
    }
    return data1 || data2;
  } catch (clientErr) {
    console.warn("Client Firestore fetch failed in API route:", clientErr);
    return null;
  }
}

async function persistToFirestore(settings: BusinessSettings): Promise<void> {
  const cleanSettings = JSON.parse(
    JSON.stringify(settings, (_k, v) => (v === undefined ? null : v))
  );

  const writes: Promise<any>[] = [];

  if (isFirebaseAdminReady()) {
    try {
      writes.push(
        adminDb.collection("settings").doc("primary").set(cleanSettings, { merge: true }),
        adminDb.collection("organizationSettings").doc("primary").set(cleanSettings, { merge: true })
      );
    } catch {}
  }

  try {
    writes.push(
      setDoc(doc(firestoreDb, "settings", "primary"), cleanSettings, { merge: true }),
      setDoc(doc(firestoreDb, "organizationSettings", "primary"), cleanSettings, { merge: true })
    );
  } catch {}

  await Promise.allSettled(writes);
}

export async function GET() {
  try {
    // 1. Fetch live authoritative settings from Cloud Firestore first
    const cloudSettings = await fetchFirestoreSettings();
    if (cloudSettings) {
      writeLocalSettings(cloudSettings);
      return NextResponse.json({ success: true, settings: cloudSettings, source: "firestore" });
    }

    // 2. Fall back to local settings file if present
    const local = readLocalSettings();
    if (local) {
      return NextResponse.json({ success: true, settings: local, source: "local_disk" });
    }

    // 3. Fallback default, but flag it so clients don't overwrite user's saved data
    return NextResponse.json({
      success: true,
      settings: DEFAULT_BUSINESS_SETTINGS,
      source: "default_fallback",
      isDefaultFallback: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to retrieve settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
    }

    // Merge onto existing Cloud Firestore or local disk settings first (never spread DEFAULT_BUSINESS_SETTINGS over partial updates)
    const existing = (await fetchFirestoreSettings()) || readLocalSettings();
    const isFullPayload = Boolean(payload.legalName && payload.brandName);

    const updated: BusinessSettings = {
      ...(isFullPayload ? DEFAULT_BUSINESS_SETTINGS : {}),
      ...(existing || {}),
      ...payload,
      id: "primary",
      updatedAt: new Date().toISOString(),
      updatedBy: payload.updatedBy || existing?.updatedBy || "usr_admin",
    } as BusinessSettings;

    if (
      updated.businessLogoUrl &&
      updated.businessLogoUrl === updated.appLogoUrl &&
      typeof updated.businessLogoUrl === "string" &&
      updated.businessLogoUrl.startsWith("data:")
    ) {
      updated.businessLogoUrl = "";
    }

    // 1. Persist to Cloud Firestore (both collections) and wait so serverless does not terminate early
    await persistToFirestore(updated);

    // 2. Persist to local disk if writable
    writeLocalSettings(updated);

    return NextResponse.json({ success: true, settings: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
