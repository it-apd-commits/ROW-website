import { supabase } from '@/lib/supabase';
import { fetchAllRows } from './dashboardService';
import { classifyByScale, toNumeric } from './outcomeEvaluationService';
import {
    OUTCOME_SCALES,
    PRIMARY_SCALE_BY_CONDITION,
    getConditions,
    getScalesByCondition,
} from '@/config/outcomeScales';
import type { ScaleConfig } from '@/config/outcomeScales';
import { DISABILITY_TYPES } from '@/constants/beneficiaryDropdowns';
import { FIM_LOCOMOTION_ITEMS, FIM_MOBILITY_ITEMS } from '@/constants/assessmentDropdowns';
import type { OutcomeStatus } from '@/types/outcomeEvaluation';

const DISABILITY_CONDITION_VALUES = ['Disability', ...DISABILITY_TYPES];

// Mirrors the Locomotion/Mobility grouping shown under the Disability condition
// in the Reports UI, so the export reads the same way.
const FIM_CATEGORY_BY_SCALE: Record<string, 'Locomotion' | 'Mobility'> = {
    ...Object.fromEntries(FIM_LOCOMOTION_ITEMS.map(i => [i.key, 'Locomotion' as const])),
    ...Object.fromEntries(FIM_MOBILITY_ITEMS.map(i => [i.key, 'Mobility' as const])),
};

const CONDITION_LABELS: Record<string, string> = {
    'Neuro Muscular Painful Condition': 'Pain',
    'Neurological Condition': 'Neurological',
    'Pulmonary Condition': 'Pulmonary',
    'Disability': 'Disability',
    'Amputation': 'Amputation',
    'Early Intervention Assessment': 'Early Intervention',
};

const EVALUABLE: OutcomeStatus[] = ['improved', 'same', 'declined'];

// Cosmetic relabeling only — these are the same disability_type values already stored
// on beneficiaries, renamed to match commonly used RPWD Act report wording. Any
// disability_type not listed here is shown under its own real name, not folded into "Other".
const DISABILITY_REPORT_LABELS: Record<string, string> = {
    'Neuromuscular Painful Condition': 'Neuromuscular / Chronic Pain Conditions',
    'Multiple Disability': 'Multiple Disabilities',
    'Chronic Neurological Disorder': 'Chronic Neurological Conditions',
    'Learning Disability': 'Specific Learning Disabilities',
    'Global Delay Development': 'Global Developmental Delay',
    'Low Vision': 'Low-vision',
};

interface InitialRecord {
    patient_id: string;
    patient_name: string;
    primary_condition: string | null;
}

interface BaselineRecord {
    patient_id: string;
    condition: string | null;
    created_at?: string;
    [key: string]: unknown;
}

interface FollowUpRecord {
    patient_id: string;
    visit_date: string;
    condition: string | null;
    [key: string]: unknown;
}

interface BeneficiaryRecord {
    id: string;
    file_number: string | null;
    district: string | null;
    disability_type: string | null;
}

interface ScaleOutcomeRow {
    patient_id: string;
    baseline_value: unknown;
    current_value: unknown;
    current_date: string | null;
    status: OutcomeStatus;
}

export interface ProgramReportFilters {
    fromDate?: string;
    toDate?: string;
}

export interface ExecutiveSummary {
    totalAssessed: number;
    baselineCompleted: number;
    baselineCompletedPct: number;
    postAssessmentCompleted: number;
    postAssessmentCompletedPct: number;
    improved: number;
    same: number;
    deteriorated: number;
}

export interface OutcomeAnalysisRow {
    outcome: 'Improved' | 'Same' | 'Deteriorated';
    count: number;
    pct: number;
}

export interface ConditionOutcomeRow {
    condition: string;
    improvedPct: number | null;
    samePct: number | null;
    worsePct: number | null;
    evaluableCount: number;
    note?: string;
}

export interface MeasureImprovementRow {
    condition: string;
    category?: 'Locomotion' | 'Mobility';
    measure: string;
    improvedPct: number | null;
    evaluableCount: number;
}

export interface VasBandRow {
    band: string;
    pre: number;
    post: number;
}

export interface DistrictPerformanceRow {
    district: string;
    improvedPct: number | null;
    evaluableCount: number;
}

export interface MonthlyTrendRow {
    month: string;
    improvedPct: number | null;
    evaluableCount: number;
}

export interface FunnelRow {
    stage: string;
    count: number;
    pct: number;
}

export interface DisabilityProfileRow {
    category: string;
    count: number;
    pct: number;
}

