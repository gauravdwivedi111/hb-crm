import React, { useState, useEffect, useCallback } from 'react';
import {
  Package,
  Search,
  Plus,
  UploadCloud,
  Download,
  Edit2,
  X,
  Loader2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Product, ProductListResponse, BulkProductUpsertResult } from '../types/api.types';

const GST_RATES = [0, 5, 12, 18, 28];

export const ProductListPage: React.FC = () => {
  const { user } = useAuth();
  const isManagerPlus = Boolean(user && ['ADMIN', 'DGM', 'AGM', 'MANAGER'].includes(user.role));

  const [products, setProducts] = useState<Product[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; limit: number; totalPages: number }>({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [brands, setBrands] = useState<{ name: string; count: number }[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);

  // Modals
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState<boolean>(false);

  // Edit / Add Form State
  const [formCode, setFormCode] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formBrand, setFormBrand] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('');
  const [formUnit, setFormUnit] = useState<string>('Pcs');
  const [formPrice, setFormPrice] = useState<string>('');
  const [formMrp, setFormMrp] = useState<string>('');
  const [formTaxRate, setFormTaxRate] = useState<number>(18);
  const [formHsn, setFormHsn] = useState<string>('');
  const [formIsActive, setFormIsActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk Upload State
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [isUploadingBulk, setIsUploadingBulk] = useState<boolean>(false);
  const [bulkResult, setBulkResult] = useState<BulkProductUpsertResult | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  // Notifications
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch product list
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res: ProductListResponse = await api.products.list({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch || undefined,
        brand: selectedBrand !== 'ALL' ? selectedBrand : undefined,
      });
      setProducts(res.products);
      setMeta(res.meta);
      if (res.brands && res.brands.length > 0) {
        setBrands(res.brands);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load product catalog');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, selectedBrand]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  // Open Edit Modal
  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormCode(p.code);
    setFormName(p.name);
    setFormBrand(p.brand || '');
    setFormCategory(p.category || '');
    setFormUnit(p.unit || 'Pcs');
    setFormPrice(String(p.unitPrice));
    setFormMrp(p.mrp ? String(p.mrp) : String(p.unitPrice));
    setFormTaxRate(Number(p.taxRate || 18));
    setFormHsn(p.hsnCode || '');
    setFormIsActive(p.isActive);
    setFormError(null);
    setIsEditModalOpen(true);
  };

  // Open Add Modal
  const handleOpenAdd = () => {
    setFormCode('');
    setFormName('');
    setFormBrand(selectedBrand !== 'ALL' ? selectedBrand : '');
    setFormCategory('');
    setFormUnit('Pcs');
    setFormPrice('');
    setFormMrp('');
    setFormTaxRate(18);
    setFormHsn('');
    setFormIsActive(true);
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSaving(true);
    setFormError(null);
    try {
      await api.products.update(editingProduct.id, {
        name: formName.trim(),
        brand: formBrand.trim() || undefined,
        category: formCategory.trim() || undefined,
        unit: formUnit.trim(),
        unitPrice: parseFloat(formPrice) || 0,
        mrp: formMrp ? parseFloat(formMrp) : undefined,
        taxRate: formTaxRate,
        hsnCode: formHsn.trim() || undefined,
        isActive: formIsActive,
      });
      setIsEditModalOpen(false);
      setSuccessBanner(`Updated ${editingProduct.code} prices and specifications successfully.`);
      setTimeout(() => setSuccessBanner(null), 4000);
      void fetchProducts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update product');
    } finally {
      setIsSaving(false);
    }
  };

  // Save Add
  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      await api.products.create({
        code: formCode.trim(),
        name: formName.trim(),
        brand: formBrand.trim() || undefined,
        category: formCategory.trim() || undefined,
        unit: formUnit.trim(),
        unitPrice: parseFloat(formPrice) || 0,
        mrp: formMrp ? parseFloat(formMrp) : undefined,
        taxRate: formTaxRate,
        hsnCode: formHsn.trim() || undefined,
        isActive: formIsActive,
      });
      setIsAddModalOpen(false);
      setSuccessBanner(`Added new product ${formCode.trim()} to catalog.`);
      setTimeout(() => setSuccessBanner(null), 4000);
      void fetchProducts();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create product');
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk Upload Handler
  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkFile) return;
    setIsUploadingBulk(true);
    setBulkError(null);
    setBulkResult(null);
    try {
      const res = await api.products.bulkUploadCsv(bulkFile);
      setBulkResult(res);
      setSuccessBanner(`Bulk update complete: ${res.updated} updated, ${res.created} new products created.`);
      setTimeout(() => setSuccessBanner(null), 5000);
      void fetchProducts();
    } catch (err) {
      setBulkError(err instanceof Error ? err.message : 'Bulk upload failed');
    } finally {
      setIsUploadingBulk(false);
    }
  };

  const handleExport = async () => {
    try {
      await api.products.exportCsv(selectedBrand !== 'ALL' ? selectedBrand : undefined);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to export CSV');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await api.products.downloadTemplate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to download template');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Package className="w-6 h-6 text-brand-600" />
            <span>Products & Price Master</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Search 2,600+ catalog items across 8 brands, update selling rates in real-time, or bulk import CSV price lists without code.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Download CSV format template for price list update"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            <span>CSV Template</span>
          </button>

          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            title="Export entire current catalog and price list to CSV"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export CSV</span>
          </button>

          {isManagerPlus && (
            <>
              <button
                onClick={() => {
                  setBulkFile(null);
                  setBulkResult(null);
                  setBulkError(null);
                  setIsBulkModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title="Bulk update prices or upload 20k products via CSV"
              >
                <UploadCloud className="w-3.5 h-3.5 text-purple-600" />
                <span>Bulk Update (CSV)</span>
              </button>

              <button
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Product</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Success Notification Banner */}
      {successBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-xs transition-all">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button type="button" onClick={() => setSuccessBanner(null)} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Brand Selector Pills */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-2 overflow-x-auto pb-2">
        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider shrink-0 flex items-center gap-1 mr-1">
          <Building2 className="w-3.5 h-3.5" /> Brands:
        </span>
        <button
          type="button"
          onClick={() => {
            setSelectedBrand('ALL');
            setCurrentPage(1);
          }}
          className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all border cursor-pointer ${
            selectedBrand === 'ALL'
              ? 'bg-brand-600 text-white border-brand-600 shadow-xs font-bold'
              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
          }`}
        >
          All Brands ({meta.total})
        </button>
        {brands.map((b) => (
          <button
            key={b.name}
            type="button"
            onClick={() => {
              setSelectedBrand(b.name);
              setCurrentPage(1);
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all border cursor-pointer ${
              selectedBrand === b.name
                ? 'bg-brand-600 text-white border-brand-600 shadow-xs font-bold'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {b.name} ({b.count})
          </button>
        ))}
      </div>

      {/* Search and Pagination Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product code, name, category, or specs..."
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

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400 font-medium">Per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 font-medium"
          >
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3 animate-pulse">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-rose-600 text-sm">{error}</div>
        ) : products.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Package className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="font-semibold text-slate-700">No products found</p>
            <p className="text-xs text-slate-400 mt-1">Try refining your search query or selecting a different brand.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 w-32">Item Code</th>
                  <th className="py-3 px-4 w-28">Brand</th>
                  <th className="py-3 px-4">Product Name & Specifications</th>
                  <th className="py-3 px-4 w-28">Category</th>
                  <th className="py-3 px-3 text-center w-16">Unit</th>
                  <th className="py-3 px-4 text-right w-28">Selling Price</th>
                  <th className="py-3 px-4 text-right w-24">MRP</th>
                  <th className="py-3 px-3 text-center w-16">GST %</th>
                  <th className="py-3 px-3 text-center w-20">Status</th>
                  <th className="py-3 px-4 text-right w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-800">
                        {p.code}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap">
                      {p.brand ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {p.brand}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{p.name}</div>
                      {p.description && (
                        <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{p.description}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {p.category || '—'}
                      {p.subCategory && <div className="text-[10px] text-slate-400">{p.subCategory}</div>}
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-slate-600 whitespace-nowrap">
                      {p.unit || 'Pcs'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                      ₹{Number(p.unitPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-500 whitespace-nowrap">
                      {p.mrp ? `₹${Number(p.mrp).toLocaleString('en-IN')}` : '—'}
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-slate-600 whitespace-nowrap">
                      {p.taxRate}%
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {p.isActive ? (
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Active" />
                      ) : (
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-300" title="Inactive" />
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {isManagerPlus && (
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(p)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-700 hover:bg-brand-50 transition-colors cursor-pointer"
                          title="Edit price and details"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {meta.totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-900">{products.length}</span> of{' '}
              <span className="font-semibold text-slate-900">{meta.total}</span> products
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

      {/* Modal: Edit Product Price & Specs */}
      {isEditModalOpen && editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-brand-600" />
                <h3 className="text-base font-bold text-slate-900">Edit Price & Product ({formCode})</h3>
              </div>
              <button type="button" onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formMrp}
                    onChange={(e) => setFormMrp(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="Pcs, Kg, Roll..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GST Rate (%)</label>
                  <select
                    value={formTaxRate}
                    onChange={(e) => setFormTaxRate(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">HSN Code</label>
                  <input
                    type="text"
                    value={formHsn}
                    onChange={(e) => setFormHsn(e.target.value)}
                    placeholder="e.g. 38245090"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="editIsActive"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <label htmlFor="editIsActive" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Active in quotation catalog
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Product */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-600" />
                <h3 className="text-base font-bold text-slate-900">Add New Product to Catalog</h3>
              </div>
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSaveAdd} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Item Code / SKU *</label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. KOH-8821"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Brand</label>
                  <input
                    type="text"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="e.g. KOHLER, DR. FIXIT"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Commercial Valve 2 Inch"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Price (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">MRP (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formMrp}
                    onChange={(e) => setFormMrp(e.target.value)}
                    placeholder="e.g. 2000"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit</label>
                  <input
                    type="text"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    placeholder="Pcs, Kg, Roll..."
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">GST Rate (%)</label>
                  <select
                    value={formTaxRate}
                    onChange={(e) => setFormTaxRate(Number(e.target.value))}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  >
                    {GST_RATES.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="e.g. Fittings"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? 'Adding...' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bulk CSV Upload & Price Upsert */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <UploadCloud className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">Bulk Update Prices via CSV</h3>
              </div>
              <button type="button" onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Upload a spreadsheet (.csv) with your updated supplier or product price list. Existing products with matching codes will have their prices updated automatically. New product codes will be inserted into the catalog.
            </p>

            {bulkError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                {bulkError}
              </div>
            )}

            {bulkResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1.5 text-emerald-900">
                <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Bulk Import Finished Successfully!</span>
                </div>
                <div>Total Rows Processed: <span className="font-bold">{bulkResult.totalProcessed}</span></div>
                <div>Existing Products Updated: <span className="font-bold text-blue-700">{bulkResult.updated}</span></div>
                <div>New Products Created: <span className="font-bold text-emerald-700">{bulkResult.created}</span></div>
                {bulkResult.errors.length > 0 && (
                  <div className="text-amber-700 text-[11px] pt-1">
                    Skipped {bulkResult.errors.length} invalid rows.
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleBulkUpload} className="space-y-4 text-xs">
              <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center hover:border-brand-400 transition-colors">
                <FileSpreadsheet className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <label className="block font-semibold text-slate-800 cursor-pointer">
                  <span>{bulkFile ? bulkFile.name : 'Click to select CSV file'}</span>
                  <input
                    type="file"
                    accept=".csv"
                    required
                    onChange={(e) => setBulkFile(e.target.files ? e.target.files[0] : null)}
                    className="hidden"
                  />
                </label>
                <p className="text-[11px] text-slate-400 mt-1">Accepts standard .csv format up to 20,000+ rows</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="text-xs text-brand-600 hover:underline font-semibold"
                >
                  Download sample CSV template
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBulkModalOpen(false)}
                    className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isUploadingBulk || !bulkFile}
                    className="px-4 py-2 font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isUploadingBulk ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <span>Upload & Update Prices</span>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductListPage;
