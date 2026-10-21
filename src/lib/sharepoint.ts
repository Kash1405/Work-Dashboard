import { useEffect } from "react";
import { FILES, README, type SyncFile } from "./files";
import { SignInNeeded, graph, msConfig, preloadMicrosoft, signInMicrosoft, signOutMicrosoft } from "./microsoft";
import { peekStored, setStored, subscribeAll, useStored } from "./store";

// OneDrive for Business (your personal SharePoint) is the source of truth. Everything lives in a
// visible "Work Dashboard" folder (see lib/files.ts). Each file is synced on its own with a three-way
// check against what this device last saw: edited in OneDrive → OneDrive wins; changed only here →
// uploaded. Local changes upload a couple of seconds after they happen, and OneDrive is checked every
// 30 seconds (and whenever the tab comes back into view), so other devices' edits load in on their own.

const FOLDER_NAME = "Work Dashboard";
const README_NAME = "About this folder.txt";
const DEBOUNCE_MS = 2000;
const POLL_MS = 30 * 1000;

export type SyncState = "off" | "signed-out" | "pending" | "syncing" | "synced" | "error";
export type SyncStatus = { state: SyncState; at: number; error: string };
type Known = { id: string; cTag: string; hash: string };
export type SyncMeta = {
  enabled: boolean;
  folderId: string;
  folderUrl: string;
  files: Record<string, Known>; // per file: what OneDrive held after this device's last sync
};

const metaFallback: SyncMeta = { enabled: false, folderId: "", folderUrl: "", files: {} };
const statusFallback: SyncStatus = { state: "off", at: 0, error: "" };
export const useSyncStatus = () => useStored<SyncStatus>("~sync.status", statusFallback);
export const useSyncMeta = () => useStored<SyncMeta>("sync.onedrive", metaFallback);

const meta = () => peekStored<SyncMeta>("sync.onedrive") ?? metaFallback;
const setMeta = (patch: Partial<SyncMeta>) => setStored<SyncMeta>("sync.onedrive", (m) => ({ ...m, ...patch }), metaFallback);
const setStatus = (patch: Partial<SyncStatus>) => setStored<SyncStatus>("~sync.status", (s) => ({ ...s, ...patch }), statusFallback);

const SYNCED_KEYS = new Set(FILES.flatMap((f) => f.keys));

let applying = false;
let timer: number | undefined;
let busy: Promise<void> | null = null;
let generation = 0; // bumped on sign-out so in-flight work stops

