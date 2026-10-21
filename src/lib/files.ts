import type { DailyTask, FocusLog, Goal, Note, QuickLink, Settings } from "./data";
import { peekStored, setStored } from "./store";
import { dateKey, pad, timeLabel, uid } from "./utils";

// How the dashboard maps onto the "Work Dashboard" folder in OneDrive for Business (your personal
// SharePoint). Each list is a CSV file that opens in Excel; notes are a plain text file. CSV columns
// are matched by header name, so reordering columns or adding extra ones in Excel is safe.

export type Cell = string | number | boolean;
export type SyncFile = {
  name: string;
  keys: string[]; // local store keys this file is built from
  text: () => string; // this device's content
  canon: (text: string) => string; // same string for the same data, however the file is formatted
  apply: (text: string) => void; // load the file's content into this device
};

// ---------- CSV ----------

const cellText = (v: unknown) => (typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v === null || v === undefined ? "" : String(v));
const quote = (s: string) => (/[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
export const toCsv = (rows: Cell[][]) => rows.map((r) => r.map((c) => quote(cellText(c))).join(",")).join("\r\n") + "\r\n";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Drop trailing blank cells and blank rows, so Excel's formatting quirks don't count as edits.
const normalise = (rows: string[][]) =>
  rows.map((r) => {
    const cells = r.map((c) => c.trim());
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    return cells;
  }).filter((r) => r.length);

// Rows lined up with our headers by name.
function aligned(text: string, headers: string[]) {
  const [head = [], ...rows] = parseCsv(text);
  const names = head.map((h) => h.trim().toLowerCase());
  const index = headers.map((h) => names.indexOf(h.toLowerCase()));
  return normalise(rows.map((r) => index.map((c) => (c >= 0 ? r[c] ?? "" : ""))));
}

const yes = (s: string) => /^(true|yes|y|1|x|✓|✔|done)$/i.test(s.trim());
const n = (s: string) => {
  const parsed = parseFloat(s.replace(/[^0-9.eE-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const hhmm = (s: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  return m ? `${pad(Number(m[1]))}:${m[2]}` : "";
};
const get = <T,>(key: string, fallback: T) => peekStored<T>(key) ?? fallback;

function csvFile(name: string, headers: string[], keys: string[], rows: () => Cell[][], apply: (rows: string[][]) => void): SyncFile {
  return {
    name,
    keys,
    text: () => toCsv([headers, ...rows()]),
    canon: (text) => JSON.stringify(aligned(text, headers)),
    apply: (text) => apply(aligned(text, headers)),
  };
}

// ---------- Files ----------

const settingsFile = csvFile("Settings.csv", ["Setting", "Value"], ["settings"],
  () => [["Name", get<Settings>("settings", { name: "" }).name]],
  (rows) => {
    const name = rows.find((r) => r[0]?.toLowerCase() === "name")?.[1];
    if (name !== undefined) setStored<Settings>("settings", (s) => ({ ...s, name }), { name: "" });
  });

const tasksFile = csvFile("Tasks.csv", ["ID", "Task", "Time", "Done"], ["daily.tasks"],
  () => get<DailyTask[]>("daily.tasks", []).map((t) => [t.id, t.text, t.time, t.done]),
  (rows) => setStored<DailyTask[]>("daily.tasks", rows.filter((r) => r[1]).map((r) => ({ id: r[0] || uid(), text: r[1], time: hhmm(r[2] ?? ""), done: yes(r[3] ?? "") }))));

const goalsFile = csvFile("Goals.csv", ["ID", "Goal", "Tag", "Progress %", "Done"], ["goals"],
  () => get<Goal[]>("goals", []).map((g) => [g.id, g.text, g.tag, g.progress, g.done]),
  (rows) => setStored<Goal[]>("goals", rows.filter((r) => r[1]).map((r) => {
    const progress = Math.max(0, Math.min(100, Math.round(n(r[3] ?? ""))));
    return { id: r[0] || uid(), text: r[1], tag: r[2] ?? "", progress, done: yes(r[4] ?? "") || progress === 100 };
  })));

const linksFile = csvFile("Links.csv", ["ID", "Name", "URL"], ["links"],
  () => get<QuickLink[]>("links", []).map((l) => [l.id, l.name, l.url]),
  (rows) => setStored<QuickLink[]>("links", rows.filter((r) => r[2]).map((r) => ({ id: r[0] || uid(), name: r[1] || r[2], url: r[2] }))));

const focusFile = csvFile("Focus Log.csv", ["ID", "Completed At", "Task", "Notes", "Seconds", "Minutes"], ["focus.logs"],
  () => get<FocusLog[]>("focus.logs", []).map((l) => [l.id, l.completedAt, l.task, l.description, l.seconds, Math.round(l.seconds / 6) / 10]),
  (rows) => setStored<FocusLog[]>("focus.logs", rows.filter((r) => r[2]).map((r) => {
    const at = new Date(r[1] ?? "");
    const seconds = r[4] ? Math.round(n(r[4])) : Math.round(n(r[5] ?? "") * 60);
    return { id: r[0] || uid(), completedAt: Number.isNaN(at.getTime()) ? new Date().toISOString() : at.toISOString(), task: r[2], description: r[3] ?? "", seconds };
  }).sort((a, b) => b.completedAt.localeCompare(a.completedAt))));

// Notes.txt: each note starts with a line like "--- 2026-10-21 09:30 ---".
const NOTE_LINE = /^---\s*(\d{4}-\d{2}-\d{2})(?:[ T](\d{1,2}:\d{2}))?\s*---\s*$/;
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${dateKey(d)} ${timeLabel(d)}`;
};

function parseNotes(text: string) {
  const notes: { at: string; text: string }[] = [];
  let current: { at: string; lines: string[] } | null = null;
  const flush = () => {
    if (current && current.lines.join("\n").trim()) notes.push({ at: current.at, text: current.lines.join("\n").trim() });
  };
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = NOTE_LINE.exec(line);
    if (m) {
      flush();
      current = { at: `${m[1]} ${hhmm(m[2] ?? "") || "00:00"}`, lines: [] };
    } else if (current) current.lines.push(line);
    else if (line.trim()) current = { at: stamp(new Date().toISOString()), lines: [line] }; // text above the first marker
  }
  flush();
  return notes;
}

const notesFile: SyncFile = {
  name: "Notes.txt",
  keys: ["notes"],
  text: () => get<Note[]>("notes", []).map((note) => `--- ${stamp(note.createdAt)} ---\r\n${note.text.replace(/\r?\n/g, "\r\n")}\r\n`).join("\r\n"),
  canon: (text) => JSON.stringify(parseNotes(text)),
  apply: (text) => {
    const local = get<Note[]>("notes", []);
    setStored<Note[]>("notes", parseNotes(text).map((note) => {
      // Keep IDs (and exact times) for notes that did not change.
      const same = local.find((l) => l.text.trim() === note.text && stamp(l.createdAt) === note.at);
      return same ?? { id: uid(), text: note.text, createdAt: new Date(note.at.replace(" ", "T")).toISOString() };
    }));
  },
};

export const FILES: SyncFile[] = [tasksFile, goalsFile, linksFile, focusFile, settingsFile, notesFile];

export const README = `WORK DASHBOARD
==============

This folder is the source of truth for your Work Dashboard. The dashboard reads from it and writes back to it.

What is here
- Tasks.csv, Goals.csv, Links.csv, Settings.csv: your inputs. They open in Excel.
- Focus Log.csv: every completed focus session.
- Notes.txt: your notes. Each one starts with a line like "--- 2026-10-21 09:30 ---".

How syncing works
- Changes in the dashboard are saved here a couple of seconds after you make them.
- You can edit these files directly (keep them as CSV when saving from Excel). The dashboard checks for edits every 30 seconds and whenever you switch back to it.
- If the same file was changed in both places, the version here wins.
- Keep the header row and the ID column. Leave the ID empty on a new row and the dashboard fills it in.
- Times are HH:MM. Done columns take TRUE/FALSE.

Your calendar is your Outlook calendar; it is not stored here.
`;
