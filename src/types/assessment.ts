export interface InitialAssessment {
    patient_id: string;
    assessment_date: string;
    patient_name: string;
    age: number;
    gender: string;
    phone: string;
    village: string;
    primary_condition: string;
    chief_complaint: string;
    side_of_limb_affected: string;
    joint_involved: string;
    service_referral_needed?: string | null;
    referral_reason?: string | null;
    document_type: string;
    created_at?: string;
}

export interface ClinicalAssessment {
    id?: number;
    patient_id: string;
    condition: string;
    side_of_limb_affected: string | null;
    joint_involved: string | null;
    // Pain
    rom_aaos: string | null;
    strength_mmt: string | null;
    vas_pre: number | null;
    vas_category_pre: string | null;
    vas_post: number | null;
    vas_category_post: string | null;
    // Neuro
    neuro_strength: string | null;
    neuro_balance: string | null;
    coordination_test: string | null;
    coordination_severity: string | null;
    // Pulmonary
    cough: string | null;
    pulmonary_symptoms: string[] | null;
    dyspnea_mrmc: string | null;
    // Disability
    disability_type: string | null;
    fim_locomotion: string | null;
    fim_mobility: string | null;
    // Disability — FIM Locomotion breakdown
    fim_walking_wheelchair: string | null;
    fim_stairs: string | null;
    fim_community_access: string | null;
    // Disability — FIM Mobility (Transfers) breakdown
    fim_bed_chair_transfer: string | null;
    fim_toilet_transfer: string | null;
    fim_tub_shower_transfer: string | null;
    // Post-Op
    postop_surgery_type: string | null;
    weight_bearing_status: string | null;
    functional_mobility_level: string | null;
    // Amputation
    amputation_level: string | null;
    residual_limb_condition: string | null;
    prosthesis_status: string | null;
    amp_level: string | null;
    // Early Intervention
    ei_head_control_status: string | null;
    ei_head_control_goal: string | null;
    ei_rolling_status: string | null;
    ei_rolling_goal: string | null;
    ei_sitting_status: string | null;
    ei_sitting_goal: string | null;
    ei_crawling_status: string | null;
    ei_crawling_goal: string | null;
    ei_standing_status: string | null;
    ei_standing_goal: string | null;
    ei_walking_status: string | null;
    ei_walking_goal: string | null;
    ei_hand_function_status: string | null;
    ei_hand_function_goal: string | null;
    ei_communication_status: string | null;
    ei_communication_goal: string | null;
    ei_social_status: string | null;
    ei_social_goal: string | null;
    ei_self_care_status: string | null;
    ei_self_care_goal: string | null;
    ei_attention_status: string | null;
    ei_attention_goal: string | null;
    ei_play_status: string | null;
    ei_play_goal: string | null;
    ei_intelligence_status: string | null;
    ei_intelligence_goal: string | null;
    ei_service_level: string | null;
    ei_outcome: string | null;
    ei_assessor_name: string | null;
    ei_remarks: string | null;
    // Treatment Plan
    exercise_therapy: string[] | null;
    electro_therapy: string[] | null;
    home_programme: string[] | null;
    orthosis: string[] | null;
    prosthesis: string[] | null;
    created_at?: string;
}

export interface FollowUpAssessment {
    id?: number;
    patient_id: string;
    visit_date: string;
    session_number: number;
    condition: string;
    side_of_limb_affected: string | null;
    joint_involved: string | null;
    // Pain
    rom: string | null;
    strength: string | null;
    vas_previous: number | null;
    vas_current: number | null;
    vas_category_pre: string | null;
    vas_post: number | null;
    vas_category_post: string | null;
    // Neuro
    neuro_strength: string | null;
    balance: string | null;
    coordination_test: string | null;
    coordination_severity: string | null;
    // Pulmonary
    dyspnea_mrmc: string | null;
    // Disability
    fim_locomotion: string | null;
    fim_mobility: string | null;
    // Disability — FIM Locomotion breakdown
    fim_walking_wheelchair: string | null;
    fim_stairs: string | null;
    fim_community_access: string | null;
    // Disability — FIM Mobility (Transfers) breakdown
    fim_bed_chair_transfer: string | null;
    fim_toilet_transfer: string | null;
    fim_tub_shower_transfer: string | null;
    // Amputation
    amp_level: string | null;
    // Early Intervention
    ei_head_control_status: string | null;
    ei_head_control_goal: string | null;
    ei_rolling_status: string | null;
    ei_rolling_goal: string | null;
    ei_sitting_status: string | null;
    ei_sitting_goal: string | null;
    ei_crawling_status: string | null;
    ei_crawling_goal: string | null;
    ei_standing_status: string | null;
    ei_standing_goal: string | null;
    ei_walking_status: string | null;
    ei_walking_goal: string | null;
    ei_hand_function_status: string | null;
    ei_hand_function_goal: string | null;
    ei_communication_status: string | null;
    ei_communication_goal: string | null;
    ei_social_status: string | null;
    ei_social_goal: string | null;
    ei_self_care_status: string | null;
    ei_self_care_goal: string | null;
    ei_attention_status: string | null;
    ei_attention_goal: string | null;
    ei_play_status: string | null;
    ei_play_goal: string | null;
    ei_intelligence_status: string | null;
    ei_intelligence_goal: string | null;
    ei_service_level: string | null;
    ei_outcome: string | null;
    ei_assessor_name: string | null;
    ei_remarks: string | null;
    created_at?: string;
}
