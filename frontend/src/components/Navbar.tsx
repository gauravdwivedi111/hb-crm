import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { SearchResultItem } from '../types/api.types';
import {
  LogOut,
  ShieldCheck,
  UserCheck,
  Search,
  X,
  FileText,
  Users,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { NotificationBell } from './NotificationBell';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewResults, setPreviewResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setPreviewResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      void api.search
        .query(searchQuery.trim())
        .then((res) => {
          setPreviewResults(res.slice(0, 5));
          setIsDropdownOpen(true);
        })
        .catch((err) => console.error('Navbar search error:', err))
        .finally(() => setIsSearching(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close preview dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setIsDropdownOpen(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleSelectResult = (item: SearchResultItem): void => {
    setIsDropdownOpen(false);
    setSearchQuery('');
    if (item.type === 'ENQUIRY') {
      navigate(`/enquiries/${item.id}`);
    } else {
      navigate(`/enquiries?search=${encodeURIComponent(item.phone || item.title || '')}`);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand */}
          <div
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-3 cursor-pointer select-none shrink-0"
          >
            <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-lg shadow-xs">
              HB
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg tracking-tight">HB CRM</span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase tracking-wider">
                Enterprise
              </span>
            </div>
          </div>

          {/* Central Global Search Bar */}
          <div ref={containerRef} className="relative flex-1 max-w-md mx-4 hidden sm:block">
            <form onSubmit={handleSearchSubmit}>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => {
                    if (previewResults.length > 0) setIsDropdownOpen(true);
                  }}
                  placeholder="Search customers, enquiries, phone..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 focus:bg-white transition-all"
                />
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3 animate-spin" />
                ) : searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setPreviewResults([]);
                      setIsDropdownOpen(false);
                    }}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
            </form>

            {/* Live Search Preview Dropdown */}
            {isDropdownOpen && previewResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden z-50 divide-y divide-slate-100">
                <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
                  {previewResults.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleSelectResult(item)}
                      className="p-2 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-1.5 rounded-lg shrink-0 ${
                            item.type === 'CUSTOMER'
                              ? 'bg-brand-50 text-brand-700'
                              : 'bg-purple-50 text-purple-700'
                          }`}
                        >
                          {item.type === 'CUSTOMER' ? (
                            <Users className="w-3.5 h-3.5" />
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{item.title}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {item.phone} {item.subtitle ? `• ${item.subtitle}` : ''}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </div>
                  ))}
                </div>

                {/* Footer link to dedicated /search */}
                <div
                  onClick={handleSearchSubmit}
                  className="p-2.5 bg-slate-50 text-center text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                  View all results for "{searchQuery}" →
                </div>
              </div>
            )}
          </div>

          {/* Notification Bell, User Profile & Logout */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <NotificationBell />

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-700 font-semibold text-xs">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="text-left hidden sm:block">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-slate-900 leading-none">
                    {user?.name || 'User'}
                  </p>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 flex items-center gap-1 border border-slate-200">
                    {user?.role === 'ADMIN' ? (
                      <ShieldCheck className="w-3 h-3 text-brand-600" />
                    ) : (
                      <UserCheck className="w-3 h-3 text-slate-500" />
                    )}
                    {user?.role}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight mt-1">{user?.email}</p>
              </div>
            </div>

            <button
              onClick={() => void logout()}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
