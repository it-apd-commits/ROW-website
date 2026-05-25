import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import {
    Clock,
    MapPin,
    Stethoscope,
    Search,
    RefreshCw,
    Download,
    Users,
    ShieldCheck,
    History as HistoryIcon,
    Edit,
    Trash2,
    Loader2,
    WifiOff,
    Wifi,
    CloudOff,
    CloudCheck,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { ServiceEntry } from '@/types/serviceEntry';

interface ExtendedServiceRecord extends ServiceEntry {
    beneficiary?: {
        name: string;
    };
    isOffline?: boolean;
    sync_status?: 'pending' | 'synced' | 'failed';
}

export function ServiceHistoryPage() {
    const [services, setServices] = useState<ExtendedServiceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');

    const navigate = useNavigate();
    const { canEditRecords, canDeleteRecords, canExportData } = usePermissions();
    const showActions = canEditRecords || canDeleteRecords;
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const isOnline = useOnlineStatus();

    const fetchHistory = useCallback(async () => {
        setIsLoading(true);
        try {
            let serverEntries: ExtendedServiceRecord[] = [];

            if (isOnline) {
                try {
                    const { data: entries, error: entriesError } = await supabase
                        .from('service_entries')
                        .select('*')
                        .order('schedule_date', { ascending: false });

                    if (entriesError) throw entriesError;

                    if (entries && entries.length > 0) {
                        const fileNumbers = Array.from(new Set(entries.map((e: ServiceEntry) => e.file_number))).filter(Boolean) as string[];

                        // bMap: stored file_number -> beneficiary name
                        // fnMap: stored file_number -> real file_number (when stored value is a token/UUID)
                        const bMap = new Map<string, string>();
                        const fnMap = new Map<string, string>();

                        if (fileNumbers.length > 0) {
                            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                            const isOfflineToken = (fn: string) => fn.startsWith('OFF-') || fn.startsWith('import-');
                            const uuidRefs = fileNumbers.filter(fn => uuidPattern.test(fn));
                            const offTokenRefs = fileNumbers.filter(fn => isOfflineToken(fn));
                            const realFileNums = fileNumbers.filter(fn => !uuidPattern.test(fn) && !isOfflineToken(fn));

                            if (realFileNums.length > 0) {
                                const { data: byFileNum } = await supabase
                                    .from('beneficiaries')
                                    .select('name, file_number')
                                    .in('file_number', realFileNums);
                                byFileNum?.forEach((b: { name: string; file_number: string | null }) => {
                                    if (b.file_number) bMap.set(b.file_number, b.name);
                                });
                            }

                            // Beneficiaries without a file_number are referenced by their Supabase id
                            if (uuidRefs.length > 0) {
                                const { data: byId } = await supabase
                                    .from('beneficiaries')
                                    .select('id, name, file_number')
                                    .in('id', uuidRefs);
                                byId?.forEach((b: { id: string; name: string; file_number: string | null }) => {
                                    bMap.set(b.id, b.name);
                                    if (b.file_number) fnMap.set(b.id, b.file_number);
                                });
                            }

                            // Offline-token entries: beneficiary synced but file_number not yet assigned
                            if (offTokenRefs.length > 0) {
                                const { data: byToken } = await supabase
                                    .from('beneficiaries')
                                    .select('offline_token, name, file_number')
                                    .in('offline_token', offTokenRefs);
                                byToken?.forEach((b: { offline_token: string; name: string; file_number: string | null }) => {
                                    bMap.set(b.offline_token, b.name);
                                    if (b.file_number) fnMap.set(b.offline_token, b.file_number);
                                });
                            }

                            // Fallback: legacy entries stored the beneficiary name as file_number
                            const notFound = fileNumbers.filter(fn => !bMap.has(fn));
                            if (notFound.length > 0) {
                                const { data: byName } = await supabase
                                    .from('beneficiaries')
                                    .select('name')
                                    .in('name', notFound);
                                byName?.forEach((b: { name: string }) => {
                                    bMap.set(b.name, b.name);
                                });
                            }
                        }

                        serverEntries = entries.map((item: ServiceEntry) => {
                            const storedFn = item.file_number ?? '';
                            return {
                                ...item,
                                file_number: fnMap.get(storedFn) ?? item.file_number,
                                beneficiary: { name: bMap.get(storedFn) || 'Beneficiary Not Found' }
                            };
                        });
                    }
                } catch (serverErr) {
                    console.error('[ServiceHistory] Server fetch failed, showing local records only:', serverErr);
                }
            }

            // Always merge local pending/failed records — runs even if Supabase fetch failed
            const localPending = await db.service_entries
                .where('sync_status')
                .anyOf(['pending', 'failed'])
                .toArray();

            // Look up real beneficiary names from Dexie for offline-token entries
            const offlineTokens = [...new Set(
                localPending
                    .filter(r => r.file_number?.startsWith('OFF-') || r.file_number?.startsWith('import-'))
                    .map(r => r.file_number!)
            )];
            const dexieNameMap = new Map<string, string>();
            if (offlineTokens.length > 0) {
                const dexieBeneficiaries = await db.beneficiaries
                    .where('offline_token').anyOf(offlineTokens).toArray();
                dexieBeneficiaries.forEach(b => dexieNameMap.set(b.offline_token, b.name));
            }

            const syncedOfflineIds = new Set(serverEntries.map(s => (s as ExtendedServiceRecord & { offline_id?: string }).offline_id).filter(Boolean));

            const offlineEntries: ExtendedServiceRecord[] = localPending
                .filter(r => !syncedOfflineIds.has(r.offline_id))
                .map(r => ({
                    id: `offline-${r.id}`,
                    status: r.status,
                    file_number: r.file_number,
                    schedule_date: r.schedule_date,
                    start_date: r.start_date,
                    end_date: r.end_date,
                    location_code: r.location_code,
                    service_code: r.service_code,
                    service_provider_code: r.service_provider_code,
                    recommendation: r.recommendation,
                    contribution: r.contribution,
                    balance: r.balance,
                    total: r.total,
                    outcome: r.outcome,
                    outcome_description: r.outcome_description,
                    receipt_no: r.receipt_no,
                    total_hours: r.total_hours,
                    custom_field2: r.custom_field2,
                    mode_of_service: r.mode_of_service,
                    custom_field4: r.custom_field4,
                    custom_field5: r.custom_field5,
                    remarks: r.remarks,
                    created_at: r.created_at,
                    updated_at: r.created_at,
                    beneficiary: { name: dexieNameMap.get(r.file_number ?? '') || r.file_number || 'Unknown' },
                    isOffline: true,
                    sync_status: r.sync_status
                }));

            setServices([...offlineEntries, ...serverEntries]);
        } catch (error) {
            console.error('Error fetching service history:', error);
        } finally {
            setIsLoading(false);
        }
    }, [isOnline]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Live cross-device sync: refetch when any device writes a service entry
    // or beneficiary (names are joined from the beneficiaries table).
    useRealtimeSync({
        tables: ['service_entries', 'beneficiaries'],
        onChange: fetchHistory,
    });

    const filteredServices = services.filter(s => {
        const matchesSearch =
            (s.beneficiary?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.file_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.service_code || '').toLowerCase().includes(searchTerm.toLowerCase());

        const serviceDate = (s.schedule_date || '').slice(0, 10);
        const matchesFrom = !fromDate || serviceDate >= fromDate;
        const matchesTo = !toDate || serviceDate <= toDate;

        return matchesSearch && matchesFrom && matchesTo;
    });

    const uniqueBeneficiaryCount = new Set(filteredServices.map(s => s.file_number)).size;

    const handleExport = async () => {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Service History');

        worksheet.columns = [
            { header: 'Service ID', key: 'id', width: 36 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'File Number', key: 'file_number', width: 15 },
            { header: 'Beneficiary Name', key: 'beneficiary_name', width: 25 },
            { header: 'Schedule Date', key: 'schedule_date', width: 15 },
            { header: 'Start Date', key: 'start_date', width: 15 },
            { header: 'End Date', key: 'end_date', width: 15 },
            { header: 'Location Code', key: 'location_code', width: 15 },
            { header: 'Service Code', key: 'service_code', width: 15 },
            { header: 'Provider', key: 'service_provider_code', width: 20 },
            { header: 'Recommendation', key: 'recommendation', width: 30 },
            { header: 'Contribution', key: 'contribution', width: 12 },
            { header: 'Balance', key: 'balance', width: 12 },
            { header: 'Total', key: 'total', width: 12 },
            { header: 'Outcome', key: 'outcome', width: 15 },
            { header: 'Outcome Desc', key: 'outcome_description', width: 30 },
            { header: 'Receipt No', key: 'receipt_no', width: 15 },
            { header: 'Total Hours', key: 'total_hours', width: 12 },
            { header: 'Mode of Service', key: 'mode_of_service', width: 15 },
            { header: 'Created At', key: 'created_at', width: 20 },
            { header: 'Remarks', key: 'remarks', width: 30 },
            { header: 'Source', key: 'source', width: 15 }
        ];

        filteredServices.forEach(s => {
            worksheet.addRow({
                ...s,
                beneficiary_name: s.beneficiary?.name || 'N/A',
                source: s.remarks === 'Created via Assessment Entry' ? 'Assessment' : 'Service Entry'
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const rangeLabel = fromDate || toDate
            ? `_${fromDate || 'start'}_to_${toDate || 'end'}`
            : '';
        anchor.download = `Service_History_Audit${rangeLabel}_${new Date().toISOString().split('T')[0]}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);
    };

    const handleDelete = async (service: ExtendedServiceRecord) => {
        const name = service.beneficiary?.name || service.file_number;
        const date = new Date(service.schedule_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
        if (!confirm(`Delete service entry for "${name}" on ${date}?\n\nService: ${service.service_code}\nThis action cannot be undone.`)) return;

        setDeletingId(service.id);
        try {
            const { error } = await supabase
                .from('service_entries')
                .delete()
                .eq('id', service.id);

            if (error) throw error;
            setServices(prev => prev.filter(s => s.id !== service.id));
        } catch (err) {
            console.error('Delete service error:', err);
            alert('Failed to delete service entry. Please try again.');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                        <HistoryIcon className="text-primary" /> Service History Audit
                    </h1>
                    <p className="text-text-muted text-sm mt-1">Review and audit all 21 fields of service entry records.</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-end">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${isOnline ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                        {isOnline ? <><Wifi size={14} /> <span className="uppercase tracking-wider">Online</span></> : <><WifiOff size={14} /> <span className="uppercase tracking-wider">Offline</span></>}
                    </div>
                    <Button variant="secondary" onClick={fetchHistory} className="bg-white">
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                    {canExportData && (
                        <Button onClick={handleExport} className="flex items-center gap-2 shadow-lg shadow-primary/20">
                            <Download size={18} /> <span className="hidden sm:inline">Export Audit Excel</span>
                        </Button>
                    )}
                </div>
            </div>

            <Card className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-start gap-4 mb-8">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <Input
                            placeholder="Search by Beneficiary, File Number or Service..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
                            <ShieldCheck size={16} className="text-blue-500" />
                            <span className="text-xs font-bold text-gray-500 uppercase">Filters:</span>
                        </div>
                        <Input
                            type="date"
                            className="w-36 lg:w-40"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                        <span className="text-gray-400">to</span>
                        <Input
                            type="date"
                            className="w-36 lg:w-40"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                        {(searchTerm || fromDate || toDate) && (
                            <button
                                onClick={() => { setSearchTerm(''); setFromDate(''); setToDate(''); }}
                                className="text-xs font-bold text-primary hover:underline px-2"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                </div>

                {!isLoading && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
                        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-primary/10 rounded-xl shrink-0">
                                    <Stethoscope size={18} className="text-primary" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">Total Services</p>
                            </div>
                            <h3 className="text-2xl font-black text-primary">{filteredServices.length}</h3>
                        </div>

                        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-blue-100 rounded-xl shrink-0">
                                    <Users size={18} className="text-blue-600" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">Beneficiaries</p>
                            </div>
                            <h3 className="text-2xl font-black text-blue-700">{uniqueBeneficiaryCount}</h3>
                        </div>

                        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-green-100 rounded-xl shrink-0">
                                    <Clock size={18} className="text-green-600" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">Total Hours</p>
                            </div>
                            <h3 className="text-2xl font-black text-green-700">
                                {filteredServices.reduce((sum, s) => sum + (s.total_hours || 0), 0).toFixed(1)}
                            </h3>
                        </div>

                        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-purple-100 rounded-xl shrink-0">
                                    <MapPin size={18} className="text-purple-600" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">Locations</p>
                            </div>
                            <h3 className="text-2xl font-black text-purple-700">
                                {new Set(filteredServices.map(s => s.location_code)).size}
                            </h3>
                        </div>
                    </div>
                )}

                {isLoading ? (
                    <div className="py-24 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
                        <p className="text-text-muted font-medium">Synchronizing service records...</p>
                    </div>
                ) : filteredServices.length === 0 ? (
                    <div className="py-24 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Clock size={32} className="text-gray-200" />
                        </div>
                        <p className="text-gray-400 font-medium">No service records found for the selected criteria.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto min-w-0 w-full">
                        <table className="w-full min-w-[960px] text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider pl-4">Schedule Date</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Beneficiary (File No)</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Status</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Service & Hours</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Location & Mode</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Source</th>
                                    {showActions && <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider pr-4 text-right">Actions</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredServices.map((service) => (
                                    <tr key={service.id} className="hover:bg-gray-50/50 transition-colors group align-top">
                                        <td className="py-5 pl-4">
                                            <div className="text-sm font-bold text-gray-900 leading-tight">
                                                {new Date(service.schedule_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                Start: {new Date(service.start_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                            </div>
                                        </td>
                                        <td className="py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                                                    {service.beneficiary?.name || 'In-Process...'}
                                                </span>
                                                <span className="text-[11px] font-black text-blue-600 tracking-tight">
                                                    {service.file_number && !service.file_number.startsWith('OFF-') && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(service.file_number)
                                                        ? `#${service.file_number}`
                                                        : 'Not Assigned'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-5">
                                            <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${service.status === 'AVAILED'
                                                ? 'bg-green-100 text-green-700'
                                                : 'bg-amber-100 text-amber-700'
                                                }`}>
                                                {service.status}
                                            </span>
                                        </td>
                                        <td className="py-5">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5 text-sm font-bold text-gray-700 uppercase">
                                                    <Stethoscope size={14} className="text-primary" /> {service.service_code}
                                                </div>
                                                <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1 mt-0.5">
                                                    <Clock size={10} /> {service.total_hours} Hours Spent
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-5">
                                            <div className="flex flex-col">
                                                <div className="text-xs font-bold text-gray-700 flex items-center gap-1.5 uppercase">
                                                    <MapPin size={12} className="text-gray-400" /> {service.location_code}
                                                </div>
                                                <div className="text-[10px] text-primary/60 font-bold bg-primary/5 px-1.5 py-0.5 rounded w-fit mt-1">
                                                    {service.mode_of_service}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-5">
                                            <div className="flex flex-col gap-1">
                                                {service.isOffline ? (
                                                    <span className={`inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${service.sync_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                        <CloudOff size={10} />
                                                        {service.sync_status === 'failed' ? 'Sync Failed' : 'Pending Sync'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold tracking-wider bg-green-50 text-green-700 border border-green-100">
                                                        <CloudCheck size={10} /> Synced
                                                    </span>
                                                )}
                                                {!service.isOffline && (
                                                    <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${service.remarks === 'Created via Assessment Entry' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {service.remarks === 'Created via Assessment Entry' ? 'Assessment' : 'Service Entry'}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {showActions && (
                                            <td className="py-5 pr-4 text-right">
                                                {!service.isOffline && (
                                                    <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                                        {canEditRecords && (
                                                            <Button
                                                                variant="secondary"
                                                                className="h-8 px-2 flex items-center gap-1.5 text-[11px] bg-blue-50 text-blue-600 border-none hover:bg-blue-100"
                                                                onClick={() => navigate(`/services/edit/${service.id}`)}
                                                            >
                                                                <Edit size={14} /> Edit
                                                            </Button>
                                                        )}
                                                        {canDeleteRecords && (
                                                            <Button
                                                                variant="secondary"
                                                                className="h-8 px-2 flex items-center gap-1.5 text-[11px] bg-red-50 text-red-600 border-none hover:bg-red-100"
                                                                onClick={() => handleDelete(service)}
                                                                disabled={deletingId === service.id}
                                                            >
                                                                {deletingId === service.id
                                                                    ? <Loader2 size={14} className="animate-spin" />
                                                                    : <Trash2 size={14} />}
                                                                Delete
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
}
