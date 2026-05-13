import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Select } from '@/components/common/Select';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Save, Wifi, WifiOff, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/db';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { auditService } from '@/services/auditService';


export function AddBeneficiaryPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isOnline = useOnlineStatus();
    const [searchParams] = useSearchParams();
    const completeId = searchParams.get('completeId');
    const isCompletingStub = !!completeId;
    const [isLoading, setIsLoading] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        age: '',
        gender: 'Male',
        dateOfRegistration: new Date().toISOString().split('T')[0],
        parentGuardian: '',
        relationship: 'Father',
        beneficiaryType: 'Direct',
        status: 'Active',
        address: '',
        addressType: 'Permanent',
        country: 'India',
        state: 'Karnataka',
        district: '',
        city: '',
        pincode: '',
        mobileNo: '',
        purposeOfVisit: 'Assessment',
        disabilityType: 'Locomotor Disability',
        program: 'Rehab on Wheels',
        donor: '',
        economicStatus: 'BPL',
    });

    useEffect(() => {
        if (!completeId) return;
        (async () => {
            const { data, error } = await supabase
                .from('beneficiaries')
                .select('*')
                .eq('id', completeId)
                .maybeSingle();

            if (error || !data) {
                alert('Could not load pending beneficiary.');
                return;
            }

            setFormData(prev => ({
                ...prev,
                name: data.name || '',
                age: data.age ? String(data.age) : '',
                gender: data.gender || prev.gender,
                dateOfRegistration: data.date_of_registration || prev.dateOfRegistration,
                parentGuardian: data.parent_guardian || '',
                relationship: data.relationship || prev.relationship,
                beneficiaryType: data.beneficiary_type || prev.beneficiaryType,
                status: data.status || prev.status,
                address: data.address || '',
                addressType: data.address_type || prev.addressType,
                country: data.country || prev.country,
                state: data.state || prev.state,
                district: data.district || '',
                city: data.city || '',
                pincode: data.pincode || '',
                mobileNo: data.mobile_no || '',
                purposeOfVisit: data.purpose_of_visit || prev.purposeOfVisit,
                disabilityType: data.disability_type || prev.disabilityType,
                program: data.program || prev.program,
                donor: data.donor || '',
                economicStatus: data.economic_status || prev.economicStatus,
            }));
        })();
    }, [completeId]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const commonFields = {
            name: formData.name,
            age: parseInt(formData.age),
            gender: formData.gender,
            date_of_registration: formData.dateOfRegistration,
            parent_guardian: formData.parentGuardian,
            relationship: formData.relationship,
            beneficiary_type: formData.beneficiaryType,
            status: formData.status,
            address: formData.address,
            address_type: formData.addressType,
            country: formData.country,
            state: formData.state,
            district: formData.district,
            city: formData.city,
            pincode: formData.pincode,
            mobile_no: formData.mobileNo,
            purpose_of_visit: formData.purposeOfVisit,
            disability_type: formData.disabilityType,
            program: formData.program,
            donor: formData.donor,
            economic_status: formData.economicStatus,
        };

        try {
            if (isCompletingStub && completeId) {
                const { error } = await supabase
                    .from('beneficiaries')
                    .update({ ...commonFields, registration_status: 'complete' })
                    .eq('id', completeId);

                if (error) throw error;
                await auditService.log('BENEFICIARY_REGISTRATION_COMPLETED', { beneficiary_id: completeId, name: formData.name });
                setShowSuccessModal(true);
                return;
            }

            // New beneficiary path (offline-first)
            const tempToken = `OFF-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const beneficiaryData = {
                ...commonFields,
                created_by: user?.id,
                offline_token: tempToken,
                created_at: new Date().toISOString(),
            };

            await db.beneficiaries.add({
                ...beneficiaryData,
                sync_status: 'pending'
            });

            if (isOnline) {
                const { error } = await supabase
                    .from('beneficiaries')
                    .insert([beneficiaryData])
                    .select('*')
                    .single();

                if (!error) {
                    await db.beneficiaries.where('offline_token').equals(tempToken).modify({
                        sync_status: 'synced'
                    });
                } else {
                    console.error('Immediate sync failed, record remains pending:', error);
                }
            }

            await auditService.log('BENEFICIARY_CREATED', { name: formData.name, offline: !isOnline });
            setShowSuccessModal(true);
        } catch (error) {
            console.error('Error saving beneficiary:', error);
            const message = error instanceof Error ? error.message : 'Failed to save beneficiary';
            alert(message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const resetForm = () => {
        setShowSuccessModal(false);
        setFormData(prev => ({
            ...prev,
            name: '',
            age: '',
            mobileNo: ''
        }));
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main">
                        {isCompletingStub ? 'Complete Registration' : 'Add New Beneficiary'}
                    </h1>
                    <p className="text-text-muted">
                        {isCompletingStub
                            ? 'Finish registering this beneficiary — details were started from the token desk.'
                            : 'Register a new patient into the system.'}
                    </p>
                </div>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm transition-colors ${isOnline
                    ? 'bg-green-50 text-green-700 border-green-100'
                    : 'bg-orange-50 text-orange-700 border-orange-100'
                    }`}>
                    {isOnline ? (
                        <><Wifi size={16} /> <span className="text-xs font-bold uppercase tracking-wider">Online Mode</span></>
                    ) : (
                        <><WifiOff size={16} /> <span className="text-xs font-bold uppercase tracking-wider">Offline Mode</span></>
                    )}
                </div>
            </div>

            <Card>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Section: Personal Details */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2">Personal Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input label="Name" name="name" value={formData.name} onChange={handleChange} required placeholder="Full Name" />
                            <Input label="Age" name="age" type="number" value={formData.age} onChange={handleChange} required placeholder="Age" />
                            <Select
                                label="Gender"
                                name="gender"
                                value={formData.gender}
                                onChange={handleChange}
                                options={[
                                    { value: 'Male', label: 'Male' },
                                    { value: 'Female', label: 'Female' },
                                    { value: 'Other', label: 'Other' },
                                ]}
                            />
                            <Input label="Date of Registration" name="dateOfRegistration" type="date" value={formData.dateOfRegistration} onChange={handleChange} />
                            <Input label="Parent/Guardian Name" name="parentGuardian" value={formData.parentGuardian} onChange={handleChange} placeholder="Guardian Name" />
                            <Select
                                label="Relationship"
                                name="relationship"
                                value={formData.relationship}
                                onChange={handleChange}
                                options={[
                                    { value: 'Father', label: 'Father' },
                                    { value: 'Mother', label: 'Mother' },
                                    { value: 'Spouse', label: 'Spouse' },
                                    { value: 'Sibling', label: 'Sibling' },
                                    { value: 'Other', label: 'Other' },
                                ]}
                            />
                            <Select
                                label="Type of Beneficiary"
                                name="beneficiaryType"
                                value={formData.beneficiaryType}
                                onChange={handleChange}
                                options={[
                                    { value: 'Direct', label: 'Direct' },
                                    { value: 'Outreach', label: 'Outreach' },
                                    { value: 'Referral', label: 'Referral' },
                                ]}
                            />
                            <Select
                                label="Status"
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                options={[
                                    { value: 'Active', label: 'Active' },
                                    { value: 'Inactive', label: 'Inactive' },
                                    { value: 'Deceased', label: 'Deceased' },
                                ]}
                            />
                        </div>
                    </div>

                    {/* Section: Contact & Address */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2">Contact & Address</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2">
                                <Input label="Address" name="address" value={formData.address} onChange={handleChange} placeholder="House No, Street, Landmark" />
                            </div>
                            <Select
                                label="Address Type"
                                name="addressType"
                                value={formData.addressType}
                                onChange={handleChange}
                                options={[
                                    { value: 'Permanent', label: 'Permanent' },
                                    { value: 'Temporary', label: 'Temporary' },
                                ]}
                            />
                            <Select
                                label="Country"
                                name="country"
                                value={formData.country}
                                onChange={handleChange}
                                options={[
                                    { value: 'India', label: 'India' },
                                    { value: 'Nepal', label: 'Nepal' },
                                    { value: 'Bhutan', label: 'Bhutan' },
                                ]}
                            />
                            <Select
                                label="State"
                                name="state"
                                value={formData.state}
                                onChange={handleChange}
                                options={[
                                    { value: 'Maharashtra', label: 'Maharashtra' },
                                    { value: 'Gujarat', label: 'Gujarat' },
                                    { value: 'Karnataka', label: 'Karnataka' },
                                ]}
                            />
                            <Input label="District" name="district" value={formData.district} onChange={handleChange} placeholder="District" />
                            <Input label="City/Village" name="city" value={formData.city} onChange={handleChange} placeholder="City or Village" />
                            <Input label="Pincode" name="pincode" value={formData.pincode} onChange={handleChange} placeholder="400001" />
                            <Input label="Mobile No" name="mobileNo" value={formData.mobileNo} onChange={handleChange} placeholder="9876543210" maxLength={10} />
                        </div>
                    </div>

                    {/* Section: Program Details */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2">Program Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Select
                                label="Purpose of Visit"
                                name="purposeOfVisit"
                                value={formData.purposeOfVisit}
                                onChange={handleChange}
                                options={[
                                    { value: 'Assessment', label: 'Assessment' },
                                    { value: 'Treatment', label: 'Treatment' },
                                    { value: 'Follow-up', label: 'Follow-up' },
                                    { value: ' Mobility Aid Distribution', label: 'Mobility Aid Distribution' },
                                    { value: 'Referal', label: 'Referal' },
                                ]}
                            />
                            <Select
                                label="Disability Type"
                                name="disabilityType"
                                value={formData.disabilityType}
                                onChange={handleChange}
                                options={[
                                    { value: 'Neuro Muscular Painful Condition', label: 'Neuro Muscular Painful Condition' },
                                    { value: 'Chronic Neurological Disorder', label: 'Chronic Neurological Disorder' },
                                    { value: 'Delay Development', label: 'Delay Development' },
                                    { value: 'Down Syndrome', label: 'Down Syndrome' },
                                    { value: 'Dwarfism', label: 'Dwarfism' },
                                    { value: 'Global Developmental Delay', label: 'Global Developmental Delay' },
                                    { value: 'Hearing Impairment', label: 'Hearing Impairment' },
                                    { value: 'Intellectual Disability', label: 'Intellectual Disability' },
                                    { value: 'Learning Disability', label: 'Learning Disability' },
                                    { value: 'Locomotor Disability', label: 'Locomotor Disability' },
                                    { value: 'Low Vision', label: 'Low Vision' },
                                    { value: 'Multiple Disability', label: 'Multiple Disability' },
                                    { value: 'Muscular Dystrophy', label: 'Muscular Dystrophy' },
                                    { value: 'Non Disable', label: 'Non Disable' },
                                    { value: "Parkinson's Disease", label: "Parkinson's Disease" },
                                    { value: 'Speech & Hearing Impaired', label: 'Speech & Hearing Impaired' },
                                    { value: 'Speech Impairment', label: 'Speech Impairment' },
                                    { value: 'Spinal Bifida', label: 'Spinal Bifida' },
                                    { value: 'Spinal Cord Injury', label: 'Spinal Cord Injury' },
                                    { value: 'Thalassemia', label: 'Thalassemia' },
                                    { value: 'Visual Impaired', label: 'Visual Impaired' },
                                ]}
                            />
                            <Select
                                label="Program"
                                name="program"
                                value={formData.program}
                                onChange={handleChange}
                                options={[
                                    { value: 'Rehab on Wheels', label: 'Rehab on Wheels' },
                                    { value: 'Community Based Rehab', label: 'Community Based Rehab' },
                                    { value: 'Early Intervention', label: 'Early Intervention' },
                                ]}
                            />
                            <Select
                                label="Donor"
                                name="donor"
                                value={formData.donor}
                                onChange={handleChange}
                                options={[
                                    { value: '', label: '-- Select Donor --' },
                                    { value: 'ABB', label: 'ABB' },
                                    { value: 'Brigade', label: 'Brigade' },
                                    { value: 'Juniper', label: 'Juniper' },
                                ]}
                            />
                            <Select
                                label="Economic Status (APL/BPL)"
                                name="economicStatus"
                                value={formData.economicStatus}
                                onChange={handleChange}
                                options={[
                                    { value: 'APL', label: 'APL (Above Poverty Line)' },
                                    { value: 'BPL', label: 'BPL (Below Poverty Line)' },
                                    { value: 'NA', label: 'NA (Not Applicable)' },
                                ]}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-4 pt-4 border-t border-gray-100 justify-end">
                        <Button type="button" variant="secondary" className="w-full sm:w-32" onClick={() => navigate('/beneficiary/list')}>
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="w-full sm:w-32 flex items-center justify-center gap-2"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>Saving...</>
                            ) : (
                                <><Save size={18} /> Save</>
                            )}
                        </Button>
                    </div>
                </form>
            </Card>

            {/* Success Modal Popup */}
            {showSuccessModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-[90vw] sm:max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="bg-primary p-8 text-center text-white">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-white/30">
                                <CheckCircle size={40} className="text-white" />
                            </div>
                            <h2 className="text-2xl font-black mb-1">Success!</h2>
                            <p className="text-white/80 text-sm">Beneficiary has been registered</p>
                        </div>

                        <div className="p-8 text-center space-y-4">
                            <Button
                                onClick={() => navigate('/beneficiary/list')}
                                className="w-full py-4 rounded-xl text-lg font-bold"
                            >
                                Go to List
                            </Button>

                            <button
                                onClick={resetForm}
                                className="w-full text-text-muted hover:text-text-main font-semibold transition-colors py-2"
                            >
                                Add Another Patient
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

