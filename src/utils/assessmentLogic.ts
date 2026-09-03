import { DISABILITY_TYPES } from '@/constants/beneficiaryDropdowns';
import { FIM_LOCOMOTION_ITEMS, FIM_MOBILITY_ITEMS } from '@/constants/assessmentDropdowns';

const DISABILITY_TYPE_SET = new Set<string>(DISABILITY_TYPES);

const EI_STATUS_FIELDS = [
    { key: 'ei_head_control_status', label: 'Head Control Status' },
    { key: 'ei_rolling_status', label: 'Rolling Status' },
    { key: 'ei_sitting_status', label: 'Sitting Status' },
    { key: 'ei_crawling_status', label: 'Crawling Status' },
    { key: 'ei_standing_status', label: 'Standing Status' },
    { key: 'ei_walking_status', label: 'Walking Status' },
    { key: 'ei_hand_function_status', label: 'Hand Function Status' },
    { key: 'ei_communication_status', label: 'Communication Status' },
    { key: 'ei_social_status', label: 'Social Status' },
    { key: 'ei_self_care_status', label: 'Self Care Status' },
    { key: 'ei_attention_status', label: 'Attention & Interest Status' },
    { key: 'ei_play_status', label: 'Play Status' },
    { key: 'ei_intelligence_status', label: 'Intelligence Status' },
] as const;

// Primary Condition can be 'Disability' or one of the specific disability
// sub-types (Cerebral Palsy, Down Syndrome, etc.) — both should show the
// same 'Disability' clinical section (FIM fields, disability type, etc.).
export function isDisabilityCondition(condition: string): boolean {
    return condition === 'Disability' || DISABILITY_TYPE_SET.has(condition);
}

export function getVASCategory(score: number): string {
    if (score === 0) return 'No Pain';
    if (score <= 3) return 'Mild Pain (1–3)';
    if (score <= 6) return 'Moderate Pain (4–6)';
    return 'Severe Pain (7–10)';
}

export function getClinicalFields(condition: string): string[] {
    const map: Record<string, string[]> = {
        'Pain': ['rom_aaos', 'strength_mmt', 'vas_pre', 'vas_category_pre', 'vas_post', 'vas_category_post'],
        'Neuro': ['neuro_strength', 'neuro_balance', 'coordination_test', 'coordination_severity'],
        'Pulmonary': ['cough', 'pulmonary_symptoms', 'dyspnea_mrmc'],
        'Disability': ['disability_type', 'fim_walking_wheelchair', 'fim_stairs', 'fim_community_access', 'fim_bed_chair_transfer', 'fim_toilet_transfer', 'fim_tub_shower_transfer'],
        'Post-Operative': ['postop_surgery_type', 'weight_bearing_status', 'functional_mobility_level'],
        'Amputation': ['amputation_level', 'residual_limb_condition', 'prosthesis_status', 'amp_level'],
    };
    return map[condition] ?? [];
}

export function getFollowUpFields(condition: string): string[] {
    const map: Record<string, string[]> = {
        'Pain': ['rom', 'strength', 'vas_previous', 'vas_current'],
        'Neuro': ['neuro_strength', 'balance', 'coordination_test', 'coordination_severity'],
        'Pulmonary': ['dyspnea_mrmc'],
        'Disability': ['fim_walking_wheelchair', 'fim_stairs', 'fim_community_access', 'fim_bed_chair_transfer', 'fim_toilet_transfer', 'fim_tub_shower_transfer'],
        'Amputation': ['amp_level'],
    };
    return map[condition] ?? [];
}

