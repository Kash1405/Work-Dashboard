import { useState } from "react";
import { Icon, Panel, PanelTitle } from "../components/ui";
import { defaultShortcuts, GUIDE_APPS, useChecklists, useGuideLinks, useShortcuts, type Checklist, type GuideApp, type GuideLink, type Shortcut } from "../lib/guides";
import { useStored } from "../lib/store";
import { submitOnEnter, uid } from "../lib/utils";

export default function Guidelines() {
  const [stored, setApp] = useStored<GuideApp>("ui.guide.app", "Word");
  const app = GUIDE_APPS.some((a) => a.app === stored) ? stored : "Word";
  const [shortcuts] = useShortcuts();
  const [checklists] = useChecklists();
  const [links] = useGuideLinks();

  return (
    <main className="page">
      <div className="welcome">
        <div>
          <p className="eyebrow accent">REFERENCE</p>
          <h1>Guidelines &amp; Shortcuts</h1>
          <p>Shortcuts, quality checklists and links for the tools you use every day. Everything here is editable and syncs to Drive.</p>
        </div>
      </div>

      <nav className="guide-apps" aria-label="Guideline sections">
        {GUIDE_APPS.map(({ app: a, letter, blurb }) => (
          <button key={a} className={`guide-app ${a.toLowerCase()} ${a === app ? "active" : ""}`} onClick={() => setApp(a)} aria-pressed={a === app}>
            <i aria-hidden="true">{letter}</i>
            <div>
              <strong>{a}</strong>
              <small>{blurb}</small>
            </div>
            <span>{shortcuts.filter((s) => s.app === a).length} shortcuts · {checklists.filter((c) => c.app === a).length} checklists · {links.filter((l) => l.app === a).length} links</span>
          </button>
        ))}
      </nav>

      <ShortcutsPanel app={app} key={`s${app}`}/>
      <div className="guide-grid">
        <ChecklistsPanel app={app} key={`c${app}`}/>
        <GuideLinksPanel app={app} key={`l${app}`}/>
      </div>
    </main>
  );
}

// "Ctrl+Shift+L / Ctrl+M" → key caps, keeping the separators as plain text.
function Keys({ keys }: { keys: string }) {
  // split() with a capture group alternates key, separator, key…
  const parts = keys.split(/(\s*\+\s*|\s*,\s*|\s+\/\s+|\s+then\s+|\s+or\s+)/i);
  return (
    <span className="keys">
      {parts.map((part, i) => (!part.trim() ? null : i % 2 ? <span key={i} className="key-sep">{part.trim()}</span> : <kbd key={i}>{part.trim()}</kbd>))}
    </span>
  );
}

function ShortcutsPanel({ app }: { app: GuideApp }) {
  const [all, setAll] = useShortcuts();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ task: "", keys: "", description: "" });
  const rows = all.filter((s) => s.app === app);
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((s) => `${s.task} ${s.keys} ${s.description}`.toLowerCase().includes(q)) : rows;
  const missingDefaults = defaultShortcuts.filter((d) => d.app === app && !all.some((s) => s.id === d.id));

  const update = (id: string, patch: Partial<Shortcut>) => setAll(all.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const add = () => {
    if (!draft.task.trim() && !draft.keys.trim()) return;
    setAll([...all, { id: uid(), app, task: draft.task.trim(), keys: draft.keys.trim(), description: draft.description.trim() }]);
    setDraft({ task: "", keys: "", description: "" });
  };

  return (
    <Panel className="shortcuts-panel">
      <PanelTitle eyebrow="1 · SHORTCUTS" title={`${app} shortcuts`} action={
        <div className="panel-tools">
          <label className="search-box compact"><Icon name="search" size={14}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter shortcuts" aria-label="Filter shortcuts"/></label>
          <button className="text-button strong" onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>
        </div>
      }/>
      <div className={`shortcut-table ${editing ? "editing" : ""}`} role="table" aria-label={`${app} shortcuts`}>
        <div className="shortcut-head" role="row"><span role="columnheader">Task</span><span role="columnheader">Shortcut</span><span role="columnheader">Description</span>{editing && <span/>}</div>
        {shown.map((s) => editing ? (
          <div className="shortcut-row" role="row" key={s.id}>
            <input value={s.task} onChange={(e) => update(s.id, { task: e.target.value })} aria-label="Task"/>
            <input className="mono" value={s.keys} onChange={(e) => update(s.id, { keys: e.target.value })} aria-label="Shortcut"/>
            <input value={s.description} onChange={(e) => update(s.id, { description: e.target.value })} aria-label="Description"/>
            <button className="icon-mini" onClick={() => setAll(all.filter((x) => x.id !== s.id))} aria-label={`Delete ${s.task}`}><Icon name="trash" size={13}/></button>
          </div>
        ) : (
          <div className="shortcut-row" role="row" key={s.id} onDoubleClick={() => setEditing(true)}>
            <strong role="cell">{s.task}</strong>
            <span role="cell"><Keys keys={s.keys}/></span>
            <p role="cell">{s.description}</p>
          </div>
        ))}
        {rows.length === 0 && <p className="empty padded">No shortcuts yet. Press <b>Edit</b> to add some.</p>}
        {rows.length > 0 && shown.length === 0 && <p className="empty padded">Nothing matches “{query}”.</p>}
      </div>
      {editing && (
        <>
          <form className="shortcut-add" onKeyDown={submitOnEnter} onSubmit={(e) => { e.preventDefault(); add(); }}>
            <input value={draft.task} onChange={(e) => setDraft({ ...draft, task: e.target.value })} placeholder="Task" aria-label="New task"/>
            <input className="mono" value={draft.keys} onChange={(e) => setDraft({ ...draft, keys: e.target.value })} placeholder="e.g. Ctrl+Shift+L" aria-label="New shortcut"/>
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description" aria-label="New description"/>
            <button type="submit" className="secondary-button" disabled={!draft.task.trim() && !draft.keys.trim()}><Icon name="plus" size={14}/> Add row</button>
          </form>
          {missingDefaults.length > 0 && (
            <button className="text-button" onClick={() => setAll([...all, ...missingDefaults])}><Icon name="refresh" size={13}/> Restore {missingDefaults.length} removed default {missingDefaults.length === 1 ? "shortcut" : "shortcuts"}</button>
          )}
        </>
      )}
    </Panel>
  );
}

