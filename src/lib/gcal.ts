import { isFresh, preloadGoogle, requestToken, type Token } from "./google";
import { getStored, setStored, useStored } from "./store";
import { addDays, dateKey, pad, timeLabel } from "./utils";

// Google Calendar, straight from the browser: Google Identity Services issues a short-lived
// access token (about an hour) and the Calendar REST API is called with it. No server needed,
// but you must supply your own OAuth Client ID (shared with Drive sync, see lib/google.ts).

const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export type GEvent = { id: string; title: string; date: string; time: string; link: string };
export type GcalSettings = { clientId?: string; enabled: boolean; lastSync: number };
export type GcalStatus = { busy: boolean; error: string; authed: boolean };

const settingsFallback: GcalSettings = { enabled: false, lastSync: 0 };
const statusFallback: GcalStatus = { busy: false, error: "", authed: false };

export const useGcalSettings = () => useStored<GcalSettings>("gcal.settings", settingsFallback);
export const useGcalEvents = () => useStored<GEvent[]>("gcal.events", []);
export const useGcalStatus = () => useStored<GcalStatus>("~gcal.status", statusFallback);

let token: Token | null = null;

const status = (patch: Partial<GcalStatus>) => setStored<GcalStatus>("~gcal.status", (s) => ({ ...s, ...patch }), statusFallback);

export { preloadGoogle };
export const hasToken = () => isFresh(token);

// Call straight from a click: Google may open a popup.
export async function authorize(): Promise<void> {
  const settings = getStored("gcal.settings", settingsFallback);
  token = await requestToken(SCOPE, settings.enabled ? "" : "consent");
  setStored<GcalSettings>("gcal.settings", (s) => ({ ...s, enabled: true }), settingsFallback);
  status({ authed: true, error: "" });
}

async function api(path: string, init: RequestInit = {}) {
  if (!hasToken()) {
    status({ authed: false });
    throw new Error("Google session expired. Click “Sync” to reconnect.");
  }
  const response = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token!.value}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (response.status === 401) {
    token = null;
    status({ authed: false });
    throw new Error("Google session expired. Click “Sync” to reconnect.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Google Calendar error ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

type ApiEvent = { id: string; summary?: string; htmlLink: string; status?: string; start: { date?: string; dateTime?: string } };

function toEvent(e: ApiEvent): GEvent {
  if (e.start.dateTime) {
    const at = new Date(e.start.dateTime);
    return { id: e.id, title: e.summary || "(No title)", date: dateKey(at), time: timeLabel(at), link: e.htmlLink };
  }
  return { id: e.id, title: e.summary || "(No title)", date: e.start.date ?? "", time: "", link: e.htmlLink };
}

export async function syncGoogle() {
  status({ busy: true, error: "" });
  try {
    const params = new URLSearchParams({
      timeMin: addDays(new Date(), -60).toISOString(),
      timeMax: addDays(new Date(), 365).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "500",
    });
    const data = (await api(`?${params}`)) as { items?: ApiEvent[] };
    const events = (data.items ?? []).filter((e) => e.status !== "cancelled").map(toEvent);
    setStored("gcal.events", events);
    setStored<GcalSettings>("gcal.settings", (s) => ({ ...s, lastSync: Date.now() }), settingsFallback);
    status({ busy: false });
  } catch (error) {
    status({ busy: false, error: error instanceof Error ? error.message : "Sync failed." });
    throw error;
  }
}

const localIso = (d: Date) => `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

export async function createGoogleEvent(title: string, date: string, time: string) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let body: Record<string, unknown>;
  if (time) {
    const [h, m] = time.split(":").map(Number);
    const start = new Date(`${date}T00:00:00`);
    start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    body = { summary: title, start: { dateTime: localIso(start), timeZone }, end: { dateTime: localIso(end), timeZone } };
  } else {
    const next = addDays(new Date(`${date}T00:00:00`), 1);
    body = { summary: title, start: { date }, end: { date: dateKey(next) } };
  }
  const created = (await api("", { method: "POST", body: JSON.stringify(body) })) as ApiEvent;
  setStored<GEvent[]>("gcal.events", (events) => [...events, toEvent(created)], []);
}

export async function deleteGoogleEvent(id: string) {
  await api(`/${encodeURIComponent(id)}`, { method: "DELETE" });
  setStored<GEvent[]>("gcal.events", (events) => events.filter((e) => e.id !== id), []);
}

export function disconnectGoogle() {
  token = null;
  setStored<GcalSettings>("gcal.settings", (s) => ({ ...s, enabled: false, lastSync: 0 }), settingsFallback);
  setStored("gcal.events", []);
  status({ authed: false, error: "" });
}
