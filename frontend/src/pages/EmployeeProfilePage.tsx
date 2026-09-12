import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import {
  UserProfileData,
  Enquiry,
  EnquiryStatus,
  Priority,
  EnquiriesPaginationMeta,
} from '../types/api.types';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { STATUS_METADATA } from '../utils/statusMetadata';
import {
  ArrowLeft,
  Calendar,
  Clock,
  AlertTriangle,
  FileText,
  TrendingUp,
  RefreshCw,
  Search,
  Phone,
  Building,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  Mail,
  User as UserIcon,
  AlertCircle,
  CheckCircle2,
  XCircle,
  TrendingDown,
  X,
  Users,
  Briefcase,
} from 'lucide-react';

const ALL_ENQUIRY_STATUSES: EnquiryStatus[] = [
  'NEW',
  'ASSIGNED',
  'CONTACTED',
  'FOLLOW_UP_REQUIRED',
  'QUOTATION_SENT',
  'NEGOTIATION',
  'CONVERTED',
  'LOST',
  'ON_HOLD',
];

const OPEN_STATUSES: EnquiryStatus[] = [
  'NEW',
  'ASSIGNED',
  'CONTACTED',
  'FOLLOW_UP_REQUIRED',
  'QUOTATION_SENT',
  'NEGOTIATION',
  'ON_HOLD',
];

const CLOSED_STATUSES: EnquiryStatus[] = ['CONVERTED', 'LOST'];

