import { test, expect } from '@playwright/test';
import { fx, login, pickPatient } from './helpers';

test('admin allocates a bed to a patient, then discharges it', async ({ page }) => {
  const f = fx();
  await login(page, 'admin');
  await page.goto('/admin/beds');
  await page.getByLabel('Ward filter').selectOption({ label: 'E2E Ward' });

  const bed = page.getByTestId(/^bed-\d+$/).filter({ hasText: 'E2E-01' });
  await expect(bed).toContainText('available');
  await bed.getByRole('button', { name: 'Allocate' }).click();

  const dialog = page.getByRole('dialog', { name: 'Allocate bed' });
  await pickPatient(dialog, 'Patient', f.patient.name);
  await dialog.getByLabel('Reason').fill('Observation');
  await dialog.getByRole('button', { name: 'Confirm allocation' }).click();
  await expect(dialog).toBeHidden();

  await expect(bed).toContainText('occupied');
  await expect(bed).toContainText(f.patient.name);

  page.once('dialog', (d) => d.accept());
  await bed.getByRole('button', { name: 'Discharge' }).click();
  await expect(bed).toContainText('available');
  await expect(bed).not.toContainText(f.patient.name);
  await expect(bed.getByRole('button', { name: 'Allocate' })).toBeVisible();
});
