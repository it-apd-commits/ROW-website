import { useState } from 'react';
import { X, Upload, CheckCircle, AlertCircle, Info, AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { importServices, type ServiceImportSummary } from '@/services/importService';
import { downloadServiceImportTemplate, exportServiceImportErrors } from '@/utils/serviceImportTemplate';
import { auditService } from '@/services/auditService';

interface ImportServicesModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function ImportServicesModal({ isOpen, onClose, onSuccess }: ImportServicesModalProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isExportingErrors, setIsExportingErrors] = useState(false);
    const [summary, setSummary] = useState<ServiceImportSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setError(null);
            setSummary(null);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) {
            if (!dropped.name.toLowerCase().endsWith('.xlsx')) {
                setError('Only .xlsx files are supported.');
                return;
            }
            setFile(dropped);
            setError(null);
            setSummary(null);
        }
    };

    const handleImport = async () => {
        if (!file) return;
        setIsImporting(true);
        setError(null);
        try {
            const result = await importServices(file);
            setSummary(result);
            if (result.imported > 0) {
                onSuccess();
                auditService.log('SERVICE_BULK_IMPORTED', {
                    imported: result.imported,
                    errors: result.errors,
                    file_name: file.name,
                });
                if (navigator.onLine) {
                    import('@/lib/syncService').then(({ SyncService }) => {
                        SyncService.syncPendingRecords().catch(console.error);
                    });
                }
            }
        } catch (err) {
            setError((err as Error).message || 'Import failed. Please check the file format.');
        } finally {
            setIsImporting(false);
        }
    };

    const handleDownloadErrors = async () => {
        if (!summary?.errorRows.length) return;
        setIsExportingErrors(true);
        try {
            await exportServiceImportErrors(summary.errorRows);
        } finally {
            setIsExportingErrors(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setSummary(null);
        setError(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Bulk Import Services</h2>
                    <button onClick={handleClose} disabled={isImporting} className="p-1 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6">
                    {!summary ? (
                        <div className="space-y-6">
                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex gap-3 text-sm text-blue-700">
                                <Info size={20} className="shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold mb-1 text-blue-800">Upload Requirements:</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>File format: <strong>.xlsx (Excel)</strong></li>
                                        <li>Required columns: <strong>FILE_NUMBER, STATUS, SCHEDULE_DATE, START_DATE, LOCATION_CODE, SERVICE_CODE, SERVICE_PROVIDER_CODE, MODE_OF_SERVICE, FOLLOW_UP_NUMBER, TOTAL_MINUTES</strong></li>
                                        <li>FILE_NUMBER must match an existing beneficiary in the system.</li>
                                        <li>Dates format: <strong>DD-MM-YYYY</strong></li>
                                        <li>Download the template below — it includes dropdowns and a Reference sheet.</li>
                                    </ul>
                                </div>
                            </div>

                            <div
                                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer ${file ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary'}`}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDrop}
                                onClick={() => document.getElementById('service-import-upload')?.click()}
                            >
                                <Upload size={48} className={`mb-4 ${file ? 'text-primary' : 'text-gray-400'}`} />
                                <p className="text-sm font-medium text-gray-700 text-center">
                                    {file ? file.name : 'Click to upload or drag and drop Excel file'}
                                </p>
                                <p className="text-xs text-text-muted mt-1">.xlsx files only</p>
                                <input
                                    type="file"
                                    id="service-import-upload"
                                    className="hidden"
                                    accept=".xlsx"
                                    onChange={handleFileChange}
                                />
                            </div>

                            {error && (
                                <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex gap-2 text-sm text-red-600 animate-in slide-in-from-top-2">
                                    <AlertCircle size={18} className="shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="flex justify-between items-center pt-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadServiceImportTemplate(); }}
                                    className="text-xs font-bold text-primary hover:underline"
                                >
                                    Download Template
                                </button>
                                <div className="flex gap-3">
                                    <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                                        Cancel
                                    </Button>
                                    <Button
                                        onClick={handleImport}
                                        disabled={!file || isImporting}
                                        className="px-8"
                                    >
                                        {isImporting ? 'Importing...' : 'Start Import'}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex flex-col items-center text-center">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${summary.imported > 0 ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                                    {summary.imported > 0 ? <CheckCircle size={32} /> : <AlertTriangle size={32} />}
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">Import Complete</h3>
                                <p className="text-sm text-text-muted">
                                    {summary.imported > 0
                                        ? `${summary.imported} service${summary.imported === 1 ? '' : 's'} saved and will sync when online.`
                                        : 'No new records were imported.'}
                                </p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Total Rows</p>
                                    <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                    <p className="text-xs font-medium text-green-700 uppercase tracking-wider">Imported</p>
                                    <p className="text-2xl font-bold text-green-900">{summary.imported}</p>
                                </div>
                                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                    <p className="text-xs font-medium text-red-700 uppercase tracking-wider">Errors</p>
                                    <p className="text-2xl font-bold text-red-900">{summary.errors}</p>
                                </div>
                            </div>

                            {summary.errors > 0 && (
                                <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                                    <p className="text-xs font-bold text-red-700 uppercase tracking-wider mb-2">
                                        {summary.errors} row{summary.errors === 1 ? '' : 's'} failed — download the error report, fix the data, and re-upload.
                                    </p>
                                    <Button
                                        onClick={handleDownloadErrors}
                                        disabled={isExportingErrors}
                                        className="w-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
                                    >
                                        <Download size={16} />
                                        {isExportingErrors ? 'Generating...' : 'Download Error Report (.xlsx)'}
                                    </Button>
                                </div>
                            )}

                            <Button className="w-full py-6 text-lg" onClick={handleClose}>
                                Close
                            </Button>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
