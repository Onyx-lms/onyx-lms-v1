/**
 * End-to-end harness.
 *
 * These tests talk to a RUNNING api (:4000), web (:5173) and the real Supabase
 * database. Nothing is mocked -- that is the point. Unit tests use an in-memory
 * fake that enforces no column widths, no constraints and no RLS, so anything
 * schema-sensitive only shows up here.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

export const API = process.env.E2E_API ?? 'http://127.0.0.1:4000';
export const WEB = process.env.E2E_WEB ?? 'http://127.0.0.1:5173';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^[/]([A-Za-z]:)/, '$1');
export const env = Object.fromEntries(
  fs.readFileSync(ROOT + '.env', 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));

export interface ApiResponse<T = any> {
  status: number;
  ok: boolean;
  data: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.token) headers.Authorization = 'Bearer ' + opts.token;

  const res = await fetch(API + path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    status: res.status,
    ok: Boolean(json.ok),
    data: json.data as T,
    message: json.message as string | undefined,
    errors: json.errors as Record<string, string[]> | undefined,
  };
}

/**
 * Tokens are cached per address.
 *
 * The API throttles login at 6 attempts per minute per ip+email (Laravel's
 * throttle:6,1). A suite that logs in on every test trips its own rate limiter
 * and fails for the wrong reason.
 */
// node --test runs ONE PROCESS PER FILE, so an in-memory cache buys nothing:
// six files each logging in twice trips the 6-per-minute limiter. The cache is
// file-backed so every file in a run shares the same tokens.
const CACHE_FILE = path.join(os.tmpdir(), 'onyx-e2e-tokens.json');

function readCache(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, string>): void {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch { /* best effort */ }
}

function stillValid(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    return Number(claims.exp) * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

export async function login(email: string, password: string): Promise<string> {
  const cache = readCache();
  if (stillValid(cache['token:' + email])) return cache['token:' + email]!;

  const res = await api<{ token: string }>('/api/auth/login', { body: { email, password } });
  if (!res.ok) throw new Error('login(' + email + ') failed: ' + res.message);
  cache['token:' + email] = res.data.token;
  writeCache(cache);
  return res.data.token;
}

/** Call once before a run so a previous run's expired tokens are not reused. */
export function clearTokenCache(): void {
  try { fs.unlinkSync(CACHE_FILE); } catch { /* nothing cached */ }
}

/** Direct database access, for asserting what actually landed. */
/**
 * Direct database access, for asserting what actually landed.
 *
 * Supabase's direct host is IPv6-only; on an IPv4-only network it fails with
 * ENOTFOUND and every assertion here looks like a broken database. tools/db/
 * connect.mjs falls back to the regional session pooler, which is IPv4.
 */
export async function withDb<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const { connect } = await import('../../tools/db/connect.mjs') as {
    connect: (env: Record<string, string>) => Promise<pg.Client>;
  };
  const client = await connect(env as unknown as Record<string, string>);
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export const ADMIN = { email: 'root@onyx.test', password: 'OnyxRoot#2026' };
export const STUDENT = { email: 'mailtest@onyx.test', password: 'Secret#2026' };

/** Unique-per-run suffix so repeated runs never collide. */
export const RUN = Date.now().toString(36);

export async function webPage(path: string, cookie?: string): Promise<{ status: number; html: string }> {
  const res = await fetch(WEB + path, {
    headers: cookie ? { cookie } : {},
    redirect: 'manual',
  });
  return { status: res.status, html: await res.text() };
}



export async function webLogin(email: string, password: string): Promise<string> {
  const cache = readCache();
  const key = 'cookie:' + email;
  // The cookie carries the same JWT as login(), so it expires the same way. Not
  // checking that here made a stale cookie look like a broken role guard.
  if (stillValid(cache[key]?.slice(cache[key]!.indexOf('=') + 1))) return cache[key]!;
  const res = await fetch(WEB + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.find((c) => c.startsWith('onyx_session='));
  if (!session) {
    const body = await res.json().catch(() => ({}));
    throw new Error('web login set no cookie: ' + (body.message ?? res.status));
  }
  const cookie = session.split(';')[0]!;
  cache[key] = cookie;
  writeCache(cache);
  return cookie;
}
