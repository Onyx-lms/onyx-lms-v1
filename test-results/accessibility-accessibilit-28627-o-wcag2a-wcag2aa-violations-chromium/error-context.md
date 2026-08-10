# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: accessibility.spec.ts >> accessibility >> the sign-in page has no wcag2a/wcag2aa violations
- Location: tests\browser\accessibility.spec.ts:42:3

# Error details

```
Error: link-in-text-block: .text-brand-600

expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 70

- Array []
+ Array [
+   Object {
+     "description": "Ensure links are distinguished from surrounding text in a way that does not rely on color",
+     "help": "Links must be distinguishable without relying on color",
+     "helpUrl": "https://dequeuniversity.com/rules/axe/4.12/link-in-text-block?application=playwright",
+     "id": "link-in-text-block",
+     "impact": "serious",
+     "nodes": Array [
+       Object {
+         "all": Array [],
+         "any": Array [
+           Object {
+             "data": Object {
+               "contrastRatio": 1.17,
+               "messageKey": "fgContrast",
+               "nodeColor": "#2b57c4",
+               "parentColor": "#475569",
+               "requiredContrastRatio": 3,
+             },
+             "id": "link-in-text-block",
+             "impact": "serious",
+             "message": "The link has insufficient color contrast of 1.17:1 with the surrounding text. (Minimum contrast is 3:1, link text: #2b57c4, surrounding text: #475569)",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<div class=\"mt-4 text-center text-sm text-slate-600\">Setting up a new institution?<!-- --> <a class=\"text-brand-600 hover:underline\" href=\"/onyx/signup\">Start here</a></div>",
+                 "target": Array [
+                   ".mt-4",
+                 ],
+               },
+             ],
+           },
+           Object {
+             "data": null,
+             "id": "link-in-text-block-style",
+             "impact": "serious",
+             "message": "The link has no styling (such as underline) to distinguish it from the surrounding text",
+             "relatedNodes": Array [
+               Object {
+                 "html": "<div class=\"mt-4 text-center text-sm text-slate-600\">Setting up a new institution?<!-- --> <a class=\"text-brand-600 hover:underline\" href=\"/onyx/signup\">Start here</a></div>",
+                 "target": Array [
+                   ".mt-4",
+                 ],
+               },
+             ],
+           },
+         ],
+         "failureSummary": "Fix any of the following:
+   The link has insufficient color contrast of 1.17:1 with the surrounding text. (Minimum contrast is 3:1, link text: #2b57c4, surrounding text: #475569)
+   The link has no styling (such as underline) to distinguish it from the surrounding text",
+         "html": "<a class=\"text-brand-600 hover:underline\" href=\"/onyx/signup\">Start here</a>",
+         "impact": "serious",
+         "none": Array [],
+         "target": Array [
+           ".text-brand-600",
+         ],
+       },
+     ],
+     "tags": Array [
+       "cat.color",
+       "wcag2a",
+       "wcag141",
+       "TTv5",
+       "TT13.a",
+       "EN-301-549",
+       "EN-9.1.4.1",
+       "RGAAv4",
+       "RGAA-10.6.1",
+     ],
+   },
+ ]
```

# Test source

