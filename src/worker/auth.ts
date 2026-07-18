/**
 * Password hashing and session management on top of Web Crypto + D1.
 *
 * Passwords: PBKDF2-SHA256, 100k iterations (Workers' WebCrypto cap),
 * per-user random salt, stored as `pbkdf2$<iterations>$<saltHex>$<hashHex>`.
 *
 * Sessions: a 256-bit random token goes to the browser in an HttpOnly
 * cookie; only its SHA-256 hash is stored in D1, so a leaked database
 * cannot be replayed as a login.
 */

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
export const SESSION_COOKIE = 'quilt_session';

export interface SessionUser {
  id: number;
  email: string;
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 1_000_000) return false;
  const salt = fromHex(parts[2]);
  const expected = fromHex(parts[3]);
  if (!salt || !expected) return false;
  const actual = await pbkdf2(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const tokenHash = await sha256Hex(token);
  const expiresAt = nowSeconds() + SESSION_TTL_SECONDS;
  await db
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(tokenHash, userId, expiresAt)
    .run();
  return token;
}

export async function getSessionUser(db: D1Database, token: string): Promise<SessionUser | null> {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT u.id AS id, u.email AS email, s.expires_at AS expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<{ id: number; email: string; expires_at: number }>();
  if (!row) return null;
  const now = nowSeconds();
  if (row.expires_at <= now) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
    return null;
  }
  // Sliding expiration: extend when less than half the TTL remains.
  if (row.expires_at - now < SESSION_TTL_SECONDS / 2) {
    await db
      .prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(now + SESSION_TTL_SECONDS, tokenHash)
      .run();
  }
  return { id: row.id, email: row.email };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

export function sessionCookie(token: string, maxAgeSeconds = SESSION_TTL_SECONDS): string {
  // `Secure` is fine in local dev too: browsers treat localhost as secure.
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
