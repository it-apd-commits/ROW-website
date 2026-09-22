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
import { DROPDOWNS, FIM_LOCOMOTION_ITEMS, FIM_MOBILITY_ITEMS } from '@/constants/assessmentDropdowns';
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

// beneficiaries.disability_type is free text captured at import (see
// importService.ts — it comes straight from an uncontrolled "DISABILITY TYPE"
// spreadsheet column, not the app's own dropdown), so the same real category
// shows up under several spellings/spacings/casings (e.g. "Neuromuscular
// Painful Condition", "Neuro Muscular Painful Condition", "neuromuscular
// painful condition"). Keyed by the lower-cased, single-spaced raw value so
// all of those collapse into one row instead of fragmenting the profile.
// Any disability_type not listed here is shown under its own real name
// (title-cased for display), not folded into "Other".
const DISABILITY_REPORT_LABELS: Record<string, string> = {
    'neuromuscular painful condition': 'Neuromuscular / Chronic Pain Conditions',
    'neuro muscular painful condition': 'Neuromuscular / Chronic Pain Conditions',
    'multiple disability': 'Multiple Disabilities',
    'chronic neurological disorder': 'Chronic Neurological Conditions',
    'learning disability': 'Specific Learning Disabilities',
    'global delay development': 'Global Developmental Delay',
    'low vision': 'Low-vision',
};

// Placeholder values from the same free-text import column that describe a
// beneficiary as NOT (yet) having a classified disability — not an RPWD Act
// disability category, so they're excluded from the Disability Profile table
// and its percentage base entirely, rather than counted as a "category".
const NON_DISABILITY_VALUES = new Set(['non-disabled', 'general screening']);

