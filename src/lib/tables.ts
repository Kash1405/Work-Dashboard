import type { CalEvent, DailyTask, FocusLog, Goal, Note, QuickLink, Settings } from "./data";
import { peekStored, setStored } from "./store";
import { pad, uid } from "./utils";

// How the dashboard maps onto the "Work Dashboard" folder in Google Drive.
// Every input list is a tab in the "Dashboard Data" sheet, the focus history is a tab in
// "Dashboard Logs", and notes live in the "Notes" doc. Columns are matched by header name,
// so reordering columns or adding extra ones in Sheets is safe.

export type FileRole = "data" | "logs";
export type Cell = string | number | boolean;
export type Table = {
  file: FileRole;
  sheet: string;
  headers: string[];
  keys: string[]; // local store keys this tab is built from
  rows: () => Cell[][];
  apply: (rows: string[][]) => void;
};

// ---------- Cell helpers (Sheets turns typed dates/times into serial numbers) ----------

export const cellText = (v: unknown) => (typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v === null || v === undefined ? "" : String(v));
const n = (s: string) => {
  const parsed = parseFloat(s.replace(/[^0-9.eE-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const yes = (s: string) => /^(true|yes|y|1|x|✓|✔|done)$/i.test(s.trim());
const isSerial = (s: string) => /^\d+(\.\d+)?$/.test(s);
const fromSerial = (s: string) => new Date(Math.round((Number(s) - 25569) * 86400000));
function date(s: string) {
  if (isSerial(s) && Number(s) > 20000) {
    const d = fromSerial(s);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return s.trim().slice(0, 10);
}
function time(s: string) {
  if (isSerial(s) && Number(s) < 1) {
    const mins = Math.round(Number(s) * 1440);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  return m ? `${pad(Number(m[1]))}:${m[2]}` : s.trim();
}
function dateTime(s: string) {
  if (isSerial(s) && Number(s) > 20000) {
    const d = fromSerial(s);
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const get = <T,>(key: string, fallback: T) => peekStored<T>(key) ?? fallback;
const byDateDesc = <T extends Cell[]>(rows: T[]) => rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

// ---------- Dashboard Data ----------

const settingsTable: Table = {
  file: "data",
  sheet: "Settings",
  headers: ["Setting", "Value"],
  keys: ["settings"],
  rows: () => [["Name", get<Settings>("settings", { name: "" }).name]],
  apply: (rows) => {
    const name = rows.find((r) => r[0].trim().toLowerCase() === "name")?.[1];
    if (name !== undefined) setStored<Settings>("settings", (s) => ({ ...s, name }), { name: "" });
  },
};

// A plain list keyed by an ID column; rows added in Sheets without an ID get one.
function listTable<T extends { id: string }>(file: FileRole, sheet: string, key: string, columns: [string, (item: T) => Cell, (s: string) => Partial<T>][]): Table {
  return {
    file,
    sheet,
    headers: ["ID", ...columns.map(([h]) => h)],
    keys: [key],
    rows: () => get<T[]>(key, []).map((item) => [item.id, ...columns.map(([, out]) => out(item))]),
    apply: (rows) => {
      const items = rows
        .filter((r) => r.slice(1).some((c) => c.trim()))
        .map((r) => Object.assign({ id: r[0].trim() || uid() }, ...columns.map(([, , parse], i) => parse(r[i + 1] ?? ""))) as T);
      setStored(key, items);
    },
  };
}

const tasksTable = listTable<DailyTask>("data", "Daily Tasks", "daily.tasks", [
  ["Task", (t) => t.text, (s) => ({ text: s })],
  ["Time", (t) => t.time, (s) => ({ time: time(s) })],
  ["Done", (t) => t.done, (s) => ({ done: yes(s) })],
]);

const goalsTable = listTable<Goal>("data", "Goals", "goals", [
  ["Goal", (g) => g.text, (s) => ({ text: s })],
  ["Tag", (g) => g.tag, (s) => ({ tag: s })],
  ["Progress %", (g) => g.progress, (s) => ({ progress: Math.max(0, Math.min(100, Math.round(n(s) <= 1 && s.includes(".") ? n(s) * 100 : n(s)))) })],
  ["Done", (g) => g.done, (s) => ({ done: yes(s) })],
]);

const eventsTable = listTable<CalEvent>("data", "Calendar Events", "events", [
  ["Date", (e) => e.date, (s) => ({ date: date(s) })],
  ["Time", (e) => e.time, (s) => ({ time: time(s) })],
  ["Title", (e) => e.title, (s) => ({ title: s })],
]);

const linksTable = listTable<QuickLink>("data", "Links", "links", [
  ["Name", (l) => l.name, (s) => ({ name: s.trim() })],
  ["URL", (l) => l.url, (s) => ({ url: s.trim() })],
]);

// ---------- Dashboard Logs ----------

const focusTable: Table = {
  file: "logs",
  sheet: "Focus Sessions",
  headers: ["Completed At", "Task", "Description", "Minutes", "ID"],
  keys: ["focus.logs"],
  rows: () => byDateDesc(get<FocusLog[]>("focus.logs", []).map((l) => [l.completedAt, l.task, l.description, Math.round((l.seconds / 60) * 100) / 100, l.id])),
  apply: (rows) =>
    setStored<FocusLog[]>(
      "focus.logs",
      rows
        .filter((r) => r[0]?.trim())
        .map((r) => ({ completedAt: dateTime(r[0]), task: r[1] ?? "", description: r[2] ?? "", seconds: Math.round(n(r[3] ?? "") * 60), id: r[4]?.trim() || uid() }))
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    ),
};

export const TABLES: Table[] = [settingsTable, linksTable, tasksTable, goalsTable, eventsTable, focusTable];

// ---------- Notes doc ----------
// Each note starts with a heading line "— 2026-10-18 10:21 —"; anything above the first one is ignored.

const NOTE_HEAD = /^[—–-]+\s*(\d{4}-\d{2}-\d{2})(?:[ T,]+(\d{1,2}:\d{2}))?\s*[—–-]+$/;
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const noteRows = (): string[][] => get<Note[]>("notes", []).map((note) => [stamp(note.createdAt), note.text.trim()]);

export function notesHtml() {
  const body = get<Note[]>("notes", [])
    .map((note) => `<p><b>— ${stamp(note.createdAt)} —</b></p>${note.text.trim().split("\n").map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join("")}<p></p>`)
    .join("");
  return `<html><body><h1>Notes</h1><p><i>Kept in sync with your work dashboard. Start a new note with a line like “— 2026-10-18 09:30 —”; it appears on the dashboard at the next sync.</i></p><p></p>${body}</body></html>`;
}

export function parseNotes(text: string): string[][] {
  const rows: string[][] = [];
  let current: { head: string; lines: string[] } | null = null;
  const close = () => {
    if (current) rows.push([current.head, current.lines.join("\n").replace(/ /g, " ").trim()]);
  };
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = NOTE_HEAD.exec(raw.trim());
    if (m) {
      close();
      current = { head: `${m[1]} ${m[2] ? time(m[2]) : "00:00"}`, lines: [] };
    } else if (current) current.lines.push(raw);
  }
  close();
  return rows.filter((r) => r[1]);
}

export function applyNotes(rows: string[][]) {
  const local = get<Note[]>("notes", []);
  setStored<Note[]>(
    "notes",
    rows.map(([head, text]) => {
      const same = local.find((note) => stamp(note.createdAt) === head && note.text.trim() === text);
      if (same) return same;
      const [d, t] = head.split(" ");
      const [y, mo, da] = d.split("-").map(Number);
      const [h, mi] = (t ?? "00:00").split(":").map(Number);
      return { id: uid(), text, createdAt: new Date(y, mo - 1, da, h, mi).toISOString() };
    }),
  );
}
