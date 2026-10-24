import * as admin from "firebase-admin";

function getFirebaseAdminApp(): admin.app.App {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    try {
      const parsed = JSON.parse(
        serviceAccountKey.startsWith("{")
          ? serviceAccountKey
          : Buffer.from(serviceAccountKey, "base64").toString("utf-8")
      );
      return admin.initializeApp({
        credential: admin.credential.cert(parsed),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "noxderma",
      });
    } catch (e) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, initializing with project ID:", e);
    }
  }

  // Fallback to project ID initialization
  return admin.initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "noxderma",
  });
}

export function isFirebaseAdminReady(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

export const adminApp = getFirebaseAdminApp();
export const adminDb = admin.firestore(adminApp);
export const adminAuth = admin.auth(adminApp);
