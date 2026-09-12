import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  Clock,
  UserPlus,
  ExternalLink,
  AlertCircle,
  BellOff,
  Loader2,
} from 'lucide-react';
import { api } from '../services/api';
import { AppNotification } from '../types/api.types';
import { formatRelativeTime } from '../utils/formatTime';

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch recent notifications (returns latest 10 + total unread count)
  const fetchNotifications = useCallback(async (isPolling = false): Promise<void> => {
    if (!isPolling) setIsLoading(true);
    try {
      const res = await api.notifications.list({ limit: 10 });
      setNotifications(res.notifications);
      setUnreadCount(res.meta.unreadCount);
      setTotalCount(res.meta.total);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      if (!isPolling) setIsLoading(false);
    }
  }, []);

  // Initial load and 60-second polling interval
  useEffect(() => {
    void fetchNotifications();

    const intervalId = setInterval(() => {
      void fetchNotifications(true);
    }, 60000);

    return () => clearInterval(intervalId);
  }, [fetchNotifications]);

  // Click outside and Escape key dismiss
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Mark single notification as read & navigate if enquiry linked
  const handleNotificationClick = async (n: AppNotification): Promise<void> => {
    // If unread, mark read in background & update local state
    if (!n.read) {
      setNotifications((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        await api.notifications.markRead(n.id);
      } catch (err) {
        console.error('Failed to mark notification as read:', err);
      }
    }

    setIsOpen(false);

    if (n.relatedEnquiryId) {
      navigate(`/enquiries/${n.relatedEnquiryId}`);
    }
  };

  // Mark all notifications as read
  const handleMarkAllRead = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (unreadCount === 0 || isMarkingAll) return;

    setIsMarkingAll(true);
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Helper icon based on notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'FOLLOWUP_OVERDUE':
        return <Clock className="w-4 h-4 text-rose-600 shrink-0" />;
      case 'ENQUIRY_ASSIGNED':
        return <UserPlus className="w-4 h-4 text-brand-600 shrink-0" />;
      default:
        return <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setIsOpen((prev) => !prev);
          if (!isOpen) {
            void fetchNotifications(true);
          }
        }}
        title="Notifications"
        className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-black text-white bg-rose-600 rounded-full ring-2 ring-white shadow-xs animate-in zoom-in-50 duration-200">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in-50 slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="px-4 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Notifications
              </h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-extrabold bg-rose-100 text-rose-700 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={(e) => void handleMarkAllRead(e)}
                disabled={isMarkingAll}
                className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
              >
                {isMarkingAll ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5" />
                )}
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {isLoading && notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
                <span>Loading notifications...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-slate-400">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <BellOff className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-600">No notifications yet</p>
                <p className="text-[11px] text-slate-400">You're all caught up!</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => void handleNotificationClick(n)}
                  className={`p-3.5 flex items-start gap-3 hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                    !n.read ? 'bg-brand-50/30' : 'bg-white'
                  }`}
                >
                  <div className="mt-0.5">{getNotificationIcon(n.type)}</div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs leading-snug break-words ${
                        !n.read ? 'font-bold text-slate-900' : 'font-normal text-slate-700'
                      }`}
                    >
                      {n.message}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[10px] text-slate-400 font-medium">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                      {n.relatedEnquiryId && (
                        <span className="text-[10px] font-semibold text-brand-600 group-hover:underline flex items-center gap-0.5">
                          View enquiry <ExternalLink className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>
                  </div>

                  {!n.read && (
                    <span
                      className="w-2 h-2 rounded-full bg-brand-600 shrink-0 mt-1.5"
                      title="Unread"
                    />
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer: View all link */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
            <Link
              to="/notifications"
              onClick={() => setIsOpen(false)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors inline-flex items-center gap-1"
            >
              <span>View all notifications</span>
              {totalCount > 0 && <span className="text-slate-400">({totalCount})</span>}
              <span>→</span>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
