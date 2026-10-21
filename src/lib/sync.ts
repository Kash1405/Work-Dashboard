import { useEffect } from "react";
import { googleClientId, isFresh, preloadGoogle, requestToken, revokeToken, type Token } from "./google";
import { peekStored, setStored, subscribeAll, useStored } from "./store";
import { TABLES, applyNotes, cellText, noteRows, notesHtml, parseNotes, type Cell, type FileRole, type Table } from "./tables";

// Google Drive is the source of truth. Everything lives in a visible "Work Dashboard" folder:
//   Dashboard Data  (Google Sheet) – one tab per input list (tasks, goals, links, events, settings)
//   Dashboard Logs  (Google Sheet) – the focus session history
//   Notes           (Google Doc)   – the notes list
//   About this folder (Google Doc) – how it works
// Each tab is synced on its own with a three-way check against what this device last wrote:
// edited in Drive → Drive wins; changed only here → uploaded. Local changes upload a couple of
// seconds after they happen, and Drive is checked every 30 seconds (and whenever the tab comes
// back into view), so other devices' edits load in without pressing anything.
// Google only hands a static site one-hour tokens, and a new one needs a popup, which browsers
// allow only during a click. So the token is kept for its full hour (across reloads), and when
// it is missing or about to run out, the next click anywhere on the page quietly renews it.

const SCOPE = "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata";
const FILES_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const FOLDER_NAME = "Work Dashboard";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const SHEET_MIME = "application/vnd.google-apps.spreadsheet";
const DOC_MIME = "application/vnd.google-apps.document";
const DEBOUNCE_MS = 2000;
const POLL_MS = 30 * 1000;
const RENEW_BEFORE_MS = 10 * 60 * 1000; // ask for a new token on a click once less than this is left

type Role = FileRole | "notes" | "readme";
const FILE_NAMES: Record<Role, string> = { data: "Dashboard Data", logs: "Dashboard Logs", notes: "Notes", readme: "About this folder" };
const NOTES_KEY = "Notes";

export type SyncState = "off" | "signed-out" | "pending" | "syncing" | "synced" | "error";
export type SyncStatus = { state: SyncState; at: number; error: string };
export type DriveMeta = {
  enabled: boolean;
  folderId: string;
  fileIds: Partial<Record<Role, string>>;
  versions: Partial<Record<Role, string>>; // Drive version this device last saw/wrote
  hashes: Record<string, string>; // per tab: what Drive held after this device's last sync
};

const metaFallback: DriveMeta = { enabled: false, folderId: "", fileIds: {}, versions: {}, hashes: {} };
const statusFallback: SyncStatus = { state: "off", at: 0, error: "" };
export const useSyncStatus = () => useStored<SyncStatus>("~sync.status", statusFallback);
export const useSyncMeta = () => useStored<DriveMeta>("sync.drive", metaFallback);

const meta = () => peekStored<DriveMeta>("sync.drive") ?? metaFallback;
const setMeta = (patch: Partial<DriveMeta>) => setStored<DriveMeta>("sync.drive", (m) => ({ ...m, ...patch }), metaFallback);
const setStatus = (patch: Partial<SyncStatus>) => setStored<SyncStatus>("~sync.status", (s) => ({ ...s, ...patch }), statusFallback);

const SYNCED_KEYS = new Set([...TABLES.flatMap((t) => t.keys), "notes"]);

let token: Token | null = (() => {
  const saved = peekStored<Token>("sync.token");
  return isFresh(saved ?? null) ? saved! : null;
})();
let applying = false;
let timer: number | undefined;
let busy: Promise<void> | null = null;
let generation = 0; // bumped on sign-out so in-flight work stops

export const folderUrl = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const fileUrl = (role: Role, id: string) => (role === "notes" || role === "readme" ? `https://docs.google.com/document/d/${id}/edit` : `https://docs.google.com/spreadsheets/d/${id}/edit`);

// Cheap 53-bit string hash, only used to tell whether a tab changed.
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

// Same text for a tab whether it came from this device or from Sheets (trailing blanks dropped).
function normalise(rows: unknown[][]): string[][] {
  const out = rows.map((r) => {
    const cells = r.map(cellText);
    while (cells.length && !cells[cells.length - 1].trim()) cells.pop();
    return cells;
  }).filter((r) => r.length);
  return out;
}
const rowsHash = (rows: unknown[][]) => hash(JSON.stringify(normalise(rows)));

