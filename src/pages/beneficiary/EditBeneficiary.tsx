import { useState, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Select } from '@/components/common/Select';
import { Input } from '@/components/common/Input';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Save, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { auditService } from '@/services/auditService';

export function EditBeneficiaryPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        age: '',
        gender: 'Male',
        dateOfRegistration: '',
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
        disabilityType: 'Locomotor',
        program: 'Rehab on Wheels',
        donor: '',
        economicStatus: 'BPL',
    });

    const fetchBeneficiary = useCallback(async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('beneficiaries')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;

            if (data) {
                setFormData({
                    name: data.name,
                    age: data.age?.toString() || '',
                    gender: data.gender,
                    dateOfRegistration: data.date_of_registration,
                    parentGuardian: data.parent_guardian || '',
                    relationship: data.relationship || '',
                    beneficiaryType: data.beneficiary_type,
                    status: data.status,
                    address: data.address || '',
                    addressType: data.address_type || 'Permanent',
                    country: data.country || 'India',
                    state: data.state || 'Karnataka',
                    district: data.district || '',
                    city: data.city || '',
                    pincode: data.pincode || '',
                    mobileNo: data.mobile_no || '',
                    purposeOfVisit: data.purpose_of_visit,
                    disabilityType: data.disability_type,
                    program: data.program,
                    donor: data.donor || '',
                    economicStatus: data.economic_status,
                });
            }
        } catch (error) {
            console.error('Error fetching beneficiary:', error);
            alert('Failed to load beneficiary details');
            navigate('/beneficiary');
        } finally {
            setIsLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        if (id) {
            fetchBeneficiary();
        }
    }, [id, fetchBeneficiary]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            const { error } = await supabase
                .from('beneficiaries')
                .update({
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
                })
                .eq('id', id);

            if (error) throw error;
            await auditService.log('BENEFICIARY_UPDATED', { beneficiary_id: id, name: formData.name });
            navigate(`/beneficiary/${id}`);
        } catch (error) {
            console.error('Error updating beneficiary:', error);
            const message = error instanceof Error ? error.message : 'Failed to update beneficiary';
            alert(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader2 className="animate-spin text-primary" size={48} />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-12">
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate(-1)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-text-muted"
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main">Edit Beneficiary</h1>
                    <p className="text-text-muted">Update details for {formData.name}</p>
                </div>
            </div>

            <Card>
                <form onSubmit={handleSubmit} className="p-6 space-y-8">
                    {/* Section: Personal Details */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary border-b border-gray-100 pb-2">
                            <h3 className="text-lg font-semibold">Personal Details</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary border-b border-gray-100 pb-2">
                            <h3 className="text-lg font-semibold">Contact & Address</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="md:col-span-2 lg:col-span-1">
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
                                    { value: 'Karnataka', label: 'Karnataka' },
                                    { value: 'Maharashtra', label: 'Maharashtra' },
                                    { value: 'Gujarat', label: 'Gujarat' },
                                    { value: 'Delhi', label: 'Delhi' },
                                ]}
                            />
                            <Input label="District" name="district" value={formData.district} onChange={handleChange} placeholder="District" />
                            <Input label="City/Village" name="city" value={formData.city} onChange={handleChange} placeholder="City or Village" />
                            <Input label="Pincode" name="pincode" value={formData.pincode} onChange={handleChange} placeholder="560001" />
                            <Input label="Mobile No" name="mobileNo" value={formData.mobileNo} onChange={handleChange} placeholder="9876543210" maxLength={10} />
                        </div>
                    </div>

                    {/* Section: Program Details */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-primary border-b border-gray-100 pb-2">
                            <h3 className="text-lg font-semibold">Program Details</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <Select
                                label="Purpose of Visit"
                                name="purposeOfVisit"
                                value={formData.purposeOfVisit}
                                onChange={handleChange}
                                options={[
                                    { value: 'Assessment', label: 'Assessment' },
                                    { value: 'Treatment', label: 'Treatment' },
                                    { value: 'Follow-up', label: 'Follow-up' },
                                    { value: 'Aid Distribution', label: 'Aid Distribution' },
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
                                label="Economic Status"
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
                    <div className="flex gap-4 pt-6 border-t border-gray-100 justify-end">
                        <Button type="button" variant="outline" onClick={() => navigate(-1)} className="w-full sm:w-auto px-8">
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex items-center gap-2 w-full sm:w-auto px-8"
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <><Loader2 className="animate-spin" size={18} /> Updating...</>
                            ) : (
                                <><Save size={18} /> Save Changes</>
                            )}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
