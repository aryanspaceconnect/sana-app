import { db, sanitizeForFirestore } from '../lib/firebase.js';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Universal Notepad Storage Engine
 * Stores cross-session universal agent memory in Firestore database (users/{uid}/vault/universal_notepad).
 */

const memoryCache: Record<string, string> = {};

export async function getUniversalNotepad(userId: string): Promise<string> {
  const safeUid = userId || 'guest_user';
  if (memoryCache[safeUid] !== undefined) {
    return memoryCache[safeUid];
  }

  try {
    if (db) {
      const docRef = doc(db, 'users', safeUid, 'vault', 'universal_notepad');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const text = snap.data()?.content || '';
        memoryCache[safeUid] = text;
        return text;
      }
    }
  } catch (err) {
    console.warn("[UniversalNotepad] Firestore read warning:", err);
  }

  return memoryCache[safeUid] || '';
}

export async function updateUniversalNotepad(
  userId: string,
  content: string,
  mode: 'append' | 'replace' = 'replace'
): Promise<string> {
  const safeUid = userId || 'guest_user';
  let current = await getUniversalNotepad(safeUid);

  let newContent = '';
  if (mode === 'append' && current.trim().length > 0) {
    newContent = `${current}\n${content}`.trim();
  } else {
    newContent = content.trim();
  }

  memoryCache[safeUid] = newContent;

  try {
    if (db) {
      const docRef = doc(db, 'users', safeUid, 'vault', 'universal_notepad');
      await setDoc(docRef, sanitizeForFirestore({
        content: newContent,
        updatedAt: new Date().toISOString(),
        updatedAtDate: new Date().toISOString().split('T')[0]
      }), { merge: true });
    }
  } catch (err) {
    console.warn("[UniversalNotepad] Firestore write warning:", err);
  }

  return newContent;
}
