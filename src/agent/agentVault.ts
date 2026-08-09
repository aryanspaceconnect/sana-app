import { db } from '../lib/firebase.js';
import { doc, getDoc, setDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

export interface VaultNote {
  id: string;
  title: string;
  description: string;
  category: string;
  date: string;
  source: 'agent_memory_vault';
  tags?: string[];
}

export interface VaultDocument {
  id: string;
  title: string;
  content: string;
  fileType: string;
  date: string;
  summary?: string;
}

export interface AgentVaultData {
  userId: string;
  notes: VaultNote[];
  documents: VaultDocument[];
  knowledge: Record<string, any>;
  lastSynced: string;
}

// In-memory vault cache strictly partitioned per user ID
const vaultCache: Record<string, AgentVaultData> = {};

export function getOrCreateVaultCache(userId: string): AgentVaultData {
  if (!vaultCache[userId]) {
    vaultCache[userId] = {
      userId,
      notes: [
        {
          id: 'vnote_init_001',
          title: 'Skin Barrier Sensitivity Observation',
          description: 'User experiences mild cheek erythema after strong exfoliants or hot water exposure.',
          category: 'observation',
          date: new Date().toISOString(),
          source: 'agent_memory_vault',
          tags: ['sensitivity', 'barrier', 'erythema']
        }
      ],
      documents: [],
      knowledge: {
        preferredUnits: 'metric',
        sunscreenHabit: 'daily',
        agentNote: 'Isolated Agent Memory Vault initialized for user session.'
      },
      lastSynced: new Date().toISOString()
    };
  }
  return vaultCache[userId];
}

export function clearAgentVaultCache(userId: string) {
  delete vaultCache[userId];
}

/**
 * Loads the user's isolated Agent Vault from Firestore.
 * Scoped strictly to `agent_vaults/{userId}`
 */
export async function loadAgentVault(userId: string): Promise<AgentVaultData> {
  const localVault = getOrCreateVaultCache(userId);

  try {
    if (db) {
      // 1. Fetch notes subcollection
      const notesRef = collection(db, 'agent_vaults', userId, 'notes');
      const qNotes = query(notesRef, orderBy('date', 'desc'), limit(20));
      const notesSnap = await getDocs(qNotes);

      if (!notesSnap.empty) {
        localVault.notes = notesSnap.docs.map(d => ({ id: d.id, ...d.data() } as VaultNote));
      }

      // 2. Fetch documents subcollection
      const docsRef = collection(db, 'agent_vaults', userId, 'documents');
      const qDocs = query(docsRef, orderBy('date', 'desc'), limit(10));
      const docsSnap = await getDocs(qDocs);

      if (!docsSnap.empty) {
        localVault.documents = docsSnap.docs.map(d => ({ id: d.id, ...d.data() } as VaultDocument));
      }

      // 3. Fetch knowledge root document
      const knowledgeDocRef = doc(db, 'agent_vaults', userId, 'metadata', 'knowledge');
      const knowledgeSnap = await getDoc(knowledgeDocRef);
      if (knowledgeSnap.exists()) {
        localVault.knowledge = knowledgeSnap.data();
      }

      localVault.lastSynced = new Date().toISOString();
    }
  } catch (err) {
    console.warn(`[AgentVault] Firestore load fallback for user ${userId}:`, err);
  }

  return localVault;
}

/**
 * Saves a memory note directly into the isolated Agent Vault (`agent_vaults/{userId}/notes`).
 * Does NOT touch application core user profile or core settings.
 */
export async function saveAgentVaultNote(
  userId: string,
  payload: { title: string; description?: string; category?: string; date?: string; tags?: string[] }
): Promise<VaultNote> {
  const vault = getOrCreateVaultCache(userId);
  const noteId = `vn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newNote: VaultNote = {
    id: noteId,
    title: payload.title,
    description: payload.description || payload.title,
    category: payload.category || 'observation',
    date: payload.date || new Date().toISOString(),
    source: 'agent_memory_vault',
    tags: payload.tags || ['skin_memory']
  };

  vault.notes.unshift(newNote);

  try {
    if (db) {
      const noteRef = doc(db, 'agent_vaults', userId, 'notes', noteId);
      await setDoc(noteRef, newNote);
    }
  } catch (err) {
    console.warn(`[AgentVault] Firestore note save warning for user ${userId}:`, err);
  }

  return newNote;
}

/**
 * Ingests and saves a parsed document into the isolated Agent Vault (`agent_vaults/{userId}/documents`).
 */
export async function saveAgentVaultDocument(
  userId: string,
  docData: { title: string; content: string; fileType?: string; summary?: string; date?: string }
): Promise<VaultDocument> {
  const vault = getOrCreateVaultCache(userId);
  const docId = `vdoc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  const newDoc: VaultDocument = {
    id: docId,
    title: docData.title,
    content: docData.content,
    fileType: docData.fileType || 'text/plain',
    date: docData.date || new Date().toISOString(),
    summary: docData.summary || docData.content.substring(0, 200)
  };

  vault.documents.unshift(newDoc);

  try {
    if (db) {
      const docRef = doc(db, 'agent_vaults', userId, 'documents', docId);
      await setDoc(docRef, newDoc);
    }
  } catch (err) {
    console.warn(`[AgentVault] Firestore document save warning for user ${userId}:`, err);
  }

  return newDoc;
}

/**
 * Searches the user's isolated Agent Vault for relevant memory notes or document text.
 */
export async function searchAgentVault(
  userId: string,
  queryText: string
): Promise<{ notes: VaultNote[]; documents: VaultDocument[] }> {
  const vault = await loadAgentVault(userId);
  const lowerQuery = queryText.toLowerCase();

  const matchingNotes = vault.notes.filter(
    n => n.title.toLowerCase().includes(lowerQuery) || n.description.toLowerCase().includes(lowerQuery)
  );

  const matchingDocs = vault.documents.filter(
    d => d.title.toLowerCase().includes(lowerQuery) || d.content.toLowerCase().includes(lowerQuery)
  );

  return { notes: matchingNotes, documents: matchingDocs };
}

/**
 * Helper to parse document content (text/markdown/pdf text extracts) for agent indexing.
 */
export function parseDocumentContent(filename: string, rawContent: string): { title: string; content: string; summary: string } {
  const cleanTitle = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  const trimmed = rawContent.trim();
  const summary = trimmed.length > 250 ? `${trimmed.substring(0, 250)}...` : trimmed;

  return {
    title: cleanTitle,
    content: trimmed,
    summary
  };
}
