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

// User Profile Sync
export const syncUserProfile = async (user: User, customSettings?: Record<string, any>) => {
  if (!user) return;
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
          scanNotificationTime: "06:00",
          theme: "light",
          ...customSettings
        },
        createdAt: serverTimestamp()
      });
    } else if (customSettings) {
      await updateDoc(userRef, {
        "settings": customSettings
      });
    }
  } catch (err) {
    console.warn("syncUserProfile Firestore warning:", err);
  }
};

// Save Facial Scan Result
export const saveFacialScan = async (userId: string, scanData: any) => {
  try {
    const ref = collection(db, "facial_scans");
    const rawObj = {
      userId: userId || 'guest_user',
      hydrationScore: scanData.hydrationScore ?? 85,
      barrierScore: scanData.barrierScore ?? 88,
      clarityScore: scanData.clarityScore ?? 90,
      summary: scanData.summary || "Skin analysis processed successfully.",
      recommendations: scanData.recommendations || [],
      uvRecommendation: scanData.uvRecommendation || "",
      annotatedRegions: scanData.annotatedRegions || [],
      rawPerfectCorpOutput: scanData.rawPerfectCorpOutput || null,
      timestamp: serverTimestamp()
    };
    const cleanData = sanitizeForFirestore(rawObj);
    const docRef = await addDoc(ref, cleanData);
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
