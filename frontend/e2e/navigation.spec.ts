import { test, expect } from '@playwright/test';

test('public visitor routes Main Entrance to Neurology, and the accessible route avoids stairs', async ({ page }) => {
  await page.goto('/navigate');
  await page.getByLabel('From', { exact: true }).selectOption({ label: 'Main Entrance' });
  await page.getByLabel('To', { exact: true }).selectOption({ label: 'Neurology' });
  await page.getByRole('button', { name: 'Find route' }).click();

  const steps = page.getByRole('listitem');
  await expect(steps.last()).toContainText('Neurology');
  await expect(steps.filter({ hasText: /stairs/i }).first()).toBeVisible();

  await page.getByLabel('Accessible route (avoid stairs)').check();
  await page.getByRole('button', { name: 'Find route' }).click();
  await expect(steps.filter({ hasText: /lift/i }).first()).toBeVisible();
  await expect(steps.last()).toContainText('Neurology');
  await expect(steps.filter({ hasText: /stair/i })).toHaveCount(0);
});
