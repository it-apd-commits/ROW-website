import { supabase } from '@/lib/supabase';
import { fetchAllRows, normalizeDonor, UNSPECIFIED_DONOR } from './dashboardService';
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
import { nameMatchesSearch } from '@/utils/fuzzySearch';
import type { OutcomeStatus } from '@/types/outcomeEvaluation';

// Optional scoping for fetchProgramReport — mirrors the Export Filters popup
// (Condition/Donor/Date Range/Search) so the same rich, multi-section report
// can be produced for a slice instead of only the full program. Every field
// left undefined reproduces the original unfiltered report exactly.
export interface ProgramReportFilters {
    condition?: string;
    scaleId?: string;
    donor?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
}

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
    phone?: string | null;
    service_referral_needed?: string | null;
    referral_reason?: string | null;
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
    name: string | null;
    mobile_no: string | null;
    donor: string | null;
}

// initial_assessment has no donor column of its own — soft-link to the
// beneficiaries table via normalized name/phone, same approach used by
// outcomeEvaluationService.ts, Dashboard.tsx and AssessmentHistory.tsx
// (beneficiary_id isn't reliably backfilled for older/offline records).
const normalizeName = (n: string | null | undefined): string => (n || '').trim().toLowerCase();
const normalizePhone = (p: string | null | undefined): string => (p || '').trim();

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

