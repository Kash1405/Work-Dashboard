import { getStored, useStored } from "./store";

// Shared Google Identity Services plumbing for Calendar and Drive.
// One OAuth Client ID (public, not a secret) serves both. It can be baked in at build
// time with VITE_GOOGLE_CLIENT_ID, or pasted into the dashboard and kept in this browser.

const ENV_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";

export const useGoogleClientId = () => useStored<string>("google.clientId", "");

// A Client ID built into the site always wins, so a stale ID pasted on one device can't override it.
export function googleClientId() {
  return ENV_CLIENT_ID || getStored("google.clientId", "") || getStored<{ clientId?: string }>("gcal.settings", {}).clientId || "";
}

export const hasEnvClientId = () => !!ENV_CLIENT_ID;

type TokenResponse = { access_token?: string; expires_in?: number; error?: string; error_description?: string };
type GoogleOAuth = {
  accounts: {
    oauth2: {
      initTokenClient: (config: Record<string, unknown>) => { requestAccessToken: (o?: Record<string, unknown>) => void };
      revoke: (token: string, done?: () => void) => void;
    };
  };
};
export type Token = { value: string; expiresAt: number };

let scriptPromise: Promise<void> | null = null;
const google = () => (window as unknown as { google?: GoogleOAuth }).google;

export function preloadGoogle() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (google()?.accounts) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Could not load Google sign-in."));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export const isFresh = (token: Token | null) => !!token && token.expiresAt > Date.now() + 60_000;

// Opens Google's consent popup (prompt "consent") or reuses an earlier grant (prompt "").
// Browsers only allow the popup during a click, so call this from a click handler where possible.
export function requestToken(scope: string, prompt: "" | "consent"): Promise<Token> {
  const clientId = googleClientId();
  const g = google();
  if (!clientId) return Promise.reject(new Error("Add your Google OAuth Client ID first."));
  if (!g?.accounts) {
    preloadGoogle();
    return Promise.reject(new Error("Google sign-in is still loading. Try again in a moment."));
  }
  return new Promise((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (response: TokenResponse) => {
        if (response.error || !response.access_token) reject(new Error(response.error_description || response.error || "Google sign-in failed."));
        else resolve({ value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 });
      },
      error_callback: (error: { type?: string; message?: string }) => reject(new Error(error.type === "popup_failed_to_open" ? "Click “Sign in” to connect Google." : error.message || error.type || "Google sign-in was closed.")),
    });
    client.requestAccessToken({ prompt });
  });
}

export function revokeToken(token: string) {
  google()?.accounts.oauth2.revoke(token);
}