function ChecklistsPanel({ app }: { app: GuideApp }) {
  const [all, setAll] = useChecklists();
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const lists = all.filter((c) => c.app === app);

  const update = (id: string, change: (c: Checklist) => Checklist) => setAll(all.map((c) => (c.id === id ? change(c) : c)));
  const create = () => {
    if (!newTitle.trim()) return;
    setAll([...all, { id: uid(), app, title: newTitle.trim(), items: [] }]);
    setNewTitle("");
    setAdding(false);
  };

  return (
    <Panel className="checklists-panel">
      <PanelTitle eyebrow="2 · CHECKLISTS" title="Quality checklists" action={<button className="text-button strong" onClick={() => setAdding(!adding)}><Icon name="plus" size={13}/> New checklist</button>}/>
      {adding && (
        <form className="quick-add checklist-new" onSubmit={(e) => { e.preventDefault(); create(); }} onKeyDown={(e) => { if (e.key === "Escape") setAdding(false); }}>
          <input autoFocus value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={`Checklist name, e.g. “${app} client deliverable”`} aria-label="New checklist name"/>
          <button type="submit" disabled={!newTitle.trim()}><Icon name="plus" size={14}/> Create</button>
        </form>
      )}
      <div className="checklist-grid">
        {lists.map((c) => <ChecklistCard key={c.id} list={c} onChange={(change) => update(c.id, change)} onDelete={() => setAll(all.filter((x) => x.id !== c.id))}/>)}
        {lists.length === 0 && <p className="empty">No checklists for {app} yet. Press <b>New checklist</b> to add one.</p>}
      </div>
    </Panel>
  );
}

