import { test, expect } from '@playwright/test';
import { fx, login } from './helpers';

// Stands in for https://<domain>/external_api.js so no real call starts.
const FAKE_JITSI = `
window.JitsiMeetExternalAPI = class {
  constructor(domain, opts) {
    window.__jitsi = { domain, roomName: opts.roomName, displayName: opts.userInfo && opts.userInfo.displayName };
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'fake-jitsi');
    el.textContent = 'Fake call ' + opts.roomName;
    opts.parentNode.appendChild(el);
  }
  dispose() {}
};`;

test('unpaid video visit asks for payment, paid in-window visit opens the room', async ({ page }) => {
  const f = fx();
  await page.route('**/external_api.js', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_JITSI }));
  await login(page, 'patient');

  await page.goto(`/consult/${f.unpaidVideoId}`);
  await expect(page.getByRole('alert')).toContainText('Payment required');
  await expect(page.getByRole('link', { name: 'Go to appointment history' })).toBeVisible();
  await expect(page.getByTestId('fake-jitsi')).toHaveCount(0);

  await page.goto('/patient/history');
  await page.getByRole('link', { name: 'Join video' }).click();
  await expect(page).toHaveURL(new RegExp(`/consult/${f.paidVideoId}$`));
  const room = page.getByRole('region', { name: 'Video call' });
  await expect(room.getByTestId('fake-jitsi')).toContainText(/Fake call hms-[0-9a-f]{32}/);
  const jitsi = await page.evaluate(() => (globalThis as unknown as { __jitsi: { domain: string; displayName: string } }).__jitsi);
  expect(jitsi.domain).toMatch(/^[a-z0-9.-]+$/i);
  expect(jitsi.displayName).toBe(f.patient.name);
});
