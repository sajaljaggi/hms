import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { notificationService } from '../services/notificationService';
import type { AppNotification } from '../types/modules';

const POLL_MS = 30_000;

const NotificationBell = () => {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      const res = await notificationService.list({ limit: 10 });
      setItems(res.data.data);
      setUnread(res.data.unreadCount);
    } catch {
      // Background poll: keep the last known state and try again next tick.
    }
  }, []);

  // One stable interval. Hidden tabs skip the tick and catch up when they become visible again.
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (!open) refresh();
    setOpen((o) => !o);
  };

  const handleItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: 1 } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await notificationService.markRead(n.id);
      } catch {
        refresh(); // revert the optimistic update
      }
    }
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = async () => {
    try {
      await notificationService.markAllRead();
    } catch {
      // Failure is visible on refresh (badge stays); avoid an unhandled rejection.
    } finally {
      refresh();
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-label="Notifications"
        aria-expanded={open}
        aria-haspopup="true"
        className="relative p-2 rounded-full text-gray-600 hover:bg-gray-100 hover:text-teal-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unread === 0}
              className="text-xs font-medium text-teal-700 hover:underline disabled:text-gray-400 disabled:no-underline"
            >
              Mark all read
            </button>
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y divide-gray-100">
            {items.length === 0 && <li className="px-4 py-6 text-sm text-center text-gray-500">No notifications</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => handleItem(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-none focus-visible:bg-teal-50 ${n.is_read ? '' : 'bg-teal-50/60'}`}
                >
                  <p className={`text-sm text-gray-900 ${n.is_read ? '' : 'font-semibold'}`}>{n.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
