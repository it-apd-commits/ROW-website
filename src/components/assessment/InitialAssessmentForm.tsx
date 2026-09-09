import { useState, useEffect } from 'react';
import { Card } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { DROPDOWNS, toOptions } from '@/constants/assessmentDropdowns';
import type { InitialAssessment } from '@/types/assessment';
import { assessmentService } from '@/services/assessmentService';
import { BeneficiarySelect, type Beneficiary } from '@/components/beneficiary/BeneficiarySelect';
import { User, Stethoscope, Save, Loader2, WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface Props {
    data: Partial<InitialAssessment>;
    onChange: (data: Partial<InitialAssessment>) => void;
    onSaved: (saved: InitialAssessment) => void;
    isEdit: boolean;
}

export function InitialAssessmentForm({ data, onChange, onSaved, isEdit }: Props) {
    const isOnline = useOnlineStatus();
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);

    // A phone number is often shared across a household (spouses, parent +
    // adult child) — it can't reliably tell two people apart. Requiring the
    // beneficiary to be picked from the register (like Service Entry already
    // does) is what actually guarantees this assessment is tied to the right
    // person, instead of guessing from name/phone after the fact.
    const handleSelectBeneficiary = (b: Beneficiary) => {
        onChange({
            ...data,
            patient_name: b.name,
            age: b.age ?? data.age,
            gender: b.gender || data.gender,
            phone: b.mobile_no || data.phone || '',
            village: b.city || b.address || data.village || '',
            beneficiary_id: b._isOffline ? null : b.id,
            beneficiary_offline_token: b._isOffline ? b.id : null,
        });
        if (errors.patient_name) setErrors(prev => { const n = { ...prev }; delete n.patient_name; return n; });
    };

    // Auto-generate Patient ID for new assessments. Guarded against this
    // component unmounting before the async call resolves (e.g. a transient
    // "new record" mount that gets replaced once an existing patient's real
    // data finishes loading) — without this, the stale callback would fire
    // later and overwrite the real data with a blank record + a freshly
    // generated ID.
    useEffect(() => {
        if (isEdit || data.patient_id) return;
        let cancelled = false;
        assessmentService.generatePatientId().then(id => {
            if (cancelled) return;
            onChange({ ...data, patient_id: id });
        });
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (field: string, value: string | number) => {
        onChange({ ...data, [field]: value });
        if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    };

    const isEI = data.primary_condition === 'Early Intervention Assessment';

    const validate = (): boolean => {
        const e: Record<string, string> = {};
        if (!data.patient_id?.trim()) e.patient_id = 'Patient ID is required';
        if (!data.assessment_date) e.assessment_date = 'Assessment date is required';
        if (!data.beneficiary_id && !data.beneficiary_offline_token) {
            e.patient_name = 'Select the beneficiary from the register — a phone number alone can\'t tell family members apart';
        } else if (!data.patient_name || data.patient_name.trim().length < 2) {
            e.patient_name = 'Name must be at least 2 characters';
        }
        if (!data.age || data.age < 1 || data.age > 120) e.age = 'Age must be between 1 and 120';
        if (!data.gender) e.gender = 'Gender is required';
        if (data.phone && !/^\d{10}$/.test(data.phone)) e.phone = 'Enter a valid 10-digit phone number';
        if (!data.village?.trim()) e.village = 'Village is required';
        if (!data.primary_condition) e.primary_condition = 'Primary condition is required';
        if (!isEI) {
            if (!data.chief_complaint) e.chief_complaint = 'Chief complaint is required';
            if (!data.side_of_limb_affected) e.side_of_limb_affected = 'Side of limb is required';
            if (!data.joint_involved) e.joint_involved = 'Joint involved is required';
        }
        if (!data.document_type) e.document_type = 'Document type is required';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async () => {
        if (!validate()) return;
        setIsSaving(true);
        try {
            const payload = {
                patient_id: data.patient_id!,
                assessment_date: data.assessment_date!,
                patient_name: data.patient_name!,
                age: Number(data.age),
                gender: data.gender!,
                phone: data.phone || '',
                village: data.village!,
                primary_condition: data.primary_condition!,
                chief_complaint: isEI ? 'N/A' : data.chief_complaint!,
                side_of_limb_affected: isEI ? 'N/A' : data.side_of_limb_affected!,
                joint_involved: isEI ? 'N/A' : data.joint_involved!,
                service_referral_needed: isEI ? null : (data.service_referral_needed || null),
                referral_reason: isEI ? null : (data.referral_reason || null),
                document_type: data.document_type!,
                beneficiary_id: data.beneficiary_id ?? null,
                beneficiary_offline_token: data.beneficiary_offline_token ?? null,
            };
            const result = isEdit
                ? await assessmentService.updateInitial(payload.patient_id, payload)
                : await assessmentService.createInitial(payload);
            onSaved(result);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message
                : (err && typeof err === 'object' && 'message' in err) ? String((err as { message: string }).message)
                : 'Failed to save';
            // createInitial only throws when the save genuinely failed (a successful
            // offline save returns normally) — so always surface the error.
            setErrors({ _form: msg });
        } finally {
            setIsSaving(false);
        }
    };

    const today = new Date().toISOString().split('T')[0];

    return (
        <div className="space-y-6">
            {!isOnline && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm font-medium">
                    <WifiOff size={18} className="shrink-0 text-amber-600" />
                    <span>You are offline. Assessment data will be saved locally and synced when you reconnect. Patient ID will use an offline format (O-prefix).</span>
                </div>
            )}
            {errors._form && (
                <div className={`p-3 border rounded-lg text-sm ${errors._form.includes('offline') ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-700'}`}>{errors._form}</div>
            )}

            {/* Patient Demographics */}
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <User size={18} className="text-primary" />
                    <h3 className="font-semibold text-text-main">Patient Demographics</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input
                        label="Patient ID"
                        value={data.patient_id || 'Generating...'}
                        disabled
                        className="bg-gray-50 font-mono"
                    />
                    <Input
                        label="Assessment Date"
                        type="date"
                        value={data.assessment_date || today}
                        onChange={e => set('assessment_date', e.target.value)}
                        error={errors.assessment_date}
                        required
                    />
                    <div>
                        <BeneficiarySelect
                            placeholder="Patient Name (Search Beneficiary Register)"
                            required
                            onSelect={handleSelectBeneficiary}
                            selectedId={data.beneficiary_id ?? data.beneficiary_offline_token ?? undefined}
                        />
                        {errors.patient_name && <span className="text-xs text-red-500 mt-1 block">{errors.patient_name}</span>}
                    </div>
                    <Input
                        label="Age"
                        type="number"
                        min={1}
                        max={120}
                        value={data.age ?? ''}
                        onChange={e => set('age', parseInt(e.target.value) || 0)}
                        error={errors.age}
                        required
                    />
                    <Select
                        label="Gender"
                        value={data.gender || ''}
                        onChange={e => set('gender', e.target.value)}
                        options={toOptions(DROPDOWNS.Gender)}
                        error={errors.gender}
                        required
                    />
                    <Input
                        label="Phone Number"
                        type="tel"
                        value={data.phone || ''}
                        onChange={e => set('phone', e.target.value)}
                        error={errors.phone}
                        placeholder="10-digit number (optional)"
                    />
                    <Input
                        label="Village"
                        value={data.village || ''}
                        onChange={e => set('village', e.target.value)}
                        error={errors.village}
                        required
                    />
                </div>
            </Card>

            {/* Clinical Intake */}
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <Stethoscope size={18} className="text-primary" />
                    <h3 className="font-semibold text-text-main">Clinical Intake</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <Select
                            label="Primary Condition"
                            value={data.primary_condition || ''}
                            onChange={e => set('primary_condition', e.target.value)}
                            options={toOptions(DROPDOWNS.Condition)}
                            error={errors.primary_condition}
                            required
                        />
                        <p className="text-xs text-text-muted mt-1">This controls which fields appear in Clinical Assessment</p>
                    </div>
                    {!isEI && (
                        <>
                            <Select
                                label="Chief Complaint"
                                value={data.chief_complaint || ''}
                                onChange={e => set('chief_complaint', e.target.value)}
                                options={toOptions(DROPDOWNS.ChiefComplaint)}
                                error={errors.chief_complaint}
                                required
                            />
                            <Select
                                label="Side of Limb Affected"
                                value={data.side_of_limb_affected || ''}
                                onChange={e => set('side_of_limb_affected', e.target.value)}
                                options={toOptions(DROPDOWNS.LimbSide)}
                                error={errors.side_of_limb_affected}
                                required
                            />
                            <Select
                                label="Joint Involved"
                                value={data.joint_involved || ''}
                                onChange={e => set('joint_involved', e.target.value)}
                                options={toOptions(DROPDOWNS.Joint)}
                                error={errors.joint_involved}
                                required
                            />
                            <Select
                                label="Service Referral / Assessment Needed"
                                value={data.service_referral_needed || ''}
                                onChange={e => set('service_referral_needed', e.target.value)}
                                options={[{ value: '', label: '-- None --' }, ...toOptions(DROPDOWNS.ServiceReferralNeeded)]}
                                error={errors.service_referral_needed}
                            />
                            <Select
                                label="Reason for Referral / Assessment"
                                value={data.referral_reason || ''}
                                onChange={e => set('referral_reason', e.target.value)}
                                options={[{ value: '', label: '-- None --' }, ...toOptions(DROPDOWNS.ReferralReason)]}
                                error={errors.referral_reason}
                            />
                        </>
                    )}
                    <Select
                        label="Document Type"
                        value={data.document_type || ''}
                        onChange={e => set('document_type', e.target.value)}
                        options={toOptions(DROPDOWNS.Documents)}
                        error={errors.document_type}
                        required
                    />
                </div>
            </Card>

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
