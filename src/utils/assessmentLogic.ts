import { DISABILITY_TYPES } from '@/constants/beneficiaryDropdowns';

const DISABILITY_TYPE_SET = new Set<string>(DISABILITY_TYPES);

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
