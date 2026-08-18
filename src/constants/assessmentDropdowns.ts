import { DISABILITY_TYPES } from './beneficiaryDropdowns';

// Base condition categories — each drives its own clinical section in
// ClinicalAssessmentForm/FollowUpAssessmentForm (see isDisabilityCondition
// in utils/assessmentLogic.ts for how the disability sub-types below plug
// into the 'Disability' section).
const BASE_CONDITIONS = ['Neuro Muscular Painful Condition', 'Neurological Condition', 'Pulmonary Condition', 'Post Operative Condition', 'Disability', 'Amputation', 'Early Intervention Assessment'];

export const DROPDOWNS = {
    Gender: ['Male', 'Female', 'Other'],

    // Disability sub-types from the Beneficiary "Disability Type" list are appended
    // here so they can be picked directly as a Primary Condition, skipping duplicates.
    Condition: [...BASE_CONDITIONS, ...DISABILITY_TYPES.filter(d => !BASE_CONDITIONS.includes(d))],

    ChiefComplaint: [
        'Joint pain', 'Back pain', 'Neck pain', 'Post injury pain',
        'Limb weakness', 'Balance problem', 'Coordination problem',
        'Breathlessness', 'Cough', 'Chest tightness', 'Post surgical pain',
        'Joint stiffness', 'Difficulty walking', 'Difficulty transfers',
        'Stump pain', 'Prosthetic training', 'Other',
    ],

    LimbSide: ['Left', 'Right', 'Bilateral', 'Not Applicable'],

    Joint: ['Shoulder', 'Elbow', 'Wrist', 'Hip', 'Knee', 'Ankle', 'Spine', 'Multiple', 'Not Applicable'],

    Documents: ['BPL', 'APL', 'AADHAR', 'UDID', 'Not Applicable'],

    ROM: ['Full', 'Mild Restriction', 'Moderate Restriction', 'Severe Restriction'],

    Strength: [
        'Normal (MMT 5)',
        'Mild Weakness (MMT 4)',
        'Moderate Weakness (MMT 3)',
        'Severe Weakness (≤2)',
    ],

    Balance: ['Good', 'Fair', 'Poor', 'Unable'],

    CoordinationTests: [
        'Finger-to-Nose Test',
        'Heel-to-Shin Test',
        'Rapid Alternating Movements (Dysdiadochokinesia)',
        'Finger Tapping Test',
    ],

    CoordinationSeverity: [
        'Normal', 'Mild Impairment', 'Moderate Impairment', 'Severe Impairment',
    ],

    Cough: ['No cough', 'Dry cough', 'Productive cough'],

    PulmonarySymptoms: [
        'Breathlessness', 'Wheezing', 'Chest tightness', 'Sputum', 'Fatigue',
    ],

    Dyspnea: [
        '0 Breathless with strenuous exercise',
        '1 Breathless when hurrying',
        '2 Walk slower than same age',
        '3 Stop after 100m',
        '4 Too breathless to leave house',
    ],

    DisabilityType: [
        'Locomotor disability', 'Neurological disability', 'Post-stroke',
        'Spinal cord injury', 'Cerebral palsy', 'Other',
    ],

    FIM: [
        '1 Total Assistance', '2 Max Assistance', '3 Moderate Assistance',
        '4 Minimal Assistance', '5 Supervision',
        '6 Modified Independence', '7 Complete Independence',
    ],

    // 7-point FIM scale shared by every Locomotion/Mobility sub-item below.
    FIM_SCALE: [
        '1 Total Assistance', '2 Maximal Assistance', '3 Moderate Assistance',
        '4 Minimal Assistance', '5 Supervision / Setup',
        '6 Modified Independence', '7 Complete Independence',
    ],

    SurgeryType: [
        'Joint Replacement', 'Fracture Fixation',
        'Ligament Repair', 'Spinal Surgery', 'Other',
    ],

    WeightBearing: [
        'Non Weight Bearing', 'Toe Touch', 'Partial Weight Bearing',
        'Weight Bearing As Tolerated', 'Full Weight Bearing',
    ],

    Mobility: [
        'Bed Mobility', 'Sitting', 'Standing',
        'Walking with Support', 'Independent Walking',
    ],

    AmputationLevel: [
        'Toe', 'Transmetatarsal', 'Syme',
        'Below Knee (BKA)', 'Above Knee (AKA)', 'Hip Disarticulation',
    ],

    ResidualLimb: [
        'Healthy', 'Edema', 'Wound', 'Infection', 'Contracture Risk',
    ],

    Prosthesis: [
        'Not Fitted', 'Temporary Prosthesis', 'Definitive Prosthesis', 'Training Phase',
    ],

    AMP: [
        'K0 No Prosthetic Mobility', 'K1 Household Ambulator',
        'K2 Limited Community Ambulator', 'K3 Community Ambulator',
        'K4 High Activity User',
    ],

    // ── Early Intervention Domains ──
    EI_HeadControl_Status: ['Achieved', 'Delayed', 'Not Achieved'],
    EI_HeadControl_Goal: ['Develop head control', 'Maintain head in midline', 'Improve neck strength', 'Achieve independent head control'],
    EI_Rolling_Status: ['Rolls both sides', 'Rolls one side', 'Not achieved'],
    EI_Rolling_Goal: ['Achieve rolling both sides', 'Improve trunk rotation', 'Improve segmental rolling', 'Maintain rolling ability'],
    EI_Sitting_Status: ['Sits with support', 'Sits without support', 'Cannot sit'],
    EI_Sitting_Goal: ['Achieve sitting with support', 'Achieve independent sitting', 'Improve sitting balance', 'Improve trunk control'],
    EI_Crawling_Status: ['Crawls independently', 'Crawls with difficulty', 'Not crawling'],
    EI_Crawling_Goal: ['Initiate crawling', 'Improve crawling coordination', 'Achieve independent crawling'],
    EI_Standing_Status: ['Stands with support', 'Stands independently', 'Cannot stand'],
    EI_Standing_Goal: ['Achieve supported standing', 'Achieve independent standing', 'Improve weight bearing', 'Improve postural stability'],
    EI_Walking_Status: ['Walks independently', 'Walks with support', 'Not walking'],
    EI_Walking_Goal: ['Initiate walking', 'Improve walking balance', 'Achieve independent walking', 'Improve gait pattern'],
    EI_HandFunction_Status: ['Normal grasp', 'Delayed grasp', 'Poor hand control'],
    EI_HandFunction_Goal: ['Improve hand grasp', 'Improve bilateral hand use', 'Improve hand coordination', 'Develop pincer grasp'],
    EI_Communication_Status: ['Cooing', 'Babbling', 'Single words', 'Delayed speech'],
    EI_Communication_Goal: ['Increase vocalization', 'Increase single word use', 'Improve expressive language', 'Improve communication intent'],
    EI_Social_Status: ['Normal interaction', 'Limited interaction', 'Poor response'],
    EI_Social_Goal: ['Improve eye contact', 'Increase social interaction', 'Improve response to caregiver', 'Increase participation in play'],
    EI_ServiceLevel: [
        'Level 1 – Daily Service',
        'Level 2 – 3–4 times per month',
        'Level 3 – Once in 15 days',
        'Level 4 – Once in 6 months',
        'Level 5 – Referral',
    ],
    EI_Outcome: ['Improved', 'Slight Improvement', 'No Change', 'Needs Referral'],

    // ── Early Intervention — Additional Domains ──
    EI_SelfCare_Status: ['Dependent', 'Requires assistance', 'Partially independent', 'Independent'],
    EI_SelfCare_Goal: ['Improve feeding skills', 'Improve dressing skills', 'Improve toileting skills', 'Increase independence in ADLs'],
    EI_Attention_Status: ['Poor (no engagement)', 'Limited (fleeting attention)', 'Inconsistent engagement', 'Sustains briefly', 'Sustains well'],
    EI_Attention_Goal: ['Improve eye contact', 'Increase attention span', 'Improve sustained engagement', 'Increase interest in activities/play', 'Encourage task participation', 'Reduce distractibility', 'Develop interactive/social engagement'],
    EI_Play_Status: ['No interest', 'Limited interest', 'Engages with prompting', 'Independent play', 'Interactive/social play'],
    EI_Play_Goal: ['Increase interest in play', 'Improve object interaction', 'Develop functional play', 'Encourage interactive/social play'],
    EI_Intelligence_Status: ['Significant delay', 'Moderate delay', 'Mild delay', 'Age-appropriate'],
    EI_Intelligence_Goal: ['Improve understanding (commands)', 'Improve problem-solving', 'Improve memory & recall', 'Improve cause-effect learning'],
};

