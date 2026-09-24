import { supabase } from '@/lib/supabase';
import { getScale } from '@/config/outcomeScales';
import type { ScaleConfig } from '@/config/outcomeScales';
import { DISABILITY_TYPES } from '@/constants/beneficiaryDropdowns';
import type { OutcomeRow, OutcomeSummary, OutcomeFilters, OutcomeStatus } from '@/types/outcomeEvaluation';

// FIM scales are configured with condition: 'Disability', but clinical_assessment
// rows may have been saved with a specific disability sub-type as their condition
// (see isDisabilityCondition) — match all of them, not just the literal 'Disability'.
const DISABILITY_CONDITION_VALUES = ['Disability', ...DISABILITY_TYPES];

interface BaselineRecord {
    patient_id: string;
    condition: string | null;
    disability_type: string | null;
    created_at?: string;
    [key: string]: unknown;
}

interface FollowUpRecord {
    patient_id: string;
    visit_date: string;
    condition: string | null;
    [key: string]: unknown;
}

interface InitialRecord {
    patient_id: string;
    patient_name: string;
    primary_condition: string | null;
}

// Supabase caps selects at 1000 rows by default; page through .range()
// so results aren't silently truncated on large tables.
const fetchAllRows = async <T>(
    buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }
): Promise<T[]> => {
    const PAGE_SIZE = 1000;
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }
    return rows;
};

// Batch ids for .in() filters so request URLs stay bounded.
const ID_CHUNK_SIZE = 200;
const chunk = <T>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
};

export function classifyNumeric(
    baseline: number | null,
    current: number | null,
    direction: 'higher_better' | 'lower_better'
): OutcomeStatus {
    if (baseline === null || current === null) return 'not_evaluable';
    if (baseline === current) return 'same';
    const delta = current - baseline;
    if (direction === 'higher_better') return delta > 0 ? 'improved' : 'declined';
    return delta < 0 ? 'improved' : 'declined';
}

export function classifyCategorical(
    baseline: string | null,
    current: string | null,
    ordinal: string[],
    direction: 'higher_better' | 'lower_better'
): OutcomeStatus {
    if (!baseline || !current) return 'not_evaluable';
    const bIdx = ordinal.indexOf(baseline);
    const cIdx = ordinal.indexOf(current);
    if (bIdx === -1 || cIdx === -1) return 'not_evaluable';
    if (bIdx === cIdx) return 'same';
    if (direction === 'higher_better') return cIdx > bIdx ? 'improved' : 'declined';
    return cIdx < bIdx ? 'improved' : 'declined';
}

export function classifyClinicianEntered(
    value: string | null,
    bucketMap: Record<string, string>
): OutcomeStatus {
    if (!value) return 'not_evaluable';
    const mapped = bucketMap[value];
    if (!mapped) return 'not_evaluable';
    return mapped as OutcomeStatus;
}

