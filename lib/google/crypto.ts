import { readEnv } from "@/lib/env";

const PREFIX = "v1.";

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

/** 32-byte AES key. A 32-byte base64 secret is used raw. Anything else is SHA-256'd. */
export async function tokenEncryptionKey(): Promise<CryptoKey> {
  const raw = (await readEnv("TOKEN_ENC_KEY")).trim();
  if (raw.length < 16) throw new Error("TOKEN_ENC_KEY debe tener al menos 16 caracteres.");
  const decoded = b64ToBytes(raw);
  const bytes = decoded?.length === 32 ? decoded : new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  return crypto.subtle.importKey("raw", bytes as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

/** AES-GCM ciphertext. The stored value is not the refresh token. */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await tokenEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  const packed = new Uint8Array(iv.length + cipher.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(cipher), iv.length);
  return `${PREFIX}${bytesToB64(packed)}`;
}

export async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) throw new Error("El token guardado no se puede leer.");
  const packed = b64ToBytes(stored.slice(PREFIX.length));
  if (!packed || packed.length < 13) throw new Error("El token guardado no se puede leer.");
  const key = await tokenEncryptionKey();
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("El token guardado no se puede leer.");
  }
}
