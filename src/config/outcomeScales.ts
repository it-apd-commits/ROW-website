import { DROPDOWNS } from '@/constants/assessmentDropdowns';

const FIM_SCALE_ORDINAL = DROPDOWNS.FIM_SCALE;

export interface ScaleConfig {
    id: string;
    label: string;
    condition: string;
    family: 'numeric' | 'categorical' | 'clinician_entered';
    direction: 'higher_better' | 'lower_better';
    baselineField: string;
    followUpField: string;
    ordinal?: string[];
    bucketMap?: Record<string, string>;
}

export const OUTCOME_SCALES: Record<string, ScaleConfig> = {
    // ── Neuro Muscular Painful Condition ──
    vas: {
        id: 'vas',
        label: 'VAS (Pain)',
        condition: 'Neuro Muscular Painful Condition',
        family: 'numeric',
        direction: 'lower_better',
        baselineField: 'vas_pre',
        followUpField: 'vas_current',
    },
    rom: {
        id: 'rom',
        label: 'ROM (Range of Motion)',
        condition: 'Neuro Muscular Painful Condition',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'rom_aaos',
        followUpField: 'rom',
        ordinal: ['Severe Restriction', 'Moderate Restriction', 'Mild Restriction', 'Full'],
    },
    mmt: {
        id: 'mmt',
        label: 'MMT Strength',
        condition: 'Neuro Muscular Painful Condition',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'strength_mmt',
        followUpField: 'strength',
        ordinal: ['Severe Weakness (≤2)', 'Moderate Weakness (MMT 3)', 'Mild Weakness (MMT 4)', 'Normal (MMT 5)'],
    },

    // ── Neurological Condition ──
    balance: {
        id: 'balance',
        label: 'Balance',
        condition: 'Neurological Condition',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'neuro_balance',
        followUpField: 'balance',
        ordinal: ['Unable', 'Poor', 'Fair', 'Good'],
    },
    coordination: {
        id: 'coordination',
        label: 'Coordination Severity',
        condition: 'Neurological Condition',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'coordination_severity',
        followUpField: 'coordination_severity',
        ordinal: ['Severe Impairment', 'Moderate Impairment', 'Mild Impairment', 'Normal'],
    },

    // ── Pulmonary Condition ──
    dyspnea: {
        id: 'dyspnea',
        label: 'Dyspnea (mMRC)',
        condition: 'Pulmonary Condition',
        family: 'categorical',
        direction: 'lower_better',
        baselineField: 'dyspnea_mrmc',
        followUpField: 'dyspnea_mrmc',
        ordinal: [
            '0 Breathless with strenuous exercise',
            '1 Breathless when hurrying',
            '2 Walk slower than same age',
            '3 Stop after 100m',
            '4 Too breathless to leave house',
        ],
    },

    // ── Disability — FIM Locomotion / Mobility breakdown ──
    // Replaces the old single fim_locomotion/fim_mobility scales — those fields
    // are kept in the data model for historical records but are no longer
    // written to by the form, so they're dropped from outcome tracking here.
    fim_walking_wheelchair: {
        id: 'fim_walking_wheelchair',
        label: 'FIM: Walking / Wheelchair',
        condition: 'Disability',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'fim_walking_wheelchair',
        followUpField: 'fim_walking_wheelchair',
        ordinal: FIM_SCALE_ORDINAL,
    },
    fim_stairs: {
        id: 'fim_stairs',
        label: 'FIM: Stairs',
        condition: 'Disability',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'fim_stairs',
        followUpField: 'fim_stairs',
        ordinal: FIM_SCALE_ORDINAL,
    },
    fim_community_access: {
        id: 'fim_community_access',
        label: 'FIM: Community Access',
        condition: 'Disability',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'fim_community_access',
        followUpField: 'fim_community_access',
        ordinal: FIM_SCALE_ORDINAL,
    },
    fim_bed_chair_transfer: {
        id: 'fim_bed_chair_transfer',
        label: 'FIM: Bed / Chair / Wheelchair Transfer',
        condition: 'Disability',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'fim_bed_chair_transfer',
        followUpField: 'fim_bed_chair_transfer',
        ordinal: FIM_SCALE_ORDINAL,
    },
    fim_toilet_transfer: {
        id: 'fim_toilet_transfer',
        label: 'FIM: Toilet Transfer',
        condition: 'Disability',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'fim_toilet_transfer',
        followUpField: 'fim_toilet_transfer',
        ordinal: FIM_SCALE_ORDINAL,
    },
    fim_tub_shower_transfer: {
        id: 'fim_tub_shower_transfer',
        label: 'FIM: Tub / Shower Transfer',
        condition: 'Disability',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'fim_tub_shower_transfer',
        followUpField: 'fim_tub_shower_transfer',
        ordinal: FIM_SCALE_ORDINAL,
    },

    // ── Amputation ──
    amp: {
        id: 'amp',
        label: 'AMP (K-Level)',
        condition: 'Amputation',
        family: 'categorical',
        direction: 'higher_better',
        baselineField: 'amp_level',
        followUpField: 'amp_level',
        ordinal: [
            'K0 No Prosthetic Mobility', 'K1 Household Ambulator',
            'K2 Limited Community Ambulator', 'K3 Community Ambulator',
            'K4 High Activity User',
        ],
    },

    // ── Early Intervention Assessment ──
    ei_outcome: {
        id: 'ei_outcome',
        label: 'EI Outcome (Clinician Summary)',
        condition: 'Early Intervention Assessment',
        family: 'clinician_entered',
        direction: 'higher_better',
        baselineField: 'ei_outcome',
        followUpField: 'ei_outcome',
        bucketMap: {
            'Improved': 'improved',
            'Slight Improvement': 'improved',
            'No Change': 'same',
            'Needs Referral': 'needs_referral',
        },
    },
};

export const ALL_SCALE_IDS = Object.keys(OUTCOME_SCALES);

export function getScale(id: string): ScaleConfig | undefined {
    return OUTCOME_SCALES[id];
}

export function getAllScales(): ScaleConfig[] {
    return ALL_SCALE_IDS.map(id => OUTCOME_SCALES[id]);
}

export function getConditions(): string[] {
    const set = new Set(Object.values(OUTCOME_SCALES).map(s => s.condition));
    return Array.from(set);
}

export function getScalesByCondition(condition: string): ScaleConfig[] {
    return Object.values(OUTCOME_SCALES).filter(s => s.condition === condition);
}
