import { useState, useRef, useCallback } from 'react';
import { Card } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { DROPDOWNS, toOptions } from '@/constants/assessmentDropdowns';
import { getVASCategory } from '@/utils/assessmentLogic';
import type { ClinicalAssessment, InitialAssessment } from '@/types/assessment';
import { assessmentService } from '@/services/assessmentService';
import { Activity, Save, Loader2, Baby, Dumbbell, Zap, Home, Shield, Wrench, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { RecommendedExercises } from './RecommendedExercises';
import { CoreServiceDetails } from './CoreServiceDetails';
import type { CoreServiceDetailsRef } from './CoreServiceDetails';
import { ServiceEntryService } from '@/services/serviceEntryService';
import { SyncService } from '@/lib/syncService';
import type { ServiceEntryPayload } from '@/types/serviceEntry';

const EI_DOMAINS = [
    { key: 'head_control', label: 'Head Control', statusKey: 'EI_HeadControl_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_HeadControl_Goal' as keyof typeof DROPDOWNS },
    { key: 'rolling', label: 'Rolling', statusKey: 'EI_Rolling_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Rolling_Goal' as keyof typeof DROPDOWNS },
    { key: 'sitting', label: 'Sitting', statusKey: 'EI_Sitting_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Sitting_Goal' as keyof typeof DROPDOWNS },
    { key: 'crawling', label: 'Crawling', statusKey: 'EI_Crawling_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Crawling_Goal' as keyof typeof DROPDOWNS },
    { key: 'standing', label: 'Standing', statusKey: 'EI_Standing_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Standing_Goal' as keyof typeof DROPDOWNS },
    { key: 'walking', label: 'Walking', statusKey: 'EI_Walking_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Walking_Goal' as keyof typeof DROPDOWNS },
    { key: 'hand_function', label: 'Hand Function', statusKey: 'EI_HandFunction_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_HandFunction_Goal' as keyof typeof DROPDOWNS },
    { key: 'communication', label: 'Communication', statusKey: 'EI_Communication_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Communication_Goal' as keyof typeof DROPDOWNS },
    { key: 'social', label: 'Social', statusKey: 'EI_Social_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Social_Goal' as keyof typeof DROPDOWNS },
    { key: 'self_care', label: 'Self Care', statusKey: 'EI_SelfCare_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_SelfCare_Goal' as keyof typeof DROPDOWNS },
    { key: 'attention', label: 'Attention & Interest', statusKey: 'EI_Attention_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Attention_Goal' as keyof typeof DROPDOWNS },
    { key: 'play', label: 'Play', statusKey: 'EI_Play_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Play_Goal' as keyof typeof DROPDOWNS },
    { key: 'intelligence', label: 'Intelligence', statusKey: 'EI_Intelligence_Status' as keyof typeof DROPDOWNS, goalKey: 'EI_Intelligence_Goal' as keyof typeof DROPDOWNS },
] as const;

const TREATMENT_PLAN = {
    exerciseTherapy: [
        'Strengthening Exercises',
        'Stretching Exercises',
        'Range of Motion (ROM) Exercises',
        'Balance Training',
        'Coordination Exercises',
        'Gait Training',
        'Functional Training',
        'Postural Correction Exercises',
        'Breathing Exercises',
        'Endurance Training',
    ],
    electroTherapy: [
        'TENS',
        'IFT',
        'Ultrasound Therapy (UST)',
        'LASER Therapy',
        'NMES (Neuromuscular Electrical Stimulation)',
        'FES (Functional Electrical Stimulation)',
        'Intermittent Traction',
        'Continuous Traction',
    ],
    homeProgramme: [
        'Strengthening',
        'Stretching',
        'ROM',
        'Balance',
        'Functional Activities',
    ],
    orthosis: [
        'Cervical Collar',
        'Shoulder Support',
        'Elbow Brace',
        'Wrist Splint',
        'Hand Splint',
        'Spinal Brace (LS Belt / TLSO)',
        'Knee Brace',
        'Ankle Foot Orthosis (AFO)',
        'Knee Ankle Foot Orthosis (KAFO)',
        'Foot Orthosis (Insoles)',
    ],
    prosthesis: [
        'Upper Limb Prosthesis',
        'Lower Limb Prosthesis',
        'Below Elbow Prosthesis',
        'Above Elbow Prosthesis',
        'Below Knee Prosthesis',
        'Above Knee Prosthesis',
    ],
};

interface Props {
    initialData: InitialAssessment | null;
    existingClinical: ClinicalAssessment | null;
    onSaved: (saved: ClinicalAssessment) => void;
}

export function ClinicalAssessmentForm({ initialData, existingClinical, onSaved }: Props) {
    const condition = initialData?.primary_condition ?? '';
    const isEI = condition === 'Early Intervention Assessment';
    const isEdit = !!existingClinical?.id;

    const [data, setData] = useState<Partial<ClinicalAssessment>>(() => {
        if (existingClinical) return { ...existingClinical };
        if (!initialData) return { pulmonary_symptoms: [] };
        return {
            patient_id: initialData.patient_id,
            condition,
            side_of_limb_affected: initialData.side_of_limb_affected,
            joint_involved: initialData.joint_involved,
            pulmonary_symptoms: [],
        };
    });

    const [treatmentPlan, setTreatmentPlan] = useState<{
        exercise_therapy: string[];
        electro_therapy: string[];
        home_programme: string[];
        orthosis: string[];
        prosthesis: string[];
    }>(() => {
        const existing = existingClinical as Record<string, unknown> | null;
        return {
            exercise_therapy: (existing?.exercise_therapy as string[]) || [],
            electro_therapy: (existing?.electro_therapy as string[]) || [],
            home_programme: (existing?.home_programme as string[]) || [],
            orthosis: (existing?.orthosis as string[]) || [],
            prosthesis: (existing?.prosthesis as string[]) || [],
        };
    });

    const isOnline = useOnlineStatus();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [serviceData, setServiceData] = useState<ServiceEntryPayload[] | null>(null);
    const [serviceDataValid, setServiceDataValid] = useState(false);
    const serviceRef = useRef<CoreServiceDetailsRef>(null);

    const handleServiceDataChange = useCallback((payloads: ServiceEntryPayload[] | null, isValid: boolean) => {
        setServiceData(payloads);
        setServiceDataValid(isValid);
    }, []);

    if (!initialData) {
        return (
            <Card>
                <p className="text-text-muted text-center py-8">Please complete the Initial Assessment first.</p>
            </Card>
        );
    }

    const set = (field: string, value: string | number | string[] | null) => {
        setData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    };

    const toggleTreatment = (category: 'exercise_therapy' | 'electro_therapy' | 'home_programme' | 'orthosis' | 'prosthesis', item: string) => {
        setTreatmentPlan(prev => ({
            ...prev,
            [category]: prev[category].includes(item)
                ? prev[category].filter(i => i !== item)
                : [...prev[category], item],
        }));
    };

    const toggleSymptom = (symptom: string) => {
        const current = data.pulmonary_symptoms || [];
        const updated = current.includes(symptom)
            ? current.filter(s => s !== symptom)
            : [...current, symptom];
        set('pulmonary_symptoms', updated);
    };

    const validate = (): boolean => {
        const e: Record<string, string> = {};

        if (condition === 'Neuro Muscular Painful Condition') {
            if (!data.rom_aaos) e.rom_aaos = 'ROM is required';
            if (!data.strength_mmt) e.strength_mmt = 'Strength is required';
            if (data.vas_pre == null || data.vas_pre < 0 || data.vas_pre > 10) e.vas_pre = 'VAS Pre must be 0–10';
        }
        if (condition === 'Neurological Condition') {
            if (!data.neuro_strength) e.neuro_strength = 'Strength is required';
            if (!data.neuro_balance) e.neuro_balance = 'Balance is required';
            if (!data.coordination_test) e.coordination_test = 'Coordination test is required';
            if (!data.coordination_severity) e.coordination_severity = 'Severity is required';
        }
        if (condition === 'Pulmonary Condition') {
            if (!data.cough) e.cough = 'Cough is required';
            if (!data.pulmonary_symptoms?.length) e.pulmonary_symptoms = 'Select at least one symptom';
            if (!data.dyspnea_mrmc) e.dyspnea_mrmc = 'Dyspnea is required';
        }
        if (condition === 'Disability') {
            if (!data.disability_type) e.disability_type = 'Disability type is required';
            if (!data.fim_locomotion) e.fim_locomotion = 'FIM Locomotion is required';
            if (!data.fim_mobility) e.fim_mobility = 'FIM Mobility is required';
        }
        if (condition === 'Post Operative Condition') {
            if (!data.postop_surgery_type) e.postop_surgery_type = 'Surgery type is required';
            if (!data.weight_bearing_status) e.weight_bearing_status = 'Weight bearing status is required';
            if (!data.functional_mobility_level) e.functional_mobility_level = 'Mobility level is required';
        }
        if (condition === 'Amputation') {
            if (!data.amputation_level) e.amputation_level = 'Amputation level is required';
            if (!data.residual_limb_condition) e.residual_limb_condition = 'Residual limb condition is required';
            if (!data.prosthesis_status) e.prosthesis_status = 'Prosthesis status is required';
            if (!data.amp_level) e.amp_level = 'AMP level is required';
        }
        if (isEI) {
            for (const domain of EI_DOMAINS) {
                const statusField = `ei_${domain.key}_status`;
                if (!data[statusField as keyof typeof data]) e[statusField] = `${domain.label} status is required`;
            }
            if (!data.ei_service_level) e.ei_service_level = 'Service level is required';
            if (!data.ei_assessor_name?.trim()) e.ei_assessor_name = 'Assessor name is required';
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        // Validate Core Service Details (date consistency, AVAILED end date, etc.)
        // when the section has been filled — its errors are shown inline in the card.
        if (serviceData && serviceData.length > 0 && serviceRef.current && !serviceRef.current.validate()) {
            setErrors({ _form: 'Please fix the errors in Core Service Details before saving.' });
            return;
        }
        if (isEdit && !isOnline) {
            setErrors({ _form: 'Editing a clinical assessment requires an active connection. Please reconnect and try again.' });
            return;
        }
        setIsSaving(true);
        try {
            // Build payload with nulls for non-relevant condition fields
            const payload: Omit<ClinicalAssessment, 'id' | 'created_at'> = {
                patient_id: initialData.patient_id,
                condition,
                side_of_limb_affected: data.side_of_limb_affected || null,
                joint_involved: data.joint_involved || null,
                // Pain
                rom_aaos: condition === 'Neuro Muscular Painful Condition' ? data.rom_aaos || null : null,
                strength_mmt: condition === 'Neuro Muscular Painful Condition' ? data.strength_mmt || null : null,
                vas_pre: condition === 'Neuro Muscular Painful Condition' ? Number(data.vas_pre) : null,
                vas_category_pre: condition === 'Neuro Muscular Painful Condition' ? getVASCategory(Number(data.vas_pre)) : null,
                vas_post: null,
                vas_category_post: null,
                // Neuro
                neuro_strength: condition === 'Neurological Condition' ? data.neuro_strength || null : null,
                neuro_balance: condition === 'Neurological Condition' ? data.neuro_balance || null : null,
                coordination_test: condition === 'Neurological Condition' ? data.coordination_test || null : null,
                coordination_severity: condition === 'Neurological Condition' ? data.coordination_severity || null : null,
                // Pulmonary
                cough: condition === 'Pulmonary Condition' ? data.cough || null : null,
                pulmonary_symptoms: condition === 'Pulmonary Condition' ? data.pulmonary_symptoms || null : null,
                dyspnea_mrmc: condition === 'Pulmonary Condition' ? data.dyspnea_mrmc || null : null,
                // Disability
                disability_type: condition === 'Disability' ? data.disability_type || null : null,
                fim_locomotion: condition === 'Disability' ? data.fim_locomotion || null : null,
                fim_mobility: condition === 'Disability' ? data.fim_mobility || null : null,
                // Post-Op
                postop_surgery_type: condition === 'Post Operative Condition' ? data.postop_surgery_type || null : null,
                weight_bearing_status: condition === 'Post Operative Condition' ? data.weight_bearing_status || null : null,
                functional_mobility_level: condition === 'Post Operative Condition' ? data.functional_mobility_level || null : null,
                // Amputation
                amputation_level: condition === 'Amputation' ? data.amputation_level || null : null,
                residual_limb_condition: condition === 'Amputation' ? data.residual_limb_condition || null : null,
                prosthesis_status: condition === 'Amputation' ? data.prosthesis_status || null : null,
                amp_level: condition === 'Amputation' ? data.amp_level || null : null,
                // Early Intervention
                ei_head_control_status: isEI ? data.ei_head_control_status || null : null,
                ei_head_control_goal: isEI ? data.ei_head_control_goal || null : null,
                ei_rolling_status: isEI ? data.ei_rolling_status || null : null,
                ei_rolling_goal: isEI ? data.ei_rolling_goal || null : null,
                ei_sitting_status: isEI ? data.ei_sitting_status || null : null,
                ei_sitting_goal: isEI ? data.ei_sitting_goal || null : null,
                ei_crawling_status: isEI ? data.ei_crawling_status || null : null,
                ei_crawling_goal: isEI ? data.ei_crawling_goal || null : null,
                ei_standing_status: isEI ? data.ei_standing_status || null : null,
                ei_standing_goal: isEI ? data.ei_standing_goal || null : null,
                ei_walking_status: isEI ? data.ei_walking_status || null : null,
                ei_walking_goal: isEI ? data.ei_walking_goal || null : null,
                ei_hand_function_status: isEI ? data.ei_hand_function_status || null : null,
                ei_hand_function_goal: isEI ? data.ei_hand_function_goal || null : null,
                ei_communication_status: isEI ? data.ei_communication_status || null : null,
                ei_communication_goal: isEI ? data.ei_communication_goal || null : null,
                ei_social_status: isEI ? data.ei_social_status || null : null,
                ei_social_goal: isEI ? data.ei_social_goal || null : null,
                ei_self_care_status: isEI ? data.ei_self_care_status || null : null,
                ei_self_care_goal: isEI ? data.ei_self_care_goal || null : null,
                ei_attention_status: isEI ? data.ei_attention_status || null : null,
                ei_attention_goal: isEI ? data.ei_attention_goal || null : null,
                ei_play_status: isEI ? data.ei_play_status || null : null,
                ei_play_goal: isEI ? data.ei_play_goal || null : null,
                ei_intelligence_status: isEI ? data.ei_intelligence_status || null : null,
                ei_intelligence_goal: isEI ? data.ei_intelligence_goal || null : null,
                ei_service_level: isEI ? data.ei_service_level || null : null,
                ei_outcome: isEI ? data.ei_outcome || null : null,
                ei_assessor_name: isEI ? data.ei_assessor_name || null : null,
                ei_remarks: isEI ? data.ei_remarks || null : null,
                // Treatment Plan
                exercise_therapy: treatmentPlan.exercise_therapy.length > 0 ? treatmentPlan.exercise_therapy : null,
                electro_therapy: treatmentPlan.electro_therapy.length > 0 ? treatmentPlan.electro_therapy : null,
                home_programme: treatmentPlan.home_programme.length > 0 ? treatmentPlan.home_programme : null,
                orthosis: treatmentPlan.orthosis.length > 0 ? treatmentPlan.orthosis : null,
                prosthesis: treatmentPlan.prosthesis.length > 0 ? treatmentPlan.prosthesis : null,
            };

            const result = isEdit
                ? await assessmentService.updateClinical(existingClinical!.id!, payload)
                : await assessmentService.createClinical(payload);

            // Save service entries if data is filled and valid
            if (serviceData && serviceData.length > 0 && serviceDataValid) {
                try {
                    await Promise.all(
                        serviceData.map(payload =>
                            ServiceEntryService.createEntry({
                                ...payload,
                                remarks: 'Created via Assessment Entry',
                            })
                        )
                    );
                    serviceRef.current?.setSaveStatus('saved');
                    if (isOnline) {
                        SyncService.syncPendingRecords().catch(console.error);
                    }
                } catch (serviceErr) {
                    console.error('Service entry creation failed:', serviceErr);
                    serviceRef.current?.setSaveStatus('error');
                }
            }

            onSaved(result);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message
                : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: string }).message)
                : 'Failed to save';
            setErrors({ _form: msg });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            {!isOnline && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm font-medium">
                    <WifiOff size={18} className="shrink-0 text-amber-600" />
                    <span>You are offline. Clinical assessment will be saved locally and synced when you reconnect.</span>
                </div>
            )}
            {errors._form && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errors._form}</div>
            )}

            {/* Common Fields */}
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <Activity size={18} className="text-primary" />
                    <h3 className="font-semibold text-text-main">Clinical Assessment — {condition}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input label="Patient ID" value={initialData.patient_id} disabled />
                    <Input label="Condition" value={condition} disabled />
                    {!isEI && (
                        <>
                            <Select
                                label="Side of Limb Affected"
                                value={data.side_of_limb_affected || ''}
                                onChange={e => set('side_of_limb_affected', e.target.value)}
                                options={toOptions(DROPDOWNS.LimbSide)}
                            />
                            <Select
                                label="Joint Involved"
                                value={data.joint_involved || ''}
                                onChange={e => set('joint_involved', e.target.value)}
                                options={toOptions(DROPDOWNS.Joint)}
                            />
                        </>
                    )}
                </div>
            </Card>

            {/* Pain */}
            {condition === 'Neuro Muscular Painful Condition' && (
                <Card>
                    <h3 className="font-semibold text-text-main mb-4">Pain / Orthopedic Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="ROM (AAOS)"
                            value={data.rom_aaos || ''}
                            onChange={e => set('rom_aaos', e.target.value)}
                            options={toOptions(DROPDOWNS.ROM)}
                            error={errors.rom_aaos}
                            required
                        />
                        <Select
                            label="Strength (MMT)"
                            value={data.strength_mmt || ''}
                            onChange={e => set('strength_mmt', e.target.value)}
                            options={toOptions(DROPDOWNS.Strength)}
                            error={errors.strength_mmt}
                            required
                        />
                        <Input
                            label="VAS Score (Pre)"
                            type="number"
                            min={0}
                            max={10}
                            value={data.vas_pre ?? ''}
                            onChange={e => { const v = parseInt(e.target.value); set('vas_pre', Number.isNaN(v) ? null : v); }}
                            error={errors.vas_pre}
                            required
                        />
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-text-main">VAS Category (Pre)</label>
                            <div className="px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-sm text-text-muted">
                                {data.vas_pre != null ? getVASCategory(Number(data.vas_pre)) : '—'}
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Neuro */}
            {condition === 'Neurological Condition' && (
                <Card>
                    <h3 className="font-semibold text-text-main mb-4">Neuro Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="Neuro Strength"
                            value={data.neuro_strength || ''}
                            onChange={e => set('neuro_strength', e.target.value)}
                            options={toOptions(DROPDOWNS.Strength)}
                            error={errors.neuro_strength}
                            required
                        />
                        <Select
                            label="Balance"
                            value={data.neuro_balance || ''}
                            onChange={e => set('neuro_balance', e.target.value)}
                            options={toOptions(DROPDOWNS.Balance)}
                            error={errors.neuro_balance}
                            required
                        />
                        <Select
                            label="Coordination Test"
                            value={data.coordination_test || ''}
                            onChange={e => set('coordination_test', e.target.value)}
                            options={toOptions(DROPDOWNS.CoordinationTests)}
                            error={errors.coordination_test}
                            required
                        />
                        <Select
                            label="Coordination Severity"
                            value={data.coordination_severity || ''}
                            onChange={e => set('coordination_severity', e.target.value)}
                            options={toOptions(DROPDOWNS.CoordinationSeverity)}
                            error={errors.coordination_severity}
                            required
                        />
                    </div>
                </Card>
            )}

            {/* Pulmonary */}
            {condition === 'Pulmonary Condition' && (
                <Card>
                    <h3 className="font-semibold text-text-main mb-4">Pulmonary Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="Cough"
                            value={data.cough || ''}
                            onChange={e => set('cough', e.target.value)}
                            options={toOptions(DROPDOWNS.Cough)}
                            error={errors.cough}
                            required
                        />
                        <Select
                            label="Dyspnea (mMRC)"
                            value={data.dyspnea_mrmc || ''}
                            onChange={e => set('dyspnea_mrmc', e.target.value)}
                            options={toOptions(DROPDOWNS.Dyspnea)}
                            error={errors.dyspnea_mrmc}
                            required
                        />
                        <div className="md:col-span-2">
                            <label className="text-sm font-medium text-text-main block mb-2">Pulmonary Symptoms</label>
                            <div className="flex flex-wrap gap-2">
                                {DROPDOWNS.PulmonarySymptoms.map(symptom => {
                                    const selected = (data.pulmonary_symptoms || []).includes(symptom);
                                    return (
                                        <button
                                            key={symptom}
                                            type="button"
                                            onClick={() => toggleSymptom(symptom)}
                                            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                                selected
                                                    ? 'bg-primary text-white border-primary'
                                                    : 'bg-white text-text-main border-gray-300 hover:border-primary'
                                            }`}
                                        >
                                            {symptom}
                                        </button>
                                    );
                                })}
                            </div>
                            {errors.pulmonary_symptoms && (
                                <span className="text-xs text-red-500 mt-1 block">{errors.pulmonary_symptoms}</span>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {/* Disability */}
            {condition === 'Disability' && (
                <Card>
                    <h3 className="font-semibold text-text-main mb-4">Disability Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="Disability Type"
                            value={data.disability_type || ''}
                            onChange={e => set('disability_type', e.target.value)}
                            options={toOptions(DROPDOWNS.DisabilityType)}
                            error={errors.disability_type}
                            required
                        />
                        <Select
                            label="FIM Locomotion"
                            value={data.fim_locomotion || ''}
                            onChange={e => set('fim_locomotion', e.target.value)}
                            options={toOptions(DROPDOWNS.FIM)}
                            error={errors.fim_locomotion}
                            required
                        />
                        <Select
                            label="FIM Mobility (Transfers)"
                            value={data.fim_mobility || ''}
                            onChange={e => set('fim_mobility', e.target.value)}
                            options={toOptions(DROPDOWNS.FIM)}
                            error={errors.fim_mobility}
                            required
                        />
                    </div>
                </Card>
            )}

            {/* Post-Operative */}
            {condition === 'Post Operative Condition' && (
                <Card>
                    <h3 className="font-semibold text-text-main mb-4">Post-Operative Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="Surgery Type"
                            value={data.postop_surgery_type || ''}
                            onChange={e => set('postop_surgery_type', e.target.value)}
                            options={toOptions(DROPDOWNS.SurgeryType)}
                            error={errors.postop_surgery_type}
                            required
                        />
                        <Select
                            label="Weight Bearing Status"
                            value={data.weight_bearing_status || ''}
                            onChange={e => set('weight_bearing_status', e.target.value)}
                            options={toOptions(DROPDOWNS.WeightBearing)}
                            error={errors.weight_bearing_status}
                            required
                        />
                        <Select
                            label="Functional Mobility Level"
                            value={data.functional_mobility_level || ''}
                            onChange={e => set('functional_mobility_level', e.target.value)}
                            options={toOptions(DROPDOWNS.Mobility)}
                            error={errors.functional_mobility_level}
                            required
                        />
                    </div>
                </Card>
            )}

            {/* Amputation */}
            {condition === 'Amputation' && (
                <Card>
                    <h3 className="font-semibold text-text-main mb-4">Amputation Assessment</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Select
                            label="Amputation Level"
                            value={data.amputation_level || ''}
                            onChange={e => set('amputation_level', e.target.value)}
                            options={toOptions(DROPDOWNS.AmputationLevel)}
                            error={errors.amputation_level}
                            required
                        />
                        <Select
                            label="Residual Limb Condition"
                            value={data.residual_limb_condition || ''}
                            onChange={e => set('residual_limb_condition', e.target.value)}
                            options={toOptions(DROPDOWNS.ResidualLimb)}
                            error={errors.residual_limb_condition}
                            required
                        />
                        <Select
                            label="Prosthesis Status"
                            value={data.prosthesis_status || ''}
                            onChange={e => set('prosthesis_status', e.target.value)}
                            options={toOptions(DROPDOWNS.Prosthesis)}
                            error={errors.prosthesis_status}
                            required
                        />
                        <Select
                            label="AMP Level (K-Level)"
                            value={data.amp_level || ''}
                            onChange={e => set('amp_level', e.target.value)}
                            options={toOptions(DROPDOWNS.AMP)}
                            error={errors.amp_level}
                            required
                        />
                    </div>
                </Card>
            )}

            {/* Early Intervention Assessment */}
            {isEI && (
                <Card>
                    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                        <Baby size={18} className="text-primary" />
                        <h3 className="font-semibold text-text-main">Developmental Domains</h3>
                    </div>

                    {/* Desktop: Table layout */}
                    <div className="hidden lg:block overflow-x-auto min-w-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50 border-b border-gray-200">
                                    <th className="text-left py-3 px-4 font-semibold text-text-main w-[160px]">Domain</th>
                                    <th className="text-left py-3 px-4 font-semibold text-text-main">Status <span className="text-red-500">*</span></th>
                                    <th className="text-left py-3 px-4 font-semibold text-text-main">Goal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {EI_DOMAINS.map(domain => {
                                    const statusField = `ei_${domain.key}_status` as keyof ClinicalAssessment;
                                    const goalField = `ei_${domain.key}_goal` as keyof ClinicalAssessment;
                                    return (
                                        <tr key={domain.key} className="border-b border-gray-100 hover:bg-gray-50/50">
                                            <td className="py-3 px-4 font-medium text-text-main whitespace-nowrap">{domain.label}</td>
                                            <td className="py-2 px-4">
                                                <select
                                                    value={(data[statusField] as string) || ''}
                                                    onChange={e => set(statusField, e.target.value)}
                                                    className={`w-full px-2.5 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${errors[statusField] ? 'border-red-500' : 'border-gray-300'}`}
                                                >
                                                    <option value="" disabled>Select Status</option>
                                                    {DROPDOWNS[domain.statusKey].map((opt: string) => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                                {errors[statusField] && <span className="text-xs text-red-500">{errors[statusField]}</span>}
                                            </td>
                                            <td className="py-2 px-4">
                                                <select
                                                    value={(data[goalField] as string) || ''}
                                                    onChange={e => set(goalField, e.target.value)}
                                                    className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                                >
                                                    <option value="" disabled>Select Goal</option>
                                                    {DROPDOWNS[domain.goalKey].map((opt: string) => (
                                                        <option key={opt} value={opt}>{opt}</option>
                                                    ))}
                                                </select>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile: Card layout */}
                    <div className="lg:hidden space-y-4">
                        {EI_DOMAINS.map(domain => {
                            const statusField = `ei_${domain.key}_status` as keyof ClinicalAssessment;
                            const goalField = `ei_${domain.key}_goal` as keyof ClinicalAssessment;
                            return (
                                <div key={domain.key} className="p-3 border border-gray-100 rounded-lg bg-gray-50/50">
                                    <p className="font-medium text-text-main mb-2">{domain.label}</p>
                                    <div className="space-y-2">
                                        <div>
                                            <label className="text-xs text-text-muted">Status *</label>
                                            <select
                                                value={(data[statusField] as string) || ''}
                                                onChange={e => set(statusField, e.target.value)}
                                                className={`w-full px-2.5 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary ${errors[statusField] ? 'border-red-500' : 'border-gray-300'}`}
                                            >
                                                <option value="" disabled>Select Status</option>
                                                {DROPDOWNS[domain.statusKey].map((opt: string) => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                            {errors[statusField] && <span className="text-xs text-red-500">{errors[statusField]}</span>}
                                        </div>
                                        <div>
                                            <label className="text-xs text-text-muted">Goal</label>
                                            <select
                                                value={(data[goalField] as string) || ''}
                                                onChange={e => set(goalField, e.target.value)}
                                                className="w-full px-2.5 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                            >
                                                <option value="" disabled>Select Goal</option>
                                                {DROPDOWNS[domain.goalKey].map((opt: string) => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Summary */}
                    <div className="mt-6 pt-4 border-t border-gray-100">
                        <h4 className="font-semibold text-text-main mb-4">Summary</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Select
                                label="Service Level"
                                value={data.ei_service_level || ''}
                                onChange={e => set('ei_service_level', e.target.value)}
                                options={toOptions(DROPDOWNS.EI_ServiceLevel)}
                                error={errors.ei_service_level}
                                required
                            />
                            <Input
                                label="Assessor Name"
                                value={data.ei_assessor_name || ''}
                                onChange={e => set('ei_assessor_name', e.target.value)}
                                error={errors.ei_assessor_name}
                                required
                            />
                            <div className="flex flex-col gap-1">
                                <label className="text-sm font-medium text-text-main">Remarks</label>
                                <textarea
                                    value={data.ei_remarks || ''}
                                    onChange={e => set('ei_remarks', e.target.value)}
                                    rows={3}
                                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                                    placeholder="Additional notes..."
                                />
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Treatment Plan */}
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <Dumbbell size={18} className="text-primary" />
                    <h3 className="font-semibold text-text-main">Treatment Plan</h3>
                </div>

                {/* Exercise Therapy */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Dumbbell size={16} className="text-blue-600" />
                        <h4 className="font-medium text-text-main">Exercise Therapy</h4>
                        {treatmentPlan.exercise_therapy.length > 0 && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                {treatmentPlan.exercise_therapy.length} selected
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {TREATMENT_PLAN.exerciseTherapy.map(item => {
                            const selected = treatmentPlan.exercise_therapy.includes(item);
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleTreatment('exercise_therapy', item)}
                                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                        selected
                                            ? 'bg-blue-600 text-white border-blue-600'
                                            : 'bg-white text-text-main border-gray-300 hover:border-blue-400'
                                    }`}
                                >
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Electro Therapy */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap size={16} className="text-amber-600" />
                        <h4 className="font-medium text-text-main">Electro Therapy</h4>
                        {treatmentPlan.electro_therapy.length > 0 && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                {treatmentPlan.electro_therapy.length} selected
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {TREATMENT_PLAN.electroTherapy.map(item => {
                            const selected = treatmentPlan.electro_therapy.includes(item);
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleTreatment('electro_therapy', item)}
                                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                        selected
                                            ? 'bg-amber-600 text-white border-amber-600'
                                            : 'bg-white text-text-main border-gray-300 hover:border-amber-400'
                                    }`}
                                >
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Home Programme */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Home size={16} className="text-green-600" />
                        <h4 className="font-medium text-text-main">Home Programme</h4>
                        {treatmentPlan.home_programme.length > 0 && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                {treatmentPlan.home_programme.length} selected
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {TREATMENT_PLAN.homeProgramme.map(item => {
                            const selected = treatmentPlan.home_programme.includes(item);
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleTreatment('home_programme', item)}
                                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                        selected
                                            ? 'bg-green-600 text-white border-green-600'
                                            : 'bg-white text-text-main border-gray-300 hover:border-green-400'
                                    }`}
                                >
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Orthosis */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                        <Shield size={16} className="text-purple-600" />
                        <h4 className="font-medium text-text-main">Orthosis</h4>
                        {treatmentPlan.orthosis.length > 0 && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                                {treatmentPlan.orthosis.length} selected
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {TREATMENT_PLAN.orthosis.map(item => {
                            const selected = treatmentPlan.orthosis.includes(item);
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleTreatment('orthosis', item)}
                                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                        selected
                                            ? 'bg-purple-600 text-white border-purple-600'
                                            : 'bg-white text-text-main border-gray-300 hover:border-purple-400'
                                    }`}
                                >
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Prosthesis */}
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <Wrench size={16} className="text-teal-600" />
                        <h4 className="font-medium text-text-main">Prosthesis</h4>
                        {treatmentPlan.prosthesis.length > 0 && (
                            <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">
                                {treatmentPlan.prosthesis.length} selected
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {TREATMENT_PLAN.prosthesis.map(item => {
                            const selected = treatmentPlan.prosthesis.includes(item);
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => toggleTreatment('prosthesis', item)}
                                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                        selected
                                            ? 'bg-teal-600 text-white border-teal-600'
                                            : 'bg-white text-text-main border-gray-300 hover:border-teal-400'
                                    }`}
                                >
                                    {item}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </Card>

            {/* Recommended Exercises */}
            <RecommendedExercises patientId={initialData.patient_id} patientName={initialData.patient_name} condition={condition} />

            {/* Core Service Details — linked to Service History */}
            <CoreServiceDetails
                ref={serviceRef}
                patientName={initialData.patient_name}
                onServiceDataChange={handleServiceDataChange}
            />

            {/* Submit */}
            <div className="flex justify-end">
                <Button onClick={handleSubmit} disabled={isSaving} className="w-full sm:w-auto">
                    {isSaving ? <Loader2 size={16} className="animate-spin mr-2 inline" /> : <Save size={16} className="mr-2 inline" />}
                    {isEdit ? 'Update & Continue' : 'Save & Continue'}
                </Button>
            </div>
        </div>
    );
}
