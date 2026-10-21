import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { hasEnvConfig, msConfig, preloadMicrosoft, useMsAccount, useMsConfig } from "../lib/microsoft";
import { clearOutlook, syncOutlook } from "../lib/outlook";
import { connectOneDrive, disconnectOneDrive, syncNow, useSyncMeta, useSyncStatus } from "../lib/sharepoint";
import { exportAll, importAll } from "../lib/store";
import { dateKey, downloadFile, timeLabel } from "../lib/utils";
import { Icon } from "./ui";

export default function SyncChip() {
  const [status] = useSyncStatus();
  const [meta] = useSyncMeta();
  const [account] = useMsAccount();
  const [stored, setConfig] = useMsConfig();
  const clientId = msConfig().clientId || stored.clientId;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (clientId) preloadMicrosoft();
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
      if (!window.confirm("Replace the data in this browser with the backup? It will then be saved to OneDrive.")) return;
      importAll(payload);
      window.alert("Backup restored.");
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not read that file.");
    }
  };

  const connect = async () => {
    await connectOneDrive();
    syncOutlook().catch(() => undefined);
  };
  const disconnect = async () => {
    await disconnectOneDrive();
    clearOutlook();
  };

  const state = clientId && meta.enabled ? status.state : "off";
  const label =
    state === "syncing" ? "Syncing…" :
    state === "pending" ? "Saving…" :
    state === "synced" ? `Synced ${timeLabel(new Date(status.at))}` :
    state === "error" ? "Sync error" :
    state === "signed-out" ? "Sign in to sync" : "OneDrive sync off";
  const connected = meta.enabled && !!clientId;

  return (
    <div className="sync-wrap" ref={box}>
      <button className={`sync-chip-btn ${state}`} onClick={() => setOpen(!open)} title={status.error || "Microsoft 365 sync"} aria-expanded={open}>
        <i/>{label}
      </button>
      {open && (
        <div className="sync-pop">
          <div className="sync-pop-head">
            <p className="eyebrow accent">MICROSOFT 365</p>
            {connected && meta.folderUrl && <a className="sync-folder" href={meta.folderUrl} target="_blank" rel="noreferrer"><Icon name="folder" size={14}/> Work Dashboard</a>}
          </div>
          {account && <p className="sync-account"><Icon name="user" size={14}/> <span><b>{account.name}</b><small>{account.username}</small></span></p>}
          {status.error && <p className="sync-error">{status.error}</p>}
          {connected ? (
            <>
              <p className="sync-copy">Your <b>Work Dashboard</b> folder in OneDrive (your personal SharePoint) is the source of truth, and the calendar is your Outlook calendar. Changes here save there within seconds; edits from other devices, or to the files themselves, load in every 30 seconds and whenever you come back to this tab.</p>
              <div className="sync-buttons">
                {state === "signed-out"
                  ? <button className="primary-button" onClick={connect}>Sign in</button>
                  : <button className="secondary-button" onClick={() => { syncNow(true); syncOutlook(true).catch(() => undefined); }} disabled={state === "syncing"}><Icon name="refresh" size={14}/> Check now</button>}
                <button className="secondary-button" onClick={disconnect}>Sign out</button>
              </div>
            </>
          ) : (
            <>
              <p className="sync-copy">Sign in with your Microsoft work account to keep everything in a <b>Work Dashboard</b> folder in your OneDrive (CSV files that open in Excel, plus a notes file) and to sync the calendar with Outlook both ways.</p>
              {!hasEnvConfig() && (
                <>
                  <label className="sync-field">Application (client) ID
                    <input value={stored.clientId} onChange={(event) => setConfig({ ...stored, clientId: event.target.value.trim() })} placeholder="00000000-0000-0000-0000-000000000000" autoComplete="off"/>
                  </label>
                  <label className="sync-field">Directory (tenant) ID <small>optional</small>
                    <input value={stored.tenantId} onChange={(event) => setConfig({ ...stored, tenantId: event.target.value.trim() })} placeholder="Leave empty for any work account" autoComplete="off"/>
                  </label>
                </>
              )}
              <details className="sync-steps">
                <summary>How to get an app ID (one-time, ~5 minutes)</summary>
                <ol>
                  <li>Open <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noreferrer">Microsoft Entra → App registrations</a> and choose <b>New registration</b> (e.g. “Work Dashboard”).</li>
                  <li>Supported account types: <b>this organizational directory only</b>. Redirect URI: platform <b>Single-page application (SPA)</b>, address <code>{new URL(`${import.meta.env.BASE_URL}redirect.html`, window.location.origin).href}</code>. Add your published dashboard’s <code>…/redirect.html</code> too.</li>
                  <li>Under <b>API permissions</b>, add Microsoft Graph delegated permissions <b>User.Read</b>, <b>Files.ReadWrite</b> and <b>Calendars.ReadWrite</b>.</li>
                  <li>Copy the <b>Application (client) ID</b> and <b>Directory (tenant) ID</b> from the Overview page into the boxes above, then click <b>Connect</b>.</li>
                  <li>If your organisation blocks app registrations or user consent, IT has to register or approve the app for you.</li>
                </ol>
              </details>
              <div className="sync-buttons">
                <button className="primary-button" onClick={connect} disabled={!clientId}>Connect Microsoft 365</button>
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