function ChecklistCard({ list, onChange, onDelete }: { list: Checklist; onChange: (change: (c: Checklist) => Checklist) => void; onDelete: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [text, setText] = useState("");
  const [editId, setEditId] = useState("");
  const [editText, setEditText] = useState("");
  const done = list.items.filter((i) => i.done).length;
  const pct = list.items.length ? Math.round((done / list.items.length) * 100) : 0;

  const saveTitle = () => {
    if (title.trim()) onChange((c) => ({ ...c, title: title.trim() }));
    setRenaming(false);
  };
  const saveItem = () => {
    if (editText.trim()) onChange((c) => ({ ...c, items: c.items.map((i) => (i.id === editId ? { ...i, text: editText.trim() } : i)) }));
    setEditId("");
  };
  const addItem = () => {
    if (!text.trim()) return;
    onChange((c) => ({ ...c, items: [...c.items, { id: uid(), text: text.trim(), done: false }] }));
    setText("");
  };

  return (
    <article className={`checklist-card ${list.items.length && done === list.items.length ? "complete" : ""}`}>
      <header>
        {renaming ? (
          <form className="checklist-rename" onSubmit={(e) => { e.preventDefault(); saveTitle(); }} onKeyDown={(e) => { if (e.key === "Escape") setRenaming(false); }}>
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} aria-label="Checklist name"/>
          </form>
        ) : (
          <h3 onDoubleClick={() => { setTitle(list.title); setRenaming(true); }}>{list.title}</h3>
        )}
        <span>
          <button className="icon-mini" onClick={() => { setTitle(list.title); setRenaming(true); }} aria-label="Rename checklist" title="Rename"><Icon name="edit" size={13}/></button>
          <button className="icon-mini" onClick={() => { if (window.confirm(`Delete the “${list.title}” checklist?`)) onDelete(); }} aria-label="Delete checklist" title="Delete"><Icon name="trash" size={13}/></button>
        </span>
      </header>
      <div className="checklist-progress">
        <div className="task-progress"><span style={{ width: `${pct}%` }}/></div>
        <small>{done}/{list.items.length}</small>
        {done > 0 && <button className="text-button" onClick={() => onChange((c) => ({ ...c, items: c.items.map((i) => ({ ...i, done: false })) }))}>Reset</button>}
      </div>
      <ul className="checklist-items">
        {list.items.map((item) => (
          <li key={item.id} className={item.done ? "done" : ""}>
            <button className="checkbox" onClick={() => onChange((c) => ({ ...c, items: c.items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) }))} aria-label={item.done ? "Untick" : "Tick"}>{item.done && <Icon name="check" size={13}/>}</button>
            {editId === item.id ? (
              <form onSubmit={(e) => { e.preventDefault(); saveItem(); }} onKeyDown={(e) => { if (e.key === "Escape") setEditId(""); }}>
                <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onBlur={saveItem} aria-label="Edit item"/>
              </form>
            ) : (
              <span onDoubleClick={() => { setEditId(item.id); setEditText(item.text); }}>{item.text}</span>
            )}
            <span className="item-actions">
              <button className="row-delete" onClick={() => { setEditId(item.id); setEditText(item.text); }} aria-label="Edit item"><Icon name="edit" size={12}/></button>
              <button className="row-delete" onClick={() => onChange((c) => ({ ...c, items: c.items.filter((i) => i.id !== item.id) }))} aria-label="Delete item"><Icon name="x" size={12}/></button>
            </span>
          </li>
        ))}
      </ul>
      <form className="quick-add" onSubmit={(e) => { e.preventDefault(); addItem(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add an item..." aria-label={`Add an item to ${list.title}`}/>
        <button type="submit" disabled={!text.trim()}><Icon name="plus" size={14}/></button>
      </form>
    </article>
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

function GuideLinksPanel({ app }: { app: GuideApp }) {
  const [all, setAll] = useGuideLinks();
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const links = all.filter((l) => l.app === app);

  const update = (id: string, patch: Partial<GuideLink>) => setAll(all.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const add = () => {
    if (!url.trim()) return;
    setAll([...all, { id: uid(), app, name: name.trim() || hostOf(url.trim()), url: withScheme(url.trim()) }]);
    setName("");
    setUrl("");
  };

  return (
    <Panel className="guide-links-panel">
      <PanelTitle eyebrow="3 · LINKS" title="Reference links" action={<button className="text-button strong" onClick={() => setManaging(!managing)}>{managing ? "Done" : "Edit"}</button>}/>
      <div className="guide-links">
        {links.map((l) => managing ? (
          <div className="link-edit" key={l.id}>
            <input value={l.name} onChange={(e) => update(l.id, { name: e.target.value })} placeholder="Display name" aria-label="Display name"/>
            <span>
              <input value={l.url} onChange={(e) => update(l.id, { url: e.target.value })} placeholder="https://…" aria-label="URL"/>
              <button className="icon-mini" onClick={() => setAll(all.filter((x) => x.id !== l.id))} aria-label={`Remove ${l.name}`}><Icon name="trash" size={13}/></button>
            </span>
          </div>
        ) : (
          <a key={l.id} className="guide-link" href={withScheme(l.url)} target="_blank" rel="noreferrer" title={l.url}>
            <i><Icon name="link" size={14}/></i>
            <div><strong>{l.name}</strong><small>{hostOf(l.url)}</small></div>
            <Icon name="external" size={14}/>
          </a>
        ))}
        {links.length === 0 && !managing && <p className="empty">No {app} links yet. Press <b>Edit</b> to add templates, brand guides or training pages.</p>}
      </div>
      {managing && (
        <form className="link-add" onKeyDown={submitOnEnter} onSubmit={(e) => { e.preventDefault(); add(); }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" aria-label="New link display name"/>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Address, e.g. sharepoint.com/…" aria-label="New link address"/>
          <button type="submit" className="secondary-button" disabled={!url.trim()}><Icon name="plus" size={14}/> Add link</button>
        </form>
      )}
    </Panel>
  );
}
