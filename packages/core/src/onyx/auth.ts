/**
 * F-03 / F-04 -- Onyx access tokens and guards.
 *
 * Same signing arrangement as the port (ADR-001): HS256 with the Supabase JWT
 * secret, `role` fixed at 'authenticated' so PostgREST performs the right SET
 * ROLE, and the application's own claims alongside it. `auth.uid()` is never
 * used anywhere -- it casts `sub` to uuid and these ids are bigint.
 *
 * What is new here is `tenant_id`. It is the whole basis of isolation:
 * onyx.current_tenant_id() reads it inside every RLS policy, so a token without
 * one can read nothing, and a token for one institution can never read another.
 * Because that is load-bearing, a token missing the claim is refused outright
 * rather than treated as "no tenant yet".
 */
import jwt from 'jsonwebtoken';
import type { Role } from '@onyx/types';
import { unauthorized, forbidden } from '../http/errors.ts';
import type { RequestLike } from '../auth/guards.ts';

export interface OnyxTokenClaims {
  sub: string;
  user_id: number;
  tenant_id: number;
  role: 'authenticated';
  /** The role WITHIN this tenant. Held on the membership, not on the user. */
  tenant_role: Role;
  email: string;
  aud: 'authenticated';
  iat: number;
  exp: number;
}

export interface IssueOnyxToken {
  userId: number;
  tenantId: number;
  tenantRole: Role;
  email: string;
  secret: string;
  ttlSeconds?: number;
}

export function issueOnyxToken(input: IssueOnyxToken): { token: string; expiresAt: number } {
  const ttl = input.ttlSeconds ?? Number(process.env.ACCESS_TOKEN_TTL ?? 3600);
  const now = Math.floor(Date.now() / 1000);
  const claims: OnyxTokenClaims = {
    sub: String(input.userId),
    user_id: input.userId,
    tenant_id: input.tenantId,
    role: 'authenticated',
    tenant_role: input.tenantRole,
    email: input.email,
    aud: 'authenticated',
    iat: now,
    exp: now + ttl,
  };
  return { token: jwt.sign(claims, input.secret, { algorithm: 'HS256' }), expiresAt: claims.exp };
}

export function verifyOnyxToken(token: string, secret: string): OnyxTokenClaims | null {
  try {
    return jwt.verify(token, secret, { algorithms: ['HS256'] }) as OnyxTokenClaims;
  } catch {
    return null;
  }
}

export function extractOnyxToken(req: RequestLike): string | null {
  const header = req.headers['authorization'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw && raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  return req.cookies?.['onyx_session'] ?? null;
}

/**
 * Every Onyx request runs inside exactly one tenant. A token that does not name
 * one cannot be scoped, so it is rejected rather than defaulted -- defaulting is
 * how a request ends up reading the wrong institution.
 */
export function requireOnyx(req: RequestLike, secret: string): OnyxTokenClaims {
  const token = extractOnyxToken(req);
  if (!token) throw unauthorized();
  const claims = verifyOnyxToken(token, secret);
  if (!claims) throw unauthorized();
  if (!Number.isInteger(claims.tenant_id) || claims.tenant_id <= 0) throw unauthorized();
  if (!claims.tenant_role) throw unauthorized();
  return claims;
}

/** F-04 -- role check, resolved per tenant because that is where roles live. */
export function requireOnyxRole(req: RequestLike, secret: string, ...allowed: Role[]): OnyxTokenClaims {
  const claims = requireOnyx(req, secret);
  if (!allowed.includes(claims.tenant_role)) throw forbidden();
  return claims;
}

/**
 * Guards a tenant id taken from a path or body against the caller's own.
 *
 * Routes should prefer the claim outright. Where an id has to be accepted --
 * an admin console addressing its own tenant, say -- this makes the mismatch a
 * 403 rather than a silent cross-tenant read.
 */
export function assertSameTenant(claims: OnyxTokenClaims, tenantId: number): void {
  if (Number(tenantId) !== claims.tenant_id) throw forbidden();
}
