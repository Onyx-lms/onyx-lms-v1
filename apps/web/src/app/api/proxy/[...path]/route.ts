import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE } from '@/lib/session';
import { ONYX_COOKIE } from '@/lib/onyx-session';
import { PLATFORM_COOKIE } from '@/lib/onyx-platform-session';

/**
 * Authenticated passthrough to the API for client components.
 *
 * The session cookie is httpOnly, so the browser cannot attach the bearer token
 * itself. This handler does it server-side. Only /api/* on the API is reachable,
 * and the token is never exposed to page scripts.
 *
 * Two products share this origin (ADR-006) and each has its own cookie. The
 * path decides which one is sent: an Onyx token must never be offered to the
 * port's routes, nor the port's to Onyx's. `onyx/platform/*` is a third case
 * on top of that: a platform token, never a tenant token, because a platform
 * admin's session carries no tenant_id for a tenant-scoped route to even use.
 */
const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

function cookieFor(path: string[]): string {
  if (path[0] === 'onyx' && path[1] === 'platform') return PLATFORM_COOKIE;
  if (path[0] === 'onyx') return ONYX_COOKIE;
  return TOKEN_COOKIE;
}

async function forward(request: Request, path: string[], method: string) {
  const jar = await cookies();
  const token = jar.get(cookieFor(path))?.value;
  const search = new URL(request.url).search;
  // An empty string is not "no body". Forwarding '' made Fastify parse the
  // request to `''`, and a route doing `req.body ?? {}` kept it -- `??` only
  // catches null and undefined -- so zod was handed a string and refused it
  // with "The given data was invalid". Every bodyless POST through here
  // (enrol, publish, claim) hit that.
  const raw = ['GET', 'DELETE'].includes(method) ? '' : await request.text();
  const body = raw === '' ? undefined : raw;

  // Only declare a JSON body when there actually is one. Fastify rejects a
  // request that claims application/json but sends nothing, which would break
  // every DELETE in the admin UI.
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API}/api/${path.join('/')}${search}`, {
    method, headers, body,
  });
  const payload = await res.json().catch(() => ({ ok: false, message: 'Bad response' }));
  return NextResponse.json(payload, { status: res.status });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, 'GET');
}
export async function POST(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, 'POST');
}
export async function PATCH(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, 'PATCH');
}
export async function PUT(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, 'PUT');
}
export async function DELETE(request: Request, ctx: Ctx) {
  return forward(request, (await ctx.params).path, 'DELETE');
}
