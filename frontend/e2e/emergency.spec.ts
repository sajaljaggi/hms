import { test, expect } from '@playwright/test';
import { fx, login, loginInNewContext, pickPatient } from './helpers';

test('doctor triages an ESI-1 arrival to the top, admin is alerted, doctor treats and admits', async ({ page, browser }) => {
  const f = fx();
  await login(page, 'doctor');
  await page.goto('/doctor/emergency');

  // A lower-acuity arrival first, so "top of the queue" is decided by acuity, not arrival order.
  await page.getByRole('button', { name: 'New arrival' }).click();
  let form = page.getByRole('form', { name: 'New arrival' });
  await form.getByLabel('Patient name').fill('E2E Sprained Ankle');
  await form.getByLabel('Chief complaint').fill('Ankle pain');
  await form.getByLabel('Expected resources').fill('1');
  await expect(form.getByTestId('suggested-esi')).toHaveText('4');
  await form.getByRole('button', { name: 'Register arrival' }).click();
  await expect(form).toBeHidden();

  await page.getByRole('button', { name: 'New arrival' }).click();
  form = page.getByRole('form', { name: 'New arrival' });
  await pickPatient(form, /Registered patient/, f.traumaPatient.name);
  await form.getByLabel('Chief complaint').fill('Cardiac arrest');
  await form.getByLabel(/immediate life-saving intervention/).check();
  await expect(form.getByTestId('suggested-esi')).toHaveText('1');
  await form.getByRole('button', { name: 'Register arrival' }).click();
  await expect(form).toBeHidden();

  const rows = page.getByTestId(/^case-\d+$/);
  await expect(rows.first()).toContainText(f.traumaPatient.name);
  await expect(rows.first().getByRole('cell').first()).toHaveText('1');
  await expect(rows.nth(1)).toContainText('E2E Sprained Ankle');

  const admin = await loginInNewContext(browser, 'admin');
  const bell = admin.getByRole('button', { name: 'Notifications' });
  await expect(bell.getByTestId('unread-badge')).toBeVisible();
  await bell.click();
  await expect(admin.getByText('ESI 1 emergency arrival')).toBeVisible();
  await expect(admin.getByText(`${f.traumaPatient.name}: Cardiac arrest`)).toBeVisible();
  await admin.context().close();

  const kase = rows.filter({ hasText: f.traumaPatient.name });
  await kase.getByRole('button', { name: 'Start treatment' }).click();
  await expect(kase).toContainText('in treatment');
  await kase.getByRole('button', { name: 'Admit' }).click();
  await kase.getByLabel('Bed').selectOption({ label: 'E2E Ward / E2E-ER' });
  await kase.getByRole('button', { name: 'Confirm admit' }).click();
  await expect(kase).toHaveCount(0); // admitted cases leave the active board

  await page.goto('/doctor/beds');
  await page.getByLabel('Ward filter').selectOption({ label: 'E2E Ward' });
  const bed = page.getByTestId(/^bed-\d+$/).filter({ hasText: 'E2E-ER' });
  await expect(bed).toContainText('occupied');
  await expect(bed).toContainText(f.traumaPatient.name);
});
