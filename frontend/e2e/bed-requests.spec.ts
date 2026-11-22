import { test, expect } from '@playwright/test';
import { fx, login, loginInNewContext, pickPatient } from './helpers';

test('doctor requests a bed, admin assigns it, doctor requests the discharge, admin discharges and frees the bed', async ({ page, browser }) => {
  const f = fx();
  await login(page, 'doctor');
  await page.goto('/doctor/beds');
  await expect(page.getByRole('button', { name: 'Allocate' })).toHaveCount(0); // doctors cannot assign beds

  await page.getByRole('tab', { name: 'requests' }).click();
  await page.getByRole('button', { name: 'Request a bed' }).click();
  const form = page.getByRole('form', { name: 'New bed request' });
  await pickPatient(form, 'Patient', f.patient.name);
  await form.getByLabel('Urgency').selectOption('urgent');
  await form.getByLabel('Reason').fill('Observation after fall');
  await form.getByRole('button', { name: 'Send request' }).click();
  const mine = page.getByTestId(/^bed-request-\d+$/).filter({ hasText: f.patient.name });
  await expect(mine).toContainText('pending');

  // Admin assigns a bed.
  const admin = await loginInNewContext(browser, 'admin');
  await admin.goto('/admin/beds');
  await admin.getByRole('tab', { name: 'requests' }).click();
  const req = admin.getByTestId(/^bed-request-\d+$/).filter({ hasText: f.patient.name }).filter({ hasText: 'pending' });
  await expect(req).toContainText(`By ${f.doctor.name}`);
  await req.getByLabel(`Bed for ${f.patient.name}`).selectOption({ label: 'E2E Ward / E2E-01' });
  await req.getByRole('button', { name: 'Assign bed' }).click();
  await expect(admin.getByTestId(/^bed-request-\d+$/).filter({ hasText: 'E2E-01' })).toContainText('fulfilled');

  // The doctor sees the bed and asks for the discharge.
  await page.reload();
  await expect(page.getByRole('tab', { name: 'my patients' })).toHaveAttribute('aria-selected', 'true');
  const card = page.getByRole('listitem').filter({ hasText: f.patient.name });
  await expect(card).toContainText('E2E Ward / E2E-01');
  page.once('dialog', (d) => d.accept('Recovered'));
  await card.getByRole('button', { name: 'Request discharge' }).click();
  await expect(card.getByText('Discharge requested')).toBeVisible();

  // Admin discharges, which frees the bed.
  await admin.reload();
  await admin.getByRole('tab', { name: 'requests' }).click();
  const discharge = admin.getByTestId(/^bed-request-\d+$/).filter({ hasText: 'Discharge' }).filter({ hasText: 'pending' });
  admin.once('dialog', (d) => d.accept());
  await discharge.getByRole('button', { name: 'Discharge & free bed' }).click();
  await expect(admin.getByTestId(/^bed-request-\d+$/).filter({ hasText: 'Discharge' }).first()).toContainText('fulfilled');
  await admin.getByRole('tab', { name: 'beds' }).click();
  await admin.getByLabel('Ward filter').selectOption({ label: 'E2E Ward' });
  await expect(admin.getByTestId(/^bed-\d+$/).filter({ hasText: 'E2E-01' })).toContainText('available');
  await admin.context().close();

  await page.reload();
  await expect(page.getByText(/None of your patients are admitted/)).toBeVisible();
});
