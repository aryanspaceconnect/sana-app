import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut, 
  onAuthStateChanged,
  User 
} from "firebase/auth";
import { 
  getFirestore, 
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

// Initialize Firestore with database ID specified in config if present
const databaseId = firebaseConfigData.firestoreDatabaseId || "(default)";
export const db = getFirestore(app, databaseId);

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

export const signInGuest = async () => {
  try {
    const result = await signInAnonymously(auth);
    const user = result.user;
    await syncUserProfile(user);
    return user;
  } catch (error: any) {
    console.warn("Guest sign in unavailable (Anonymous auth disabled in Firebase config):", error?.message || error);
    return null;
  }
};

export const logoutUser = async () => {
  await signOut(auth);
};

// User Profile Sync
export const syncUserProfile = async (user: User, customSettings?: Record<string, any>) => {
  if (!user) return;
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
};

// Save Facial Scan Result
export const saveFacialScan = async (userId: string, scanData: any) => {
  try {
    const ref = collection(db, "facial_scans");
    const docRef = await addDoc(ref, {
      userId,
      hydrationScore: scanData.hydrationScore,
      barrierScore: scanData.barrierScore,
      clarityScore: scanData.clarityScore,
      summary: scanData.summary,
      recommendations: scanData.recommendations || [],
      uvRecommendation: scanData.uvRecommendation || "",
      timestamp: serverTimestamp()
    });
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
    await setDoc(chatRef, {
      userId,
      messages,
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
