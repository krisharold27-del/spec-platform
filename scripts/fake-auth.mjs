/**
 * A stand-in for Supabase Auth, for tests only.
 *
 * The reason this exists: the sign-up and sign-in path could never be proven to WORK without
 * somebody's real Supabase credentials, so every check of it stopped at "the failure messages are
 * right" and the happy path was verified by reading the code. That is not good enough for the one
 * journey every customer takes before they have any reason to trust us.
 *
 * It speaks enough of the GoTrue HTTP API for the real @supabase/ssr client to talk to it
 * unmodified, so what gets tested is the actual production code path — no stubbing inside the app,
 * no test-only branch in anything that ships. Point NEXT_PUBLIC_SUPABASE_URL at this and the whole
 * journey runs for real.
 *
 * Accounts live in memory and vanish when it stops. It is never imported by the app, and it refuses
 * to start unless NODE_ENV is explicitly `test`.
 *
 *   node scripts/fake-auth.mjs [port]
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

if (process.env.NODE_ENV !== 'test') {
  console.error('[fake-auth] refusing to start outside NODE_ENV=test');
  process.exit(1);
}

const PORT = Number(process.argv[2] ?? 54321);

/** email -> { id, password, user } */
const accounts = new Map();
/** access token -> email */
const sessions = new Map();

const b64url = o => Buffer.from(JSON.stringify(o)).toString('base64url');

/**
 * A JWT-shaped token. The client reads the payload for `exp` and asks this server who the holder
 * is, so the signature is never verified locally — it only has to be well formed.
 */
function issue(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: user.id, email: user.email, exp: now + 3600, iat: now, role: 'authenticated' };
  const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.test`;
  sessions.set(token, user.email);
  return {
    access_token: token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: `refresh-${randomUUID()}`,
    user,
  };
}

const makeUser = (email, meta = {}) => ({
  id: randomUUID(),
  aud: 'authenticated',
  role: 'authenticated',
  email,
  email_confirmed_at: new Date().toISOString(),
  phone: '',
  confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'], ...meta },
  user_metadata: {},
  identities: [],
});

const send = (res, status, body) => {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(text);
};

const bearer = req => (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim();

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  let body = {};
  if (req.method !== 'GET') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString() || '{}';
    try { body = JSON.parse(raw); } catch { body = {}; }
  }

  // Sign up, either by the anon client or by the service-role admin endpoint.
  if (path === '/signup' || path === '/admin/users') {
    const email = String(body.email ?? '').toLowerCase().trim();
    const password = String(body.password ?? '');
    if (!email || !password) return send(res, 400, { msg: 'email and password required' });
    if (accounts.has(email)) {
      return send(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' });
    }
    const user = makeUser(email);
    accounts.set(email, { password, user });
    // The admin endpoint creates without signing in; the public one returns a session.
    return path === '/admin/users' ? send(res, 200, user) : send(res, 200, issue(user));
  }

  if (path === '/token') {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const email = [...sessions.values()][0];
      const account = email ? accounts.get(email) : null;
      if (!account) return send(res, 401, { msg: 'invalid refresh token' });
      return send(res, 200, issue(account.user));
    }
    const email = String(body.email ?? '').toLowerCase().trim();
    const account = accounts.get(email);
    if (!account || account.password !== String(body.password ?? '')) {
      return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
    }
    return send(res, 200, issue(account.user));
  }

  if (path === '/user' && req.method === 'GET') {
    const email = sessions.get(bearer(req));
    const account = email ? accounts.get(email) : null;
    if (!account) return send(res, 401, { msg: 'invalid claim: missing sub claim' });
    return send(res, 200, account.user);
  }

  if (path === '/user' && req.method === 'PUT') {
    const email = sessions.get(bearer(req));
    const account = email ? accounts.get(email) : null;
    if (!account) return send(res, 401, { msg: 'not authenticated' });
    if (body.password) account.password = String(body.password);
    return send(res, 200, account.user);
  }

  if (path.startsWith('/admin/users/')) {
    const id = path.split('/').pop();
    const found = [...accounts.values()].find(a => a.user.id === id);
    if (!found) return send(res, 404, { msg: 'user not found' });
    if (req.method === 'PUT') {
      found.user.app_metadata = { ...found.user.app_metadata, ...(body.app_metadata ?? {}) };
    }
    return send(res, 200, found.user);
  }

  if (path === '/logout') {
    sessions.delete(bearer(req));
    return send(res, 204, {});
  }

  if (path === '/recover' || path === '/otp') return send(res, 200, {});

  return send(res, 404, { msg: `fake-auth has no route for ${req.method} ${path}` });
});

server.listen(PORT, () => console.log(`[fake-auth] listening on ${PORT}`));
