/**
 * Password hashing and session management on top of Web Crypto + D1.
 *
 * Passwords: PBKDF2-SHA256 with a per-user random salt, stored as
 * `pbkdf2$<iterations>$<saltHex>$<hashHex>` (see PBKDF2_ITERATIONS below
 * for how the count is chosen).
 *
 * Sessions: a 256-bit random token goes to the browser in an HttpOnly
 * cookie; only its SHA-256 hash is stored in D1, so a leaked database
 * cannot be replayed as a login.
 */

/**
 * Chosen to fit comfortably inside the Workers Free plan's 10ms CPU budget
 * (workerd caps PBKDF2 at 100k iterations, but that much hashing risks
 * "exceeded CPU" 1102 errors on the free tier). Old hashes verify with the
 * iteration count stored alongside them, so this can be raised later (e.g.
 * on the paid plan) without breaking existing accounts.
 */
const PBKDF2_ITERATIONS = 50_000;
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

export interface SessionLookup {
  user: SessionUser;
  /**
   * True when the sliding expiration was extended. The caller should re-send
   * the session cookie too, so the browser's Max-Age slides along with the
   * database expiry — otherwise active users get logged out N days after
   * their first sign-in.
   */
  refreshed: boolean;
}

export async function getSessionUser(db: D1Database, token: string): Promise<SessionLookup | null> {
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
  let refreshed = false;
  if (row.expires_at - now < SESSION_TTL_SECONDS / 2) {
    await db
      .prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?')
      .bind(now + SESSION_TTL_SECONDS, tokenHash)
      .run();
    refreshed = true;
  }
  return { user: { id: row.id, email: row.email }, refreshed };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
}

/**
 * `secure` should reflect the request protocol: true in production (https),
 * false under `wrangler dev` on http://localhost — Safari, unlike Chrome and
 * Firefox, refuses to store Secure cookies from plain-http localhost.
 */
export function sessionCookie(
  token: string,
  secure: boolean,
  maxAgeSeconds = SESSION_TTL_SECONDS,
): string {
  return (
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}` +
    (secure ? '; Secure' : '')
  );
}

export function clearSessionCookie(secure: boolean): string {
  return (
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` + (secure ? '; Secure' : '')
  );
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
