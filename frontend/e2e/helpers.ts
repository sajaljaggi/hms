import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Browser, type Locator, type Page } from '@playwright/test';

export interface E2EFixtures {
  password: string;
  admin: { email: string; name: string };
  doctor: { email: string; name: string };
  patient: { email: string; name: string };
  traumaPatient: { name: string };
  unpaidVideoId: number;
  paidVideoId: number;
}

type Role = 'admin' | 'doctor' | 'patient';

const here = path.dirname(fileURLToPath(import.meta.url));
export const fx = (): E2EFixtures => JSON.parse(fs.readFileSync(path.join(here, '.auth-fixtures.json'), 'utf8'));

// The login limiter allows 10 attempts per IP per 15 min and the app trusts one proxy hop, so each
// login gets its own X-Forwarded-For (as tests/helpers/session.js does). Production limits stay as is.
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

// Logs in through the real login form and waits for the role's dashboard.
export async function login(page: Page, role: Role) {
  const f = fx();
  await page.context().setExtraHTTPHeaders({ 'X-Forwarded-For': randomIp() });
  await page.goto('/login');
  await page.getByRole('button', { name: role, exact: true }).click();
  await page.getByLabel('Email address').fill(f[role].email);
  await page.getByLabel('Password').fill(f.password);
  await page.locator('form').getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(new RegExp(`/${role}$`));
}

// A second, independent browser session (its own cookies) logged in as `role`.
export async function loginInNewContext(browser: Browser, role: Role) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, role);
  return page;
}

// Picks a patient in the shared PatientPicker (debounced search, then an option).
export async function pickPatient(scope: Page | Locator, labelText: string | RegExp, name: string) {
  await scope.getByLabel(labelText).fill(name);
  await scope.getByRole('option', { name: new RegExp(name) }).click();
}
