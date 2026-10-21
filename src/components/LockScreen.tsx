import { useState } from "react";
import { buildings } from "../lib/buildings";
import { checkPassword } from "../lib/vault";
import { Icon } from "./ui";

export default function LockScreen({ onUnlock }: { onUnlock: (remember: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [photo] = useState(() => buildings[Math.floor(Math.random() * buildings.length)]);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      await checkPassword(password);
      onUnlock(remember);
    } catch (err) {
      const next = failures + 1;
      setFailures(next);
      // Slow down repeated guesses.
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(next, 6) * 600));
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen">
      <img src={photo.src} alt="" aria-hidden="true" style={{ objectPosition: photo.position }}/>
      <div className="lock-shade"/>
      <form className={`lock-card ${error ? "shake" : ""}`} key={failures} onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <Brand/>
        <p className="eyebrow accent">PRIVATE WORKSPACE</p>
        <h1>Sign in</h1>
        <p className="lock-copy">This dashboard is private. Enter your password to unlock it.</p>
        <label htmlFor="lock-password">Password</label>
        <input id="lock-password" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}/>
        <label className="lock-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)}/> Keep me signed in on this device for 30 days</label>
        {error && <p className="lock-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy || !password}>{busy ? "Checking…" : <>Unlock <Icon name="arrow" size={15}/></>}</button>
      </form>
      <small className="lock-credit">{photo.title} · Photo: {photo.author}, {photo.license}</small>
    </div>
  );
}

export function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <div className="brand" onClick={onClick}>
      <div className="brand-mark"><Icon name="building" size={18}/></div>
      <div><strong>WORK</strong><small>DASHBOARD</small></div>
    </div>
  );
}
