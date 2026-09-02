import Dexie, { type Table } from 'dexie';
import type { InitialAssessment, ClinicalAssessment, FollowUpAssessment } from '@/types/assessment';

export interface OfflineBeneficiary {
    id?: string;
    offline_token: string;
    name: string;
    age: number;
    gender: string;
    date_of_registration: string;
    parent_guardian?: string;
    relationship?: string;
    beneficiary_type: string;
    status: string;
    address?: string;
    address_type?: string;
    country: string;
    state: string;
    district?: string;
    city?: string;
    pincode?: string;
    mobile_no?: string;
    purpose_of_visit: string;
    disability_type: string;
    program: string;
    donor?: string;
    economic_status: string;
    token_no?: number;
    created_at: string;
    sync_status: 'pending' | 'synced' | 'failed';
    error_message?: string;
    file_number?: string;
}

export interface OfflineServiceEntry {
    id?: number;
    offline_id: string; // UUID for deduplication — must also exist as a nullable unique column in Supabase service_entries
    status: 'SCHEDULED' | 'AVAILED';
    file_number: string | null;
    schedule_date: string;
    start_date: string;
    end_date: string | null;
    location_code: string;
    service_code: string;
    service_provider_code: string;
    recommendation: string | null;
    contribution: number | null;
    balance: number | null;
    total: number | null;
    outcome: string | null;
    outcome_description: string | null;
    receipt_no: string | null;
    total_hours: number;
    custom_field2: string | null;
    mode_of_service: string;
    custom_field4: string | null;
    custom_field5: string | null;
    remarks: string | null;
    created_at: string;
    sync_status: 'pending' | 'synced' | 'failed';
    error_message?: string;
}

// Assessment offline types extend the server types with sync tracking fields.
// patient_id is the Dexie primary key for initial and clinical (one record per patient).
// [patient_id + session_number] is the compound PK for follow-ups.

export type OfflineInitialAssessment = InitialAssessment & {
    sync_status: 'pending' | 'synced' | 'failed';
    error_message?: string;
};

export type OfflineClinicalAssessment = ClinicalAssessment & {
    sync_status: 'pending' | 'synced' | 'failed';
    error_message?: string;
};

export type OfflineFollowUpAssessment = FollowUpAssessment & {
    sync_status: 'pending' | 'synced' | 'failed';
    error_message?: string;
};

export interface AppMetadata {
    key: string;
    value: unknown;
}

export class ROWDatabase extends Dexie {
    beneficiaries!: Table<OfflineBeneficiary>;
    service_entries!: Table<OfflineServiceEntry>;
    offline_initial_assessments!: Table<OfflineInitialAssessment, string>;
    offline_clinical_assessments!: Table<OfflineClinicalAssessment, string>;
    offline_follow_up_assessments!: Table<OfflineFollowUpAssessment, [string, number]>;
    metadata!: Table<AppMetadata>;

    constructor() {
        super('ROWOfflineDB');
        this.version(2).stores({
            beneficiaries: '++id, offline_token, name, sync_status, created_at',
            metadata: 'key'
        });
        this.version(3).stores({
            beneficiaries: '++id, offline_token, name, sync_status, created_at',
            metadata: 'key',
            service_entries: '++id, offline_id, file_number, sync_status, created_at'
        });
        this.version(4).stores({
            beneficiaries: '++id, offline_token, name, sync_status, created_at',
            metadata: 'key',
            service_entries: '++id, offline_id, file_number, sync_status, created_at',
            offline_initial_assessments: 'patient_id, sync_status, assessment_date',
            offline_clinical_assessments: 'patient_id, sync_status',
            offline_follow_up_assessments: '[patient_id+session_number], patient_id, sync_status'
        });
        // Indexes beneficiary_offline_token so the sync process can look up
        // assessments awaiting a beneficiary's real ID (see beneficiary_id on
        // InitialAssessment). Purely additive — existing rows just get an
        // undefined value for the new index until they're touched.
        this.version(5).stores({
            offline_initial_assessments: 'patient_id, sync_status, assessment_date, beneficiary_offline_token'
        });
    }
}

export const db = new ROWDatabase();
