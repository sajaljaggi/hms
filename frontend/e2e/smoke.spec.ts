import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers';

// Every page, as the role that can open it, must render with no JS error, no console error,
// no failed API call and no error banner. Catches broken pages the flow specs never visit.
const PAGES = {
  public: ['/', '/navigate', '/login'],
  patient: ['/patient', '/patient/book', '/patient/history', '/patient/records', '/patient/profile', '/patient/payments'],
  doctor: ['/doctor', '/doctor/appointments', '/doctor/prescribe', '/doctor/beds', '/doctor/blood', '/doctor/emergency'],
  admin: ['/admin', '/admin/patients', '/admin/appointments', '/admin/doctors', '/admin/payments',
    '/admin/beds', '/admin/blood', '/admin/emergency'],
} as const;

function watch(page: Page) {
  const problems: string[] = [];
  let loggedIn = false;
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The browser also logs the expected pre-login 401 below as a console error.
    if (!loggedIn && /status of 401/.test(m.text())) return;
    problems.push(`console: ${m.text()}`);
  });
  page.on('response', (r) => {
    const url = r.url();
    if (!url.includes('/api/') || r.status() < 400) return;
    // Before login the app probes the session and gets the expected 401.
    if (!loggedIn && r.status() === 401 && url.includes('/api/auth/')) return;
    problems.push(`${r.status()} ${r.request().method()} ${url}`);
  });
  return { problems, setLoggedIn: () => { loggedIn = true; } };
}

async function visitAll(page: Page, paths: readonly string[], problems: string[]) {
  for (const p of paths) {
    const before = problems.length;
    await page.goto(p);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[role="alert"]'), `error banner on ${p}`).toHaveCount(0);
    for (let i = before; i < problems.length; i++) problems[i] = `${p}: ${problems[i]}`;
  }
}

test('public pages render cleanly', async ({ page }) => {
  const w = watch(page);
  await visitAll(page, PAGES.public, w.problems);
  expect(w.problems).toEqual([]);
});

for (const role of ['patient', 'doctor', 'admin'] as const) {
  test(`every ${role} page renders cleanly`, async ({ page }) => {
    const w = watch(page);
    await login(page, role);
    w.setLoggedIn();
    w.problems.length = 0; // the login page's own session probe is covered by the public test
    await visitAll(page, PAGES[role], w.problems);
    expect(w.problems).toEqual([]);
  });
}
