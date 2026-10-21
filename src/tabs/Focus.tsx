import { useState } from "react";
import { Icon, Panel, PanelTitle } from "../components/ui";
import { timerRemaining, useDailyTasks, useFocusDraft, useFocusFlash, useFocusLogs, useFocusTimer } from "../lib/data";
import { useCompleteSession } from "../lib/focus";
import { dateKey, formatDuration, pad, relativeDay, timeLabel, useNow } from "../lib/utils";

const presets = [15, 25, 45, 60, 90];

export default function Focus() {
  const now = useNow(250);
  const [timer, setTimer] = useFocusTimer();
  const [draft, setDraft] = useFocusDraft();
  const [logs, setLogs] = useFocusLogs();
  const [tasks] = useDailyTasks();
  const [flash, setFlash] = useFocusFlash();
  const [custom, setCustom] = useState("");
  const complete = useCompleteSession();

  const running = timer.endsAt !== null;
  const remaining = timerRemaining(timer, now.getTime());
  const elapsed = timer.duration - remaining;
  const progress = Math.max(0, Math.min(100, (elapsed / timer.duration) * 100));
  const hours = Math.floor(remaining / 3600);
  const display = hours > 0 ? `${hours}:${pad(Math.floor((remaining % 3600) / 60))}:${pad(remaining % 60)}` : `${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)}`;

  const start = () => { setFlash(""); setTimer({ ...timer, endsAt: Date.now() + remaining * 1000 }); };
  const pause = () => setTimer({ ...timer, endsAt: null, remaining });
  const reset = () => setTimer({ ...timer, endsAt: null, remaining: timer.duration });
  const setMinutes = (minutes: number) => {
    if (!(minutes > 0)) return;
    const seconds = Math.round(Math.min(minutes, 600) * 60);
    setTimer({ duration: seconds, endsAt: null, remaining: seconds });
  };
  const pickTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    setDraft({ ...draft, linkedTaskId: id, task: task ? task.text : draft.task });
  };

  const todayKey = dateKey();
  const todayLogs = logs.filter((log) => dateKey(new Date(log.completedAt)) === todayKey);
  const todaySeconds = todayLogs.reduce((sum, log) => sum + log.seconds, 0);
  const totalSeconds = logs.reduce((sum, log) => sum + log.seconds, 0);
  const openTasks = tasks.filter((t) => !t.done);

  return (
    <main className="page focus-page">
      <div className="welcome">
        <div><p className="eyebrow accent">DEEP WORK</p><h1>Focus Control.</h1><p>One objective. One timer. No distractions.</p></div>
        <div className="focus-status"><i className={running ? "running" : ""}/><span>{running ? "Session in progress" : elapsed > 0 ? "Session paused" : "Ready for session"}</span></div>
      </div>

      {flash && (
        <div className="flash"><Icon name="check" size={16}/><span>{flash}</span><button className="icon-mini" onClick={() => setFlash("")} aria-label="Dismiss"><Icon name="x" size={13}/></button></div>
      )}

      <div className="focus-grid">
        <Panel className="timer-panel">
          <PanelTitle eyebrow="SESSION TIMER" title="Current Session" action={<span className="progress-label">{timer.duration >= 60 ? `${Math.round(timer.duration / 60)} min` : `${timer.duration}s`} session</span>}/>
          <div className="timer-dial" style={{ background: `conic-gradient(var(--accent) ${progress}%, var(--track) ${progress}% 100%)` }}>
            <div>
              <span>TIME REMAINING</span>
              <strong>{display}</strong>
              <em>{running ? "STAY FOCUSED" : elapsed > 0 ? "SESSION PAUSED" : "START WHEN READY"}</em>
            </div>
          </div>
          <div className="timer-presets">
            {presets.map((preset) => (
              <button key={preset} className={timer.duration === preset * 60 ? "active" : ""} onClick={() => setMinutes(preset)} disabled={running}>{preset} MIN</button>
            ))}
            <form onSubmit={(event) => { event.preventDefault(); setMinutes(Number(custom)); setCustom(""); }}>
              <input value={custom} onChange={(event) => setCustom(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="Custom" aria-label="Custom minutes" disabled={running}/>
            </form>
          </div>
          <div className="timer-actions">
            <button className="secondary-button" onClick={reset} disabled={!elapsed}>Reset</button>
            <button className="primary-button timer-start" onClick={running ? pause : start} disabled={remaining === 0}>
              <Icon name={running ? "pause" : "play"} size={14}/> {running ? "Pause session" : elapsed > 0 ? "Resume session" : "Start session"}
            </button>
          </div>
        </Panel>

        <Panel className="focus-details">
          <PanelTitle eyebrow="ACTIVE OBJECTIVE" title="What are you working on?"/>
          {openTasks.length > 0 && (
            <>
              <label htmlFor="focus-pick">Pick from today’s tasks</label>
              <select id="focus-pick" value={draft.linkedTaskId} onChange={(event) => pickTask(event.target.value)}>
                <option value="">— Or type your own below —</option>
                {openTasks.map((t) => <option key={t.id} value={t.id}>{t.time ? `${t.time} · ` : ""}{t.text}</option>)}
              </select>
            </>
          )}
          <label htmlFor="focus-name">Task name</label>
          <input id="focus-name" value={draft.task} onChange={(event) => setDraft({ ...draft, task: event.target.value })} placeholder="Name this focus session"/>
          <label htmlFor="focus-description">Description</label>
          <textarea id="focus-description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Define what done looks like..."/>
          <div className="focus-tip">
            <Icon name="bolt" size={17}/>
            <div>
              <strong>Tip</strong>
              <span>{draft.linkedTaskId ? "Logging this session will also tick the task off your daily list." : "Keep the objective specific enough to finish in one session."}</span>
            </div>
          </div>
          <button className="complete-button" onClick={() => complete(Math.max(elapsed, 0))} disabled={!draft.task.trim()}>
            <Icon name="check" size={16}/> Complete & log task{elapsed > 0 ? ` · ${formatDuration(elapsed)}` : ""}
          </button>
        </Panel>
      </div>

      <Panel className="focus-log">
        <PanelTitle eyebrow="SESSION HISTORY" title="Completed Task Log" action={
          <div className="log-summary">
            <span>Today <b>{formatDuration(todaySeconds)}</b> · {todayLogs.length} done</span>
            <span>All time <b>{formatDuration(totalSeconds)}</b></span>
            {logs.length > 0 && <button className="text-button" onClick={() => window.confirm("Clear the whole task log?") && setLogs([])}>Clear log</button>}
          </div>
        }/>
        <div className="log-table">
          <div className="log-header"><span>Task</span><span>Notes</span><span>Time taken</span><span>Completed at</span><span/></div>
          {logs.map((log) => {
            const at = new Date(log.completedAt);
            return (
              <div className="log-row" key={log.id}>
                <div className="log-task"><i><Icon name="check" size={12}/></i><strong>{log.task}</strong></div>
                <p>{log.description || "—"}</p>
                <b>{formatDuration(log.seconds)}</b>
                <time dateTime={log.completedAt}>{relativeDay(at)} · {timeLabel(at)}</time>
                <button className="row-delete" onClick={() => setLogs(logs.filter((item) => item.id !== log.id))} aria-label={`Delete log for ${log.task}`}><Icon name="x" size={13}/></button>
              </div>
            );
          })}
          {logs.length === 0 && <p className="empty padded">Nothing logged yet. Finish a session, or log a task you just completed, and it lands here with the time.</p>}
        </div>
      </Panel>
    </main>
  );
}
