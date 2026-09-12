import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import {
  Enquiry,
  EnquiryStatus,
  Followup,
  FollowupFrequency,
  Role,
  User,
  Quotation,
  QuotationStatus,
} from '../types/api.types';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import {
  STATUS_METADATA,
  QUOTATION_STATUS_METADATA,
  QUOTATION_LEGAL_TRANSITIONS,
} from '../utils/statusMetadata';
import {
  ArrowLeft,
  Phone,
  Mail,
  Building,
  MapPin,
  Calendar,
  Clock,
  User as UserIcon,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileText,
  Paperclip,
  Send,
  MessageSquare,
  History,
  Tag,
  ChevronRight,
  X,
  Plus,
  UserCheck,
} from 'lucide-react';

const MANAGER_ROLES: Role[] = ['ADMIN', 'DGM', 'AGM', 'MANAGER'];

export const EnquiryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManagerPlus = Boolean(user && MANAGER_ROLES.includes(user.role));

  const [enquiry, setEnquiry] = useState<Enquiry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Quick Action Modals
  const [isStatusModalOpen, setIsStatusModalOpen] = useState<boolean>(false);
  const [newStatus, setNewStatus] = useState<EnquiryStatus>('CONTACTED');
  const [statusReason, setStatusReason] = useState<string>('');
  const [isSubmittingStatus, setIsSubmittingStatus] = useState<boolean>(false);

  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState<boolean>(false);
  const [followupDueAt, setFollowupDueAt] = useState<string>('');
  const [followupPurpose, setFollowupPurpose] = useState<string>('Follow up on requirement discussion');
  const [followupFrequency, setFollowupFrequency] = useState<FollowupFrequency>('ONE_TIME');
  const [isSubmittingFollowup, setIsSubmittingFollowup] = useState<boolean>(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string>('');
  const [isSubmittingAssign, setIsSubmittingAssign] = useState<boolean>(false);

  // Remark editing state
  const [isEditingRemark, setIsEditingRemark] = useState<boolean>(false);
  const [remarkText, setRemarkText] = useState<string>('');
  const [isSavingRemark, setIsSavingRemark] = useState<boolean>(false);

  // Team members for reassignment (Manager+)
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  // System setting for forwarding & active employee candidates
  const [allowEmployeeReassignment, setAllowEmployeeReassignment] = useState<boolean>(false);
  const [employeeCandidates, setEmployeeCandidates] = useState<{ id: string; name: string; email: string }[]>([]);

  // Follow-up actions state
  const [completingFollowupId, setCompletingFollowupId] = useState<string | null>(null);
  const [reassigningFollowup, setReassigningFollowup] = useState<Followup | null>(null);
  const [reassignTargetUserId, setReassignTargetUserId] = useState<string>('');
  const [isSubmittingFollowupReassign, setIsSubmittingFollowupReassign] = useState<boolean>(false);

  // Quotation states
  const [isQuotationModalOpen, setIsQuotationModalOpen] = useState<boolean>(false);
  const [quotationAmount, setQuotationAmount] = useState<string>('');
  const [quotationNotes, setQuotationNotes] = useState<string>('');
  const [isSubmittingQuotation, setIsSubmittingQuotation] = useState<boolean>(false);

  // Quotation status transition states
  const [transitioningQuotation, setTransitioningQuotation] = useState<{
    quotation: Quotation;
    targetStatus: QuotationStatus;
    targetLabel: string;
  } | null>(null);
  const [transitionNotes, setTransitionNotes] = useState<string>('');
  const [isSubmittingTransition, setIsSubmittingTransition] = useState<boolean>(false);

  // Fetch enquiry details
  const fetchEnquiry = useCallback(async (): Promise<void> => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.enquiries.getById(id);
      setEnquiry(data);
      if (data.allowEmployeeReassignment !== undefined) {
        setAllowEmployeeReassignment(data.allowEmployeeReassignment);
      }
      setRemarkText(data.remarks || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load enquiry details.');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchEnquiry();
  }, [fetchEnquiry]);

  // Fetch system forwarding status once on load
  useEffect(() => {
    void api.settings
      .getForwardingStatus()
      .then((res) => setAllowEmployeeReassignment(res.allowEmployeeReassignment))
      .catch(() => setAllowEmployeeReassignment(false));
  }, []);

  // Load team members if Manager+, or peer active employees if Employee
  useEffect(() => {
    if (isManagerPlus) {
      void api.dashboard
        .getTeamDashboard()
        .then((metrics) => {
          setTeamMembers(metrics.map((m) => m.user));
        })
        .catch((err) => console.error('Failed to load team members:', err));
    } else {
      void api.users
        .listEmployees()
        .then((candidates) => {
          setEmployeeCandidates(candidates);
        })
        .catch((err) => console.error('Failed to load employee candidates:', err));
    }
  }, [isManagerPlus]);

  // Clear toast notifications after 4 seconds
  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  // 1. Submit Status Change
  const handleChangeStatus = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!id || !newStatus) return;
    setIsSubmittingStatus(true);
    try {
      await api.enquiries.changeStatus(id, {
        newStatus,
        reason: statusReason.trim() || undefined,
      });
      setIsStatusModalOpen(false);
      setStatusReason('');
      setActionSuccess(`Status updated to ${newStatus}`);
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change status.');
    } finally {
      setIsSubmittingStatus(false);
    }
  };

  // 2. Submit Follow-up Schedule
  const handleScheduleFollowup = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!id || !followupDueAt) return;

    // Check future date
    const selectedDate = new Date(followupDueAt);
    if (isNaN(selectedDate.getTime()) || selectedDate <= new Date()) {
      alert('Due date must be in the future.');
      return;
    }

    setIsSubmittingFollowup(true);
    try {
      await api.followups.create({
        enquiryId: id,
        dueAt: selectedDate.toISOString(),
        purpose: followupPurpose.trim() || undefined,
        frequency: followupFrequency,
      });
      setIsFollowupModalOpen(false);
      setFollowupDueAt('');
      setActionSuccess('Follow-up scheduled successfully');
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to schedule follow-up.');
    } finally {
      setIsSubmittingFollowup(false);
    }
  };

  // Mark Follow-up Complete
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
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to complete follow-up');
    } finally {
      setCompletingFollowupId(null);
    }
  };

  // Reassign Follow-up Task
  const handleReassignFollowup = async (): Promise<void> => {
    if (!reassigningFollowup || !reassignTargetUserId) return;
    setIsSubmittingFollowupReassign(true);
    try {
      await api.followups.reassign(reassigningFollowup.id, reassignTargetUserId);
      setActionSuccess('Follow-up task reassigned successfully');
      setReassigningFollowup(null);
      setReassignTargetUserId('');
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reassign follow-up');
    } finally {
      setIsSubmittingFollowupReassign(false);
    }
  };

  // 3. Submit Remark Update
  const handleSaveRemark = async (): Promise<void> => {
    if (!id) return;
    setIsSavingRemark(true);
    try {
      await api.enquiries.update(id, {
        remarks: remarkText.trim() || null,
      });
      setIsEditingRemark(false);
      setActionSuccess('Remark updated successfully');
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save remark.');
    } finally {
      setIsSavingRemark(false);
    }
  };

  // 4. Submit Reassignment or Forwarding
  const handleReassign = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!id || !selectedAssigneeId) return;
    setIsSubmittingAssign(true);
    try {
      await api.enquiries.assign(id, selectedAssigneeId);
      setIsAssignModalOpen(false);
      setActionSuccess(isManagerPlus ? 'Enquiry reassigned successfully' : 'Enquiry forwarded successfully');
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : isManagerPlus ? 'Failed to reassign enquiry.' : 'Failed to forward enquiry.');
    } finally {
      setIsSubmittingAssign(false);
    }
  };

  // 5. Submit New Quotation
  const handleCreateQuotation = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!id) return;
    setIsSubmittingQuotation(true);
    try {
      await api.quotations.create(id, {
        amount: quotationAmount ? Number(quotationAmount) : null,
        notes: quotationNotes.trim() || undefined,
      });
      setIsQuotationModalOpen(false);
      setQuotationAmount('');
      setQuotationNotes('');
      setActionSuccess('Quotation generated successfully.');
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate quotation.');
    } finally {
      setIsSubmittingQuotation(false);
    }
  };

  // 6. Submit Quotation Status Transition
  const handleConfirmTransition = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!transitioningQuotation) return;
    setIsSubmittingTransition(true);
    try {
      await api.quotations.transitionStatus(transitioningQuotation.quotation.id, {
        status: transitioningQuotation.targetStatus,
        notes: transitionNotes.trim() || undefined,
      });
      setActionSuccess(
        `Quotation status updated to ${QUOTATION_STATUS_METADATA[transitioningQuotation.targetStatus]?.label || transitioningQuotation.targetStatus}.`,
      );
      setTransitioningQuotation(null);
      setTransitionNotes('');
      await fetchEnquiry();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to transition quotation status.');
    } finally {
      setIsSubmittingTransition(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 w-36 bg-slate-200 rounded" />
        <div className="h-36 bg-white rounded-2xl border border-slate-200 p-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-white rounded-2xl border border-slate-200" />
          <div className="h-96 bg-white rounded-2xl border border-slate-200" />
        </div>
      </div>
    );
  }

  if (error || !enquiry) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center max-w-lg mx-auto mt-12 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Enquiry Not Found</h2>
        <p className="text-sm text-slate-600 mb-6">{error || 'This enquiry does not exist or you do not have permission to view it.'}</p>
        <button
          onClick={() => navigate('/enquiries')}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm transition-all cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Enquiries
        </button>
      </div>
    );
  }

  const validNextStatuses = (Object.keys(STATUS_METADATA) as EnquiryStatus[]).filter(
    (s) => s !== enquiry.status,
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/enquiries')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Enquiry Pipeline</span>
        </button>

        <button
          onClick={() => void fetchEnquiry()}
          className="p-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition-colors shadow-sm cursor-pointer"
          title="Refresh Details"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Success Notification Banner */}
      {actionSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-xs transition-all">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {enquiry.customer?.name || enquiry.companyName || 'Unnamed Lead'}
              </h1>
              <StatusBadge status={enquiry.status} size="lg" />
              <PriorityBadge priority={enquiry.priority} size="md" />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
              {enquiry.companyName && (
                <div className="flex items-center gap-1.5 font-medium text-slate-700">
                  <Building className="w-3.5 h-3.5 text-slate-400" />
                  <span>{enquiry.companyName}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <a
                  href={`tel:${enquiry.phone}`}
                  className="font-mono text-slate-700 hover:text-brand-600 underline font-medium"
                >
                  {enquiry.phone}
                </a>
              </div>
              {enquiry.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`mailto:${enquiry.email}`} className="text-slate-700 hover:underline">
                    {enquiry.email}
                  </a>
                </div>
              )}
              {enquiry.location && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{enquiry.location}</span>
                </div>
              )}
            </div>
          </div>

          {/* Assigned Employee Box */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4 min-w-[240px]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-brand-100 border border-brand-200 flex items-center justify-center text-brand-700 font-bold text-sm">
                {enquiry.assignedTo?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Assigned Employee
                </span>
                <p className="text-xs font-semibold text-slate-900 leading-tight">
                  {enquiry.assignedTo?.name || 'Unassigned'}
                </p>
                <span className="text-[10px] text-slate-400">{enquiry.assignedTo?.role || '—'}</span>
              </div>
            </div>

            {(isManagerPlus ||
              (user?.role === 'EMPLOYEE' &&
                enquiry.assignedToId === user.id &&
                allowEmployeeReassignment)) && (
              <button
                onClick={() => {
                  setSelectedAssigneeId(enquiry.assignedToId || '');
                  setIsAssignModalOpen(true);
                }}
                className="text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-white px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
              >
                {isManagerPlus ? 'Reassign' : 'Forward'}
              </button>
            )}
          </div>
        </div>

        {/* Quick Action Workflow Toolbar ("Call → Add Remark → Change Status → Schedule Follow-up") */}
        <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
            Quick Actions Workflow
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {/* 1. Call */}
            <a
              href={`tel:${enquiry.phone}`}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-emerald-500 hover:text-emerald-700 text-xs font-semibold text-slate-700 transition-all shadow-xs"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600" />
              <span>Call Client</span>
            </a>

            {/* 2. Add Remark */}
            <button
              onClick={() => setIsEditingRemark(!isEditingRemark)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-brand-500 hover:text-brand-700 text-xs font-semibold text-slate-700 transition-all shadow-xs cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-brand-600" />
              <span>{isEditingRemark ? 'Close Remark Box' : 'Add / Edit Remark'}</span>
            </button>

            {/* 3. Change Status */}
            <button
              onClick={() => {
                setNewStatus(validNextStatuses[0] || 'CONTACTED');
                setStatusReason('');
                setIsStatusModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-purple-500 hover:text-purple-700 text-xs font-semibold text-slate-700 transition-all shadow-xs cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
              <span>Change Status</span>
            </button>

            {/* 4. Schedule Follow-up */}
            <button
              onClick={() => {
                // Default due date to tomorrow 10:00 AM local
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                tomorrow.setHours(10, 0, 0, 0);
                const tzOffset = tomorrow.getTimezoneOffset() * 60000;
                const localISOTime = new Date(tomorrow.getTime() - tzOffset).toISOString().slice(0, 16);
                setFollowupDueAt(localISOTime);
                setIsFollowupModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-700 text-xs font-semibold text-slate-700 transition-all shadow-xs cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Schedule Follow-up</span>
            </button>
          </div>

          {/* Inline Remark Editor */}
          {isEditingRemark && (
            <div className="mt-4 pt-4 border-t border-slate-200/80 space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Current Remark / Conversation Notes:
              </label>
              <textarea
                rows={3}
                value={remarkText}
                onChange={(e) => setRemarkText(e.target.value)}
                placeholder="Write current client interaction notes or requirements..."
                className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setIsEditingRemark(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSaveRemark()}
                  disabled={isSavingRemark}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingRemark ? (
                    <span>Saving...</span>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      <span>Save Remark</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Overview Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Product Requirement</span>
            <p className="text-xs font-semibold text-slate-800 mt-1">{enquiry.product || 'Not Specified'}</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Expected Value</span>
            <p className="text-xs font-semibold text-slate-800 mt-1">
              {enquiry.expectedValue ? `₹${Number(enquiry.expectedValue).toLocaleString('en-IN')}` : '—'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next Follow-up</span>
            <p className="text-xs font-semibold text-slate-800 mt-1">
              {enquiry.nextFollowupAt
                ? new Date(enquiry.nextFollowupAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'None scheduled'}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Source</span>
            <p className="text-xs font-semibold text-slate-800 mt-1">{enquiry.source || 'Direct'}</p>
          </div>
        </div>

        {/* Current Remark Display Box if present and not currently editing */}
        {enquiry.remarks && !isEditingRemark && (
          <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80">
            <div className="flex items-center gap-1.5 text-amber-800 font-semibold text-xs mb-1">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Current Remark</span>
            </div>
            <p className="text-xs text-slate-700 whitespace-pre-wrap">{enquiry.remarks}</p>
          </div>
        )}
      </div>

      {/* Grid: Activity Timeline (Left 2 cols) & Linked Details (Right 1 col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Complete Chronological Activity Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-brand-600" />
                <h2 className="text-base font-bold text-slate-900">Activity History</h2>
              </div>
              <span className="text-xs font-medium text-slate-400">
                {enquiry.activities?.length || 0} events recorded
              </span>
            </div>

            {!enquiry.activities || enquiry.activities.length === 0 ? (
              <div className="text-center py-12 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-400">
                No activity records logged for this enquiry yet.
              </div>
            ) : (
              <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 ml-3">
                {enquiry.activities.map((act) => {
                  let badgeBg = 'bg-blue-500';
                  let icon = <Tag className="w-3 h-3 text-white" />;

                  if (act.type === 'STATUS_CHANGED') {
                    badgeBg = 'bg-purple-500';
                    icon = <RefreshCw className="w-3 h-3 text-white" />;
                  } else if (act.type.startsWith('FOLLOWUP')) {
                    badgeBg = 'bg-amber-500';
                    icon = <Calendar className="w-3 h-3 text-white" />;
                  } else if (act.type === 'QUOTATION_SENT') {
                    badgeBg = 'bg-emerald-500';
                    icon = <FileText className="w-3 h-3 text-white" />;
                  } else if (act.type === 'ATTACHMENT_UPLOADED') {
                    badgeBg = 'bg-sky-500';
                    icon = <Paperclip className="w-3 h-3 text-white" />;
                  } else if (act.type === 'ASSIGNED') {
                    badgeBg = 'bg-indigo-500';
                    icon = <UserIcon className="w-3 h-3 text-white" />;
                  }

                  return (
                    <div key={act.id} className="relative group">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[31px] top-1.5 w-6 h-6 rounded-full ${badgeBg} flex items-center justify-center ring-4 ring-white shadow-xs`}
                      >
                        {icon}
                      </div>

                      <div className="bg-slate-50/70 hover:bg-slate-50 p-4 rounded-xl border border-slate-200/80 transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-900 capitalize">
                            {act.type.replace(/_/g, ' ').toLowerCase()}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-300" />
                            {new Date(act.createdAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        {act.description && (
                          <p className="text-xs text-slate-700 mt-1">{act.description}</p>
                        )}

                        {act.previousStatus && act.newStatus && (
                          <div className="flex items-center gap-2 mt-2 text-xs font-medium">
                            <span className="text-slate-400">{act.previousStatus}</span>
                            <ChevronRight className="w-3 h-3 text-slate-400" />
                            <span className="text-slate-800 font-semibold">{act.newStatus}</span>
                          </div>
                        )}

                        <div className="mt-2 text-[10px] text-slate-400 font-medium">
                          Performed by {act.user?.name || 'System'} ({act.user?.role || 'SYSTEM'})
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Linked Quotations & Attachments */}
        <div className="space-y-6">
          {/* Scheduled Follow-ups Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900">Follow-ups</h3>
              </div>
              <span className="text-xs text-slate-400">{enquiry.followups?.length || 0}</span>
            </div>

            {!enquiry.followups || enquiry.followups.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No follow-ups recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {enquiry.followups.map((f) => {
                  const isCompleted = f.status === 'COMPLETED';
                  const canComplete = !isCompleted && (user?.role === 'ADMIN' || f.assignedToId === user?.id || isManagerPlus);
                  const canReassign = !isCompleted && (
                    isManagerPlus ||
                    (f.assignedToId === user?.id && (
                      (allowEmployeeReassignment && employeeCandidates.some((c) => c.id !== user?.id)) ||
                      (enquiry.assignedToId && enquiry.assignedToId !== user?.id)
                    ))
                  );

                  return (
                    <div key={f.id} className="py-3 text-xs space-y-1.5 border-b border-slate-100 last:border-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">
                            {new Date(f.dueAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              f.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700'
                                : f.status === 'OVERDUE'
                                  ? 'bg-red-50 text-red-700'
                                  : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {f.status}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {canComplete && (
                            <button
                              type="button"
                              onClick={() => void handleCompleteFollowup(f.id)}
                              disabled={completingFollowupId === f.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              title="Mark this follow-up as complete"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{completingFollowupId === f.id ? 'Completing...' : 'Mark Complete'}</span>
                            </button>
                          )}
                          {canReassign && (
                            <button
                              type="button"
                              onClick={() => {
                                setReassigningFollowup(f);
                                setReassignTargetUserId('');
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                              title="Reassign this follow-up task"
                            >
                              <UserCheck className="w-3 h-3 text-slate-500" />
                              <span>Reassign</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {f.purpose && <p className="text-slate-600 font-medium">{f.purpose}</p>}

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <span className="capitalize">{f.frequency.toLowerCase().replace(/_/g, ' ')}</span>
                        {f.assignedTo && (
                          <span>
                            Assigned to: <strong className="text-slate-600 font-semibold">{f.assignedTo.name}</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Linked Quotations Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-bold text-slate-900">Quotations</h3>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {enquiry.quotations?.length || 0}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsQuotationModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Quotation</span>
              </button>
            </div>

            {!enquiry.quotations || enquiry.quotations.length === 0 ? (
              <div className="py-6 text-center">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs text-slate-400">No quotations generated yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {enquiry.quotations.map((q) => {
                  const statusMeta = QUOTATION_STATUS_METADATA[q.status] || {
                    label: q.status,
                    bg: 'bg-slate-100',
                    text: 'text-slate-700',
                    border: 'border-slate-200',
                    dot: 'bg-slate-400',
                  };
                  const legalTransitions = QUOTATION_LEGAL_TRANSITIONS[q.status] || [];

                  return (
                    <div
                      key={q.id}
                      className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 transition-all space-y-2.5"
                    >
                      {/* Top: Amount & Status Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Quote #{q.id.slice(-6).toUpperCase()}
                          </span>
                          <span className="text-base font-extrabold text-slate-900 font-mono">
                            {q.amount != null ? `₹${Number(q.amount).toLocaleString('en-IN')}` : 'Amount TBD'}
                          </span>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusMeta.bg} ${statusMeta.text} ${statusMeta.border}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                          {statusMeta.label}
                        </span>
                      </div>

                      {/* Middle: Notes if present */}
                      {q.notes && (
                        <p className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-200 italic">
                          "{q.notes}"
                        </p>
                      )}

                      {/* Dates & author */}
                      <div className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-200/60">
                        <div>
                          Created: {new Date(q.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                          {q.createdBy?.name && ` by ${q.createdBy.name}`}
                        </div>
                        {q.sentAt && (
                          <div className="text-blue-600 font-medium">
                            Sent on {new Date(q.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                        {q.respondedAt && (
                          <div className="text-emerald-600 font-medium">
                            Responded on {new Date(q.respondedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {/* Bottom: Legal Status Transition Controls */}
                      <div className="pt-2 border-t border-slate-200/60">
                        {legalTransitions.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                              Next Action:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {legalTransitions.map((tr) => (
                                <button
                                  key={tr.status}
                                  type="button"
                                  onClick={() =>
                                    setTransitioningQuotation({
                                      quotation: q,
                                      targetStatus: tr.status,
                                      targetLabel: tr.label,
                                    })
                                  }
                                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer ${tr.actionClass}`}
                                >
                                  {tr.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">
                            Finalized ({statusMeta.label})
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal: Change Status */}
      {isStatusModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Change Enquiry Status</h3>
              <button
                onClick={() => setIsStatusModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangeStatus} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  New Status *
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as EnquiryStatus)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-900 font-semibold"
                >
                  {validNextStatuses.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_METADATA[st]?.label || st}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason / Action Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="e.g. Spoke with client, requested revised quote"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStatusModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStatus}
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingStatus ? 'Updating...' : 'Confirm Status Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Schedule Follow-up */}
      {isFollowupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Schedule Follow-up</h3>
              <button
                onClick={() => setIsFollowupModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleScheduleFollowup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Due Date & Time * (Future datetime)
                </label>
                <input
                  type="datetime-local"
                  required
                  value={followupDueAt}
                  onChange={(e) => setFollowupDueAt(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Purpose / Goal *
                </label>
                <input
                  type="text"
                  required
                  value={followupPurpose}
                  onChange={(e) => setFollowupPurpose(e.target.value)}
                  placeholder="e.g. Call client regarding price negotiation"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Recurrence Frequency
                </label>
                <select
                  value={followupFrequency}
                  onChange={(e) => setFollowupFrequency(e.target.value as FollowupFrequency)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-900"
                >
                  <option value="ONE_TIME">One Time</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFollowupModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFollowup}
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingFollowup ? 'Scheduling...' : 'Save Follow-up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reassign or Forward Enquiry */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isManagerPlus ? 'Reassign Enquiry' : 'Forward Enquiry'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isManagerPlus
                    ? 'Assign this enquiry to a team member within your hierarchy.'
                    : 'Select a peer employee to forward this enquiry to.'}
                </p>
              </div>
              <button
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReassign} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  {isManagerPlus ? 'Select Assignee *' : 'Select Target Employee *'}
                </label>
                <select
                  required
                  value={selectedAssigneeId}
                  onChange={(e) => setSelectedAssigneeId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 text-slate-900 font-medium"
                >
                  <option value="">
                    {isManagerPlus ? 'Select team member...' : 'Select an active employee...'}
                  </option>
                  {isManagerPlus
                    ? teamMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} — {member.email} ({member.role})
                        </option>
                      ))
                    : employeeCandidates
                        .filter((emp) => emp.id !== user?.id)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} — {emp.email} (EMPLOYEE)
                          </option>
                        ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAssign || !selectedAssigneeId}
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingAssign
                    ? isManagerPlus
                      ? 'Assigning...'
                      : 'Forwarding...'
                    : isManagerPlus
                      ? 'Confirm Reassignment'
                      : 'Forward Enquiry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Quotation */}
      {isQuotationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Generate Quotation</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsQuotationModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateQuotation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Quotation Amount (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-sm font-bold text-slate-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={quotationAmount}
                    onChange={(e) => setQuotationAmount(e.target.value)}
                    placeholder="e.g. 75000"
                    className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-900 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes & Proposal Description (Optional)
                </label>
                <textarea
                  rows={3}
                  value={quotationNotes}
                  onChange={(e) => setQuotationNotes(e.target.value)}
                  placeholder="e.g. Includes enterprise onboarding and 1 year support package"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsQuotationModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuotation}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingQuotation ? 'Generating...' : 'Create Quotation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Quotation Status Transition */}
      {transitioningQuotation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {transitioningQuotation.targetLabel}
                </h3>
                <span className="text-[11px] text-slate-400 font-mono">
                  Quote #{transitioningQuotation.quotation.id.slice(-6).toUpperCase()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTransitioningQuotation(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">Status transition:</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-500">
                  {QUOTATION_STATUS_METADATA[transitioningQuotation.quotation.status]?.label ||
                    transitioningQuotation.quotation.status}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-bold text-purple-700">
                  {QUOTATION_STATUS_METADATA[transitioningQuotation.targetStatus]?.label ||
                    transitioningQuotation.targetStatus}
                </span>
              </div>
            </div>

            <form onSubmit={handleConfirmTransition} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Action Note / Reason (Optional)
                </label>
                <textarea
                  rows={2}
                  value={transitionNotes}
                  onChange={(e) => setTransitionNotes(e.target.value)}
                  placeholder="e.g. Sent via email / Client approved pricing"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTransitioningQuotation(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingTransition}
                  className="px-4 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingTransition ? 'Updating...' : 'Confirm Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Modal: Reassign Follow-up Task */}
      {reassigningFollowup && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-brand-50 border border-brand-200 text-brand-700">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Reassign Follow-up Task</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Transfer this follow-up without changing the parent enquiry assignee.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReassigningFollowup(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleReassignFollowup();
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Select New Assignee <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={reassignTargetUserId}
                  onChange={(e) => setReassignTargetUserId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="">-- Choose Target Assignee --</option>
                  {isManagerPlus ? (
                    teamMembers
                      .filter((m) => m.id !== reassigningFollowup.assignedToId)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role}) — {m.email}
                        </option>
                      ))
                  ) : (
                    employeeCandidates
                      .filter((c) => c.id !== reassigningFollowup.assignedToId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.email}
                        </option>
                      ))
                  )}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {isManagerPlus
                    ? 'Supervisors can delegate this task to any active subordinate in their team.'
                    : 'Colleagues eligible to take ownership of this follow-up task.'}
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReassigningFollowup(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFollowupReassign || !reassignTargetUserId}
                  className="px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingFollowupReassign ? 'Reassigning...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnquiryDetailPage;