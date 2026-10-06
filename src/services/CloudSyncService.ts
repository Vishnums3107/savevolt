import { getApps } from '@react-native-firebase/app';
import {
  createUserWithEmailAndPassword, getAuth, onAuthStateChanged,
  sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
} from '@react-native-firebase/auth';
import {
  collection, doc, FirebaseFirestoreTypes, getDocFromServer, getDocsFromServer, getFirestore, runTransaction, serverTimestamp,
} from '@react-native-firebase/firestore';
import { Household, HouseholdData } from '../types';
import { validateHouseholdData } from './sync/householdData';

export interface CloudAccount { uid: string; email: string | null }
export interface CloudHome { id: string; name: string; revision: number; updatedAt: string | null }
export interface CloudBackup extends CloudHome { data: HouseholdData }

const validId = (id: string) => /^[a-zA-Z0-9_-]{1,160}$/.test(id);
const MAX_BACKUP_BYTES = 800000;
const utf8Bytes = (value: string) => {
  let size = 0;
  for (const character of value) {
    const code = character.codePointAt(0)!;
    size += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return size;
};

export const cloudErrorMessage = (error: unknown): string => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
  switch (code) {
    case 'auth/invalid-email': return 'Enter a valid email address.';
    case 'auth/weak-password': return 'Choose a password with at least 6 characters.';
    case 'auth/email-already-in-use': return 'This email already has an account. Sign in instead.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'Check your email and password, then try again.';
    case 'auth/too-many-requests': return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
    case 'firestore/unavailable': return 'Connect to the internet and try again. Your local data is safe.';
    case 'firestore/permission-denied': return 'Your account does not have access to this cloud copy.';
    default: return error instanceof Error ? error.message : 'Cloud sync failed. Please try again.';
  }
};

/** Explicit account backup/restore. No cloud operation writes legacy storage keys. */
export class CloudSyncService {
  isAvailable(): boolean {
    try { return getApps().length > 0; } catch { return false; }
  }
  private auth() {
    if (!this.isAvailable()) throw new Error('Cloud sync is unavailable in this build. Your homes work offline.');
    return getAuth();
  }
  private account(): CloudAccount {
    const user = this.auth().currentUser;
    if (!user) throw new Error('Sign in to use cloud sync.');
    return { uid: user.uid, email: user.email };
  }
  observeAccount(listener: (account: CloudAccount | null) => void): () => void {
    if (!this.isAvailable()) { listener(null); return () => {}; }
    return onAuthStateChanged(this.auth(), user => listener(user ? { uid: user.uid, email: user.email } : null));
  }
  async signIn(email: string, password: string): Promise<void> {
    if (!email.trim() || !password) throw new Error('Enter your email and password.');
    await signInWithEmailAndPassword(this.auth(), email.trim(), password);
  }
  async createAccount(email: string, password: string): Promise<void> {
    if (!email.trim()) throw new Error('Enter your email address.');
    if (password.length < 6) throw new Error('Choose a password with at least 6 characters.');
    await createUserWithEmailAndPassword(this.auth(), email.trim(), password);
  }
  async resetPassword(email: string): Promise<void> {
    if (!email.trim()) throw new Error('Enter your email address first.');
    await sendPasswordResetEmail(this.auth(), email.trim());
  }
  async signOut(): Promise<void> { await signOut(this.auth()); }
  async listHomes(): Promise<CloudHome[]> {
    const { uid } = this.account();
    const snapshot: FirebaseFirestoreTypes.QuerySnapshot = await getDocsFromServer(collection(getFirestore(), 'users', uid, 'households'));
    return snapshot.docs.flatMap(item => {
      const value = item.data();
      if (value.version !== 1 || typeof value.name !== 'string' || !Number.isInteger(value.revision) || value.revision < 1) return [];
      return [{ id: item.id, name: value.name, revision: value.revision,
        updatedAt: value.updatedAt?.toDate?.().toISOString() ?? null }];
    }).sort((a, b) => a.name.localeCompare(b.name));
  }
  async upload(home: Household, input: HouseholdData, asNewCopy = false): Promise<{ ownerId: string; id: string; revision: number }> {
    const { uid } = this.account();
    const data = validateHouseholdData(input);
    // A serialized payload avoids Firestore's nested-array restrictions and
    // never includes device credentials or preferences.
    const payload = JSON.stringify(data);
    if (utf8Bytes(payload) > MAX_BACKUP_BYTES) throw new Error('This home is too large for cloud backup. Export a report to keep a local copy.');
    const homes = collection(getFirestore(), 'users', uid, 'households');
    const linked = !asNewCopy && home.cloudOwnerId === uid && home.cloudId && validId(home.cloudId);
    const reference = linked ? doc(homes, home.cloudId!) : doc(homes);
    const expectedRevision = linked ? home.cloudRevision ?? 0 : 0;
    const revision = await runTransaction(getFirestore(), async transaction => {
      const remote = await transaction.get(reference);
      const actualRevision = remote.exists() ? remote.data()?.revision : 0;
      if (actualRevision !== expectedRevision) {
        throw new Error('The cloud copy changed on another device. Restore it as a separate home to review it, or save a new cloud copy.');
      }
      const nextRevision = expectedRevision + 1;
      transaction.set(reference, { version: 1, name: home.name, revision: nextRevision, payload,
        updatedAt: serverTimestamp() });
      return nextRevision;
    });
    return { ownerId: uid, id: reference.id, revision };
  }
  async download(id: string): Promise<CloudBackup> {
    if (!validId(id)) throw new Error('Invalid cloud home.');
    const { uid } = this.account();
    const snapshot = await getDocFromServer(doc(getFirestore(), 'users', uid, 'households', id));
    const value = snapshot.data();
    if (!snapshot.exists() || !value) throw new Error('This cloud home no longer exists.');
    if (value.version !== 1 || typeof value.payload !== 'string' || typeof value.name !== 'string' ||
        !Number.isInteger(value.revision) || value.revision < 1 || utf8Bytes(value.payload) > MAX_BACKUP_BYTES) {
      throw new Error('This cloud backup has an unsupported format.');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(value.payload); } catch { throw new Error('This cloud backup is unreadable.'); }
    return { id, name: value.name, revision: value.revision, data: validateHouseholdData(parsed),
      updatedAt: value.updatedAt?.toDate?.().toISOString() ?? null };
  }
}

export default new CloudSyncService();
