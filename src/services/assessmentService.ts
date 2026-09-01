import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { OfflineInitialAssessment, OfflineClinicalAssessment, OfflineFollowUpAssessment } from '@/lib/db';
import type { InitialAssessment, ClinicalAssessment, FollowUpAssessment } from '@/types/assessment';

export const assessmentService = {
    // ── Generate Patient ID ──
    // Online format:  ROW-YYYYMMDD-0001 (sequential from server)
    // Offline format: ROW-YYYYMMDD-O001 (local sequence, O prefix prevents collision)
    async generatePatientId(): Promise<string> {
        const today = new Date().toISOString().split('T')[0];
        const dateKey = today.replace(/-/g, '');
        const prefix = `ROW-${dateKey}-`;

        if (navigator.onLine) {
            const { data, error } = await supabase
                .from('initial_assessment')
                .select('patient_id')
                .like('patient_id', `${prefix}%`);

            let seq = 1;
            if (!error && data && data.length > 0) {
                // Only numeric final segments count — offline IDs (O001) must be ignored,
                // otherwise 'O...' sorts above digits and the sequence would reset/collide.
                const maxNum = data.reduce((max: number, row: { patient_id: string }) => {
                    const segment = row.patient_id.split('-').pop() || '';
                    if (!/^\d+$/.test(segment)) return max;
                    const num = parseInt(segment, 10);
                    return num > max ? num : max;
                }, 0);
                seq = maxNum + 1;
            }
            return `${prefix}${String(seq).padStart(4, '0')}`;
        }

        // Offline: use local day-sequence stored in metadata
        const metaKey = `local_patient_seq_${dateKey}`;
        const existing = await db.metadata.get(metaKey);
        const nextSeq = existing ? (existing.value as number) + 1 : 1;
        await db.metadata.put({ key: metaKey, value: nextSeq });
        return `${prefix}O${String(nextSeq).padStart(3, '0')}`;
    },

    // ── Initial Assessment (Step 1) ──

    async createInitial(data: Omit<InitialAssessment, 'created_at'>): Promise<InitialAssessment> {
        const now = new Date().toISOString();
        const localRecord: OfflineInitialAssessment = { ...data, created_at: now, sync_status: 'pending' };

        await db.offline_initial_assessments.put(localRecord);

        if (navigator.onLine) {
            try {
                const { data: result, error } = await supabase
                    .from('initial_assessment')
                    .upsert(data, { onConflict: 'patient_id' })
                    .select()
                    .single();
                if (error) throw error;
                await db.offline_initial_assessments.update(data.patient_id, { sync_status: 'synced' });
                return result as InitialAssessment;
            } catch (err) {
                await db.offline_initial_assessments.update(data.patient_id, {
                    sync_status: 'failed',
                    error_message: err instanceof Error ? err.message : 'Unknown error'
                });
                throw err;
            }
        }

        return localRecord as InitialAssessment;
    },

    async getInitial(patientId: string): Promise<InitialAssessment | null> {
        if (navigator.onLine) {
            const { data, error } = await supabase
                .from('initial_assessment')
                .select('*')
                .eq('patient_id', patientId)
                .single();
            if (!error && data) return data as InitialAssessment;
        }
        const local = await db.offline_initial_assessments.get(patientId);
        return local ?? null;
    },

    async updateInitial(patientId: string, data: Partial<InitialAssessment>): Promise<InitialAssessment> {
        if (navigator.onLine) {
            const { data: result, error } = await supabase
                .from('initial_assessment')
                .update(data)
                .eq('patient_id', patientId)
                .select()
                .single();
            if (!error) {
                await db.offline_initial_assessments.update(patientId, { ...data, sync_status: 'synced' });
                return result as InitialAssessment;
            }
            // PGRST116 = no row matched: record was created offline and hasn't synced
            // yet — fall through to the local update path instead of blocking the save.
            if (error.code !== 'PGRST116') { console.error('Update initial assessment error:', error); throw error; }
        }
        // Offline: update local record and mark pending for sync
        const existing = await db.offline_initial_assessments.get(patientId);
        if (existing) {
            const updated: OfflineInitialAssessment = { ...existing, ...data, sync_status: 'pending' };
            await db.offline_initial_assessments.put(updated);
            return updated as InitialAssessment;
        }
        // Record not cached locally — store the partial update so it can be synced
        const newRecord = { patient_id: patientId, ...data, sync_status: 'pending' } as OfflineInitialAssessment;
        await db.offline_initial_assessments.put(newRecord);
        return newRecord as InitialAssessment;
    },

    // ── Clinical Assessment (Step 2) ──

    async createClinical(data: Omit<ClinicalAssessment, 'id' | 'created_at'>): Promise<ClinicalAssessment> {
        const now = new Date().toISOString();
        const localRecord: OfflineClinicalAssessment = { ...data, created_at: now, sync_status: 'pending' };

        await db.offline_clinical_assessments.put(localRecord);

        if (navigator.onLine) {
            try {
                // Upsert, not insert — the background sync process can independently
                // push this same pending record to Supabase moments before this direct
                // save runs (e.g. after a brief reconnect), and clinical_assessment only
                // allows one row per patient_id. A plain insert would then fail with a
                // duplicate-key error even though the record already saved successfully.
                const { data: result, error } = await supabase
                    .from('clinical_assessment')
                    .upsert(data, { onConflict: 'patient_id' })
                    .select()
                    .single();
                if (error) throw error;
                await db.offline_clinical_assessments.update(data.patient_id, { sync_status: 'synced' });
                return result as ClinicalAssessment;
            } catch (err) {
                await db.offline_clinical_assessments.update(data.patient_id, {
                    sync_status: 'failed',
                    error_message: err instanceof Error ? err.message : 'Unknown error'
                });
                throw err;
            }
        }

        return localRecord as ClinicalAssessment;
    },

    async getClinical(patientId: string): Promise<ClinicalAssessment | null> {
        if (navigator.onLine) {
            const { data, error } = await supabase
                .from('clinical_assessment')
                .select('*')
                .eq('patient_id', patientId)
                .single();
            if (!error && data) return data as ClinicalAssessment;
        }
        const local = await db.offline_clinical_assessments.get(patientId);
        return local ?? null;
    },

    async updateClinical(id: number, data: Partial<ClinicalAssessment>): Promise<ClinicalAssessment> {
        const patientId = data.patient_id;

        const updateLocally = async (): Promise<ClinicalAssessment> => {
            if (!patientId) throw new Error('patient_id is required for offline clinical update');
            const existing = await db.offline_clinical_assessments.get(patientId);
            const updated: OfflineClinicalAssessment = existing
                ? { ...existing, ...data, sync_status: 'pending' }
                : { patient_id: patientId, ...data, sync_status: 'pending' } as OfflineClinicalAssessment;
            await db.offline_clinical_assessments.put(updated);
            return updated as ClinicalAssessment;
        };

        if (!navigator.onLine) return updateLocally();

        const { data: result, error } = await supabase
            .from('clinical_assessment')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error) {
            // PGRST116 = no row matched: record was created offline and hasn't synced
            // yet — fall back to the local update path instead of blocking the save.
            if (error.code === 'PGRST116') return updateLocally();
            console.error('Update clinical assessment error:', error);
            throw error;
        }

        // Keep local cache consistent so getClinical() reflects the latest data
        if (patientId) {
            await db.offline_clinical_assessments.update(patientId, { ...data, sync_status: 'synced' });
        }

        return result as ClinicalAssessment;
    },

    // ── Follow-Up Assessment (Step 3) ──

    async createFollowUp(data: Omit<FollowUpAssessment, 'id' | 'created_at'>): Promise<FollowUpAssessment> {
        const now = new Date().toISOString();
        const localRecord: OfflineFollowUpAssessment = { ...data, created_at: now, sync_status: 'pending' };

        await db.offline_follow_up_assessments.put(localRecord);

        if (navigator.onLine) {
            try {
                // Upsert, not insert — same reasoning as createClinical() above: the
                // background sync can beat this direct save to Supabase, and this would
                // otherwise fail with a duplicate-key error on the (patient_id,
                // session_number) unique constraint despite already having saved.
                const { data: result, error } = await supabase
                    .from('follow_up_assessment')
                    .upsert(data, { onConflict: 'patient_id,session_number' })
                    .select()
                    .single();
                if (error) throw error;
                await db.offline_follow_up_assessments.update(
                    [data.patient_id, data.session_number],
                    { sync_status: 'synced' }
                );
                return result as FollowUpAssessment;
            } catch (err) {
                await db.offline_follow_up_assessments.update(
                    [data.patient_id, data.session_number],
                    { sync_status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown error' }
                );
                throw err;
            }
        }

        return localRecord as FollowUpAssessment;
    },

    async updateFollowUp(id: number, data: Partial<FollowUpAssessment>): Promise<FollowUpAssessment> {
        const patientId = data.patient_id;
        const sessionNumber = data.session_number;

        if (!navigator.onLine) {
            if (!patientId || sessionNumber === undefined) throw new Error('patient_id and session_number are required for offline follow-up update');
            const existing = await db.offline_follow_up_assessments.get([patientId, sessionNumber]);
            const updated: OfflineFollowUpAssessment = existing
                ? { ...existing, ...data, sync_status: 'pending' }
                : { patient_id: patientId, session_number: sessionNumber, ...data, sync_status: 'pending' } as OfflineFollowUpAssessment;
            await db.offline_follow_up_assessments.put(updated);
            return { ...updated, id: undefined } as FollowUpAssessment;
        }

        const { data: result, error } = await supabase
            .from('follow_up_assessment')
            .update(data)
            .eq('id', id)
            .select()
            .single();
        if (error) { console.error('Update follow-up error:', error); throw error; }

        // Keep local cache consistent so getFollowUps() reflects the latest data
        if (patientId && sessionNumber !== undefined) {
            await db.offline_follow_up_assessments.update([patientId, sessionNumber], { ...data, sync_status: 'synced' });
        }

        return result as FollowUpAssessment;
    },

    async getFollowUps(patientId: string): Promise<FollowUpAssessment[]> {
        const serverRecords: FollowUpAssessment[] = [];

        if (navigator.onLine) {
            const { data, error } = await supabase
                .from('follow_up_assessment')
                .select('*')
                .eq('patient_id', patientId)
                .order('session_number', { ascending: true });
            if (!error && data) serverRecords.push(...(data as FollowUpAssessment[]));
        }

        // Merge local sessions so they appear immediately after offline save.
        // When offline, include synced (cached) sessions too — otherwise history
        // looks shorter than it is and new sessions reuse existing session numbers.
        const localRecords = await db.offline_follow_up_assessments
            .where('patient_id')
            .equals(patientId)
            .filter(r => !navigator.onLine || r.sync_status !== 'synced')
            .sortBy('session_number');

        const serverSessionNums = new Set(serverRecords.map(r => r.session_number));
        const onlyLocal = localRecords
            .filter(r => !serverSessionNums.has(r.session_number))
            .map(r => ({ ...r, id: undefined } as FollowUpAssessment));

        const all = [...serverRecords, ...onlyLocal];
        all.sort((a, b) => (a.session_number || 0) - (b.session_number || 0));
        return all;
    },

    // ── Delete entire assessment (all 3 tables) ──
    async deleteAssessment(patientId: string): Promise<void> {
        if (!navigator.onLine) throw new Error('Cannot delete assessment while offline. Please reconnect and try again.');

        // Delete follow-ups first, then clinical, then initial (child -> parent order)
        const { error: fuErr } = await supabase
            .from('follow_up_assessment')
            .delete()
            .eq('patient_id', patientId);
        if (fuErr) { console.error('Delete follow-ups error:', fuErr); throw fuErr; }

        const { error: clErr } = await supabase
            .from('clinical_assessment')
            .delete()
            .eq('patient_id', patientId);
        if (clErr) { console.error('Delete clinical error:', clErr); throw clErr; }

        const { error: inErr } = await supabase
            .from('initial_assessment')
            .delete()
            .eq('patient_id', patientId);
        if (inErr) { console.error('Delete initial error:', inErr); throw inErr; }

        // Also clean up local records
        await Promise.all([
            db.offline_follow_up_assessments.where('patient_id').equals(patientId).delete(),
            db.offline_clinical_assessments.delete(patientId),
            db.offline_initial_assessments.delete(patientId),
        ]);
    },

    async getLatestFollowUp(patientId: string): Promise<FollowUpAssessment | null> {
        if (navigator.onLine) {
            const { data, error } = await supabase
                .from('follow_up_assessment')
                .select('*')
                .eq('patient_id', patientId)
                .order('session_number', { ascending: false })
                .limit(1)
                .single();
            if (!error && data) return data as FollowUpAssessment;
        }
        const local = await db.offline_follow_up_assessments
            .where('patient_id')
            .equals(patientId)
            .sortBy('session_number');
        if (local.length === 0) return null;
        const latest = local[local.length - 1];
        return { ...latest, id: undefined } as FollowUpAssessment;
    },
};
