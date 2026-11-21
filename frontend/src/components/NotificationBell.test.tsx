import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { notificationService } from '../services/notificationService';
import type { AppNotification } from '../types/modules';

vi.mock('../services/notificationService', () => ({
  notificationService: { list: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}));

const svc = vi.mocked(notificationService);

const note = (id: number, over: Partial<AppNotification> = {}): AppNotification => ({
  id, type: 'system', title: `Title ${id}`, message: `Message ${id}`, link: null, is_read: 0,
  created_at: new Date().toISOString(), ...over,
});

const listResponse = (data: AppNotification[], unreadCount: number) =>
  ({ data: { success: true, data, unreadCount } }) as Awaited<ReturnType<typeof notificationService.list>>;

const renderBell = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<NotificationBell />} />
        <Route path="/admin/emergency" element={<div>Emergency page</div>} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.resetAllMocks();
  svc.markRead.mockResolvedValue({ data: { success: true } } as never);
  svc.markAllRead.mockResolvedValue({ data: { success: true, updated: 1 } } as never);
});

describe('NotificationBell', () => {
  it('shows the unread count from the service', async () => {
    svc.list.mockResolvedValue(listResponse([note(1)], 3));
    renderBell();
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('3');
    expect(svc.list).toHaveBeenCalledWith({ limit: 10 });
  });

  it('caps the badge at 9+', async () => {
    svc.list.mockResolvedValue(listResponse([note(1)], 25));
    renderBell();
    expect(await screen.findByTestId('unread-badge')).toHaveTextContent('9+');
  });

  it('marks read and navigates when an item is clicked', async () => {
    svc.list.mockResolvedValue(listResponse([note(7, { link: '/admin/emergency' })], 1));
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    await userEvent.click(await screen.findByText('Title 7'));
    expect(svc.markRead).toHaveBeenCalledWith(7);
    expect(await screen.findByText('Emergency page')).toBeInTheDocument();
  });

  it('marks all read and refreshes', async () => {
    // mount fetch + fetch-on-open both see unread items
    svc.list.mockResolvedValueOnce(listResponse([note(1), note(2)], 2));
    svc.list.mockResolvedValueOnce(listResponse([note(1), note(2)], 2));
    svc.list.mockResolvedValue(listResponse([note(1, { is_read: 1 }), note(2, { is_read: 1 })], 0));
    renderBell();
    await userEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
    await userEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(svc.markAllRead).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument());
  });

  it('closes on Escape and exposes aria-expanded', async () => {
    svc.list.mockResolvedValue(listResponse([note(1)], 1));
    renderBell();
    const btn = await screen.findByRole('button', { name: 'Notifications' });
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});