// Why beneficiaries flagged with service_referral_needed at their initial
// assessment were referred — "Unspecified" covers a flagged referral with no
// reason on record, distinct from beneficiaries with no referral at all
// (who aren't counted here).
export interface ReferralReasonRow {
    reason: string;
    count: number;
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
    referralReasons: ReferralReasonRow[];
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
// With no filters, this covers every beneficiary, every condition, and
// all-time data — the on-screen Reports selection never affects it. Passing
// `filters` (Condition/Donor/Date Range/Search, matching the Export Filters
// popup) scopes every assessment/outcome-driven section to that slice while
// keeping the same rich, multi-section report shape. Registration Completed
// (Assessment Completion funnel) and Disability Profile are population-level
// tables sourced straight from `beneficiaries`, not assessments, so only the
// Donor filter scopes them — Condition/Search have no meaningful mapping onto
// "every registered beneficiary" regardless of whether they've been assessed.
export async function fetchProgramReport(filters: ProgramReportFilters = {}): Promise<ProgramReport> {
    const [initials, clinicals, followUps, beneficiaries, serviceEntries] = await Promise.all([
        fetchAllRows<InitialRecord>(() => supabase
            .from('initial_assessment')
            .select('patient_id, patient_name, primary_condition, phone, service_referral_needed, referral_reason')),
        fetchAllRows<BaselineRecord>(() => supabase
            .from('clinical_assessment')
            .select('*')
            .order('created_at', { ascending: true })),
        fetchAllRows<FollowUpRecord>(() => {
            let q = supabase
                .from('follow_up_assessment')
                .select('*')
                .order('visit_date', { ascending: false });
            if (filters.fromDate) q = q.gte('visit_date', filters.fromDate);
            if (filters.toDate) q = q.lte('visit_date', filters.toDate);
            return q;
        }),
        fetchAllRows<BeneficiaryRecord>(() => supabase.from('beneficiaries').select('id, file_number, district, disability_type, name, mobile_no, donor')),
        fetchAllRows<{ file_number: string | null }>(() => supabase.from('service_entries').select('file_number')),
    ]);

    // Condition/Donor/Search narrow the assessed-patient population that every
    // outcome-driven section below is built from (they all key off initialMap).
    let scopedInitials = initials;
    if (filters.condition) {
        scopedInitials = scopedInitials.filter(i => i.primary_condition === filters.condition);
    }
    if (filters.donor) {
        const donorByName = new Map<string, string>();
        const donorByPhone = new Map<string, string>();
        beneficiaries.forEach(b => {
            const d = normalizeDonor(b.donor);
            const n = normalizeName(b.name);
            const p = normalizePhone(b.mobile_no);
            if (n) donorByName.set(n, d);
            if (p) donorByPhone.set(p, d);
        });
        scopedInitials = scopedInitials.filter(i => {
            const n = normalizeName(i.patient_name);
            const p = normalizePhone(i.phone);
            const d = (n && donorByName.get(n)) || (p && donorByPhone.get(p)) || UNSPECIFIED_DONOR;
            return d === filters.donor;
        });
    }
    if (filters.search && filters.search.trim()) {
        const term = filters.search.trim();
        scopedInitials = scopedInitials.filter(i =>
            nameMatchesSearch(i.patient_name, term) || i.patient_id.toLowerCase().includes(term.toLowerCase()));
    }

    const initialMap = new Map<string, InitialRecord>();
    scopedInitials.forEach(i => initialMap.set(i.patient_id, i));

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

    // Registration Completed and Disability Profile are population-level
    // tables built straight from `beneficiaries` (not from assessed patients),
    // so they're scoped by the Donor filter directly rather than via
    // initialMap — a beneficiary can belong to a donor without having taken
    // any assessment yet, and should still count toward these two tables.
    const donorScopedBeneficiaries = filters.donor
        ? beneficiaries.filter(b => normalizeDonor(b.donor) === filters.donor)
        : beneficiaries;

    const donorByKey = new Map<string, string>();
    beneficiaries.forEach(b => {
        const d = normalizeDonor(b.donor);
        if (b.file_number) donorByKey.set(b.file_number, d);
        if (b.id) donorByKey.set(b.id, d);
    });

    const servicedPatients = new Set<string>();
    serviceEntries.forEach(s => {
        if (!s.file_number) return;
        if (filters.donor && (donorByKey.get(s.file_number) || UNSPECIFIED_DONOR) !== filters.donor) return;
        servicedPatients.add(s.file_number);
    });

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

    const scopedPatientIds = Array.from(initialMap.keys());
    const totalAssessed = scopedInitials.length;
    const baselineCompleted = scopedPatientIds.filter(id => baselinesByPatient.has(id)).length;
    const postAssessmentCompleted = scopedPatientIds.filter(id => latestFollowUpByPatient.has(id)).length;

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

    // Assessment Scale (filters.scaleId) only narrows this table and Consolidated
    // below — Executive Summary/Outcome Analysis/Outcome by Condition/District/
    // Monthly Trend stay on each condition's primary measure regardless.
    const improvementByMeasure: MeasureImprovementRow[] = [];
    for (const condition of getConditions()) {
        for (const scale of getScalesByCondition(condition)) {
            if (filters.scaleId && scale.id !== filters.scaleId) continue;
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

    const registrationCompleted = donorScopedBeneficiaries.length;
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
    donorScopedBeneficiaries.forEach(b => {
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

    // Why beneficiaries were referred for a service or assessment — only
    // beneficiaries flagged service_referral_needed at their initial
    // assessment are counted; "Unspecified" means flagged but no reason was
    // recorded. Sourced from scopedInitials so Condition/Donor/Search scope
    // it the same way as the rest of the assessment-driven sections.
    const referralReasonCounts = new Map<string, number>();
    scopedInitials.forEach(i => {
        if (!i.service_referral_needed) return;
        const reason = i.referral_reason || 'Unspecified';
        referralReasonCounts.set(reason, (referralReasonCounts.get(reason) || 0) + 1);
    });
    const referralReasons: ReferralReasonRow[] = Array.from(referralReasonCounts.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);

    // Every (scoped) beneficiary against every outcome measure their condition
    // uses — full detail when no filters are passed, or just the matching
    // slice when they are (see initialMap/scopedInitials above). filters.scaleId
    // narrows this to a single measure, same as Improvement by Outcome Measure.
    const allOutcomeRows: ConsolidatedRow[] = [];
    const consolidatedScales = filters.scaleId
        ? Object.values(OUTCOME_SCALES).filter(s => s.id === filters.scaleId)
        : Object.values(OUTCOME_SCALES);
    for (const scale of consolidatedScales) {
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
        'Referral Reasons only counts beneficiaries flagged as needing a service or assessment referral at their initial assessment. "Unspecified" means a referral was flagged but no reason was recorded — it does not include beneficiaries with no referral at all.',
    ];

    if (filters.condition || filters.scaleId || filters.donor || filters.fromDate || filters.toDate || (filters.search && filters.search.trim())) {
        notes.push(
            `This export is scoped to the Export Filters selected: Condition = ${filters.condition || 'All Conditions'}; Assessment Scale = ${filters.scaleId ? (OUTCOME_SCALES[filters.scaleId]?.label || filters.scaleId) : 'All Scales'}; Donor = ${filters.donor || 'All Donors'}; From Date (Follow-up) = ${filters.fromDate || 'Any'}; To Date (Follow-up) = ${filters.toDate || 'Any'}; Search = ${filters.search?.trim() || 'None'}. ` +
            'Executive Summary, Overall Outcome Analysis, Outcome by Condition, Pre vs Post (VAS), District-wise Performance, Monthly Trend, the three Baseline Snapshot tables, and Referral Reasons are scoped to matching beneficiaries (Referral Reasons follows Condition/Donor/Search only, not the Date Range, since it is drawn from the initial assessment rather than a follow-up visit), but always use each condition\'s primary outcome measure, unaffected by the Assessment Scale filter. ' +
            'Improvement by Outcome Measure and Consolidated are the only two sections narrowed by the Assessment Scale filter, in addition to Condition/Donor/Date Range/Search. ' +
            'Registration Completed (Assessment Completion funnel) and Disability Profile are population-level tables sourced from every registered beneficiary rather than from assessment data, so they reflect only the Donor filter, not Condition/Assessment Scale/Date Range/Search.'
        );
    }

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
        referralReasons,
        allOutcomeRows,
        notes,
    };
}
