import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Loader } from '@/components/common/Loader';
import { AssessmentSessionSummary } from '@/components/assessment/AssessmentSessionSummary';
import { assessmentService } from '@/services/assessmentService';
import { exerciseService } from '@/services/exerciseService';
import { useGoBack } from '@/hooks/useGoBack';
import { getVASCategory, isDisabilityCondition } from '@/utils/assessmentLogic';
import type { InitialAssessment, ClinicalAssessment, FollowUpAssessment } from '@/types/assessment';
import type { PatientRecommendedExercise } from '@/types/exercise';
import {
    ClipboardList,
    User,
    Activity,
    Edit,
    ArrowLeft,
    Stethoscope,
    CheckCircle2,
    XCircle,
    Dumbbell,
    Zap,
    Home,
    Shield,
    Wrench,
    ImageIcon,
} from 'lucide-react';

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
        <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
            <p className="text-sm font-medium text-text-main">{value ?? '—'}</p>
        </div>
    );
}

const conditionColors: Record<string, string> = {
    'Neuro Muscular Painful Condition': 'bg-red-100 text-red-700',
    'Neurological Condition': 'bg-purple-100 text-purple-700',
    'Pulmonary Condition': 'bg-blue-100 text-blue-700',
    'Post Operative Condition': 'bg-amber-100 text-amber-700',
    'Disability': 'bg-teal-100 text-teal-700',
    'Amputation': 'bg-orange-100 text-orange-700',
    'Early Intervention Assessment': 'bg-pink-100 text-pink-700',
};

