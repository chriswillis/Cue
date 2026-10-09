/**
 * Saving.
 *  - Real .md files on disk via the File System Access API (Chrome, Edge, Arc, Opera).
 *  - Every change is also autosaved to IndexedDB, so a reload never loses work.
 *  - Browsers without the API (Safari, Firefox) fall back to upload / download.
 */

const DB = 'cue';
const STORE = 'kv';

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* storage unavailable (private mode) — editing still works */
  }
}

export interface Draft {
  text: string;
  name: string;
  savedAt: number;
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

  async restore(): Promise<void> {
    const h = await kvGet<Handle>('handle');
    if (h) {
      this.handle = h;
      this.name = h.name;
    }
  }

  async open(): Promise<{ text: string; name: string } | null> {
    if (supportsFS) {
      try {
        const [h] = await (window as any).showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
        const file = await h.getFile();
        this.handle = h;
        this.name = h.name;
        await kvSet('handle', h);
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
        await kvSet('handle', h);
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
      await kvSet('handle', this.handle);
      return 'renamed';
    } catch {
      return 'unsupported';
    }
  }

  async forget(): Promise<void> {
    this.handle = null;
    this.name = 'Untitled.md';
    await kvSet('handle', null);
  }
}

export function download(name: string, text: string, type = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
