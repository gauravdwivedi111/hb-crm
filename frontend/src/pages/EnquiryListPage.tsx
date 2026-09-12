import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import {
  Enquiry,
  EnquiryStatus,
  Priority,
  Role,
  User,
  CreateEnquiryPayload,
  EnquiriesPaginationMeta,
} from '../types/api.types';
import { useAuth } from '../context/AuthContext';
import { StatusBadge, PriorityBadge } from '../components/StatusBadge';
import { STATUS_METADATA } from '../utils/statusMetadata';
import {
  Search,
  Plus,
  Filter,
  User as UserIcon,
  Calendar,
  Clock,
  Phone,
  Building,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  AlertCircle,
  FileText,
  UploadCloud,
} from 'lucide-react';

const MANAGER_ROLES: Role[] = ['ADMIN', 'DGM', 'AGM', 'MANAGER'];

export const EnquiryListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManagerPlus = Boolean(user && MANAGER_ROLES.includes(user.role));

  // Data state
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [meta, setMeta] = useState<EnquiriesPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedStatuses, setSelectedStatuses] = useState<EnquiryStatus[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<Priority | ''>('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Team members for Manager+ filter & assignment
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  // New Enquiry Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateEnquiryPayload>({
    customer: {
      name: '',
      phone: '',
      email: '',
      companyName: '',
      location: '',
      notes: '',
    },
    companyName: '',
    phone: '',
    email: '',
    location: '',
    source: 'WEBSITE',
    product: '',
    priority: 'MEDIUM',
    expectedValue: '',
    remarks: '',
    assignedToId: '',
  });

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load team members if Manager+
  useEffect(() => {
    if (isManagerPlus) {
      void api.dashboard
        .getTeamDashboard()
        .then((metrics) => {
          const users = metrics.map((m) => m.user);
          setTeamMembers(users);
        })
        .catch((err) => {
          console.error('Failed to load team members:', err);
        });
    }
  }, [isManagerPlus]);

  // Fetch enquiries
  const fetchEnquiries = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.enquiries.list({
        page: currentPage,
        limit: 10,
        search: debouncedSearch || undefined,
        status: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
        priority: selectedPriority || undefined,
        assignedToId: isManagerPlus && selectedAssignee ? selectedAssignee : undefined,
      });

      // If multiple statuses selected in UI, filter client-side if backend only takes 1 status
      let filtered = res.enquiries;
      if (selectedStatuses.length > 1) {
        filtered = filtered.filter((e) => selectedStatuses.includes(e.status));
      }

      setEnquiries(filtered);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch enquiries.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, selectedStatuses, selectedPriority, selectedAssignee, isManagerPlus]);

  useEffect(() => {
    void fetchEnquiries();
  }, [fetchEnquiries]);

  // Toggle status filter pill
  const toggleStatusFilter = (status: EnquiryStatus): void => {
    setCurrentPage(1);
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  };

  const clearAllFilters = (): void => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedStatuses([]);
    setSelectedPriority('');
    setSelectedAssignee('');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    Boolean(debouncedSearch) ||
    selectedStatuses.length > 0 ||
    Boolean(selectedPriority) ||
    Boolean(selectedAssignee);

  // Handle Form Change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>): void => {
    const { name, value } = e.target;
    setFormData((prev) => {
      if (name.startsWith('customer.')) {
        const field = name.split('.')[1];
        return {
          ...prev,
          customer: {
            ...prev.customer!,
            [field]: value,
          },
          // Keep top-level phone/company/email in sync if updated
          ...(field === 'phone' ? { phone: value } : {}),
          ...(field === 'companyName' ? { companyName: value } : {}),
          ...(field === 'email' ? { email: value } : {}),
          ...(field === 'location' ? { location: value } : {}),
        };
      }
      return { ...prev, [name]: value };
    });
  };

  // Submit New Enquiry
  const handleCreateSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!formData.customer?.name.trim() || !formData.customer?.phone.trim()) {
      setCreateError('Customer Name and Phone are required.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      const payload: CreateEnquiryPayload = {
        customer: {
          name: formData.customer.name.trim(),
          phone: formData.customer.phone.trim(),
          email: formData.customer.email?.trim() || null,
          companyName: formData.customer.companyName?.trim() || null,
          location: formData.customer.location?.trim() || null,
        },
        phone: formData.customer.phone.trim(),
        email: formData.customer.email?.trim() || undefined,
        companyName: formData.customer.companyName?.trim() || undefined,
        location: formData.customer.location?.trim() || undefined,
        product: formData.product?.trim() || undefined,
        source: formData.source?.trim() || undefined,
        priority: formData.priority,
        expectedValue: formData.expectedValue ? Number(formData.expectedValue) : undefined,
        remarks: formData.remarks?.trim() || undefined,
        assignedToId: isManagerPlus && formData.assignedToId ? formData.assignedToId : undefined,
      };

      const created = await api.enquiries.create(payload);
      setIsModalOpen(false);
      // Reset form
      setFormData({
        customer: { name: '', phone: '', email: '', companyName: '', location: '', notes: '' },
        companyName: '',
        phone: '',
        email: '',
        location: '',
        source: 'WEBSITE',
        product: '',
        priority: 'MEDIUM',
        expectedValue: '',
        remarks: '',
        assignedToId: '',
      });
      // Navigate to detail page
      navigate(`/enquiries/${created.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create enquiry.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Enquiries</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {isManagerPlus ? 'All team leads & incoming enquiries' : 'Your assigned enquiry pipeline'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void fetchEnquiries()}
            className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-slate-600 transition-colors shadow-sm cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {isManagerPlus && (
            <button
              onClick={() => navigate('/import')}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-xs transition-colors cursor-pointer"
              title="Bulk import enquiries from CSV"
            >
              <UploadCloud className="w-4 h-4 text-brand-600" />
              <span>Import CSV</span>
            </button>
          )}
          <button
            onClick={() => {
              setCreateError(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Enquiry</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer, company, phone, product..."
              className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Priority Filter */}
          <div className="w-full md:w-44">
            <select
              value={selectedPriority}
              onChange={(e) => {
                setSelectedPriority(e.target.value as Priority | '');
                setCurrentPage(1);
              }}
              className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            >
              <option value="">All Priorities</option>
              <option value="URGENT">Urgent</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>

          {/* Team Member Filter (Manager+ only) */}
          {isManagerPlus && (
            <div className="w-full md:w-52">
              <select
                value={selectedAssignee}
                onChange={(e) => {
                  setSelectedAssignee(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              >
                <option value="">All Team Members</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-xs text-rose-600 hover:text-rose-700 font-semibold px-3 py-2 shrink-0 cursor-pointer"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Status Filter Multi-Select Pills */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
            <Filter className="w-3 h-3" />
            Status:
          </span>
          {(Object.keys(STATUS_METADATA) as EnquiryStatus[]).map((status) => {
            const isSelected = selectedStatuses.includes(status);
            const meta = STATUS_METADATA[status];
            return (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatusFilter(status)}
                className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all border cursor-pointer ${
                  isSelected
                    ? `${meta.bg} ${meta.text} ${meta.border} ring-2 ring-brand-500/30 shadow-sm font-bold`
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-3 text-sm text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => void fetchEnquiries()}
            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* Enquiries Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4 animate-pulse">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : enquiries.length === 0 ? (
          /* Empty State */
          <div className="text-center py-16 px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No enquiries found</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
              {hasActiveFilters
                ? 'No records match your selected filters or search query.'
                : 'There are no active enquiries in your pipeline yet.'}
            </p>
            {hasActiveFilters ? (
              <button
                onClick={clearAllFilters}
                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Clear all filters
              </button>
            ) : (
              <button
                onClick={() => setIsModalOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Create your first enquiry
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4 sm:px-6">Customer & Company</th>
                  <th className="py-3.5 px-4">Phone</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Priority</th>
                  {isManagerPlus && <th className="py-3.5 px-4">Assigned To</th>}
                  <th className="py-3.5 px-4">Next Follow-up</th>
                  <th className="py-3.5 px-4 sm:px-6">Last Contact</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {enquiries.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => navigate(`/enquiries/${item.id}`)}
                    className="hover:bg-brand-50/40 transition-colors cursor-pointer group"
                  >
                    {/* Customer Name & Company */}
                    <td className="py-4 px-4 sm:px-6">
                      <div className="font-semibold text-slate-900 group-hover:text-brand-700 transition-colors">
                        {item.customer?.name || item.companyName || 'Unnamed Lead'}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                        {item.companyName || item.customer?.companyName ? (
                          <span className="flex items-center gap-1">
                            <Building className="w-3 h-3 text-slate-400" />
                            {item.companyName || item.customer?.companyName}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Individual</span>
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
                    <td className="py-4 px-4 text-slate-700 font-mono text-xs">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{item.phone}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <StatusBadge status={item.status} size="sm" />
                    </td>

                    {/* Priority */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <PriorityBadge priority={item.priority} size="sm" />
                    </td>

                    {/* Assigned Employee (Manager+ only) */}
                    {isManagerPlus && (
                      <td className="py-4 px-4 whitespace-nowrap">
                        {item.assignedTo ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-700">
                              {item.assignedTo.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-slate-800">
                              {item.assignedTo.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Unassigned</span>
                        )}
                      </td>
                    )}

                    {/* Next Follow-up */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      {item.nextFollowupAt ? (
                        <div className="text-xs text-slate-700 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-blue-500" />
                          <span>
                            {new Date(item.nextFollowupAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>

                    {/* Last Contact */}
                    <td className="py-4 px-4 sm:px-6 whitespace-nowrap">
                      {item.lastContactedAt ? (
                        <div className="text-xs text-slate-600 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {new Date(item.lastContactedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Never</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {meta.totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{enquiries.length}</span> of{' '}
              <span className="font-semibold text-slate-900">{meta.total}</span> enquiries
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium">
                Page {meta.page} of {meta.totalPages}
              </span>
              <button
                disabled={currentPage >= meta.totalPages}
                onClick={() => setCurrentPage((p) => Math.min(meta.totalPages, p + 1))}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New Enquiry Creation Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Create New Enquiry</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record new incoming sales lead details and contact information.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateSubmit} className="p-6 space-y-6">
              {createError && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Customer Contact Section */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Customer Information
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      required
                      name="customer.name"
                      value={formData.customer?.name || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. Anand Verma"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Primary Phone *
                    </label>
                    <input
                      type="text"
                      required
                      name="customer.phone"
                      value={formData.customer?.phone || ''}
                      onChange={handleInputChange}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      name="customer.email"
                      value={formData.customer?.email || ''}
                      onChange={handleInputChange}
                      placeholder="anand@company.com"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Company Name
                    </label>
                    <input
                      type="text"
                      name="customer.companyName"
                      value={formData.customer?.companyName || ''}
                      onChange={handleInputChange}
                      placeholder="Apex Industries Ltd"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      City / Location
                    </label>
                    <input
                      type="text"
                      name="customer.location"
                      value={formData.customer?.location || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. Mumbai, Maharashtra"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Enquiry Details Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Enquiry Specification
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Product / Requirement
                    </label>
                    <input
                      type="text"
                      name="product"
                      value={formData.product || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. 100kW Rooftop Solar Plant"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Lead Source
                    </label>
                    <select
                      name="source"
                      value={formData.source || 'WEBSITE'}
                      onChange={handleInputChange}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    >
                      <option value="WEBSITE">Website Form</option>
                      <option value="INBOUND_CALL">Inbound Call</option>
                      <option value="REFERRAL">Referral</option>
                      <option value="EXHIBITION">Exhibition / Expo</option>
                      <option value="COLD_OUTREACH">Cold Outreach</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Priority Level
                    </label>
                    <select
                      name="priority"
                      value={formData.priority || 'MEDIUM'}
                      onChange={handleInputChange}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Expected Value (INR ₹)
                    </label>
                    <input
                      type="number"
                      name="expectedValue"
                      value={formData.expectedValue || ''}
                      onChange={handleInputChange}
                      placeholder="e.g. 4500000"
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>

                  {/* Assign To (Manager+ Only — hidden for Employee) */}
                  {isManagerPlus && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                        <UserIcon className="w-3.5 h-3.5 text-brand-600" />
                        <span>Assign To Employee</span>
                        <span className="text-[10px] text-slate-400 font-normal">
                          (Defaults to you if unassigned)
                        </span>
                      </label>
                      <select
                        name="assignedToId"
                        value={formData.assignedToId || ''}
                        onChange={handleInputChange}
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                      >
                        <option value="">Assign to me / default</option>
                        {teamMembers.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name} — {member.email} ({member.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Initial Remarks & Customer Requirements
                    </label>
                    <textarea
                      rows={3}
                      name="remarks"
                      value={formData.remarks || ''}
                      onChange={handleInputChange}
                      placeholder="Enter customer conversation notes or technical requirements..."
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Enquiry</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnquiryListPage;