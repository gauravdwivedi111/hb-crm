import { EnquiryStatus, Priority, QuotationStatus } from '../types/api.types';

export const STATUS_METADATA: Record<
  EnquiryStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  NEW: {
    label: 'New',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  ASSIGNED: {
    label: 'Assigned',
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    dot: 'bg-sky-500',
  },
  CONTACTED: {
    label: 'Contacted',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    dot: 'bg-indigo-500',
  },
  FOLLOW_UP_REQUIRED: {
    label: 'Follow-up Req.',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  QUOTATION_SENT: {
    label: 'Quotation Sent',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  NEGOTIATION: {
    label: 'Negotiation',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    dot: 'bg-orange-500',
  },
  CONVERTED: {
    label: 'Converted',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  LOST: {
    label: 'Lost',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
  },
  ON_HOLD: {
    label: 'On Hold',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
};

export const PRIORITY_METADATA: Record<
  Priority,
  { label: string; bg: string; text: string; border: string }
> = {
  URGENT: {
    label: 'Urgent',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
  },
  HIGH: {
    label: 'High',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  MEDIUM: {
    label: 'Medium',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  LOW: {
    label: 'Low',
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
};

export const QUOTATION_STATUS_METADATA: Record<
  QuotationStatus,
  { label: string; bg: string; text: string; border: string; dot: string }
> = {
  CREATED: {
    label: 'Draft',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
  SENT: {
    label: 'Sent',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  VIEWED: {
    label: 'Viewed',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  REVISED: {
    label: 'Revised',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    dot: 'bg-amber-500',
  },
  ACCEPTED: {
    label: 'Accepted',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    dot: 'bg-emerald-500',
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-500',
  },
  EXPIRED: {
    label: 'Expired',
    bg: 'bg-slate-100',
    text: 'text-slate-500',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
};

export interface QuotationTransitionOption {
  status: QuotationStatus;
  label: string;
  actionClass: string;
}

export const QUOTATION_LEGAL_TRANSITIONS: Record<QuotationStatus, QuotationTransitionOption[]> = {
  CREATED: [
    { status: 'SENT', label: 'Send to Client', actionClass: 'bg-blue-600 hover:bg-blue-700 text-white' },
  ],
  SENT: [
    { status: 'VIEWED', label: 'Mark Viewed', actionClass: 'bg-purple-600 hover:bg-purple-700 text-white' },
    { status: 'ACCEPTED', label: 'Accept', actionClass: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { status: 'REJECTED', label: 'Reject', actionClass: 'bg-rose-600 hover:bg-rose-700 text-white' },
    { status: 'EXPIRED', label: 'Expire', actionClass: 'bg-slate-600 hover:bg-slate-700 text-white' },
    { status: 'REVISED', label: 'Revise', actionClass: 'bg-amber-600 hover:bg-amber-700 text-white' },
  ],
  VIEWED: [
    { status: 'ACCEPTED', label: 'Accept', actionClass: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { status: 'REJECTED', label: 'Reject', actionClass: 'bg-rose-600 hover:bg-rose-700 text-white' },
    { status: 'EXPIRED', label: 'Expire', actionClass: 'bg-slate-600 hover:bg-slate-700 text-white' },
    { status: 'REVISED', label: 'Revise', actionClass: 'bg-amber-600 hover:bg-amber-700 text-white' },
  ],
  REVISED: [
    { status: 'SENT', label: 'Send Revised', actionClass: 'bg-blue-600 hover:bg-blue-700 text-white' },
  ],
  ACCEPTED: [],
  REJECTED: [],
  EXPIRED: [],
};
