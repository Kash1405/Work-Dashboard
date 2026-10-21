import { useEffect } from "react";
import LockScreen, { Brand } from "./components/LockScreen";
import SyncChip from "./components/SyncChip";
import { Icon } from "./components/ui";
import { timerRemaining, useFocusDraft, useFocusFlash, useFocusTimer, useSettings, type Tab } from "./lib/data";
import { useCompleteSession } from "./lib/focus";
import { hasToken, syncGoogle, useGcalSettings } from "./lib/gcal";
import { useDriveSync, useSyncMeta } from "./lib/sync";
import { useStored } from "./lib/store";
import { formatDuration, pad, playChime, useNow } from "./lib/utils";
import Focus from "./tabs/Focus";
import Overview from "./tabs/Overview";

const tabs: { tab: Tab; icon: string }[] = [
  { tab: "Overview", icon: "grid" },
  { tab: "Focus", icon: "focus" },
];

function Header({ active, setActive, onLock }: { active: Tab; setActive: (tab: Tab) => void; onLock: () => void }) {
  const now = useNow(1000);
  const [settings] = useSettings();
  const [timer] = useFocusTimer();
  const remaining = timerRemaining(timer, now.getTime());
  const name = settings.name.trim();
  const initials = name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AK";

  return (
    <header className="topbar">
      <Brand onClick={() => setActive("Overview")}/>
      <nav className="tabs" aria-label="Dashboard sections">
        {tabs.map(({ tab, icon }) => (
          <button key={tab} className={active === tab ? "active" : ""} onClick={() => setActive(tab)}>
            <Icon name={icon}/>
            {tab}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        {timer.endsAt !== null && active !== "Focus" && (
          <button className="timer-chip" onClick={() => setActive("Focus")}><i/>{pad(Math.floor(remaining / 60))}:{pad(remaining % 60)}</button>
        )}
        <SyncChip/>
        <button className="icon-button" onClick={onLock} aria-label="Lock the dashboard" title="Lock"><Icon name="lock"/></button>
        <div className="avatar" title={name || "Set your name on the Overview tab"}>{initials}</div>
      </div>
    </header>
  );
}

// Background jobs that must keep running whichever tab is open.
function useBackgroundJobs() {
  const now = useNow(1000);
  const [timer] = useFocusTimer();
  const [draft] = useFocusDraft();
  const [, setFlash] = useFocusFlash();
  const complete = useCompleteSession();
  const [gcal] = useGcalSettings();

  // Focus timer finished: log it, chime, and show a message.
  useEffect(() => {
    if (timer.endsAt !== null && now.getTime() >= timer.endsAt) {
      complete(timer.duration);
      playChime();
      setFlash(`Session complete: “${draft.task.trim() || "Untitled session"}” logged (${formatDuration(timer.duration)}).`);
    }
  });

  // Tab title shows the running timer.
  const remaining = timerRemaining(timer, now.getTime());
  useEffect(() => {
    document.title = timer.endsAt !== null ? `▶ ${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)} · Focus` : "Work Dashboard";
  }, [timer.endsAt, remaining]);

  // Keep Google Calendar fresh while the sign-in token is valid (about an hour per sign-in).
  const minute = Math.floor(now.getTime() / 60000);
  useEffect(() => {
    if (gcal.enabled && hasToken() && Date.now() - gcal.lastSync > 5 * 60 * 1000) syncGoogle().catch(() => undefined);
  }, [gcal.enabled, gcal.lastSync, minute]);
}

const SESSION_DAYS = 30;

export default function App() {
  const [stored, setActive] = useStored<Tab>("ui.tab", "Overview");
  const [authUntil, setAuthUntil] = useStored<number>("auth.until", 0);
  const [session, setSession] = useStored<boolean>("~auth.session", false);
  const active: Tab = tabs.some((t) => t.tab === stored) ? stored : "Overview";
  const unlocked = session || authUntil > Date.now();
  useBackgroundJobs();
  useDriveSync(unlocked);
  const [syncMeta] = useSyncMeta();
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active]);

  if (!unlocked) {
    return (
      <LockScreen onUnlock={(remember) => {
        setSession(true);
        setAuthUntil(remember ? Date.now() + SESSION_DAYS * 86400000 : 0);
      }}/>
    );
  }

  const lock = () => {
    setAuthUntil(0);
    setSession(false);
  };

  return (
    <div className="app-shell">
      <Header active={active} setActive={setActive} onLock={lock}/>
      {active === "Overview" && <Overview/>}
      {active === "Focus" && <Focus/>}
      <footer><span>WORK DASHBOARD · PRIVATE</span><span>{syncMeta.enabled ? "Source of truth: Google Drive › Work Dashboard" : "Saved in this browser · connect Google Drive to sync"} <i/></span></footer>
    </div>
  );
}
