import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import {
  Enquiry,
  EnquiryStatus,
  Priority,
  Role,
  User,
  CreateEnquiryPayload,
  EnquiriesPaginationMeta,
  GstLookupData,
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
  Download,
  Loader2,
  ChevronDown,
  Check,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Info,
} from 'lucide-react';
import { parseGSTIN, openGstPortal } from '../utils/gstUtils';

const MANAGER_ROLES: Role[] = ['ADMIN', 'DGM', 'AGM', 'MANAGER'];

export const EnquiryListPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isManagerPlus = Boolean(user && MANAGER_ROLES.includes(user.role));

  // URL search params
  const [searchParams, setSearchParams] = useSearchParams();
  const urlCustomerId = searchParams.get('customerId') || '';
  const urlSearch = searchParams.get('search') || '';

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
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(urlCustomerId);
  const [customerFilterLabel, setCustomerFilterLabel] = useState<string>(urlSearch);
  const [searchQuery, setSearchQuery] = useState<string>(urlCustomerId ? '' : urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState<string>(urlCustomerId ? '' : urlSearch);
  const [selectedStatuses, setSelectedStatuses] = useState<EnquiryStatus[]>([]);
  const [selectedPriority, setSelectedPriority] = useState<Priority | ''>('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Team members for Manager+ filter & assignment
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  // Export state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const [exportBanner, setExportBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleExport = async (exportAll: boolean = false): Promise<void> => {
    setIsExportMenuOpen(false);
    setIsExporting(true);
    setExportBanner(null);
    try {
      const filterParams = exportAll
        ? {}
        : {
            status: selectedStatuses.length === 1 ? selectedStatuses[0] : undefined,
            priority: selectedPriority || undefined,
            assignedToId: selectedAssignee || undefined,
            customerId: selectedCustomerId || undefined,
            search: debouncedSearch || undefined,
          };

      await api.enquiries.exportCsv(filterParams);
      setExportBanner({
        type: 'success',
        message: exportAll
          ? 'Complete enquiry database exported successfully to CSV.'
          : 'Filtered enquiries exported successfully to CSV.',
      });
      setTimeout(() => setExportBanner(null), 4000);
    } catch (err) {
      setExportBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to export enquiries.',
      });
      setTimeout(() => setExportBanner(null), 5000);
    } finally {
      setIsExporting(false);
    }
  };

  // New Enquiry Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [gstCopiedToast, setGstCopiedToast] = useState<boolean>(false);
  const [isFetchingLiveGst, setIsFetchingLiveGst] = useState<boolean>(false);
  const [liveGstData, setLiveGstData] = useState<GstLookupData | null>(null);
  const [liveGstMessage, setLiveGstMessage] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);

  const [formData, setFormData] = useState<CreateEnquiryPayload>({
    customer: {
      name: '',
      phone: '',
      email: '',
      companyName: '',
      location: '',
      gstNumber: '',
      notes: '',
    },
    companyName: '',
    phone: '',
    email: '',
    location: '',
    gstNumber: '',
    source: 'WEBSITE',
    product: '',
    priority: 'MEDIUM',
    expectedValue: '',
    remarks: '',
    assignedToId: '',
  });

  const handleVerifyGst = async (gstin: string): Promise<void> => {
    await openGstPortal(gstin);
    setGstCopiedToast(true);
    setTimeout(() => setGstCopiedToast(false), 3500);
  };

  const handleAutoFillGstLocation = (stateName: string): void => {
    setFormData((prev) => ({
      ...prev,
      location: stateName,
      customer: {
        ...prev.customer!,
        location: stateName,
      },
    }));
  };

  const handleAutoFetchLiveGst = async (gstin: string): Promise<void> => {
    const clean = gstin?.trim().toUpperCase();
    if (!clean || clean.length !== 15) return;
    setIsFetchingLiveGst(true);
    setLiveGstMessage(null);

    try {
      const res = await api.enquiries.lookupGst(clean);
      setLiveGstData(res);

      if (res.configured && res.success) {
        const businessName = res.legalName || res.tradeName || '';
        const fullAddress = res.fullAddress || res.state || '';

        setFormData((prev) => ({
          ...prev,
          companyName: businessName || prev.companyName,
          location: fullAddress || prev.location,
          customer: {
            ...prev.customer!,
            companyName: businessName || prev.customer?.companyName || '',
            location: fullAddress || prev.customer?.location || '',
            name: prev.customer?.name?.trim() ? prev.customer.name : (res.tradeName || businessName || ''),
          },
        }));

        setLiveGstMessage({
          type: 'success',
          text: `Auto-filled details for "${businessName}" from official records!`,
        });
      } else if (!res.configured) {
        setLiveGstMessage({
          type: 'info',
          text: res.message || 'RAPIDAPI_KEY is not configured on the server yet. To enable 1-click live auto-fetch, set RAPIDAPI_KEY in your Render environment variables.',
        });
      } else {
        setLiveGstMessage({
          type: 'error',
          text: res.message || 'Could not fetch details for this GSTIN.',
        });
      }
    } catch (err) {
      setLiveGstMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to connect to live GST verification service.',
      });
    } finally {
      setIsFetchingLiveGst(false);
    }
  };

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Sync URL search parameters if changed from outside (e.g. navigation, Navbar search)
  useEffect(() => {
    const cId = searchParams.get('customerId') || '';
    const sQuery = searchParams.get('search') || '';
    if (cId !== selectedCustomerId) {
      setSelectedCustomerId(cId);
      if (sQuery) {
        setCustomerFilterLabel(sQuery);
      } else {
        setCustomerFilterLabel('');
      }
      setCurrentPage(1);
    } else if (!cId && sQuery && sQuery !== searchQuery) {
      setSearchQuery(sQuery);
      setDebouncedSearch(sQuery);
      setCurrentPage(1);
    }
  }, [searchParams]);

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
        customerId: selectedCustomerId || undefined,
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

      // Auto-detect customer label if not set yet
      if (selectedCustomerId && !customerFilterLabel && filtered.length > 0) {
        const match = filtered.find((e) => e.customerId === selectedCustomerId);
        if (match?.customer?.name) {
          setCustomerFilterLabel(match.customer.name);
        } else if (match?.companyName) {
          setCustomerFilterLabel(match.companyName);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch enquiries.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, debouncedSearch, selectedCustomerId, selectedStatuses, selectedPriority, selectedAssignee, isManagerPlus, customerFilterLabel]);

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

  const clearCustomerFilter = (): void => {
    setSelectedCustomerId('');
    setCustomerFilterLabel('');
    const next = new URLSearchParams(searchParams);
    next.delete('customerId');
    next.delete('search');
    setSearchParams(next);
    setCurrentPage(1);
  };

  const clearAllFilters = (): void => {
    setSearchQuery('');
    setDebouncedSearch('');
    setSelectedStatuses([]);
    setSelectedPriority('');
    setSelectedAssignee('');
    setSelectedCustomerId('');
    setCustomerFilterLabel('');
    setSearchParams({});
    setCurrentPage(1);
  };

  const hasActiveFilters =
    Boolean(debouncedSearch) ||
    Boolean(selectedCustomerId) ||
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
          ...(field === 'gstNumber' ? { gstNumber: value.toUpperCase().replace(/[^0-9A-Z]/g, '') } : {}),
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
      const cleanGst = formData.customer.gstNumber?.trim().toUpperCase() || undefined;
      const payload: CreateEnquiryPayload = {
        customer: {
          name: formData.customer.name.trim(),
          phone: formData.customer.phone.trim(),
          email: formData.customer.email?.trim() || null,
          companyName: formData.customer.companyName?.trim() || null,
          location: formData.customer.location?.trim() || null,
          gstNumber: cleanGst || null,
        },
        phone: formData.customer.phone.trim(),
        email: formData.customer.email?.trim() || undefined,
        companyName: formData.customer.companyName?.trim() || undefined,
        location: formData.customer.location?.trim() || undefined,
        gstNumber: cleanGst,
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
        customer: { name: '', phone: '', email: '', companyName: '', location: '', gstNumber: '', notes: '' },
        companyName: '',
        phone: '',
        email: '',
        location: '',
        gstNumber: '',
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

          {/* Export CSV Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                if (hasActiveFilters) {
                  setIsExportMenuOpen(!isExportMenuOpen);
                } else {
                  void handleExport(true);
                }
              }}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-60"
              title="Export complete enquiries to CSV"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-emerald-600" />
              )}
              <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
              {hasActiveFilters && <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30">
                <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Export Options
                </div>
                <button
                  type="button"
                  onClick={() => void handleExport(false)}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">Export Current View</span>
                    <span className="text-xs text-slate-500">Filtered ({meta.total} enquiries)</span>
                  </div>
                  <Download className="w-4 h-4 text-slate-400" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport(true)}
                  className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer border-t border-slate-100"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">Export All Enquiries</span>
                    <span className="text-xs text-slate-500">Entire accessible database</span>
                  </div>
                  <Download className="w-4 h-4 text-emerald-600" />
                </button>
              </div>
            )}
          </div>

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

      {/* Export Notification Banner */}
      {exportBanner && (
        <div
          className={`p-3.5 rounded-xl text-sm font-medium flex items-center justify-between shadow-xs transition-all ${
            exportBanner.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {exportBanner.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{exportBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setExportBanner(null)}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

        {/* Customer Scoped Filter Banner */}
        {selectedCustomerId && (
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-blue-50/80 border border-blue-200/90 rounded-xl px-3.5 py-2.5 text-xs text-blue-900 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold px-2 py-0.5 rounded-md bg-blue-600 text-white uppercase tracking-wider text-[10px] shrink-0">
                Customer Scoped
              </span>
              <span>
                Showing enquiries for customer:{' '}
                <strong className="font-extrabold text-blue-950">
                  {customerFilterLabel || enquiries[0]?.customer?.name || 'Customer'}
                </strong>
                {customerFilterLabel && enquiries[0]?.customer?.companyName && enquiries[0].customer.companyName !== customerFilterLabel && (
                  <span className="text-blue-700 ml-1">({enquiries[0].customer.companyName})</span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={clearCustomerFilter}
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:bg-blue-100/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-blue-200"
            >
              <X className="w-3.5 h-3.5" />
              <span>Show All Customers</span>
            </button>
          </div>
        )}
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
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 group-hover:text-brand-700 transition-colors">
                          {item.customer?.name || item.companyName || 'Unnamed Lead'}
                        </span>
                        {item.customerId && item.customerId !== selectedCustomerId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomerId(item.customerId!);
                              setCustomerFilterLabel(item.customer?.name || item.companyName || '');
                              setSearchParams({ customerId: item.customerId!, search: item.customer?.name || item.companyName || '' });
                              setCurrentPage(1);
                            }}
                            className="hidden group-hover:inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded transition-colors"
                            title="Filter all enquiries by this customer"
                          >
                            All Deals
                          </button>
                        )}
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

                  {/* GST Number Field */}
                  <div className="sm:col-span-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <label className="block text-xs font-semibold text-slate-700">
                          GST Number (Optional)
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">15-digit GSTIN</span>
                      </div>

                      {/* Live Auto-Fetch Button (Enabled when 15 characters entered) */}
                      {formData.customer?.gstNumber && formData.customer.gstNumber.length === 15 && (
                        <button
                          type="button"
                          onClick={() => void handleAutoFetchLiveGst(formData.customer?.gstNumber || '')}
                          disabled={isFetchingLiveGst}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-all shadow-xs cursor-pointer disabled:opacity-60"
                          title="Fetch Legal Name, Trade Name & Principal Address from Government Database"
                        >
                          {isFetchingLiveGst ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Fetching Details...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                              <span>⚡ Auto-Fetch Full Business Details</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type="text"
                        name="customer.gstNumber"
                        maxLength={15}
                        value={formData.customer?.gstNumber || ''}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, '');
                          setFormData((prev) => ({
                            ...prev,
                            gstNumber: val,
                            customer: {
                              ...prev.customer!,
                              gstNumber: val,
                            },
                          }));
                          if (val.length !== 15) {
                            setLiveGstMessage(null);
                          }
                        }}
                        placeholder="e.g. 27AAACA1234A1Z5"
                        className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 text-slate-900 uppercase"
                      />
                      {Boolean(formData.customer?.gstNumber) && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400 font-mono">
                          {formData.customer?.gstNumber?.length}/15
                        </span>
                      )}
                    </div>

                    {/* Live Fetch Feedback Notification */}
                    {liveGstMessage && (
                      <div
                        className={`mt-2 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                          liveGstMessage.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : liveGstMessage.type === 'info'
                            ? 'bg-sky-50 border-sky-200 text-sky-900'
                            : 'bg-red-50 border-red-200 text-red-900'
                        }`}
                      >
                        {liveGstMessage.type === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        ) : liveGstMessage.type === 'info' ? (
                          <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        )}
                        <span className="leading-relaxed">{liveGstMessage.text}</span>
                      </div>
                    )}

                    {/* Live Data Card (When Legal Name / Trade Name / Address returned) */}
                    {liveGstData?.configured && liveGstData?.success && liveGstData.legalName && (
                      <div className="mt-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Verified Taxpayer Records
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase tracking-wide ${
                              liveGstData.status?.toLowerCase() === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            ● {liveGstData.status || 'Active'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                          <div>
                            <span className="text-[10px] font-semibold text-slate-400 block">Legal Business Name</span>
                            <span className="font-bold text-slate-900">{liveGstData.legalName}</span>
                          </div>
                          {liveGstData.tradeName && liveGstData.tradeName !== liveGstData.legalName && (
                            <div>
                              <span className="text-[10px] font-semibold text-slate-400 block">Trade Name</span>
                              <span className="font-medium text-slate-800">{liveGstData.tradeName}</span>
                            </div>
                          )}
                          {liveGstData.fullAddress && (
                            <div className="sm:col-span-2">
                              <span className="text-[10px] font-semibold text-slate-400 block">Principal Place of Business</span>
                              <span className="text-slate-800 leading-relaxed">{liveGstData.fullAddress}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Offline Validation & Action Card */}
                    {Boolean(formData.customer?.gstNumber) && (() => {
                      const gstParsed = parseGSTIN(formData.customer?.gstNumber || '');
                      if (gstParsed.isValid) {
                        return (
                          <div className="mt-2.5 p-3 rounded-xl bg-emerald-50/90 border border-emerald-200 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-2xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>{gstParsed.stateName}</span>
                              </div>
                              <span className="text-emerald-300">•</span>
                              <span className="text-emerald-700 font-medium">{gstParsed.entityType}</span>
                              <span className="text-emerald-300">•</span>
                              <span className="font-mono text-emerald-900 bg-emerald-100/70 px-1.5 py-0.5 rounded text-[11px]">
                                PAN: {gstParsed.pan}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {formData.customer?.location !== gstParsed.stateName && !liveGstData?.fullAddress && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoFillGstLocation(gstParsed.stateName || '')}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] transition-colors cursor-pointer shadow-2xs"
                                  title="Auto-fill City / Location with detected State"
                                >
                                  Auto-fill State
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleVerifyGst(gstParsed.normalized)}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100/70 font-semibold text-[11px] transition-colors cursor-pointer shadow-2xs"
                                title="Copy GST and open official government portal"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{gstCopiedToast ? 'Copied & Opened!' : 'Verify on GST Portal ↗'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (formData.customer?.gstNumber?.length === 15 && !gstParsed.isChecksumValid) {
                        return (
                          <div className="mt-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-900">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Typo detected in checksum digit. Please verify characters.</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleVerifyGst(formData.customer?.gstNumber || '')}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 hover:underline cursor-pointer shrink-0"
                            >
                              <ExternalLink className="w-3 h-3 text-amber-700" />
                              <span>Check Portal ↗</span>
                            </button>
                          </div>
                        );
                      }

                      return (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {formData.customer?.gstNumber?.length}/15 characters • Enter full 15-digit GSTIN to auto-fetch details
                        </p>
                      );
                    })()}
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