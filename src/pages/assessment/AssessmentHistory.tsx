import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import {
    ClipboardList,
    Search,
    RefreshCw,
    Download,
    Users,
    Activity,
    Calendar,
    Eye,
    History as HistoryIcon,
    ShieldCheck,
    Trash2,
    WifiOff,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { assessmentService } from '@/services/assessmentService';
import { auditService } from '@/services/auditService';
import { nameMatchesSearch } from '@/utils/fuzzySearch';

interface AssessmentRecord {
    patient_id: string;
    assessment_date: string;
    patient_name: string;
    age: number;
    gender: string;
    phone: string;
    village: string;
    primary_condition: string;
    chief_complaint: string;
    service_referral_needed: string | null;
    referral_reason: string | null;
    side_of_limb_affected: string;
    joint_involved: string;
    document_type: string;
    created_at: string;
    // Joined counts
    clinical_count: number;
    follow_up_count: number;
    latest_follow_up_date: string | null;
    // Offline tracking
    isOffline?: boolean;
    sync_status?: 'pending' | 'synced' | 'failed';
}

export function AssessmentHistoryPage() {
    const [records, setRecords] = useState<AssessmentRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters live in the URL (not useState) so that navigating to View and
    // pressing back restores them — the list otherwise remounts fresh.
    const [searchParams, setSearchParams] = useSearchParams();
    const searchTerm = searchParams.get('q') || '';
    const fromDate = searchParams.get('from') || '';
    const toDate = searchParams.get('to') || '';
    const followUpOnly = searchParams.get('followUp') === '1';
    const clinicalFilter = (searchParams.get('clinical') as 'all' | 'done' | 'pending') || 'all';

    const setFilterParam = useCallback((key: string, value: string | null) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            if (!value) next.delete(key);
            else next.set(key, value);
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const clearFilters = useCallback(() => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            ['q', 'from', 'to', 'followUp', 'clinical'].forEach(key => next.delete(key));
            return next;
        }, { replace: true });
    }, [setSearchParams]);

    const [deletingId, setDeletingId] = useState<string | null>(null);
    const navigate = useNavigate();
    const { canDeleteRecords, canExportData } = usePermissions();
    const isOnline = useOnlineStatus();

    const fetchHistory = useCallback(async () => {
        setIsLoading(true);
        try {
            let mapped: AssessmentRecord[] = [];

            if (isOnline) {
                const { data: initials, error: initError } = await supabase
                    .from('initial_assessment')
                    .select('*')
                    .order('assessment_date', { ascending: false });

                if (initError) throw initError;

                if (initials && initials.length > 0) {
                    const patientIds = initials.map((i: AssessmentRecord) => i.patient_id);

                    const { data: clinicals } = await supabase
                        .from('clinical_assessment')
                        .select('patient_id')
                        .in('patient_id', patientIds);

                    const clinicalSet = new Set((clinicals || []).map((c: { patient_id: string }) => c.patient_id));

                    const { data: followUps } = await supabase
                        .from('follow_up_assessment')
                        .select('patient_id, visit_date, session_number')
                        .in('patient_id', patientIds)
                        .order('session_number', { ascending: false });

                    const followUpMap = new Map<string, { count: number; latestDate: string | null }>();
                    (followUps || []).forEach((f: { patient_id: string; visit_date: string; session_number: number }) => {
                        const existing = followUpMap.get(f.patient_id);
                        if (!existing) {
                            followUpMap.set(f.patient_id, { count: 1, latestDate: f.visit_date });
                        } else {
                            existing.count++;
                        }
                    });

                    mapped = initials.map((i: AssessmentRecord) => ({
                        ...i,
                        clinical_count: clinicalSet.has(i.patient_id) ? 1 : 0,
                        follow_up_count: followUpMap.get(i.patient_id)?.count || 0,
                        latest_follow_up_date: followUpMap.get(i.patient_id)?.latestDate || null,
                    }));
                }
            }

            // Merge offline pending records not yet on the server
            const localPending = await db.offline_initial_assessments
                .where('sync_status').anyOf(['pending', 'failed'])
                .toArray();

            const serverPatientIds = new Set(mapped.map(r => r.patient_id));
            const offlineOnly = localPending.filter(r => !serverPatientIds.has(r.patient_id));

            const offlineMapped: AssessmentRecord[] = await Promise.all(
                offlineOnly.map(async r => {
                    const clinicalCount = await db.offline_clinical_assessments
                        .where('patient_id').equals(r.patient_id).count();
                    const followUps = await db.offline_follow_up_assessments
                        .where('patient_id').equals(r.patient_id).toArray();
                    const latestFU = followUps.sort((a, b) => b.session_number - a.session_number)[0];
                    return {
                        patient_id: r.patient_id,
                        assessment_date: r.assessment_date,
                        patient_name: r.patient_name,
                        age: r.age,
                        gender: r.gender,
                        phone: r.phone,
                        village: r.village,
                        primary_condition: r.primary_condition,
                        chief_complaint: r.chief_complaint,
                        service_referral_needed: r.service_referral_needed || null,
                        referral_reason: r.referral_reason || null,
                        side_of_limb_affected: r.side_of_limb_affected,
                        joint_involved: r.joint_involved,
                        document_type: r.document_type,
                        created_at: r.created_at ?? new Date().toISOString(),
                        clinical_count: clinicalCount,
                        follow_up_count: followUps.length,
                        latest_follow_up_date: latestFU?.visit_date ?? null,
                        isOffline: true,
                        sync_status: r.sync_status,
                    };
                })
            );

            setRecords([...offlineMapped, ...mapped]);
        } catch (error) {
            console.error('Error fetching assessment history:', error);
        } finally {
            setIsLoading(false);
        }
    }, [isOnline]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Live cross-device sync across all three assessment tables.
    useRealtimeSync({
        tables: ['initial_assessment', 'clinical_assessment', 'follow_up_assessment'],
        onChange: fetchHistory,
    });

    const filtered = records.filter(r => {
        const matchesSearch =
            nameMatchesSearch(r.patient_name, searchTerm) ||
            r.patient_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.primary_condition.toLowerCase().includes(searchTerm.toLowerCase()) ||
            r.village.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesFrom = !fromDate || r.assessment_date >= fromDate;
        const matchesTo = !toDate || r.assessment_date <= toDate;
        const matchesFollowUp = !followUpOnly || r.follow_up_count > 0;
        const matchesClinical = clinicalFilter === 'all'
            || (clinicalFilter === 'done' ? r.clinical_count > 0 : r.clinical_count === 0);

        return matchesSearch && matchesFrom && matchesTo && matchesFollowUp && matchesClinical;
    });

    // Stats
    const totalPatients = filtered.length;
    const totalFollowUps = filtered.reduce((sum, r) => sum + r.follow_up_count, 0);
    const conditionBreakdown = filtered.reduce((acc, r) => {
        acc[r.primary_condition] = (acc[r.primary_condition] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topCondition = Object.entries(conditionBreakdown).sort((a, b) => b[1] - a[1])[0];

    const handleExport = async () => {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const ws = workbook.addWorksheet('Assessment History');

        ws.columns = [
            { header: 'Patient ID', key: 'patient_id', width: 22 },
            { header: 'Patient Name', key: 'patient_name', width: 25 },
            { header: 'Assessment Date', key: 'assessment_date', width: 15 },
            { header: 'Age', key: 'age', width: 8 },
            { header: 'Gender', key: 'gender', width: 10 },
            { header: 'Phone', key: 'phone', width: 15 },
            { header: 'Village', key: 'village', width: 18 },
            { header: 'Primary Condition', key: 'primary_condition', width: 18 },
            { header: 'Chief Complaint', key: 'chief_complaint', width: 22 },
            { header: 'Service Referral Needed', key: 'service_referral_needed', width: 22 },
            { header: 'Referral Reason', key: 'referral_reason', width: 18 },
            { header: 'Side Affected', key: 'side_of_limb_affected', width: 14 },
            { header: 'Joint Involved', key: 'joint_involved', width: 14 },
            { header: 'Document Type', key: 'document_type', width: 14 },
            { header: 'Clinical Done', key: 'clinical_done', width: 14 },
            { header: 'Follow-Up Sessions', key: 'follow_up_count', width: 18 },
            { header: 'Latest Follow-Up', key: 'latest_follow_up_date', width: 16 },
        ];

        filtered.forEach(r => {
            ws.addRow({
                ...r,
                clinical_done: r.clinical_count > 0 ? 'Yes' : 'No',
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `Assessment_History_${new Date().toISOString().split('T')[0]}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        auditService.log('ASSESSMENT_DATA_EXPORTED', { count: filtered.length, from_date: fromDate || null, to_date: toDate || null });
    };

    const handleDelete = async (patientId: string, patientName: string) => {
        if (!confirm(`Delete all assessment data for "${patientName}" (${patientId})?\n\nThis will permanently remove the Initial, Clinical, and all Follow-Up assessments.`)) return;
        setDeletingId(patientId);
        try {
            await assessmentService.deleteAssessment(patientId);
            await auditService.log('ASSESSMENT_DELETED', { patient_id: patientId, patient_name: patientName });
            setRecords(prev => prev.filter(r => r.patient_id !== patientId));
        } catch (err) {
            console.error('Delete assessment error:', err);
            alert('Failed to delete assessment. Please try again.');
        } finally {
            setDeletingId(null);
        }
    };

    const conditionColors: Record<string, string> = {
        'Pain': 'bg-red-100 text-red-700',
        'Neuro': 'bg-purple-100 text-purple-700',
        'Pulmonary': 'bg-blue-100 text-blue-700',
        'Post-Operative': 'bg-amber-100 text-amber-700',
        'Disability': 'bg-teal-100 text-teal-700',
        'Amputation': 'bg-orange-100 text-orange-700',
        'Early Intervention Assessment': 'bg-pink-100 text-pink-700',
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                        <HistoryIcon className="text-primary" /> Assessment History
                    </h1>
                    <p className="text-text-muted text-sm mt-1">Track all patient assessments, sessions, and progress across conditions.</p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" onClick={fetchHistory} className="bg-white">
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                    {canExportData && (
                        <Button onClick={handleExport} className="flex items-center gap-2 shadow-lg shadow-primary/20">
                            <Download size={18} /> <span className="hidden sm:inline">Export Excel</span>
                        </Button>
                    )}
                </div>
            </div>

            <Card className="p-4 md:p-6 min-w-0">
                {/* Filters */}
                <div className="flex flex-col md:flex-row md:items-start gap-4 mb-4">
                    <div className="flex-1 relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <Input
                            placeholder="Search by Name, Patient ID, Condition, Village..."
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setFilterParam('q', e.target.value)}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
                            <ShieldCheck size={16} className="text-blue-500" />
                            <span className="text-xs font-bold text-gray-500 uppercase">Date:</span>
                        </div>
                        <Input
                            type="date"
                            className="w-36 sm:w-40"
                            value={fromDate}
                            onChange={(e) => setFilterParam('from', e.target.value)}
                        />
                        <span className="text-gray-400">to</span>
                        <Input
                            type="date"
                            className="w-36 sm:w-40"
                            value={toDate}
                            onChange={(e) => setFilterParam('to', e.target.value)}
                        />
                        {(searchTerm || fromDate || toDate || followUpOnly || clinicalFilter !== 'all') && (
                            <button
                                onClick={clearFilters}
                                className="text-xs font-bold text-primary hover:underline px-2"
                            >
                                Clear All
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-8">
                    <span className="text-xs font-bold text-gray-400 uppercase mr-1">Clinical Assessment:</span>
                    <button
                        onClick={() => setFilterParam('clinical', null)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${clinicalFilter === 'all' ? 'bg-primary text-white border-primary' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilterParam('clinical', 'done')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${clinicalFilter === 'done' ? 'bg-green-600 text-white border-green-600' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}
                    >
                        Assessment Done
                    </button>
                    <button
                        onClick={() => setFilterParam('clinical', 'pending')}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${clinicalFilter === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                    >
                        Assessment Not Done
                    </button>
                </div>

                {/* Stats Cards */}
                {!isLoading && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
                        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-primary/10 rounded-xl shrink-0">
                                    <Users size={18} className="text-primary" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">Total Patients</p>
                            </div>
                            <h3 className="text-2xl font-black text-primary">{totalPatients}</h3>
                        </div>

                        <button
                            type="button"
                            onClick={() => setFilterParam('followUp', followUpOnly ? null : '1')}
                            title="Show only patients who have at least one follow-up session"
                            className={`text-left p-4 sm:p-5 rounded-2xl border shadow-sm min-w-0 transition-colors ${followUpOnly
                                ? 'bg-green-50 border-green-300 ring-2 ring-green-200'
                                : 'bg-white border-gray-100 hover:border-green-200'
                                }`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-green-100 rounded-xl shrink-0">
                                    <Calendar size={18} className="text-green-600" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">
                                    Follow-Up Sessions{followUpOnly ? ' (Filtered)' : ''}
                                </p>
                            </div>
                            <h3 className="text-2xl font-black text-green-700">{totalFollowUps}</h3>
                        </button>

                        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-blue-100 rounded-xl shrink-0">
                                    <ClipboardList size={18} className="text-blue-600" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">Conditions</p>
                            </div>
                            <h3 className="text-2xl font-black text-blue-700">{Object.keys(conditionBreakdown).length}</h3>
                        </div>

                        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="p-2 bg-purple-100 rounded-xl shrink-0">
                                    <Activity size={18} className="text-purple-600" />
                                </div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">Top Condition</p>
                            </div>
                            <h3 className="text-base font-black text-purple-700 break-words leading-tight">{topCondition ? topCondition[0] : '—'}</h3>
                        </div>
                    </div>
                )}

                {/* Table */}
                {isLoading ? (
                    <div className="py-24 flex flex-col items-center justify-center">
                        <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4"></div>
                        <p className="text-text-muted font-medium">Loading assessment records...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-24 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <ClipboardList size={32} className="text-gray-200" />
                        </div>
                        <p className="text-gray-400 font-medium">No assessment records found for the selected criteria.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto min-w-0 w-full">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider pl-4">Date</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Patient (ID)</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Condition</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Demographics</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Clinical</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Follow-Ups</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider pr-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filtered.map((r) => (
                                    <tr key={r.patient_id} className="hover:bg-gray-50/50 transition-colors group align-top">
                                        <td className="py-5 pl-4">
                                            <div className="text-sm font-bold text-gray-900 leading-tight">
                                                {new Date(r.assessment_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                        </td>
                                        <td className="py-5">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                                                    {r.patient_name}
                                                </span>
                                                <span className="text-[11px] font-black text-blue-600 tracking-tight font-mono">
                                                    {r.patient_id}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-5 pr-3 align-top">
                                            <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider whitespace-nowrap ${conditionColors[r.primary_condition] || 'bg-gray-100 text-gray-700'}`}>
                                                {r.primary_condition}
                                            </span>
                                            <div className="text-[10px] text-gray-400 mt-1 truncate max-w-[140px]">
                                                {r.chief_complaint}
                                            </div>
                                            {r.service_referral_needed && (
                                                <div className="text-[10px] text-teal-700 mt-1 truncate max-w-[140px]">
                                                    Referred: {r.service_referral_needed}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-5">
                                            <div className="text-xs text-gray-700">
                                                {r.age}y / {r.gender}
                                            </div>
                                            <div className="text-[10px] text-gray-400">{r.village}</div>
                                        </td>
                                        <td className="py-5">
                                            {r.clinical_count > 0 ? (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">Done</span>
                                            ) : (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Pending</span>
                                            )}
                                        </td>
                                        <td className="py-5">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg font-black text-primary">{r.follow_up_count}</span>
                                                <span className="text-[10px] text-gray-400">sessions</span>
                                            </div>
                                            {r.latest_follow_up_date && (
                                                <div className="text-[10px] text-gray-400">
                                                    Last: {new Date(r.latest_follow_up_date).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-5 pr-4 text-right">
                                            {r.isOffline ? (
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${r.sync_status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                    <WifiOff size={10} />
                                                    {r.sync_status === 'failed' ? 'Sync Failed' : 'Pending Sync'}
                                                </span>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="secondary"
                                                        className="h-8 px-2 flex items-center gap-1.5 text-[11px] bg-blue-50 text-blue-600 border-none hover:bg-blue-100"
                                                        onClick={() => navigate(`/assessments/view/${r.patient_id}`)}
                                                    >
                                                        <Eye size={14} /> View
                                                    </Button>
                                                    {canDeleteRecords && (
                                                        <Button
                                                            variant="secondary"
                                                            className="h-8 px-2 flex items-center gap-1.5 text-[11px] bg-red-50 text-red-600 border-none hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed"
                                                            onClick={() => handleDelete(r.patient_id, r.patient_name)}
                                                            disabled={deletingId === r.patient_id || !isOnline}
                                                            title={!isOnline ? 'Cannot delete while offline' : undefined}
                                                        >
                                                            {deletingId === r.patient_id
                                                                ? <span className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                                                                : <Trash2 size={14} />}
                                                            Delete
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
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
