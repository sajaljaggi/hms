import { test, expect } from '@playwright/test';
import { fx, login, loginInNewContext } from './helpers';

test('patient pays from history via the mock flow and the admin sees the payment', async ({ page, browser }) => {
  const f = fx();
  await login(page, 'patient');
  await page.goto('/patient/history');

  const card = page.getByRole('article', { name: /Cardiology with Dr\. Sarah Johnson/ });
  await expect(card.getByText('Unpaid', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: /^Pay ₹/ }).click();

  const dialog = page.getByRole('dialog', { name: 'Test payment' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm payment' }).click();
  await expect(page.getByRole('status')).toHaveText('Test payment successful.');
  await expect(card.getByText('Paid', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: /^Pay ₹/ })).toHaveCount(0);

  const admin = await loginInNewContext(browser, 'admin');
  await admin.goto('/admin/payments');
  const row = admin.getByRole('row', { name: new RegExp(`${f.patient.name}.*Dr\\. Sarah Johnson`) });
  await expect(row).toContainText('₹1500.00');
  await expect(row).toContainText('paid');
  await admin.context().close();
});