// ---------- Google REST ----------

async function api(url: string, init: RequestInit = {}, gen = generation) {
  if (gen !== generation) throw new Error("Signed out.");
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token!.value}`, ...(init.headers ?? {}) } });
  if (response.status === 401) {
    setToken(null);
    throw new Error("Google session expired. Click anywhere on the page to reconnect.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message: string = body?.error?.message ?? `Google error ${response.status}`;
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(message)) {
      const which = /sheets/i.test(message) ? "Google Sheets API" : "Google Drive API";
      throw new Error(`Turn on the ${which} in your Google Cloud project (APIs & Services → Library), wait a minute, then sync again.`);
    }
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response;
}
const json = async <T,>(url: string, init: RequestInit = {}) => (await api(url, init)).json() as Promise<T>;
const post = (body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

type DriveFile = { id: string; name: string; mimeType: string; version: string; trashed?: boolean; appProperties?: { workdash?: string } };
const FILE_FIELDS = "id,name,mimeType,version,trashed,appProperties";

async function createFile(name: string, mimeType: string, parents: string[], role: string) {
  return json<DriveFile>(`${FILES_API}?fields=${FILE_FIELDS}`, post({ name, mimeType, parents, appProperties: { workdash: role } }));
}

async function uploadDoc(id: string | undefined, name: string, html: string, parent: string, role: Role) {
  const boundary = `work${Math.random().toString(36).slice(2)}`;
  const metadata = id ? {} : { name, mimeType: DOC_MIME, parents: [parent], appProperties: { workdash: role } };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
  return json<DriveFile>(`${UPLOAD_API}${id ? `/${id}` : ""}?uploadType=multipart&fields=${FILE_FIELDS}`, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

const tabsOf = (role: FileRole) => TABLES.filter((t) => t.file === role);
const range = (t: Table) => `'${t.sheet.replace(/'/g, "''")}'`;

// Adds any tabs that are missing (new spreadsheet, or a tab deleted in Sheets) with a bold, frozen header.
async function ensureTabs(id: string, role: FileRole) {
  const { sheets } = await json<{ sheets: { properties: { sheetId: number; title: string } }[] }>(`${SHEETS_API}/${id}?fields=sheets.properties(sheetId,title)`);
  const titles = new Set(sheets.map((s) => s.properties.title));
  const missing = tabsOf(role).filter((t) => !titles.has(t.sheet));
  if (!missing.length) return;
  const requests: unknown[] = missing.map((t) => ({ addSheet: { properties: { title: t.sheet, gridProperties: { frozenRowCount: 1 } } } }));
  // A brand-new spreadsheet comes with an empty "Sheet1"; drop it.
  const blank = sheets.find((s) => s.properties.title === "Sheet1" || s.properties.title === "Sheet 1");
  if (blank && sheets.length === 1) requests.push({ deleteSheet: { sheetId: blank.properties.sheetId } });
  const { replies } = await json<{ replies: { addSheet?: { properties: { sheetId: number } } }[] }>(`${SHEETS_API}/${id}:batchUpdate`, post({ requests }));
  const format = replies.flatMap((r) => (r.addSheet ? [{
    repeatCell: {
      range: { sheetId: r.addSheet.properties.sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: { userEnteredFormat: { textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }, backgroundColor: { red: 0.08, green: 0.08, blue: 0.09 } } },
      fields: "userEnteredFormat(textFormat,backgroundColor)",
    },
  }] : []));
  if (format.length) await api(`${SHEETS_API}/${id}:batchUpdate`, post({ requests: format }));
  // Write headers so the new tabs read well even before they have rows.
  await api(`${SHEETS_API}/${id}/values:batchUpdate`, post({ valueInputOption: "RAW", data: missing.map((t) => ({ range: `${range(t)}!A1`, values: [t.headers] })) }));
}

