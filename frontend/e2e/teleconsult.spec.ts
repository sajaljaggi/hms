import { test, expect } from '@playwright/test';
import { fx, login, loginInNewContext } from './helpers';

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

test('unpaid visit asks for payment; paid patient waits until the doctor admits them, then both are in the call', async ({ page, browser }) => {
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
  await expect(page.getByRole('status')).toContainText('You are in the waiting room');
  await expect(page.getByTestId('fake-jitsi')).toHaveCount(0);

  // The doctor, in their own session, joins from their appointments list and admits the patient.
  const doc = await loginInNewContext(browser, 'doctor');
  await doc.route('**/external_api.js', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_JITSI }));
  await doc.goto('/doctor/appointments');
  await doc.getByRole('link', { name: 'Join video' }).first().click();
  await expect(doc).toHaveURL(new RegExp(`/consult/${f.paidVideoId}$`));
  await expect(doc.getByTestId('fake-jitsi')).toBeVisible();
  await expect(doc.getByText('The patient is waiting to join.')).toBeVisible();
  await doc.getByRole('button', { name: 'Admit patient' }).click();
  await expect(doc.getByText(/Patient admitted/)).toBeVisible();

  // The patient's page picks up the admission on its next check and starts the call in the same room.
  const room = page.getByRole('region', { name: 'Video call' });
  await expect(room.getByTestId('fake-jitsi')).toContainText(/Fake call hms-[0-9a-f]{32}/, { timeout: 15_000 });
  const jitsi = await page.evaluate(() => (globalThis as unknown as { __jitsi: { domain: string; roomName: string; displayName: string } }).__jitsi);
  const docJitsi = await doc.evaluate(() => (globalThis as unknown as { __jitsi: { roomName: string } }).__jitsi);
  expect(jitsi.domain).toMatch(/^[a-z0-9.-]+$/i);
  expect(jitsi.displayName).toBe(f.patient.name);
  expect(jitsi.roomName).toBe(docJitsi.roomName);
  await doc.context().close();
});
