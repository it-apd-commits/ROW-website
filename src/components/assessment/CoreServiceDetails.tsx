import { useState, useEffect, useImperativeHandle, forwardRef, useCallback, useRef } from 'react';
import { Card } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { BeneficiarySelect } from '@/components/beneficiary/BeneficiarySelect';
import { ClipboardList, Clock, CheckCircle2, AlertCircle, Plus, X, Stethoscope } from 'lucide-react';
import { SERVICE_MASTER, LOCATION_MASTER, MODE_OF_SERVICE } from '@/data/masters';
import { ServiceEntryService } from '@/services/serviceEntryService';
import type { ServiceEntryPayload } from '@/types/serviceEntry';

const STATUS_OPTIONS = [
    { value: 'SCHEDULED', label: 'SCHEDULED' },
    { value: 'AVAILED', label: 'AVAILED' },
];

const FOLLOW_UP_OPTIONS = [
    { value: 'Initial Visit', label: 'Initial Visit' },
    { value: 'Follow Up 1', label: 'Follow Up 1' },
    { value: 'Follow Up 2', label: 'Follow Up 2' },
    { value: 'Follow Up 3', label: 'Follow Up 3' },
    { value: 'Follow Up 4', label: 'Follow Up 4' },
];

const LOCATION_OPTIONS = LOCATION_MASTER.map(l => ({
    value: l.code,
    label: `${l.code} - ${l.name}`,
}));

const MODE_OPTIONS = MODE_OF_SERVICE.map(m => ({
    value: m.code,
    label: m.name,
}));

interface ServiceFormData {
    status: 'SCHEDULED' | 'AVAILED';
    file_number: string | null;
    schedule_date: string;
    start_date: string;
    end_date: string | null;
    location_code: string;
    service_provider_code: string;
    mode_of_service: string;
    custom_field2: string;
}

interface Props {
    patientName?: string;
    onServiceDataChange?: (payloads: ServiceEntryPayload[] | null, isValid: boolean) => void;
}

export interface CoreServiceDetailsRef {
    validate: () => boolean;
    setSaveStatus: (status: 'idle' | 'saved' | 'error') => void;
}