// Reads every tab of a spreadsheet, lining columns up with our headers by name.
async function readTabs(id: string, role: FileRole): Promise<Record<string, string[][]>> {
  const tables = tabsOf(role);
  const query = tables.map((t) => `ranges=${encodeURIComponent(range(t))}`).join("&");
  let result: { valueRanges: { values?: unknown[][] }[] };
  try {
    result = await json(`${SHEETS_API}/${id}/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  } catch (error) {
    if ((error as { status?: number }).status !== 400) throw error;
    await ensureTabs(id, role); // a tab was missing
    result = await json(`${SHEETS_API}/${id}/values:batchGet?${query}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`);
  }
  const out: Record<string, string[][]> = {};
  tables.forEach((t, i) => {
    const [head = [], ...rows] = result.valueRanges[i]?.values ?? [];
    const names = head.map((h) => cellText(h).trim().toLowerCase());
    const index = t.headers.map((h) => names.indexOf(h.toLowerCase()));
    out[t.sheet] = normalise(rows.map((r) => index.map((c) => (c >= 0 ? r[c] : ""))));
  });
  return out;
}

async function writeTabs(id: string, role: FileRole, items: { table: Table; rows: Cell[][] }[]) {
  if (!items.length) return;
  const clear = () => api(`${SHEETS_API}/${id}/values:batchClear`, post({ ranges: items.map(({ table }) => range(table)) }));
  try {
    await clear();
  } catch (error) {
    if ((error as { status?: number }).status !== 400) throw error;
    await ensureTabs(id, role); // a tab was missing (new in this version, or deleted in Sheets)
    await clear();
  }
  await api(`${SHEETS_API}/${id}/values:batchUpdate`, post({ valueInputOption: "RAW", data: items.map(({ table, rows }) => ({ range: `${range(table)}!A1`, values: [table.headers, ...rows] })) }));
}

const readme = () => `<html><body><h1>Work Dashboard</h1>
<p>This folder is the source of truth for your Work Dashboard. The dashboard reads from it and writes back to it.</p>
<h2>What is here</h2>
<ul>
<li><b>Dashboard Data</b> (Sheet): your inputs. One tab each for settings, links, daily tasks, goals and calendar events.</li>
<li><b>Dashboard Logs</b> (Sheet): your focus session history.</li>
<li><b>Notes</b> (Doc): your notes. Each starts with a line like “— 2026-10-18 09:30 —”.</li>
</ul>
<h2>How syncing works</h2>
<ul>
<li>Changes in the dashboard are saved here a couple of seconds after you make them.</li>
<li>You can edit the Sheets and the Notes doc directly. The dashboard checks for edits every 30 seconds and whenever you switch back to it.</li>
<li>If the same tab was changed in both places, the version here wins.</li>
<li>Keep the header row and the ID columns. Leave the ID empty on a new row and the dashboard will fill it in.</li>
<li>Dates are YYYY-MM-DD and times are HH:MM.</li>
</ul>
<p>The running timer and the dashboard password never leave your browser.</p>
</body></html>`;

// ---------- Layout: find or create the folder and its files ----------

async function ensureLayout(): Promise<{ files: Record<Role, DriveFile>; created: boolean; fresh: Set<Role> }> {
  let folderId = meta().folderId;
  if (folderId) {
    const folder = await json<DriveFile>(`${FILES_API}/${folderId}?fields=${FILE_FIELDS}`).catch(() => null);
    if (!folder || folder.trashed) folderId = "";
  }
  let created = false;
  if (!folderId) {
    const q = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}' and trashed=false`);
    const { files } = await json<{ files: DriveFile[] }>(`${FILES_API}?q=${q}&fields=files(${FILE_FIELDS})&orderBy=createdTime`);
    folderId = files[0]?.id ?? "";
    if (!folderId) {
      folderId = (await createFile(FOLDER_NAME, FOLDER_MIME, ["root"], "folder")).id;
      created = true;
    }
    setMeta({ folderId, fileIds: {}, versions: {}, hashes: {} });
  }

  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const { files: children } = await json<{ files: DriveFile[] }>(`${FILES_API}?q=${q}&fields=files(${FILE_FIELDS})&pageSize=100`);
  const files = {} as Record<Role, DriveFile>;
  const fresh = new Set<Role>();
  for (const role of Object.keys(FILE_NAMES) as Role[]) {
    const found = children.find((f) => f.appProperties?.workdash === role) ?? children.find((f) => f.name === FILE_NAMES[role]);
    if (found) files[role] = found;
    else fresh.add(role);
    if (found) continue;
    if (role === "data" || role === "logs") {
      files[role] = await createFile(FILE_NAMES[role], SHEET_MIME, [folderId], role);
      await ensureTabs(files[role].id, role);
    } else if (role === "readme") files[role] = await uploadDoc(undefined, FILE_NAMES[role], readme(), folderId, role);
    else files[role] = await uploadDoc(undefined, FILE_NAMES[role], notesHtml(), folderId, role);
  }
  const ids = Object.fromEntries(Object.entries(files).map(([r, f]) => [r, f.id]));
  // A file recreated or swapped in Drive: forget what we knew about it.
  const old = meta();
  const versions = { ...old.versions };
  for (const r of Object.keys(ids) as Role[]) if (old.fileIds[r] !== ids[r]) delete versions[r];
  setMeta({ fileIds: ids, versions });
  return { files, created, fresh };
}

