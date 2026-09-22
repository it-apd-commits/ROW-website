export type OutcomeStatus = 'improved' | 'declined' | 'same' | 'baseline_only' | 'needs_referral' | 'not_evaluable';

export interface OutcomeRow {
    patient_id: string;
    file_number: string;
    name: string;
    scale_id: string;
    baseline_value: string | number | null;
    baseline_date: string | null;
    current_value: string | number | null;
    current_date: string | null;
    status: OutcomeStatus;
    follow_up_count: number;
}

export interface OutcomeSummary {
    total: number;
    improved: number;
    declined: number;
    same: number;
    baseline_only: number;
    needs_referral: number;
    not_evaluable: number;
}

export interface OutcomeFilters {
    scaleId: string;
    fromDate?: string;
    toDate?: string;
    disabilityType?: string;
}
