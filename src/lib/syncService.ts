import { db } from './db';
import { supabase } from './supabase';
import { TokenService } from '@/services/tokenService';

export const SyncService = {
    async syncPendingRecords() {
        if (!navigator.onLine) return;
        // Beneficiaries must sync first so their server-assigned file_number
        // can be propagated to any pending service entries before those sync.
        await SyncService.syncPendingBeneficiaries();
        await Promise.all([
            SyncService.syncPendingServiceEntries(),
            SyncService.syncPendingAssessments(),
        ]);
    },

    async syncPendingBeneficiaries() {
        const recordsToSync = await db.beneficiaries
            .where('sync_status')
            .anyOf(['pending', 'failed'])
            .toArray();

        if (recordsToSync.length === 0) return;

        console.log(`[SyncService] Starting beneficiary sync for ${recordsToSync.length} records...`);

        for (const record of recordsToSync) {
            try {
                const dataToSync = Object.fromEntries(
                    Object.entries(record).filter(([key]) => !['id', 'sync_status', 'error_message'].includes(key))
                );

                const { data, error } = await supabase
                    .from('beneficiaries')
                    .insert([dataToSync])
                    .select('*')
                    .single();

                if (error) {
                    if (error.code === '23505') {
                        console.warn(`[SyncService] Beneficiary ${record.offline_token} already exists on server.`);
                        await db.beneficiaries.update(record.id!, { sync_status: 'synced' });
                    } else {
                        throw error;
                    }
                } else {
                    await db.beneficiaries.update(record.id!, {
                        sync_status: 'synced',
                        token_no: data.token_no,
                        file_number: data.file_number,
                    });
                    if (data.token_no) {
                        await TokenService.updateLastToken(data.token_no);
                    }
                    // Re-link any service entries (Dexie + Supabase) created against this offline beneficiary
                    if (data.file_number && record.offline_token) {
                        const updatedCount = await db.service_entries
                            .where('file_number')
                            .equals(record.offline_token)
                            .modify({ file_number: data.file_number });
                        if (updatedCount > 0) {
                            console.log(`[SyncService] Linked ${updatedCount} service ${updatedCount === 1 ? 'entry' : 'entries'} to file number ${data.file_number}`);
                        }
                        // Also fix entries already pushed to Supabase with the offline token
                        await supabase
                            .from('service_entries')
                            .update({ file_number: data.file_number })
                            .eq('file_number', record.offline_token);
                    }
                    console.log(`[SyncService] Synced beneficiary ${record.name} (Token: ${data.token_no}, File: ${data.file_number})`);
                }
            } catch (err) {
                console.error(`[SyncService] Beneficiary sync failed for ${record.name}:`, err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                await db.beneficiaries.update(record.id!, {
                    sync_status: 'failed',
                    error_message: message
                });
            }
        }
    },

    async syncPendingAssessments() {
        const [pendingInitials, pendingClinicals, pendingFollowUps] = await Promise.all([
            db.offline_initial_assessments.where('sync_status').anyOf(['pending', 'failed']).toArray(),
            db.offline_clinical_assessments.where('sync_status').anyOf(['pending', 'failed']).toArray(),
            db.offline_follow_up_assessments.where('sync_status').anyOf(['pending', 'failed']).toArray(),
        ]);

        const total = pendingInitials.length + pendingClinicals.length + pendingFollowUps.length;
        if (total === 0) return;

        console.log(`[SyncService] Assessment sync: ${pendingInitials.length} initial, ${pendingClinicals.length} clinical, ${pendingFollowUps.length} follow-up`);

        const allPatientIds = new Set([
            ...pendingInitials.map(r => r.patient_id),
            ...pendingClinicals.map(r => r.patient_id),
            ...pendingFollowUps.map(r => r.patient_id),
        ]);

        for (const patientId of allPatientIds) {
            let initialFailed = false;

            // Step 1: Initial (upsert — covers both create and offline update)
            const initial = pendingInitials.find(r => r.patient_id === patientId);
            if (initial) {
                try {
                    const dataToSync = Object.fromEntries(
                        Object.entries(initial).filter(([key]) => !['sync_status', 'error_message'].includes(key))
                    );
                    const { error } = await supabase
                        .from('initial_assessment')
                        .upsert(dataToSync, { onConflict: 'patient_id' });
                    if (error) throw error;
                    await db.offline_initial_assessments.update(patientId, { sync_status: 'synced' });
                    console.log(`[SyncService] Synced initial assessment for ${patientId}`);
                } catch (err) {
                    console.error(`[SyncService] Initial assessment sync failed for ${patientId}:`, err);
                    await db.offline_initial_assessments.update(patientId, {
                        sync_status: 'failed',
                        error_message: err instanceof Error ? err.message : 'Unknown error'
                    });
                    initialFailed = true;
                }
            }

            // Skip clinical and follow-ups for this patient if initial failed (FK constraint)
            if (initialFailed) continue;

            // Step 2: Clinical (insert — one per patient)
            const clinical = pendingClinicals.find(r => r.patient_id === patientId);
            if (clinical) {
                try {
                    const dataToSync = Object.fromEntries(
                        Object.entries(clinical).filter(([key]) => !['sync_status', 'error_message'].includes(key))
                    );
                    const { error } = await supabase
                        .from('clinical_assessment')
                        .upsert(dataToSync, { onConflict: 'patient_id' });
                    if (error) throw error;
                    await db.offline_clinical_assessments.update(patientId, { sync_status: 'synced' });
                    console.log(`[SyncService] Synced clinical assessment for ${patientId}`);
                } catch (err) {
                    console.error(`[SyncService] Clinical assessment sync failed for ${patientId}:`, err);
                    await db.offline_clinical_assessments.update(patientId, {
                        sync_status: 'failed',
                        error_message: err instanceof Error ? err.message : 'Unknown error'
                    });
                }
            }

            // Step 3: Follow-ups in session order
            const followUps = pendingFollowUps
                .filter(r => r.patient_id === patientId)
                .sort((a, b) => a.session_number - b.session_number);

            for (const fu of followUps) {
                try {
                    const dataToSync = Object.fromEntries(
                        Object.entries(fu).filter(([key]) => !['sync_status', 'error_message'].includes(key))
                    );
                    const { error } = await supabase
                        .from('follow_up_assessment')
                        .insert(dataToSync);
                    if (error) {
                        if (error.code === '23505') {
                            await db.offline_follow_up_assessments.update(
                                [fu.patient_id, fu.session_number], { sync_status: 'synced' }
                            );
                        } else {
                            throw error;
                        }
                    } else {
                        await db.offline_follow_up_assessments.update(
                            [fu.patient_id, fu.session_number], { sync_status: 'synced' }
                        );
                    }
                    console.log(`[SyncService] Synced follow-up #${fu.session_number} for ${patientId}`);
                } catch (err) {
                    console.error(`[SyncService] Follow-up sync failed for ${patientId} #${fu.session_number}:`, err);
                    await db.offline_follow_up_assessments.update(
                        [fu.patient_id, fu.session_number],
                        { sync_status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown error' }
                    );
                }
            }
        }
    },

    async syncPendingServiceEntries() {
        const recordsToSync = await db.service_entries
            .where('sync_status')
            .anyOf(['pending', 'failed'])
            .toArray();

        if (recordsToSync.length === 0) return;

        console.log(`[SyncService] Starting service entry sync for ${recordsToSync.length} records...`);

        for (const record of recordsToSync) {
            try {
                const dataToSync = Object.fromEntries(
                    Object.entries(record).filter(([key]) => !['id', 'sync_status', 'error_message'].includes(key))
                );

                const { error } = await supabase
                    .from('service_entries')
                    .insert([dataToSync]);

                if (error) {
                    if (error.code === '23505') {
                        console.warn(`[SyncService] Service entry ${record.offline_id} already exists on server.`);
                        await db.service_entries.update(record.id!, { sync_status: 'synced' });
                    } else {
                        throw error;
                    }
                } else {
                    await db.service_entries.update(record.id!, { sync_status: 'synced' });
                    console.log(`[SyncService] Synced service entry ${record.offline_id}`);
                }
            } catch (err) {
                console.error(`[SyncService] Service entry sync failed for ${record.offline_id}:`, err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                await db.service_entries.update(record.id!, {
                    sync_status: 'failed',
                    error_message: message
                });
            }
        }
    }
};