// ---------- Sync ----------

function exclusive(task: () => Promise<void>) {
  const run = (busy ?? Promise.resolve()).then(task, task);
  busy = run.catch(() => undefined).finally(() => {
    if (busy === run) busy = null;
  });
  return run;
}

function setToken(next: Token | null) {
  token = next;
  setStored<Token | null>("sync.token", next);
}

async function ensureToken(interactive: boolean) {
  if (isFresh(token) && !(interactive && token!.expiresAt - Date.now() < RENEW_BEFORE_MS)) return;
  if (!interactive) throw new Error("Click anywhere on the page to reconnect Google Drive.");
  setToken(await requestToken(SCOPE, meta().enabled ? "" : "consent"));
}

// Google's token popup is only allowed during a click, so the first click or key press after the
// token runs low renews it (the popup closes on its own when access was already granted).
let armed = false;
let declinedAt = 0; // popup closed or failed during a click: wait a few minutes before asking again
function onGesture() {
  disarm();
  if (meta().enabled) syncNow(true);
}
function arm() {
  if (armed || !meta().enabled || !googleClientId() || Date.now() - declinedAt < 5 * 60 * 1000) return;
  armed = true;
  window.addEventListener("click", onGesture, true);
  window.addEventListener("keydown", onGesture, true);
}
function disarm() {
  armed = false;
  window.removeEventListener("click", onGesture, true);
  window.removeEventListener("keydown", onGesture, true);
}
const needsRenewal = () => !token || token.expiresAt - Date.now() < RENEW_BEFORE_MS;

function applyQuietly(apply: () => void) {
  applying = true;
  try {
    apply();
  } finally {
    applying = false;
  }
}

// full: always re-read Drive (manual sync, opening the app). Otherwise only files whose
// Drive version moved since this device last touched them are read before uploading.
async function runSync(full: boolean) {
  window.clearTimeout(timer);
  timer = undefined;
  setStatus({ state: "syncing", error: "" });
  const gen = generation;
  const { files, fresh } = await ensureLayout();


  const hashes = { ...meta().hashes };
  const versions = { ...meta().versions };

  for (const role of ["data", "logs"] as FileRole[]) {
    const file = files[role];
    const external = versions[role] !== file.version;
    const remote = full || external ? await readTabs(file.id, role) : null;
    const uploads: { table: Table; rows: Cell[][] }[] = [];
    for (const table of tabsOf(role)) {
      const last = hashes[table.sheet];
      if (remote) {
        const remoteHash = rowsHash(remote[table.sheet]);
        if (remoteHash !== last && !fresh.has(role)) {
          // Edited in Drive (or first sync on this device): Drive wins.
          applyQuietly(() => table.apply(remote[table.sheet]));
          hashes[table.sheet] = remoteHash;
          continue;
        }
      }
      const rows = table.rows();
      const localHash = rowsHash(rows);
      if (localHash !== hashes[table.sheet]) {
        uploads.push({ table, rows });
        hashes[table.sheet] = localHash;
      }
    }
    if (uploads.length) await writeTabs(file.id, role, uploads);
    if (gen !== generation) return;
    versions[role] = (await json<DriveFile>(`${FILES_API}/${file.id}?fields=version`)).version;
  }

  // Notes doc
  const notes = files.notes;
  if (full || versions.notes !== notes.version) {
    const text = await (await api(`${FILES_API}/${notes.id}/export?mimeType=text/plain`)).text();
    const remote = parseNotes(text);
    const remoteHash = rowsHash(remote);
    if (remoteHash !== hashes[NOTES_KEY] && !fresh.has("notes")) {
      applyQuietly(() => applyNotes(remote));
      hashes[NOTES_KEY] = remoteHash;
    }
  }
  const localNotes = rowsHash(noteRows());
  if (localNotes !== hashes[NOTES_KEY]) {
    await uploadDoc(notes.id, FILE_NAMES.notes, notesHtml(), meta().folderId, "notes");
    hashes[NOTES_KEY] = localNotes;
  }
  versions.notes = (await json<DriveFile>(`${FILES_API}/${notes.id}?fields=version`)).version;

  if (gen !== generation) return;
  setMeta({ hashes, versions });
  setStatus({ state: timer === undefined ? "synced" : "pending", at: Date.now(), error: "" });
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Sync failed.";
  if (message === "Signed out.") return;
  if (!isFresh(token)) {
    setStatus({ state: "signed-out", error: message });
    arm();
  } else setStatus({ state: "error", error: message });
}

