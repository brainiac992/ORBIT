/**
 * AES-256-GCM encryption service for Jira API tokens.
 * Uses Node.js built-in crypto — no external packages.
 *
 * Ciphertext format (colon-delimited, base64 encoded):
 *   iv:authTag:ciphertext
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit IV — NIST recommended for GCM
const TAG_BYTES = 16;  // 128-bit auth tag

function getKey(): Buffer {
  const raw = process.env.JIRA_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'JIRA_ENCRYPTION_KEY is not set. Configure this environment variable before using the Jira integration.'
    );
  }
  if (raw.length < 32) {
    throw new Error(
      `JIRA_ENCRYPTION_KEY must be at least 32 characters (got ${raw.length}). ` +
      'Provide a 32+ character random string for AES-256-GCM encryption.'
    );
  }
  // Use first 32 bytes of the key string (UTF-8 encoded) as the 256-bit key.
  return Buffer.from(raw.slice(0, 32), 'utf8');
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64url-safe string: iv:authTag:ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypts a ciphertext string produced by encryptToken.
 * Throws if the ciphertext is malformed or authentication fails.
 */
export function decryptToken(ciphertext: string): string {
  const key = getKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Malformed ciphertext: expected format iv:authTag:encrypted (3 colon-separated parts).'
    );
  }

  const [ivB64, tagB64, encB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encryptedData = Buffer.from(encB64, 'base64');

  if (iv.length !== IV_BYTES) {
    throw new Error(`Malformed ciphertext: IV must be ${IV_BYTES} bytes.`);
  }
  if (authTag.length !== TAG_BYTES) {
    throw new Error(`Malformed ciphertext: auth tag must be ${TAG_BYTES} bytes.`);
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error(
      'Decryption failed: authentication tag mismatch. The ciphertext may be corrupted or the encryption key changed.'
    );
  }
}
