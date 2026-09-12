import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { SubordinateMetrics } from '../types/api.types';
import {
  Users,
  AlertCircle,
  Clock,
  TrendingUp,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Briefcase,
  FileText,
} from 'lucide-react';

export const TeamDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [team, setTeam] = useState<SubordinateMetrics[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeam = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.dashboard.getTeamDashboard();
      setTeam(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team metrics.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTeam();
  }, [fetchTeam]);

  // Aggregate totals
  const totalTeamMembers = team.length;
  const totalAssignedAll = team.reduce((acc, m) => acc + m.assignedCount, 0);
  const totalOverdueAll = team.reduce((acc, m) => acc + (m.followups?.overdue || m.overdueCount || 0), 0);
  const totalConvertedThisMonth = team.reduce((acc, m) => acc + m.convertedThisMonth, 0);
  const totalAssignedThisMonth = team.reduce(
    (acc, m) =>
      acc +
      (m.countsByStatus
        ? Object.values(m.countsByStatus).reduce<number>((a, b) => a + Number(b || 0), 0)
        : m.assignedCount),
    0,
  );
  const teamConversionRate =
    totalAssignedThisMonth > 0
      ? Number(((totalConvertedThisMonth / totalAssignedThisMonth) * 100).toFixed(1))
      : 0;

  const getConversionColorClass = (rate: number): { bg: string; text: string; border: string; bar: string } => {
    if (rate >= 40) {
      return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500' };
    }
    if (rate >= 20) {
      return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500' };
    }
    return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bar: 'bg-rose-500' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-brand-50 border border-brand-200 text-brand-700">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Team Dashboard</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Workload distribution, pipeline velocity, and conversion performance for your team.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void fetchTeam()}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-xs transition-colors cursor-pointer disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => void fetchTeam()}
            className="font-semibold underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Team Members</span>
            <Users className="w-4 h-4 text-brand-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{totalTeamMembers}</p>
          <span className="text-[11px] text-slate-400 mt-1 block">Active subordinates</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Pipeline</span>
            <Briefcase className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{totalAssignedAll}</p>
          <span className="text-[11px] text-slate-400 mt-1 block">Assigned enquiries</span>
        </div>

        <div
          className={`rounded-2xl border p-5 shadow-xs transition-colors ${
            totalOverdueAll > 0
              ? 'bg-rose-50/70 border-rose-200 text-rose-900'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Overdue Follow-ups</span>
            <Clock className={`w-4 h-4 ${totalOverdueAll > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <p className={`text-2xl font-black ${totalOverdueAll > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
            {totalOverdueAll}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Requires immediate action</span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Avg Conversion</span>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{teamConversionRate}%</p>
          <span className="text-[11px] text-slate-400 mt-1 block">This month</span>
        </div>
      </div>

      {/* Subordinates Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Subordinate Workload Overview</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Click any team member to view their active enquiries.
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
            {team.length} Users
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : team.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800">No Team Members Found</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              There are no active subordinates assigned to your supervisory branch in the database.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Team Member</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Assigned Total</th>
                  <th className="py-3.5 px-4">Contacted</th>
                  <th className="py-3.5 px-4">Overdue Follow-ups</th>
                  <th className="py-3.5 px-4">Quotes Pending</th>
                  <th className="py-3.5 px-4">Conversion Rate (Mo)</th>
                  <th className="py-3.5 px-4 text-right">Drill Down</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {team.map((member) => {
                  const overdue = member.followups?.overdue || member.overdueCount || 0;
                  const convColor = getConversionColorClass(member.conversionRateThisMonth);
                  const initials = member.user.name
                    ? member.user.name
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'U';

                  return (
                    <tr
                      key={member.user.id}
                      onClick={() => navigate(`/team/${member.user.id}`)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      {/* Name & Avatar */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-extrabold text-sm shrink-0 shadow-xs">
                            {initials}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 group-hover:text-brand-600 transition-colors text-sm underline decoration-transparent group-hover:decoration-brand-300 underline-offset-2">
                              {member.user.name}
                            </p>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {member.user.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-700">
                          {member.user.role === 'ADMIN' ? (
                            <ShieldCheck className="w-3 h-3 text-brand-600" />
                          ) : (
                            <UserCheck className="w-3 h-3 text-slate-500" />
                          )}
                          {member.user.role}
                        </span>
                      </td>

                      {/* Assigned Total & Month */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {member.assignedCount}
                          </span>
                          <div className="text-[10px] text-slate-400">
                            {member.convertedThisMonth + (member.lostThisMonth || 0)} resolved this mo
                          </div>
                        </div>
                      </td>

                      {/* Contacted */}
                      <td className="py-4 px-4">
                        <span className="font-semibold text-slate-800">
                          {member.contactedCount}
                        </span>
                        <span className="text-[11px] text-slate-400 ml-1">
                          (
                          {member.assignedCount > 0
                            ? Math.round((member.contactedCount / member.assignedCount) * 100)
                            : 0}
                          %)
                        </span>
                      </td>

                      {/* Overdue Follow-ups */}
                      <td className="py-4 px-4">
                        {overdue > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            {overdue} Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-500">
                            0
                          </span>
                        )}
                      </td>

                      {/* Quotes Pending */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1 text-slate-700 font-semibold">
                          <FileText className="w-3.5 h-3.5 text-purple-600" />
                          <span>{member.quotationsPendingResponse}</span>
                        </div>
                      </td>

                      {/* Conversion Rate */}
                      <td className="py-4 px-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${convColor.bg} ${convColor.text} ${convColor.border}`}
                          >
                            {member.conversionRateThisMonth}%
                          </span>
                          <div className="w-20 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full ${convColor.bar}`}
                              style={{ width: `${Math.min(100, member.conversionRateThisMonth)}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Drill Down */}
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/team/${member.user.id}`);
                          }}
                          className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors cursor-pointer"
                          title={`View ${member.user.name}'s profile`}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
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

export default TeamDashboardPage;
