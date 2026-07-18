/**
 * Quilt Planner API — a Hono app running on Cloudflare Workers with D1.
 *
 * Static assets (the built React app) are served by the Workers assets
 * pipeline; every /api/* request is routed here (see wrangler.jsonc
 * `run_worker_first`).
 */
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import {
  SESSION_COOKIE,
  type SessionUser,
  clearSessionCookie,
  createSession,
  deleteSession,
  getSessionUser,
  hashPassword,
  sessionCookie,
  verifyPassword,
} from './auth';
import {
  LIMITS,
  ValidationError,
  newQuiltData,
  validateColorFields,
  validateFabricFields,
  validateQuiltData,
} from '../shared/quilt';

export interface Env {
  DB: D1Database;
  /** Set to "true" (e.g. via `wrangler secret` or a var) to block new sign-ups. */
  DISABLE_REGISTRATION?: string;
}

type AppContext = { Bindings: Env; Variables: { user: SessionUser } };

const app = new Hono<AppContext>();

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------

app.post('/api/auth/register', async (c) => {
  if (c.env.DISABLE_REGISTRATION === 'true') {
    return c.json({ error: 'New sign-ups are disabled on this site.' }, 403);
  }
  const body = await readJson(c.req.raw);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email) return c.json({ error: 'Please enter a valid email address.' }, 400);
  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters.' }, 400);
  }
  if (password.length > 200) return c.json({ error: 'Password is too long.' }, 400);

  const passwordHash = await hashPassword(password);
  let userId: number;
  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id',
    )
      .bind(email, passwordHash)
      .first<{ id: number }>();
    userId = result!.id;
  } catch (err) {
    if (String(err).includes('UNIQUE')) {
      return c.json({ error: 'That email is already registered. Try signing in.' }, 409);
    }
    throw err;
  }

  const token = await createSession(c.env.DB, userId);
  c.header('Set-Cookie', sessionCookie(token, isHttps(c.req.url)));
  return c.json({ email }, 201);
});

app.post('/api/auth/login', async (c) => {
  const body = await readJson(c.req.raw);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === 'string' ? body.password : '';
  const invalid = () => c.json({ error: 'Email or password is incorrect.' }, 401);
  if (!email || !password) return invalid();

  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash FROM users WHERE email = ?',
  )
    .bind(email)
    .first<{ id: number; email: string; password_hash: string }>();
  if (!user) {
    // Burn comparable time so missing accounts aren't detectable by timing.
    await verifyPassword(password, DUMMY_HASH);
    return invalid();
  }
  if (!(await verifyPassword(password, user.password_hash))) return invalid();

  const token = await createSession(c.env.DB, user.id);
  c.header('Set-Cookie', sessionCookie(token, isHttps(c.req.url)));
  return c.json({ email: user.email });
});

app.post('/api/auth/logout', async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.env.DB, token);
  c.header('Set-Cookie', clearSessionCookie(isHttps(c.req.url)));
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

app.use('/api/*', async (c, next) => {
  // Everything below this middleware requires a session.
  const token = getCookie(c, SESSION_COOKIE) ?? '';
  const session = await getSessionUser(c.env.DB, token);
  if (!session) return c.json({ error: 'Not signed in.' }, 401);
  c.set('user', session.user);
  // Slide the browser cookie along with the database expiry.
  if (session.refreshed) c.header('Set-Cookie', sessionCookie(token, isHttps(c.req.url)));
  await next();
});

app.get('/api/auth/me', (c) => c.json({ email: c.get('user').email }));

app.get('/api/quilts', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, data, created_at, updated_at FROM quilts
     WHERE user_id = ? ORDER BY updated_at DESC`,
  )
    .bind(c.get('user').id)
    .all<QuiltRow>();
  return c.json({ quilts: rows.results.map(rowToQuilt) });
});

app.post('/api/quilts', async (c) => {
  const body = await readJson(c.req.raw);
  const name = cleanName(body?.name) ?? 'Untitled Quilt';
  let data;
  try {
    data = body?.data === undefined ? newQuiltData() : validateQuiltData(body.data);
  } catch (err) {
    return validationResponse(c, err);
  }
  const dataJson = JSON.stringify(data);
  if (dataJson.length > LIMITS.maxDataBytes) return dataTooLarge(c);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO quilts (id, user_id, name, data) VALUES (?, ?, ?, ?)',
  )
    .bind(id, c.get('user').id, name, dataJson)
    .run();
  const row = await getQuiltRow(c.env.DB, c.get('user').id, id);
  return c.json({ quilt: rowToQuilt(row!) }, 201);
});

app.get('/api/quilts/:id', async (c) => {
  const row = await getQuiltRow(c.env.DB, c.get('user').id, c.req.param('id'));
  if (!row) return c.json({ error: 'Quilt not found.' }, 404);
  return c.json({ quilt: rowToQuilt(row) });
});

app.put('/api/quilts/:id', async (c) => {
  const userId = c.get('user').id;
  const id = c.req.param('id');
  const existing = await getQuiltRow(c.env.DB, userId, id);
  if (!existing) return c.json({ error: 'Quilt not found.' }, 404);

  const body = await readJson(c.req.raw);
  const name = body?.name !== undefined ? cleanName(body.name) : undefined;
  if (body?.name !== undefined && !name) {
    return c.json({ error: `Name must be 1-${LIMITS.maxNameLen} characters.` }, 400);
  }
  let dataJson: string | undefined;
  if (body?.data !== undefined) {
    try {
      dataJson = JSON.stringify(validateQuiltData(body.data));
    } catch (err) {
      return validationResponse(c, err);
    }
    if (dataJson.length > LIMITS.maxDataBytes) return dataTooLarge(c);
  }
  await c.env.DB.prepare(
    `UPDATE quilts SET
       name = COALESCE(?, name),
       data = COALESCE(?, data),
       updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
  )
    .bind(name ?? null, dataJson ?? null, id, userId)
    .run();
  const row = await getQuiltRow(c.env.DB, userId, id);
  return c.json({ quilt: rowToQuilt(row!) });
});

