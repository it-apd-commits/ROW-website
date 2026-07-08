import { useState } from 'react';
import { X, Hash, AlertCircle, CheckCircle, WifiOff } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import { updateBeneficiaryFileNumber } from '@/services/beneficiaryService';
import { auditService } from '@/services/auditService';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export interface AssignFileNumberTarget {
    /** Beneficiary UUID (synced records) or offline_token (offline-pending records). */
    systemId: string;
    name: string;
    /** True when the record exists only in Dexie and hasn't synced to Supabase yet. */
    isLocalPending: boolean;
}

interface Props {
    target: AssignFileNumberTarget;
    onClose: () => void;
    onSuccess: () => void;
}

export function AssignFileNumberModal({ target, onClose, onSuccess }: Props) {
    const isOnline = useOnlineStatus();
    const [fileNumber, setFileNumber] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    // A synced record can only be updated on the server; block until back online.
    const blocked = !isOnline && !target.isLocalPending;

    const handleSave = async () => {
        const value = fileNumber.trim();
        if (!value) {
            setError('Please enter a file number.');
            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            // Duplicate check on the server (when reachable)
            if (isOnline) {
                const { data: existing, error: qError } = await supabase
                    .from('beneficiaries')
                    .select('id, name')
                    .eq('file_number', value)
                    .limit(1)
                    .maybeSingle();
                if (qError) throw new Error(qError.message);
                if (existing) {
                    setError(`File number "${value}" is already assigned to ${existing.name}.`);
                    return;
                }
            }

            // Duplicate check against offline-pending records
            const localDup = await db.beneficiaries.filter(b => b.file_number === value).first();
            if (localDup) {
                setError(`File number "${value}" is already assigned to ${localDup.name} (offline record).`);
                return;
            }

            const result = await updateBeneficiaryFileNumber(target.systemId, value);
            if (!result.success) {
                setError(result.error || 'Failed to assign file number.');
                return;
            }

            await auditService.log('FILE_NUMBER_ASSIGNED', {
                beneficiary_id: target.systemId,
                name: target.name,
                file_number: value,
                offline: !isOnline,
            });
            setSaved(true);
            onSuccess();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to assign file number.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-2">
                        <Hash size={18} className="text-primary" />
                        <h2 className="text-lg font-bold text-gray-800">Assign File Number</h2>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6">
                    {saved ? (
                        <div className="flex flex-col items-center text-center space-y-4">
                            <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                                <CheckCircle size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">File Number Assigned</h3>
                                <p className="text-sm text-text-muted mt-1">
                                    <b>{fileNumber.trim()}</b> is now assigned to <b>{target.name}</b>.
                                </p>
                            </div>
                            <Button className="w-full" onClick={onClose}>Close</Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm text-text-muted">
                                Assigning a file number to{' '}
                                <span className="font-semibold text-text-main">{target.name}</span>.
                            </p>

                            {blocked ? (
                                <div className="bg-orange-50 border border-orange-100 p-3 rounded-lg flex gap-2 text-sm text-orange-700">
                                    <WifiOff size={18} className="shrink-0" />
                                    You are offline. This beneficiary is already synced to the server, so the
                                    file number can only be assigned once you are back online.
                                </div>
                            ) : (
                                <>
                                    <Input
                                        label="File Number"
                                        value={fileNumber}
                                        onChange={e => setFileNumber(e.target.value)}
                                        placeholder="e.g. ROW-001"
                                    />
                                    {!isOnline && (
                                        <p className="text-xs text-orange-600 font-medium">
                                            Offline: duplicate check against server records is skipped.
                                        </p>
                                    )}
                                </>
                            )}

                            {error && (
                                <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex gap-2 text-sm text-red-600">
                                    <AlertCircle size={18} className="shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 pt-2">
                                <Button variant="outline" onClick={onClose} disabled={isSaving}>
                                    Cancel
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving || blocked} className="px-8">
                                    {isSaving ? 'Saving...' : 'Assign'}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}
