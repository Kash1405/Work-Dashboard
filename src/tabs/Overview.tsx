import { Fragment, useEffect, useMemo, useState } from "react";
import { Icon, Panel, PanelTitle } from "../components/ui";
import { buildings } from "../lib/buildings";
import { useDailyTasks, useEvents, useGoals, useLinks, useNotes, useSettings, type QuickLink } from "../lib/data";
import { authorize, createGoogleEvent, deleteGoogleEvent, disconnectGoogle, hasToken, preloadGoogle, syncGoogle, useGcalEvents, useGcalSettings, useGcalStatus } from "../lib/gcal";
import { googleClientId, hasEnvClientId, useGoogleClientId } from "../lib/google";
import { atTime, dateKey, pad, parseDateKey, relativeDay, submitOnEnter, timeLabel, uid, useNow } from "../lib/utils";

export default function Overview() {
  const now = useNow(1000);
  return (
    <main className="page">
      <Welcome now={now}/>
      <div className="overview-grid">
        <div className="main-column">
          <NextUp now={now}/>
          <PlanPanel/>
        </div>
        <aside className="side-column">
          <LinksPanel/>
          <CalendarPanel/>
          <NotesPanel/>
        </aside>
      </div>
    </main>
  );
}

function Welcome({ now }: { now: Date }) {
  const [settings, setSettings] = useSettings();
  const [editing, setEditing] = useState(false);
  const hour = now.getHours();
  const greeting = hour < 5 ? "Working late" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace(/_/g, " ");
  const name = settings.name;
  return (
    <div className="welcome">
      <div>
        <p className="eyebrow accent">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()}</p>
        {editing ? (
          <form className="name-form" onSubmit={(event) => { event.preventDefault(); setEditing(false); }}>
            <input autoFocus value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} onBlur={() => setEditing(false)} placeholder="Your name" aria-label="Your name"/>
          </form>
        ) : (
          <h1>
            {greeting}{name ? `, ${name}` : ""}.
            <button className="inline-edit" onClick={() => setEditing(true)} aria-label="Edit your name" title="Edit your name"><Icon name="edit" size={16}/></button>
          </h1>
        )}
        <p>Your tasks, goals and meetings in one place.</p>
      </div>
      <div className="time-block">
        <strong>{pad(now.getHours())}:{pad(now.getMinutes())}<small>:{pad(now.getSeconds())}</small></strong>
        <span>{zone}</span>
      </div>
    </div>
  );
}

// Events kept in this browser, plus Google Calendar while it is linked.
type AgendaEvent = { id: string; title: string; date: string; time: string; source: "local" | "google"; link?: string };

function useCalendar(): AgendaEvent[] {
  const [local] = useEvents();
  const [google] = useGcalEvents();
  const [gcal] = useGcalSettings();
  return useMemo(
    () => [...local.map((e) => ({ ...e, source: "local" as const })), ...(gcal.enabled ? google.map((e) => ({ ...e, source: "google" as const })) : [])],
    [local, google, gcal.enabled],
  );
}

type Upcoming = { key: string; kind: "Meeting" | "Task"; title: string; at: Date; allDay: boolean };

function useUpcoming(now: Date) {
  const events = useCalendar();
  const [tasks] = useDailyTasks();
  const minute = Math.floor(now.getTime() / 60000);
  return useMemo(() => {
    const current = new Date();
    const today = dateKey(current);
    const items: Upcoming[] = [];
    for (const event of events) {
      if (event.date < today) continue;
      const at = atTime(event.date, event.time || undefined);
      if (event.time && at <= current) continue;
      items.push({ key: `e${event.id}`, kind: "Meeting", title: event.title, at, allDay: !event.time });
    }
    for (const task of tasks) {
      if (!task.time || task.done) continue;
      const at = atTime(today, task.time);
      if (at <= current) continue;
      items.push({ key: `t${task.id}`, kind: "Task", title: task.text, at, allDay: false });
    }
    // Timed items first on a given day; all-day events only lead when nothing timed is left today.
    return items.sort((a, b) => a.at.getTime() - b.at.getTime() || Number(a.allDay) - Number(b.allDay));
    // Recompute once a minute, or whenever events/tasks change.
  }, [events, tasks, minute]);
}

