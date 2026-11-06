// Generates a Goonjan-ready beneficiary upload file directly from ROW,
// replacing the manual "download ROW export -> run Convert_ROW_To_Goonjan_Format
// macro -> upload" step.
//
// Column order/text and the field mappings below are ported from the
// official template (BeneficiaryDetailUploadFormat.xlsx, 74 columns) and the
// existing Convert_ROW_To_Goonjan_Format VBA macro, cross-checked against
// both files directly. Three macro behaviors were deliberately NOT carried
// over, by request, because they looked like unintentional gaps rather than
// real Goonjan requirements:
//   - Relationship: macro always left this blank; here it uses ROW's own
//     RELATIONSHIP field.
//   - Address: macro copied ROW's CITY field into this column; here it uses
//     ROW's own ADDRESS field.
//   - Phone(Mobile)/Phone(Residence): macro put the mobile number into
//     Phone(Residence) and left Phone(Mobile) blank; here the mobile number
//     goes into Phone(Mobile), and Phone(Residence) stays blank (ROW has no
//     separate residence-phone field).
// Everything else — including the three hardcoded location constants
// (Location Code, District, City/Taluk) and the text/date formatting — is
// reproduced exactly as the macro does it.
//
// Only columns 1-38 are ever populated; columns 39-74 cover education/
// employment/clinical-history data ROW doesn't collect, and are always left
// blank, matching the macro.
//
// DATA ACCURACY CAVEAT — DOB(YYYY-MM-dd) is NOT a real date of birth. ROW
// only collects age at registration, never an actual birth date, so this
// column is derived as Jan 1 of (registration year − age) — a placeholder
// that is only accurate to the year, with month/day always forced to
// January 1st regardless of a beneficiary's real birthday. This mirrors the
// original macro's DOBFromAge exactly, so it isn't a new approximation
// introduced here. Anything in Goonjan that treats this as a precise date
// (duplicate detection by DOB, birthday-based outreach, exact age
// verification) will be inaccurate for every beneficiary exported this way.

// Header text is reproduced byte-for-byte from the official template,
// including its quirks (leading spaces, embedded tabs) — Goonjan's importer
// may match on exact header text.
const GOONJAN_HEADERS = [
    'Name', 'Gender', 'DOB(YYYY-MM-dd)', 'Age(Y,M)', 'Registration Date(YYYY-MM-dd hh:mm)',
    'UID/Aadhaar', 'Parent/Guardian', 'Relationship', 'Type of Beneficiary', 'Status of Beneficiary',
    'Address', 'Address Type', 'Location Code', 'Country', 'State', 'District', 'City/Taluk',
    'Pin Code', 'Phone(Residence)', 'Phone(Office)', 'Phone(Mobile)', 'Phone(Others)',
    'Contact Person', 'Email', 'Purpose of Visit', 'Type of disability', 'Occupation', 'Nationality',
    'SC/ST/BC', ' Mother Tongue', 'SEC', 'Religion', 'Caste', 'Marital Status', 'Program',
    'Course', 'Donor', 'Area', 'Current Class', 'Service Level', 'Degree/Exam', 'Year',
    'Medium', 'Institution', 'Stream', 'Reg No', 'Performance I\t\t',
    'Performance II\t\t', 'Performance III', ' Current Educational Status',
    'Extra educational inputs', ' Dropped out after class/course', 'Course', 'Year', 'Duration',
    'Institution', 'Place', 'Performance', 'Nature of Disability', 'Legal Diagnosis', 'Disability',
    'Affected', 'Severity', 'Onset', 'Examined By', 'Organization', 'With or Without Aid',
    'Appliances Used', 'Mode of Travel', 'Operates Independently', 'Comments',
    'Relationship Manager', 'ID Type', 'ID Number',
] as const;

// 1-based column numbers forced to text format so Excel never reinterprets
// a date/phone/ID value as a number — mirrors the macro's explicit
// NumberFormat = "@" on columns C, E, F, R:V and BU:BV.
const TEXT_FORMAT_COLUMNS = [3, 5, 6, 18, 19, 20, 21, 22, 73, 74];

// Returns null (not '') for missing/empty values, so a blank field writes
// as a genuinely empty Excel cell (no value at all) instead of an
// empty-string cell. Excel stores repeated text in a shared-strings table
// and references it by index — e.g. a truly blank cell and this file's
// empty-string entries all point at whatever index that empty string
// happens to land on, visible only if a reader fails to resolve the shared
// string (most do resolve it correctly; this removes the scenario entirely
// by never emitting a value for blanks in the first place).
function str(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    const trimmed = String(v).trim();
    return trimmed === '' ? null : trimmed;
}

function convertGender(raw: unknown): string | null {
    const trimmed = str(raw);
    if (trimmed === null) return null;
    const upper = trimmed.toUpperCase();
    if (upper === 'MALE' || upper === 'M') return 'M';
    if (upper === 'FEMALE' || upper === 'F') return 'F';
    return upper;
}

function convertBeneficiaryType(raw: unknown): string | null {
    const trimmed = str(raw);
    if (trimmed === null) return null;
    return trimmed.toUpperCase() === 'DIRECT' ? 'Individual' : trimmed;
}

function convertPurpose(raw: unknown): string | null {
    const trimmed = str(raw);
    if (trimmed === null) return null;
    return trimmed.toUpperCase() === 'ASSESSMENT' ? 'Therapy' : trimmed;
}