export const EmployeeProfilePage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  // Profile data
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);

  // Enquiries list
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [meta, setMeta] = useState<EnquiriesPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isLoadingEnquiries, setIsLoadingEnquiries] = useState<boolean>(true);
  const [enquiriesError, setEnquiriesError] = useState<string | null>(null);

  // Filters
  const [openClosedFilter, setOpenClosedFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');
  const [selectedStatuses, setSelectedStatuses] = useState<EnquiryStatus[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<Priority | ''>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch Profile
  const fetchProfile = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setIsLoadingProfile(true);
    setProfileError(null);
    setIsNotFound(false);

    try {
      const data = await api.users.getProfile(userId);
      setProfile(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load employee profile.';
      if (msg.toLowerCase().includes('not found') || msg.includes('404')) {
        setIsNotFound(true);
      } else {
        setProfileError(msg);
      }
    } finally {
      setIsLoadingProfile(false);
    }
  }, [userId]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  // Fetch Enquiries for this specific subordinate
  const fetchEnquiries = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setIsLoadingEnquiries(true);
    setEnquiriesError(null);

    try {
      // Determine effective status filter
      let effectiveStatusParam: EnquiryStatus | undefined;
      if (selectedStatuses.length === 1) {
        effectiveStatusParam = selectedStatuses[0];
      }

      const res = await api.enquiries.list({
        page: currentPage,
        limit: 10,
        search: debouncedSearch || undefined,
        status: effectiveStatusParam,
        priority: selectedPriority || undefined,
        assignedToId: userId,
      });

      let filtered = res.enquiries;

      // Apply multi-status filter if more than 1 selected
      if (selectedStatuses.length > 1) {
        filtered = filtered.filter((e) => selectedStatuses.includes(e.status));
      }

      // Apply Open vs Closed quick filter
      if (openClosedFilter === 'OPEN') {
        filtered = filtered.filter((e) => OPEN_STATUSES.includes(e.status));
      } else if (openClosedFilter === 'CLOSED') {
        filtered = filtered.filter((e) => CLOSED_STATUSES.includes(e.status));
      }

      setEnquiries(filtered);
      setMeta(res.meta);
    } catch (err) {
      setEnquiriesError(err instanceof Error ? err.message : 'Failed to load enquiries.');
    } finally {
      setIsLoadingEnquiries(false);
    }
  }, [userId, currentPage, debouncedSearch, selectedStatuses, selectedPriority, openClosedFilter]);

  useEffect(() => {
    if (!isNotFound && !profileError) {
      void fetchEnquiries();
    }
  }, [fetchEnquiries, isNotFound, profileError]);

  // Filter handlers
  const handleOpenClosedToggle = (type: 'ALL' | 'OPEN' | 'CLOSED'): void => {
    setOpenClosedFilter(type);
    setSelectedStatuses([]);
    setCurrentPage(1);
  };

  const toggleStatusFilter = (status: EnquiryStatus): void => {
    setCurrentPage(1);
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const clearAllFilters = (): void => {
    setOpenClosedFilter('ALL');
    setSelectedStatuses([]);
    setSelectedPriority('');
    setSearchQuery('');
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    openClosedFilter !== 'ALL' ||
    selectedStatuses.length > 0 ||
    Boolean(selectedPriority) ||
    Boolean(debouncedSearch);

  // Conversion rate badge styling
  const getConversionColorClass = (rate: number): { bg: string; text: string; border: string; bar: string } => {
    if (rate >= 40) {
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        bar: 'bg-emerald-500',
      };
    }
    if (rate >= 20) {
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        bar: 'bg-amber-500',
      };
    }
    return {
      bg: 'bg-rose-50',
      text: 'text-rose-700',
      border: 'border-rose-200',
      bar: 'bg-rose-500',
    };
  };

  // 404 / Anti-enumeration Not Found state
  if (isNotFound) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white p-8 rounded-2xl border border-slate-200 text-center shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto mb-4">
          <UserIcon className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Employee Not Found</h2>
        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
          The requested profile does not exist or is outside of your reporting hierarchy.
        </p>
        <Link
          to="/team"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Team Dashboard</span>
        </Link>
      </div>
    );
  }

  // Loading skeleton
  if (isLoadingProfile) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-40 bg-slate-200 rounded-lg" />
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-200" />
          <div className="space-y-2 flex-1">
            <div className="h-6 w-48 bg-slate-200 rounded" />
            <div className="h-4 w-72 bg-slate-100 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-28 bg-white rounded-2xl border border-slate-200 p-4" />
          ))}
        </div>
        <div className="h-64 bg-white rounded-2xl border border-slate-200" />
      </div>
    );
  }

  // Error state
  if (profileError || !profile) {
    return (
      <div className="max-w-lg mx-auto mt-16 bg-white p-8 rounded-2xl border border-red-200 text-center shadow-xs">
        <div className="w-14 h-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-1">Failed to Load Profile</h2>
        <p className="text-xs text-slate-500 mb-6">{profileError || 'An unexpected error occurred.'}</p>
        <button
          onClick={() => void fetchProfile()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Retry Connection</span>
        </button>
      </div>
    );
  }

  const { user: emp } = profile;
  const initials = emp.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  const convColor = getConversionColorClass(profile.conversionRateThisMonth);
  const formattedMemberSince = new Date(emp.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const totalEnquiriesInScope = ALL_ENQUIRY_STATUSES.reduce(
    (acc, status) => acc + (profile.countsByStatus[status] || 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Top Navigation & Back Link */}
      <div className="flex items-center justify-between">
        <Link
          to="/team"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Team Dashboard</span>
        </Link>

        <button
          onClick={() => {
            void fetchProfile();
            void fetchEnquiries();
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Profile Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-brand-50 border-2 border-brand-200 flex items-center justify-center text-brand-700 font-black text-xl shadow-xs shrink-0">
              {initials}
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                  {emp.name}
                </h1>

                {/* Role Badge */}
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border border-slate-200 bg-slate-50 text-slate-700">
                  {emp.role === 'ADMIN' ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                  ) : (
                    <UserCheck className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  {emp.role}
                </span>

                {/* Active / Inactive Badge */}
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    emp.isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}
                >
                  {emp.isActive ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Active
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-rose-600" />
                      Inactive
                    </>
                  )}
                </span>
              </div>

              {/* Subtitle Details */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-xs text-slate-500">
                <span className="flex items-center gap-1.5 font-mono">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  {emp.email}
                </span>

                {emp.supervisor && (
                  <span className="flex items-center gap-1.5">
                    <span className="text-slate-300">•</span>
                    <span>Reports to:</span>
                    <strong className="text-slate-700 font-semibold">{emp.supervisor.name}</strong>
                    <span className="text-[10px] text-slate-400">({emp.supervisor.role})</span>
                  </span>
                )}

                <span className="flex items-center gap-1.5">
                  <span className="text-slate-300">•</span>
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Member since {formattedMemberSince}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5 Personal-Dashboard-Style KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Due Today */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Due Today
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900">{profile.followups.dueToday}</span>
            <span className="text-xs font-medium text-slate-400 ml-1.5">follow-ups</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
            <Clock className="w-3 h-3 text-blue-500" />
            Scheduled for today
          </p>
        </div>

        {/* 2. Overdue Follow-ups */}
        <div
          className={`p-5 rounded-2xl border shadow-xs flex flex-col justify-between transition-all ${
            profile.followups.overdue > 0
              ? 'bg-rose-50/80 border-rose-300 ring-2 ring-rose-500/20'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-semibold uppercase tracking-wider ${
                profile.followups.overdue > 0 ? 'text-rose-700' : 'text-slate-500'
              }`}
            >
              Overdue
            </span>
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                profile.followups.overdue > 0
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span
              className={`text-3xl font-black ${
                profile.followups.overdue > 0 ? 'text-rose-700' : 'text-slate-900'
              }`}
            >
              {profile.followups.overdue}
            </span>
            <span
              className={`text-xs font-medium ml-1.5 ${
                profile.followups.overdue > 0 ? 'text-rose-600 font-semibold' : 'text-slate-400'
              }`}
            >
              past due
            </span>
          </div>
          <p
            className={`text-[11px] mt-2 font-medium ${
              profile.followups.overdue > 0 ? 'text-rose-600' : 'text-slate-400'
            }`}
          >
            {profile.followups.overdue > 0
              ? 'Urgent follow-up required'
              : 'All follow-ups on schedule'}
          </p>
        </div>

        {/* 3. Pending Quotes */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pending Quotes
            </span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-slate-900">
              {profile.quotationsPendingResponse}
            </span>
            <span className="text-xs font-medium text-slate-400 ml-1.5">proposals</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Awaiting client decision</p>
        </div>

        {/* 4. Conversion Rate (Month) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Conversion Rate
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-3xl font-black ${convColor.text}`}>
              {profile.conversionRateThisMonth}%
            </span>
            <span className="text-xs font-medium text-slate-400 ml-1.5">this month</span>
          </div>
          <div className="mt-2">
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${convColor.bar}`}
                style={{ width: `${Math.min(100, profile.conversionRateThisMonth)}%` }}
              />
            </div>
          </div>
        </div>

        {/* 5. Won vs Lost Deals (Month) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Deals Won / Lost
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-black text-emerald-600">
              {profile.performanceThisMonth.converted}
            </span>
            <span className="text-slate-300 font-normal mx-1.5 text-2xl">/</span>
            <span className="text-2xl font-black text-rose-600">
              {profile.performanceThisMonth.lost}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Current calendar month</p>
        </div>
      </div>

      {/* Pipeline Status Breakdown Ribbon (Clickable pills) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Enquiry Pipeline Distribution</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Breakdown of all {totalEnquiriesInScope} enquiries assigned to {emp.name}. Click to
              filter below.
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            Total: {totalEnquiriesInScope}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2">
          {ALL_ENQUIRY_STATUSES.map((status) => {
            const count = profile.countsByStatus[status] || 0;
            const meta = STATUS_METADATA[status];
            const isSelected = selectedStatuses.includes(status);

            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatusFilter(status)}
                className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? `${meta.bg} ${meta.border} ring-2 ring-brand-500/40 shadow-xs font-bold`
                    : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.text}`}>
                    {meta.label}
                  </span>
                </div>
                <p className="text-lg font-black text-slate-900 mt-1">{count}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Subordinate Team Section (Admin viewing Manager+) */}
      {profile.team && profile.team.length > 0 && (() => {
        const teamMembers = profile.team;
        const totalTeamMembers = teamMembers.length;
        const totalAssignedAll = teamMembers.reduce((acc, m) => acc + (m.assignedCount || 0), 0);
        const totalOverdueAll = teamMembers.reduce((acc, m) => acc + (m.followups?.overdue || m.overdueCount || 0), 0);
        const totalConvertedThisMonth = teamMembers.reduce((acc, m) => acc + (m.convertedThisMonth || 0), 0);
        const totalAssignedThisMonth = teamMembers.reduce(
          (acc, m) =>
            acc +
            (m.countsByStatus
              ? Object.values(m.countsByStatus).reduce<number>((a, b) => a + Number(b || 0), 0)
              : (m.assignedCount || 0)),
          0,
        );
        const teamConversionRate =
          totalAssignedThisMonth > 0
            ? Number(((totalConvertedThisMonth / totalAssignedThisMonth) * 100).toFixed(1))
            : 0;

        const getConversionColorClass = (rate: number) => {
          if (rate >= 40) return { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bar: 'bg-emerald-500' };
          if (rate >= 20) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bar: 'bg-amber-500' };
          return { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bar: 'bg-rose-500' };
        };

        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-brand-600" />
                  Subordinate Team Overview
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live team workload and performance metrics for all subordinates in this manager's hierarchy.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full self-start sm:self-auto">
                {totalTeamMembers} Team Members
              </span>
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Subordinates</span>
                  <Users className="w-4 h-4 text-brand-600" />
                </div>
                <p className="text-2xl font-black text-slate-900">{totalTeamMembers}</p>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Active reports</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Total Pipeline</span>
                  <Briefcase className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-2xl font-black text-slate-900">{totalAssignedAll}</p>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Assigned enquiries</span>
              </div>

              <div
                className={`rounded-2xl border p-4 shadow-xs transition-colors ${
                  totalOverdueAll > 0
                    ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Overdue Follow-ups</span>
                  <Clock className={`w-4 h-4 ${totalOverdueAll > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
                </div>
                <p className={`text-2xl font-black ${totalOverdueAll > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                  {totalOverdueAll}
                </p>
                <span className="text-[11px] text-slate-400 mt-0.5 block">Requires immediate action</span>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Avg Conversion</span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <p className="text-2xl font-black text-slate-900">{teamConversionRate}%</p>
                <span className="text-[11px] text-slate-400 mt-0.5 block">This month</span>
              </div>
            </div>

            {/* Subordinates Table Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
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
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {teamMembers.map((member) => {
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
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-extrabold text-xs shrink-0 shadow-xs">
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
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-slate-200 bg-slate-50 text-slate-700">
                              {member.user.role === 'ADMIN' ? (
                                <ShieldCheck className="w-3 h-3 text-brand-600" />
                              ) : (
                                <UserCheck className="w-3 h-3 text-slate-500" />
                              )}
                              {member.user.role}
                            </span>
                          </td>

                          {/* Assigned Total */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-0.5">
                              <span className="font-extrabold text-slate-900 text-sm">
                                {member.assignedCount}
                              </span>
                              <div className="text-[10px] text-slate-400">
                                {member.convertedThisMonth + (member.lostThisMonth || 0)} resolved this mo
                              </div>
                            </div>
                          </td>

                          {/* Contacted */}
                          <td className="py-3.5 px-4">
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
                          <td className="py-3.5 px-4">
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
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1 text-slate-700 font-semibold">
                              <FileText className="w-3.5 h-3.5 text-purple-600" />
                              <span>{member.quotationsPendingResponse}</span>
                            </div>
                          </td>

                          {/* Conversion Rate */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <span
                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${convColor.bg} ${convColor.text} ${convColor.border}`}
                              >
                                {member.conversionRateThisMonth}%
                              </span>
                              <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className={`h-1.5 rounded-full ${convColor.bar}`}
                                  style={{ width: `${Math.min(100, member.conversionRateThisMonth)}%` }}
                                />
                              </div>
                            </div>
                          </td>

                          {/* Action */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/team/${member.user.id}`);
                              }}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-brand-50 hover:text-brand-600 hover:border-brand-200 text-slate-600 font-bold transition-all text-xs"
                            >
                              View Profile
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {profile.team && profile.team.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No Subordinates Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            This manager currently does not have any active subordinates assigned to their supervisory tree.
          </p>
        </div>
      )}

      {/* Enquiries Section */}
      <div className="space-y-4">
        {/* Controls Ribbon */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Quick Filter: Open vs Closed */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-semibold text-slate-600">
              <button
                type="button"
                onClick={() => handleOpenClosedToggle('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  openClosedFilter === 'ALL'
                    ? 'bg-white text-slate-900 font-bold shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                All Enquiries ({profile.assignedCount})
              </button>
              <button
                type="button"
                onClick={() => handleOpenClosedToggle('OPEN')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  openClosedFilter === 'OPEN'
                    ? 'bg-white text-brand-700 font-bold shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                Open Pipeline
              </button>
              <button
                type="button"
                onClick={() => handleOpenClosedToggle('CLOSED')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  openClosedFilter === 'CLOSED'
                    ? 'bg-white text-emerald-700 font-bold shadow-xs'
                    : 'hover:text-slate-900'
                }`}
              >
                Closed Deals
              </button>
            </div>

            {/* Search and Priority filters */}
            <div className="flex items-center gap-2 flex-1 md:justify-end">
              {/* Search Box */}
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search customer, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Priority Filter */}
              <select
                value={selectedPriority}
                onChange={(e) => {
                  setSelectedPriority(e.target.value as Priority | '');
                  setCurrentPage(1);
                }}
                className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 font-medium text-slate-700 cursor-pointer"
              >
                <option value="">All Priorities</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>

              {/* Clear Filters Button */}
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  title="Clear all filters"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Error message */}
        {enquiriesError && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between text-xs text-red-700">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{enquiriesError}</span>
            </div>
            <button
              onClick={() => void fetchEnquiries()}
              className="font-semibold underline hover:no-underline cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Enquiries Table Card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {isLoadingEnquiries ? (
            <div className="p-8 space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 bg-slate-100 rounded-xl" />
              ))}
            </div>
          ) : enquiries.length === 0 ? (
            <div className="py-14 text-center px-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">No Enquiries Found</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {hasActiveFilters
                  ? 'No records match the current filter or search criteria.'
                  : 'This employee has no assigned enquiries yet.'}
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearAllFilters}
                  className="mt-4 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4 sm:px-6">Customer & Company</th>
                    <th className="py-3.5 px-4">Phone</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4">Priority</th>
                    <th className="py-3.5 px-4">Next Follow-up</th>
                    <th className="py-3.5 px-4 sm:px-6">Last Contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {enquiries.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => navigate(`/enquiries/${item.id}`)}
                      className="hover:bg-brand-50/40 transition-colors cursor-pointer group"
                    >
                      {/* Customer Name & Company */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                          {item.customer?.name || item.companyName || 'Unnamed Lead'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                          {item.companyName || item.customer?.companyName ? (
                            <span className="flex items-center gap-1">
                              <Building className="w-3 h-3 text-slate-400" />
                              {item.companyName || item.customer?.companyName}
                            </span>
                          ) : (
                            <span className="italic">Individual</span>
                          )}
                          {item.product && (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-600 font-medium">{item.product}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="py-3.5 px-4 font-mono text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{item.phone}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={item.status} size="sm" />
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <PriorityBadge priority={item.priority} size="sm" />
                      </td>

                      {/* Next Follow-up */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {item.nextFollowupAt ? (
                          <div className="text-slate-700 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-blue-500" />
                            <span>
                              {new Date(item.nextFollowupAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* Last Contact */}
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap">
                        {item.lastContactedAt ? (
                          <div className="text-slate-600 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>
                              {new Date(item.lastContactedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">Never</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {!isLoadingEnquiries && enquiries.length > 0 && meta.totalPages > 1 && (
            <div className="px-4 py-3 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                Page <strong className="text-slate-700">{meta.page}</strong> of{' '}
                <strong className="text-slate-700">{meta.totalPages}</strong> ({meta.total} total)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={meta.page <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={meta.page >= meta.totalPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfilePage;
