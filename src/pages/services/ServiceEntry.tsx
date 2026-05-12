import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Save, ArrowLeft, Stethoscope, Clock, ShieldCheck, Heart, DollarSign, FileText, ClipboardList, Plus, X, WifiOff, Wifi, CheckCircle } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { BeneficiarySelect } from '@/components/beneficiary/BeneficiarySelect';
import { SERVICE_MASTER, LOCATION_MASTER, MODE_OF_SERVICE } from '@/data/masters';
import { supabase } from '@/lib/supabase';
import { ServiceEntryService } from '@/services/serviceEntryService';
import type { ServiceEntry, ServiceEntryPayload } from '@/types/serviceEntry';
import { usePermissions } from '@/hooks/usePermissions';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function ServiceEntryPage() {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const beneficiaryIdFromUrl = searchParams.get('beneficiary_id');
    const navigate = useNavigate();
    const { role } = usePermissions();
    const isAdmin = role === 'Admin';
    const isOnline = useOnlineStatus();

    const [isLoading, setIsLoading] = useState(!!id);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [savedCount, setSavedCount] = useState(0);
    const [followUpOptions, setFollowUpOptions] = useState<{ value: string; label: string }[]>([]);
    const [preselectedBeneficiaryId, setPreselectedBeneficiaryId] = useState<string | null>(beneficiaryIdFromUrl);

    // Multi-service selection (create mode only). Each row becomes an individual service_entries record.
    const [selectedServices, setSelectedServices] = useState<{ code: string; hours: string }[]>([
        { code: '', hours: '' }
    ]);
    const isEdit = !!id;

    const [formData, setFormData] = useState<Partial<ServiceEntry>>({
        status: 'SCHEDULED',
        file_number: null,
        schedule_date: new Date().toISOString().split('T')[0],
        start_date: new Date().toISOString().split('T')[0],
        end_date: null,
        location_code: 'MCB',
        service_code: '',
        service_provider_code: '',
        total_hours: 0,
        mode_of_service: 'ROW',
        recommendation: '',
        contribution: 0,
        balance: 0,
        total: 0,
        outcome: '',
        outcome_description: '',
        receipt_no: '',
        custom_field2: '',
        custom_field4: '',
        custom_field5: '',
        remarks: ''
    });

    useEffect(() => {
        if (id) {
            const fetchEntry = async () => {
                try {
                    const data = await ServiceEntryService.getEntryById(id);
                    setFormData(data);
                } catch {
                    setError('Failed to load service entry');
                } finally {
                    setIsLoading(false);
                }
            };
            fetchEntry();
        }
    }, [id]);

    // Auto-fill beneficiary when coming from beneficiary profile page
    useEffect(() => {
        if (beneficiaryIdFromUrl && !id) {
            const fetchBeneficiary = async () => {
                const { data, error: fetchErr } = await supabase
                    .from('beneficiaries')
                    .select('id, name, file_number')
                    .eq('id', beneficiaryIdFromUrl)
                    .single();

                if (!fetchErr && data) {
                    setFormData(prev => ({
                        ...prev,
                        file_number: data.file_number ?? null
                    }));
                }
            };
            fetchBeneficiary();
        }
    }, [beneficiaryIdFromUrl, id]);

    useEffect(() => {
        const fetchHistoryAndGenerateOptions = async () => {
            const options: { value: string; label: string }[] = [
                { value: 'Initial Visit', label: 'Initial Visit' },
                { value: 'Follow Up 1', label: 'Follow Up 1' },
                { value: 'Follow Up 2', label: 'Follow Up 2' },
                { value: 'Follow Up 3', label: 'Follow Up 3' },
                { value: 'Follow Up 4', label: 'Follow Up 4' }
            ];

            setFollowUpOptions(options);

            // Auto-detect next follow-up based on existing service history
            if (!id && formData.file_number) {
                try {
                    const history = await ServiceEntryService.getHistoryByFileNumber(formData.file_number);
                    const count = history.length;
                    const nextFollowUp = count === 0
                        ? 'Initial Visit'
                        : count <= 4
                            ? `Follow Up ${count}`
                            : `Follow Up 4`;
                    setFormData(prev => ({ ...prev, custom_field2: nextFollowUp }));
                } catch (err) {
                    console.error('Error fetching service history:', err);
                }
            } else if (!id && !formData.file_number) {
                setFormData(prev => ({ ...prev, custom_field2: 'Initial Visit' }));
            }
        };

        fetchHistoryAndGenerateOptions();
    }, [formData.file_number, id]);

    const handleChange = (name: string, value: string | number | null) => {
        setFormData(prev => ({ ...prev, [name]: value }));
        setError(null);
    };

    const validate = (): boolean => {
        if (!formData.file_number) { setError('Please select a beneficiary first.'); return false; }
        if (!formData.status) { setError('Status is mandatory'); return false; }
        if (!formData.schedule_date) { setError('Schedule Date is mandatory'); return false; }
        if (!formData.start_date) { setError('Start Date is mandatory'); return false; }
        if (!formData.location_code) { setError('Location Code is mandatory'); return false; }
        if (!formData.service_provider_code) { setError('Service Provider Code is mandatory'); return false; }
        if (!formData.mode_of_service) { setError('Mode of Service is mandatory'); return false; }
        if (!formData.custom_field2) { setError('Follow-up Number is mandatory'); return false; }

        if (isEdit) {
            if (!formData.service_code) { setError('Service Code is mandatory'); return false; }
            if ((formData.total_hours || 0) <= 0) { setError('Total Hours must be greater than 0'); return false; }
        } else {
            const rows = selectedServices.filter(s => s.code || s.hours);
            if (rows.length === 0) { setError('Add at least one service'); return false; }
            const codes = new Set<string>();
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                if (!r.code) { setError(`Service #${i + 1}: select a service code`); return false; }
                const h = parseFloat(r.hours);
                if (!h || h <= 0) { setError(`Service #${i + 1}: total hours must be greater than 0`); return false; }
                if (codes.has(r.code)) { setError(`Service "${r.code}" is selected more than once`); return false; }
                codes.add(r.code);
            }
        }

        if (formData.status === 'AVAILED' && !formData.end_date) {
            setError('End Date is mandatory when status is AVAILED');
            return false;
        }

        if (formData.start_date && formData.schedule_date && formData.start_date < formData.schedule_date) {
            setError('Start Date cannot be before Schedule Date');
            return false;
        }

        if (formData.end_date && formData.start_date && formData.end_date < formData.start_date) {
            setError('End Date cannot be before Start Date');
            return false;
        }

        return true;
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!validate()) return;

        if (!isOnline && id) {
            setError('Editing an existing entry requires an active connection. Please reconnect and try again.');
            return;
        }

        setIsSaving(true);
        try {
            if (id) {
                await ServiceEntryService.updateEntry(id, formData);
                setSavedCount(1);
            } else {
                const rows = selectedServices.filter(s => s.code);
                await Promise.all(
                    rows.map(r =>
                        ServiceEntryService.createEntry({
                            ...(formData as ServiceEntryPayload),
                            service_code: r.code,
                            total_hours: parseFloat(r.hours),
                        })
                    )
                );
                setSavedCount(rows.length);
            }
            setShowSuccessModal(true);
        } catch (err: unknown) {
            console.error('Save error:', err);
            const msg = err instanceof Error
                ? err.message
                : (err as { message?: string })?.message ?? 'Failed to save service entry';
            setError(msg);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-20">
                <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-20 min-w-0 w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-4 min-w-0">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors text-text-muted"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                            <Stethoscope className="text-primary" /> {id ? 'Edit Service Entry' : 'New Service Entry'}
                        </h1>
                        <p className="text-text-muted text-sm">
                            {isAdmin
                                ? 'Full access to all 21 data fields enabled.'
                                : 'Create a new service record with restricted field visibility.'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${isOnline ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
                        {isOnline ? <><Wifi size={14} /> <span className="uppercase tracking-wider">Online Mode</span></> : <><WifiOff size={14} /> <span className="uppercase tracking-wider">Offline Mode</span></>}
                    </div>
                    {isAdmin ? (
                        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold border border-blue-100">
                            <ShieldCheck size={14} /> Full Administrative Access
                        </div>
                    ) : (
                        <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-semibold border border-green-100">
                            <ShieldCheck size={14} /> Simplified View Enabled
                        </div>
                    )}
                </div>
            </div>

            {!isOnline && (
                <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm font-medium">
                    <WifiOff size={18} className="shrink-0 text-amber-600" />
                    <span>
                        You are offline. New entries will be saved locally and synced automatically when you reconnect.
                        {id && ' Editing existing entries requires a connection.'}
                    </span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <Card className="p-4 md:p-8 shadow-xl border-t-4 border-t-primary">
                    <div className="space-y-8">
                        {/* SECTION 1: CORE DETAILS */}
                        <div className="space-y-6">
                            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                <ClipboardList className="text-primary" size={18} />
                                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Core Service Details</h3>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                <Select
                                    label="Status"
                                    name="status"
                                    value={formData.status}
                                    onChange={(e) => handleChange('status', e.target.value)}
                                    required
                                    options={[
                                        { value: 'SCHEDULED', label: 'SCHEDULED' },
                                        { value: 'AVAILED', label: 'AVAILED' }
                                    ]}
                                />

                                <div className="md:col-span-1">
                                    <BeneficiarySelect
                                        placeholder="Search Beneficiary (Name / File No)"
                                        onSelect={(b) => {
                                            handleChange('file_number', b.file_number ?? b.id);
                                            setPreselectedBeneficiaryId(null);
                                        }}
                                        selectedId={preselectedBeneficiaryId || undefined}
                                        selectedFileNumber={!preselectedBeneficiaryId ? formData.file_number : undefined}
                                    />
                                </div>

                                <Input
                                    label="Schedule Date"
                                    name="schedule_date"
                                    type="date"
                                    value={formData.schedule_date}
                                    onChange={(e) => handleChange('schedule_date', e.target.value)}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                <Input
                                    label="Start Date"
                                    name="start_date"
                                    type="date"
                                    value={formData.start_date || ''}
                                    onChange={(e) => handleChange('start_date', e.target.value)}
                                    required
                                />
                                <Input
                                    label={`End Date ${formData.status === 'AVAILED' ? '*' : '(Optional)'}`}
                                    name="end_date"
                                    type="date"
                                    value={formData.end_date || ''}
                                    onChange={(e) => handleChange('end_date', e.target.value)}
                                    required={formData.status === 'AVAILED'}
                                />
                                <Select
                                    label="Location Code"
                                    name="location_code"
                                    value={formData.location_code}
                                    onChange={(e) => handleChange('location_code', e.target.value)}
                                    required
                                    options={[
                                        { value: '', label: '-- Select Location --' },
                                        ...LOCATION_MASTER.map(l => ({ value: l.code, label: `${l.code} - ${l.name}` }))
                                    ]}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                                <Select
                                    label="Follow-up Number"
                                    name="custom_field2"
                                    value={formData.custom_field2 || ''}
                                    onChange={(e) => handleChange('custom_field2', e.target.value)}
                                    required
                                    options={[
                                        { value: '', label: '-- Select Follow-up --' },
                                        ...followUpOptions
                                    ]}
                                    disabled={false}
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                                <Input
                                    label="Service Provider Code / Name"
                                    name="service_provider_code"
                                    value={formData.service_provider_code || ''}
                                    onChange={(e) => handleChange('service_provider_code', e.target.value)}
                                    required
                                    placeholder="Enter Name or Code"
                                />
                                <Select
                                    label="Mode of Services"
                                    name="mode_of_service"
                                    value={formData.mode_of_service}
                                    onChange={(e) => handleChange('mode_of_service', e.target.value)}
                                    required
                                    options={MODE_OF_SERVICE.map(m => ({ value: m.code, label: m.name }))}
                                />
                            </div>

                            {isEdit ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                                    <Select
                                        label="Service Code"
                                        name="service_code"
                                        value={formData.service_code}
                                        onChange={(e) => handleChange('service_code', e.target.value)}
                                        required
                                        options={[
                                            { value: '', label: '-- Select Service --' },
                                            ...SERVICE_MASTER.map(s => ({ value: s.code, label: `${s.code} - ${s.name}` }))
                                        ]}
                                    />
                                    <div className="space-y-1.5 text-sm font-medium text-text-main">
                                        <label className="flex items-center gap-2 mb-1">
                                            <Clock size={16} className="text-primary" /> Total Hours Spent
                                        </label>
                                        <Input
                                            name="total_hours"
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            value={formData.total_hours || ''}
                                            onChange={(e) => handleChange('total_hours', parseFloat(e.target.value))}
                                            required
                                            placeholder="e.g. 1.5"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 bg-primary/5 border border-primary/10 rounded-xl p-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                            <Stethoscope size={16} className="text-primary" /> Services Provided
                                            <span className="text-[10px] font-medium text-gray-500 normal-case">(each row saves as a separate entry)</span>
                                        </label>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            className="h-8 px-3 text-xs flex items-center gap-1.5 bg-white"
                                            onClick={() => setSelectedServices(prev => [...prev, { code: '', hours: '' }])}
                                        >
                                            <Plus size={14} /> Add Service
                                        </Button>
                                    </div>

                                    {selectedServices.map((row, idx) => {
                                        const usedCodes = new Set(
                                            selectedServices.map((s, i) => (i !== idx ? s.code : '')).filter(Boolean)
                                        );
                                        return (
                                            <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] gap-3 items-end bg-white rounded-lg p-3 border border-gray-100">
                                                <Select
                                                    label={`Service #${idx + 1}`}
                                                    name={`service_code_${idx}`}
                                                    value={row.code}
                                                    onChange={(e) => {
                                                        const v = e.target.value;
                                                        setSelectedServices(prev => prev.map((s, i) => i === idx ? { ...s, code: v } : s));
                                                    }}
                                                    required
                                                    options={[
                                                        { value: '', label: '-- Select Service --' },
                                                        ...SERVICE_MASTER
                                                            .filter(s => !usedCodes.has(s.code))
                                                            .map(s => ({ value: s.code, label: `${s.code} - ${s.name}` }))
                                                    ]}
                                                />
                                                <div className="space-y-1.5 text-sm font-medium text-text-main">
                                                    <label className="flex items-center gap-1.5 mb-1 text-xs">
                                                        <Clock size={14} className="text-primary" /> Hours
                                                    </label>
                                                    <Input
                                                        name={`total_hours_${idx}`}
                                                        type="number"
                                                        step="0.1"
                                                        min="0.1"
                                                        value={row.hours}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setSelectedServices(prev => prev.map((s, i) => i === idx ? { ...s, hours: v } : s));
                                                        }}
                                                        required
                                                        placeholder="e.g. 1.5"
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedServices(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ code: '', hours: '' }]);
                                                    }}
                                                    className="h-10 w-10 flex items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40"
                                                    disabled={selectedServices.length === 1 && !row.code && !row.hours}
                                                    aria-label="Remove service"
                                                >
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* SECTION 2: ADMIN ONLY - MEDICAL & FINANCIAL (Visible only to Admin) */}
                        {isAdmin && (
                            <div className="space-y-6 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-4 duration-500">
                                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                    <Heart className="text-blue-600" size={18} />
                                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Medical & Financial Details (Admin Only)</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <Input
                                        label="Recommendation / Treatment Plan"
                                        name="recommendation"
                                        value={formData.recommendation || ''}
                                        onChange={(e) => handleChange('recommendation', e.target.value)}
                                        placeholder="Enter clinical recommendations..."
                                    />
                                    <Input
                                        label="Outcome / Results"
                                        name="outcome"
                                        value={formData.outcome || ''}
                                        onChange={(e) => handleChange('outcome', e.target.value)}
                                        placeholder="Session outcome..."
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-text-main flex items-center gap-1">
                                            <DollarSign size={14} className="text-green-600" /> Total Fee
                                        </label>
                                        <Input
                                            type="number"
                                            name="total"
                                            value={formData.total || 0}
                                            onChange={(e) => handleChange('total', parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-text-main flex items-center gap-1">
                                            <DollarSign size={14} className="text-blue-600" /> Contribution
                                        </label>
                                        <Input
                                            type="number"
                                            name="contribution"
                                            value={formData.contribution || 0}
                                            onChange={(e) => handleChange('contribution', parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-sm font-medium text-text-main flex items-center gap-1">
                                            <DollarSign size={14} className="text-orange-600" /> Balance
                                        </label>
                                        <Input
                                            type="number"
                                            name="balance"
                                            value={formData.balance || 0}
                                            onChange={(e) => handleChange('balance', parseFloat(e.target.value))}
                                        />
                                    </div>
                                    <Input
                                        label="Receipt No"
                                        name="receipt_no"
                                        value={formData.receipt_no || ''}
                                        onChange={(e) => handleChange('receipt_no', e.target.value)}
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">

                                    <Input
                                        label="Custom Field 4"
                                        name="custom_field4"
                                        value={formData.custom_field4 || ''}
                                        onChange={(e) => handleChange('custom_field4', e.target.value)}
                                    />
                                    <Input
                                        label="Custom Field 5"
                                        name="custom_field5"
                                        value={formData.custom_field5 || ''}
                                        onChange={(e) => handleChange('custom_field5', e.target.value)}
                                    />
                                </div>

                                <Input
                                    label="Outcome Description"
                                    name="outcome_description"
                                    value={formData.outcome_description || ''}
                                    onChange={(e) => handleChange('outcome_description', e.target.value)}
                                    placeholder="Detailed outcome description..."
                                />
                            </div>
                        )}

                        <div className="space-y-4 pt-4 border-t border-gray-100">
                            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                                <FileText className="text-gray-400" size={18} />
                                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Additional Remarks</h3>
                            </div>
                            <Input
                                label="Remarks"
                                name="remarks"
                                value={formData.remarks || ''}
                                onChange={(e) => handleChange('remarks', e.target.value)}
                                placeholder="Shift/Session notes..."
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="mt-8 p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
                            {error}
                        </div>
                    )}

                    <div className="mt-10 flex flex-col sm:flex-row justify-end gap-4">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => navigate('/services/history')}
                            className="w-full sm:w-auto px-8 h-12 text-base font-bold bg-gray-100 hover:bg-gray-200 border-none text-gray-600"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSaving}
                            className="w-full md:w-auto px-10 h-12 text-base shadow-lg shadow-primary/20 hover:shadow-primary/30 transform hover:-translate-y-0.5 transition-all"
                        >
                            {isSaving ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Processing...
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Save size={20} />
                                    {id
                                        ? 'Update Service Entry'
                                        : (() => {
                                            const count = selectedServices.filter(s => s.code).length;
                                            return count > 1 ? `Save ${count} Service Entries` : 'Save Service Entry';
                                        })()}
                                </div>
                            )}
                        </Button>
                    </div>
                </Card>
            </form>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-4 bg-gray-50/50 border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Internal Data Policy</h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                        Fields such as Recommendation, Contribution, Balance, Total, Outcome, and Remarks are restricted in this view.
                        They are initialized as NULL and can be updated via Administrator Panel or Excel Import for reporting purposes.
                    </p>
                </Card>
                <Card className="p-4 bg-blue-50/30 border-blue-100">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Validation Rules</h4>
                    <p className="text-[11px] text-blue-500 leading-relaxed">
                        • Status 'AVAILED' requires an End Date.<br />
                        • Start Date must be on or after the Schedule Date.<br />
                        • Mode of Service defaults to 'ROW' but remains editable.
                    </p>
                </Card>
            </div>

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-[90vw] sm:max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className={`p-8 text-center text-white ${isOnline ? 'bg-primary' : 'bg-amber-500'}`}>
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/30">
                                {isOnline ? <CheckCircle size={40} className="text-white" /> : <WifiOff size={40} className="text-white" />}
                            </div>
                            <h2 className="text-2xl font-black mb-1">{isOnline ? 'Saved!' : 'Saved Offline!'}</h2>
                            <p className="text-white/80 text-sm">
                                {id
                                    ? 'Service entry updated successfully.'
                                    : isOnline
                                        ? `${savedCount} service ${savedCount === 1 ? 'entry' : 'entries'} saved to database.`
                                        : `${savedCount} service ${savedCount === 1 ? 'entry' : 'entries'} saved locally. Will sync automatically when you reconnect.`}
                            </p>
                        </div>
                        <div className="p-8 text-center space-y-4">
                            <Button
                                onClick={() => navigate('/services/history')}
                                className="w-full py-4 rounded-xl text-lg font-bold"
                            >
                                View History
                            </Button>
                            {!id && (
                                <button
                                    onClick={() => {
                                        setShowSuccessModal(false);
                                        setSelectedServices([{ code: '', hours: '' }]);
                                        setFormData(prev => ({
                                            ...prev,
                                            file_number: null,
                                            service_code: '',
                                            total_hours: 0,
                                            remarks: ''
                                        }));
                                        setPreselectedBeneficiaryId(null);
                                    }}
                                    className="w-full text-text-muted hover:text-text-main font-semibold transition-colors py-2"
                                >
                                    Add Another Entry
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
