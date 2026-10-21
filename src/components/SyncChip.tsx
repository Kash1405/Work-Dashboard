import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { googleClientId, hasEnvClientId, preloadGoogle, useGoogleClientId } from "../lib/google";
import { exportAll, importAll } from "../lib/store";
import { canPickFolder, chooseFolder, microsoftSync, useMsSyncMeta, useMsSyncStatus } from "../lib/microsoftSync";
import { fileUrl, folderUrl, signIn, signOut, syncNow, useSyncMeta, useSyncStatus } from "../lib/sync";
import { dateKey, downloadFile, timeLabel } from "../lib/utils";
import { Icon } from "./ui";

const driveFiles = [
  { role: "data", label: "Dashboard Data", hint: "Sheet · inputs" },
  { role: "logs", label: "Dashboard Logs", hint: "Sheet · history" },
  { role: "notes", label: "Notes", hint: "Doc" },
] as const;

export default function SyncChip() {
  const [status] = useSyncStatus();
  const [meta] = useSyncMeta();
  const [msMeta] = useMsSyncMeta();
  const [msStatus] = useMsSyncStatus();
  const [stored, setClientId] = useGoogleClientId();
  const clientId = googleClientId() || stored;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (clientId) preloadGoogle().catch(() => undefined);
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, clientId]);

  const onImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!window.confirm("Replace the data in this browser with the backup? It will then be saved to Google Drive.")) return;
      importAll(payload);
      window.alert("Backup restored.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not read that file.");
    }
  };

  const state = clientId && meta.enabled ? status.state : "off";
  const label =
    state === "syncing" ? "Syncing…" :
    state === "pending" ? "Saving…" :
    state === "synced" ? `Synced ${timeLabel(new Date(status.at))}` :
    state === "error" ? "Sync error" :
    state === "signed-out" ? (meta.enabled ? "Click to reconnect" : "Sign in to sync") : "Drive sync off";
  const connected = meta.enabled && !!clientId;

  return (
    <div className="sync-wrap" ref={box}>
      <button className={`sync-chip-btn ${state}`} onClick={() => setOpen(!open)} title={status.error || "Google Drive sync"} aria-expanded={open}>
        <i/>{label}
      </button>
      {open && (
        <div className="sync-pop">
          <div className="sync-pop-head">
            <p className="eyebrow accent">GOOGLE DRIVE</p>
            {connected && meta.folderId && <a className="sync-folder" href={folderUrl(meta.folderId)} target="_blank" rel="noreferrer"><Icon name="folder" size={14}/> Work Dashboard</a>}
          </div>
          {status.error && <p className="sync-error">{status.error}</p>}
          {connected ? (
            <>
              <p className="sync-copy">Your <b>Work Dashboard</b> folder in Drive is the source of truth. Syncing is automatic: changes here save there within seconds, and changes from your other devices (or edits to the Sheets and Notes doc) load in every 30 seconds and whenever you come back to this tab. Google sessions last an hour; when one runs out, your next click anywhere renews it.</p>
              {meta.folderId && (
                <ul className="sync-files">
                  {driveFiles.map(({ role, label, hint }) => meta.fileIds[role] && (
                    <li key={role}><a href={fileUrl(role, meta.fileIds[role]!)} target="_blank" rel="noreferrer"><span>{label}</span><small>{hint}</small><Icon name="external" size={13}/></a></li>
                  ))}
                </ul>
              )}
              <div className="sync-buttons">
                {state === "signed-out" || (state === "error" && !status.at)
                  ? <button className="primary-button" onClick={() => signIn()}>Sign in</button>
                  : <button className="secondary-button" onClick={() => syncNow(true)} disabled={state === "syncing"}><Icon name="refresh" size={14}/> Check now</button>}
                <button className="secondary-button" onClick={() => signOut()}>Sign out</button>
              </div>
              <div className="ms-sync">
                <div className="ms-sync-head">
                  <p className="eyebrow accent">MICROSOFT SYNC</p>
                  {msMeta.at > 0 && <small>Last run {dateKey(new Date(msMeta.at)) === dateKey() ? timeLabel(new Date(msMeta.at)) : new Date(msMeta.at).toLocaleDateString()}</small>}
                </div>
                <p className="sync-copy">Saves Excel and Word copies of your Drive folder ({driveFiles.map((f) => f.label).join(", ")}) {canPickFolder() ? <>to a folder on this computer. Pick your <b>OneDrive</b> folder and they sync to Microsoft 365 too.</> : <>to your Downloads. (Use Chrome or Edge to save straight into a folder, such as your OneDrive.)</>} The copies are read-only snapshots; keep editing here or in Drive.</p>
                {msStatus.error && <p className="sync-error">{msStatus.error}</p>}
                {msStatus.message && !msStatus.error && <p className="ms-sync-done"><Icon name="check" size={13}/> {msStatus.message}</p>}
                <div className="sync-buttons">
                  <button className="primary-button" onClick={() => microsoftSync()} disabled={msStatus.busy || state === "syncing"}><Icon name="download" size={14}/> {msStatus.busy ? "Exporting…" : "Microsoft Sync"}</button>
                  {canPickFolder() && msMeta.folder && <button className="text-button" onClick={() => chooseFolder().catch(() => undefined)} title="Choose another folder"><Icon name="folder" size={14}/> {msMeta.folder} · Change</button>}
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="sync-copy">Keep everything in a <b>Work Dashboard</b> folder in your Google Drive: inputs and logs as Google Sheets, notes as a Google Doc. Drive becomes the source of truth for every device.</p>
              {!hasEnvClientId() && (
                <label className="sync-field">Google OAuth Client ID
                  <input value={stored} onChange={(event) => setClientId(event.target.value.trim())} placeholder="xxxxxxxx.apps.googleusercontent.com" autoComplete="off"/>
                </label>
              )}
              <details className="sync-steps">
                <summary>How to get a Client ID (one-time, ~5 minutes)</summary>
                <ol>
                  <li>Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a project (or reuse the one from your Personal Dashboard).</li>
                  <li>In <b>APIs &amp; Services → Library</b>, enable <b>Google Drive API</b> and <b>Google Sheets API</b> (and <b>Google Calendar API</b> for the calendar link).</li>
                  <li>In <b>OAuth consent screen</b>: User type <b>External</b>, add an app name and your email, leave it in <b>Testing</b>, and add your own Gmail under <b>Test users</b>.</li>
                  <li>In <b>Credentials → Create credentials → OAuth client ID</b>: type <b>Web application</b>. Under <b>Authorised JavaScript origins</b> add <code>{window.location.origin}</code> and <code>https://kash1405.github.io</code>.</li>
                  <li>Copy the Client ID here and click <b>Connect Google Drive</b>. Google will warn the app is unverified; that is expected for your own test app.</li>
                </ol>
              </details>
              <div className="sync-buttons">
                <button className="primary-button" onClick={() => signIn()} disabled={!clientId}>Connect Google Drive</button>
              </div>
            </>
          )}
          <div className="sync-backup">
            <span>Backup file</span>
            <button className="text-button" onClick={() => downloadFile(`work-dashboard-backup-${dateKey()}.json`, JSON.stringify(exportAll(), null, 2), "application/json")}><Icon name="download" size={14}/> Download</button>
            <button className="text-button" onClick={() => fileInput.current?.click()}><Icon name="upload" size={14}/> Restore</button>
            <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport}/>
          </div>
        </div>
      )}
    </div>
  );
}
