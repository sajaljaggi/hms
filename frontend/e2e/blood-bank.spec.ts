import { test, expect } from '@playwright/test';
import { fx, login, pickPatient } from './helpers';

test('admin adds a donor, records a donation, then fulfills a request from that stock', async ({ page }) => {
  const f = fx();
  const donor = `E2E Donor ${Date.now()}`;
  await login(page, 'admin');
  await page.goto('/admin/blood');

  const cell = page.getByTestId('inv-AB--whole_blood');
  await expect(cell).toHaveText(/^\d+/);
  const before = parseInt((await cell.textContent()) ?? '0', 10);

  await page.getByRole('tab', { name: 'donors' }).click();
  await page.getByRole('button', { name: 'Add donor' }).click();
  const donorForm = page.getByRole('form', { name: 'Add donor' });
  await donorForm.getByLabel('Name').fill(donor);
  await donorForm.getByLabel('Blood group').selectOption('AB-');
  await donorForm.getByLabel('Phone').fill('9876500000');
  await donorForm.getByRole('button', { name: 'Save donor' }).click();
  await expect(donorForm).toBeHidden();

  await page.getByRole('row', { name: new RegExp(donor) }).getByRole('button', { name: 'Record donation' }).click();
  const donation = page.getByRole('form', { name: 'Record donation' });
  await expect(donation.getByLabel('Component')).toHaveValue('whole_blood');
  await donation.getByRole('button', { name: 'Save donation' }).click();
  await expect(page.getByRole('status')).toContainText('Donation recorded');

  await page.getByRole('tab', { name: 'inventory' }).click();
  await expect(cell).toHaveText(new RegExp(`^${before + 1}`));

  await page.getByRole('tab', { name: 'requests' }).click();
  await page.getByRole('button', { name: 'New request' }).click();
  const request = page.getByRole('form', { name: 'New blood request' });
  await pickPatient(request, 'Patient', f.patient.name);
  await request.getByLabel('Blood group').selectOption('AB-');
  await request.getByLabel('Component').selectOption('whole_blood');
  await request.getByLabel('Units').fill('1');
  await request.getByRole('button', { name: 'Submit request' }).click();
  await expect(request).toBeHidden();

  const item = page.getByRole('listitem').filter({ hasText: `${f.patient.name}: 1 x AB- whole blood` });
  await expect(item).toContainText('pending');
  page.once('dialog', (d) => d.accept());
  await item.getByRole('button', { name: 'Fulfill' }).click();
  await expect(item).toContainText('fulfilled');
  await expect(item.getByRole('button', { name: 'Fulfill' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'inventory' }).click();
  await expect(cell).toHaveText(new RegExp(`^${before}`));
});
