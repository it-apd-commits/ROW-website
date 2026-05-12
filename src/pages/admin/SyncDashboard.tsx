import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2, Wifi, WifiOff, Stethoscope, Users, ClipboardList } from 'lucide-react';
import { SyncService } from '@/lib/syncService';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface SyncCounts {
    pending: number;
    synced: number;
    failed: number;
}

export function SyncDashboardPage() {
    const isOnline = useOnlineStatus();
    const [beneficiaryCounts, setBeneficiaryCounts] = useState<SyncCounts>({ pending: 0, synced: 0, failed: 0 });
    const [serviceCounts, setServiceCounts] = useState<SyncCounts>({ pending: 0, synced: 0, failed: 0 });
    const [assessmentCounts, setAssessmentCounts] = useState<SyncCounts>({ pending: 0, synced: 0, failed: 0 });
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<string | null>(localStorage.getItem('last_sync_time'));

    const loadCounts = useCallback(async () => {
        const [bPending, bSynced, bFailed, sPending, sSynced, sFailed,
            aiPending, aiSynced, aiFailed,
            acPending, acSynced, acFailed,
            afPending, afSynced, afFailed,
        ] = await Promise.all([
            db.beneficiaries.where('sync_status').equals('pending').count(),
            db.beneficiaries.where('sync_status').equals('synced').count(),
            db.beneficiaries.where('sync_status').equals('failed').count(),
            db.service_entries.where('sync_status').equals('pending').count(),
            db.service_entries.where('sync_status').equals('synced').count(),
            db.service_entries.where('sync_status').equals('failed').count(),
            db.offline_initial_assessments.where('sync_status').equals('pending').count(),
            db.offline_initial_assessments.where('sync_status').equals('synced').count(),
            db.offline_initial_assessments.where('sync_status').equals('failed').count(),
            db.offline_clinical_assessments.where('sync_status').equals('pending').count(),
            db.offline_clinical_assessments.where('sync_status').equals('synced').count(),
            db.offline_clinical_assessments.where('sync_status').equals('failed').count(),
            db.offline_follow_up_assessments.where('sync_status').equals('pending').count(),
            db.offline_follow_up_assessments.where('sync_status').equals('synced').count(),
            db.offline_follow_up_assessments.where('sync_status').equals('failed').count(),
        ]);

        setBeneficiaryCounts({ pending: bPending, synced: bSynced, failed: bFailed });
        setServiceCounts({ pending: sPending, synced: sSynced, failed: sFailed });
        setAssessmentCounts({
            pending: aiPending + acPending + afPending,
            synced: aiSynced + acSynced + afSynced,
            failed: aiFailed + acFailed + afFailed,
        });
    }, []);

    useEffect(() => {
        const timeout = setTimeout(loadCounts, 0);
        const interval = setInterval(loadCounts, 5000);
        return () => {
            clearTimeout(timeout);
            clearInterval(interval);
        };
    }, [loadCounts]);

    const totalPending = beneficiaryCounts.pending + serviceCounts.pending + assessmentCounts.pending;
    const totalFailed = beneficiaryCounts.failed + serviceCounts.failed + assessmentCounts.failed;

    const handleManualSync = async () => {
        if (!isOnline) {
            alert('Cannot sync while offline.');
            return;
        }
        setIsSyncing(true);
        await SyncService.syncPendingRecords();
        const now = new Date().toLocaleTimeString();
        setLastSync(now);
        localStorage.setItem('last_sync_time', now);
        await loadCounts();
        setIsSyncing(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-main">Sync Control Center</h1>
                    <p className="text-text-muted">Monitor and manage offline data synchronization.</p>
                </div>
                <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border shadow-sm self-start md:self-auto whitespace-nowrap ${isOnline ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                    {isOnline ? <><Wifi size={20} /> <span className="font-bold">SYSTEM ONLINE</span></> : <><WifiOff size={20} /> <span className="font-bold">SYSTEM OFFLINE</span></>}
                </div>
            </div>

            {/* Beneficiary sync counts */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <Users size={16} className="text-primary" />
                    <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Beneficiary Registration</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                    <Card className="p-4 lg:p-6 border-l-4 border-l-orange-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-orange-100 text-orange-600 rounded-xl shrink-0">
                                <CloudOff size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Pending Sync</p>
                                <h3 className="text-3xl font-black text-text-main">{beneficiaryCounts.pending}</h3>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 lg:p-6 border-l-4 border-l-green-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-green-100 text-green-600 rounded-xl shrink-0">
                                <Cloud size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Recently Synced</p>
                                <h3 className="text-3xl font-black text-text-main">{beneficiaryCounts.synced}</h3>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 lg:p-6 border-l-4 border-l-red-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Sync Errors</p>
                                <h3 className="text-3xl font-black text-text-main">{beneficiaryCounts.failed}</h3>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Service entry sync counts */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <Stethoscope size={16} className="text-primary" />
                    <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Service Entries</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                    <Card className="p-4 lg:p-6 border-l-4 border-l-orange-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-orange-100 text-orange-600 rounded-xl shrink-0">
                                <CloudOff size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Pending Sync</p>
                                <h3 className="text-3xl font-black text-text-main">{serviceCounts.pending}</h3>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 lg:p-6 border-l-4 border-l-green-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-green-100 text-green-600 rounded-xl shrink-0">
                                <Cloud size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Recently Synced</p>
                                <h3 className="text-3xl font-black text-text-main">{serviceCounts.synced}</h3>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 lg:p-6 border-l-4 border-l-red-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Sync Errors</p>
                                <h3 className="text-3xl font-black text-text-main">{serviceCounts.failed}</h3>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            {/* Assessment sync counts */}
            <div>
                <div className="flex items-center gap-2 mb-3">
                    <ClipboardList size={16} className="text-primary" />
                    <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Assessments (Initial + Clinical + Follow-Up)</h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
                    <Card className="p-4 lg:p-6 border-l-4 border-l-orange-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-orange-100 text-orange-600 rounded-xl shrink-0">
                                <CloudOff size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Pending Sync</p>
                                <h3 className="text-3xl font-black text-text-main">{assessmentCounts.pending}</h3>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 lg:p-6 border-l-4 border-l-green-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-green-100 text-green-600 rounded-xl shrink-0">
                                <Cloud size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Recently Synced</p>
                                <h3 className="text-3xl font-black text-text-main">{assessmentCounts.synced}</h3>
                            </div>
                        </div>
                    </Card>
                    <Card className="p-4 lg:p-6 border-l-4 border-l-red-500 min-w-0">
                        <div className="flex items-center gap-3 lg:gap-4 min-w-0">
                            <div className="p-3 bg-red-100 text-red-600 rounded-xl shrink-0">
                                <AlertTriangle size={24} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-text-muted truncate">Sync Errors</p>
                                <h3 className="text-3xl font-black text-text-main">{assessmentCounts.failed}</h3>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>

            <Card className="p-8 text-center bg-gray-50/50 border-dashed border-2 border-gray-200">
                <div className="max-w-md mx-auto space-y-4">
                    <div className="flex justify-center mb-2">
                        {isSyncing ? (
                            <RefreshCw className="text-primary animate-spin" size={48} />
                        ) : totalPending > 0 ? (
                            <RefreshCw className="text-orange-500" size={48} />
                        ) : (
                            <CheckCircle2 className="text-green-500" size={48} />
                        )}
                    </div>
                    <h2 className="text-xl font-bold text-text-main">
                        {isSyncing ? 'Synchronizing Data...' : totalPending > 0 ? 'Pending Records Ready' : 'All Data is Up-to-Date'}
                    </h2>
                    <p className="text-text-muted text-sm">
                        {totalPending > 0
                            ? `${totalPending} record(s) waiting to be uploaded to the central ROW database.`
                            : 'All offline records have been successfully synchronized with the server.'}
                    </p>
                    <div className="pt-4">
                        <Button
                            onClick={handleManualSync}
                            disabled={isSyncing || !isOnline || totalPending === 0}
                            className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto disabled:opacity-50"
                        >
                            <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </Button>
                        {lastSync && (
                            <p className="mt-3 text-[10px] text-text-muted uppercase tracking-widest font-bold">
                                Last Sync Attempt: {lastSync}
                            </p>
                        )}
                    </div>
                </div>
            </Card>

            {totalFailed > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-start gap-3">
                    <AlertTriangle className="text-red-500 mt-0.5" size={20} />
                    <div>
                        <h4 className="text-sm font-bold text-red-800 uppercase tracking-tight">Sync Conflict Detected</h4>
                        <p className="text-xs text-red-600 mt-1">
                            Some records could not be synchronized due to format errors or connection timeouts.
                            The system will automatically retry them on the next sync cycle.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
