import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

/**
 * Encrypting a credential that belongs to somebody else.
 *
 * A Xero refresh token is sixty days of read access to a business's accounts. It is the first thing
 * in this product that is genuinely dangerous at rest: a leaked database of them is a leaked
 * database of everybody's books, and unlike a password there is nothing the customer can do about it
 * because they never knew it existed.
 *
 * ── Why this is here rather than a library ───────────────────────────────────────────────────────
 *
 * AES-256-GCM out of node's own crypto, which is thirty lines and no supply chain. Authenticated on
 * purpose: GCM fails on a modified ciphertext rather than returning plausible rubbish, which matters
 * because the thing being protected is used to make requests — silently decrypting to the wrong
 * bytes would produce a confusing 401 instead of a clear refusal.
 *
 * ── What this does and does not protect against ──────────────────────────────────────────────────
 *
 * It protects a copy of the DATABASE: a backup, a dump, a stolen read replica. It does NOT protect
 * against somebody who already has the running application's environment, because that is where the
 * key is. That is the honest boundary and it is worth saying rather than implying more.
 *
 * The key never appears in the repository, in a chat, in a log or in an error message. It is one
 * environment variable, set once in the deployment's settings.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;    // 96 bits, which is what GCM is specified for
const TAG_BYTES = 16;

/**
 * The key, derived from the environment rather than used raw.
 *
 * SHA-256 of whatever is set, so any passphrase produces the 32 bytes AES-256 needs and a short or
 * odd-length value is not a runtime error on the one code path nobody wants failing. It is a
 * derivation for LENGTH, not a KDF — the variable itself has to be a real random secret, which is
 * what `TOKEN_ENCRYPTION_KEY` in the deployment settings is for.
 */
function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? '';
  if (raw.length < 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is missing or too short. A Xero refresh token is sixty days of access to '
      + "somebody's accounts and is never stored unencrypted. Set it to at least 32 random characters.",
    );
  }
  return createHash('sha256').update(raw).digest();
}

/** Whether this deployment can hold credentials at all. Asked BEFORE offering to connect anything. */
export const canHoldSecrets = (): boolean => (process.env.TOKEN_ENCRYPTION_KEY ?? '').length >= 32;

/**
 * Encrypt, as one self-describing string.
 *
 * `v1.<iv>.<tag>.<ciphertext>`, base64url. The version is first so a future scheme can be told apart
 * from this one without guessing at lengths, and so anything that is NOT one of ours is obvious
 * rather than being attempted and failing strangely.
 */
export function seal(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
}

/**
 * Decrypt, or throw.
 *
 * Deliberately throws rather than returning null. Every caller wants the token to make a request; a
 * null would be threaded through as "no connection", and a business would be told nothing is
 * connected when the truth is that its credential cannot be read — two very different problems with
 * very different fixes.
 */
export function open(sealed: string): string {
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('That stored credential is not in a format SPEC wrote.');
  }
  const [, ivB64, tagB64, bodyB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('That stored credential is malformed.');
  }
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  // Throws on a modified ciphertext, which is the point of GCM.
  return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64url')), decipher.final()]).toString('utf8');
}

/**
 * Compare two secrets without leaking how much of one matched.
 *
 * Used for the OAuth `state` on the way back from Xero. A plain `===` on a secret is compared byte
 * by byte and stops at the first difference, which is measurable; this is not. Cheap, and the sort
 * of thing that is embarrassing to add afterwards.
 */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
