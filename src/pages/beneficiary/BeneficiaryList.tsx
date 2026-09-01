import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Plus, User, MapPin, Phone, Search, Download, Trash2, CheckSquare, Square, Wifi, WifiOff, CloudOff, CloudCheck, AlertTriangle, FileUp } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { exportBeneficiariesToExcel } from '@/utils/beneficiaryExport';
import { db } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { usePermissions } from '@/hooks/usePermissions';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { ImportFileNumbersModal } from '@/components/beneficiary/ImportFileNumbersModal';
import { ImportBeneficiariesModal } from '@/components/beneficiary/ImportBeneficiariesModal';
import { AssignFileNumberModal, type AssignFileNumberTarget } from '@/components/beneficiary/AssignFileNumberModal';
import { auditService } from '@/services/auditService';
import { normalizeDonor } from '@/services/dashboardService';
import { nameMatchesSearch } from '@/utils/fuzzySearch';
import type { OfflineBeneficiary } from '@/lib/db';

interface BeneficiaryItem extends Partial<OfflineBeneficiary>, Record<string, unknown> {
    id?: string;
    isOffline?: boolean;
}

const UNSPECIFIED_LOCATION = 'Unspecified';

// District is the broader, more consistent grouping for filtering; city/village
// free text has too many spelling variants to make a clean dropdown.
function getBeneficiaryLocation(b: BeneficiaryItem): string {
    const district = (b.district as string | undefined)?.trim();
    if (district) return district;
    const city = (b.city as string | undefined)?.trim();
    return city || UNSPECIFIED_LOCATION;
}