function NextUp({ now }: { now: Date }) {
  const upcoming = useUpcoming(now);
  const [picked, setImage] = useState(() => Math.floor(Math.random() * buildings.length));
  const image = picked % buildings.length;
  useEffect(() => {
    const rotation = window.setInterval(() => setImage((current) => (current + 1) % buildings.length), 9000);
    return () => window.clearInterval(rotation);
  }, []);
  const next = upcoming.find((item) => !item.allDay || dateKey(item.at) !== dateKey(now)) ?? upcoming[0];
  const diff = next ? Math.max(0, next.at.getTime() - now.getTime()) : 0;
  const days = Math.floor(diff / 86400000);
  const units: [number, string][] = days > 0
    ? [[days, "DAYS"], [Math.floor(diff / 3600000) % 24, "HRS"], [Math.floor(diff / 60000) % 60, "MIN"]]
    : [[Math.floor(diff / 3600000), "HRS"], [Math.floor(diff / 60000) % 60, "MIN"], [Math.floor(diff / 1000) % 60, "SEC"]];
  const photo = buildings[image];

  return (
    <Panel className="hero-card">
      {buildings.map((b, index) => (
        <img key={b.src} className={`hero-image ${index === image ? "active" : ""}`} src={b.src} alt="" aria-hidden="true" style={{ objectPosition: b.position }} loading={index === image ? "eager" : "lazy"}/>
      ))}
      <div className="hero-shade"/>
      <div className={`hero-copy ${next ? "" : "idle"}`}>
        <span className="live-pill"><i/> UP NEXT · {next ? next.kind.toUpperCase() : "ALL CLEAR"}</span>
        <h2>{next ? next.title : "Nothing scheduled"}</h2>
        <p>
          {next ? <>{relativeDay(next.at)} <span>·</span> {next.allDay ? "All day" : timeLabel(next.at)}</> : "Add a calendar event or a timed task to see it here."}
        </p>
      </div>
      {next && (
        <div className="countdown" aria-label="Countdown">
          {next.allDay && diff === 0 ? (
            <div><strong>TODAY</strong><span>ALL DAY</span></div>
          ) : (
            units.map(([value, label], index) => (
              <Fragment key={label}>
                {index > 0 && <b>:</b>}
                <div><strong>{pad(value)}</strong><span>{label}</span></div>
              </Fragment>
            ))
          )}
        </div>
      )}
      <div className="hero-dots">
        {buildings.map((b, index) => <button key={b.src} className={image === index ? "active" : ""} onClick={() => setImage(index)} aria-label={`Show ${b.title}`}/>)}
      </div>
      <a className="hero-credit" href={photo.source} target="_blank" rel="noreferrer">{photo.title} · Photo: {photo.author}, {photo.license}</a>
    </Panel>
  );
}