export const CoreServiceDetails = forwardRef<CoreServiceDetailsRef, Props>(
    function CoreServiceDetails({ onServiceDataChange }, ref) {
        const today = new Date().toISOString().split('T')[0];

        const [formData, setFormData] = useState<ServiceFormData>({
            status: 'SCHEDULED',
            file_number: null,
            schedule_date: today,
            start_date: today,
            end_date: null,
            location_code: 'MCB',
            service_provider_code: '',
            mode_of_service: 'ROW',
            custom_field2: 'Initial Visit',
        });

        const [selectedServices, setSelectedServices] = useState<{ code: string; minutes: string }[]>([
            { code: '', minutes: '' },
        ]);

        const [errors, setErrors] = useState<Record<string, string>>({});
        const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
        // Snapshot of the last payload notified to the parent — prevents re-notifying
        // (and thus re-render loops) when the payload content hasn't actually changed.
        const lastNotifiedRef = useRef<string>('');

        const handleChange = (field: keyof ServiceFormData, value: string | null) => {
            setFormData(prev => ({ ...prev, [field]: value }));
            if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
            setSaveStatus('idle');
        };

        // Auto-detect follow-up number when beneficiary changes
        useEffect(() => {
            if (!formData.file_number) return;

            ServiceEntryService.getHistoryByFileNumber(formData.file_number)
                .then(history => {
                    // Count distinct visits, not rows — each visit saves one row per service
                    const count = new Set(history.map(h => h.schedule_date)).size;
                    const nextFollowUp = count === 0
                        ? 'Initial Visit'
                        : count <= 4
                            ? `Follow Up ${count}`
                            : 'Follow Up 4';
                    setFormData(prev => ({ ...prev, custom_field2: nextFollowUp }));
                })
                .catch((err) => console.error('[CoreServiceDetails] History fetch failed:', err));
        }, [formData.file_number]);

        const validate = useCallback((): boolean => {
            const e: Record<string, string> = {};

            if (!formData.file_number) e.file_number = 'Beneficiary is required';
            if (!formData.schedule_date) e.schedule_date = 'Schedule date is required';
            if (!formData.start_date) e.start_date = 'Start date is required';
            if (!formData.location_code) e.location_code = 'Location is required';
            if (!formData.service_provider_code) e.service_provider_code = 'Provider is required';
            if (!formData.mode_of_service) e.mode_of_service = 'Mode is required';
            if (!formData.custom_field2) e.custom_field2 = 'Follow-up number is required';

            if (formData.status === 'AVAILED' && !formData.end_date) {
                e.end_date = 'End date required when AVAILED';
            }
            if (formData.start_date && formData.schedule_date && formData.start_date < formData.schedule_date) {
                e.start_date = 'Cannot be before schedule date';
            }
            if (formData.end_date && formData.start_date && formData.end_date < formData.start_date) {
                e.end_date = 'Cannot be before start date';
            }

            const filledRows = selectedServices.filter(s => s.code || s.minutes);
            if (filledRows.length === 0) {
                e.services = 'Add at least one service';
            } else {
                const codes = new Set<string>();
                for (let i = 0; i < filledRows.length; i++) {
                    const r = filledRows[i];
                    if (!r.code) { e.services = `Service #${i + 1}: select a service code`; break; }
                    const mins = parseFloat(r.minutes);
                    if (!mins || mins <= 0) { e.services = `Service #${i + 1}: minutes must be > 0`; break; }
                    if (codes.has(r.code)) { e.services = `"${r.code}" is selected more than once`; break; }
                    codes.add(r.code);
                }
            }

            setErrors(e);
            return Object.keys(e).length === 0;
        }, [formData, selectedServices]);

        useImperativeHandle(ref, () => ({
            validate,
            setSaveStatus,
        }), [validate]);

        // Notify parent of data changes
        useEffect(() => {
            if (!onServiceDataChange) return;

            const filledRows = selectedServices.filter(s => s.code && parseFloat(s.minutes) > 0);
            const hasBase = formData.file_number && formData.location_code &&
                formData.service_provider_code && formData.mode_of_service;

            if (!hasBase || filledRows.length === 0) {
                if (lastNotifiedRef.current !== 'null') {
                    lastNotifiedRef.current = 'null';
                    onServiceDataChange(null, false);
                }
                return;
            }

            const payloads: ServiceEntryPayload[] = filledRows.map(r => ({
                status: formData.status,
                file_number: formData.file_number,
                schedule_date: formData.schedule_date,
                start_date: formData.start_date,
                end_date: formData.end_date,
                location_code: formData.location_code,
                service_code: r.code,
                service_provider_code: formData.service_provider_code,
                total_hours: parseFloat(r.minutes) / 60,
                mode_of_service: formData.mode_of_service,
                custom_field2: formData.custom_field2,
            }));

            const isValid = !!(hasBase &&
                filledRows.length > 0 &&
                !(formData.status === 'AVAILED' && !formData.end_date));

            const snapshot = JSON.stringify({ payloads, isValid });
            if (snapshot === lastNotifiedRef.current) return;
            lastNotifiedRef.current = snapshot;
            onServiceDataChange(payloads, isValid);
        }, [formData, selectedServices, onServiceDataChange]);

        return (
            <Card>
                <div className="flex items-center gap-2 mb-5 pb-3 border-b border-gray-100">
                    <ClipboardList size={18} className="text-teal-600" />
                    <h3 className="font-semibold text-text-main uppercase tracking-wide text-sm">Core Service Details</h3>
                    <span className="ml-auto text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                        Linked to Service History
                    </span>
                </div>

                {saveStatus === 'saved' && (
                    <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700">
                        <CheckCircle2 size={16} />
                        Service entry saved to Service History successfully!
                    </div>
                )}
                {saveStatus === 'error' && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
                        <AlertCircle size={16} />
                        Failed to save service entry. Please try from Service Entry page.
                    </div>
                )}

                {/* Row 1: Status, Beneficiary Search, Schedule Date */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Select
                        label="Status"
                        value={formData.status}
                        onChange={e => handleChange('status', e.target.value)}
                        options={STATUS_OPTIONS}
                    />

                    <div>
                        <BeneficiarySelect
                            placeholder="Search Beneficiary (Name / File No)"
                            onSelect={(b) => {
                                handleChange('file_number', b.file_number ?? b.id);
                            }}
                        />
                        {errors.file_number && (
                            <span className="text-xs text-red-500 mt-1 block">{errors.file_number}</span>
                        )}
                    </div>

                    <Input
                        label="Schedule Date"
                        type="date"
                        value={formData.schedule_date}
                        onChange={e => handleChange('schedule_date', e.target.value)}
                        error={errors.schedule_date}
                        required
                    />
                </div>

                {/* Row 2: Start Date, End Date, Location Code */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Input
                        label="Start Date"
                        type="date"
                        value={formData.start_date}
                        onChange={e => handleChange('start_date', e.target.value)}
                        error={errors.start_date}
                        required
                    />
                    <Input
                        label={`End Date ${formData.status === 'AVAILED' ? '*' : '(Optional)'}`}
                        type="date"
                        value={formData.end_date || ''}
                        onChange={e => handleChange('end_date', e.target.value || null)}
                        error={errors.end_date}
                        required={formData.status === 'AVAILED'}
                    />
                    <Select
                        label="Location Code"
                        value={formData.location_code}
                        onChange={e => handleChange('location_code', e.target.value)}
                        options={[{ value: '', label: '-- Select Location --' }, ...LOCATION_OPTIONS]}
                        error={errors.location_code}
                        required
                    />
                </div>

                {/* Row 3: Follow-up Number */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <Select
                        label="Follow-up Number"
                        value={formData.custom_field2}
                        onChange={e => handleChange('custom_field2', e.target.value)}
                        options={FOLLOW_UP_OPTIONS}
                        error={errors.custom_field2}
                        required
                    />
                </div>

                {/* Row 4: Service Provider, Mode of Services */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <Input
                        label="Service Provider Code / Name"
                        value={formData.service_provider_code}
                        onChange={e => handleChange('service_provider_code', e.target.value)}
                        placeholder="Enter Name or Code"
                        error={errors.service_provider_code}
                        required
                    />
                    <Select
                        label="Mode of Services"
                        value={formData.mode_of_service}
                        onChange={e => handleChange('mode_of_service', e.target.value)}
                        options={MODE_OPTIONS}
                        error={errors.mode_of_service}
                        required
                    />
                </div>

                {/* Multi-service panel */}
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
                            onClick={() => setSelectedServices(prev => [...prev, { code: '', minutes: '' }])}
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
                                    value={row.code}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setSelectedServices(prev => prev.map((s, i) => i === idx ? { ...s, code: v } : s));
                                    }}
                                    options={[
                                        { value: '', label: '-- Select Service --' },
                                        ...SERVICE_MASTER
                                            .filter(s => !usedCodes.has(s.code))
                                            .map(s => ({ value: s.code, label: `${s.code} - ${s.name}` }))
                                    ]}
                                />
                                <div className="space-y-1.5 text-sm font-medium text-text-main">
                                    <label className="flex items-center gap-1.5 mb-1 text-xs">
                                        <Clock size={14} className="text-primary" /> Minutes
                                    </label>
                                    <Input
                                        type="number"
                                        step="1"
                                        min="1"
                                        value={row.minutes}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setSelectedServices(prev => prev.map((s, i) => i === idx ? { ...s, minutes: v } : s));
                                        }}
                                        placeholder="e.g. 30"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedServices(prev =>
                                            prev.length > 1 ? prev.filter((_, i) => i !== idx) : [{ code: '', minutes: '' }]
                                        );
                                    }}
                                    className="h-10 w-10 flex items-center justify-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40"
                                    disabled={selectedServices.length === 1 && !row.code && !row.minutes}
                                    aria-label="Remove service"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        );
                    })}

                    {errors.services && (
                        <span className="text-xs text-red-500 block">{errors.services}</span>
                    )}
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                        This service entry will be saved to <strong>Service History</strong> when you click "Save & Continue" below.
                        You can also manage entries from the <strong>Service Entry</strong> page.
                    </p>
                </div>
            </Card>
        );
    }
);
