/**
 * Drives the REAL app as each role and checks the converted screens.
 *
 * Static design files could be checked by opening a file; these cannot — every
 * one of them is behind a session and renders from live data, so the only
 * honest check is to sign in and walk them.
 */
import { chromium } from 'playwright';
import path from 'node:path';

const BASE = process.env.E2E_WEB || 'http://127.0.0.1:5175';
const PW = 'Demo#2026!';
const outDir = process.argv[2];

const ROLES = {
  student: 'student@demo.onyx',
  admin: 'admin@demo.onyx',
  faculty: 'faculty@demo.onyx',
};

// route -> which role should be able to open it
const ROUTES = [
  ['student', '/onyx/dashboard'],
  ['student', '/onyx/courses'],
  ['student', '/onyx/practice'],
  ['student', '/onyx/workspaces'],
  ['student', '/onyx/assessments'],
  ['student', '/onyx/results'],
  ['student', '/onyx/contests'],
  ['student', '/onyx/timetable'],
  ['student', '/onyx/fees'],
  ['student', '/onyx/support'],
  ['student', '/onyx/jobs'],
  ['student', '/onyx/interviews'],
  ['student', '/onyx/profile'],
  ['student', '/onyx/inbox'],
  ['admin', '/onyx/dashboard'],
  ['admin', '/onyx/people'],
  ['admin', '/onyx/programs'],
  ['admin', '/onyx/allocations'],
  ['admin', '/onyx/finance'],
  ['admin', '/onyx/audit'],
  ['admin', '/onyx/certificates'],
  ['admin', '/onyx/invigilate'],
  ['admin', '/onyx/exams'],
  ['admin', '/onyx/placement'],
  ['admin', '/onyx/timetable'],
  ['faculty', '/onyx/assessments'],
  ['faculty', '/onyx/courses'],
];

const browser = await chromium.launch();
const results = [];

for (const role of Object.keys(ROLES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + '/onyx/login', { waitUntil: 'networkidle', timeout: 40000 });
    await page.waitForTimeout(700);
    await page.fill('input[type="email"], input[name="email"]', ROLES[role]);
    await page.fill('input[type="password"], input[name="password"]', PW);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/onyx/**', { timeout: 20000 });
    await page.waitForTimeout(600);
  } catch (e) {
    results.push({ role, route: '(login)', status: 'LOGIN_FAILED', detail: e.message.slice(0, 90) });
    await ctx.close();
    continue;
  }

  for (const [r, route] of ROUTES.filter(([r]) => r === role)) {
    const errors = [];
    const onErr = (m) => { if (m.type() === 'error') errors.push(m.text()); };
    page.on('console', onErr);
    const onPageErr = (e) => errors.push('pageerror: ' + e.message);
    page.on('pageerror', onPageErr);

    let httpStatus = 0;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      httpStatus = resp ? resp.status() : 0;
      await page.waitForTimeout(700);
    } catch (e) {
      results.push({ role, route, status: 'NAV_FAIL', detail: e.message.slice(0, 80) });
      page.off('console', onErr); page.off('pageerror', onPageErr);
      continue;
    }

    await page.setViewportSize({ width: 320, height: 900 });
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(300);

    if (outDir) {
      const name = role + route.replace(/\//g, '_') + '.png';
      await page.screenshot({ path: path.join(outDir, name), fullPage: true }).catch(() => {});
    }

    page.off('console', onErr); page.off('pageerror', onPageErr);
    results.push({
      role, route, status: httpStatus, overflow320: overflow,
      errors: errors.length, detail: errors[0] ? errors[0].slice(0, 100) : '',
    });
  }
  await ctx.close();
}
await browser.close();

let bad = 0;
for (const r of results) {
  const problems = [];
  if (r.status === 'LOGIN_FAILED' || r.status === 'NAV_FAIL') problems.push(r.status + ' ' + r.detail);
  else {
    if (r.status >= 400) problems.push('HTTP ' + r.status);
    if (r.overflow320 > 0) problems.push('OVERFLOW@320:' + r.overflow320 + 'px');
    if (r.errors) problems.push('CONSOLE(' + r.errors + '): ' + r.detail);
  }
  if (problems.length) { bad++; console.log('FAIL ' + (r.role + ' ' + r.route).padEnd(34) + problems.join('  ')); }
}
console.log(`\n${results.length} route-visits, ${results.length - bad} clean, ${bad} with problems.`);