function PlanPanel() {
  const [tasks, setTasks] = useDailyTasks();
  const [goals, setGoals] = useGoals();
  const [taskText, setTaskText] = useState("");
  const [taskTime, setTaskTime] = useState("");
  const [goalText, setGoalText] = useState("");
  const [goalTag, setGoalTag] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string; time: string } | null>(null);
  const doneCount = tasks.filter((task) => task.done).length;
  const sortedTasks = [...tasks].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));

  const addTask = () => {
    if (!taskText.trim()) return;
    setTasks([...tasks, { id: uid(), text: taskText.trim(), time: taskTime, done: false }]);
    setTaskText("");
    setTaskTime("");
  };
  const addGoal = () => {
    if (!goalText.trim()) return;
    setGoals([...goals, { id: uid(), text: goalText.trim(), tag: goalTag.trim(), progress: 0, done: false }]);
    setGoalText("");
    setGoalTag("");
  };
  const saveTask = () => {
    if (editing?.text.trim()) setTasks(tasks.map((task) => (task.id === editing.id ? { ...task, text: editing.text.trim(), time: editing.time } : task)));
    setEditing(null);
  };
  const toggleTask = (id: string) => setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  const toggleGoal = (id: string) => setGoals(goals.map((goal) => (goal.id === id ? { ...goal, done: !goal.done, progress: goal.done ? goal.progress : 100 } : goal)));

  return (
    <Panel className="plan-panel">
      <PanelTitle eyebrow="TODAY" title="Tasks & Goals" action={<span className="progress-label">{doneCount} of {tasks.length} tasks done</span>}/>
      <div className="plan-grid">
        <section className="plan-section">
          <div className="subhead"><h3>Daily Tasks</h3><span>Stay until you close them</span></div>
          <div className="task-progress"><span style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%` }}/></div>
          <div className="task-list">
            {sortedTasks.map((task) => editing?.id === task.id ? (
              <form className="task-edit" key={task.id} onSubmit={(event) => { event.preventDefault(); saveTask(); }} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }}>
                <input autoFocus value={editing.text} onChange={(event) => setEditing({ ...editing, text: event.target.value })} aria-label="Task"/>
                <input type="time" value={editing.time} onChange={(event) => setEditing({ ...editing, time: event.target.value })} aria-label="Time (optional)" title="Time (optional)"/>
                <button type="submit" className="text-button strong">Save</button>
                <button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button>
              </form>
            ) : (
              <div className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
                <button className="checkbox" onClick={() => toggleTask(task.id)} aria-label={`${task.done ? "Uncheck" : "Check"} ${task.text}`}>{task.done && <Icon name="check" size={13}/>}</button>
                <span className="task-name" onClick={() => toggleTask(task.id)} onDoubleClick={() => setEditing({ id: task.id, text: task.text, time: task.time })}>{task.text}</span>
                <time>{task.time || "Anytime"}</time>
                <button className="row-delete" onClick={() => setEditing({ id: task.id, text: task.text, time: task.time })} aria-label={`Edit ${task.text}`} title="Edit task"><Icon name="edit" size={13}/></button>
                <button className="row-delete" onClick={() => setTasks(tasks.filter((t) => t.id !== task.id))} aria-label={`Close ${task.text}`} title="Close task"><Icon name="x" size={13}/></button>
              </div>
            ))}
            {tasks.length === 0 && <p className="empty">No tasks yet. Add what you need to get done today.</p>}
          </div>
          <form className="quick-add with-extra" onKeyDown={submitOnEnter} onSubmit={(event) => { event.preventDefault(); addTask(); }}>
            <input value={taskText} onChange={(event) => setTaskText(event.target.value)} placeholder="Add a task..." aria-label="New task"/>
            <input type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} aria-label="Time (optional)" title="Time (optional)"/>
            <button type="submit"><Icon name="plus" size={14}/> Add</button>
          </form>
        </section>

        <section className="plan-section">
          <div className="subhead"><h3>Overall Goals</h3><span>{goals.filter((goal) => goal.done).length} of {goals.length} achieved</span></div>
          <div className="goal-list">
            {goals.map((goal) => (
              <div className={`goal-row ${goal.done ? "done" : ""}`} key={goal.id}>
                <button className="checkbox" onClick={() => toggleGoal(goal.id)} aria-label={`${goal.done ? "Uncheck" : "Check"} ${goal.text}`}>{goal.done && <Icon name="check" size={13}/>}</button>
                <div className="goal-body">
                  <div className="goal-top"><span className="task-name" onClick={() => toggleGoal(goal.id)}>{goal.text}</span>{goal.tag && <em>{goal.tag}</em>}</div>
                  <div className="goal-progress">
                    <input className="goal-slider" type="range" min="0" max="100" step="5" value={goal.progress} aria-label={`${goal.text} progress`} style={{ backgroundSize: `${goal.progress}% 100%` }}
                      onChange={(event) => setGoals(goals.map((item) => (item.id === goal.id ? { ...item, progress: Number(event.target.value), done: Number(event.target.value) === 100 } : item)))}/>
                    <b>{goal.progress}%</b>
                  </div>
                </div>
                <button className="row-delete" onClick={() => setGoals(goals.filter((item) => item.id !== goal.id))} aria-label={`Delete ${goal.text}`}><Icon name="x" size={13}/></button>
              </div>
            ))}
            {goals.length === 0 && <p className="empty">No goals yet. What are you working towards this quarter?</p>}
          </div>
          <form className="quick-add with-extra" onKeyDown={submitOnEnter} onSubmit={(event) => { event.preventDefault(); addGoal(); }}>
            <input value={goalText} onChange={(event) => setGoalText(event.target.value)} placeholder="Add a goal..." aria-label="New goal"/>
            <input className="tag-input" value={goalTag} onChange={(event) => setGoalTag(event.target.value)} placeholder="Tag / deadline" aria-label="Goal tag or deadline"/>
            <button type="submit"><Icon name="plus" size={14}/> Add</button>
          </form>
        </section>
      </div>
    </Panel>
  );
}

function CalendarPanel() {
  const [localEvents, setLocalEvents] = useEvents();
  const [gcal] = useGcalSettings();
  const [gstatus] = useGcalStatus();
  const [storedClientId, setClientId] = useGoogleClientId();
  const clientId = googleClientId() || storedClientId;
  const events = useCalendar();
  const today = dateKey();
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [message, setMessage] = useState("");
  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const eventDays = new Set(events.map((event) => event.date));
  const dayEvents = events.filter((event) => event.date === selected).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const live = gcal.enabled && gstatus.authed;

  useEffect(() => {
    if (clientId) preloadGoogle().catch(() => undefined);
  }, [clientId]);

  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : "Something went wrong.");
  // Gets a token if needed. Call only from a click handler so Google's popup is allowed.
  const ensureGoogle = async () => {
    if (!hasToken()) await authorize();
  };

  const connect = async () => {
    setMessage("");
    try {
      await ensureGoogle();
      await syncGoogle();
      setShowSetup(false);
    } catch (error) {
      report(error);
    }
  };

  const addEvent = async () => {
    if (!title.trim()) return;
    setMessage("");
    const name = title.trim();
    if (gcal.enabled) {
      try {
        await ensureGoogle();
        await createGoogleEvent(name, selected, time);
      } catch (error) {
        report(error);
        return;
      }
    } else {
      setLocalEvents([...localEvents, { id: uid(), title: name, date: selected, time }]);
    }
    setTitle("");
    setTime("");
  };

  const removeEvent = async (event: AgendaEvent) => {
    if (event.source === "local") {
      setLocalEvents(localEvents.filter((item) => item.id !== event.id));
      return;
    }
    if (!window.confirm(`Delete “${event.title}” from your Google Calendar?`)) return;
    try {
      await ensureGoogle();
      await deleteGoogleEvent(event.id);
    } catch (error) {
      report(error);
    }
  };

  const goToday = () => {
    setView(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setSelected(today);
  };

  return (
    <Panel className="calendar-panel">
      <PanelTitle
        eyebrow={view.toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase()}
        title="Calendar"
        action={
          <div className="month-arrows">
            <button onClick={() => setView(new Date(year, month - 1, 1))} aria-label="Previous month">‹</button>
            <button className="today-button" onClick={goToday}>Today</button>
            <button onClick={() => setView(new Date(year, month + 1, 1))} aria-label="Next month">›</button>
          </div>
        }
      />
      <div className="cal-bar">
        {gcal.enabled ? (
          <>
            <span className={`cal-dot ${live ? "on" : ""}`}/>
            <span>{live ? "Google Calendar linked" : "Google Calendar: reconnect to sync"}{gcal.lastSync ? ` · synced ${timeLabel(new Date(gcal.lastSync))}` : ""}</span>
            <button className="text-button strong" onClick={connect} disabled={gstatus.busy}><Icon name="refresh" size={13}/> {gstatus.busy ? "Syncing…" : "Sync"}</button>
            <button className="text-button" onClick={() => setShowSetup(!showSetup)}>Settings</button>
          </>
        ) : (
          <>
            <span className="cal-dot"/>
            <span>Local calendar</span>
            <button className="text-button strong" onClick={() => setShowSetup(!showSetup)}>Link Google Calendar</button>
          </>
        )}
      </div>
      {showSetup && (
        <div className="cal-setup">
          {!hasEnvClientId() && <label>Google OAuth Client ID<input value={clientId} onChange={(event) => setClientId(event.target.value.trim())} placeholder="xxxxxxxx.apps.googleusercontent.com" autoComplete="off"/></label>}
          <details>
            <summary>How to get a Client ID (one-time, ~5 minutes; the same ID also powers Drive sync)</summary>
            <ol>
              <li>Open <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a project, and enable the <b>Google Calendar API</b> and <b>Google Drive API</b>.</li>
              <li>Under <b>OAuth consent screen</b>, choose External, fill in the app name, and add your own Google account as a <b>test user</b>.</li>
              <li>Under <b>Credentials → Create credentials → OAuth client ID</b>, pick <b>Web application</b>.</li>
              <li>In <b>Authorised JavaScript origins</b>, add <code>{window.location.origin}</code> (and your published dashboard address).</li>
              <li>Copy the Client ID into the box above, then click Connect.</li>
            </ol>
          </details>
          <div className="cal-actions">
            <button className="primary-button" onClick={connect} disabled={!clientId || gstatus.busy}>{gcal.enabled ? "Reconnect & sync" : "Connect"}</button>
            {gcal.enabled && <button className="secondary-button" onClick={() => { disconnectGoogle(); setShowSetup(false); }}>Unlink</button>}
          </div>
        </div>
      )}
      {(message || gstatus.error) && <p className="cal-error">{message || gstatus.error}</p>}
      <div className="calendar">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => <b key={i}>{day}</b>)}
        {Array.from({ length: offset }, (_, i) => <span key={`blank${i}`}/>)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
          const classes = [key === today && "today", key === selected && "selected", eventDays.has(key) && "event"].filter(Boolean).join(" ");
          return <button key={key} className={classes} onClick={() => setSelected(key)} aria-label={`${key}${eventDays.has(key) ? ", has events" : ""}`}>{i + 1}</button>;
        })}
      </div>
      <div className="agenda">
        <div className="agenda-head"><small>{relativeDay(parseDateKey(selected)).toUpperCase()}</small><span>{dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}</span></div>
        {dayEvents.map((event) => (
          <div className={`agenda-item ${event.source}`} key={`${event.source}${event.id}`}>
            <i/>
            <div>
              <strong>{event.link ? <a href={event.link} target="_blank" rel="noreferrer">{event.title}</a> : event.title}</strong>
              <span>{event.time || "All day"}{event.source === "google" ? " · Google" : ""}</span>
            </div>
            <button className="row-delete" onClick={() => removeEvent(event)} aria-label={`Delete ${event.title}`}><Icon name="x" size={13}/></button>
          </div>
        ))}
        {dayEvents.length === 0 && <p className="empty">Nothing scheduled. Add an event for this day.</p>}
        <form className="quick-add with-extra" onKeyDown={submitOnEnter} onSubmit={(event) => { event.preventDefault(); addEvent(); }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={gcal.enabled ? "New Google event..." : "New event..."} aria-label="New event title"/>
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Event time (optional)" title="Leave empty for all day"/>
          <button type="submit"><Icon name="plus" size={14}/> Add</button>
        </form>
      </div>
    </Panel>
  );
}

const withScheme = (url: string) => (/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
const hostOf = (url: string) => {
  try {
    return new URL(withScheme(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function LinksPanel() {
  const [links, setLinks] = useLinks();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState<QuickLink | null>(null);
  const [managing, setManaging] = useState(false);

  const addLink = () => {
    if (!url.trim()) return;
    setLinks([...links, { id: uid(), name: name.trim() || hostOf(url.trim()), url: withScheme(url.trim()) }]);
    setName("");
    setUrl("");
  };
  const saveLink = () => {
    if (editing?.url.trim()) setLinks(links.map((link) => (link.id === editing.id ? { ...editing, name: editing.name.trim() || hostOf(editing.url.trim()), url: withScheme(editing.url.trim()) } : link)));
    setEditing(null);
  };

  return (
    <Panel className="links-panel">
      <PanelTitle eyebrow="QUICK ACCESS" title="Links" action={<button className="text-button strong" onClick={() => { setManaging(!managing); setEditing(null); }}>{managing ? "Done" : "Edit"}</button>}/>
      {!managing ? (
        <div className="link-chips">
          {links.map((link) => (
            <a key={link.id} className="link-chip" href={withScheme(link.url)} target="_blank" rel="noreferrer" title={link.url}>
              <i aria-hidden="true">{(link.name.trim()[0] ?? "•").toUpperCase()}</i>
              <span>{link.name}</span>
            </a>
          ))}
          {links.length === 0 && <p className="empty">No links yet. Press <b>Edit</b> to add the sites you open every day.</p>}
        </div>
      ) : (
        <>
          <div className="link-list">
            {links.map((link) => editing?.id === link.id ? (
              <form className="link-edit" key={link.id} onSubmit={(event) => { event.preventDefault(); saveLink(); }} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }}>
                <input autoFocus value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} placeholder="Display name" aria-label="Display name"/>
                <input value={editing.url} onChange={(event) => setEditing({ ...editing, url: event.target.value })} placeholder="https://…" aria-label="URL"/>
                <span><button type="submit" className="text-button strong">Save</button><button type="button" className="text-button" onClick={() => setEditing(null)}>Cancel</button></span>
              </form>
            ) : (
              <div className="link-row" key={link.id}>
                <div><strong>{link.name}</strong><small>{link.url}</small></div>
                <button className="icon-mini" onClick={() => setEditing(link)} aria-label={`Edit ${link.name}`}><Icon name="edit" size={13}/></button>
                <button className="icon-mini" onClick={() => setLinks(links.filter((item) => item.id !== link.id))} aria-label={`Remove ${link.name}`}><Icon name="trash" size={13}/></button>
              </div>
            ))}
          </div>
          <form className="link-add" onKeyDown={submitOnEnter} onSubmit={(event) => { event.preventDefault(); addLink(); }}>
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name" aria-label="New link display name"/>
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Address, e.g. mail.google.com" aria-label="New link address"/>
            <button type="submit" className="secondary-button" disabled={!url.trim()}><Icon name="plus" size={14}/> Add link</button>
          </form>
        </>
      )}
    </Panel>
  );
}

function NotesPanel() {
  const [notes, setNotes] = useNotes();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const addNote = () => {
    if (!draft.trim()) return;
    setNotes([{ id: uid(), text: draft.trim(), createdAt: new Date().toISOString() }, ...notes]);
    setDraft("");
  };
  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setEditText(text);
  };
  const saveEdit = () => {
    if (editText.trim()) setNotes(notes.map((note) => (note.id === editingId ? { ...note, text: editText.trim() } : note)));
    setEditingId(null);
  };

  return (
    <Panel className="notes-panel">
      <PanelTitle eyebrow="QUICK CAPTURE" title="Notes" action={<span className="progress-label">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>}/>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="New note" placeholder="Jot something down... (⌘/Ctrl + Enter to save)"
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); addNote(); } }}/>
      <div className="notes-actions"><button className="primary-button" onClick={addNote} disabled={!draft.trim()}><Icon name="plus" size={14}/> Add note</button></div>
      <div className="note-list">
        {notes.map((note) => (
          <article className="note" key={note.id}>
            {editingId === note.id ? (
              <>
                <textarea autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} aria-label="Edit note"
                  onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) saveEdit(); if (event.key === "Escape") setEditingId(null); }}/>
                <div className="note-foot"><span/><span><button className="text-button" onClick={() => setEditingId(null)}>Cancel</button><button className="text-button strong" onClick={saveEdit}>Save</button></span></div>
              </>
            ) : (
              <>
                <p onDoubleClick={() => startEdit(note.id, note.text)}>{note.text}</p>
                <div className="note-foot">
                  <time>{relativeDay(new Date(note.createdAt))} · {timeLabel(new Date(note.createdAt))}</time>
                  <span>
                    <button className="icon-mini" onClick={() => startEdit(note.id, note.text)} aria-label="Edit note"><Icon name="edit" size={13}/></button>
                    <button className="icon-mini" onClick={() => setNotes(notes.filter((item) => item.id !== note.id))} aria-label="Delete note"><Icon name="trash" size={13}/></button>
                  </span>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}
