// IndexedDB persistence. One object store, one record per group. No
// dependency — the wrapper is 40 lines and the app's whole pitch is being
// small and local.

import type { Group } from './events';

const DB_NAME = 'palspayin';
const DB_VERSION = 1;
const STORE = 'groups';

export interface StoredGroup extends Group {
  /** Relay row-sequence cursor — how far this device has pulled. */
  relayCursor?: number;
  createdAt: number;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'groupId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadGroups(): Promise<StoredGroup[]> {
  const all = await tx<StoredGroup[]>('readonly', (s) => s.getAll() as IDBRequest<StoredGroup[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadGroup(groupId: string): Promise<StoredGroup | undefined> {
  return tx<StoredGroup | undefined>('readonly', (s) => s.get(groupId) as IDBRequest<StoredGroup | undefined>);
}

export async function saveGroup(group: StoredGroup): Promise<void> {
  await tx('readwrite', (s) => s.put({ ...group, updatedAt: Date.now() }));
}

export async function deleteGroup(groupId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(groupId));
}

/** This device's stable author id — random, not derived from anything personal. */
export function deviceId(): string {
  const KEY = 'palspayin-device-id';
  let id = localStorage.getItem(KEY);
  if (!id) {
    const b = new Uint8Array(4);
    crypto.getRandomValues(b);
    id = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY, id);
  }
  return id;
}