export function syncNow(interactive = false, full = true) {
  return exclusive(async () => {
    try {
      try {
        await ensureToken(interactive);
      } catch (error) {
        if (interactive) declinedAt = Date.now();
        throw error;
      }
      await runSync(full);
      if (needsRenewal()) arm();
    } catch (error) {
      fail(error);
    }
  });
}

// From a click: Google may show its consent popup.
export function signIn() {
  setMeta({ enabled: true });
  return syncNow(true);
}

export function signOut() {
  generation++;
  disarm();
  if (token) revokeToken(token.value);
  setToken(null);
  window.clearTimeout(timer);
  timer = undefined;
  setMeta({ enabled: false, versions: {}, hashes: {} });
  setStatus({ state: googleClientId() ? "signed-out" : "off", error: "" });
}

function schedulePush() {
  window.clearTimeout(timer);
  setStatus({ state: "pending" });
  timer = window.setTimeout(() => {
    timer = undefined;
    if (!meta().enabled) return;
    if (!isFresh(token)) {
      setStatus({ state: "signed-out", error: "Saved in this browser. Click anywhere on the page and it uploads to Drive." });
      arm();
      return;
    }
    syncNow(false, false);
  }, DEBOUNCE_MS);
}

// Mount once (in App, after unlock): uploads local changes, and picks up Drive edits
// when the app is opened, when its tab comes back into view, and every 30 seconds.
export function useDriveSync(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribeAll((key) => {
      if (applying || !SYNCED_KEYS.has(key) || !meta().enabled) return;
      schedulePush();
    });
    const check = () => {
      if (document.visibilityState !== "visible" || !meta().enabled) return;
      if (needsRenewal()) arm();
      if (isFresh(token) && !busy) syncNow(false, false);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && timer !== undefined && isFresh(token)) syncNow(false, false); // flush before leaving
      else check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    const poll = window.setInterval(check, POLL_MS);

    if (googleClientId()) {
      setStatus({ state: meta().enabled ? "signed-out" : "off" });
      preloadGoogle().catch(() => undefined);
      if (meta().enabled) {
        // A token from earlier this hour is reused as-is; otherwise the first click renews it.
        if (isFresh(token)) syncNow(false, true);
        else {
          setStatus({ state: "signed-out", error: "Click anywhere on the page to load your latest data from Drive." });
          arm();
        }
      }
    }
    return () => {
      unsubscribe();
      disarm();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
      window.clearInterval(poll);
    };
  }, [active]);
}


// ---------- Office export (used by Microsoft Sync, lib/microsoftSync.ts) ----------

const OFFICE: Record<Role, { mime: string; ext: string }> = {
  data: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  logs: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
  notes: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  readme: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
};

export type OfficeFile = { name: string; blob: Blob };

// Saves any pending changes to Drive, then has Drive convert every file in the folder to
// Excel/Word. Call from a click: Google may need to renew the session with a popup.
export async function exportOffice(): Promise<OfficeFile[]> {
  if (!meta().enabled) throw new Error("Connect Google Drive first.");
  await syncNow(true, false);
  if (!isFresh(token)) throw new Error("Google session expired. Click Microsoft Sync again to reconnect.");
  const ids = meta().fileIds;
  const out: OfficeFile[] = [];
  for (const role of Object.keys(FILE_NAMES) as Role[]) {
    const id = ids[role];
    if (!id) continue;
    const { mime, ext } = OFFICE[role];
    const blob = await (await api(`${FILES_API}/${id}/export?mimeType=${encodeURIComponent(mime)}`)).blob();
    out.push({ name: `${FILE_NAMES[role]}.${ext}`, blob });
  }
  if (!out.length) throw new Error("Nothing in the Drive folder yet. Wait for the first sync to finish.");
  return out;
}
