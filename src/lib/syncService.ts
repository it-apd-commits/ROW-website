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

    async pullBeneficiariesFromServer(
        onProgress?: (downloaded: number, total: number) => void
    ): Promise<{ downloaded: number; total: number }> {
        if (!navigator.onLine) throw new Error('No internet connection');

        // Retrieve last pull timestamp for incremental sync
        const meta = await db.metadata.get('last_beneficiary_pull');
        const lastPull = meta?.value as string | undefined;

        // Count how many records are available to download
        let countQuery = supabase
            .from('beneficiaries')
            .select('*', { count: 'exact', head: true });
        if (lastPull) {
            countQuery = countQuery.gt('created_at', lastPull);
        }
        const { count, error: countError } = await countQuery;
        if (countError) throw countError;

        const total = count ?? 0;

        if (total === 0) {
            await db.metadata.put({ key: 'last_beneficiary_pull', value: new Date().toISOString() });
            console.log('[SyncService] No new beneficiaries to pull from server');
            return { downloaded: 0, total: 0 };
        }

        console.log(`[SyncService] Pulling ${total} beneficiaries from server...`);

        const BATCH_SIZE = 500;
        let downloaded = 0;

        for (let offset = 0; offset < total; offset += BATCH_SIZE) {
            let query = supabase
                .from('beneficiaries')
                .select('*')
                .order('created_at', { ascending: true })
                .range(offset, offset + BATCH_SIZE - 1);
            if (lastPull) {
                query = query.gt('created_at', lastPull);
            }

            const { data, error } = await query;
            if (error) throw error;

            // Skip records whose offline_token already exists in Dexie — those were
            // created on this device and are already stored locally (avoids duplicates).
            const batchTokens = (data ?? [])
                .map((r: Record<string, unknown>) => r.offline_token as string)
                .filter(Boolean);
            const existingTokens = batchTokens.length > 0
                ? new Set(
                    (await db.beneficiaries
                        .where('offline_token')
                        .anyOf(batchTokens)
                        .toArray()
                    ).map(r => r.offline_token)
                )
                : new Set<string>();

            const recordsToPut = (data ?? [])
                .filter((r: Record<string, unknown>) => !r.offline_token || !existingTokens.has(r.offline_token as string))
                .map((r: Record<string, unknown>) => ({
                    ...r,
                    sync_status: 'synced' as const,
                }));

            await db.beneficiaries.bulkPut(recordsToPut as unknown as Parameters<typeof db.beneficiaries.bulkPut>[0]);
            downloaded += recordsToPut.length;
            onProgress?.(downloaded, total);
            console.log(`[SyncService] Pulled batch: ${downloaded}/${total}`);
        }

        await db.metadata.put({ key: 'last_beneficiary_pull', value: new Date().toISOString() });
        console.log(`[SyncService] Pull complete — ${downloaded} beneficiaries stored locally`);
        return { downloaded, total };
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

                // Resolve offline-token file_numbers (OFF- or import-) to the beneficiary's
                // real file_number or UUID before pushing to Supabase.
                const storedFn = record.file_number ?? '';
                if (storedFn.startsWith('OFF-') || storedFn.startsWith('import-')) {
                    const { data: bData } = await supabase
                        .from('beneficiaries')
                        .select('id, file_number')
                        .eq('offline_token', storedFn)
                        .maybeSingle();

                    if (!bData) {
                        // Beneficiary hasn't reached the server yet — defer this entry
                        // so it syncs after the beneficiary does on the next cycle.
                        console.log(`[SyncService] Deferring service entry ${record.offline_id} — beneficiary not on server yet`);
                        continue;
                    }

                    const resolvedFn = bData.file_number ?? bData.id;
                    dataToSync.file_number = resolvedFn;
                    // Persist the resolved value to Dexie so future cycles use it directly.
                    await db.service_entries.update(record.id!, { file_number: resolvedFn });
                    console.log(`[SyncService] Resolved file_number ${storedFn} → ${resolvedFn} for entry ${record.offline_id}`);
                }

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
