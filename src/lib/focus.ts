import { useDailyTasks, useFocusDraft, useFocusLogs, useFocusTimer } from "./data";
import { uid } from "./utils";

// Logs the current focus session and resets the timer. Also used when the timer runs out.
export function useCompleteSession() {
  const [timer, setTimer] = useFocusTimer();
  const [draft, setDraft] = useFocusDraft();
  const [logs, setLogs] = useFocusLogs();
  const [tasks, setTasks] = useDailyTasks();
  return (seconds: number) => {
    const task = draft.task.trim() || "Untitled session";
    setLogs([{ id: uid(), task, description: draft.description.trim(), seconds, completedAt: new Date().toISOString() }, ...logs]);
    if (draft.linkedTaskId) setTasks(tasks.map((t) => (t.id === draft.linkedTaskId ? { ...t, done: true } : t)));
    setTimer({ ...timer, endsAt: null, remaining: timer.duration });
    setDraft({ task: "", description: "", linkedTaskId: "" });
  };
}
