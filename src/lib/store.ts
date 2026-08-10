// IndexedDB persistence. One object store, one record per group. No
// dependency — the wrapper is 40 lines and the app's whole pitch is being
// small and local.

import type { Group } from './events';
import type { RecurringTemplate } from './recurring';

const DB_NAME = 'palspayin';
const DB_VERSION = 2; // v2: the photos store
const STORE = 'groups';
const PHOTOS = 'photos';

export interface StoredGroup extends Group {
  /** Relay row-sequence cursor — how far this device has pulled. */
  relayCursor?: number;
  /** Monthly nudge templates — THIS DEVICE ONLY, deliberately not in the event log (see lib/recurring.ts). */
  recurring?: RecurringTemplate[];
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
      if (!req.result.objectStoreNames.contains(PHOTOS)) {
        req.result.createObjectStore(PHOTOS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>, storeName = STORE): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const t = db.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
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
  await deleteGroupPhotos(groupId);
}

// --------------------------------------------------------------------------- receipt photos
// Photos live in their OWN store, keyed `${groupId}:${entryId}`, and are
// NEVER part of the event log — so by construction they cannot leak into
// share links, ledger files, CSVs or the relay. A photo of your dinner stays
// on the device that took it. That is the whole design; do not "helpfully"
// add them to an export.

export async function savePhoto(groupId: string, entryId: string, blob: Blob): Promise<void> {
  await tx('readwrite', (s) => s.put(blob, `${groupId}:${entryId}`), PHOTOS);
}

export async function loadPhoto(groupId: string, entryId: string): Promise<Blob | undefined> {
  return tx<Blob | undefined>('readonly', (s) => s.get(`${groupId}:${entryId}`) as IDBRequest<Blob | undefined>, PHOTOS);
}

export async function deletePhoto(groupId: string, entryId: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(`${groupId}:${entryId}`), PHOTOS);
}

export async function listPhotoKeys(groupId: string): Promise<string[]> {
  const keys = await tx<IDBValidKey[]>('readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>, PHOTOS);
  return keys.map(String).filter((k) => k.startsWith(`${groupId}:`));
}

async function deleteGroupPhotos(groupId: string): Promise<void> {
  const keys = await listPhotoKeys(groupId);
  for (const k of keys) {
    await tx('readwrite', (s) => s.delete(k), PHOTOS);
  }
}

/**
 * Downscale a picked image to ≤1600px JPEG so the photos store stays sane.
 * Falls back to the original blob if decoding fails (e.g. an odd format).
 */
export async function downscalePhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 500_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
    );
  } catch {
    return file;
  }
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