function normalizeDisabilityKey(raw: string): string {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function titleCase(raw: string): string {
    return raw.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

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
    baseline_date: string | null;
    current_value: unknown;
    current_date: string | null;
    status: OutcomeStatus;
    follow_up_count: number;
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
    // Beneficiaries with a baseline recorded but no follow-up yet, so they
    // can't be classified improved/same/declined — still real data, just not
    // an evaluable outcome. Shown so "0 evaluable" isn't mistaken for "no data".
    baselineOnlyCount: number;
    note?: string;
}

export interface MeasureImprovementRow {
    condition: string;
    category?: 'Locomotion' | 'Mobility';
    measure: string;
    improvedPct: number | null;
    evaluableCount: number;
    baselineOnlyCount: number;
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

// Baseline-only snapshot for fields that are captured once at the initial
// assessment and never re-asked at follow-up — there's no "after" value to
// compare against, so these show current distribution only, not improvement.
export interface StatusSnapshotRow {
    category: string;
    count: number;
    pct: number;
}

// One row per beneficiary per applicable outcome measure, across every
// condition and all-time — the full, unfiltered detail behind every rollup
// above. Powers the Consolidated export tab.
export interface ConsolidatedRow {
    patient_id: string;
    name: string;
    scale: string;
    baseline_value: string | number | null;
    baseline_date: string | null;
    current_value: string | number | null;
    current_date: string | null;
    status: OutcomeStatus;
    follow_up_count: number;
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
    weightBearingSnapshot: StatusSnapshotRow[];
    functionalMobilitySnapshot: StatusSnapshotRow[];
    prosthesisStatusSnapshot: StatusSnapshotRow[];
    allOutcomeRows: ConsolidatedRow[];
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
// Always covers every beneficiary, every condition, and all-time data — not
// scoped to whatever Condition/Scale/Date Range is selected in the Reports UI.
// That on-screen selection only drives what's shown on screen; this function
// (and everything it feeds in the Excel export) is intentionally unfiltered.
export async function fetchProgramReport(): Promise<ProgramReport> {
    const [initials, clinicals, followUps, beneficiaries, serviceEntries] = await Promise.all([
        fetchAllRows<InitialRecord>(() => supabase
            .from('initial_assessment')
            .select('patient_id, patient_name, primary_condition')),
        fetchAllRows<BaselineRecord>(() => supabase
            .from('clinical_assessment')
            .select('*')
            .order('created_at', { ascending: true })),
        fetchAllRows<FollowUpRecord>(() => supabase
            .from('follow_up_assessment')
            .select('*')
            .order('visit_date', { ascending: false })),
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

    // Latest follow-up per patient (all-time), regardless of its own condition
    // field — matches the single-scale export's behavior.
    const latestFollowUpByPatient = new Map<string, FollowUpRecord>();
    const followUpCountByPatient = new Map<string, number>();
    followUps.forEach(f => {
        if (!latestFollowUpByPatient.has(f.patient_id)) latestFollowUpByPatient.set(f.patient_id, f);
        followUpCountByPatient.set(f.patient_id, (followUpCountByPatient.get(f.patient_id) || 0) + 1);
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
            const baselineDate = baseline.created_at || null;
            const followUpCount = followUpCountByPatient.get(patientId) || 0;
            const followUp = latestFollowUpByPatient.get(patientId);
            if (!followUp) {
                rows.push({ patient_id: patientId, baseline_value: baselineValue, baseline_date: baselineDate, current_value: null, current_date: null, status: 'baseline_only', follow_up_count: followUpCount });
                continue;
            }
            const currentValue = followUp[scale.followUpField] ?? null;
            const status = classifyByScale(scale, baselineValue, currentValue);
            rows.push({ patient_id: patientId, baseline_value: baselineValue, baseline_date: baselineDate, current_value: currentValue, current_date: followUp.visit_date, status, follow_up_count: followUpCount });
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
        const baselineOnly = rows.filter(r => r.status === 'baseline_only').length;
        const total = imp + sm + dec;
        return {
            condition: CONDITION_LABELS[condition] || condition,
            improvedPct: total > 0 ? pct(imp, total) : null,
            samePct: total > 0 ? pct(sm, total) : null,
            worsePct: total > 0 ? pct(dec, total) : null,
            evaluableCount: total,
            baselineOnlyCount: baselineOnly,
        };
    });
    // No outcome scale exists for Post-Op, so it's never part of rowsByScale —
    // count beneficiaries with a baseline recorded directly off clinical_assessment.
    const postOpBaselineCount = Array.from(initialMap.keys()).filter(patientId =>
        baselinesByPatient.get(patientId)?.some(b => b.condition === 'Post Operative Condition')
    ).length;
    outcomeByCondition.push({
        condition: 'Post Operative',
        improvedPct: null,
        samePct: null,
        worsePct: null,
        evaluableCount: 0,
        baselineOnlyCount: postOpBaselineCount,
        note: 'No outcome scale configured for this condition yet',
    });

    const improvementByMeasure: MeasureImprovementRow[] = [];
    for (const condition of getConditions()) {
        for (const scale of getScalesByCondition(condition)) {
            const rows = rowsByScale.get(scale.id) || [];
            const imp = rows.filter(r => r.status === 'improved').length;
            const total = rows.filter(r => EVALUABLE.includes(r.status)).length;
            const baselineOnly = rows.filter(r => r.status === 'baseline_only').length;
            improvementByMeasure.push({
                condition: CONDITION_LABELS[condition] || condition,
                category: FIM_CATEGORY_BY_SCALE[scale.id],
                measure: scale.label,
                improvedPct: total > 0 ? pct(imp, total) : null,
                evaluableCount: total,
                baselineOnlyCount: baselineOnly,
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

    // Grouped by normalized key so casing/spacing variants of the same real
    // category merge into one row; the display label is derived once per key
    // (aliased if known, otherwise title-cased from however it first appears).
    // Pre-seeded with every category the beneficiary form itself offers (minus
    // "Non-Disabled", which isn't a disability category) so the table always
    // lists the full set, with 0 (0%) for any category no one is currently
    // recorded under, instead of silently omitting the row.
    const disabilityCounts = new Map<string, number>();
    const disabilityLabelForKey = new Map<string, string>();
    for (const type of DISABILITY_TYPES) {
        const key = normalizeDisabilityKey(type);
        if (NON_DISABILITY_VALUES.has(key)) continue;
        disabilityCounts.set(key, 0);
        disabilityLabelForKey.set(key, DISABILITY_REPORT_LABELS[key] || titleCase(type));
    }
    let disabilityProfileTotal = 0;
    beneficiaries.forEach(b => {
        const raw = b.disability_type && b.disability_type.trim() ? b.disability_type.trim() : null;
        if (!raw) return;
        const key = normalizeDisabilityKey(raw);
        if (NON_DISABILITY_VALUES.has(key)) return;
        disabilityCounts.set(key, (disabilityCounts.get(key) || 0) + 1);
        if (!disabilityLabelForKey.has(key)) {
            disabilityLabelForKey.set(key, DISABILITY_REPORT_LABELS[key] || titleCase(raw));
        }
        disabilityProfileTotal++;
    });
    const disabilityProfile: DisabilityProfileRow[] = Array.from(disabilityCounts.entries())
        .map(([key, count]) => ({ category: disabilityLabelForKey.get(key) as string, count, pct: pct(count, disabilityProfileTotal) }))
        .sort((a, b) => b.count - a.count);

    // Baseline-only snapshot: these fields are captured once at the initial
    // assessment and never re-asked at follow-up, so there's no before/after to
    // compare — just count whatever value is on record today, in clinical order.
    // A patient with no baseline for the condition, or no value entered, is
    // simply not counted (never guessed or defaulted).
    const buildStatusSnapshot = (condition: string, field: string, orderedCategories: string[]): StatusSnapshotRow[] => {
        const counts = new Map<string, number>(orderedCategories.map(c => [c, 0]));
        let total = 0;
        for (const patientId of initialMap.keys()) {
            const list = baselinesByPatient.get(patientId);
            const baseline = list?.find(b => b.condition === condition);
            const value = baseline ? (baseline[field] as string | null) : null;
            if (!value) continue;
            if (!counts.has(value)) counts.set(value, 0);
            counts.set(value, (counts.get(value) || 0) + 1);
            total++;
        }
        return Array.from(counts.entries()).map(([category, count]) => ({ category, count, pct: pct(count, total) }));
    };

    const weightBearingSnapshot = buildStatusSnapshot('Post Operative Condition', 'weight_bearing_status', DROPDOWNS.WeightBearing);
    const functionalMobilitySnapshot = buildStatusSnapshot('Post Operative Condition', 'functional_mobility_level', DROPDOWNS.Mobility);
    const prosthesisStatusSnapshot = buildStatusSnapshot('Amputation', 'prosthesis_status', DROPDOWNS.Prosthesis);

    // Full, unfiltered detail: every beneficiary against every outcome measure
    // their condition uses, regardless of what's selected in the Reports UI.
    const allOutcomeRows: ConsolidatedRow[] = [];
    for (const scale of Object.values(OUTCOME_SCALES)) {
        for (const r of rowsByScale.get(scale.id) || []) {
            const initial = initialMap.get(r.patient_id);
            allOutcomeRows.push({
                patient_id: r.patient_id,
                name: initial?.patient_name || '—',
                scale: scale.label,
                baseline_value: r.baseline_value as string | number | null,
                baseline_date: r.baseline_date,
                current_value: r.current_value as string | number | null,
                current_date: r.current_date,
                status: r.status,
                follow_up_count: r.follow_up_count,
            });
        }
    }

    const notes: string[] = [
        'Primary measure per condition (drives Executive Summary, Overall Outcome Analysis, Outcome by Condition, District-wise Performance and Monthly Trend): ' +
            Object.entries(PRIMARY_SCALE_BY_CONDITION)
                .map(([c, s]) => {
                    const category = FIM_CATEGORY_BY_SCALE[s];
                    return `${CONDITION_LABELS[c] || c} -> ${OUTCOME_SCALES[s]?.label}${category ? ` (${category})` : ''}`;
                })
                .join('; '),
        '"Post Operative Condition" has no outcome scale configured in the system yet, so it is excluded from Outcome by Condition and Improvement by Outcome Measure.',
        'Improvement by Outcome Measure lists only measures actually captured today. "ROM" under Neurological, and "Cough" and "Pulmonary Symptoms" under Pulmonary, are not currently captured as distinct fields and are omitted. Disability measures are further split into Locomotion (Walking/Wheelchair, Stairs, Community Access) and Mobility (Bed/Chair/Wheelchair Transfer, Toilet Transfer, Tub/Shower Transfer), matching the FIM Category filter in the Reports UI.',
        'Pre vs Post Comparison uses standard VAS pain bands: No Pain = 0, Mild = 1-3, Moderate = 4-6, Severe = 7-10.',
        '"Intervention Completed" in the Assessment Completion funnel is approximated as beneficiaries with at least one recorded service entry — adjust if a different definition is intended.',
        'Post Assessment Completed / Baseline Completed and the Overall Outcome Analysis evaluable count may not sum identically, since a beneficiary can have a follow-up without a matching baseline, or a baseline/follow-up value that is not evaluable (e.g. missing or unmapped).',
        '"Baseline Only" in Outcome by Primary Condition and Improvement by Outcome Measure counts beneficiaries who have a baseline recorded but no follow-up yet, so no Improved/Same/Worse can be calculated for them. This is real recorded data, not missing data — it will move into Evaluable Count once a follow-up is entered for them.',
        'Disability Profile always lists every disability category offered on the Add/Edit Beneficiary form (not the fixed 21-category RPWD Act schedule), so a category with no beneficiaries currently recorded shows 0 (0%) rather than being omitted. It groups beneficiaries.disability_type case/spacing variants of the same category into one row (e.g. "Neuromuscular Painful Condition", "Neuro Muscular Painful Condition" and "neuromuscular painful condition" all count as "Neuromuscular / Chronic Pain Conditions") and relabels a handful of values to match common RPWD Act report wording; anything else is shown under its own real name rather than grouped into "Other". Beneficiaries recorded as "Non-Disabled" or "General Screening" (not a disability category) and those with no disability_type on record are excluded from this table and its percentage base entirely.',
        'Weight Bearing Status, Functional Mobility Level and Prosthesis Status are captured only once, at the initial assessment, and are not re-asked at follow-up — so these three tables show a current snapshot (how many beneficiaries are at each stage today), not improvement over time. A beneficiary with no value on record for a field is not counted anywhere in its table.',
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
        weightBearingSnapshot,
        functionalMobilitySnapshot,
        prosthesisStatusSnapshot,
        allOutcomeRows,
        notes,
    };
}