// Mirrors ClinicalAssessmentForm's validate() — kept in sync by hand since both
// describe the same "what must be filled in for this condition" rule set.
// Used to flag saved records (e.g. legacy or offline data) that slipped through
// without every condition-relevant field filled in.
export function getMissingClinicalFields(condition: string, record: Record<string, unknown> | null | undefined): string[] {
    if (!record) return [];
    const missing: string[] = [];
    const requireFilled = (key: string, label: string) => {
        const v = record[key];
        if (v == null || v === '') missing.push(label);
    };

    if (condition === 'Neuro Muscular Painful Condition') {
        requireFilled('rom_aaos', 'ROM');
        requireFilled('strength_mmt', 'Strength');
        requireFilled('vas_pre', 'VAS Score (Pre)');
    } else if (condition === 'Neurological Condition') {
        requireFilled('neuro_strength', 'Strength');
        requireFilled('neuro_balance', 'Balance');
        requireFilled('coordination_test', 'Coordination Test');
        requireFilled('coordination_severity', 'Coordination Severity');
    } else if (condition === 'Pulmonary Condition') {
        requireFilled('cough', 'Cough');
        if (!(record.pulmonary_symptoms as string[] | null)?.length) missing.push('Pulmonary Symptoms');
        requireFilled('dyspnea_mrmc', 'Dyspnea (MRC)');
    } else if (isDisabilityCondition(condition)) {
        requireFilled('disability_type', 'Disability Type');
        for (const item of [...FIM_LOCOMOTION_ITEMS, ...FIM_MOBILITY_ITEMS]) requireFilled(item.key, item.label);
    } else if (condition === 'Post Operative Condition') {
        requireFilled('postop_surgery_type', 'Surgery Type');
        requireFilled('weight_bearing_status', 'Weight Bearing Status');
        requireFilled('functional_mobility_level', 'Functional Mobility Level');
    } else if (condition === 'Amputation') {
        requireFilled('amputation_level', 'Amputation Level');
        requireFilled('residual_limb_condition', 'Residual Limb Condition');
        requireFilled('prosthesis_status', 'Prosthesis Status');
        requireFilled('amp_level', 'AMP Level');
    } else if (condition === 'Early Intervention Assessment') {
        for (const f of EI_STATUS_FIELDS) requireFilled(f.key, f.label);
        requireFilled('ei_service_level', 'Service Level');
        if (!(record.ei_assessor_name as string | null)?.trim()) missing.push('Assessor Name');
    }
    return missing;
}

// Mirrors FollowUpAssessmentForm's validate(), applied to a single session
// record — callers pass the patient's latest session only.
export function getMissingFollowUpFields(condition: string, record: Record<string, unknown> | null | undefined): string[] {
    if (!record) return [];
    const missing: string[] = [];
    const requireFilled = (key: string, label: string) => {
        const v = record[key];
        if (v == null || v === '') missing.push(label);
    };

    if (condition === 'Neuro Muscular Painful Condition') {
        requireFilled('rom', 'ROM');
        requireFilled('strength', 'Strength');
        requireFilled('vas_current', 'VAS Score (Pre-Treatment)');
        requireFilled('vas_post', 'VAS Score (Post-Treatment)');
    } else if (condition === 'Neurological Condition') {
        requireFilled('neuro_strength', 'Strength');
        requireFilled('balance', 'Balance');
        requireFilled('coordination_test', 'Coordination Test');
        requireFilled('coordination_severity', 'Coordination Severity');
    } else if (condition === 'Pulmonary Condition') {
        requireFilled('dyspnea_mrmc', 'Dyspnea (MRC)');
    } else if (isDisabilityCondition(condition)) {
        for (const item of [...FIM_LOCOMOTION_ITEMS, ...FIM_MOBILITY_ITEMS]) requireFilled(item.key, item.label);
    } else if (condition === 'Amputation') {
        requireFilled('amp_level', 'AMP Level');
    } else if (condition === 'Early Intervention Assessment') {
        for (const f of EI_STATUS_FIELDS) requireFilled(f.key, f.label);
        requireFilled('ei_service_level', 'Service Level');
        requireFilled('ei_outcome', 'Outcome');
        if (!(record.ei_assessor_name as string | null)?.trim()) missing.push('Assessor Name');
    }
    return missing;
}
