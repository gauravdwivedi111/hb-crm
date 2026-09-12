import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { UserPerformanceMetrics, User } from '../types/api.types';
import {
  BarChart3,
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

const getDefaultDates = (): { start: string; end: string } => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const start = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const end = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
};

const formatDuration = (hours: number | null | undefined): string => {
  if (hours == null || isNaN(hours) || hours <= 0) {
    return '—';
  }
  if (hours >= 48) {
    const days = (hours / 24).toFixed(1);
    return `${days} days`;
  }
  return `${hours.toFixed(1)} hrs`;
};

export const PerformanceReportsPage: React.FC = () => {
  const defaultDates = getDefaultDates();
  const [startDate, setStartDate] = useState<string>(defaultDates.start);
  const [endDate, setEndDate] = useState<string>(defaultDates.end);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [subordinates, setSubordinates] = useState<User[]>([]);

  const [metrics, setMetrics] = useState<UserPerformanceMetrics[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load subordinates for dropdown
  useEffect(() => {
    void api.dashboard
      .getTeamDashboard()
      .then((res) => {
        setSubordinates(res.map((r) => r.user));
      })
      .catch((err) => console.error('Failed to load subordinate users:', err));
  }, []);

  // Fetch report data
  const fetchReport = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.reports.getPerformance({
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate + 'T23:59:59.999Z').toISOString() : undefined,
        userId: selectedUserId || undefined,
      });
      setMetrics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate performance report.');
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, selectedUserId]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  // Aggregate stats across all shown employees
  const totalAssigned = metrics.reduce((acc, m) => acc + m.enquiriesAssigned, 0);
  const totalContacted = metrics.reduce((acc, m) => acc + m.contacted, 0);
  const totalCompletedFollowups = metrics.reduce((acc, m) => acc + m.followupsCompleted, 0);
  const totalMissedFollowups = metrics.reduce((acc, m) => acc + m.followupsMissed, 0);
  const totalQuotations = metrics.reduce((acc, m) => acc + m.quotationsSent, 0);
  const totalConverted = metrics.reduce((acc, m) => acc + m.converted, 0);
  const totalLost = metrics.reduce((acc, m) => acc + m.lost, 0);

  const overallConversionRate =
    totalAssigned > 0 ? Number(((totalConverted / totalAssigned) * 100).toFixed(1)) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Performance Reports
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Conversion analytics, follow-up diligence, and turnaround times for your team.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchReport()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-xs transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
          {/* Start Date */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>Start Date</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              <span>End Date</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Subordinate Filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              <span>Employee Filter</span>
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All Team Members</option>
              {subordinates.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.role})
                </option>
              ))}
            </select>
          </div>

          {/* Reset button */}
          <div>
            <button
              type="button"
              onClick={() => {
                const dates = getDefaultDates();
                setStartDate(dates.start);
                setEndDate(dates.end);
                setSelectedUserId('');
              }}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Reset to Current Month
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => void fetchReport()}
            className="font-semibold underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Assigned
          </span>
          <p className="text-xl font-black text-slate-900 mt-1">{totalAssigned}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Contacted
          </span>
          <p className="text-xl font-black text-slate-900 mt-1">{totalContacted}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Followups Done
          </span>
          <p className="text-xl font-black text-emerald-700 mt-1">{totalCompletedFollowups}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Followups Missed
          </span>
          <p className="text-xl font-black text-rose-700 mt-1">{totalMissedFollowups}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Quotes Sent
          </span>
          <p className="text-xl font-black text-purple-700 mt-1">{totalQuotations}</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Converted / Lost
          </span>
          <p className="text-xl font-black text-slate-900 mt-1">
            <span className="text-emerald-600">{totalConverted}</span>
            <span className="text-slate-300 font-normal mx-1">/</span>
            <span className="text-rose-600">{totalLost}</span>
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Conversion Rate
          </span>
          <p className="text-xl font-black text-brand-700 mt-1">{overallConversionRate}%</p>
        </div>
      </div>

      {/* Main Performance Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Team Performance Breakdown</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Metrics calculated for period {startDate} to {endDate}
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            {metrics.length} Employees
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : metrics.length === 0 ? (
          <div className="py-12 text-center">
            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">No Report Data</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No performance activity was recorded for the selected employees and date range.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Employee</th>
                  <th className="py-3.5 px-3 text-center">Assigned</th>
                  <th className="py-3.5 px-3 text-center">Contacted</th>
                  <th className="py-3.5 px-3 text-center">Followups Completed</th>
                  <th className="py-3.5 px-3 text-center">Followups Missed</th>
                  <th className="py-3.5 px-3 text-center">Quotes Sent</th>
                  <th className="py-3.5 px-3 text-center">Converted</th>
                  <th className="py-3.5 px-3 text-center">Lost</th>
                  <th className="py-3.5 px-3 text-center">Conversion %</th>
                  <th className="py-3.5 px-3 text-center">Avg First Contact</th>
                  <th className="py-3.5 px-3 text-center">Avg Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {metrics.map((m) => {
                  const hasZeroEnquiries = m.enquiriesAssigned === 0;

                  return (
                    <tr key={m.user.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Name & Role */}
                      <td className="py-3.5 px-4 font-semibold text-slate-900">
                        <div>
                          <Link
                            to={`/team/${m.user.id}`}
                            className="text-slate-900 hover:text-brand-600 font-bold hover:underline transition-colors"
                          >
                            {m.user.name}
                          </Link>
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {m.user.role}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono block">
                          {m.user.email}
                        </span>
                      </td>

                      {/* Assigned */}
                      <td className="py-3.5 px-3 text-center font-bold text-slate-900">
                        {m.enquiriesAssigned}
                      </td>

                      {/* Contacted */}
                      <td className="py-3.5 px-3 text-center font-semibold text-slate-700">
                        {m.contacted}
                      </td>

                      {/* Followups Completed */}
                      <td className="py-3.5 px-3 text-center font-semibold text-emerald-700">
                        {m.followupsCompleted}
                      </td>

                      {/* Followups Missed */}
                      <td className="py-3.5 px-3 text-center font-semibold text-rose-700">
                        {m.followupsMissed > 0 ? (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-600">
                            {m.followupsMissed}
                          </span>
                        ) : (
                          '0'
                        )}
                      </td>

                      {/* Quotations Sent */}
                      <td className="py-3.5 px-3 text-center font-semibold text-purple-700">
                        {m.quotationsSent}
                      </td>

                      {/* Converted */}
                      <td className="py-3.5 px-3 text-center font-bold text-emerald-700">
                        {m.converted}
                      </td>

                      {/* Lost */}
                      <td className="py-3.5 px-3 text-center font-medium text-slate-500">
                        {m.lost}
                      </td>

                      {/* Conversion Rate */}
                      <td className="py-3.5 px-3 text-center">
                        {hasZeroEnquiries ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span
                            className={`font-bold px-2 py-0.5 rounded-full text-[11px] ${
                              m.conversionRate >= 40
                                ? 'bg-emerald-50 text-emerald-700'
                                : m.conversionRate >= 20
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {m.conversionRate}%
                          </span>
                        )}
                      </td>

                      {/* Avg Time to First Contact */}
                      <td className="py-3.5 px-3 text-center font-mono text-slate-600">
                        {hasZeroEnquiries ? '—' : formatDuration(m.avgTimeToFirstContactHours)}
                      </td>

                      {/* Avg Time to Conversion */}
                      <td className="py-3.5 px-3 text-center font-mono text-slate-600">
                        {hasZeroEnquiries ? '—' : formatDuration(m.avgTimeToConversionHours)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PerformanceReportsPage;
