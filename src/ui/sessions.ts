// Sessions are JSON files in a folder you pick (D36). The folder handle is remembered in IndexedDB so the
// browser only asks for permission again, not for the folder.

import { DATA_VERSIONS, describeAssumptions, type AssumptionRow } from '../engine/assumptions';
import type { Detail, TierResult } from '../engine/solve';
import type { Plan } from '../engine/types';

export interface SessionFile {
  app: 'fire-planner';
  schemaVersion: 1;
  name: string;
  createdAt: string;
  savedAt: string;
  plan: Plan;
  /** Snapshot of every assumption used (same content as the "How this works" page). */
  assumptions: AssumptionRow[];
  dataVersions: typeof DATA_VERSIONS;
  results: { calculatedAt: string; tiers: TierResult[]; detail: Detail | null } | null;
}

export function makeSession(name: string, plan: Plan, results: SessionFile['results'], createdAt?: string): SessionFile {
  const now = new Date().toISOString();
  return {
    app: 'fire-planner',
    schemaVersion: 1,
    name,
    createdAt: createdAt ?? now,
    savedAt: now,
    plan,
    assumptions: describeAssumptions(plan),
    dataVersions: DATA_VERSIONS,
    results,
  };
}

export function parseSession(text: string): SessionFile {
  const s = JSON.parse(text);
  if (s?.app !== 'fire-planner' || s.schemaVersion !== 1 || typeof s.plan !== 'object' || s.plan === null) throw new Error('Not a FIRE Planner session file.');
  // Shape checks for what the session list and the results view read directly, so one damaged file can't
  // break them.
  const ok = typeof s.name === 'string' && typeof s.createdAt === 'string' && typeof s.savedAt === 'string' &&
    (s.results === null || (typeof s.results === 'object' && typeof s.results.calculatedAt === 'string' && Array.isArray(s.results.tiers)));
  if (!ok) throw new Error('This FIRE Planner session file is damaged.');
  return s as SessionFile;
}

/** True when the session's results were computed with older data tables than this app has. */
export function isStale(s: SessionFile): boolean {
  return JSON.stringify(s.dataVersions) !== JSON.stringify(DATA_VERSIONS);
}

export function fileNameFor(name: string, createdAt: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'session';
  return `${createdAt.slice(0, 10)} ${safe}.json`;
}

// ---- File System Access API (Chrome/Edge) ----

interface DirHandle {
  name: string;
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
  queryPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

type PickerWindow = Window & { showDirectoryPicker?: (opts: { mode: 'readwrite'; id?: string }) => Promise<DirHandle> };

export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

const DB = 'fire-planner';
const STORE = 'handles';

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = tx.onabort = () => db.close();
    };
  });
}

export async function rememberedFolder(): Promise<DirHandle | null> {
  try {
    return ((await idb('readonly', (s) => s.get('folder'))) as DirHandle | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function pickFolder(): Promise<DirHandle> {
  const handle = await (window as PickerWindow).showDirectoryPicker!({ mode: 'readwrite', id: 'fire-sessions' });
  try {
    await idb('readwrite', (s) => s.put(handle, 'folder'));
  } catch {
    // Remembering the folder is a convenience; the session still works without it.
  }
  return handle;
}

export async function ensurePermission(dir: DirHandle): Promise<boolean> {
  if ((await dir.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await dir.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export interface SessionListing {
  fileName: string;
  session: SessionFile;
}

export async function listSessions(dir: DirHandle): Promise<SessionListing[]> {
  const out: SessionListing[] = [];
  for await (const entry of dir.values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json')) continue;
    try {
      const file = await (await dir.getFileHandle(entry.name)).getFile();
      out.push({ fileName: entry.name, session: parseSession(await file.text()) });
    } catch {
      // Not a session file; skip.
    }
  }
  return out.sort((a, b) => b.session.savedAt.localeCompare(a.session.savedAt));
}

export async function writeSession(dir: DirHandle, fileName: string, s: SessionFile): Promise<void> {
  const fh = await dir.getFileHandle(fileName, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(s, null, 2));
  await w.close();
}

// ---- Fallback: download / upload ----

export function downloadSession(fileName: string, s: SessionFile) {
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  // Some browsers start the download after click() returns; freeing the blob at once can lose it.
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

export type { DirHandle };
