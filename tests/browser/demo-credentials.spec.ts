/**
 * Sanity check for the persistent demo institution ("EZiL Demo Institute",
 * slug ezil-demo) handed to the user as fixed, reusable credentials -- as
 * opposed to every other file in this suite, which seeds a fresh run-unique
 * tenant per file. This one exists purely to prove those exact emails and
 * that exact password still work, end to end, through the real form.
 */
import { test, expect } from '@playwright/test';

const PASSWORD = 'OnyxDemo#2026';
const ACCOUNTS = [
  'admin@onyx-demo.test',
  'faculty@onyx-demo.test',
  'student@onyx-demo.test',
  'exams@onyx-demo.test',
  'placement@onyx-demo.test',
  'employer@onyx-demo.test',
] as const;

test.describe('the fixed demo credentials handed to the user', () => {
  for (const email of ACCOUNTS) {
    test(email + ' signs in through the real form', async ({ page }) => {
      await page.goto('/onyx/login');
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL('**/onyx/dashboard', { timeout: 10_000 });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }
});
