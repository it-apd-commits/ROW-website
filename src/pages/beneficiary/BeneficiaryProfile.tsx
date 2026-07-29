import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import {
    User,
    MapPin,
    Phone,
    Calendar,
    ArrowLeft,
    Activity,
    Plus,
    Clock,
    Stethoscope,
    ClipboardList,
    Eye,
} from 'lucide-react';
import type { OfflineBeneficiary } from '@/lib/db';
import type { ServiceEntry } from '@/types/serviceEntry';
import type { InitialAssessment } from '@/types/assessment';
import { usePermissions } from '@/hooks/usePermissions';
import { AssignFileNumberModal, type AssignFileNumberTarget } from '@/components/beneficiary/AssignFileNumberModal';

interface Service {
    id: string;
    service_type: string;
    service_date: string;
    provider_name?: string;
    venue?: string;
    notes?: string;
    total_hours?: number;
    status?: string;
    mode_of_service?: string;
    follow_up?: string;
}

interface AssessmentSummary {
    patient_id: string;
    assessment_date: string;
    primary_condition: string;
    chief_complaint: string;
    clinical_done: boolean;
    follow_up_count: number;
    latest_follow_up_date: string | null;
}

// Same badge coloring as AssessmentHistory.tsx, kept in sync manually since
// there's no shared constants module for it yet.
const CONDITION_COLORS: Record<string, string> = {
    'Pain': 'bg-red-100 text-red-700',
    'Neuro': 'bg-purple-100 text-purple-700',
    'Pulmonary': 'bg-blue-100 text-blue-700',
    'Post-Operative': 'bg-amber-100 text-amber-700',
    'Disability': 'bg-teal-100 text-teal-700',
    'Amputation': 'bg-orange-100 text-orange-700',
    'Early Intervention Assessment': 'bg-pink-100 text-pink-700',
};

