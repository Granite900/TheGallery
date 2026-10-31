/**
 * Persistence: game state as JSON in localStorage (small), images (latent
 * frames, developed negatives, prints) as Blobs in IndexedDB (large).
 * Both work in Electron and in a browser; all access is guarded.
 */
import { GameState, newGame } from '../sim/state';

const KEY = 'latent-image-save-v1';
const SANDBOX_KEY = 'latent-image-sandbox-v1';

export function loadState(sandbox = false): GameState | null {
  try {
    const raw = localStorage.getItem(sandbox ? SANDBOX_KEY : KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameState;
    if (s.version !== 1) return null;
    // forwards-compatible defaults
    const fresh = newGame(sandbox);
    return { ...fresh, ...s, settings: { ...fresh.settings, ...s.settings }, chem: { ...fresh.chem, ...s.chem } };
  } catch {
    return null;
  }
}

export function saveState(s: GameState): void {
  try {
    localStorage.setItem(s.sandbox ? SANDBOX_KEY : KEY, JSON.stringify(s));
  } catch (e) {
    console.warn('save failed', e);
  }
}

export function hasSave(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export function wipeSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

/** IndexedDB image store with an in-memory fallback */
export class ImageStore {
  private db: IDBDatabase | null = null;
  private mem = new Map<string, Blob>();
  private urls = new Map<string, string>();

  async open(): Promise<void> {
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('latent-image', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('images');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      this.db = null;
    }
  }

  async put(key: string, blob: Blob): Promise<void> {
    this.mem.set(key, blob);
    const old = this.urls.get(key);
    if (old) {
      URL.revokeObjectURL(old);
      this.urls.delete(key);
    }
    if (!this.db) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction('images', 'readwrite');
        tx.objectStore('images').put(blob, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      console.warn('image store put failed', e);
    }
  }

  async get(key: string): Promise<Blob | null> {
    const m = this.mem.get(key);
    if (m) return m;
    if (!this.db) return null;
    try {
      const b = await new Promise<Blob | null>((resolve, reject) => {
        const tx = this.db!.transaction('images', 'readonly');
        const req = tx.objectStore('images').get(key);
        req.onsuccess = () => resolve((req.result as Blob) ?? null);
        req.onerror = () => reject(req.error);
      });
      if (b) this.mem.set(key, b);
      return b;
    } catch {
      return null;
    }
  }

  async url(key: string): Promise<string | null> {
    const u = this.urls.get(key);
    if (u) return u;
    const b = await this.get(key);
    if (!b) return null;
    const nu = URL.createObjectURL(b);
    this.urls.set(key, nu);
    return nu;
  }

  async image(key: string): Promise<HTMLImageElement | null> {
    const u = await this.url(key);
    if (!u) return null;
    const img = new Image();
    img.src = u;
    await img.decode().catch(() => undefined);
    return img;
  }
}
