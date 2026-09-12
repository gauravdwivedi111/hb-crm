import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { ImportEnquiriesResult } from '../types/api.types';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Info,
  X,
} from 'lucide-react';

const CSV_TEMPLATE_CONTENT = `Customer Name,Company,Phone,Email,Location,Source,Product,Priority,Expected Value,Remarks,Assigned To
Rajesh Kumar,Acme Industrial Supplies,9876543210,rajesh@acmeind.com,Mumbai,Website,Enterprise CRM,HIGH,500000,Interested in annual contract,
Anita Desai,Zenith Logistics,9823012345,anita@zenithlogistics.in,Pune,Trade Show,Inventory Tracking,MEDIUM,150000,Met at logistics expo,
Suresh Patel,Deccan Infotech,9811002233,suresh@deccaninfo.com,Bengaluru,Cold Call,Cloud Security,LOW,75000,Requires security audit,
`;

export const ImportEnquiriesPage: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportEnquiriesResult | null>(null);

  const handleDownloadTemplate = (): void => {
    const blob = new Blob([CSV_TEMPLATE_CONTENT], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'hb_crm_enquiries_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (file: File | null): void => {
    setUploadError(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      setUploadError('Invalid file format. Please upload a standard comma-separated .csv file.');
      setSelectedFile(null);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File size exceeds the 10MB limit.');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleUpload = async (): Promise<void> => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      const result = await api.import.enquiries(selectedFile);
      setImportResult(result);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'CSV import failed. Please check the file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = (): void => {
    setSelectedFile(null);
    setImportResult(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <UploadCloud className="w-6 h-6 text-brand-600" />
            Bulk Import Enquiries
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload a CSV spreadsheet to bulk-load leads and customers. Fault-tolerant with automatic deduplication.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-brand-600" />
            Download CSV Template
          </button>
          <button
            type="button"
            onClick={() => navigate('/enquiries')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            Go to Pipeline
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Guidelines & Column Mapping Reference */}
      <div className="bg-brand-50/60 border border-brand-100 rounded-2xl p-4 sm:p-5 text-xs text-brand-950 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-brand-900 text-sm">
          <Info className="w-4 h-4 text-brand-600 shrink-0" />
          CSV Import Format & Rules
        </div>
        <p className="text-brand-800 leading-relaxed">
          The importer is case-insensitive and tolerant of common header variations. Customers are deduplicated by phone number.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-2">
          <div className="bg-white/80 p-2.5 rounded-xl border border-brand-200/50">
            <span className="font-bold text-slate-900">Phone (Required):</span>
            <span className="text-slate-600 ml-1">Contact number; used for customer deduplication.</span>
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-brand-200/50">
            <span className="font-bold text-slate-900">Priority (Optional):</span>
            <span className="text-slate-600 ml-1"><code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">LOW</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">MEDIUM</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">HIGH</code>.</span>
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-brand-200/50">
            <span className="font-bold text-slate-900">Expected Value:</span>
            <span className="text-slate-600 ml-1">Estimated deal value (numbers, e.g. <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px]">500000</code>).</span>
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-brand-200/50">
            <span className="font-bold text-slate-900">Assigned To (Optional):</span>
            <span className="text-slate-600 ml-1">Subordinate employee's email or full name.</span>
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-brand-200/50">
            <span className="font-bold text-slate-900">Batch Limit:</span>
            <span className="text-slate-600 ml-1">Maximum 500 rows per file for optimal performance.</span>
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-brand-200/50">
            <span className="font-bold text-slate-900">Privacy & Storage:</span>
            <span className="text-slate-600 ml-1">Processed in-memory and discarded; never stored.</span>
          </div>
        </div>
      </div>

      {/* Main Upload Card */}
      {!importResult ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-6 sm:p-8 space-y-6">
          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer select-none ${
              isDragging
                ? 'border-brand-500 bg-brand-50/50 scale-[0.99]'
                : selectedFile
                  ? 'border-emerald-400 bg-emerald-50/30'
                  : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)}
            />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${
                  selectedFile
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-brand-50 text-brand-600'
                }`}
              >
                {selectedFile ? (
                  <FileSpreadsheet className="w-7 h-7" />
                ) : (
                  <UploadCloud className="w-7 h-7" />
                )}
              </div>

              {selectedFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-bold text-slate-900">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500">
                    {(selectedFile.size / 1024).toFixed(1)} KB • Click or drag to replace
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">
                    Drop your CSV file here, or{' '}
                    <span className="text-brand-600 underline font-bold">browse</span>
                  </p>
                  <p className="text-xs text-slate-400">Supported format: .csv (up to 500 rows, 10MB)</p>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {uploadError && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-700 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-red-900">Import Validation Error</p>
                <p className="mt-0.5 leading-relaxed">{uploadError}</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadError(null)}
                className="text-red-400 hover:text-red-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-between pt-2">
            {selectedFile ? (
              <button
                type="button"
                onClick={handleReset}
                disabled={isUploading}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Clear file
              </button>
            ) : <div />}

            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!selectedFile || isUploading}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-semibold shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing CSV...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-4 h-4" />
                  <span>Upload and Import</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Results View */
        <div className="space-y-6">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Rows</p>
              <p className="text-3xl font-extrabold text-slate-900 mt-2">{importResult.totalRows}</p>
              <p className="text-xs text-slate-400 mt-1">Processed from CSV</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-xs bg-emerald-50/20">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Imported</p>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-3xl font-extrabold text-emerald-700 mt-2">{importResult.imported}</p>
              <p className="text-xs text-emerald-600 mt-1">Successfully saved to database</p>
            </div>

            <div
              className={`p-5 rounded-2xl border shadow-xs ${
                importResult.skipped > 0
                  ? 'bg-amber-50/30 border-amber-200'
                  : 'bg-slate-50/50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <p
                  className={`text-xs font-semibold uppercase tracking-wider ${
                    importResult.skipped > 0 ? 'text-amber-700' : 'text-slate-500'
                  }`}
                >
                  Skipped / Errors
                </p>
                {importResult.skipped > 0 && <XCircle className="w-4 h-4 text-amber-600" />}
              </div>
              <p
                className={`text-3xl font-extrabold mt-2 ${
                  importResult.skipped > 0 ? 'text-amber-700' : 'text-slate-700'
                }`}
              >
                {importResult.skipped}
              </p>
              <p className="text-xs text-slate-400 mt-1">Failed validation or duplicate rule</p>
            </div>
          </div>

          {/* Success Banner if all or partial imported */}
          {importResult.imported > 0 && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <p className="text-xs sm:text-sm font-medium text-emerald-900">
                  {importResult.imported} enquiries were created with full audit logging and customer deduplication.
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/enquiries')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
              >
                View Pipeline
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Error Breakdown Table (Readable, not just JSON) */}
          {importResult.errors.length > 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 sm:px-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Error Breakdown</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Review specific rows that failed validation to correct your CSV spreadsheet.
                  </p>
                </div>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                  {importResult.errors.length} Issue{importResult.errors.length > 1 ? 's' : ''}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100 text-xs">
                  <thead className="bg-slate-50/75">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600 w-28">Row #</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-600">Validation Failure Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {importResult.errors.map((err, idx) => (
                      <tr key={idx} className="hover:bg-amber-50/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">
                          Row {err.row}
                        </td>
                        <td className="px-4 py-3 text-red-600 font-medium">
                          {err.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs text-center space-y-1">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900">Flawless Import</p>
              <p className="text-xs text-slate-500">Every single row in your CSV was imported without any errors.</p>
            </div>
          )}

          {/* Reset Action */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Import Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportEnquiriesPage;
