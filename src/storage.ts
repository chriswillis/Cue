/**
 * Saving.
 *  - A library of decks in IndexedDB: every deck autosaves as you type, and
 *    the menu lists them under Recent. Nothing is lost by starting a new one.
 *  - Real .md files on disk via the File System Access API (Chrome, Edge, Arc,
 *    Opera). A deck remembers its file, so later edits write straight to it.
 *  - Browsers without the API (Safari, Firefox) fall back to upload / download.
 */

/*
 * IndexedDB layout (database "cue", version 2)
 *   kv     key → value: 'current-deck' (id of the last open deck), plus the
 *          pre-library 'draft' / 'draft-previous' / 'handle' (read once, to
 *          migrate)
 *   decks  one record per deck, keyed by id (see the Deck interface)
 * Bump the version in db() and handle it in onupgradeneeded if you add a store.
 */
const DB = 'cue';
const STORE = 'kv';
const DECKS = 'decks';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      if (!d.objectStoreNames.contains(DECKS)) d.createObjectStore(DECKS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function request<T>(store: string, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = op(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    return await request<T | undefined>(STORE, 'readonly', (s) => s.get(key));
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await request(STORE, 'readwrite', (s) => s.put(value, key));
  } catch {
    /* storage unavailable (private mode) — editing still works */
  }
}

/** The single autosaved draft from before the library existed (read once, to migrate). */
export interface Draft {
  text: string;
  name: string;
  savedAt: number;
}

/* ------------------------------------------------------------------ */
/* Deck library                                                        */
/* ------------------------------------------------------------------ */

export interface Deck {
  id: string;
  name: string; // file name, e.g. "Quarterly review.md"
  text: string;
  createdAt: number;
  savedAt: number;
  handle?: FileSystemFileHandle | null; // the .md file on disk, when there is one
}

export const newDeckId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

/** All decks, most recently edited first. */
export async function listDecks(): Promise<Deck[]> {
  try {
    const all = await request<Deck[]>(DECKS, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function getDeck(id: string): Promise<Deck | undefined> {
  try {
    return await request<Deck | undefined>(DECKS, 'readonly', (s) => s.get(id));
  } catch {
    return undefined;
  }
}

export async function putDeck(deck: Deck): Promise<boolean> {
  try {
    await request(DECKS, 'readwrite', (s) => s.put(deck));
    return true;
  } catch {
    return false; // storage unavailable (private mode) — editing still works
  }
}

export async function deleteDeck(id: string): Promise<void> {
  try {
    await request(DECKS, 'readwrite', (s) => s.delete(id));
  } catch {
    /* nothing to delete */
  }
}

/**
 * Ask the browser not to evict our storage when space runs low (and, on
 * Safari, to treat the site as in use). Harmless where unsupported.
 */
let persistAsked = false;
export async function persistStorage(): Promise<void> {
  if (persistAsked) return;
  persistAsked = true;
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* not supported */
  }
}

export const supportsFS = typeof (window as any).showOpenFilePicker === 'function';

const PICKER_TYPES = [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }];

type Handle = FileSystemFileHandle & {
  queryPermission?: (o: { mode: string }) => Promise<PermissionState>;
  requestPermission?: (o: { mode: string }) => Promise<PermissionState>;
  createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>;
  move?: (name: string) => Promise<void>;
};

export class FileStore {
  handle: Handle | null = null;
  name = 'Untitled.md';

  /** Point at a deck's file (or none) when switching decks. */
  use(name: string, handle?: FileSystemFileHandle | null): void {
    this.handle = (handle as Handle) ?? null;
    this.name = name;
  }

  /** The handle saved before the deck library existed (read once, to migrate). */
  async legacyHandle(): Promise<Handle | null> {
    return (await kvGet<Handle>('handle')) ?? null;
  }

  async open(): Promise<{ text: string; name: string } | null> {
    if (supportsFS) {
      try {
        const [h] = await (window as any).showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
        const file = await h.getFile();
        this.handle = h;
        this.name = h.name;
        return { text: await file.text(), name: h.name };
      } catch {
        return null; // cancelled
      }
    }
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
      input.onchange = async () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        this.handle = null;
        this.name = f.name;
        resolve({ text: await f.text(), name: f.name });
      };
      input.click();
    });
  }

  /** True when we can write to the file without asking. */
  async canWriteSilently(): Promise<boolean> {
    if (!this.handle?.queryPermission) return false;
    try {
      return (await this.handle.queryPermission({ mode: 'readwrite' })) === 'granted';
    } catch {
      return false;
    }
  }

  async save(text: string): Promise<'file' | 'download' | 'cancelled'> {
    if (this.handle) {
      try {
        if (this.handle.requestPermission && (await this.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
          return 'cancelled';
        }
        await this.write(text);
        return 'file';
      } catch {
        /* fall through to save-as */
      }
    }
    return this.saveAs(text);
  }

  async saveAs(text: string): Promise<'file' | 'download' | 'cancelled'> {
    if (supportsFS) {
      try {
        const h = await (window as any).showSaveFilePicker({ suggestedName: this.name, types: PICKER_TYPES });
        this.handle = h;
        this.name = h.name;
        await this.write(text);
        return 'file';
      } catch {
        return 'cancelled';
      }
    }
    download(this.name, text);
    return 'download';
  }

  async write(text: string): Promise<void> {
    if (!this.handle) throw new Error('No file');
    const w = await this.handle.createWritable();
    await w.write(text);
    await w.close();
  }

  /**
   * Rename the presentation. Browser drafts just take the new name. When the
   * deck is a real file, the file on disk is renamed too where the browser
   * supports it; otherwise nothing changes and 'unsupported' is returned.
   */
  async rename(name: string): Promise<'renamed' | 'unsupported'> {
    if (!this.handle) {
      this.name = name;
      return 'renamed';
    }
    if (!this.handle.move) return 'unsupported';
    try {
      if (this.handle.requestPermission && (await this.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return 'unsupported';
      await this.handle.move(name);
      this.name = this.handle.name;
      return 'renamed';
    } catch {
      return 'unsupported';
    }
  }

  forget(): void {
    this.handle = null;
    this.name = 'Untitled.md';
  }
}

export function download(name: string, content: string | Blob, type = 'text/markdown'): void {
  const blob = typeof content === 'string' ? new Blob([content], { type: `${type};charset=utf-8` }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
