import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AdminUser, Role, CreateUserPayload } from '../types/api.types';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Users,
  UserCheck,
  UserX,
  X,
  AlertTriangle,
  Eye,
  EyeOff,
  Settings,
  Trash2,
} from 'lucide-react';

const ALL_ROLES: Role[] = ['ADMIN', 'DGM', 'AGM', 'MANAGER', 'EMPLOYEE'];
const SUPERVISOR_ROLES: Role[] = ['ADMIN', 'DGM', 'AGM', 'MANAGER'];
const MANAGER_FILTER_ROLES: Role[] = ['DGM', 'AGM', 'MANAGER'];

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedManagerId, setSelectedManagerId] = useState<string>('ALL');

  // "Add User" Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateUserPayload>({
    name: '',
    email: '',
    password: '',
    role: 'EMPLOYEE',
    supervisorId: '',
  });
  const [showModalPassword, setShowModalPassword] = useState<boolean>(false);

  // Deactivate Confirmation Modal State
  const [confirmingUser, setConfirmingUser] = useState<AdminUser | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Delete Confirmation Modal State
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState<boolean>(false);

  // System Settings State
  const [allowEmployeeReassignment, setAllowEmployeeReassignment] = useState<boolean>(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState<boolean>(false);
  const [isUpdatingSettings, setIsUpdatingSettings] = useState<boolean>(false);

  const fetchSettings = useCallback(async (): Promise<void> => {
    setIsLoadingSettings(true);
    try {
      const s = await api.settings.get();
      setAllowEmployeeReassignment(s.allowEmployeeReassignment);
    } catch (err) {
      console.error('Failed to load system settings:', err);
    } finally {
      setIsLoadingSettings(false);
    }
  }, []);

  const handleToggleForwarding = async (): Promise<void> => {
    const nextVal = !allowEmployeeReassignment;
    setIsUpdatingSettings(true);
    try {
      const updated = await api.settings.update({ allowEmployeeReassignment: nextVal });
      setAllowEmployeeReassignment(updated.allowEmployeeReassignment);
      setSuccessMessage(`Employee enquiry forwarding ${nextVal ? 'enabled' : 'disabled'} successfully.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update system settings');
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const fetchUsers = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.users.list();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user list.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
    void fetchSettings();
  }, [fetchUsers, fetchSettings]);

  // Supervisors pool: active users with manager/admin roles
  const supervisorCandidates = users.filter(
    (u) => u.isActive && SUPERVISOR_ROLES.includes(u.role),
  );

  // Managers pool: users holding MANAGER/AGM/DGM roles for hierarchy filter
  const managerFilterCandidates = useMemo(
    () => users.filter((u) => MANAGER_FILTER_ROLES.includes(u.role)),
    [users],
  );

  // Compute all direct and indirect subordinate IDs for selected manager
  const subordinateIdsForSelectedManager = useMemo(() => {
    if (selectedManagerId === 'ALL') return null;
    const ids = new Set<string>([selectedManagerId]);
    let added = true;
    while (added) {
      added = false;
      for (const u of users) {
        if (u.supervisorId && ids.has(u.supervisorId) && !ids.has(u.id)) {
          ids.add(u.id);
          added = true;
        }
      }
    }
    return ids;
  }, [selectedManagerId, users]);

  // Filtered users list
  const filteredUsers = users.filter((u) => {
    // Hierarchy filter: manager + direct & indirect subordinates
    if (subordinateIdsForSelectedManager && !subordinateIdsForSelectedManager.has(u.id)) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchesName = u.name.toLowerCase().includes(q);
      const matchesEmail = u.email.toLowerCase().includes(q);
      if (!matchesName && !matchesEmail) return false;
    }

    // Role filter
    if (selectedRole !== 'ALL' && u.role !== selectedRole) {
      return false;
    }

    // Status filter
    if (selectedStatus === 'ACTIVE' && !u.isActive) return false;
    if (selectedStatus === 'INACTIVE' && u.isActive) return false;

    return true;
  });

  // Metrics
  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.isActive).length;
  const inactiveUsers = totalUsers - activeUsers;

  // Handle Add User Form Submission
  const handleAddUserSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setModalError(null);

    if (formData.name.trim().length < 2) {
      setModalError('Name must be at least 2 characters long.');
      return;
    }
    if (!formData.email.includes('@')) {
      setModalError('Please enter a valid email address.');
      return;
    }
    if (formData.password.length < 10) {
      setModalError('Password must be at least 10 characters long.');
      return;
    }

    setIsSubmittingUser(true);
    try {
      await api.users.create({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
        supervisorId: formData.role === 'EMPLOYEE' && formData.supervisorId ? formData.supervisorId : null,
      });

      setSuccessMessage(`User "${formData.name}" has been created successfully.`);
      setIsAddModalOpen(false);
      setShowModalPassword(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'EMPLOYEE',
        supervisorId: '',
      });
      await fetchUsers();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Failed to create user account.');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  // Handle Deactivate/Reactivate Action
  const handleToggleStatus = async (targetUser: AdminUser): Promise<void> => {
    if (targetUser.id === currentUser?.id && targetUser.isActive) {
      setError('You cannot deactivate your own administrative account.');
      return;
    }

    // If currently active, require explicit modal confirmation
    if (targetUser.isActive) {
      setConfirmingUser(targetUser);
      return;
    }

    // Reactivate directly
    await executeStatusChange(targetUser.id, true);
  };

  const executeStatusChange = async (userId: string, newActiveStatus: boolean): Promise<void> => {
    setIsUpdatingStatus(true);
    setError(null);
    try {
      await api.users.setStatus(userId, newActiveStatus);
      setSuccessMessage(
        newActiveStatus
          ? 'User account has been reactivated successfully.'
          : 'User account deactivated and all active sessions terminated.',
      );
      setConfirmingUser(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user status.');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const executeDeleteUser = async (): Promise<void> => {
    if (!deletingUser) return;
    setIsDeletingUser(true);
    setError(null);
    try {
      await api.users.delete(deletingUser.id);
      setSuccessMessage(`User "${deletingUser.name}" was permanently deleted successfully.`);
      setDeletingUser(null);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user.');
      setDeletingUser(null);
    } finally {
      setIsDeletingUser(false);
    }
  };

  const getRoleBadgeClass = (role: Role): string => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'DGM':
      case 'AGM':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'MANAGER':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'EMPLOYEE':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-600 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-50 border border-purple-200 text-purple-700">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                User Management
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Provision users, assign supervisory hierarchies, and manage account authorization.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => void fetchUsers()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setModalError(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add User</span>
          </button>
        </div>
      </div>

      {/* Notifications / Feedback */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-700">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-red-500 hover:text-red-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* System Settings & Permissions Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 transition-all">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Allow Employee-to-Employee Enquiry Forwarding
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    allowEmployeeReassignment
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {allowEmployeeReassignment ? 'ACTIVE' : 'DISABLED'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                When enabled, active employees can forward their assigned enquiries directly to peer active employees. Forwarding up the hierarchy to Managers or Admins is strictly prohibited.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => void handleToggleForwarding()}
              disabled={isUpdatingSettings || isLoadingSettings}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden disabled:opacity-50 ${
                allowEmployeeReassignment ? 'bg-brand-600' : 'bg-slate-300'
              }`}
            >
              <span className="sr-only">Toggle employee forwarding</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                  allowEmployeeReassignment ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
            <span className="text-xs font-semibold text-slate-700 min-w-[55px]">
              {allowEmployeeReassignment ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Users
            </span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{totalUsers}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Active Accounts
            </span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{activeUsers}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Deactivated
            </span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{inactiveUsers}</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Employees
            </span>
            <Users className="w-4 h-4 text-brand-500" />
          </div>
          <p className="text-2xl font-black text-brand-700 mt-2">
            {users.filter((u) => u.role === 'EMPLOYEE').length}
          </p>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Role Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="ALL">All Roles</option>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Manager (Admin Hierarchy Drill-down) */}
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-brand-600 shrink-0" />
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-brand-200 text-brand-900 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              title="Filter by Manager hierarchy tree"
            >
              <option value="ALL">All Teams / Everyone</option>
              {managerFilterCandidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Deactivated Only</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedRole('ALL');
                setSelectedStatus('ALL');
                setSelectedManagerId('ALL');
              }}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer text-center"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            System Users ({filteredUsers.length})
          </h2>
        </div>

        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="w-6 h-6 text-brand-600 animate-spin mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-medium">Loading user directory...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No users matched your filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Supervisor</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredUsers.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  const initials = u.name
                    ? u.name
                        .split(' ')
                        .map((p) => p[0])
                        .slice(0, 2)
                        .join('')
                        .toUpperCase()
                    : 'U';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/75 transition-colors">
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 text-purple-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <Link
                                to={`/team/${u.id}`}
                                className={`font-bold hover:underline ${
                                  ['ADMIN', 'DGM', 'AGM', 'MANAGER'].includes(u.role)
                                    ? 'text-brand-600 hover:text-brand-800'
                                    : 'text-slate-900 hover:text-brand-600'
                                }`}
                                title={
                                  ['ADMIN', 'DGM', 'AGM', 'MANAGER'].includes(u.role)
                                    ? 'View manager profile & team breakdown'
                                    : 'View employee profile'
                                }
                              >
                                {u.name}
                              </Link>
                              {isSelf && (
                                <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                                  You
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono block">
                              {u.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getRoleBadgeClass(
                            u.role,
                          )}`}
                        >
                          {u.role}
                        </span>
                      </td>

                      {/* Supervisor */}
                      <td className="py-3.5 px-4">
                        {u.supervisor ? (
                          <div>
                            <Link
                              to={`/team/${u.supervisor.id}`}
                              className="font-semibold text-brand-600 hover:text-brand-800 hover:underline block"
                              title="View supervisor profile & team"
                            >
                              {u.supervisor.name}
                            </Link>
                            <span className="text-[10px] text-slate-400 block">
                              ({u.supervisor.role})
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-600" />
                            Deactivated
                          </span>
                        )}
                      </td>

                      {/* Created Date */}
                      <td className="py-3.5 px-4 text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* Actions Toggle */}
                      <td className="py-3.5 px-4 text-right">
                        {isSelf ? (
                          <span className="text-[11px] text-slate-400 italic">Self (Locked)</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {u.isActive ? (
                              <button
                                type="button"
                                onClick={() => void handleToggleStatus(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                                title="Deactivate user account"
                              >
                                <UserX className="w-3 h-3" />
                                <span>Deactivate</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleToggleStatus(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                                title="Reactivate user account"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Reactivate</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setDeletingUser(u)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="Permanently delete user account"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* "Add User" Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand-600" />
                <h3 className="font-bold text-slate-900 text-sm">Create New CRM User</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleAddUserSubmit(e)} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Priya Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="priya@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Initial Password
                </label>
                <div className="relative">
                  <input
                    type={showModalPassword ? 'text' : 'password'}
                    required
                    placeholder="Min 10 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full pl-3 pr-10 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowModalPassword(!showModalPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                    aria-label={showModalPassword ? 'Hide password' : 'Show password'}
                  >
                    {showModalPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Must be at least 10 characters.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value as Role;
                      setFormData({
                        ...formData,
                        role: newRole,
                        // Reset supervisor if switching away from Employee
                        supervisorId: newRole === 'EMPLOYEE' ? formData.supervisorId : '',
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-white"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Supervisor {formData.role !== 'EMPLOYEE' && '(N/A)'}
                  </label>
                  <select
                    disabled={formData.role !== 'EMPLOYEE'}
                    value={formData.supervisorId || ''}
                    onChange={(e) => setFormData({ ...formData, supervisorId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none bg-white disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <option value="">No Supervisor (Direct)</option>
                    {supervisorCandidates.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.name} ({sup.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingUser}
                  className="px-4 py-2 text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSubmittingUser && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivation Confirmation Modal */}
      {confirmingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Deactivate User Account?</h3>
                <p className="text-xs text-slate-500">
                  Target: <span className="font-semibold text-slate-800">{confirmingUser.name}</span> ({confirmingUser.email})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Deactivating this account will <strong>immediately revoke all active refresh tokens</strong>. 
              The user will be immediately signed out and blocked from logging in until an Administrator reactivates the account.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmingUser(null)}
                disabled={isUpdatingStatus}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeStatusChange(confirmingUser.id, false)}
                disabled={isUpdatingStatus}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isUpdatingStatus && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Deactivation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Permanently Delete User?</h3>
                <p className="text-xs text-slate-500">
                  Target: <span className="font-semibold text-slate-800">{deletingUser.name}</span> ({deletingUser.email})
                </p>
              </div>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed bg-rose-50/50 p-3 rounded-xl border border-rose-200/80 space-y-2">
              <p>
                <strong>Warning:</strong> This action is <strong>permanent</strong> and cannot be undone. 
                The user account, notifications, and login sessions will be purged immediately.
              </p>
              <p className="text-[11px] text-slate-500">
                Note: If this user already has historical audit records (such as logged activities or status changes), the system will prevent deletion to preserve audit integrity and recommend deactivation instead.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                disabled={isDeletingUser}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void executeDeleteUser()}
                disabled={isDeletingUser}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeletingUser && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUsersPage;
