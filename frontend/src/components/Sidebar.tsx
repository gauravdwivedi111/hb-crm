import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Users,
  FileText,
  PhoneCall,
  CheckSquare,
  BarChart3,
  Search,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();
  const isManager = Boolean(user && ['ADMIN', 'DGM', 'AGM', 'MANAGER'].includes(user.role));
  const isAdmin = Boolean(user && user.role === 'ADMIN');

  const navLinkClasses = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${
      isActive
        ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
    }`;

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between py-6 px-4 hidden md:flex shrink-0">
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
            Main Menu
          </p>
          <nav className="space-y-1">
            <NavLink to="/dashboard" className={navLinkClasses}>
              <LayoutDashboard className="w-4 h-4 text-brand-600" />
              <span>Personal Dashboard</span>
            </NavLink>

            <NavLink to="/enquiries" className={navLinkClasses}>
              <FileText className="w-4 h-4 text-brand-600" />
              <span>Enquiries</span>
            </NavLink>

            <NavLink to="/search" className={navLinkClasses}>
              <Search className="w-4 h-4 text-brand-600" />
              <span>Global Search</span>
            </NavLink>

            {/* Manager+ Dedicated Section */}
            {isManager && (
              <>
                <div className="pt-4 pb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3">
                    Management
                  </p>
                </div>

                <NavLink to="/team" className={navLinkClasses}>
                  <Users className="w-4 h-4 text-brand-600" />
                  <span>Team Dashboard</span>
                </NavLink>

                <NavLink to="/reports" className={navLinkClasses}>
                  <BarChart3 className="w-4 h-4 text-brand-600" />
                  <span>Performance Reports</span>
                </NavLink>

                <NavLink to="/import" className={navLinkClasses}>
                  <UploadCloud className="w-4 h-4 text-brand-600" />
                  <span>Import Enquiries</span>
                </NavLink>
              </>
            )}

            {/* Admin Only Section */}
            {isAdmin && (
              <>
                <div className="pt-4 pb-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3">
                    Administration
                  </p>
                </div>

                <NavLink to="/admin/users" className={navLinkClasses}>
                  <ShieldCheck className="w-4 h-4 text-purple-600" />
                  <span>User Management</span>
                </NavLink>
              </>
            )}

            {/* Other modules (subordinate/enquiry linked) */}
            <div className="pt-4 pb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3">
                Entities
              </p>
            </div>

            <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 select-none">
              <Users className="w-4 h-4" />
              <span>Customers</span>
            </div>

            <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 select-none">
              <PhoneCall className="w-4 h-4" />
              <span>Follow-ups</span>
            </div>

            <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-400 select-none">
              <CheckSquare className="w-4 h-4" />
              <span>Quotations</span>
            </div>
          </nav>
        </div>
      </div>

      {/* Backend connection status */}
      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-slate-700">API Connected</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          Port 5001 • {isManager ? 'Manager' : 'Employee'} Mode
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
