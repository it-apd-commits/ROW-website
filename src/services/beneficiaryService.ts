import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

export interface UpdateResult {
    success: boolean;
    error?: string;
}

export interface BeneficiaryCandidate {
    id: string;
    name: string;
    mobile_no: string | null;
    city: string | null;
    district: string | null;
}

export type FindOrCreateMatchType = 'phone' | 'name' | 'created' | 'needs_confirmation';

export interface FindOrCreateResult {
    matchType: FindOrCreateMatchType;
    beneficiary?: BeneficiaryCandidate;
    candidates?: BeneficiaryCandidate[];
}

export interface FindOrCreateInput {
    name: string;
    phone?: string;
    city?: string;
    district?: string;
    forceCreate?: boolean;
}

/**
 * Phone → exact match auto-links. No phone → name+city candidates returned
 * for staff confirmation. forceCreate bypasses matching and creates a stub
 * with registration_status='pending'.
 */
export const findOrCreateBeneficiary = async (
    input: FindOrCreateInput
): Promise<FindOrCreateResult> => {
    const name = input.name.trim();
    const phone = input.phone?.trim();
    const city = input.city?.trim();
    const district = input.district?.trim();

    if (!input.forceCreate && phone) {
        const { data: phoneMatch } = await supabase
            .from('beneficiaries')
            .select('id, name, mobile_no, city, district')
            .eq('mobile_no', phone)
            .limit(1)
            .maybeSingle();

        if (phoneMatch) {
            return { matchType: 'phone', beneficiary: phoneMatch };
        }
    }

    if (!input.forceCreate && name) {
        let query = supabase
            .from('beneficiaries')
            .select('id, name, mobile_no, city, district')
            .ilike('name', `%${name}%`);

        if (city) query = query.ilike('city', city);
        else if (district) query = query.ilike('district', district);

        const { data: nameMatches } = await query.limit(5);

        if (nameMatches && nameMatches.length > 0) {
            return { matchType: 'needs_confirmation', candidates: nameMatches };
        }
    }

    const { data: created, error } = await supabase
        .from('beneficiaries')
        .insert({
            name,
            mobile_no: phone || null,
            city: city || null,
            district: district || null,
            registration_status: 'pending',
            status: 'Active',
        })
        .select('id, name, mobile_no, city, district')
        .single();

    if (error || !created) {
        throw new Error(error?.message || 'Failed to create beneficiary stub');
    }

    return { matchType: 'created', beneficiary: created };
};

export const updateBeneficiaryFileNumber = async (systemId: string, fileNumber: string): Promise<UpdateResult> => {
    try {
        // 1. Try updating in Supabase (for synced records)
        // Match by ID (UUID) or offline_token. Non-UUID systemIds (OFF-/import-
        // tokens) must not go through id.eq — Postgres fails the whole query
        // with a uuid cast error (22P02) and the server never gets updated.
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(systemId);
        let updateQuery = supabase
            .from('beneficiaries')
            .update({ file_number: fileNumber });
        updateQuery = isUuid
            ? updateQuery.or(`id.eq.${systemId},offline_token.eq.${systemId}`)
            : updateQuery.eq('offline_token', systemId);
        const { data, error } = await updateQuery.select();

        if (error) {
            console.error('Supabase update error:', error);
            // Fallback to local DB if Supabase fails (e.g. offline or other error)
            const localUpdated = await db.beneficiaries
                .where('offline_token')
                .equals(systemId)
                .modify({ file_number: fileNumber });

            if (localUpdated) {
                return { success: true };
            }
            return { success: false, error: error.message };
        }

        if (data && data.length > 0) {
            return { success: true };
        }

        // 2. If not found in Supabase, try local DB (for pending offline records)
        const localUpdated = await db.beneficiaries
            .where('offline_token')
            .equals(systemId)
            .modify({ file_number: fileNumber });

        if (localUpdated) {
            return { success: true };
        }

        return { success: false, error: 'Not Matched' };
    } catch (err) {
        console.error('Update beneficiary file number error:', err);
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
};
