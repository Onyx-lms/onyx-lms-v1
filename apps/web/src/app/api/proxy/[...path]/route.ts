import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { TOKEN_COOKIE } from '@/lib/session';

/**
 * Authenticated passthrough to the API for client components.
 *
 * The session cookie is httpOnly, so the browser cannot attach the bearer token
 * itself. This handler does it server-side. Only /api/* on the API is reachable,
 * and the token is never exposed to page scripts.
 */
const API = process.env.API_URL ?? 'http://127.0.0.1:4000';

async function forward(request: Request, path: string[], method: string) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const search = new URL(request.url).search;
  const body = ['GET', 'DELETE'].includes(method)
    ? undefined
    : await request.text();

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