// Cheap 53-bit string hash, only used to tell whether a file changed.
function hash(text: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
const hashOf = (file: SyncFile, text: string) => hash(file.canon(text));

// ---------- Graph ----------

type DriveItem = { id: string; name: string; cTag?: string; webUrl?: string; "@microsoft.graph.downloadUrl"?: string };

const json = async <T,>(path: string, init: RequestInit = {}, interactive = false) => (await graph(path, init, interactive)).json() as Promise<T>;
const isMissing = (error: unknown) => (error as { status?: number }).status === 404;

async function ensureFolder(interactive: boolean): Promise<string> {
  const { folderId } = meta();
  if (folderId) {
    const folder = await json<DriveItem>(`/me/drive/items/${folderId}?$select=id,webUrl`, {}, interactive).catch((error) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (folder) return folder.id;
  }
  let folder = await json<DriveItem>(`/me/drive/root:/${encodeURIComponent(FOLDER_NAME)}?$select=id,webUrl`, {}, interactive).catch((error) => {
    if (isMissing(error)) return null;
    throw error;
  });
  folder ??= await json<DriveItem>("/me/drive/root/children", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: FOLDER_NAME, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
  });
  // A different folder than last time: forget what we knew about its files.
  if (folder.id !== folderId) setMeta({ folderId: folder.id, folderUrl: folder.webUrl ?? "", files: {} });
  return folder.id;
}

const upload = (folderId: string, name: string, text: string) =>
  json<DriveItem>(`/me/drive/items/${folderId}:/${encodeURIComponent(name)}:/content`, { method: "PUT", headers: { "Content-Type": "text/plain; charset=utf-8" }, body: text });

async function download(item: DriveItem) {
  // The pre-authenticated download URL avoids a cross-origin redirect from /content.
  const url = item["@microsoft.graph.downloadUrl"];
  if (url) {
    const response = await fetch(url);
    if (response.ok) return response.text();
  }
  return (await graph(`/me/drive/items/${item.id}/content`)).text();
}

// ---------- Sync ----------

function exclusive(task: () => Promise<void>) {
  const run = (busy ?? Promise.resolve()).then(task, task);
  busy = run.catch(() => undefined).finally(() => {
    if (busy === run) busy = null;
  });
  return run;
}

function applyQuietly(apply: () => void) {
  applying = true;
  try {
    apply();
  } finally {
    applying = false;
  }
}

// full: re-read every file. Otherwise only files whose OneDrive content tag moved are read.
async function runSync(full: boolean, interactive: boolean) {
  window.clearTimeout(timer);
  timer = undefined;
  setStatus({ state: "syncing", error: "" });
  const gen = generation;
  const folderId = await ensureFolder(interactive);
  const { value: children } = await json<{ value: DriveItem[] }>(`/me/drive/items/${folderId}/children?$top=200`);
  const known = { ...meta().files };

  for (const file of FILES) {
    if (gen !== generation) return;
    const remote = children.find((c) => c.name.toLowerCase() === file.name.toLowerCase());
    const last = known[file.name];
    if (remote && (full || remote.cTag !== last?.cTag)) {
      const remoteText = await download(remote);
      const remoteHash = hashOf(file, remoteText);
      if (remoteHash !== last?.hash) {
        // Edited in OneDrive (or first sync on this device): OneDrive wins.
        applyQuietly(() => file.apply(remoteText));
        known[file.name] = { id: remote.id, cTag: remote.cTag ?? "", hash: remoteHash };
        continue;
      }
      known[file.name] = { ...last, id: remote.id, cTag: remote.cTag ?? "" };
    }
    const text = file.text();
    const localHash = hashOf(file, text);
    if (!remote || localHash !== known[file.name]?.hash) {
      const item = await upload(folderId, file.name, text);
      known[file.name] = { id: item.id, cTag: item.cTag ?? "", hash: localHash };
    }
  }
  if (!children.some((c) => c.name === README_NAME)) await upload(folderId, README_NAME, README.replace(/\n/g, "\r\n"));

  if (gen !== generation) return;
  setMeta({ files: known });
  setStatus({ state: timer === undefined ? "synced" : "pending", at: Date.now(), error: "" });
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Sync failed.";
  setStatus({ state: error instanceof SignInNeeded ? "signed-out" : "error", error: message });
}

export function syncNow(interactive = false, full = true) {
  return exclusive(async () => {
    try {
      await runSync(full, interactive);
    } catch (error) {
      fail(error);
    }
  });
}

// From a click: Microsoft may show its sign-in popup.
export async function connectOneDrive() {
  try {
    await signInMicrosoft();
  } catch (error) {
    fail(error);
    return;
  }
  setMeta({ enabled: true });
  await syncNow(true);
}

export async function disconnectOneDrive() {
  generation++;
  window.clearTimeout(timer);
  timer = undefined;
  setMeta({ enabled: false, files: {} });
  setStatus({ state: "off", error: "" });
  await signOutMicrosoft();
}

function schedulePush() {
  window.clearTimeout(timer);
  setStatus({ state: "pending" });
  timer = window.setTimeout(() => {
    timer = undefined;
    if (meta().enabled) syncNow(false, false);
  }, DEBOUNCE_MS);
}

// Mount once (in App, after unlock): uploads local changes, and picks up OneDrive edits
// when the app is opened, when its tab comes back into view, and every 30 seconds.
export function useOneDriveSync(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribeAll((key) => {
      if (applying || !SYNCED_KEYS.has(key) || !meta().enabled) return;
      schedulePush();
    });
    const check = () => {
      if (document.visibilityState !== "visible" || !meta().enabled || busy) return;
      syncNow(false, false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && timer !== undefined) syncNow(false, false); // flush before leaving
      else check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const poll = window.setInterval(check, POLL_MS);
    if (msConfig().clientId) {
      preloadMicrosoft();
      if (meta().enabled) syncNow(false, true);
    }
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.clearInterval(poll);
    };
  }, [active]);
}
