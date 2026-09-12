import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { DashboardMeData, EnquiryStatus, Role, Followup } from '../types/api.types';
import { useAuth } from '../context/AuthContext';
import {
  Calendar,
  AlertTriangle,
  FileText,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Clock,
  Building,
  Users,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

const MANAGER_ROLES: Role[] = ['ADMIN', 'DGM', 'AGM', 'MANAGER'];

const ALL_ENQUIRY_STATUSES: { status: EnquiryStatus; label: string; bg: string; text: string; border: string; barColor: string }[] = [
  { status: 'NEW', label: 'New', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', barColor: 'bg-blue-500' },
  { status: 'ASSIGNED', label: 'Assigned', bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', barColor: 'bg-sky-500' },
  { status: 'CONTACTED', label: 'Contacted', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200', barColor: 'bg-indigo-500' },
  { status: 'FOLLOW_UP_REQUIRED', label: 'Follow-up Req.', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', barColor: 'bg-amber-500' },
  { status: 'QUOTATION_SENT', label: 'Quotation Sent', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', barColor: 'bg-purple-500' },
  { status: 'NEGOTIATION', label: 'Negotiation', bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', barColor: 'bg-orange-500' },
  { status: 'CONVERTED', label: 'Converted', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', barColor: 'bg-emerald-500' },
  { status: 'LOST', label: 'Lost', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', barColor: 'bg-rose-500' },
  { status: 'ON_HOLD', label: 'On Hold', bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', barColor: 'bg-slate-400' },
];

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (isNaN(diffInSeconds) || diffInSeconds < 0) return 'Just now';
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardMeData | null>(null);
  const [activeFollowups, setActiveFollowups] = useState<Followup[]>([]);
  const [completingFollowupId, setCompletingFollowupId] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isManagerPlus = Boolean(user && MANAGER_ROLES.includes(user.role));

  const fetchDashboard = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const [result, followupsRes] = await Promise.all([
        api.dashboard.getMyDashboard(),
        api.followups.list({ limit: 10 }),
      ]);
      setData(result);
      setActiveFollowups(followupsRes.followups.filter((f) => f.status !== 'COMPLETED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load your dashboard data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleCompleteFollowup = async (followupId: string): Promise<void> => {
    setCompletingFollowupId(followupId);
    try {
      const res = await api.followups.complete(followupId);
      if (res.nextFollowup) {
        const nextDate = new Date(res.nextFollowup.dueAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        setActionSuccess(`Completed — next follow-up set for ${nextDate}`);
      } else {
        setActionSuccess('Follow-up marked as completed');
      }
      await fetchDashboard();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete follow-up');
    } finally {
      setCompletingFollowupId(null);
    }
  };

  useEffect(() => {
    void fetchDashboard();
  }, [fetchDashboard]);

  // Loading Skeleton State
  if (isLoading) {
    return (
      <div className="space-y-8 animate-pulse">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-7 w-48 bg-slate-200 rounded-lg" />
            <div className="h-4 w-72 bg-slate-200 rounded-lg" />
          </div>
          <div className="h-9 w-28 bg-slate-200 rounded-xl" />
        </div>

        {/* 5 Top Metric Cards Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 bg-white p-5 rounded-2xl border border-slate-200 flex flex-col justify-between">
              <div className="h-4 w-24 bg-slate-200 rounded" />
              <div className="h-8 w-16 bg-slate-200 rounded" />
              <div className="h-3 w-32 bg-slate-100 rounded" />
            </div>
          ))}
        </div>

        {/* Pipeline Skeleton */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
          <div className="h-5 w-48 bg-slate-200 rounded" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>

        {/* Recent Customers Skeleton */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
          <div className="h-5 w-56 bg-slate-200 rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error State with Retry Button
  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto mt-12 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Failed to Load Dashboard</h2>
        <p className="text-sm text-slate-600 mb-6">{error || 'An unexpected error occurred while fetching your data.'}</p>
        <button
          onClick={() => void fetchDashboard()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm transition-all cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  const totalEnquiries = ALL_ENQUIRY_STATUSES.reduce(
    (acc, item) => acc + (data.countsByStatus[item.status] || 0),
    0,
  );

  return (
    <div className="space-y-8">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Personal Dashboard</h1>
            {isManagerPlus && (
              <Link
                to="/team"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-semibold transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                <span>View Team Dashboard</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Pipeline, scheduled follow-ups, and customer touchpoints for {user?.name}.
          </p>
        </div>

        <button
          onClick={() => void fetchDashboard()}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm self-start sm:self-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs font-semibold text-emerald-800 animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-500 hover:text-emerald-700 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 5 Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Due Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Due Today</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-slate-900">{data.followups.dueToday}</span>
            <span className="text-xs font-medium text-slate-400 ml-1.5">follow-ups</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-500" />
            Due before midnight
          </p>
        </div>

        {/* 2. Overdue Follow-ups (visually distinct / bold red alert when > 0) */}
        <div
          className={`p-5 rounded-2xl border shadow-sm flex flex-col justify-between transition-all ${
            data.followups.overdue > 0
              ? 'bg-red-50/80 border-red-300 ring-2 ring-red-500/20'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${
                data.followups.overdue > 0 ? 'text-red-700' : 'text-slate-500'
              }`}
            >
              Overdue
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                data.followups.overdue > 0 ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-100 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`text-3xl font-bold ${
                data.followups.overdue > 0 ? 'text-red-700' : 'text-slate-900'
              }`}
            >
              {data.followups.overdue}
            </span>
            <span
              className={`text-xs font-medium ml-1.5 ${
                data.followups.overdue > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'
              }`}
            >
              past due
            </span>
          </div>
          <p
            className={`text-[11px] mt-2 font-medium ${
              data.followups.overdue > 0 ? 'text-red-600' : 'text-slate-400'
            }`}
          >
            {data.followups.overdue > 0 ? 'Action required immediately' : 'All follow-ups on track'}
          </p>
        </div>

        {/* 3. Quotations Pending Response */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Quotes</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-slate-900">{data.quotationsPendingResponse}</span>
            <span className="text-xs font-medium text-slate-400 ml-1.5">proposals</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Sent or viewed by client</p>
        </div>

        {/* 4. Converted This Month */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Converted (Month)</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-emerald-600">{data.performanceThisMonth.converted}</span>
            <span className="text-xs font-medium text-slate-400 ml-1.5">deals won</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Current calendar month</p>
        </div>

        {/* 5. Lost This Month */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lost (Month)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold text-rose-600">{data.performanceThisMonth.lost}</span>
            <span className="text-xs font-medium text-slate-400 ml-1.5">closed lost</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Current calendar month</p>
        </div>
      </div>

      {/* Pipeline Breakdown: All 9 Statuses */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Enquiry Pipeline Distribution</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live status counts across all {totalEnquiries} active & archived enquiries in your scope.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">
            Total: {totalEnquiries}
          </span>
        </div>

        {/* Distribution Progress Bar */}
        {totalEnquiries > 0 && (
          <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            {ALL_ENQUIRY_STATUSES.map((item) => {
              const count = data.countsByStatus[item.status] || 0;
              if (count === 0) return null;
              const pct = (count / totalEnquiries) * 100;
              return (
                <div
                  key={item.status}
                  style={{ width: `${pct}%` }}
                  title={`${item.label}: ${count} (${pct.toFixed(1)}%)`}
                  className={`${item.barColor} transition-all duration-300`}
                />
              );
            })}
          </div>
        )}

        {/* 9 Status Cards (Never hide zero counts) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
          {ALL_ENQUIRY_STATUSES.map((item) => {
            const count = data.countsByStatus[item.status] || 0;
            return (
              <div
                key={item.status}
                className={`p-3 rounded-xl border ${item.border} ${item.bg} flex flex-col justify-between transition-all`}
              >
                <span className={`text-[11px] font-semibold leading-tight ${item.text}`}>{item.label}</span>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className={`text-xl font-bold ${item.text}`}>{count}</span>
                  {totalEnquiries > 0 && (
                    <span className="text-[10px] text-slate-400 font-medium">
                      {Math.round((count / totalEnquiries) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Follow-ups & Reminders Card */}
      {activeFollowups.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-brand-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">Active Follow-up Tasks</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Scheduled client calls and pending follow-ups requiring your attention.
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
              {activeFollowups.length} pending
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {activeFollowups.map((f) => (
              <div
                key={f.id}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 rounded-xl px-2.5 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      f.status === 'OVERDUE'
                        ? 'bg-rose-50 text-rose-600 border border-rose-200'
                        : 'bg-blue-50 text-blue-600 border border-blue-200'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">
                        {f.customer?.name || f.enquiry?.companyName || 'Client Follow-up'}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          f.status === 'OVERDUE'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {f.status}
                      </span>
                    </div>
                    {f.purpose && <p className="text-xs text-slate-600 mt-0.5">{f.purpose}</p>}
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-400">
                      <span>
                        Due:{' '}
                        {new Date(f.dueAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      {f.enquiryId && (
                        <>
                          <span>•</span>
                          <Link
                            to={`/enquiries/${f.enquiryId}`}
                            className="text-brand-600 hover:underline font-semibold"
                          >
                            View Enquiry
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sm:text-right shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCompleteFollowup(f.id)}
                    disabled={completingFollowupId === f.id}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{completingFollowupId === f.id ? 'Completing...' : 'Mark Complete'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recently Contacted Customers */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recently Contacted Customers</h2>
            <p className="text-xs text-slate-500 mt-0.5">Most recent client interactions ordered by contact date.</p>
          </div>
          <span className="text-xs font-medium text-slate-400">
            {data.recentlyContactedCustomers.length} recorded
          </span>
        </div>

        {data.recentlyContactedCustomers.length === 0 ? (
          <div className="text-center py-10 rounded-xl bg-slate-50 border border-dashed border-slate-200">
            <Building className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">No customer contact interactions yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              When enquiries are marked contacted or follow-ups are completed, recent contacts will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.recentlyContactedCustomers.map((customer) => (
              <div
                key={`${customer.customerId}-${customer.lastContactedAt}`}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 rounded-xl px-2.5 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold text-xs shrink-0">
                    {customer.customerName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-slate-900 leading-tight">
                      {customer.customerName}
                    </h4>
                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                      {customer.companyName ? (
                        <span className="flex items-center gap-1 font-medium text-slate-600">
                          <Building className="w-3 h-3 text-slate-400" />
                          {customer.companyName}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Individual</span>
                      )}
                      {customer.product && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="text-slate-500">Interest: {customer.product}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="sm:text-right shrink-0">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatRelativeTime(customer.lastContactedAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