export function toNumeric(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const match = val.match(/^(\d+)/);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

export function classifyByScale(
    scale: ScaleConfig,
    baselineValue: unknown,
    currentValue: unknown
): OutcomeStatus {
    if (scale.family === 'clinician_entered' && scale.bucketMap) {
        return classifyClinicianEntered(currentValue as string | null, scale.bucketMap);
    }
    if (scale.family === 'numeric') {
        return classifyNumeric(toNumeric(baselineValue), toNumeric(currentValue), scale.direction);
    }
    if (scale.family === 'categorical' && scale.ordinal) {
        return classifyCategorical(
            baselineValue as string | null,
            currentValue as string | null,
            scale.ordinal,
            scale.direction
        );
    }
    return 'not_evaluable';
}

export function summarize(rows: OutcomeRow[]): OutcomeSummary {
    const summary: OutcomeSummary = {
        total: rows.length,
        improved: 0,
        declined: 0,
        same: 0,
        baseline_only: 0,
        needs_referral: 0,
        not_evaluable: 0,
    };
    for (const r of rows) {
        if (r.status in summary) {
            summary[r.status as keyof OutcomeSummary]++;
        }
    }
    return summary;
}

// All-time count of beneficiaries with a baseline under this scale's condition
// (and disability sub-type, if given) — deliberately ignores fromDate/toDate,
// unlike getOutcomes(), so the Reports page can show it alongside the
// date-filtered "Total Patients" count for context (e.g. "184 of 913 total").
export async function getConditionTotalCount(scaleId: string, disabilityType?: string): Promise<number> {
    const scale = getScale(scaleId);
    if (!scale) return 0;

    const rows = await fetchAllRows<{ patient_id: string }>(() => {
        let query = supabase.from('clinical_assessment').select('patient_id');
        if (scale.condition === 'Disability') {
            query = query.in('condition', DISABILITY_CONDITION_VALUES);
        } else if (scale.condition) {
            query = query.eq('condition', scale.condition);
        }
        if (disabilityType) {
            query = query.eq('disability_type', disabilityType);
        }
        return query;
    });

    return new Set(rows.map(r => r.patient_id)).size;
}

export async function getOutcomes(filters: OutcomeFilters): Promise<OutcomeRow[]> {
    const scale = getScale(filters.scaleId);
    if (!scale) throw new Error(`Unknown scale: ${filters.scaleId}`);

    const initials = await fetchAllRows<InitialRecord>(() => supabase
        .from('initial_assessment')
        .select('patient_id, patient_name, primary_condition'));
    if (initials.length === 0) return [];

    const initialMap = new Map<string, InitialRecord>();
    for (const i of initials as InitialRecord[]) {
        initialMap.set(i.patient_id, i);
    }

    const patientIds = initials.map((i: InitialRecord) => i.patient_id);

    const clinicals: BaselineRecord[] = [];
    const followUps: FollowUpRecord[] = [];

    for (const idBatch of chunk(patientIds, ID_CHUNK_SIZE)) {
        const [batchClinicals, batchFollowUps] = await Promise.all([
            fetchAllRows<BaselineRecord>(() => {
                let clinicalQuery = supabase
                    .from('clinical_assessment')
                    .select('*')
                    .in('patient_id', idBatch)
                    .order('created_at', { ascending: true });

                if (scale.condition === 'Disability') {
                    clinicalQuery = clinicalQuery.in('condition', DISABILITY_CONDITION_VALUES);
                } else if (scale.condition) {
                    clinicalQuery = clinicalQuery.eq('condition', scale.condition);
                }

                if (filters.disabilityType) {
                    clinicalQuery = clinicalQuery.eq('disability_type', filters.disabilityType);
                }

                return clinicalQuery;
            }),
            fetchAllRows<FollowUpRecord>(() => {
                let followUpQuery = supabase
                    .from('follow_up_assessment')
                    .select('*')
                    .in('patient_id', idBatch)
                    .order('visit_date', { ascending: false });

                if (filters.fromDate) {
                    followUpQuery = followUpQuery.gte('visit_date', filters.fromDate);
                }
                if (filters.toDate) {
                    followUpQuery = followUpQuery.lte('visit_date', filters.toDate);
                }

                return followUpQuery;
            }),
        ]);
        clinicals.push(...batchClinicals);
        followUps.push(...batchFollowUps);
    }

    if (clinicals.length === 0) return [];

    const baselineMap = new Map<string, BaselineRecord>();
    for (const c of clinicals as BaselineRecord[]) {
        if (!baselineMap.has(c.patient_id)) {
            baselineMap.set(c.patient_id, c);
        }
    }

    const latestFollowUpMap = new Map<string, FollowUpRecord>();
    const followUpCountMap = new Map<string, number>();
    for (const f of followUps as FollowUpRecord[]) {
        if (!latestFollowUpMap.has(f.patient_id)) {
            latestFollowUpMap.set(f.patient_id, f);
        }
        followUpCountMap.set(f.patient_id, (followUpCountMap.get(f.patient_id) || 0) + 1);
    }

    const rows: OutcomeRow[] = [];
    // A From/To Date filter is scoped to follow-up visits (the field labels say
    // so) — a patient with no follow-up landing inside that window has nothing
    // to show for the selected period, so exclude them entirely instead of
    // falling back to a dateless "Baseline Only" row. Without this, the date
    // filter never changed the row count and looked like it did nothing.
    const hasDateFilter = Boolean(filters.fromDate || filters.toDate);

    for (const [patientId, baseline] of baselineMap) {
        const initial = initialMap.get(patientId);
        if (!initial) continue;

        const followUp = latestFollowUpMap.get(patientId);

        const baselineValue = baseline[scale.baselineField] ?? null;

        if (!followUp) {
            if (hasDateFilter) continue;
            rows.push({
                patient_id: patientId,
                file_number: patientId,
                name: initial.patient_name,
                scale_id: scale.id,
                baseline_value: baselineValue as string | number | null,
                baseline_date: baseline.created_at || null,
                current_value: null,
                current_date: null,
                status: 'baseline_only',
                follow_up_count: followUpCountMap.get(patientId) || 0,
            });
            continue;
        }

        const currentValue = followUp[scale.followUpField] ?? null;

        const status = classifyByScale(scale, baselineValue, currentValue);

        rows.push({
            patient_id: patientId,
            file_number: patientId,
            name: initial.patient_name,
            scale_id: scale.id,
            baseline_value: baselineValue as string | number | null,
            baseline_date: baseline.created_at || null,
            current_value: currentValue as string | number | null,
            current_date: followUp.visit_date,
            status,
            follow_up_count: followUpCountMap.get(patientId) || 0,
        });
    }

    return rows;
}
