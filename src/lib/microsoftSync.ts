import { exportOffice } from "./sync";
import { setStored, useStored } from "./store";
import { downloadFile } from "./utils";

// Microsoft Sync: copies the Google Drive "Work Dashboard" folder to this computer as Microsoft
// Office files (Dashboard Data.xlsx, Dashboard Logs.xlsx, Notes.docx, About this folder.docx).
// Chrome and Edge can write straight into a folder you pick once (pick your OneDrive folder and
// the copies reach Microsoft 365 too). Other browsers download the files instead.
// It is one-way: edit in the dashboard or in Google Drive, not in the exported copies.

export type MsSyncMeta = { at: number; folder: string; files: number };
export type MsSyncStatus = { busy: boolean; error: string; message: string };

const metaFallback: MsSyncMeta = { at: 0, folder: "", files: 0 };
const statusFallback: MsSyncStatus = { busy: false, error: "", message: "" };
export const useMsSyncMeta = () => useStored<MsSyncMeta>("msync.meta", metaFallback);
export const useMsSyncStatus = () => useStored<MsSyncStatus>("~msync.status", statusFallback);
const status = (patch: Partial<MsSyncStatus>) => setStored<MsSyncStatus>("~msync.status", (s) => ({ ...s, ...patch }), statusFallback);

// The File System Access API is not in TypeScript's DOM types yet.
type Permission = "granted" | "denied" | "prompt";
type DirHandle = FileSystemDirectoryHandle & {
  queryPermission(o: { mode: "readwrite" }): Promise<Permission>;
  requestPermission(o: { mode: "readwrite" }): Promise<Permission>;
};
type Picker = (o?: { id?: string; mode?: "readwrite"; startIn?: string }) => Promise<DirHandle>;
const picker = () => (window as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
export const canPickFolder = () => typeof picker() === "function";

// ---------- Remembering the folder (handles only survive in IndexedDB) ----------

const DB = "work-dashboard";
const STORE = "handles";
const KEY = "microsoft-sync-folder";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const conn = await db();
  return new Promise((resolve, reject) => {
    const request = run(conn.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

const savedFolder = () => idb<DirHandle | undefined>("readonly", (s) => s.get(KEY)).catch(() => undefined);
const saveFolder = (handle: DirHandle) => idb<void>("readwrite", (s) => s.put(handle, KEY));

// From a click: shows the folder picker.
export async function chooseFolder(): Promise<DirHandle | null> {
  const pick = picker();
  if (!pick) return null;
  try {
    const handle = await pick({ id: "work-dashboard-ms-sync", mode: "readwrite", startIn: "documents" });
    await saveFolder(handle);
    setStored<MsSyncMeta>("msync.meta", (m) => ({ ...m, folder: handle.name }), metaFallback);
    return handle;
  } catch (error) {
    if ((error as { name?: string }).name === "AbortError") return null; // picker closed
    throw error;
  }
}

// The saved folder, asking again for write access if the browser forgot it (needs a click).
async function folder(): Promise<DirHandle | null> {
  const handle = await savedFolder();
  if (handle) {
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return handle;
    if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") return handle;
  }
  return chooseFolder();
}

async function writeFile(dir: DirHandle, name: string, blob: Blob) {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(blob);
  await writable.close();
}

// From a click. Folder access is asked for first, while the click still counts as a user gesture.
export async function microsoftSync() {
  status({ busy: true, error: "", message: "" });
  try {
    const dir = canPickFolder() ? await folder() : null;
    if (canPickFolder() && !dir) {
      status({ busy: false });
      return;
    }
    const files = await exportOffice();
    if (dir) {
      for (const { name, blob } of files) await writeFile(dir, name, blob);
    } else {
      for (const { name, blob } of files) downloadFile(name, blob);
    }
    setStored<MsSyncMeta>("msync.meta", (m) => ({ ...m, at: Date.now(), files: files.length, folder: dir?.name ?? "Downloads" }), metaFallback);
    status({ busy: false, message: `Saved ${files.length} files to ${dir ? `“${dir.name}”` : "your Downloads"}.` });
  } catch (error) {
    status({ busy: false, error: error instanceof Error ? error.message : "Microsoft Sync failed." });
  }
}