export interface ProgramReport {
    executiveSummary: ExecutiveSummary;
    outcomeAnalysis: OutcomeAnalysisRow[];
    outcomeByCondition: ConditionOutcomeRow[];
    improvementByMeasure: MeasureImprovementRow[];
    vasBands: VasBandRow[];
    districtPerformance: DistrictPerformanceRow[];
    monthlyTrend: MonthlyTrendRow[];
    assessmentCompletion: FunnelRow[];
    disabilityProfile: DisabilityProfileRow[];
    notes: string[];
}

const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);

function vasBand(value: number): string {
    if (value <= 0) return 'No Pain';
    if (value <= 3) return 'Mild';
    if (value <= 6) return 'Moderate';
    return 'Severe';
}

// Builds one Improved/Same/Deteriorated status list per scale, across the whole
// program (all conditions, all patients) in a single set of table scans — unlike
// getOutcomes() in outcomeEvaluationService, which is scoped to one scale/condition
// at a time and is called from the per-scale Reports export.
export async function fetchProgramReport(filters: ProgramReportFilters): Promise<ProgramReport> {
    const [initials, clinicals, followUps, beneficiaries, serviceEntries] = await Promise.all([
        fetchAllRows<InitialRecord>(() => supabase
            .from('initial_assessment')
            .select('patient_id, patient_name, primary_condition')),
        fetchAllRows<BaselineRecord>(() => supabase
            .from('clinical_assessment')
            .select('*')
            .order('created_at', { ascending: true })),
        fetchAllRows<FollowUpRecord>(() => {
            let q = supabase.from('follow_up_assessment').select('*').order('visit_date', { ascending: false });
            if (filters.fromDate) q = q.gte('visit_date', filters.fromDate);
            if (filters.toDate) q = q.lte('visit_date', filters.toDate);
            return q;
        }),
        fetchAllRows<BeneficiaryRecord>(() => supabase.from('beneficiaries').select('id, file_number, district, disability_type')),
        fetchAllRows<{ file_number: string | null }>(() => supabase.from('service_entries').select('file_number')),
    ]);

    const initialMap = new Map<string, InitialRecord>();
    initials.forEach(i => initialMap.set(i.patient_id, i));

    // Keep every baseline row per patient (already ascending by created_at) so each
    // scale can pick the earliest row matching its own condition — mirrors getOutcomes().
    const baselinesByPatient = new Map<string, BaselineRecord[]>();
    clinicals.forEach(c => {
        const list = baselinesByPatient.get(c.patient_id);
        if (list) list.push(c); else baselinesByPatient.set(c.patient_id, [c]);
    });

    // Latest follow-up per patient within the date range, regardless of its own
    // condition field — matches the single-scale export's behavior.
    const latestFollowUpByPatient = new Map<string, FollowUpRecord>();
    followUps.forEach(f => {
        if (!latestFollowUpByPatient.has(f.patient_id)) latestFollowUpByPatient.set(f.patient_id, f);
    });

    const districtByPatient = new Map<string, string>();
    beneficiaries.forEach(b => {
        const district = b.district && b.district.trim() ? b.district.trim() : 'Unspecified';
        if (b.file_number) districtByPatient.set(b.file_number, district);
        if (b.id) districtByPatient.set(b.id, district);
    });

    const servicedPatients = new Set<string>();
    serviceEntries.forEach(s => { if (s.file_number) servicedPatients.add(s.file_number); });

    const findBaselineFor = (patientId: string, scale: ScaleConfig): BaselineRecord | undefined => {
        const list = baselinesByPatient.get(patientId);
        if (!list) return undefined;
        const matches = scale.condition === 'Disability'
            ? list.filter(b => b.condition && DISABILITY_CONDITION_VALUES.includes(b.condition))
            : list.filter(b => b.condition === scale.condition);
        return matches[0];
    };

    const rowsByScale = new Map<string, ScaleOutcomeRow[]>();
    for (const scale of Object.values(OUTCOME_SCALES)) {
        const rows: ScaleOutcomeRow[] = [];
        for (const patientId of initialMap.keys()) {
            const baseline = findBaselineFor(patientId, scale);
            if (!baseline) continue;
            const baselineValue = baseline[scale.baselineField] ?? null;
            const followUp = latestFollowUpByPatient.get(patientId);
            if (!followUp) {
                rows.push({ patient_id: patientId, baseline_value: baselineValue, current_value: null, current_date: null, status: 'baseline_only' });
                continue;
            }
            const currentValue = followUp[scale.followUpField] ?? null;
            const status = classifyByScale(scale, baselineValue, currentValue);
            rows.push({ patient_id: patientId, baseline_value: baselineValue, current_value: currentValue, current_date: followUp.visit_date, status });
        }
        rowsByScale.set(scale.id, rows);
    }

    // Pool each condition's single primary measure into one status-per-beneficiary list.
    const primaryStatusRows: ScaleOutcomeRow[] = [];
    for (const condition of getConditions()) {
        const primaryScaleId = PRIMARY_SCALE_BY_CONDITION[condition];
        if (!primaryScaleId) continue;
        primaryStatusRows.push(...(rowsByScale.get(primaryScaleId) || []));
    }

    const improved = primaryStatusRows.filter(r => r.status === 'improved').length;
    const same = primaryStatusRows.filter(r => r.status === 'same').length;
    const declined = primaryStatusRows.filter(r => r.status === 'declined').length;
    const evaluable = improved + same + declined;

    const totalAssessed = initials.length;
    const baselineCompleted = baselinesByPatient.size;
    const postAssessmentCompleted = latestFollowUpByPatient.size;

    const executiveSummary: ExecutiveSummary = {
        totalAssessed,
        baselineCompleted,
        baselineCompletedPct: pct(baselineCompleted, totalAssessed),
        postAssessmentCompleted,
        postAssessmentCompletedPct: pct(postAssessmentCompleted, totalAssessed),
        improved,
        same,
        deteriorated: declined,
    };

    const outcomeAnalysis: OutcomeAnalysisRow[] = [
        { outcome: 'Improved', count: improved, pct: pct(improved, evaluable) },
        { outcome: 'Same', count: same, pct: pct(same, evaluable) },
        { outcome: 'Deteriorated', count: declined, pct: pct(declined, evaluable) },
    ];

    const outcomeByCondition: ConditionOutcomeRow[] = getConditions().map(condition => {
        const primaryScaleId = PRIMARY_SCALE_BY_CONDITION[condition];
        const rows = primaryScaleId ? (rowsByScale.get(primaryScaleId) || []) : [];
        const imp = rows.filter(r => r.status === 'improved').length;
        const sm = rows.filter(r => r.status === 'same').length;
        const dec = rows.filter(r => r.status === 'declined').length;
        const total = imp + sm + dec;
        return {
            condition: CONDITION_LABELS[condition] || condition,
            improvedPct: total > 0 ? pct(imp, total) : null,
            samePct: total > 0 ? pct(sm, total) : null,
            worsePct: total > 0 ? pct(dec, total) : null,
            evaluableCount: total,
        };
    });
    outcomeByCondition.push({
        condition: 'Post Operative',
        improvedPct: null,
        samePct: null,
        worsePct: null,
        evaluableCount: 0,
        note: 'No outcome scale configured for this condition yet',
    });

    const improvementByMeasure: MeasureImprovementRow[] = [];
    for (const condition of getConditions()) {
        for (const scale of getScalesByCondition(condition)) {
            const rows = rowsByScale.get(scale.id) || [];
            const imp = rows.filter(r => r.status === 'improved').length;
            const total = rows.filter(r => EVALUABLE.includes(r.status)).length;
            improvementByMeasure.push({
                condition: CONDITION_LABELS[condition] || condition,
                category: FIM_CATEGORY_BY_SCALE[scale.id],
                measure: scale.label,
                improvedPct: total > 0 ? pct(imp, total) : null,
                evaluableCount: total,
            });
        }
    }

    const vasRows = rowsByScale.get('vas') || [];
    const bandOrder = ['Severe', 'Moderate', 'Mild', 'No Pain'];
    const preCounts: Record<string, number> = { Severe: 0, Moderate: 0, Mild: 0, 'No Pain': 0 };
    const postCounts: Record<string, number> = { Severe: 0, Moderate: 0, Mild: 0, 'No Pain': 0 };
    vasRows.forEach(r => {
        const baseline = toNumeric(r.baseline_value);
        if (baseline !== null) preCounts[vasBand(baseline)]++;
        const current = toNumeric(r.current_value);
        if (current !== null) postCounts[vasBand(current)]++;
    });
    const vasBands: VasBandRow[] = bandOrder.map(band => ({ band, pre: preCounts[band], post: postCounts[band] }));

    const districtBuckets = new Map<string, { improved: number; same: number; declined: number }>();
    primaryStatusRows.forEach(r => {
        if (!EVALUABLE.includes(r.status)) return;
        const district = districtByPatient.get(r.patient_id) || 'Unspecified';
        const bucket = districtBuckets.get(district) || { improved: 0, same: 0, declined: 0 };
        bucket[r.status as 'improved' | 'same' | 'declined']++;
        districtBuckets.set(district, bucket);
    });
    const districtPerformance: DistrictPerformanceRow[] = Array.from(districtBuckets.entries())
        .map(([district, b]) => {
            const total = b.improved + b.same + b.declined;
            return { district, improvedPct: total > 0 ? pct(b.improved, total) : null, evaluableCount: total };
        })
        .sort((a, b) => b.evaluableCount - a.evaluableCount);

    const monthBuckets = new Map<string, { improved: number; same: number; declined: number }>();
    primaryStatusRows.forEach(r => {
        if (!r.current_date || !EVALUABLE.includes(r.status)) return;
        const month = r.current_date.slice(0, 7);
        const bucket = monthBuckets.get(month) || { improved: 0, same: 0, declined: 0 };
        bucket[r.status as 'improved' | 'same' | 'declined']++;
        monthBuckets.set(month, bucket);
    });
    const monthlyTrend: MonthlyTrendRow[] = Array.from(monthBuckets.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, b]) => {
            const total = b.improved + b.same + b.declined;
            return { month, improvedPct: total > 0 ? pct(b.improved, total) : null, evaluableCount: total };
        });

    const registrationCompleted = beneficiaries.length;
    const funnelPct = (n: number) => pct(n, registrationCompleted);
    const assessmentCompletion: FunnelRow[] = [
        { stage: 'Registration Completed', count: registrationCompleted, pct: 100 },
        { stage: 'Baseline Completed', count: baselineCompleted, pct: funnelPct(baselineCompleted) },
        { stage: 'Intervention Completed', count: servicedPatients.size, pct: funnelPct(servicedPatients.size) },
        { stage: 'Post Assessment Completed', count: postAssessmentCompleted, pct: funnelPct(postAssessmentCompleted) },
    ];

    const disabilityCounts = new Map<string, number>();
    beneficiaries.forEach(b => {
        const raw = b.disability_type && b.disability_type.trim() ? b.disability_type.trim() : 'Unspecified';
        const label = DISABILITY_REPORT_LABELS[raw] || raw;
        disabilityCounts.set(label, (disabilityCounts.get(label) || 0) + 1);
    });
    const disabilityProfile: DisabilityProfileRow[] = Array.from(disabilityCounts.entries())
        .map(([category, count]) => ({ category, count, pct: pct(count, registrationCompleted) }))
        .sort((a, b) => b.count - a.count);

    const notes: string[] = [
        'Primary measure per condition (drives Executive Summary, Overall Outcome Analysis, Outcome by Condition, District-wise Performance and Monthly Trend): ' +
            Object.entries(PRIMARY_SCALE_BY_CONDITION)
                .map(([c, s]) => {
                    const category = FIM_CATEGORY_BY_SCALE[s];
                    return `${CONDITION_LABELS[c] || c} -> ${OUTCOME_SCALES[s]?.label}${category ? ` (${category})` : ''}`;
                })
                .join('; '),
        '"Post Operative Condition" has no outcome scale configured in the system yet, so it is excluded from Outcome by Condition and Improvement by Outcome Measure.',
        'Improvement by Outcome Measure lists only measures actually captured today. "Muscle Strength" and "ROM" under Neurological, and "Cough" and "Pulmonary Symptoms" under Pulmonary, are not currently captured as distinct fields and are omitted. Disability measures are further split into Locomotion (Walking/Wheelchair, Stairs, Community Access) and Mobility (Bed/Chair/Wheelchair Transfer, Toilet Transfer, Tub/Shower Transfer), matching the FIM Category filter in the Reports UI.',
        'Pre vs Post Comparison uses standard VAS pain bands: No Pain = 0, Mild = 1-3, Moderate = 4-6, Severe = 7-10.',
        '"Intervention Completed" in the Assessment Completion funnel is approximated as beneficiaries with at least one recorded service entry — adjust if a different definition is intended.',
        'Post Assessment Completed / Baseline Completed and the Overall Outcome Analysis evaluable count may not sum identically, since a beneficiary can have a follow-up without a matching baseline, or a baseline/follow-up value that is not evaluable (e.g. missing or unmapped).',
        'Disability Profile shows every distinct beneficiaries.disability_type value as-is. A handful are relabeled to match common RPWD Act report wording (e.g. "Neuromuscular Painful Condition" -> "Neuromuscular / Chronic Pain Conditions"); all others are shown under their real stored name rather than grouped into "Other".',
    ];

    return {
        executiveSummary,
        outcomeAnalysis,
        outcomeByCondition,
        improvementByMeasure,
        vasBands,
        districtPerformance,
        monthlyTrend,
        assessmentCompletion,
        disabilityProfile,
        notes,
    };
}
