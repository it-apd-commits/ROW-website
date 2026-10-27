// Master disability category list used by Add/Edit Beneficiary.
// Values are stored as-is in beneficiaries.disability_type — changing a
// spelling here orphans existing records saved with the old spelling.
export const DISABILITY_TYPES = [
    'Acid Attack Victim',
    'Autism',
    'Blindness',
    'Cerebral Palsy',
    'Chronic Neurological Disorder',
    'Conginantal Deformity',
    'Delay Development',
    'Down Syndrome',
    'Dwarfism',
    'Global Delay Development',
    'Hearing Impairment',
    'Hemophilia',
    'Intellectual Disability',
    'Learning Disability',
    'Leprosy Cured',
    'Locomotor Disability',
    'Low Vision',
    'Malnourished',
    'Mental Illness',
    'Mental Retardation',
    'Multiple Disability',
    'Multiple Sclerosis',
    'Muscular Dystrophy',
    'Neuromuscular Painful Condition',
    'Non-Disabled',
    'Other',
    'Paralysis',
    "Parkinson's Disease",
    'Sickle Cell Disease',
    'Slow Learner',
    'Speech & Hearing Impaired',
    'Speech Impairment',
    'Spinal Bifida',
    'Spinal Cord Injury',
    'Thalassemia',
    'Visually Impairment',
] as const;

export const DISABILITY_TYPE_OPTIONS = DISABILITY_TYPES.map(d => ({ value: d, label: d }));

// Donor list offered on Add/Edit Beneficiary. beneficiaries.donor is a free
// text column (not an enum), so this only controls what's selectable in the
// dropdown — add a new donor here when onboarding one so both forms offer it.
export const DONORS = ['ABB', 'Brigade', 'Juniper', 'HPE'] as const;

export const DONOR_OPTIONS = DONORS.map(d => ({ value: d, label: d }));
