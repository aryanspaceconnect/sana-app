import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut, 
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { 
  getFirestore,
  initializeFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import firebaseConfigData from "../../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  projectId: firebaseConfigData.projectId,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
  appId: firebaseConfigData.appId,
};

// Initialize App
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Utility to recursively remove undefined values which Firestore rejects
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as any;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)) as any;
  }
  // Preserve Firestore FieldValues (e.g., serverTimestamp)
  if (obj && typeof obj === 'object' && ('_methodName' in obj || (obj as any).constructor?.name === 'FieldValue')) {
    return obj;
  }
  const clean: Record<string, any> = {};
  for (const key of Object.keys(obj as Record<string, any>)) {
    const value = (obj as Record<string, any>)[key];
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

// Initialize Firestore with database ID specified in config if present and auto-detect long polling for robust connection
const databaseId = firebaseConfigData.firestoreDatabaseId || "(default)";
export const db = (() => {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true
    }, databaseId);
  } catch (e) {
    return getFirestore(app, databaseId);
  }
})();

// Auth Helpers
export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error("Google sign in error:", error);
    throw error;
  }
};

export const signInWithEmail = async (email: string, pass: string) => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, pass);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error("Email sign in error:", error);
    throw error;
  }
};

export const signUpWithEmail = async (email: string, pass: string, name?: string) => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, pass);
    const user = result.user;
    if (name) {
      await updateProfile(user, { displayName: name });
    }
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error("Email sign up error:", error);
    throw error;
  }
};

export const logoutUser = async () => {
  await signOut(auth);
};

// Get User Profile from Firestore
export const getUserProfileFromFirestore = async (uid: string) => {
  if (!uid) return null;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.warn("getUserProfileFromFirestore error:", err);
  }
  return null;
};

// User Profile Sync
export const syncUserProfile = async (user: User | { uid: string; displayName?: string | null; email?: string | null; photoURL?: string | null }, customSettings?: Record<string, any>) => {
  if (!user || !user.uid) return;
  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        displayName: user.displayName || "SANA User",
        email: user.email || "guest@sana.app",
        photoURL: user.photoURL || "",
        settings: {
          temperatureUnit: "C",
          scanNotificationTime: "00:00",
          scanReminderEnabled: true,
          theme: "light",
          ...customSettings
        },
        createdAt: serverTimestamp()
      });
    } else if (customSettings) {
      const existingData = snap.data();
      const existingSettings = existingData.settings || {};
      const mergedSettings = {
        ...existingSettings,
        ...customSettings
      };
      await updateDoc(userRef, {
        "settings": mergedSettings
      });
    }
  } catch (err) {
    console.warn("syncUserProfile Firestore warning:", err);
  }
};

// Save Facial Scan Result
export const saveFacialScan = async (userId: string, scanData: any) => {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    const ref = collection(db, "facial_scans");
    const rawObj = {
      userId: userId || 'guest_user',
      scanId: scanData.scanId || scanData.id || `scan_${Date.now()}`,
      scanType: scanData.scanType || 'daily_scan',
      hydrationScore: scanData.hydrationScore ?? scanData.rawMetrics?.moistureScore ?? 85,
      barrierScore: scanData.barrierScore ?? scanData.rawMetrics?.barrierRednessScore ?? 88,
      clarityScore: scanData.clarityScore ?? scanData.rawMetrics?.acneBlemishScore ?? 90,
      summary: scanData.summary || "Skin analysis processed successfully.",
      recommendations: scanData.recommendations || [],
      uvRecommendation: scanData.uvRecommendation || "",
      annotatedRegions: scanData.annotatedRegions || [],
      rawMetrics: scanData.rawMetrics || null,
      scoreInfo: scanData.scoreInfo || null,
      concernImages: scanData.concernImages || null,
      capturedImage: scanData.capturedImage ? scanData.capturedImage.slice(0, 500) + '...' : null, // keep concise reference for DB
      rawPerfectCorpOutput: scanData.rawPerfectCorpOutput || null,
      scanDate: todayStr,
      timestamp: serverTimestamp()
    };
    const cleanData = sanitizeForFirestore(rawObj);
    const docRef = await addDoc(ref, cleanData);

    // Also store in user-specific subcollection users/{userId}/{scanType}s
    try {
      const subFolder = scanData.scanType === 'intermediate_scan' ? 'intermediate_scans' : 'daily_scans';
      const userScanRef = collection(db, "users", userId || 'guest_user', subFolder);
      await addDoc(userScanRef, cleanData);
    } catch (subErr) {
      console.warn("Subcollection save warning:", subErr);
    }

    // MANDATORY DATABASE PERSISTENCE: Automatically record lastCompletedScanDate in Firestore
    try {
      const uId = userId || 'guest_user';
      const userRef = doc(db, "users", uId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingSettings = userSnap.data().settings || {};
        await updateDoc(userRef, {
          "settings": {
            ...existingSettings,
            lastCompletedScanDate: todayStr
          }
        });
      } else {
        await setDoc(userRef, {
          displayName: "SANA User",
          email: "guest@sana.app",
          settings: {
            temperatureUnit: "C",
            scanNotificationTime: "00:00",
            scanReminderEnabled: true,
            theme: "light",
            lastCompletedScanDate: todayStr
          },
          createdAt: serverTimestamp()
        });
      }
    } catch (userErr) {
      console.warn("User lastCompletedScanDate Firestore sync warning:", userErr);
    }

    return docRef.id;
  } catch (err) {
    console.error("Failed to save facial scan to Firestore:", err);
    return null;
  }
};

// Subscribe to Facial Scan History
export const subscribeFacialScans = (userId: string, callback: (scans: any[]) => void) => {
  const q = query(
    collection(db, "facial_scans"),
    where("userId", "==", userId),
    orderBy("timestamp", "desc")
  );
  return onSnapshot(q, (snapshot) => {
    const scans = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(scans);
  }, (err) => {
    console.warn("Firestore subscription error (facial_scans):", err);
    callback([]);
  });
};

// Chat Persistence Helpers
export const saveChatMessage = async (userId: string, chatId: string, messages: any[]) => {
  try {
    const chatRef = doc(db, "chats", chatId);
    const sanitizedMessages = sanitizeForFirestore(messages);
    await setDoc(chatRef, {
      userId,
      messages: sanitizedMessages,
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("Failed to save chat message:", err);
  }
};

export const subscribeUserChat = (chatId: string, callback: (chat: any) => void) => {
  const chatRef = doc(db, "chats", chatId);
  return onSnapshot(chatRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data());
    } else {
      callback(null);
    }
  }, (err) => {
    console.warn("Firestore chat snapshot error:", err);
    callback(null);
  });
};

// Calendar Event Helpers
export const addCalendarEvent = async (userId: string, eventData: { title: string; date: string; category: string }) => {
  try {
    const ref = collection(db, "calendar_events");
    await addDoc(ref, {
      userId,
      title: eventData.title,
      date: eventData.date,
      category: eventData.category,
      completed: false
    });
  } catch (err) {
    console.error("Error adding calendar event:", err);
  }
};

export const subscribeCalendarEvents = (userId: string, callback: (events: any[]) => void) => {
  const q = query(
    collection(db, "calendar_events"),
    where("userId", "==", userId)
  );
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(events);
  }, (err) => {
    console.warn("Calendar events snapshot error:", err);
    callback([]);
  });
};
