import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { ClipboardList, CheckCircle2, Wifi, WifiOff } from 'lucide-react';
import { InitialAssessmentForm } from '@/components/assessment/InitialAssessmentForm';
import { ClinicalAssessmentForm } from '@/components/assessment/ClinicalAssessmentForm';
import { FollowUpAssessmentForm } from '@/components/assessment/FollowUpAssessmentForm';
import { Loader } from '@/components/common/Loader';
import { assessmentService } from '@/services/assessmentService';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import type { InitialAssessment, ClinicalAssessment } from '@/types/assessment';

type Step = 1 | 2 | 3;

const STEPS = [
    { num: 1 as Step, label: 'Initial Assessment' },
    { num: 2 as Step, label: 'Clinical Assessment' },
    { num: 3 as Step, label: 'Follow-Up Assessment' },
];

export function AssessmentEntryPage() {
    const { patientId } = useParams<{ patientId: string }>();
    const isOnline = useOnlineStatus();
    const [activeStep, setActiveStep] = useState<Step>(1);
    const [initialData, setInitialData] = useState<InitialAssessment | null>(null);
    const [clinicalData, setClinicalData] = useState<ClinicalAssessment | null>(null);
    const [initialFormData, setInitialFormData] = useState<Partial<InitialAssessment>>(() => ({
        assessment_date: new Date().toISOString().split('T')[0],
    }));
    const [isLoadingExisting, setIsLoadingExisting] = useState(false);
    const [saveNotice, setSaveNotice] = useState<{ message: string; offline: boolean } | null>(null);

    useEffect(() => {
        if (!saveNotice) return;
        const t = setTimeout(() => setSaveNotice(null), 3500);
        return () => clearTimeout(t);
    }, [saveNotice]);

    // Load existing patient when editing via URL param
    useEffect(() => {
        if (patientId) {
            loadExistingPatient(patientId);
        }
    }, [patientId]);

    // Which steps are completed
    const step1Done = !!initialData;
    const step2Done = !!clinicalData;

    const getStepState = (step: Step): 'completed' | 'active' => {
        if (step === 1 && step1Done && activeStep !== 1) return 'completed';
        if (step === 2 && step2Done && activeStep !== 2) return 'completed';
        if (step === activeStep) return 'active';
        return 'completed';
    };

    // Load existing data if user returns to a patient
    const loadExistingPatient = async (patientId: string) => {
        setIsLoadingExisting(true);
        try {
            const initial = await assessmentService.getInitial(patientId);
            if (initial) {
                setInitialData(initial);
                setInitialFormData(initial);
                const clinical = await assessmentService.getClinical(patientId);
                if (clinical) {
                    setClinicalData(clinical);
                    setActiveStep(3);
                } else {
                    setActiveStep(2);
                }
            }
        } finally {
            setIsLoadingExisting(false);
        }
    };

    // Handle Step 1 saved
    const handleInitialSaved = (saved: InitialAssessment) => {
        setInitialData(saved);
        setInitialFormData(saved);
        if (clinicalData && clinicalData.condition !== saved.primary_condition) {
            setClinicalData(null);
        }
        setSaveNotice({
            message: isOnline ? 'Initial assessment saved successfully.' : 'Initial assessment saved offline — will sync when reconnected.',
            offline: !isOnline,
        });
        setActiveStep(2);
    };

    // Handle Step 2 saved
    const handleClinicalSaved = (saved: ClinicalAssessment) => {
        setClinicalData(saved);
        setSaveNotice({
            message: isOnline ? 'Clinical assessment saved successfully.' : 'Clinical assessment saved offline — will sync when reconnected.',
            offline: !isOnline,
        });
        setActiveStep(3);
    };

    // Patient ID is now auto-generated — no lookup needed on typing

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl">
                        <ClipboardList className="text-primary" size={22} />
                    </div>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-text-main">Assessment Entry</h1>
                        <p className="text-sm text-text-muted">
                            {initialData
                                ? `Patient: ${initialData.patient_name} (${initialData.patient_id}) — ${initialData.primary_condition}`
                                : 'Complete the 3-step assessment workflow'}
                        </p>
                    </div>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border self-start sm:self-auto ${isOnline ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                    {isOnline ? <><Wifi size={14} /> Online</> : <><WifiOff size={14} /> Offline</>}
                </div>
            </div>

            {/* Offline notice */}
            {!isOnline && (
                <div className="flex items-start gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800">
                    <WifiOff size={16} className="shrink-0 mt-0.5" />
                    <span>You're offline — assessments will be saved locally and synced automatically when you reconnect.</span>
                </div>
            )}

            {/* Save success notice (auto-dismisses after 3.5s) */}
            {saveNotice && (
                <div className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium border transition-all ${saveNotice.offline ? 'bg-orange-50 text-orange-800 border-orange-200' : 'bg-green-50 text-green-800 border-green-200'}`}>
                    {saveNotice.offline ? <WifiOff size={16} className="shrink-0" /> : <CheckCircle2 size={16} className="shrink-0" />}
                    <span>{saveNotice.message}</span>
                </div>
            )}

            {/* Step Indicator */}
            <div className="flex items-center gap-2 bg-surface p-4 rounded-xl border border-gray-100 shadow-sm">
                {STEPS.map((step, idx) => {
                    const state = getStepState(step.num);
                    return (
                        <div key={step.num} className="flex items-center flex-1">
                            <button
                                onClick={() => setActiveStep(step.num)}
                                className={`flex items-center gap-2 px-2 sm:px-4 py-2.5 rounded-lg text-sm font-medium transition-all w-full cursor-pointer min-h-[44px]
                                    ${state === 'active' ? 'bg-primary text-white shadow-sm' : ''}
                                    ${state === 'completed' ? 'bg-green-50 text-green-700 hover:bg-green-100' : ''}
                                `}
                            >
                                <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0
                                    ${state === 'active' ? 'bg-white/20 text-white' : ''}
                                    ${state === 'completed' ? 'bg-green-200 text-green-800' : ''}
                                `}>
                                    {state === 'completed' ? <CheckCircle2 size={14} /> : step.num}
                                </span>
                                <span className="hidden sm:inline">{step.label}</span>
                            </button>
                            {idx < STEPS.length - 1 && (
                                <div className="h-0.5 w-2 sm:w-4 mx-0.5 sm:mx-1 shrink-0 bg-green-300" />
                            )}
                        </div>
                    );
                })}
            </div>

            {isLoadingExisting && <Loader />}

            {/* Step Content */}
            {!isLoadingExisting && activeStep === 1 && (
                <InitialAssessmentForm
                    data={initialFormData}
                    onChange={setInitialFormData}
                    onSaved={handleInitialSaved}
                    isEdit={!!initialData}
                />
            )}

            {!isLoadingExisting && activeStep === 2 && (
                <ClinicalAssessmentForm
                    key={initialData ? initialData.patient_id + initialData.primary_condition : 'new'}
                    initialData={initialData}
                    existingClinical={clinicalData}
                    onSaved={handleClinicalSaved}
                />
            )}

            {!isLoadingExisting && activeStep === 3 && (
                <FollowUpAssessmentForm
                    key={initialData ? initialData.patient_id : 'new'}
                    initialData={initialData}
                    onEditClinical={() => setActiveStep(2)}
                />
            )}
        </div>
    );
}
