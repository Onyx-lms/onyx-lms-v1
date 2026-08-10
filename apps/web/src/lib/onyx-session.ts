import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * Onyx's server-side session (F-03 / F-06).
 *
 * Same arrangement as the port's lib/session.ts -- the token lives in an
 * httpOnly cookie this origin owns and is forwarded as a Bearer header, so it
 * never reaches page scripts.
 *
 * The cookie is deliberately NOT the port's `onyx_session`. Two products share
 * this origin in development, and a session for one must never be mistaken for
 * a session in the other.
 */
export const ONYX_COOKIE = 'onyx_tenant_session';

export type Role = 'student' | 'faculty' | 'exams' | 'placement' | 'admin';

export interface OnyxClaims {
  user_id: number;
  tenant_id: number;
  tenant_role: Role;
  email: string;
  exp: number;
}

export interface Tenant { id: number; name: string; slug: string; plan: string | null }

export interface Me {
  user_id: number;
  email: string;
  role: Role;
  tenant: Tenant;
  memberships: { tenant: Tenant; role: Role }[];
}

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

function decode(token: string): OnyxClaims | null {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as OnyxClaims;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    // A session without a tenant cannot be scoped to one, so it is not a
    // session. The API refuses it too; this only decides what to render.
    if (!claims.tenant_id || !claims.tenant_role) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function getOnyxToken(): Promise<string | null> {
  return (await cookies()).get(ONYX_COOKIE)?.value ?? null;
}

export async function getOnyxSession(): Promise<OnyxClaims | null> {
  const token = await getOnyxToken();
  return token ? decode(token) : null;
}

export async function onyxApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getOnyxToken();
  const res = await fetch(API + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({ ok: false, message: 'Bad response' }));
  if (!body.ok) throw new Error(body.message || 'Request failed: ' + path);
  return body.data as T;
}

export async function onyxApiSafe<T>(path: string): Promise<T | null> {
  try { return await onyxApi<T>(path); } catch { return null; }
}

export async function requireOnyxSession(): Promise<OnyxClaims> {
  const session = await getOnyxSession();
  if (!session) redirect('/onyx/login');
  return session;
}

/**
 * F-04 at the page level. The API enforces this too -- this only keeps someone
 * from being shown a page whose every request would then fail.
 */
export async function requireOnyxPageRole(...allowed: Role[]): Promise<OnyxClaims> {
  const session = await requireOnyxSession();
  if (!allowed.includes(session.tenant_role)) redirect('/onyx/denied');
  return session;
}

// Role labels live in lib/onyx-nav.ts: client components need them, and this
// module pulls in next/headers, which they cannot import.
