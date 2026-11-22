import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import type { Example } from './types';

// Layout: desks/{uid}/examples/{id} and desks/{uid}/events/{id}.
// Security rules only let a signed-in user read and write their own desk.

export interface TicketEvent {
  ticketId: string;
  devicePred: string | null;
  knnPred: string | null;
  escalated: boolean;
  why: string | null;
  cloudTeam: string | null;
  finalTeam: string;
  decidedBy: 'device' | 'gemini' | 'staff';
  routeWhere: string | null;
  deviceMs: number;
  cloudMs: number | null;
  bankSize: number;
  /** Ground truth when the ticket comes from the labelled demo set; null for typed tickets. */
  gold: string | null;
}

export function watchExamples(
  db: Firestore,
  uid: string,
  cb: (examples: Example[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'desks', uid, 'examples'), orderBy('createdAt', 'asc'));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Example, 'id'>) }))),
    onError,
  );
}

export async function addExample(db: Firestore, uid: string, ex: Omit<Example, 'id' | 'createdAt'>): Promise<void> {
  await addDoc(collection(db, 'desks', uid, 'examples'), { ...ex, createdAt: Date.now() });
}

/** Fill an empty desk with the starter examples. Returns how many were written. */
export async function seedIfEmpty(db: Firestore, uid: string, seed: { id: string; text: string; team: string }[]): Promise<number> {
  const existing = await getDocs(collection(db, 'desks', uid, 'examples'));
  if (!existing.empty) return 0;
  const batch = writeBatch(db);
  const now = Date.now();
  seed.forEach((s, i) =>
    batch.set(doc(db, 'desks', uid, 'examples', `seed-${s.id}`), {
      text: s.text,
      team: s.team,
      source: 'seed',
      createdAt: now + i,
    }),
  );
  await batch.commit();
  return seed.length;
}

/** Remove every example and event so the demo can start again from the seed bank. */
export async function resetDesk(db: Firestore, uid: string): Promise<void> {
  for (const name of ['examples', 'events']) {
    const snap = await getDocs(collection(db, 'desks', uid, name));
    // Firestore batches hold up to 500 writes.
    for (let i = 0; i < snap.docs.length; i += 450) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + 450)) batch.delete(d.ref);
      await batch.commit();
    }
  }
}

export async function logEvent(db: Firestore, uid: string, ev: TicketEvent): Promise<void> {
  await addDoc(collection(db, 'desks', uid, 'events'), { ...ev, createdAt: Date.now(), at: serverTimestamp() });
}

export function watchEvents(db: Firestore, uid: string, cb: (events: (TicketEvent & { createdAt: number })[]) => void): Unsubscribe {
  const q = query(collection(db, 'desks', uid, 'events'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map((d) => d.data() as TicketEvent & { createdAt: number })));
}
