import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCheck,
  Clock,
  UserPlus,
  ExternalLink,
  AlertCircle,
  BellOff,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { api } from '../services/api';
import { AppNotification } from '../types/api.types';
import { formatRelativeTime } from '../utils/formatTime';

export const NotificationsPage: React.FC = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filterUnreadOnly, setFilterUnreadOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isMarkingAll, setIsMarkingAll] = useState<boolean>(false);

  const fetchNotifications = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const res = await api.notifications.list({
        page,
        limit: 15,
        unreadOnly: filterUnreadOnly ? true : undefined,
      });
      setNotifications(res.notifications);
      setTotalPages(res.meta.totalPages || 1);
      setTotalCount(res.meta.total);
      setUnreadCount(res.meta.unreadCount);
    } catch (err) {
      console.error('Failed to fetch notifications page:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page, filterUnreadOnly]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkRead = async (n: AppNotification): Promise<void> => {
    if (n.read) return;

    setNotifications((prev) =>
      prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    try {
      await api.notifications.markRead(n.id);
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async (): Promise<void> => {
    if (unreadCount === 0 || isMarkingAll) return;

    setIsMarkingAll(true);
    try {
      await api.notifications.markAllRead();
      setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnreadCount(0);
      if (filterUnreadOnly) {
        void fetchNotifications();
      }
    } catch (err) {
      console.error('Failed to mark all read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'FOLLOWUP_OVERDUE':
        return <Clock className="w-5 h-5 text-rose-600 shrink-0" />;
      case 'ENQUIRY_ASSIGNED':
        return <UserPlus className="w-5 h-5 text-brand-600 shrink-0" />;
      default:
        return <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'FOLLOWUP_OVERDUE':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 text-rose-700 border border-rose-200">
            Follow-up Overdue
          </span>
        );
      case 'ENQUIRY_ASSIGNED':
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-brand-50 text-brand-700 border border-brand-200">
            Enquiry Assigned
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Notifications</h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-xs font-extrabold bg-rose-100 text-rose-700 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Stay updated with real-time customer assignments and overdue follow-up alerts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchNotifications()}
            disabled={isLoading}
            className="p-2 text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={isMarkingAll}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isMarkingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCheck className="w-4 h-4" />
              )}
              <span>Mark all as read</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setFilterUnreadOnly(false);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer ${
              !filterUnreadOnly
                ? 'bg-brand-50 text-brand-700 font-bold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            All Notifications
          </button>
          <button
            type="button"
            onClick={() => {
              setFilterUnreadOnly(true);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
              filterUnreadOnly
                ? 'bg-brand-50 text-brand-700 font-bold'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <span>Unread Only</span>
            {unreadCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-rose-600" />
            )}
          </button>
        </div>

        <div className="text-xs text-slate-400 font-medium px-2">
          Showing {notifications.length} of {totalCount}
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
            <span>Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <BellOff className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">No notifications found</p>
            <p className="text-xs text-slate-400">
              {filterUnreadOnly
                ? 'You have no unread notifications.'
                : 'You have not received any notifications yet.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  !n.read ? 'bg-brand-50/20 hover:bg-brand-50/40' : 'bg-white hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 shrink-0">
                    {getNotificationIcon(n.type)}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {getTypeBadge(n.type)}
                      {!n.read && (
                        <span className="inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-black bg-brand-100 text-brand-700">
                          NEW
                        </span>
                      )}
                      <span className="text-[11px] text-slate-400">
                        {formatRelativeTime(n.createdAt)} •{' '}
                        {new Date(n.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p
                      className={`text-xs ${
                        !n.read ? 'font-bold text-slate-900' : 'font-normal text-slate-700'
                      }`}
                    >
                      {n.message}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(n)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      Mark read
                    </button>
                  )}

                  {n.relatedEnquiryId && (
                    <Link
                      to={`/enquiries/${n.relatedEnquiryId}`}
                      onClick={() => void handleMarkRead(n)}
                      className="px-3 py-1 text-xs font-semibold text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Enquiry</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Page {page} of {totalPages}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                className="p-1.5 text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                className="p-1.5 text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
