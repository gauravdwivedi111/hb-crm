import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { SearchResultItem } from '../types/api.types';
import {
  Search,
  Users,
  FileText,
  Phone,
  Mail,
  Building,
  ArrowRight,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export const SearchResultsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawQuery = searchParams.get('q') || '';

  const [searchInput, setSearchInput] = useState<string>(rawQuery);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Sync input when URL parameter changes
  useEffect(() => {
    setSearchInput(rawQuery);
  }, [rawQuery]);

  const performSearch = useCallback(async (queryStr: string): Promise<void> => {
    if (!queryStr.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await api.search.query(queryStr.trim());
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search request failed.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void performSearch(rawQuery);
  }, [rawQuery, performSearch]);

  const handleSearchSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (searchInput.trim()) {
      setSearchParams({ q: searchInput.trim() });
    }
  };

  const customerResults = results.filter((r) => r.type === 'CUSTOMER');
  const enquiryResults = results.filter((r) => r.type === 'ENQUIRY');

  // Helper to highlight matching text
  const highlightMatch = (text: string | null | undefined, query: string): React.ReactNode => {
    if (!text) return null;
    if (!query || !query.trim()) return text;

    const qClean = query.trim();
    const index = text.toLowerCase().indexOf(qClean.toLowerCase());
    if (index === -1) return text;

    const before = text.slice(0, index);
    const match = text.slice(index, index + qClean.length);
    const after = text.slice(index + qClean.length);

    return (
      <>
        {before}
        <mark className="bg-amber-200 text-slate-900 rounded-xs px-0.5 font-bold">
          {match}
        </mark>
        {after}
      </>
    );
  };

  const renderScoreBadge = (score: number) => {
    if (score >= 100) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
          Exact Match
        </span>
      );
    }
    if (score >= 50) {
      return (
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          Prefix Match
        </span>
      );
    }
    return (
      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
        Keyword Match
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header & In-Page Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Global Search</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Search across scoped Customers, Enquiries, Contact Numbers, and Products.
          </p>
        </div>

        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by customer name, phone number, email, company, product..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Search
          </button>
        </form>

        {rawQuery && (
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
            <span>
              Showing results for <span className="font-bold text-slate-900">"{rawQuery}"</span>
            </span>
            <span className="font-semibold text-slate-700">{results.length} results found</span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
          <div className="h-64 bg-white rounded-2xl border border-slate-200" />
          <div className="h-64 bg-white rounded-2xl border border-slate-200" />
        </div>
      )}

      {/* Results or Empty State */}
      {!isLoading && rawQuery && results.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900">No matching records found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            We couldn't find any customers or enquiries matching "{rawQuery}". Check your spelling or try searching by phone number or company.
          </p>
        </div>
      )}

      {!isLoading && results.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Group 1: Customers */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-brand-600" />
                <h2 className="text-sm font-bold text-slate-900">Customers</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                {customerResults.length}
              </span>
            </div>

            {customerResults.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No customer records matched.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {customerResults.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/enquiries?search=${encodeURIComponent(c.phone || c.title || '')}`)}
                    className="py-3.5 hover:bg-slate-50/80 rounded-xl px-2.5 transition-colors cursor-pointer space-y-1.5 group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-900 text-sm group-hover:text-brand-600 transition-colors">
                        {highlightMatch(c.title, rawQuery)}
                      </p>
                      {renderScoreBadge(c.score)}
                    </div>

                    {c.subtitle && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{highlightMatch(c.subtitle, rawQuery)}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                      <div className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{highlightMatch(c.phone || '—', rawQuery)}</span>
                      </div>
                      {c.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{highlightMatch(c.email, rawQuery)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-brand-600 font-semibold group-hover:underline">
                      <span>View customer enquiries</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group 2: Enquiries */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4 p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-600" />
                <h2 className="text-sm font-bold text-slate-900">Enquiries</h2>
              </div>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                {enquiryResults.length}
              </span>
            </div>

            {enquiryResults.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">No enquiry records matched.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {enquiryResults.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => navigate(`/enquiries/${e.id}`)}
                    className="py-3.5 hover:bg-slate-50/80 rounded-xl px-2.5 transition-colors cursor-pointer space-y-1.5 group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-slate-900 text-sm group-hover:text-purple-600 transition-colors">
                        {highlightMatch(e.title, rawQuery)}
                      </p>
                      <div className="flex items-center gap-1.5">
                        {e.metadata?.status ? (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                            {String(e.metadata.status)}
                          </span>
                        ) : null}
                        {renderScoreBadge(e.score)}
                      </div>
                    </div>

                    {e.subtitle && (
                      <p className="text-xs text-slate-600">
                        {highlightMatch(e.subtitle, rawQuery)}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                      <div className="flex items-center gap-1 font-mono">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{highlightMatch(e.phone || '—', rawQuery)}</span>
                      </div>
                      {e.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-slate-400" />
                          <span>{highlightMatch(e.email, rawQuery)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-purple-600 font-semibold group-hover:underline">
                      <span>Open enquiry details</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchResultsPage;
