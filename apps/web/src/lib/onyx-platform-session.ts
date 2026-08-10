import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * A platform admin's session -- deliberately its own cookie and its own
 * decode, not a variant of onyx-session.ts.
 *
 * A platform token carries no tenant_id (see packages/core/src/onyx/auth.ts),
 * so `OnyxClaims` -- which requires one -- cannot represent it, and should
 * not be made to: a type that can express both "in institution 12" and
 * "above every institution" is a type where confusing the two compiles.
 */
export const PLATFORM_COOKIE = 'onyx_platform_session';

export interface PlatformClaims {
  user_id: number;
  email: string;
  platform: true;
  exp: number;
}

const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

function decode(token: string): PlatformClaims | null {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as PlatformClaims;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    if (claims.platform !== true) return null;
    return claims;
  } catch {
    return null;
  }
}

export async function getPlatformToken(): Promise<string | null> {
  return (await cookies()).get(PLATFORM_COOKIE)?.value ?? null;
}

export async function getPlatformSession(): Promise<PlatformClaims | null> {
  const token = await getPlatformToken();
  return token ? decode(token) : null;
}

export async function requirePlatformSession(): Promise<PlatformClaims> {
  const session = await getPlatformSession();
  if (!session) redirect('/onyx/platform/login');
  return session;
}

export async function platformApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getPlatformToken();
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
