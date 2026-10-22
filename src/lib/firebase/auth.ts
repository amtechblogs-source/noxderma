import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./config";
import type { UserProfile, UserRole } from "@/types";

export async function loginWithEmail(email: string, pass: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email, pass);
  return cred.user;
}

export async function logout(): Promise<void> {
  await firebaseSignOut(auth);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userDocRef = doc(db, "users", uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }
    // If not found (e.g. newly signed-in user), construct a default profile
    const defaultProfile: UserProfile = {
      id: uid,
      email: auth.currentUser?.email || "",
      displayName: auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "Staff Member",
      role: "admin", // Default initial user as admin for first setup
      active: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await setDoc(userDocRef, defaultProfile, { merge: true });
    return defaultProfile;
  } catch (err) {
    console.warn("Failed to fetch user profile from Firestore, using offline fallback:", err);
    // If offline, return a local fallback session
    if (auth.currentUser) {
      return {
        id: auth.currentUser.uid,
        email: auth.currentUser.email || "offline@noxderma.com",
        displayName: auth.currentUser.displayName || "Offline Staff",
        role: "admin",
        active: true,
        createdAt: new Date().toISOString(),
      };
    }
    return null;
  }
}

export function subscribeToAuthState(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