export function AssessmentViewPage() {
    const { patientId } = useParams<{ patientId: string }>();
    const navigate = useNavigate();
    const goBackToHistory = useGoBack('/assessments/history');

    const [initial, setInitial] = useState<InitialAssessment | null>(null);
    const [clinical, setClinical] = useState<ClinicalAssessment | null>(null);
    const [followUps, setFollowUps] = useState<FollowUpAssessment[]>([]);
    const [recommendedExercises, setRecommendedExercises] = useState<PatientRecommendedExercise[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!patientId) return;
        const load = async () => {
            setIsLoading(true);
            const [init, clin, fups, exs] = await Promise.all([
                assessmentService.getInitial(patientId),
                assessmentService.getClinical(patientId),
                assessmentService.getFollowUps(patientId),
                exerciseService.getPatientExercises(patientId),
            ]);
            setInitial(init);
            setClinical(clin);
            setFollowUps(fups);
            setRecommendedExercises(exs);
            setIsLoading(false);
        };
        load();
    }, [patientId]);

    if (isLoading) return <Loader />;

    if (!initial) {
        return (
            <div className="text-center py-24">
                <XCircle size={48} className="text-red-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Patient not found.</p>
                <Button variant="outline" className="mt-4" onClick={goBackToHistory}>
                    <ArrowLeft size={16} className="mr-2 inline" /> Back to History
                </Button>
            </div>
        );
    }

    const condition = initial.primary_condition;

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl">
                        <ClipboardList className="text-primary" size={22} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-text-main">{initial.patient_name}</h1>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs font-mono font-bold text-blue-600">{initial.patient_id}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${conditionColors[condition] || 'bg-gray-100 text-gray-700'}`}>
                                {condition}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={goBackToHistory}>
                        <ArrowLeft size={16} className="mr-2 inline" /> Back
                    </Button>
                    <Button onClick={() => navigate(`/assessments/edit/${initial.patient_id}`, { state: { startStep: 1 } })}>
                        <Edit size={16} className="mr-2 inline" /> Edit Assessment
                    </Button>
                </div>
            </div>

            {/* ── Step 1: Initial Assessment ── */}
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <User size={18} className="text-primary" />
                    <h3 className="font-semibold text-text-main">Step 1 — Initial Assessment</h3>
                    <CheckCircle2 size={16} className="text-green-500 ml-auto" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                    <Field label="Assessment Date" value={new Date(initial.assessment_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} />
                    <Field label="Age" value={initial.age} />
                    <Field label="Gender" value={initial.gender} />
                    <Field label="Phone" value={initial.phone} />
                    <Field label="Village" value={initial.village} />
                    <Field label="Primary Condition" value={initial.primary_condition} />
                    <Field label="Chief Complaint" value={initial.chief_complaint} />
                    <Field label="Side of Limb" value={initial.side_of_limb_affected} />
                    <Field label="Joint Involved" value={initial.joint_involved} />
                    <Field label="Document Type" value={initial.document_type} />
                    {initial.service_referral_needed && (
                        <Field label="Service Referral Needed" value={initial.service_referral_needed} />
                    )}
                    {initial.referral_reason && (
                        <Field label="Reason for Referral" value={initial.referral_reason} />
                    )}
                </div>
            </Card>

            {/* ── Step 2: Clinical Assessment ── */}
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <Stethoscope size={18} className="text-primary" />
                    <h3 className="font-semibold text-text-main">Step 2 — Clinical Assessment ({condition})</h3>
                    {clinical
                        ? <CheckCircle2 size={16} className="text-green-500 ml-auto" />
                        : <span className="ml-auto text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Pending</span>
                    }
                </div>

                {!clinical ? (
                    <p className="text-sm text-gray-400 text-center py-8">Clinical assessment not completed yet.</p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        <Field label="Side of Limb" value={clinical.side_of_limb_affected} />
                        <Field label="Joint Involved" value={clinical.joint_involved} />

                        {/* Pain */}
                        {condition === 'Neuro Muscular Painful Condition' && (
                            <>
                                <Field label="ROM (AAOS)" value={clinical.rom_aaos} />
                                <Field label="Strength (MMT)" value={clinical.strength_mmt} />
                                <Field label="VAS Pre" value={clinical.vas_pre} />
                                <Field label="VAS Category (Pre)" value={clinical.vas_pre != null ? getVASCategory(clinical.vas_pre) : null} />
                                <Field label="VAS Post" value={clinical.vas_post} />
                                <Field label="VAS Category (Post)" value={clinical.vas_post != null ? getVASCategory(clinical.vas_post) : null} />
                            </>
                        )}

                        {/* Neuro */}
                        {condition === 'Neurological Condition' && (
                            <>
                                <Field label="Neuro Strength" value={clinical.neuro_strength} />
                                <Field label="Balance" value={clinical.neuro_balance} />
                                <Field label="Coordination Test" value={clinical.coordination_test} />
                                <Field label="Coordination Severity" value={clinical.coordination_severity} />
                            </>
                        )}

                        {/* Pulmonary */}
                        {condition === 'Pulmonary Condition' && (
                            <>
                                <Field label="Cough" value={clinical.cough} />
                                <Field label="Pulmonary Symptoms" value={clinical.pulmonary_symptoms?.join(', ')} />
                                <Field label="Dyspnea (mMRC)" value={clinical.dyspnea_mrmc} />
                            </>
                        )}

                        {/* Disability */}
                        {isDisabilityCondition(condition) && (
                            <>
                                <Field label="Disability Type" value={clinical.disability_type} />
                                <Field label="Walking / Wheelchair" value={clinical.fim_walking_wheelchair} />
                                <Field label="Stairs" value={clinical.fim_stairs} />
                                <Field label="Community Access" value={clinical.fim_community_access} />
                                <Field label="Bed / Chair / Wheelchair Transfer" value={clinical.fim_bed_chair_transfer} />
                                <Field label="Toilet Transfer" value={clinical.fim_toilet_transfer} />
                                <Field label="Tub / Shower Transfer" value={clinical.fim_tub_shower_transfer} />
                                {/* Pre-migration records may only have the old flat scores */}
                                {(clinical.fim_locomotion || clinical.fim_mobility) && (
                                    <>
                                        <Field label="FIM Locomotion (legacy)" value={clinical.fim_locomotion} />
                                        <Field label="FIM Mobility (legacy)" value={clinical.fim_mobility} />
                                    </>
                                )}
                            </>
                        )}

                        {/* Post-Operative */}
                        {condition === 'Post Operative Condition' && (
                            <>
                                <Field label="Surgery Type" value={clinical.postop_surgery_type} />
                                <Field label="Weight Bearing Status" value={clinical.weight_bearing_status} />
                                <Field label="Functional Mobility" value={clinical.functional_mobility_level} />
                            </>
                        )}

                        {/* Amputation */}
                        {condition === 'Amputation' && (
                            <>
                                <Field label="Amputation Level" value={clinical.amputation_level} />
                                <Field label="Residual Limb Condition" value={clinical.residual_limb_condition} />
                                <Field label="Prosthesis Status" value={clinical.prosthesis_status} />
                                <Field label="AMP Level (K-Level)" value={clinical.amp_level} />
                            </>
                        )}
                    </div>
                )}
            </Card>

            <AssessmentSessionSummary condition={condition} clinical={clinical} followUps={followUps} />

            {/* ── Recommended Treatment Plan ── */}
            {clinical && (
                (clinical.exercise_therapy?.length ||
                    clinical.electro_therapy?.length ||
                    clinical.home_programme?.length ||
                    clinical.orthosis?.length ||
                    clinical.prosthesis?.length) ? (
                    <Card>
                        <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                            <ClipboardList size={18} className="text-primary" />
                            <h3 className="font-semibold text-text-main">Recommended Treatment Plan</h3>
                            <CheckCircle2 size={16} className="text-green-500 ml-auto" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {[
                                { label: 'Exercise Therapy', items: clinical.exercise_therapy, icon: Dumbbell, iconCls: 'text-emerald-600', tagCls: 'bg-emerald-100 text-emerald-700' },
                                { label: 'Electro Therapy', items: clinical.electro_therapy, icon: Zap, iconCls: 'text-amber-600', tagCls: 'bg-amber-100 text-amber-700' },
                                { label: 'Home Programme', items: clinical.home_programme, icon: Home, iconCls: 'text-blue-600', tagCls: 'bg-blue-100 text-blue-700' },
                                { label: 'Orthosis', items: clinical.orthosis, icon: Shield, iconCls: 'text-purple-600', tagCls: 'bg-purple-100 text-purple-700' },
                                { label: 'Prosthesis', items: clinical.prosthesis, icon: Wrench, iconCls: 'text-rose-600', tagCls: 'bg-rose-100 text-rose-700' },
                            ].filter(g => g.items && g.items.length > 0).map(group => {
                                const Icon = group.icon;
                                return (
                                    <div key={group.label} className="p-4 rounded-lg border border-gray-100 bg-gray-50/40">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Icon size={14} className={group.iconCls} />
                                            <p className="text-xs font-bold text-text-main uppercase tracking-wide">{group.label}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                            {group.items!.map((item, i) => (
                                                <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${group.tagCls}`}>
                                                    {item}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                ) : null
            )}

            {/* ── Recommended Exercises ── */}
            {recommendedExercises.length > 0 && (
                <Card>
                    <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                        <Dumbbell size={18} className="text-emerald-600" />
                        <h3 className="font-semibold text-text-main">Recommended Exercises</h3>
                        <span className="ml-auto text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                            {recommendedExercises.length} exercise{recommendedExercises.length !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <div className="space-y-3">
                        {recommendedExercises.map(rec => (
                            <div key={rec.id} className="rounded-xl border-2 border-emerald-200 bg-emerald-50/20 overflow-hidden">
                                <div className="flex gap-4 p-4">
                                    <div className="shrink-0 w-28 h-24 md:w-36 md:h-28 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                                        {rec.exercise?.thumbnail_url ? (
                                            <img src={rec.exercise.thumbnail_url} alt={rec.exercise.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <ImageIcon size={28} className="text-gray-300" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-semibold text-text-main text-sm md:text-base">
                                            {rec.exercise?.name || 'Unknown Exercise'}
                                        </h4>
                                        {rec.exercise?.heading && (
                                            <p className="text-xs text-emerald-600 font-medium">{rec.exercise.heading}</p>
                                        )}
                                        {rec.exercise?.description && (
                                            <p className="text-xs md:text-sm text-text-muted mt-1.5 leading-relaxed line-clamp-2">
                                                {rec.exercise.description}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-3 mt-3">
                                            <div className="px-3 py-1 bg-white rounded-lg border border-emerald-200">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Times: </span>
                                                <span className="text-xs font-semibold text-text-main">{rec.times || '—'}</span>
                                            </div>
                                            <div className="px-3 py-1 bg-white rounded-lg border border-emerald-200">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Repetition: </span>
                                                <span className="text-xs font-semibold text-text-main">{rec.repetitions || '—'}</span>
                                            </div>
                                            <div className="px-3 py-1 bg-white rounded-lg border border-emerald-200">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Set: </span>
                                                <span className="text-xs font-semibold text-text-main">{rec.sets || '—'}</span>
                                            </div>
                                            <div className="px-3 py-1 bg-white rounded-lg border border-emerald-200">
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Hold: </span>
                                                <span className="text-xs font-semibold text-text-main">{rec.hold || '—'}</span>
                                            </div>
                                        </div>
                                        {rec.notes && (
                                            <p className="text-xs text-text-muted mt-2 italic">Note: {rec.notes}</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Edit Button at Bottom */}
            <div className="flex items-center justify-between bg-surface p-5 rounded-xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-3">
                    <Activity size={18} className="text-primary" />
                    <span className="text-sm text-text-muted">
                        Need to update this assessment? Edit any step below.
                    </span>
                </div>
                <Button onClick={() => navigate(`/assessments/edit/${initial.patient_id}`, { state: { startStep: 3, openFollowUpSession: true } })}>
                    <Edit size={16} className="mr-2 inline" /> Edit Follow Up
                </Button>
            </div>
        </div>
    );
}
