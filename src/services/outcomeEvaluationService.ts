import { supabase } from '@/lib/supabase';
import { getScale } from '@/config/outcomeScales';
import type { OutcomeRow, OutcomeSummary, OutcomeFilters, OutcomeStatus } from '@/types/outcomeEvaluation';

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

function classifyNumeric(
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

function classifyCategorical(
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

function classifyClinicianEntered(
    value: string | null,
    bucketMap: Record<string, string>
): OutcomeStatus {
    if (!value) return 'not_evaluable';
    const mapped = bucketMap[value];
    if (!mapped) return 'not_evaluable';
    return mapped as OutcomeStatus;
}

function toNumeric(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const match = val.match(/^(\d+)/);
        if (match) return parseInt(match[1], 10);
    }
    return null;
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

                if (scale.condition) {
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
    for (const f of followUps as FollowUpRecord[]) {
        if (!latestFollowUpMap.has(f.patient_id)) {
            latestFollowUpMap.set(f.patient_id, f);
        }
    }

    const rows: OutcomeRow[] = [];

    for (const [patientId, baseline] of baselineMap) {
        const initial = initialMap.get(patientId);
        if (!initial) continue;

        const followUp = latestFollowUpMap.get(patientId);

        const baselineValue = baseline[scale.baselineField] ?? null;

        if (!followUp) {
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
            });
            continue;
        }

        const currentValue = followUp[scale.followUpField] ?? null;

        let status: OutcomeStatus;

        if (scale.family === 'clinician_entered' && scale.bucketMap) {
            status = classifyClinicianEntered(currentValue as string | null, scale.bucketMap);
        } else if (scale.family === 'numeric') {
            status = classifyNumeric(
                toNumeric(baselineValue),
                toNumeric(currentValue),
                scale.direction
            );
        } else if (scale.family === 'categorical' && scale.ordinal) {
            status = classifyCategorical(
                baselineValue as string | null,
                currentValue as string | null,
                scale.ordinal,
                scale.direction
            );
        } else {
            status = 'not_evaluable';
        }

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
        });
    }

    return rows;
}
