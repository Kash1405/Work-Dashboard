import { InteractionRequiredAuthError, PublicClientApplication, type AccountInfo, type IPublicClientApplication } from "@azure/msal-browser";
import { getStored, setStored, useStored } from "./store";

// Microsoft work-account sign-in (MSAL) shared by SharePoint/OneDrive sync and Outlook Calendar.
// The app (client) ID and tenant ID are public identifiers, not secrets. They can be baked in at
// build time (VITE_MS_CLIENT_ID / VITE_MS_TENANT_ID) or pasted into the dashboard and kept in this browser.
// Unlike Google, MSAL renews tokens silently (a refresh token lasts about a day for single-page apps),
// so a popup is only needed for the first sign-in, or when the organisation asks you to sign in again.

export const SCOPES = ["User.Read", "Files.ReadWrite", "Calendars.ReadWrite"];
export const GRAPH = "https://graph.microsoft.com/v1.0";

const ENV_CLIENT_ID = (import.meta.env.VITE_MS_CLIENT_ID as string | undefined) ?? "";
const ENV_TENANT_ID = (import.meta.env.VITE_MS_TENANT_ID as string | undefined) ?? "";

export type MsConfig = { clientId: string; tenantId: string };
const configFallback: MsConfig = { clientId: "", tenantId: "" };
export const useMsConfig = () => useStored<MsConfig>("ms.config", configFallback);
export const hasEnvConfig = () => !!ENV_CLIENT_ID;

export type MsAccount = { name: string; username: string } | null;
export const useMsAccount = () => useStored<MsAccount>("~ms.account", null);

// A Client ID built into the site always wins, so a stale ID pasted on one device can't override it.
export function msConfig(): MsConfig {
  const stored = getStored("ms.config", configFallback);
  return { clientId: ENV_CLIENT_ID || stored.clientId, tenantId: ENV_TENANT_ID || stored.tenantId };
}

const redirectUri = () => new URL(`${import.meta.env.BASE_URL}redirect.html`, window.location.origin).href;

let appKey = "";
let starting: Promise<IPublicClientApplication> | null = null;

// One MSAL instance per client/tenant pair; rebuilt if the IDs change.
function client(): Promise<IPublicClientApplication> {
  const { clientId, tenantId } = msConfig();
  if (!clientId) return Promise.reject(new Error("Add your Microsoft app (client) ID first."));
  const key = `${clientId}|${tenantId}`;
  if (starting && appKey === key) return starting;
  appKey = key;
  const pending = PublicClientApplication.createPublicClientApplication({
    auth: {
      clientId,
      // "organizations" accepts any work or school account; a tenant ID pins it to one organisation.
      authority: `https://login.microsoftonline.com/${tenantId || "organizations"}`,
      redirectUri: redirectUri(),
    },
    cache: { cacheLocation: "localStorage" },
  }).then((instance) => {
    const account = instance.getAllAccounts()[0];
    if (account) instance.setActiveAccount(account);
    publish(account ?? null);
    return instance;
  });
  starting = pending;
  pending.catch(() => {
    if (starting === pending) {
      starting = null;
      appKey = "";
    }
  });
  return pending;
}

function publish(account: AccountInfo | null) {
  setStored<MsAccount>("~ms.account", account ? { name: account.name ?? account.username, username: account.username } : null);
}

export function preloadMicrosoft() {
  return client().catch(() => undefined);
}

export async function isSignedIn() {
  return !!(await client()).getActiveAccount();
}

// From a click: opens Microsoft's sign-in popup.
export async function signInMicrosoft() {
  const instance = await client();
  const result = await instance.loginPopup({ scopes: SCOPES, prompt: "select_account" });
  instance.setActiveAccount(result.account);
  publish(result.account);
}

export class SignInNeeded extends Error {}

// A fresh access token for Microsoft Graph. Silent when possible; a popup only when `interactive`
// (that is, when called from a click, where browsers allow popups).
export async function graphToken(interactive = false): Promise<string> {
  const instance = await client();
  const account = instance.getActiveAccount();
  if (!account) {
    if (!interactive) throw new SignInNeeded("Sign in with your Microsoft work account.");
    await signInMicrosoft();
    return graphToken(false);
  }
  try {
    return (await instance.acquireTokenSilent({ scopes: SCOPES, account })).accessToken;
  } catch (error) {
    if (!(error instanceof InteractionRequiredAuthError)) throw error;
    if (!interactive) throw new SignInNeeded("Your Microsoft session ended. Sign in again to keep syncing.");
    return (await instance.acquireTokenPopup({ scopes: SCOPES, account })).accessToken;
  }
}

export async function signOutMicrosoft() {
  const instance = await client();
  const account = instance.getActiveAccount();
  // Forget the account in this browser only (no Microsoft-wide sign-out page).
  if (account) await instance.clearCache({ account });
  instance.setActiveAccount(null);
  publish(null);
}

// Calls Microsoft Graph with a fresh token. `path` is relative to /v1.0.
export async function graph(path: string, init: RequestInit = {}, interactive = false): Promise<Response> {
  const token = await graphToken(interactive);
  const response = await fetch(path.startsWith("https://") ? path : `${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message: string = body?.error?.message ?? `Microsoft Graph error ${response.status}`;
    throw Object.assign(new Error(message), { status: response.status });
  }
  return response;
}
