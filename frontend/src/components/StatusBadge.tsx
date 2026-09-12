import React from 'react';
import { EnquiryStatus, Priority } from '../types/api.types';
import { STATUS_METADATA, PRIORITY_METADATA } from '../utils/statusMetadata';

interface StatusBadgeProps {
  status: EnquiryStatus;
  size?: 'sm' | 'md' | 'lg';
  showDot?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showDot = true,
}) => {
  const meta = STATUS_METADATA[status] || {
    label: status,
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  };

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3.5 py-1.5 font-semibold',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium transition-all ${meta.bg} ${meta.text} ${meta.border} ${sizeClasses[size]}`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />}
      <span>{meta.label}</span>
    </span>
  );
};

interface PriorityBadgeProps {
  priority: Priority;
  size?: 'sm' | 'md';
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  priority,
  size = 'sm',
}) => {
  const meta = PRIORITY_METADATA[priority] || {
    label: priority,
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
  };

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${meta.bg} ${meta.text} ${meta.border} ${sizeClasses[size]}`}
    >
      {meta.label}
    </span>
  );
};

export default StatusBadge;