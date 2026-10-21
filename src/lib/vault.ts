import { VAULT } from "./vault.data";

const b64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// The password is checked by decrypting a small encrypted blob; a wrong password fails decryption.
// Regenerate the blob with `npm run vault` to change the password.
export async function checkPassword(password: string): Promise<void> {
  if (!window.crypto?.subtle) throw new Error("This page must be opened over https (or localhost) to sign in.");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(VAULT.salt), iterations: VAULT.iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  try {
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(VAULT.iv) }, key, b64(VAULT.data));
  } catch {
    throw new Error("Wrong password.");
  }
}