export function BeneficiaryProfilePage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [beneficiary, setBeneficiary] = useState<OfflineBeneficiary | null>(null);
    const [services, setServices] = useState<Service[]>([]);
    const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [assignTarget, setAssignTarget] = useState<AssignFileNumberTarget | null>(null);
    const { canImportFileNumbers } = usePermissions();

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            // Fetch beneficiary details
            const { data: bData, error: bError } = await supabase
                .from('beneficiaries')
                .select('*')
                .eq('id', id)
                .single();

            if (bError) throw bError;
            setBeneficiary(bData);

            // Fetch service history using all known identifiers for this beneficiary:
            // file_number (when assigned), UUID id (offline entries resolved by sync),
            // offline_token (legacy import-xxx entries already on server), name (fallback).
            const searchValues = [bData.file_number, bData.id, bData.offline_token, bData.name].filter(Boolean);
            if (searchValues.length > 0) {
                const { data: sData, error: sError } = await supabase
                    .from('service_entries')
                    .select('*')
                    .in('file_number', searchValues)
                    .order('schedule_date', { ascending: false });

                if (sError) throw sError;

                const mappedServices: Service[] = (sData as ServiceEntry[] || []).map((s) => ({
                    id: s.id,
                    service_type: s.service_code,
                    service_date: s.schedule_date,
                    provider_name: s.service_provider_code,
                    venue: s.location_code,
                    notes: s.remarks || undefined,
                    total_hours: s.total_hours,
                    status: s.status,
                    mode_of_service: s.mode_of_service,
                    follow_up: s.custom_field2 || undefined,
                }));
                setServices(mappedServices);
            }

            // Fetch assessments. There's no beneficiary_id/file_number column on the
            // assessment tables — match best-effort by name or phone, the same
            // soft-linking approach the service history lookup above already uses.
            // Two separate queries (not a combined .or() filter) so a name containing
            // a comma/parenthesis can't corrupt the filter string and silently zero
            // out both matches, and so name matching can be a tolerant substring
            // search instead of requiring an exact full-string match.
            let assessmentSummaries: AssessmentSummary[] = [];
            const nameMatch = (bData.name || '').trim();
            const phoneMatch = (bData.mobile_no || '').trim();
            if (nameMatch || phoneMatch) {
                const [byName, byPhone] = await Promise.all([
                    nameMatch
                        ? supabase.from('initial_assessment').select('*').ilike('patient_name', `%${nameMatch}%`)
                        : Promise.resolve({ data: [] as InitialAssessment[], error: null }),
                    phoneMatch
                        ? supabase.from('initial_assessment').select('*').eq('phone', phoneMatch)
                        : Promise.resolve({ data: [] as InitialAssessment[], error: null }),
                ]);
                if (byName.error) throw byName.error;
                if (byPhone.error) throw byPhone.error;

                const seen = new Set<string>();
                const initials = [...(byName.data || []), ...(byPhone.data || [])]
                    .filter((i: InitialAssessment) => (seen.has(i.patient_id) ? false : (seen.add(i.patient_id), true)))
                    .sort((a: InitialAssessment, b: InitialAssessment) => b.assessment_date.localeCompare(a.assessment_date));

                if (initials.length > 0) {
                    const patientIds = (initials as InitialAssessment[]).map((i) => i.patient_id);

                    const { data: clinicals } = await supabase
                        .from('clinical_assessment')
                        .select('patient_id')
                        .in('patient_id', patientIds);
                    const clinicalSet = new Set((clinicals || []).map((c: { patient_id: string }) => c.patient_id));

                    const { data: followUps } = await supabase
                        .from('follow_up_assessment')
                        .select('patient_id, visit_date, session_number')
                        .in('patient_id', patientIds)
                        .order('session_number', { ascending: false });

                    const followUpMap = new Map<string, { count: number; latestDate: string | null }>();
                    (followUps || []).forEach((f: { patient_id: string; visit_date: string }) => {
                        const existing = followUpMap.get(f.patient_id);
                        if (!existing) {
                            followUpMap.set(f.patient_id, { count: 1, latestDate: f.visit_date });
                        } else {
                            existing.count++;
                        }
                    });

                    assessmentSummaries = (initials as InitialAssessment[]).map((i) => ({
                        patient_id: i.patient_id,
                        assessment_date: i.assessment_date,
                        primary_condition: i.primary_condition,
                        chief_complaint: i.chief_complaint,
                        clinical_done: clinicalSet.has(i.patient_id),
                        follow_up_count: followUpMap.get(i.patient_id)?.count || 0,
                        latest_follow_up_date: followUpMap.get(i.patient_id)?.latestDate || null,
                    }));
                }
            }
            setAssessments(assessmentSummaries);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchData();
        }
    }, [id, fetchData]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!beneficiary) {
        return (
            <div className="text-center py-12">
                <p className="text-text-muted mb-4">Beneficiary not found.</p>
                <Button onClick={() => navigate('/beneficiary/list')}>Back to List</Button>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {assignTarget && (
                <AssignFileNumberModal
                    key={assignTarget.systemId}
                    target={assignTarget}
                    onClose={() => setAssignTarget(null)}
                    onSuccess={fetchData}
                />
            )}
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/beneficiary/list')}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-text-muted"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-text-main">{beneficiary.name}</h1>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-text-muted mt-1">
                            <span className="flex items-center gap-1">Token: <b className="text-primary">#{beneficiary.token_no || 'N/A'}</b></span>
                            <span className="hidden sm:inline">•</span>
                            <span className="flex items-center gap-1">ID: <b className="text-gray-700">{beneficiary.id?.slice(0, 8) || 'N/A'}</b></span>
                            <span className="hidden sm:inline">•</span>
                            <span className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider border ${beneficiary.file_number ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                                {beneficiary.file_number ? `File No: ${beneficiary.file_number}` : 'File No: Not Assigned'}
                            </span>
                            {!beneficiary.file_number && canImportFileNumbers && (
                                <button
                                    onClick={() => setAssignTarget({
                                        systemId: String(beneficiary.id),
                                        name: beneficiary.name,
                                        isLocalPending: false,
                                    })}
                                    className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider text-primary bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
                                >
                                    Assign File No
                                </button>
                            )}
                            <span className="hidden sm:inline">•</span>
                            <span>Registered on {new Date(beneficiary.date_of_registration).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                    <Link to={`/beneficiary/edit/${id}`} className="flex-1 sm:flex-none">
                        <Button variant="outline" className="flex items-center justify-center gap-2 w-full">
                            Edit Profile
                        </Button>
                    </Link>
                    <Link
                        to="/assessments/new"
                        state={{
                            prefillBeneficiary: {
                                name: beneficiary.name,
                                age: beneficiary.age != null ? String(beneficiary.age) : undefined,
                                gender: beneficiary.gender,
                                mobileNo: beneficiary.mobile_no,
                                city: beneficiary.city,
                                address: beneficiary.address,
                            },
                        }}
                        className="flex-1 sm:flex-none"
                    >
                        <Button variant="outline" className="flex items-center justify-center gap-2 w-full">
                            <Plus size={18} /> New Assessment
                        </Button>
                    </Link>
                    <Link to={`/services/new?beneficiary_id=${id}`} className="flex-1 sm:flex-none">
                        <Button className="flex items-center justify-center gap-2 w-full">
                            <Plus size={18} /> New Service
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left Column: Core Info */}
                    <div className="lg:col-span-1 space-y-6">
                        {/* Basic Info */}
                        <Card className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                    <User size={20} />
                                </div>
                                <h2 className="font-semibold text-text-main">Personal Details</h2>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Age & Gender</p>
                                    <p className="text-text-main font-medium">{beneficiary.age || 'N/A'} years • {beneficiary.gender || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Guardian</p>
                                    <p className="text-text-main font-medium">{beneficiary.parent_guardian || 'N/A'} ({beneficiary.relationship || 'N/A'})</p>
                                </div>
                                <div>
                                    <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Mobile Number</p>
                                    <p className="text-text-main font-medium flex items-center gap-2">
                                        <Phone size={14} className="text-primary" />
                                        {beneficiary.mobile_no || 'No contact'}
                                    </p>
                                </div>
                                {beneficiary.token_no && (
                                    <div className="p-3 bg-primary/5 rounded-lg border border-primary/10">
                                        <p className="text-[10px] text-primary uppercase font-bold tracking-widest ">Today's Token Number</p>
                                        <p className="text-2xl font-black text-primary">#{beneficiary.token_no}</p>
                                    </div>
                                )}
                            </div>
                        </Card>

                        {/* Address Info */}
                        <Card className="p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                    <MapPin size={20} />
                                </div>
                                <h2 className="font-semibold text-text-main">Address</h2>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Primary Address</p>
                                    <p className="text-text-main font-medium leading-relaxed">{beneficiary.address || 'N/A'}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">City</p>
                                        <p className="text-text-main font-medium">{beneficiary.city || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">District</p>
                                        <p className="text-text-main font-medium">{beneficiary.district || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">State</p>
                                        <p className="text-text-main font-medium">{beneficiary.state || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Pincode</p>
                                        <p className="text-text-main font-medium">{beneficiary.pincode || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Medical & History */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Medical / Program Info */}
                        <Card className="p-6 bg-gradient-to-br from-white to-primary/5">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                                    <Activity size={20} />
                                </div>
                                <h2 className="font-semibold text-text-main">Program & Medical Info</h2>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Disability Type</p>
                                        <div className="mt-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full inline-block text-sm font-semibold">
                                            {beneficiary.disability_type || 'General'}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Economic Status</p>
                                        <div className="mt-1 px-3 py-1 bg-green-100 text-green-700 rounded-full inline-block text-sm font-semibold">
                                            {beneficiary.economic_status || 'N/A'}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Program / Donor</p>
                                        <p className="text-text-main font-medium">{beneficiary.program} / {beneficiary.donor}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-text-muted uppercase font-bold tracking-wider">Purpose of Visit</p>
                                        <p className="text-text-main font-medium">{beneficiary.purpose_of_visit}</p>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        {/* Service History */}
                        <Card className="p-6 overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
                                        <Clock size={20} />
                                    </div>
                                    <h2 className="font-semibold text-text-main">Service History</h2>
                                </div>
                                <span className="text-xs text-text-muted font-medium bg-gray-100 px-2 py-1 rounded">
                                    {services.length} Total Services
                                </span>
                            </div>

                            {services.length > 0 ? (
                                <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                                    {services.map((service) => (
                                        <div key={service.id} className="relative pl-10">
                                            {/* Dot */}
                                            <div className="absolute left-[13px] top-1.5 w-2 h-2 rounded-full bg-primary border-4 border-white ring-1 ring-primary/20"></div>

                                            <div
                                                onClick={() => navigate(`/services/edit/${service.id}`)}
                                                className="flex flex-col md:flex-row md:items-start justify-between gap-4 p-4 bg-gray-50 rounded-xl hover:bg-white hover:shadow-md border border-transparent hover:border-primary/20 transition-all cursor-pointer group"
                                            >
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <span className="text-xs text-primary font-bold bg-primary/5 px-2 py-0.5 rounded uppercase tracking-wider group-hover:bg-primary/10">
                                                            {service.service_type}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wider ${service.status === 'AVAILED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {service.status}
                                                        </span>
                                                        {service.follow_up && (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-600 tracking-wider">
                                                                {service.follow_up}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-4 flex-wrap">
                                                        <span className="text-sm text-text-muted flex items-center gap-1">
                                                            <Calendar size={14} />
                                                            {new Date(service.service_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                        <div className="flex items-center gap-1 text-sm text-text-main font-medium">
                                                            <Stethoscope size={16} className="text-text-muted" />
                                                            {service.provider_name || 'Provider N/A'}
                                                        </div>
                                                        <div className="flex items-center gap-1 text-sm text-text-muted">
                                                            <MapPin size={16} />
                                                            {service.venue || 'On-site'}
                                                        </div>
                                                    </div>
                                                    {service.notes && (
                                                        <p className="text-sm text-text-muted mt-2 pl-4 border-l-2 border-gray-200 italic">
                                                            &ldquo;{service.notes}&rdquo;
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="flex items-center gap-1 text-lg font-bold text-text-main">
                                                        <Clock size={16} className="text-primary" />
                                                        {service.total_hours || 0}h
                                                    </div>
                                                    <div className="text-[10px] text-primary/60 font-bold bg-primary/5 px-1.5 py-0.5 rounded mt-1">
                                                        {service.mode_of_service || 'ROW'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <Activity size={48} className="mx-auto text-gray-200 mb-3" />
                                    <p className="text-text-muted">No service history recorded yet.</p>
                                    <Link to={`/services/new?beneficiary_id=${id}`}>
                                        <Button variant="outline" className="mt-4">
                                            Click here to record first service
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </Card>

                        {/* Assessment History */}
                        <Card className="p-6 overflow-hidden">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-teal-500/10 rounded-lg text-teal-600">
                                        <ClipboardList size={20} />
                                    </div>
                                    <h2 className="font-semibold text-text-main">Assessment History</h2>
                                </div>
                                <span className="text-xs text-text-muted font-medium bg-gray-100 px-2 py-1 rounded">
                                    {assessments.length} Total Assessments
                                </span>
                            </div>

                            {assessments.length > 0 ? (
                                <div className="space-y-8 relative before:absolute before:left-4 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
                                    {assessments.map((a) => (
                                        <div key={a.patient_id} className="relative pl-10">
                                            {/* Dot */}
                                            <div className="absolute left-[13px] top-1.5 w-2 h-2 rounded-full bg-teal-500 border-4 border-white ring-1 ring-teal-500/20"></div>

                                            <div
                                                onClick={() => navigate(`/assessments/view/${a.patient_id}`)}
                                                className="flex flex-col md:flex-row md:items-start justify-between gap-4 p-4 bg-gray-50 rounded-xl hover:bg-white hover:shadow-md border border-transparent hover:border-teal-500/20 transition-all cursor-pointer group"
                                            >
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wider ${CONDITION_COLORS[a.primary_condition] || 'bg-gray-100 text-gray-700'}`}>
                                                            {a.primary_condition}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded tracking-wider ${a.clinical_done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            Clinical {a.clinical_done ? 'Done' : 'Pending'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-4 flex-wrap">
                                                        <span className="text-sm text-text-muted flex items-center gap-1">
                                                            <Calendar size={14} />
                                                            {new Date(a.assessment_date).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })}
                                                        </span>
                                                        <span className="text-[11px] font-black text-blue-600 tracking-tight font-mono">
                                                            {a.patient_id}
                                                        </span>
                                                    </div>
                                                    {a.chief_complaint && (
                                                        <p className="text-sm text-text-muted mt-2 pl-4 border-l-2 border-gray-200 italic">
                                                            &ldquo;{a.chief_complaint}&rdquo;
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <div className="flex items-center gap-1 text-lg font-bold text-text-main">
                                                        <Eye size={16} className="text-teal-600" />
                                                        {a.follow_up_count} FU
                                                    </div>
                                                    {a.latest_follow_up_date && (
                                                        <div className="text-[10px] text-teal-600/70 font-bold bg-teal-500/5 px-1.5 py-0.5 rounded mt-1">
                                                            Last: {new Date(a.latest_follow_up_date).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12">
                                    <ClipboardList size={48} className="mx-auto text-gray-200 mb-3" />
                                    <p className="text-text-muted">No assessments recorded yet.</p>
                                    <Link
                                        to="/assessments/new"
                                        state={{
                                            prefillBeneficiary: {
                                                name: beneficiary.name,
                                                age: beneficiary.age != null ? String(beneficiary.age) : undefined,
                                                gender: beneficiary.gender,
                                                mobileNo: beneficiary.mobile_no,
                                                city: beneficiary.city,
                                                address: beneficiary.address,
                                            },
                                        }}
                                    >
                                        <Button variant="outline" className="mt-4">
                                            Click here to record first assessment
                                        </Button>
                                    </Link>
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
        </div>
    );
}
