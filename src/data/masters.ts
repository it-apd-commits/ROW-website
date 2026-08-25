
// No separate short codes were provided for these — the full service name
// is used as both the code (stored value) and the display name.
// Alphabetical, except services starting with "P" are pulled to the front.
const SERVICE_NAMES = [
    'Parents Support (Therapy)',
    'Physio Assessment',
    'Physio Reassessment',
    'Physiotherapy-Electro',
    'Physiotherapy-Manual',
    'Prescription to Ortho',
    'Access SSS Scheme',
    'Accessibility',
    'ADL Training',
    'Admin Related activities (Therapy)',
    'Arts Based therapy',
    'Capacity building for Parents (Therapy)',
    'Capacity building for PWDs',
    'Case Review(PT)',
    'Clinical Therapy Service',
    'Consultation (PT)',
    'Data entry /Analysis (Therapy)',
    'Early Stimulation Therapy',
    'Electro therapy (PT)',
    'Finance Related activities (Therapy)',
    'Follow Up (PT)',
    'Follow up on therapy intervention',
    'Gait practice',
    'General Screening',
    'Group Therapy(PT)',
    'Health check-up',
    'Home - Accessibility',
    'Home Program PT',
    'Home visit (Therapy)',
    'Hospital Visit (Therapy)',
    'Hydrotherapy',
    'Information on SSS',
    'Integration therapy',
    'Medical Intervention (Therapy)',
    'Medical-Camp',
    'Meeting(Therapy)',
    'NRO therapy',
    'Nutrition Supplimentory',
    'Occupational Therapy',
    'Occupational Therapy (Therapy)',
    'Refer to Medical Support',
    'Referral Services (Others)',
    'Speech Therapy',
    'Surgical Support',
    'Theory Class (Therapy)',
    'Training(Therapy)',
    'Trampoline Therapy',
    'Travel (Therapy)',
    'Virtual Rehabilitation',
];

export const SERVICE_MASTER = SERVICE_NAMES.map(name => ({ code: name, name }));

export const LOCATION_MASTER = [
    { code: 'MCB', name: 'Main Campus Branch' },
    { code: 'CP', name: 'Chanrayapatna' },
    { code: 'HG', name: 'Hesarghatta' },
    { code: 'NL', name: 'Nalur' },
    { code: 'SN', name: 'Shanti Nagar' },
    { code: 'SH', name: 'Sonnenahalli' },
    { code: 'BASE', name: 'ROW Base Office' },
];

export const MODE_OF_SERVICE = [
    { code: 'ROW', name: 'Rehab on Wheels (ROW)' },
    { code: 'CAMP', name: 'Direct Camp' },
    { code: 'HOME', name: 'Home Visit' },
    { code: 'TELE', name: 'Tele-Consultation' },
];
