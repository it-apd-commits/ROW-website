
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { OfflineServiceEntry } from '@/lib/db';
import type { ServiceEntry, ServiceEntryPayload } from '@/types/serviceEntry';

export const ServiceEntryService = {
    /**
     * Creates a new service entry — saves to local Dexie first, then attempts
     * an immediate Supabase insert if online. If offline the record stays as
     * 'pending' and is pushed by SyncService when connectivity returns.
     */
    async createEntry(payload: ServiceEntryPayload & { remarks?: string | null }) {
        const { remarks, ...rest } = payload;
        const offlineId = `SE-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const now = new Date().toISOString();

        const localRecord: OfflineServiceEntry = {
            offline_id: offlineId,
            status: rest.status,
            file_number: rest.file_number,
            schedule_date: rest.schedule_date,
            start_date: rest.start_date,
            end_date: rest.end_date ?? null,
            location_code: rest.location_code,
            service_code: rest.service_code,
            service_provider_code: rest.service_provider_code,
            recommendation: null,
            contribution: null,
            balance: null,
            total: null,
            outcome: null,
            outcome_description: null,
            receipt_no: null,
            total_hours: rest.total_hours,
            custom_field2: rest.custom_field2 ?? null,
            mode_of_service: rest.mode_of_service,
            custom_field4: null,
            custom_field5: null,
            remarks: remarks ?? null,
            created_at: now,
            sync_status: 'pending'
        };

        const localId = await db.service_entries.add(localRecord);

        // If the service entry references an offline-registered beneficiary (file_number is an
        // offline token), skip the immediate sync — SyncService will sync the beneficiary first,
        // propagate the real file_number to this record, and then sync the entry in order.
        // Covers both manually-created offline tokens (OFF-) and Excel-imported tokens (import-).
        const fn = localRecord.file_number ?? '';
        const isOfflineBeneficiary = fn.startsWith('OFF-') || fn.startsWith('import-');

        if (navigator.onLine && !isOfflineBeneficiary) {
            const dataToSync = Object.fromEntries(
                Object.entries(localRecord).filter(([key]) => !['sync_status', 'error_message'].includes(key))
            );

            const { error } = await supabase
                .from('service_entries')
                .insert([dataToSync]);

            if (error) {
                // Data is safe in Dexie — mark failed for SyncService retry, don't block the user
                await db.service_entries.update(localId as number, {
                    sync_status: 'failed',
                    error_message: error.message
                });
                console.warn(`[ServiceEntryService] Online sync failed, will retry: ${error.message}`);
            } else {
                await db.service_entries.update(localId as number, { sync_status: 'synced' });
            }
        }

        return { ...localRecord, id: String(localId) } as unknown as ServiceEntry;
    },

    /**
     * Fetches beneficiaries for the search dropdown
     */
    async searchBeneficiaries(query: string) {
        if (!query || query.length < 1) return [];

        const { data, error } = await supabase
            .from('beneficiaries')
            .select('id, name, file_number, mobile_no')
            .or(`file_number.ilike.%${query}%,name.ilike.%${query}%`)
            .limit(10);

        if (error) {
            console.error('Error searching beneficiaries:', error);
            return [];
        }
        return data;
    },

    /**
     * Fetches service history for a specific file number
     */
    async getHistoryByFileNumber(fileNumber: string) {
        const { data, error } = await supabase
            .from('service_entries')
            .select('*')
            .eq('file_number', fileNumber)
            .order('schedule_date', { ascending: false });

        if (error) {
            console.error('Error fetching service history:', error);
            throw error;
        }
        return data as ServiceEntry[];
    },

    /**
     * Fetches a single service entry by ID
     */
    async getEntryById(id: string) {
        const { data, error } = await supabase
            .from('service_entries')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching service entry:', error);
            throw error;
        }
        return data as ServiceEntry;
    },

    /**
     * Updates an existing service entry — requires an active connection
     * since the record must already exist on the server.
     */
    async updateEntry(id: string, payload: Partial<ServiceEntry>) {
        const { data, error } = await supabase
            .from('service_entries')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating service entry:', error);
            throw error;
        }
        return data as ServiceEntry;
    }
};
