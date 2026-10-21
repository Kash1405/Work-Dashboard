import { useStored } from "./store";
import { uid } from "./utils";

export type Tab = "Overview" | "Focus" | "Meetings" | "Guidelines";

export type DailyTask = { id: string; text: string; time: string; done: boolean };
export type Goal = { id: string; text: string; tag: string; progress: number; done: boolean };
export type Note = { id: string; text: string; createdAt: string };
export type CalEvent = { id: string; title: string; date: string; time: string };
export type QuickLink = { id: string; name: string; url: string };
export type Settings = { name: string };

export type ActionItem = { id: string; task: string; owner: string; due: string; done: boolean };
export type Meeting = {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  chair: string;
  minuteTaker: string;
  attendees: string;
  apologies: string;
  objective: string;
  discussion: string;
  decisions: string;
  actions: ActionItem[];
  nextMeeting: string;
  notes: string;
  createdAt: string; // first submitted; the list is sorted by this
  updatedAt: string;
};

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

export const useMeetings = () => useStored<Meeting[]>("meetings", []);

export function timerRemaining(timer: FocusTimer, now = Date.now()) {
  return timer.endsAt ? Math.max(0, Math.ceil((timer.endsAt - now) / 1000)) : timer.remaining;
}

export const quotes = [
  { text: "To achieve anything in this game, you must be prepared to dabble on the boundary of disaster.", by: "Stirling Moss" },
  { text: "If you no longer go for a gap that exists, you are no longer a racing driver.", by: "Ayrton Senna" },
  { text: "Once something is a passion, the motivation is there.", by: "Michael Schumacher" },
  { text: "If everything seems under control, you're just not going fast enough.", by: "Mario Andretti" },
  { text: "Leave me alone, I know what I'm doing.", by: "Kimi Räikkönen" },
  { text: "Aerodynamics are for people who can't build engines.", by: "Enzo Ferrari" },
  { text: "Racing is life. Anything before or after is just waiting.", by: "Steve McQueen" },
  { text: "Straight roads are for fast cars, turns are for fast drivers.", by: "Colin McRae" },
  { text: "The winner ain't the one with the fastest car, it's the one who refuses to lose.", by: "Dale Earnhardt" },
  { text: "Being second is to be the first of the ones who lose.", by: "Ayrton Senna" },
  { text: "Discipline is doing what you hate to do like you love it.", by: "Mike Tyson" },
  { text: "Every man I meet is my master in some part, and in that I learn of him.", by: "Ralph Waldo Emerson" },
  { text: "The only person you are destined to become is the person you decide to be.", by: "Ralph Waldo Emerson" },
  { text: "It is not what happens to you, but how you react to it that matters.", by: "Epictetus" },
  { text: "There is good in everything, only if we look for it.", by: "Laura Ingalls Wilder" },
  { text: "Life has no meaning unless you add meaning to it.", by: "Anonymous" },
  // The panel wraps every quote in “ ”, so this exchange closes and reopens them in the middle.
  { text: "Aren't you worried?” — “Will it help?", by: "Bridge of Spies" },
  { text: "No fear. No distractions. The ability to let that which does not matter truly slide.", by: "Fight Club" },
  { text: "What doesn't kill you, makes you stranger.", by: "Joker, The Dark Knight" },
  { text: "We must either wear out, or rust out, every one of us. My choice is to wear out.", by: "Theodore Roosevelt" },
];