```ts
  1  | /**
  2  |  * WCAG 2.2 AA, checked two ways only a real browser can check it.
  3  |  *
  4  |  * tests/e2e/o06-accessibility.e2e.ts already asserts the structural things
  5  |  * that are either present in the markup or not (a skip link, a stylesheet
  6  |  * rule, a table header). This file adds what needs a rendered page and a real
  7  |  * DOM: an axe-core scan, which evaluates computed styles, the accessibility
  8  |  * tree and ARIA semantics rather than grepping HTML text; and a keyboard-only
  9  |  * pass through the skip link, checking where focus actually lands and that
  10 |  * the ring a keyboard user relies on is really painted, not just declared.
  11 |  */
  12 | import { test, expect } from '@playwright/test';
  13 | import { AxeBuilder } from '@axe-core/playwright';
  14 | import {
  15 |   RUN, mail, createTenant, adminToken, addMember, signInViaForm, cleanupTenants,
  16 | } from './helpers.ts';
  17 | 
  18 | const T = { name: 'Browser A11y Institute ' + RUN, slug: 'browser-a11y-' + RUN };
  19 | const adminEmail = mail('browser.a11y', 'admin');
  20 | const studentEmail = mail('browser.a11y', 'student');
  21 | 
  22 | const AA_TAGS = ['wcag2a', 'wcag2aa'];
  23 | 
  24 | /** Keeps a failure readable: which rule, on which element, not a wall of JSON. */
  25 | function explain(violations: { id: string; nodes: { target: string[] }[] }[]): string {
  26 |   return violations
  27 |     .map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(', '))
  28 |     .join('\n');
  29 | }
  30 | 
  31 | test.describe('accessibility', () => {
  32 |   test.beforeAll(async () => {
  33 |     await createTenant(T.name, T.slug, 'Admin', adminEmail);
  34 |     const token = await adminToken(adminEmail);
  35 |     await addMember(token, 'Student', studentEmail, 'student');
  36 |   });
  37 | 
  38 |   test.afterAll(async () => {
  39 |     await cleanupTenants([T.slug], 'browser.a11y.%.' + RUN + '@onyx.test');
  40 |   });
  41 | 
  42 |   test('the sign-in page has no wcag2a/wcag2aa violations', async ({ page }) => {
  43 |     await page.goto('/onyx/login');
  44 |     const results = await new AxeBuilder({ page }).withTags(AA_TAGS).analyze();
> 45 |     expect(results.violations, explain(results.violations)).toEqual([]);
     |                                                             ^ Error: link-in-text-block: .text-brand-600
  46 |   });
  47 | 
  48 |   test('the dashboard has no wcag2a/wcag2aa violations', async ({ page }) => {
  49 |     await signInViaForm(page, studentEmail);
  50 |     const results = await new AxeBuilder({ page }).withTags(AA_TAGS).analyze();
  51 |     expect(results.violations, explain(results.violations)).toEqual([]);
  52 |   });
  53 | 
  54 |   test('the courses catalog has no wcag2a/wcag2aa violations', async ({ page }) => {
  55 |     await signInViaForm(page, studentEmail);
  56 |     await page.goto('/onyx/courses');
  57 |     const results = await new AxeBuilder({ page }).withTags(AA_TAGS).analyze();
  58 |     expect(results.violations, explain(results.violations)).toEqual([]);
  59 |   });
  60 | 
  61 |   test('the roster, with its data table and inline controls, has no violations', async ({ page }) => {
  62 |     await signInViaForm(page, adminEmail);
  63 |     await page.goto('/onyx/people');
  64 |     const results = await new AxeBuilder({ page }).withTags(AA_TAGS).analyze();
  65 |     expect(results.violations, explain(results.violations)).toEqual([]);
  66 |   });
  67 | 
  68 |   test('2.4.1 / 2.4.7 keyboard: Tab reaches the skip link first, and it really moves focus', async ({ page }) => {
  69 |     await page.goto('/onyx/login');
  70 | 
  71 |     // Nothing has been focused yet, so the very first Tab must land on the
  72 |     // skip link -- if the DOM ever grew something focusable before it, this
  73 |     // is the test that would catch it.
  74 |     await page.keyboard.press('Tab');
  75 |     const skipLink = page.locator(':focus');
  76 |     await expect(skipLink).toHaveClass(/skip-link/);
  77 |     await expect(skipLink).toHaveAttribute('href', '#main');
  78 | 
  79 |     // Tailwind's reset sets outline to a transparent solid line (present, but
  80 |     // invisible) and relies on a box-shadow ring instead -- so outline-style
  81 |     // alone would pass even if the ring never rendered. Check the thing that
  82 |     // is actually painted.
  83 |     const ring = await skipLink.evaluate((el) => getComputedStyle(el).boxShadow);
  84 |     expect(ring, 'the skip link has no visible focus ring').not.toBe('none');
  85 | 
  86 |     // Activating it (Enter, not a click -- this is the keyboard path) must
  87 |     // move focus to #main, not just scroll to it. <main> is not natively
  88 |     // focusable; without tabIndex={-1} in the root layout this assertion is
  89 |     // exactly what would catch that regression.
  90 |     await page.keyboard.press('Enter');
  91 |     await expect(page).toHaveURL(/#main$/);
  92 |     const activeId = await page.evaluate(() => document.activeElement?.id);
  93 |     expect(activeId).toBe('main');
  94 |   });
  95 | });
  96 | 
```