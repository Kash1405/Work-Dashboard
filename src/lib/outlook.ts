import { graph } from "./microsoft";
import { setStored, useStored } from "./store";
import { addDays, dateKey } from "./utils";

// Outlook Calendar through Microsoft Graph, both ways: events from your work calendar load into the
// dashboard (every 5 minutes, and on demand), and events added or deleted here are written straight
// to Outlook. Uses the same Microsoft sign-in as OneDrive sync (lib/microsoft.ts).

export type OEvent = { id: string; title: string; date: string; time: string; endTime: string; link: string; online: string };
export type OutlookStatus = { busy: boolean; error: string; lastSync: number; lastTry: number };

const statusFallback: OutlookStatus = { busy: false, error: "", lastSync: 0, lastTry: 0 };
export const useOutlookEvents = () => useStored<OEvent[]>("outlook.events", []);
export const useOutlookStatus = () => useStored<OutlookStatus>("~outlook.status", statusFallback);

const status = (patch: Partial<OutlookStatus>) => setStored<OutlookStatus>("~outlook.status", (s) => ({ ...s, ...patch }), statusFallback);
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
// Times come back in this browser's time zone thanks to the Prefer header.
const zoned = () => ({ Prefer: `outlook.timezone="${timeZone()}"` });

type ApiEvent = {
  id: string;
  subject?: string;
  isAllDay?: boolean;
  isCancelled?: boolean;
  webLink?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  onlineMeeting?: { joinUrl?: string } | null;
};

const toEvent = (e: ApiEvent): OEvent => ({
  id: e.id,
  title: e.subject || "(No title)",
  date: e.start.dateTime.slice(0, 10),
  time: e.isAllDay ? "" : e.start.dateTime.slice(11, 16),
  endTime: e.isAllDay ? "" : e.end.dateTime.slice(11, 16),
  link: e.webLink ?? "",
  online: e.onlineMeeting?.joinUrl ?? "",
});

const SELECT = "id,subject,isAllDay,isCancelled,webLink,start,end,onlineMeeting";

export async function syncOutlook(interactive = false) {
  status({ busy: true, error: "", lastTry: Date.now() });
  try {
    const params = new URLSearchParams({
      startDateTime: addDays(new Date(), -60).toISOString(),
      endDateTime: addDays(new Date(), 365).toISOString(),
      $select: SELECT,
      $orderby: "start/dateTime",
      $top: "250",
    });
    const events: OEvent[] = [];
    let next: string | undefined = `/me/calendarView?${params}`;
    while (next) {
      const page = (await (await graph(next, { headers: zoned() }, interactive)).json()) as { value: ApiEvent[]; "@odata.nextLink"?: string };
      events.push(...page.value.filter((e) => !e.isCancelled).map(toEvent));
      next = page["@odata.nextLink"];
    }
    setStored("outlook.events", events);
    status({ busy: false, lastSync: Date.now() });
  } catch (error) {
    status({ busy: false, error: error instanceof Error ? error.message : "Calendar sync failed." });
    throw error;
  }
}

const at = (date: string, time: string) => `${date}T${time}:00`;

// No time → an all-day event. Otherwise one hour, or until `endTime` when given.
export async function createOutlookEvent(title: string, date: string, time: string, endTime = "") {
  const zone = timeZone();
  let body: Record<string, unknown>;
  if (time) {
    const [h, m] = time.split(":").map(Number);
    const fallbackEnd = `${String(Math.min(h + 1, 23)).padStart(2, "0")}:${h >= 23 ? "59" : String(m).padStart(2, "0")}`;
    const end = endTime && endTime > time ? endTime : fallbackEnd;
    body = { subject: title, start: { dateTime: at(date, time), timeZone: zone }, end: { dateTime: at(date, end), timeZone: zone } };
  } else {
    const next = dateKey(addDays(new Date(`${date}T00:00:00`), 1));
    body = { subject: title, isAllDay: true, start: { dateTime: at(date, "00:00"), timeZone: zone }, end: { dateTime: at(next, "00:00"), timeZone: zone } };
  }
  const created = (await (await graph(`/me/events?$select=${SELECT}`, { method: "POST", headers: { "Content-Type": "application/json", ...zoned() }, body: JSON.stringify(body) }, true)).json()) as ApiEvent;
  setStored<OEvent[]>("outlook.events", (events) => [...events, toEvent(created)], []);
}

export async function deleteOutlookEvent(id: string) {
  await graph(`/me/events/${encodeURIComponent(id)}`, { method: "DELETE" }, true);
  setStored<OEvent[]>("outlook.events", (events) => events.filter((e) => e.id !== id), []);
}

export function clearOutlook() {
  setStored("outlook.events", []);
  status({ ...statusFallback });
}