app.post('/api/quilts/:id/copy', async (c) => {
  const userId = c.get('user').id;
  const source = await getQuiltRow(c.env.DB, userId, c.req.param('id'));
  if (!source) return c.json({ error: 'Quilt not found.' }, 404);
  const id = crypto.randomUUID();
  const name = `${source.name} (copy)`.slice(0, LIMITS.maxNameLen);
  await c.env.DB.prepare(
    'INSERT INTO quilts (id, user_id, name, data) VALUES (?, ?, ?, ?)',
  )
    .bind(id, userId, name, source.data)
    .run();
  const row = await getQuiltRow(c.env.DB, userId, id);
  return c.json({ quilt: rowToQuilt(row!) }, 201);
});

app.delete('/api/quilts/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM quilts WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'Quilt not found.' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Personal fabric library (shared across the user's quilts)
// ---------------------------------------------------------------------------

app.get('/api/fabrics', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, name, color, color2, pattern, image FROM fabric_library
     WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<{
      id: string;
      name: string;
      color: string;
      color2: string | null;
      pattern: string;
      image: string | null;
    }>();
  return c.json({
    fabrics: rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      ...(r.color2 ? { color2: r.color2 } : {}),
      pattern: r.pattern,
      ...(r.image ? { image: r.image } : {}),
    })),
  });
});

app.post('/api/fabrics', async (c) => {
  const body = await readJson(c.req.raw);
  let fields;
  try {
    fields = validateFabricFields(body, 'fabric');
  } catch (err) {
    return validationResponse(c, err);
  }
  const userId = c.get('user').id;
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM fabric_library WHERE user_id = ?')
    .bind(userId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= LIMITS.maxLibraryFabrics) {
    return c.json(
      { error: `Your fabric library is full (${LIMITS.maxLibraryFabrics}). Remove some first.` },
      400,
    );
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO fabric_library (id, user_id, name, color, color2, pattern, image) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      userId,
      fields.name,
      fields.color,
      fields.color2 ?? null,
      fields.pattern,
      fields.image ?? null,
    )
    .run();
  return c.json({ fabric: { id, ...fields } }, 201);
});

app.delete('/api/fabrics/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM fabric_library WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'Fabric not found.' }, 404);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Personal color palette (My Colors)
// ---------------------------------------------------------------------------

app.get('/api/colors', async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, color, name FROM color_library WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(c.get('user').id)
    .all<{ id: string; color: string; name: string }>();
  return c.json({ colors: rows.results });
});

app.post('/api/colors', async (c) => {
  const body = await readJson(c.req.raw);
  let fields;
  try {
    fields = validateColorFields(body);
  } catch (err) {
    return validationResponse(c, err);
  }
  const userId = c.get('user').id;
  // Saving the same color twice is a no-op returning the existing entry —
  // checked BEFORE the cap, so a full palette never rejects a re-save.
  const existing = await c.env.DB.prepare(
    'SELECT id, color, name FROM color_library WHERE user_id = ? AND color = ?',
  )
    .bind(userId, fields.color)
    .first<{ id: string; color: string; name: string }>();
  if (existing) return c.json({ color: existing });
  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM color_library WHERE user_id = ?')
    .bind(userId)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= LIMITS.maxLibraryColors) {
    return c.json(
      { error: `Your color palette is full (${LIMITS.maxLibraryColors}). Remove some first.` },
      400,
    );
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO color_library (id, user_id, color, name) VALUES (?, ?, ?, ?)',
  )
    .bind(id, userId, fields.color, fields.name)
    .run();
  return c.json({ color: { id, ...fields } }, 201);
});

app.delete('/api/colors/:id', async (c) => {
  const result = await c.env.DB.prepare('DELETE FROM color_library WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  if (!result.meta.changes) return c.json({ error: 'Color not found.' }, 404);
  return c.json({ ok: true });
});

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'Something went wrong on the server.' }, 500);
});

export default app;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface QuiltRow {
  id: string;
  name: string;
  data: string;
  created_at: string;
  updated_at: string;
}

async function getQuiltRow(db: D1Database, userId: number, id: string) {
  return db
    .prepare(
      'SELECT id, name, data, created_at, updated_at FROM quilts WHERE id = ? AND user_id = ?',
    )
    .bind(id, userId)
    .first<QuiltRow>();
}

function rowToQuilt(row: QuiltRow) {
  return {
    id: row.id,
    name: row.name,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function readJson(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function isHttps(url: string): boolean {
  return new URL(url).protocol === 'https:';
}

function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const email = v.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim().slice(0, LIMITS.maxNameLen);
  return name.length > 0 ? name : null;
}

function validationResponse(c: any, err: unknown) {
  if (err instanceof ValidationError) return c.json({ error: err.message }, 400);
  throw err;
}

function dataTooLarge(c: any) {
  return c.json(
    { error: 'This quilt is too large to save — try removing some fabric photos.' },
    400,
  );
}

/** A hash of a random unknowable password, used to equalize login timing. */
const DUMMY_HASH =
  'pbkdf2$50000$5f1d0e6a3b8c49d2a7e4f0b1c6d8e9f0$' +
  '9c1c01dc3ac1445a500251fc34a15d3e75a849df8eaad55aa4406fcbea75e240';