/** Convert a string array to {value, label} options for the Select component */
export function toOptions(arr: string[]) {
    return arr.map(v => ({ value: v, label: v }));
}

// ── FIM Locomotion / Mobility breakdown ──
// Replaces the old single "FIM Locomotion" / "FIM Mobility" dropdowns with the
// real FIM sub-items, each scored on FIM_SCALE but with its own description
// per score (from the clinical FIM reference table).
export const FIM_LOCOMOTION_ITEMS = [
    { key: 'fim_walking_wheelchair', label: 'Walking / Wheelchair' },
    { key: 'fim_stairs', label: 'Stairs' },
    { key: 'fim_community_access', label: 'Community Access' },
] as const;

export const FIM_MOBILITY_ITEMS = [
    { key: 'fim_bed_chair_transfer', label: 'Bed / Chair / Wheelchair Transfer' },
    { key: 'fim_toilet_transfer', label: 'Toilet Transfer' },
    { key: 'fim_tub_shower_transfer', label: 'Tub / Shower Transfer' },
] as const;

export const FIM_DESCRIPTIONS: Record<string, Record<string, string>> = {
    fim_walking_wheelchair: {
        '1 Total Assistance': 'Requires total assistance.',
        '2 Maximal Assistance': 'Performs 25–49% independently.',
        '3 Moderate Assistance': 'Performs 50–74% independently.',
        '4 Minimal Assistance': 'Performs ≥75% independently.',
        '5 Supervision / Setup': 'Requires supervision only.',
        '6 Modified Independence': 'Independent using assistive device/extra time.',
        '7 Complete Independence': 'Walks independently without assistance.',
    },
    fim_stairs: {
        '1 Total Assistance': 'Requires total assistance.',
        '2 Maximal Assistance': 'Performs 25–49% independently.',
        '3 Moderate Assistance': 'Performs 50–74% independently.',
        '4 Minimal Assistance': 'Performs ≥75% independently.',
        '5 Supervision / Setup': 'Requires supervision only.',
        '6 Modified Independence': 'Uses handrail/device independently.',
        '7 Complete Independence': 'Climbs stairs independently.',
    },
    fim_community_access: {
        '1 Total Assistance': 'Dependent.',
        '2 Maximal Assistance': 'Needs maximal assistance.',
        '3 Moderate Assistance': 'Needs moderate assistance.',
        '4 Minimal Assistance': 'Needs minimal assistance.',
        '5 Supervision / Setup': 'Needs supervision.',
        '6 Modified Independence': 'Independent with aid/extra time.',
        '7 Complete Independence': 'Independent in community participation.',
    },
    fim_bed_chair_transfer: {
        '1 Total Assistance': 'Requires total assistance.',
        '2 Maximal Assistance': 'Performs 25–49% independently.',
        '3 Moderate Assistance': 'Performs 50–74% independently.',
        '4 Minimal Assistance': 'Performs ≥75% independently.',
        '5 Supervision / Setup': 'Needs supervision.',
        '6 Modified Independence': 'Independent with device/extra time.',
        '7 Complete Independence': 'Transfers independently.',
    },
    fim_toilet_transfer: {
        '1 Total Assistance': 'Requires total assistance.',
        '2 Maximal Assistance': 'Performs 25–49% independently.',
        '3 Moderate Assistance': 'Performs 50–74% independently.',
        '4 Minimal Assistance': 'Performs ≥75% independently.',
        '5 Supervision / Setup': 'Needs supervision.',
        '6 Modified Independence': 'Independent with grab bar/device.',
        '7 Complete Independence': 'Transfers independently on/off toilet.',
    },
    fim_tub_shower_transfer: {
        '1 Total Assistance': 'Requires total assistance.',
        '2 Maximal Assistance': 'Performs 25–49% independently.',
        '3 Moderate Assistance': 'Performs 50–74% independently.',
        '4 Minimal Assistance': 'Performs ≥75% independently.',
        '5 Supervision / Setup': 'Needs supervision.',
        '6 Modified Independence': 'Independent with shower chair/grab bars.',
        '7 Complete Independence': 'Transfers independently in/out tub/shower.',
    },
};