function convertProgram(raw: unknown): string | null {
    const trimmed = str(raw);
    if (trimmed === null) return null;
    return trimmed.toUpperCase() === 'REHAB ON WHEELS' ? 'Therapy' : trimmed;
}

// Goonjan requires a DOB; ROW only collects age at registration. Derives a
// placeholder DOB of Jan 1 of the birth year (registration year minus age),
// exactly as the macro's DOBFromAge does — not a real date of birth (see
// exportBeneficiariesToGoonjanExcel's doc comment for the accuracy caveat).
function computeDob(age: unknown, dateOfRegistration: unknown): string | null {
    // null/undefined/blank must stay blank, not silently become age 0 —
    // Number(null) and Number('') both evaluate to 0 in JavaScript, which
    // would otherwise generate a false "age 0" DOB for a beneficiary whose
    // age was never recorded.
    if (age === null || age === undefined) return null;
    if (typeof age === 'string' && age.trim() === '') return null;
    const ageNum = Number(age);
    if (!Number.isFinite(ageNum)) return null;
    const regYearMatch = typeof dateOfRegistration === 'string'
        ? dateOfRegistration.match(/^(\d{4})-\d{2}-\d{2}/)
        : null;
    const baseYear = regYearMatch ? parseInt(regYearMatch[1], 10) : new Date().getFullYear();
    const birthYear = baseYear - Math.trunc(ageNum);
    return `${birthYear}-01-01`;
}

// Goonjan wants a date+time; ROW only stores a date. Appends a fixed
// midnight time, exactly as the macro's FormatDateTimeText does.
function formatRegistrationDateTime(dateOfRegistration: unknown): string | null {
    if (typeof dateOfRegistration !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateOfRegistration)) return null;
    return `${dateOfRegistration.slice(0, 10)} 00:00`;
}

function buildGoonjanRow(b: Record<string, unknown>): (string | null)[] {
    const row = new Array<string | null>(GOONJAN_HEADERS.length).fill(null);

    row[0] = str(b.name);                                  // Name
    row[1] = convertGender(b.gender);                       // Gender
    row[2] = computeDob(b.age, b.date_of_registration);      // DOB(YYYY-MM-dd)
    // [3] Age(Y,M) — always blank
    row[4] = formatRegistrationDateTime(b.date_of_registration); // Registration Date
    // [5] UID/Aadhaar — always blank (ROW doesn't collect this)
    row[6] = str(b.parent_guardian);                        // Parent/Guardian
    row[7] = str(b.relationship);                           // Relationship
    row[8] = convertBeneficiaryType(b.beneficiary_type);     // Type of Beneficiary
    row[9] = str(b.status);                                 // Status of Beneficiary
    row[10] = str(b.address);                               // Address
    // [11] Address Type — always blank
    row[12] = 'MCB';                                        // Location Code (fixed, per macro)
    row[13] = str(b.country);                               // Country
    row[14] = str(b.state);                                 // State
    row[15] = 'Bangalore';                                  // District (fixed, per macro)
    row[16] = 'Bangalore';                                  // City/Taluk (fixed, per macro)
    row[17] = str(b.pincode);                               // Pin Code
    // [18] Phone(Residence) — always blank (ROW has no separate residence phone)
    // [19] Phone(Office) — always blank
    row[20] = str(b.mobile_no);                             // Phone(Mobile)
    // [21] Phone(Others) — always blank
    // [22] Contact Person — always blank
    // [23] Email — always blank (ROW doesn't collect beneficiary email)
    row[24] = convertPurpose(b.purpose_of_visit);            // Purpose of Visit
    row[25] = str(b.disability_type);                        // Type of disability
    // [26]-[33] Occupation, Nationality, SC/ST/BC, Mother Tongue, SEC, Religion,
    //           Caste, Marital Status — always blank (ROW doesn't collect these)
    row[34] = convertProgram(b.program);                     // Program
    // [35] Course — always blank
    row[36] = str(b.donor);                                 // Donor
    row[37] = 'Rehab on Wheels';                             // Area (fixed, per macro)
    // [38]-[73] — always blank: education/employment/clinical-history fields
    //            ROW doesn't collect, never written by the macro either.

    return row;
}

/**
 * Exports the given beneficiaries as a Goonjan-upload-ready .xlsx, matching
 * the official BeneficiaryDetailUploadFormat template exactly (74 columns,
 * same order, same header text). Ready for direct upload — no macro step
 * needed. Callers are responsible for deciding which beneficiaries to pass
 * in (e.g. excluding those that already have a ROW file_number, to avoid
 * re-registering them in Goonjan).
 */
export const exportBeneficiariesToGoonjanExcel = async (data: Record<string, unknown>[]) => {
    if (!data || data.length === 0) return;

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BeneficiaryDetailUploadFormat');

    worksheet.columns = GOONJAN_HEADERS.map(header => ({ header, width: 20 }));

    data.forEach(item => {
        worksheet.addRow(buildGoonjanRow(item));
    });

    TEXT_FORMAT_COLUMNS.forEach(colNumber => {
        worksheet.getColumn(colNumber).numFmt = '@';
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
    });
    headerRow.height = 30;

    const buffer = await workbook.xlsx.writeBuffer();
    const date = new Date().toISOString().split('T')[0];
    const fileName = `Goonjan_Beneficiary_Upload_${date}.xlsx`;

    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
};
