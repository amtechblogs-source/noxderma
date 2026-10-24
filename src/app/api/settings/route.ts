import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@/types";
import { adminDb, isFirebaseAdminReady } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

const DATA_DIR = path.join(process.cwd(), "data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readLocalSettings(): BusinessSettings {
  try {
    ensureDataDir();
    if (fs.existsSync(SETTINGS_FILE)) {
      const content = fs.readFileSync(SETTINGS_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Could not read local settings file:", err);
  }
  return DEFAULT_BUSINESS_SETTINGS;
}

function writeLocalSettings(settings: BusinessSettings) {
  try {
    ensureDataDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("Could not write local settings file:", err);
  }
}

export async function GET() {
  try {
    let settings = readLocalSettings();

    // If Firebase Admin credentials are ready, check Cloud Firestore
    if (isFirebaseAdminReady()) {
      try {
        const docRef = adminDb.collection("organizationSettings").doc("primary");
        const snap = await docRef.get();
        if (snap.exists) {
          const cloudData = snap.data() as BusinessSettings;
          // Merge with cloud
          settings = { ...settings, ...cloudData };
          writeLocalSettings(settings);
        }
      } catch (cloudErr) {
        console.warn("Could not fetch settings from Cloud Firestore:", cloudErr);
      }
    }

    return NextResponse.json({ success: true, settings });
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

    const current = readLocalSettings();
    const updated: BusinessSettings = {
      ...current,
      ...payload,
      id: "primary",
      updatedAt: new Date().toISOString(),
    };

    // 1. Persist to server disk database
    writeLocalSettings(updated);

    // 2. Persist to Cloud Firestore if ready
    if (isFirebaseAdminReady()) {
      try {
        const docRef = adminDb.collection("organizationSettings").doc("primary");
        await docRef.set(updated, { merge: true });
      } catch (cloudErr) {
        console.warn("Could not save settings to Cloud Firestore:", cloudErr);
      }
    }

    return NextResponse.json({ success: true, settings: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