export function BeneficiaryListPage() {
    const isOnline = useOnlineStatus();
    const [beneficiaries, setBeneficiaries] = useState<BeneficiaryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isImportBeneficiariesModalOpen, setIsImportBeneficiariesModalOpen] = useState(false);
    const [assignTarget, setAssignTarget] = useState<AssignFileNumberTarget | null>(null);
    const { canDeleteRecords, canImportFileNumbers, canImportBeneficiaries, canCreateRecords, canExportData } = usePermissions();

    // Filters live in the URL (not useState) so that navigating to a beneficiary's
    // profile and pressing back restores them — the list otherwise remounts fresh.
    const [searchParams, setSearchParams] = useSearchParams();
    const searchTerm = searchParams.get('q') || '';
    const startDate = searchParams.get('from') || '';
    const endDate = searchParams.get('to') || '';
    const registrationFilter = (searchParams.get('status') as 'all' | 'pending' | 'complete') || 'all';
    const locationFilter = searchParams.get('location') || 'all';
    const donorFilter = searchParams.get('donor');
    const fileStatusFilter = (searchParams.get('fileStatus') as 'all' | 'assigned' | 'unassigned') || 'all';

    const setFilterParam = useCallback((key: string, value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (!value || value === 'all') next.delete(key);
            else next.set(key, value);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const fetchBeneficiaries = useCallback(async () => {
        setIsLoading(true);
        try {
            // 1. Fetch from Supabase (if online)
            let serverData: BeneficiaryItem[] = [];
            if (isOnline) {
                const { data, error } = await supabase
                    .from('beneficiaries')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (!error) serverData = data || [];
            }

            // 2. Fetch from IndexedDB (all pending/failed records)
            const localData = await db.beneficiaries
                .where('sync_status')
                .anyOf(['pending', 'failed'])
                .toArray();

            // 3. Merge and deduplicate (by offline_token)
            const merged = [...localData.map(b => ({ ...b, isOffline: true })), ...serverData];
            const unique = Array.from(new Map(merged.map(item => [item.offline_token || item.id, item])).values());

            setBeneficiaries(unique);
        } catch (error) {
            console.error('Error fetching beneficiaries:', error);
        } finally {
            setIsLoading(false);
        }
    }, [isOnline]);

    useEffect(() => {
        fetchBeneficiaries();
    }, [isOnline, fetchBeneficiaries]); // Refetch when coming back online

    // Live cross-device sync: refetch whenever another device writes to beneficiaries,
    // and whenever this tab regains focus.
    useRealtimeSync({
        tables: 'beneficiaries',
        onChange: fetchBeneficiaries,
        enabled: isOnline,
    });

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) return;

        setIsDeleting(true);
        try {
            // Check if it's a local-only record (Dexie might use number or string for ID depending on schema)
            const localRecord = await db.beneficiaries.get(id);
            if (localRecord) {
                await db.beneficiaries.delete(id);
            }

            if (isOnline) {
                const { error } = await supabase
                    .from('beneficiaries')
                    .delete()
                    .eq('id', id);

                if (error && !localRecord) throw error;
            }

            await auditService.log('BENEFICIARY_DELETED', { beneficiary_id: id, name });
            setBeneficiaries(prev => prev.filter(b => b.id !== id));
            setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete beneficiary';
            alert(message);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} beneficiaries?`)) return;

        setIsDeleting(true);
        try {
            // Delete from local DB
            await db.beneficiaries.bulkDelete(selectedIds);

            if (isOnline) {
                const { error } = await supabase
                    .from('beneficiaries')
                    .delete()
                    .in('id', selectedIds);

                if (error) console.error('Server bulk delete failed:', error);
            }

            await auditService.log('BENEFICIARY_BULK_DELETED', { count: selectedIds.length });
            setBeneficiaries(prev => prev.filter(b => !b.id || !selectedIds.includes(b.id)));
            setSelectedIds([]);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete beneficiaries';
            alert(message);
        } finally {
            setIsDeleting(false);
        }
    };

    const toggleSelect = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === filteredBeneficiaries.length) {
            setSelectedIds([]);
        } else {
            const ids = filteredBeneficiaries
                .map(b => b.id)
                .filter((id): id is string => id !== undefined);
            setSelectedIds(ids);
        }
    };

    const handleExport = () => {
        exportBeneficiariesToExcel(
            filteredBeneficiaries,
            (startDate || endDate) ? { startDate, endDate } : undefined
        );
        auditService.log('BENEFICIARY_DATA_EXPORTED', { count: filteredBeneficiaries.length, from_date: startDate || null, to_date: endDate || null });
    };

    const filteredBeneficiaries = beneficiaries.filter(b => {
        const matchesSearch = nameMatchesSearch(b.name, searchTerm) ||
            b.mobile_no?.includes(searchTerm) ||
            (b.file_number || '').toLowerCase().includes(searchTerm.toLowerCase());

        let matchesDate = true;
        if (startDate && b.date_of_registration) {
            matchesDate = matchesDate && (b.date_of_registration >= startDate);
        }
        if (endDate && b.date_of_registration) {
            matchesDate = matchesDate && (b.date_of_registration <= endDate);
        }

        let matchesRegistration = true;
        if (registrationFilter !== 'all') {
            const status = (b.registration_status as string | undefined) || 'complete';
            matchesRegistration = status === registrationFilter;
        }

        const matchesDonor = !donorFilter || normalizeDonor(b.donor as string | null | undefined) === donorFilter;

        const matchesLocation = locationFilter === 'all' || getBeneficiaryLocation(b) === locationFilter;

        const matchesFileStatus = fileStatusFilter === 'all'
            || (fileStatusFilter === 'assigned' ? !!b.file_number : !b.file_number);

        return matchesSearch && matchesDate && matchesRegistration && matchesDonor && matchesLocation && matchesFileStatus;
    });

    const pendingCount = beneficiaries.filter(
        b => (b.registration_status as string | undefined) === 'pending'
    ).length;

    const donorOptions = Array.from(
        new Set(beneficiaries.map(b => normalizeDonor(b.donor as string | null | undefined)))
    ).sort((a, b) => a.localeCompare(b));

    const locationOptions = Array.from(
        new Set(beneficiaries.map(getBeneficiaryLocation))
    ).sort((a, b) => a.localeCompare(b));

    const hasActiveFilters = !!(searchTerm || startDate || endDate || donorFilter || locationFilter !== 'all' || registrationFilter !== 'all' || fileStatusFilter !== 'all');

    const clearFilters = () => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            ['q', 'from', 'to', 'location', 'donor', 'status', 'fileStatus'].forEach(key => next.delete(key));
            return next;
        }, { replace: true });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main">Beneficiary Directory</h1>
                    <p className="text-text-muted">Manage all patients across online and offline sessions.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${isOnline ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                        {isOnline ? <><Wifi size={14} /> Online</> : <><WifiOff size={14} /> Offline</>}
                    </div>
                    {selectedIds.length > 0 && canDeleteRecords && (
                        <Button
                            variant="secondary"
                            onClick={handleBulkDelete}
                            className="flex items-center gap-2 bg-red-50 text-red-600 border-red-100 hover:bg-red-100"
                            disabled={isDeleting}
                        >
                            <Trash2 size={18} /> Delete Selected ({selectedIds.length})
                        </Button>
                    )}
                    {canExportData && (
                        <Button
                            variant="outline"
                            onClick={handleExport}
                            className="flex items-center gap-2"
                            disabled={isLoading || filteredBeneficiaries.length === 0}
                        >
                            <Download size={18} /> Export Excel ({filteredBeneficiaries.length})
                        </Button>
                    )}
                    {canImportBeneficiaries && (
                        <Button
                            variant="secondary"
                            onClick={() => setIsImportBeneficiariesModalOpen(true)}
                            className="flex items-center gap-2 bg-green-50 text-green-700 border-green-100 hover:bg-green-100"
                        >
                            <FileUp size={18} /> Import Beneficiaries
                        </Button>
                    )}
                    {canImportFileNumbers && (
                        <Button
                            variant="secondary"
                            onClick={() => setIsImportModalOpen(true)}
                            className="flex items-center gap-2 bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100"
                        >
                            <FileUp size={18} /> Import File Numbers
                        </Button>
                    )}
                    {canCreateRecords && (
                        <Link to="/beneficiary/add">
                            <Button className="flex items-center gap-2">
                                <Plus size={18} /> Add Beneficiary
                            </Button>
                        </Link>
                    )}
                </div>
            </div>

            <ImportFileNumbersModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={fetchBeneficiaries}
            />
            <ImportBeneficiariesModal
                isOpen={isImportBeneficiariesModalOpen}
                onClose={() => setIsImportBeneficiariesModalOpen(false)}
                onSuccess={fetchBeneficiaries}
            />
            {assignTarget && (
                <AssignFileNumberModal
                    key={assignTarget.systemId}
                    target={assignTarget}
                    onClose={() => setAssignTarget(null)}
                    onSuccess={fetchBeneficiaries}
                />
            )}

            <Card className="p-4">
                <div className="flex flex-wrap gap-2 mb-4">
                    <button
                        onClick={() => setFilterParam('status', 'all')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${registrationFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        All ({beneficiaries.length})
                    </button>
                    <button
                        onClick={() => setFilterParam('status', 'pending')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${registrationFilter === 'pending' ? 'bg-orange-500 text-white border-orange-500' : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'}`}
                    >
                        Pending Registration ({pendingCount})
                    </button>
                    <button
                        onClick={() => setFilterParam('status', 'complete')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${registrationFilter === 'complete' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        Registered
                    </button>
                </div>
                <div className="space-y-3 mb-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={20} />
                        <input
                            type="text"
                            placeholder="Search by name, mobile, or file number..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            value={searchTerm}
                            onChange={(e) => setFilterParam('q', e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                        <div>
                            <label className="block text-[11px] uppercase font-bold text-text-muted mb-1 ml-1">From Date</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                value={startDate}
                                onChange={(e) => setFilterParam('from', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase font-bold text-text-muted mb-1 ml-1">To Date</label>
                            <input
                                type="date"
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                value={endDate}
                                onChange={(e) => setFilterParam('to', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase font-bold text-text-muted mb-1 ml-1">Location</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                                value={locationFilter}
                                onChange={(e) => setFilterParam('location', e.target.value)}
                            >
                                <option value="all">All Locations</option>
                                {locationOptions.map(loc => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase font-bold text-text-muted mb-1 ml-1">Donor</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                                value={donorFilter || 'all'}
                                onChange={(e) => setFilterParam('donor', e.target.value)}
                            >
                                <option value="all">All Donors</option>
                                {donorOptions.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] uppercase font-bold text-text-muted mb-1 ml-1">File Number</label>
                            <select
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
                                value={fileStatusFilter}
                                onChange={(e) => setFilterParam('fileStatus', e.target.value)}
                            >
                                <option value="all">All</option>
                                <option value="assigned">Assigned</option>
                                <option value="unassigned">Unassigned</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                        {hasActiveFilters ? (
                            <button
                                onClick={clearFilters}
                                className="text-xs font-bold text-red-500 hover:text-red-600 px-3 py-2 bg-red-50 rounded-lg transition-colors border border-red-100"
                            >
                                Clear Filters
                            </button>
                        ) : <span />}
                        {filteredBeneficiaries.length > 0 && (
                            <button
                                onClick={toggleSelectAll}
                                className="flex items-center gap-2 text-sm font-medium text-text-muted hover:text-primary transition-colors px-3 py-2 bg-gray-50 rounded-lg border border-gray-100"
                            >
                                {selectedIds.length === filteredBeneficiaries.length && selectedIds.length > 0 ? (
                                    <><CheckSquare size={18} className="text-primary" /> Unselect All ({selectedIds.length})</>
                                ) : (
                                    <><Square size={18} /> Select All ({filteredBeneficiaries.length})</>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : filteredBeneficiaries.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredBeneficiaries.map((b) => {
                            const stableId = b.id || b.offline_token;
                            if (!stableId) return null;

                            return (
                                <Link
                                    key={stableId}
                                    to={
                                        b.isOffline
                                            ? '#'
                                            : (b.registration_status as string | undefined) === 'pending'
                                                ? `/beneficiary/add?completeId=${b.id}`
                                                : `/beneficiary/${b.id}`
                                    }
                                >
                                    <Card className={`p-4 hover:shadow-md transition-all cursor-pointer border-l-4 relative group ${b.id && selectedIds.includes(b.id) ? 'border-l-primary bg-primary/5 ring-1 ring-primary/20' : 'border-l-gray-300'}`}>
                                        {/* Sync Status Badge */}
                                        <div className="absolute top-3 right-10 z-10">
                                            {b.sync_status === 'pending' || b.sync_status === 'failed' ? (
                                                <div className="flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 rounded text-[11px] font-bold border border-orange-100">
                                                    <CloudOff size={10} /> Pending
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-600 rounded text-[11px] font-bold border border-green-100">
                                                    <CloudCheck size={10} /> Synced
                                                </div>
                                            )}
                                        </div>

                                        {/* Selection Checkbox */}
                                        {b.id && (
                                            <div
                                                onClick={(e) => toggleSelect(e, b.id!)}
                                                className="absolute top-3 right-3 z-10 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                {selectedIds.includes(b.id) ? (
                                                    <div className="bg-primary text-white rounded-md p-1 shadow-sm">
                                                        <CheckSquare size={16} />
                                                    </div>
                                                ) : (
                                                    <div className="bg-white text-gray-400 rounded-md p-1 border border-gray-200 shadow-sm hover:text-primary">
                                                        <Square size={16} />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-start gap-4">
                                            <div className="p-3 bg-primary/10 rounded-full text-primary relative">
                                                <User size={24} />
                                                {(b.token_no || b.offline_token) && (
                                                    <div className={`absolute -top-1 -right-1 text-white text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-sm ${b.sync_status === 'synced' ? 'bg-primary' : 'bg-orange-500'}`}>
                                                        {b.token_no || (b.offline_token ? b.offline_token.split('-').pop() : '!')}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-semibold text-text-main truncate pr-20 mb-1">{b.name}</h3>
                                                <p className="text-sm text-text-muted">{b.age ? `${b.age} years` : 'Age —'} • {b.gender || '—'}</p>
                                                {(b.registration_status as string | undefined) === 'pending' && (
                                                    <p className="text-[11px] text-orange-600 font-bold mt-1 bg-orange-50 px-2 py-0.5 rounded border border-orange-100 inline-flex items-center gap-1">
                                                        <AlertTriangle size={10} /> Registration Pending — complete details
                                                    </p>
                                                )}

                                                {b.sync_status === 'failed' && (
                                                    <p className="text-[11px] text-red-500 font-bold mt-1 bg-red-50 px-2 py-0.5 rounded border border-red-100 flex items-center gap-1">
                                                        <AlertTriangle size={10} /> Sync Error: {b.error_message?.substring(0, 30)}...
                                                    </p>
                                                )}

                                                <div className="mt-3 space-y-1">
                                                    <p className="text-xs text-text-muted flex items-center gap-2">
                                                        <MapPin size={14} /> {b.city || b.district || 'No address'}
                                                    </p>
                                                    <p className="text-xs text-text-muted flex items-center gap-2">
                                                        <Phone size={14} /> {b.mobile_no || 'No phone'}
                                                    </p>
                                                    <div className="pt-2 flex items-center gap-2">
                                                        <div className={`text-[11px] font-bold px-2 py-1 rounded inline-flex items-center gap-1.5 ${b.file_number ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-gray-50 text-gray-500 border border-gray-100'}`}>
                                                            {b.file_number ? (
                                                                <>File No: <span className="text-[11px] font-black">{b.file_number}</span></>
                                                            ) : (
                                                                'File No: Not Assigned'
                                                            )}
                                                        </div>
                                                        {!b.file_number && canImportFileNumbers && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    e.stopPropagation();
                                                                    setAssignTarget({
                                                                        systemId: (b.isOffline ? b.offline_token : b.id) || stableId,
                                                                        name: b.name || 'Unknown',
                                                                        isLocalPending: !!b.isOffline,
                                                                    });
                                                                }}
                                                                className="text-[11px] font-bold text-primary bg-primary/5 border border-primary/20 px-2 py-1 rounded hover:bg-primary/10 transition-colors"
                                                            >
                                                                Assign
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                                                    {canDeleteRecords && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                e.stopPropagation();
                                                                handleDelete(stableId, b.name || 'Unknown');
                                                            }}
                                                            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                                                            disabled={isDeleting}
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
                                </Link>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 text-text-muted">
                        <User size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No beneficiaries found.</p>
                    </div>
                )}
            </Card>
        </div>
    );
}
