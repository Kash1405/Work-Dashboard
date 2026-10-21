import { useStored } from "./store";
import { uid } from "./utils";

export type Tab = "Overview" | "Focus";

export type DailyTask = { id: string; text: string; time: string; done: boolean };
export type Goal = { id: string; text: string; tag: string; progress: number; done: boolean };
export type Note = { id: string; text: string; createdAt: string };
export type CalEvent = { id: string; title: string; date: string; time: string };
export type QuickLink = { id: string; name: string; url: string };
export type Settings = { name: string };

export type FocusTimer = { duration: number; endsAt: number | null; remaining: number };
export type FocusLog = { id: string; task: string; description: string; seconds: number; completedAt: string };
export type FocusDraft = { task: string; description: string; linkedTaskId: string };

const defaultNotes: Note[] = [
  { id: uid(), text: "Welcome to your work dashboard. Add notes above, edit them with the pencil (or double-click), and they save automatically.", createdAt: new Date().toISOString() },
];

export const useSettings = () => useStored<Settings>("settings", { name: "" });
export const useDailyTasks = () => useStored<DailyTask[]>("daily.tasks", []);
export const useGoals = () => useStored<Goal[]>("goals", []);
export const useNotes = () => useStored<Note[]>("notes", defaultNotes);
// Used only while Outlook is not connected.
export const useEvents = () => useStored<CalEvent[]>("events", []);
export const useLinks = () => useStored<QuickLink[]>("links", []);

export const useFocusTimer = () => useStored<FocusTimer>("focus.timer", { duration: 25 * 60, endsAt: null, remaining: 25 * 60 });
export const useFocusDraft = () => useStored<FocusDraft>("focus.draft", { task: "", description: "", linkedTaskId: "" });
export const useFocusLogs = () => useStored<FocusLog[]>("focus.logs", []);
export const useFocusFlash = () => useStored<string>("~focus.flash", "");

export function timerRemaining(timer: FocusTimer, now = Date.now()) {
  return timer.endsAt ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : timer.remaining;
}
