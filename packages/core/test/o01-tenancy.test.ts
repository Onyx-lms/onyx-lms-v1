/**
 * Onyx O01 unit tests -- the decisions the E2E cannot reach cheaply.
 *
 * The E2E proves isolation against the real database. These cover the rules
 * that live in the service and the token: what happens at the edges, where a
 * mistake is silent rather than loud.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeDb } from './fake-db.ts';
import { TenancyService, ROLES } from '../src/onyx/tenancy.service.ts';
import { AuditService } from '../src/onyx/audit.service.ts';
import {
  issueOnyxToken, verifyOnyxToken, extractOnyxToken, requireOnyx, requireOnyxRole,
  assertSameTenant,
} from '../src/onyx/auth.ts';
import { hashPassword } from '../src/auth/password.ts';
import { HttpError } from '../src/http/errors.ts';

const SECRET = 'onyx-unit-test-secret';

const req = (token?: string, cookie?: string) => ({
  headers: token ? { authorization: 'Bearer ' + token } : {},
  cookies: cookie ? { onyx_session: cookie } : undefined,
});

const token = (over: Partial<Parameters<typeof issueOnyxToken>[0]> = {}) =>
  issueOnyxToken({
    userId: 1, tenantId: 7, tenantRole: 'admin', email: 'a@onyx.test',
    secret: SECRET, ...over,
  }).token;

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

test('a token carries the tenant and the role held inside it', () => {
  const claims = verifyOnyxToken(token(), SECRET)!;
  assert.equal(claims.tenant_id, 7);
  assert.equal(claims.tenant_role, 'admin');
  assert.equal(claims.user_id, 1);
  // PostgREST SET ROLEs on this; anything else and every RLS policy misfires.
  assert.equal(claims.role, 'authenticated');
  assert.equal(claims.aud, 'authenticated');
  assert.equal(claims.sub, '1');
});

test('a token signed with another secret is not a token', () => {
  assert.equal(verifyOnyxToken(token(), 'a-different-secret'), null);
});

test('an expired token is not a token', () => {
  const stale = issueOnyxToken({
    userId: 1, tenantId: 7, tenantRole: 'admin', email: 'a@onyx.test',
    secret: SECRET, ttlSeconds: -10,
  }).token;
  assert.equal(verifyOnyxToken(stale, SECRET), null);
});

test('the cookie is read when there is no bearer header', () => {
  const t = token();
  assert.equal(extractOnyxToken(req(t)), t);
  assert.equal(extractOnyxToken(req(undefined, t)), t);
  assert.equal(extractOnyxToken(req()), null);
});

test('a token with no usable tenant is refused rather than defaulted', () => {
  // Defaulting a missing tenant is how a request reads the wrong institution,
  // so each of these is a 401 and not "tenant 0" or "tenant undefined".
  for (const bad of [undefined, null, 0, -1, 1.5, '7']) {
    const forged = issueOnyxToken({
      userId: 1, tenantId: bad as never, tenantRole: 'admin',
      email: 'a@onyx.test', secret: SECRET,
    }).token;
    assert.throws(() => requireOnyx(req(forged), SECRET), (e: HttpError) => e.status === 401,
      'tenant_id=' + JSON.stringify(bad) + ' was accepted');
  }
});

test('a token with a tenant but no role is refused', () => {
  const forged = issueOnyxToken({
    userId: 1, tenantId: 7, tenantRole: undefined as never,
    email: 'a@onyx.test', secret: SECRET,
  }).token;
  assert.throws(() => requireOnyx(req(forged), SECRET), (e: HttpError) => e.status === 401);
});

test('role guards allow exactly the roles named', () => {
  for (const role of ROLES) {
    const t = token({ tenantRole: role });
    assert.equal(requireOnyxRole(req(t), SECRET, role).tenant_role, role);
    const others = ROLES.filter((r) => r !== role);
    assert.throws(() => requireOnyxRole(req(t), SECRET, ...others),
      (e: HttpError) => e.status === 403, role + ' passed a guard for ' + others.join('/'));
  }
});

test('a tenant id from a request is checked against the token, not trusted', () => {
  const claims = verifyOnyxToken(token(), SECRET)!;
  assert.doesNotThrow(() => assertSameTenant(claims, 7));
  assert.throws(() => assertSameTenant(claims, 8), (e: HttpError) => e.status === 403);
});

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

async function make() {
  const db = new FakeDb({
    onyx_tenants: [
      { id: 1, name: 'Alpha University', slug: 'alpha', status: 1, plan: null },
      { id: 2, name: 'Beta Institute', slug: 'beta', status: 1, plan: null },
      { id: 3, name: 'Closed College', slug: 'closed', status: 0, plan: null },
    ],
    onyx_users: [
      { id: 10, email: 'admin@alpha.test', name: 'Alpha Admin',
        password: await hashPassword('Secret#2026'), status: 1 },
      { id: 11, email: 'shared@both.test', name: 'Shared',
        password: await hashPassword('Secret#2026'), status: 1 },
      { id: 12, email: 'suspended@alpha.test', name: 'Suspended',
        password: await hashPassword('Secret#2026'), status: 0 },
      { id: 13, email: 'nobody@nowhere.test', name: 'Nobody',
        password: await hashPassword('Secret#2026'), status: 1 },
      { id: 14, email: 'ghost@closed.test', name: 'Ghost',
        password: await hashPassword('Secret#2026'), status: 1 },
    ],
    onyx_memberships: [
      { id: 100, tenant_id: 1, user_id: 10, role: 'admin', status: 1 },
      { id: 101, tenant_id: 1, user_id: 11, role: 'faculty', status: 1 },
      { id: 102, tenant_id: 2, user_id: 11, role: 'student', status: 1 },
      { id: 103, tenant_id: 1, user_id: 12, role: 'student', status: 1 },
      { id: 104, tenant_id: 2, user_id: 10, role: 'admin', status: 1 },
      { id: 105, tenant_id: 2, user_id: 13, role: 'student', status: 1 },
      { id: 106, tenant_id: 3, user_id: 14, role: 'admin', status: 1 },
    ],
    onyx_audit_logs: [],
  });
  return { db, svc: new TenancyService(db as never) };
}

test('an institution and its first administrator are created together', async () => {
  const { db, svc } = await make();
  const { tenant, admin } = await svc.createTenant({
    name: 'Gamma Polytechnic',
    admin: { name: 'G Admin', email: 'g@gamma.test', password: 'Secret#2026' },
  });
  assert.equal(tenant!.slug, 'gamma-polytechnic');
  // An institution with no admin cannot be fixed from inside it.
  const m = db.tables.onyx_memberships!.find((r) => r.user_id === admin.id)!;
  assert.equal(m.tenant_id, tenant!.id);
  assert.equal(m.role, 'admin');
});

test('a name that yields no usable address is rejected before anything is written', async () => {
  const { db, svc } = await make();
  const before = db.tables.onyx_tenants!.length;
  await assert.rejects(svc.createTenant({
    name: '!!!', admin: { name: 'x', email: 'x@x.test', password: 'Secret#2026' },
  }), (e: HttpError) => e.status === 422);
  assert.equal(db.tables.onyx_tenants!.length, before, 'a tenant was written anyway');
});

test('a slug belongs to one institution', async () => {
  const { svc } = await make();
  await assert.rejects(svc.createTenant({
    name: 'Alpha University', slug: 'alpha',
    admin: { name: 'x', email: 'x@x.test', password: 'Secret#2026' },
  }), (e: HttpError) => e.status === 422);

  // And when two signups race past that check, the unique constraint answers
  // with the same 422 rather than a 500.
  const racing = new TenancyService({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
      insert: () => ({ select: () => ({ maybeSingle: async () =>
        ({ data: null, error: { code: '23505', message: 'duplicate key' } }) }) }),
    }),
  } as never);
  await assert.rejects(racing.createTenant({
    name: 'Delta School',
    admin: { name: 'x', email: 'x@x.test', password: 'Secret#2026' },
  }), (e: HttpError) => e.status === 422);
});

test('inviting an existing address attaches the person, it does not clone them', async () => {
  const { db, svc } = await make();
  const before = db.tables.onyx_users!.length;
  const { user } = await svc.invite(3, {
    name: 'Different Name', email: 'ADMIN@Alpha.test', role: 'faculty',
  });
  // Same identity, matched case-insensitively -- a second row here is how one
  // person ends up locked out of half their institutions.
  assert.equal(user.id, 10);
  assert.equal(db.tables.onyx_users!.length, before);
});

test('one person, one role per institution', async () => {
  const { svc } = await make();
  await assert.rejects(svc.addMember(1, 10, 'student'), (e: HttpError) => e.status === 422);
});

test('a role has to be a role', async () => {
  const { svc } = await make();
  await assert.rejects(svc.addMember(1, 13, 'superuser' as never),
    (e: HttpError) => e.status === 422);
  await assert.rejects(svc.changeRole(1, 101, 'owner' as never),
    (e: HttpError) => e.status === 422);
});

test('the switcher lists every live institution a person belongs to', async () => {
  const { svc } = await make();
  const shared = await svc.membershipsFor(11);
  assert.deepEqual(shared.map((m) => m.tenant.slug).sort(), ['alpha', 'beta']);
  // Roles are per membership: the same person, two different things.
  assert.deepEqual(shared.map((m) => m.role).sort(), ['faculty', 'student']);
});

test('a membership of a suspended institution is not a way in', async () => {
  const { svc } = await make();
  assert.deepEqual(await svc.membershipsFor(14), []);
  await assert.rejects(svc.authenticate('ghost@closed.test', 'Secret#2026'),
    (e: HttpError) => e.status === 403);
});

test('a member of one institution is not addressable from another', async () => {
  const { svc } = await make();
  // Membership 102 is real and belongs to Beta. Alpha's admin holds a valid
  // token; the tenant scope is the only thing in the way.
  await assert.rejects(svc.changeRole(1, 102, 'admin'), (e: HttpError) => e.status === 404);
  await assert.rejects(svc.removeMember(1, 102), (e: HttpError) => e.status === 404);
  // 404 rather than 403: whether that id exists is not Alpha's business.
});

test('the last administrator cannot demote or remove themselves', async () => {
  const { svc } = await make();
  await assert.rejects(svc.changeRole(1, 100, 'student'), (e: HttpError) => e.status === 422);
  await assert.rejects(svc.removeMember(1, 100), (e: HttpError) => e.status === 422);

  // With a second admin appointed, the first is free to go.
  await svc.changeRole(1, 101, 'admin');
  assert.deepEqual(await svc.changeRole(1, 100, 'faculty'), { id: 100, from: 'admin', to: 'faculty' });
});

test('a roster is one institution and is searchable within it', async () => {
  const { svc } = await make();
  const alpha = await svc.members(1);
  assert.deepEqual(alpha.map((m) => m.id).sort(), [100, 101, 103]);
  for (const m of alpha) assert.equal(m.tenant_id, 1);

  assert.deepEqual((await svc.members(1, { role: 'admin' })).map((m) => m.id), [100]);
  // Search covers name and address, case-insensitively.
  assert.deepEqual((await svc.members(1, { search: 'SHARED@both' })).map((m) => m.id), [101]);
  assert.deepEqual((await svc.members(1, { search: 'alpha admin' })).map((m) => m.id), [100]);
  assert.deepEqual(await svc.members(1, { search: 'nobody' }), []);
});

test('sign-in tells an attacker nothing about which addresses exist', async () => {
  const { svc } = await make();
  const wrongPassword = await svc.authenticate('admin@alpha.test', 'wrong').catch((e) => e);
  const noSuchPerson = await svc.authenticate('ghost@nowhere.test', 'wrong').catch((e) => e);
  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchPerson.status, 401);
  assert.equal(wrongPassword.message, noSuchPerson.message);
});

test('sign-in picks the named institution, and refuses one you do not belong to', async () => {
  const { svc } = await make();
  const beta = await svc.authenticate('shared@both.test', 'Secret#2026', 2);
  assert.equal(beta.membership.role, 'student');
  const alpha = await svc.authenticate('shared@both.test', 'Secret#2026', 1);
  assert.equal(alpha.membership.role, 'faculty');

  await assert.rejects(svc.authenticate('shared@both.test', 'Secret#2026', 3),
    (e: HttpError) => e.status === 403);
});

test('a suspended account cannot sign in even with the right password', async () => {
  const { svc } = await make();
  await assert.rejects(svc.authenticate('suspended@alpha.test', 'Secret#2026'),
    (e: HttpError) => e.status === 403);
});

test('an account belonging to no institution is told so, not let in', async () => {
  const { db, svc } = await make();
  db.tables.onyx_memberships = db.tables.onyx_memberships!.filter((m) => m.user_id !== 13);
  await assert.rejects(svc.authenticate('nobody@nowhere.test', 'Secret#2026'),
    (e: HttpError) => e.status === 403);
});

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

test('an audit entry records the actor, the tenant and both sides of the change', async () => {
  const { db } = await make();
  const audit = new AuditService(db as never);
  await audit.record({ tenant_id: 1, user_id: 10 }, {
    action: 'membership.role_changed', entityType: 'membership', entityId: 101,
    before: { role: 'faculty' }, after: { role: 'admin' }, ip: '203.0.113.9',
  });
  const [row] = db.tables.onyx_audit_logs as Record<string, unknown>[];
  assert.equal(row!.tenant_id, 1);
  assert.equal(row!.actor_id, 10);
  assert.deepEqual(row!.before, { role: 'faculty' });
  assert.deepEqual(row!.after, { role: 'admin' });
  assert.equal(row!.ip, '203.0.113.9');
});

test('a system action has no actor rather than a fabricated one', async () => {
  const { db } = await make();
  await new AuditService(db as never).recordSystem(1, {
    action: 'tenant.created', entityType: 'tenant', entityId: 1,
  });
  // actor_id is a foreign key to a real person; a placeholder id would fail it
  // and the entry would be lost.
  assert.equal((db.tables.onyx_audit_logs as Record<string, unknown>[])[0]!.actor_id, null);
});

test('a failed audit write is reported, never thrown', async () => {
  // The row describes work that already happened. Throwing here would undo it.
  const broken = {
    from: () => ({ insert: async () => ({ error: { message: 'disk on fire' } }) }),
  };
  const seen: string[] = [];
  const audit = new AuditService(broken as never, (m) => seen.push(m));
  await audit.record({ tenant_id: 1, user_id: 10 },
    { action: 'certificate.revoked', entityType: 'certificate', entityId: 5 });
  assert.equal(seen.length, 1);
  assert.match(seen[0]!, /certificate\.revoked/);
  assert.match(seen[0]!, /disk on fire/);
});

test('the audit log reads one institution, newest first', async () => {
  const { db } = await make();
  const audit = new AuditService(db as never);
  await audit.record({ tenant_id: 1, user_id: 10 },
    { action: 'membership.created', entityType: 'membership', entityId: 101 });
  await audit.record({ tenant_id: 2, user_id: 10 },
    { action: 'membership.removed', entityType: 'membership', entityId: 102 });
  await audit.record({ tenant_id: 1, user_id: 10 },
    { action: 'certificate.issued', entityType: 'certificate', entityId: 9 });

  const alpha = await audit.list(1);
  assert.deepEqual(alpha.map((r) => r.action), ['certificate.issued', 'membership.created']);
  for (const r of alpha) assert.equal(r.tenant_id, 1);
  assert.equal(alpha[0]!.actor?.email, 'admin@alpha.test');

  assert.deepEqual((await audit.list(1, { action: 'certificate.issued' })).map((r) => r.entity_id), [9]);
  assert.deepEqual(await audit.list(1, { entityType: 'nothing' }), []);
});

test('a caller cannot ask the audit log for more than it will give', async () => {
  const { db } = await make();
  const audit = new AuditService(db as never);
  for (let i = 0; i < 600; i += 1) {
    (db.tables.onyx_audit_logs as Record<string, unknown>[]).push({
      id: i + 1, tenant_id: 1, actor_id: null, action: 'fee.updated',
      entity_type: 'fee', entity_id: i,
    });
  }
  assert.equal((await audit.list(1, { limit: 10_000 })).length, 500);
});
