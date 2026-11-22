import { test, expect } from '@playwright/test';
import { fx, login } from './helpers';

test('patient books a video appointment for tomorrow and gets an "Appointment booked" notification', async ({ page }) => {
  const f = fx();
  await login(page, 'patient');
  await page.goto('/patient/book');

  await page.getByRole('button', { name: /Dermatology/ }).click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayLabel = tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  await page.getByRole('button', { name: dayLabel }).click();
  await page.getByText(f.doctor.name, { exact: true }).click();
  await page.getByRole('button', { name: /^9:00 AM/ }).click();
  await page.getByRole('group', { name: 'Consultation type' }).getByRole('button', { name: 'Video' }).click();
  await page.getByRole('button', { name: 'Confirm Booking' }).click();
  await expect(page.getByRole('heading', { name: 'Appointment Confirmed!' })).toBeVisible();

  // The bell polls every 30 s; a reload remounts it and fetches immediately.
  await page.reload();
  const bell = page.getByRole('button', { name: 'Notifications' });
  await expect(bell.getByTestId('unread-badge')).toHaveText(/^([1-9]|9\+)$/);
  await bell.click();
  await expect(page.getByText('Appointment booked', { exact: true })).toBeVisible();
  await expect(page.getByText(/Your video appointment on .* was booked\./)).toBeVisible();
});
