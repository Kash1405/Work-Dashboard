import { useRef, useState, type ReactNode } from "react";
import { Icon, Panel, PanelTitle } from "../components/ui";
import { useMeetings, useSettings, type ActionItem, type Meeting } from "../lib/data";
import { useStored } from "../lib/store";
import { useSyncMeta } from "../lib/sync";
import { dateKey, parseDateKey, timeLabel, uid } from "../lib/utils";

type Draft = Omit<Meeting, "id" | "createdAt" | "updatedAt"> & { editingId: string };

const blankAction = (): ActionItem => ({ id: uid(), task: "", owner: "", due: "", done: false });
const blankDraft = (minuteTaker = ""): Draft => ({
  editingId: "", name: "", date: dateKey(), time: "", location: "", chair: "", minuteTaker, attendees: "", apologies: "",
  objective: "", discussion: "", decisions: "", actions: [blankAction()], nextMeeting: "", notes: "",
});

const TEXT_FIELDS = ["name", "time", "location", "chair", "attendees", "apologies", "objective", "discussion", "decisions", "nextMeeting", "notes"] as const;
const isDirty = (d: Draft) => TEXT_FIELDS.some((k) => d[k].trim()) || d.actions.some((a) => a.task.trim());

const longDate = (key: string) => (key ? parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "");
const stampLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${timeLabel(d)}`;
};

function minutesText(m: Meeting) {
  const lines = [`MEETING MINUTES: ${m.name}`, ""];
  const detail = (label: string, value: string) => value.trim() && lines.push(`${label}: ${value.trim()}`);
  detail("Date", [longDate(m.date), m.time].filter(Boolean).join(", "));
  detail("Location", m.location);
  detail("Chair", m.chair);
  detail("Minute taker", m.minuteTaker);
  const section = (title: string, value: string) => value.trim() && lines.push("", title.toUpperCase(), value.trim());
  section("Attendees", m.attendees);
  section("Apologies", m.apologies);
  section("Purpose & agenda", m.objective);
  section("Discussion", m.discussion);
  section("Decisions", m.decisions);
  if (m.actions.length) {
    lines.push("", "ACTION ITEMS");
    m.actions.forEach((a, i) => lines.push(`${i + 1}. ${a.done ? "[Done] " : ""}${a.task}${a.owner ? ` (Owner: ${a.owner})` : ""}${a.due ? `, due ${longDate(a.due)}` : ""}`));
  }
  section("Next meeting", longDate(m.nextMeeting));
  section("Notes", m.notes);
  return lines.join("\n");
}

export default function Meetings() {
  const [meetings, setMeetings] = useMeetings();
  const [settings] = useSettings();
  const [syncMeta] = useSyncMeta();
  const [draft, setDraft] = useStored<Draft>("meetings.draft", blankDraft(settings.name));
  const formRef = useRef<HTMLFormElement>(null);
  const editing = meetings.find((m) => m.id === draft.editingId);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setAction = (id: string, patch: Partial<ActionItem>) => set("actions", draft.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const reset = () => setDraft(blankDraft(settings.name));
  const submit = () => {
    if (!draft.name.trim()) return;
    const { editingId, ...fields } = draft;
    const now = new Date().toISOString();
    const clean = {
      ...fields,
      name: fields.name.trim(),
      actions: fields.actions.filter((a) => a.task.trim()).map((a) => ({ ...a, task: a.task.trim(), owner: a.owner.trim() })),
    };
    if (editing) setMeetings(meetings.map((m) => (m.id === editingId ? { ...m, ...clean, updatedAt: now } : m)));
    else setMeetings([{ ...clean, id: uid(), createdAt: now, updatedAt: now }, ...meetings]);
    reset();
  };
  const edit = (m: Meeting) => {
    if (draft.editingId !== m.id && isDirty(draft) && !window.confirm("Replace what is in the form with this meeting? The unsaved form will be cleared.")) return;
    const { id, createdAt: _c, updatedAt: _u, ...fields } = m;
    setDraft({ ...fields, actions: m.actions.length ? m.actions.map((a) => ({ ...a })) : [blankAction()], editingId: id });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const remove = (m: Meeting) => {
    if (!window.confirm(`Delete the minutes for “${m.name}”? This also removes them from Drive.`)) return;
    setMeetings(meetings.filter((item) => item.id !== m.id));
    if (draft.editingId === m.id) reset();
  };

  const openActions = meetings.reduce((sum, m) => sum + m.actions.filter((a) => !a.done).length, 0);

  return (
    <main className="page">
      <div className="welcome">
        <div>
          <p className="eyebrow accent">MEETINGS</p>
          <h1>Meeting Minutes</h1>
          <p>{syncMeta.enabled ? "Each submission is logged in Google Drive › Work Dashboard › Dashboard Logs › Meeting Minutes." : "Saved in this browser. Connect Google Drive from the sync menu to log minutes in Drive."}</p>
        </div>
        <div className="meeting-stats">
          <div><strong>{meetings.length}</strong><span>Meetings</span></div>
          <div><strong>{openActions}</strong><span>Open actions</span></div>
        </div>
      </div>

      <div className="meetings-grid">
        <form ref={formRef} className="panel minutes-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
          <div className="minutes-head">
            <div>
              <p className="eyebrow">{editing ? `EDITING · FIRST SUBMITTED ${stampLabel(editing.createdAt).toUpperCase()}` : "TEMPLATE"}</p>
              <h2>{editing ? editing.name : "New meeting minutes"}</h2>
            </div>
            <button type="button" className="text-button" onClick={() => { if (!isDirty(draft) || editing || window.confirm("Clear the form?")) reset(); }}>
              {editing ? "Cancel edit" : "Clear form"}
            </button>
          </div>

          <Section n={1} title="Meeting details">
            <label className="field wide"><span>Meeting name <b>*</b></span><input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Weekly project status – Client X" required/></label>
            <label className="field">Date<input type="date" value={draft.date} onChange={(e) => set("date", e.target.value)}/></label>
            <label className="field">Time<input type="time" value={draft.time} onChange={(e) => set("time", e.target.value)}/></label>
            <label className="field wide">Location / platform<input value={draft.location} onChange={(e) => set("location", e.target.value)} placeholder="Teams, meeting room, client site…"/></label>
            <label className="field">Chair / facilitator<input value={draft.chair} onChange={(e) => set("chair", e.target.value)}/></label>
            <label className="field">Minute taker<input value={draft.minuteTaker} onChange={(e) => set("minuteTaker", e.target.value)}/></label>
          </Section>

          <Section n={2} title="Attendance">
            <label className="field">Attendees<textarea rows={3} value={draft.attendees} onChange={(e) => set("attendees", e.target.value)} placeholder="Name – role / organisation, one per line"/></label>
            <label className="field">Apologies / absent<textarea rows={3} value={draft.apologies} onChange={(e) => set("apologies", e.target.value)}/></label>
          </Section>

          <Section n={3} title="Purpose & agenda">
            <label className="field wide"><span className="sr-only">Purpose and agenda</span><textarea rows={3} value={draft.objective} onChange={(e) => set("objective", e.target.value)} placeholder="Objective of the meeting and the agenda items covered"/></label>
          </Section>

          <Section n={4} title="Discussion summary">
            <label className="field wide"><span className="sr-only">Discussion summary</span><textarea rows={6} value={draft.discussion} onChange={(e) => set("discussion", e.target.value)} placeholder="Key points per agenda item: what was discussed, views raised, risks and issues"/></label>
          </Section>

          <Section n={5} title="Decisions made">
            <label className="field wide"><span className="sr-only">Decisions made</span><textarea rows={3} value={draft.decisions} onChange={(e) => set("decisions", e.target.value)} placeholder="One decision per line"/></label>
          </Section>

          <Section n={6} title="Action items">
            <div className="action-table wide">
              <div className="action-head"><span>Action</span><span>Owner</span><span>Due</span><span/></div>
              {draft.actions.map((a) => (
                <div className="action-row" key={a.id}>
                  <input value={a.task} onChange={(e) => setAction(a.id, { task: e.target.value })} placeholder="What needs to happen" aria-label="Action"/>
                  <input value={a.owner} onChange={(e) => setAction(a.id, { owner: e.target.value })} placeholder="Owner" aria-label="Owner"/>
                  <input type="date" value={a.due} onChange={(e) => setAction(a.id, { due: e.target.value })} aria-label="Due date"/>
                  <button type="button" className="icon-mini" onClick={() => set("actions", draft.actions.length > 1 ? draft.actions.filter((x) => x.id !== a.id) : [blankAction()])} aria-label="Remove action"><Icon name="x" size={13}/></button>
                </div>
              ))}
              <button type="button" className="text-button strong" onClick={() => set("actions", [...draft.actions, blankAction()])}><Icon name="plus" size={13}/> Add action</button>
            </div>
          </Section>

          <Section n={7} title="Next steps">
            <label className="field">Next meeting<input type="date" value={draft.nextMeeting} onChange={(e) => set("nextMeeting", e.target.value)}/></label>
            <label className="field wide">Additional notes<textarea rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)}/></label>
          </Section>

          <div className="minutes-submit">
            <span>{draft.name.trim() ? "" : "Add a meeting name to submit."}</span>
            <button type="submit" className="primary-button" disabled={!draft.name.trim()}><Icon name="check" size={15}/> {editing ? "Save changes" : "Submit minutes"}</button>
          </div>
        </form>

        <MeetingList meetings={meetings} editingId={draft.editingId} onEdit={edit} onDelete={remove}
          onToggleAction={(m, id) => setMeetings(meetings.map((x) => (x.id === m.id ? { ...x, updatedAt: new Date().toISOString(), actions: x.actions.map((a) => (a.id === id ? { ...a, done: !a.done } : a)) } : x)))}/>
      </div>
    </main>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="minutes-section">
      <legend><i>{n}</i>{title}</legend>
      <div className="field-grid">{children}</div>
    </fieldset>
  );
}

function MeetingList({ meetings, editingId, onEdit, onDelete, onToggleAction }: {
  meetings: Meeting[];
  editingId: string;
  onEdit: (m: Meeting) => void;
  onDelete: (m: Meeting) => void;
  onToggleAction: (m: Meeting, actionId: string) => void;
}) {
  const [order, setOrder] = useStored<"newest" | "oldest">("meetings.order", "newest");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const q = query.trim().toLowerCase();
  const list = meetings
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .sort((a, b) => (order === "newest" ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  const toggle = (id: string) => setOpen(open.includes(id) ? open.filter((x) => x !== id) : [...open, id]);
  const copy = async (m: Meeting) => {
    try {
      await navigator.clipboard.writeText(minutesText(m));
      setCopied(m.id);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      window.alert("Your browser blocked copying to the clipboard.");
    }
  };

  return (
    <Panel className="minutes-list">
      <PanelTitle eyebrow="BY DATE FIRST SUBMITTED" title="Previous meetings" action={
        <div className="seg" role="group" aria-label="Sort order">
          <button className={order === "newest" ? "active" : ""} onClick={() => setOrder("newest")}>Newest</button>
          <button className={order === "oldest" ? "active" : ""} onClick={() => setOrder("oldest")}>Oldest</button>
        </div>
      }/>
      {meetings.length > 0 && (
        <label className="search-box"><Icon name="search" size={15}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by meeting name" aria-label="Search meetings"/></label>
      )}
      <div className="meeting-items">
        {list.map((m) => {
          const expanded = open.includes(m.id);
          const pending = m.actions.filter((a) => !a.done).length;
          return (
            <article key={m.id} className={`meeting-item ${expanded ? "open" : ""} ${editingId === m.id ? "editing" : ""}`}>
              <button className="meeting-summary" onClick={() => toggle(m.id)} aria-expanded={expanded}>
                <Icon name="chevron" size={15}/>
                <div>
                  <strong>{m.name}</strong>
                  <small>{[longDate(m.date), pending ? `${pending} open ${pending === 1 ? "action" : "actions"}` : m.actions.length ? "All actions done" : ""].filter(Boolean).join(" · ")}</small>
                </div>
                <time title="First submitted">{stampLabel(m.createdAt)}</time>
              </button>
              {expanded && (
                <div className="meeting-body">
                  <dl className="meeting-meta">
                    <Meta label="Date" value={[longDate(m.date), m.time].filter(Boolean).join(", ")}/>
                    <Meta label="Location" value={m.location}/>
                    <Meta label="Chair" value={m.chair}/>
                    <Meta label="Minute taker" value={m.minuteTaker}/>
                  </dl>
                  <Block title="Attendees" text={m.attendees}/>
                  <Block title="Apologies" text={m.apologies}/>
                  <Block title="Purpose & agenda" text={m.objective}/>
                  <Block title="Discussion" text={m.discussion}/>
                  <Block title="Decisions" text={m.decisions}/>
                  {m.actions.length > 0 && (
                    <div className="meeting-block">
                      <h4>Action items</h4>
                      <ul className="action-list">
                        {m.actions.map((a) => (
                          <li key={a.id} className={a.done ? "done" : ""}>
                            <button className="checkbox" onClick={() => onToggleAction(m, a.id)} aria-label={a.done ? "Mark not done" : "Mark done"}>{a.done && <Icon name="check" size={13}/>}</button>
                            <span>{a.task}</span>
                            <small>{[a.owner, a.due && `due ${longDate(a.due)}`].filter(Boolean).join(" · ")}</small>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Block title="Next meeting" text={longDate(m.nextMeeting)}/>
                  <Block title="Notes" text={m.notes}/>
                  <div className="meeting-foot">
                    <small>First submitted {stampLabel(m.createdAt)}{m.updatedAt !== m.createdAt ? ` · edited ${stampLabel(m.updatedAt)}` : ""}</small>
                    <span>
                      <button className="text-button" onClick={() => copy(m)}><Icon name="copy" size={13}/> {copied === m.id ? "Copied" : "Copy"}</button>
                      <button className="text-button" onClick={() => onDelete(m)}><Icon name="trash" size={13}/> Delete</button>
                      <button className="text-button strong" onClick={() => onEdit(m)}><Icon name="edit" size={13}/> Edit</button>
                    </span>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {meetings.length === 0 && <p className="empty">No minutes yet. Fill in the template and press <b>Submit minutes</b>.</p>}
        {meetings.length > 0 && list.length === 0 && <p className="empty">No meeting names match “{query}”.</p>}
      </div>
    </Panel>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return value.trim() ? <div><dt>{label}</dt><dd>{value}</dd></div> : null;
}

function Block({ title, text }: { title: string; text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="meeting-block">
      <h4>{title}</h4>
      <p>{text.trim()}</p>
    </div>
  );
}
