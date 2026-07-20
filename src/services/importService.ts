import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { OfflineBeneficiary } from '@/lib/db';
import { SERVICE_MASTER, LOCATION_MASTER, MODE_OF_SERVICE as MODE_MASTER } from '@/data/masters';

export interface ImportSummary {
    total: number;
    updated: number;
    notMatched: number;
    errors: number;
    duplicatesInFile: number;
}

export interface BeneficiaryImportSummary {
    total: number;
    imported: number;
    skipped: number;
    errors: number;
    errorDetails: string[];
}

export const importBeneficiaries = async (file: File): Promise<BeneficiaryImportSummary> => {
    const summary: BeneficiaryImportSummary = {
        total: 0,
        imported: 0,
        skipped: 0,
        errors: 0,
        errorDetails: [],
    };

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) throw new Error('No worksheet found in Excel file');

    // Build column index map
    const colMap: Record<string, number> = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
        const value = cell.value?.toString().toUpperCase().trim();
        if (value) colMap[value] = colNumber;
    });

    const REQUIRED = ['NAME', 'AGE', 'GENDER', 'DATE OF REGISTRATION', 'TYPE OF BENEFICIARY', 'STATUS', 'COUNTRY', 'STATE', 'PURPOSE OF VISIT', 'DISABILITY TYPE', 'PROGRAM'];
    const missing = REQUIRED.filter(col => !colMap[col]);
    if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(', ')}`);

    const getStr = (row: import('exceljs').Row, col: string): string => {
        const idx = colMap[col];
        if (!idx) return '';
        const v = row.getCell(idx).value;
        if (v == null) return '';
        if (v instanceof Date) return v.toISOString().split('T')[0];
        if (typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result).trim();
        return String(v).trim();
    };

    const seenMobiles = new Set<string>();
    const seenTokens = new Set<string>();
    const rowsToProcess: OfflineBeneficiary[] = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = getStr(row, 'NAME');
        if (!name) return;

        summary.total++;

        const mobileNo = getStr(row, 'MOBILE NO');
        const systemId = getStr(row, 'SYSTEM_ID');

        // Deduplicate within the file
        if (mobileNo && seenMobiles.has(mobileNo)) { summary.skipped++; return; }
        if (systemId && seenTokens.has(systemId)) { summary.skipped++; return; }
        if (mobileNo) seenMobiles.add(mobileNo);
        if (systemId) seenTokens.add(systemId);

        const offlineToken = systemId || `import-${Date.now()}-${rowNumber}-${Math.random().toString(36).slice(2, 7)}`;
        const dateOfReg = getStr(row, 'DATE OF REGISTRATION') || new Date().toISOString().split('T')[0];

        rowsToProcess.push({
            offline_token: offlineToken,
            name,
            age: parseInt(getStr(row, 'AGE')) || 0,
            gender: getStr(row, 'GENDER'),
            date_of_registration: dateOfReg,
            parent_guardian: getStr(row, 'PARENT/GUARDIAN NAME') || undefined,
            relationship: getStr(row, 'RELATIONSHIP') || undefined,
            beneficiary_type: getStr(row, 'TYPE OF BENEFICIARY'),
            status: getStr(row, 'STATUS'),
            address: getStr(row, 'ADDRESS') || undefined,
            address_type: getStr(row, 'ADDRESS TYPE') || undefined,
            country: getStr(row, 'COUNTRY'),
            state: getStr(row, 'STATE'),
            district: getStr(row, 'DISTRICT') || undefined,
            city: getStr(row, 'CITY') || undefined,
            pincode: getStr(row, 'PINCODE') || undefined,
            mobile_no: mobileNo || undefined,
            purpose_of_visit: getStr(row, 'PURPOSE OF VISIT'),
            disability_type: getStr(row, 'DISABILITY TYPE'),
            program: getStr(row, 'PROGRAM'),
            donor: getStr(row, 'DONOR') || undefined,
            economic_status: '',
            created_at: new Date().toISOString(),
            sync_status: 'pending',
        });
    });

    for (const record of rowsToProcess) {
        try {
            // Skip if the offline_token already exists locally
            const existing = await db.beneficiaries.where('offline_token').equals(record.offline_token).first();
            if (existing) { summary.skipped++; continue; }

            // Skip if mobile already exists locally
            if (record.mobile_no) {
                const existingMobile = await db.beneficiaries.filter(b => b.mobile_no === record.mobile_no).first();
                if (existingMobile) { summary.skipped++; continue; }
            }

            await db.beneficiaries.add(record);
            summary.imported++;
        } catch (err) {
            summary.errors++;
            summary.errorDetails.push(`"${record.name}": ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    }

    return summary;
};

export interface ServiceErrorRow {
    rowNumber: number;
    file_number: string;
    status: string;
    schedule_date: string;
    start_date: string;
    end_date: string;
    location_code: string;
    service_code: string;
    service_provider_code: string;
    mode_of_service: string;
    follow_up_number: string;
    total_minutes: string;
    remarks: string;
    recommendation: string;
    outcome: string;
    outcome_description: string;
    total_fee: string;
    contribution: string;
    balance: string;
    receipt_no: string;
    errorMessage: string;
}

export interface ServiceImportSummary {
    total: number;
    imported: number;
    errors: number;
    errorRows: ServiceErrorRow[];
}

export const importServices = async (file: File): Promise<ServiceImportSummary> => {
    const summary: ServiceImportSummary = {
        total: 0, imported: 0, errors: 0, errorRows: [],
    };

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const worksheet = workbook.getWorksheet(1);

    if (!worksheet) throw new Error('No worksheet found in Excel file');

    const colMap: Record<string, number> = {};
    worksheet.getRow(1).eachCell((cell, colNumber) => {
        const value = cell.value?.toString().toUpperCase().trim();
        if (value) colMap[value] = colNumber;
    });

    const REQUIRED_COLS = [
        'FILE_NUMBER', 'STATUS', 'SCHEDULE_DATE', 'START_DATE',
        'LOCATION_CODE', 'SERVICE_CODE', 'SERVICE_PROVIDER_CODE',
        'MODE_OF_SERVICE', 'FOLLOW_UP_NUMBER', 'TOTAL_MINUTES',
    ];
    const missing = REQUIRED_COLS.filter(c => !colMap[c]);
    if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(', ')}`);

    const getStr = (row: import('exceljs').Row, col: string): string => {
        const idx = colMap[col];
        if (!idx) return '';
        const v = row.getCell(idx).value;
        if (v == null) return '';
        if (v instanceof Date) {
            return `${String(v.getDate()).padStart(2, '0')}-${String(v.getMonth() + 1).padStart(2, '0')}-${v.getFullYear()}`;
        }
        if (typeof v === 'object' && 'result' in v) return String((v as { result: unknown }).result).trim();
        return String(v).trim();
    };

    const parseToISO = (str: string): string | null => {
        if (!str) return null;
        const parts = str.split(/[-/]/);
        if (parts.length === 3) {
            const [a, b, c] = parts;
            const iso = a.length === 4
                ? `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`   // YYYY-MM-DD
                : `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;  // DD-MM-YYYY
            if (!isNaN(new Date(iso).getTime())) return iso;
        }
        const d = new Date(str);
        return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    };

    const VALID_LOCATIONS = new Set(LOCATION_MASTER.map(l => l.code));
    const VALID_SERVICES  = new Set(SERVICE_MASTER.map(s => s.code));
    const VALID_MODES     = new Set(MODE_MASTER.map(m => m.code));
    const VALID_FOLLOWUPS = new Set(['Initial Visit', 'Follow Up 1', 'Follow Up 2', 'Follow Up 3', 'Follow Up 4']);

    const rawRows: ServiceErrorRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const fileNumber = getStr(row, 'FILE_NUMBER');
        // Skip hints row (starts with "e.g.") and blank rows
        if (!fileNumber || fileNumber.toLowerCase().startsWith('e.g.')) return;

        summary.total++;

        const raw: ServiceErrorRow = {
            rowNumber,
            file_number:           fileNumber,
            status:                getStr(row, 'STATUS'),
            schedule_date:         getStr(row, 'SCHEDULE_DATE'),
            start_date:            getStr(row, 'START_DATE'),
            end_date:              getStr(row, 'END_DATE'),
            location_code:         getStr(row, 'LOCATION_CODE'),
            service_code:          getStr(row, 'SERVICE_CODE'),
            service_provider_code: getStr(row, 'SERVICE_PROVIDER_CODE'),
            mode_of_service:       getStr(row, 'MODE_OF_SERVICE'),
            follow_up_number:      getStr(row, 'FOLLOW_UP_NUMBER'),
            total_minutes:         getStr(row, 'TOTAL_MINUTES'),
            remarks:               getStr(row, 'REMARKS'),
            recommendation:        getStr(row, 'RECOMMENDATION'),
            outcome:               getStr(row, 'OUTCOME'),
            outcome_description:   getStr(row, 'OUTCOME_DESCRIPTION'),
            total_fee:             getStr(row, 'TOTAL_FEE'),
            contribution:          getStr(row, 'CONTRIBUTION'),
            balance:               getStr(row, 'BALANCE'),
            receipt_no:            getStr(row, 'RECEIPT_NO'),
            errorMessage:          '',
        };

        rawRows.push(raw);
    });

    for (const raw of rawRows) {
        let validationError: string | null = null;
        const fail = (msg: string) => { if (!validationError) validationError = msg; };

        const statusUpper = raw.status.toUpperCase();
        if (!raw.status) fail('STATUS is required');
        else if (statusUpper !== 'SCHEDULED' && statusUpper !== 'AVAILED')
            fail(`STATUS must be SCHEDULED or AVAILED, got "${raw.status}"`);

        const schedDate = parseToISO(raw.schedule_date);
        if (!raw.schedule_date) fail('SCHEDULE_DATE is required');
        else if (!schedDate) fail(`SCHEDULE_DATE "${raw.schedule_date}" is not a valid date (use DD-MM-YYYY)`);

        const startDate = parseToISO(raw.start_date);
        if (!raw.start_date) fail('START_DATE is required');
        else if (!startDate) fail(`START_DATE "${raw.start_date}" is not a valid date (use DD-MM-YYYY)`);
        else if (schedDate && startDate < schedDate) fail('START_DATE cannot be before SCHEDULE_DATE');

        let endDate: string | null = null;
        if (statusUpper === 'AVAILED') {
            if (!raw.end_date) fail('END_DATE is required when STATUS is AVAILED');
            else {
                endDate = parseToISO(raw.end_date);
                if (!endDate) fail(`END_DATE "${raw.end_date}" is not a valid date (use DD-MM-YYYY)`);
                else if (startDate && endDate < startDate) fail('END_DATE cannot be before START_DATE');
            }
        }

        const locUpper = raw.location_code.toUpperCase();
        if (!raw.location_code) fail('LOCATION_CODE is required');
        else if (!VALID_LOCATIONS.has(locUpper))
            fail(`Invalid LOCATION_CODE "${raw.location_code}". Valid: ${[...VALID_LOCATIONS].join(', ')}`);

        const svcUpper = raw.service_code.toUpperCase();
        if (!raw.service_code) fail('SERVICE_CODE is required');
        else if (!VALID_SERVICES.has(svcUpper))
            fail(`Invalid SERVICE_CODE "${raw.service_code}". Valid: ${[...VALID_SERVICES].join(', ')}`);

        if (!raw.service_provider_code) fail('SERVICE_PROVIDER_CODE is required');

        const modeUpper = raw.mode_of_service.toUpperCase();
        if (!raw.mode_of_service) fail('MODE_OF_SERVICE is required');
        else if (!VALID_MODES.has(modeUpper))
            fail(`Invalid MODE_OF_SERVICE "${raw.mode_of_service}". Valid: ${[...VALID_MODES].join(', ')}`);

        if (!raw.follow_up_number) fail('FOLLOW_UP_NUMBER is required');
        else if (!VALID_FOLLOWUPS.has(raw.follow_up_number))
            fail(`Invalid FOLLOW_UP_NUMBER "${raw.follow_up_number}". Use: Initial Visit, Follow Up 1, 2, 3, or 4`);

        const totalMinutes = parseFloat(raw.total_minutes);
        if (!raw.total_minutes) fail('TOTAL_MINUTES is required');
        else if (isNaN(totalMinutes) || totalMinutes <= 0)
            fail(`TOTAL_MINUTES must be a positive number, got "${raw.total_minutes}"`);

        if (validationError) {
            summary.errors++;
            summary.errorRows.push({ ...raw, errorMessage: validationError });
            continue;
        }

        // Check beneficiary exists in local DB or Supabase
        const localBen = await db.beneficiaries
            .filter(b => b.file_number === raw.file_number || b.offline_token === raw.file_number)
            .first();

        if (!localBen) {
            let foundOnline = false;
            if (navigator.onLine) {
                try {
                    const { data } = await supabase
                        .from('beneficiaries')
                        .select('id')
                        .eq('file_number', raw.file_number)
                        .maybeSingle();
                    if (data) foundOnline = true;
                } catch { /* ignore — will report as not found */ }
            }
            if (!foundOnline) {
                summary.errors++;
                summary.errorRows.push({
                    ...raw,
                    errorMessage: `Beneficiary with FILE_NUMBER "${raw.file_number}" not found in system`,
                });
                continue;
            }
        }

        try {
            await db.service_entries.add({
                offline_id:            crypto.randomUUID(),
                status:                statusUpper as 'SCHEDULED' | 'AVAILED',
                file_number:           raw.file_number,
                schedule_date:         schedDate!,
                start_date:            startDate!,
                end_date:              endDate,
                location_code:         locUpper,
                service_code:          svcUpper,
                service_provider_code: raw.service_provider_code,
                recommendation:        raw.recommendation || null,
                contribution:          raw.contribution ? parseFloat(raw.contribution) : null,
                balance:               raw.balance ? parseFloat(raw.balance) : null,
                total:                 raw.total_fee ? parseFloat(raw.total_fee) : null,
                outcome:               raw.outcome || null,
                outcome_description:   raw.outcome_description || null,
                receipt_no:            raw.receipt_no || null,
                total_hours:           totalMinutes / 60,
                custom_field2:         raw.follow_up_number,
                mode_of_service:       modeUpper,
                custom_field4:         null,
                custom_field5:         null,
                remarks:               raw.remarks || 'Bulk Import',
                created_at:            new Date().toISOString(),
                sync_status:           'pending',
            });
            summary.imported++;
        } catch (dbErr) {
            summary.errors++;
            summary.errorRows.push({
                ...raw,
                errorMessage: `Save failed: ${dbErr instanceof Error ? dbErr.message : 'Unknown error'}`,
            });
        }
    }

    return summary;
};

export const importFileNumbers = async (file: File): Promise<ImportSummary> => {
    const summary: ImportSummary = {
        total: 0,
        updated: 0,
        notMatched: 0,
        errors: 0,
        duplicatesInFile: 0,
    };

    try {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await file.arrayBuffer());
        const worksheet = workbook.getWorksheet(1);

        if (!worksheet) {
            throw new Error('No worksheet found in Excel file');
        }

        // Find headers
        let systemIdCol = -1;
        let fileNumberCol = -1;

        const headerRow = worksheet.getRow(1);
        headerRow.eachCell((cell, colNumber) => {
            const value = cell.value?.toString().toUpperCase();
            if (value === 'SYSTEM_ID') systemIdCol = colNumber;
            if (value === 'FILE_NUMBER') fileNumberCol = colNumber;
        });

        if (systemIdCol === -1 || fileNumberCol === -1) {
            throw new Error('Required columns SYSTEM_ID and FILE_NUMBER not found');
        }

        const dataRows: { systemId: string, fileNumber: string }[] = [];
        const seenFileNumbers = new Set<string>();
        const seenSystemIds = new Set<string>();

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header

            const systemId = row.getCell(systemIdCol).value?.toString().trim();
            const fileNumber = row.getCell(fileNumberCol).value?.toString().trim();

            if (!systemId || !fileNumber) return;

            summary.total++;

            if (seenFileNumbers.has(fileNumber) || seenSystemIds.has(systemId)) {
                summary.duplicatesInFile++;
                return;
            }

            seenFileNumbers.add(fileNumber);
            seenSystemIds.add(systemId);

            dataRows.push({ systemId, fileNumber });
        });

        // Current user role validation should be done at the UI level,
        // but for backend "validation", we are just using supabase client which follows RLS.

        for (const row of dataRows) {
            try {
                // Try updating in Supabase first (for synced records).
                // Non-UUID systemIds (OFF-/import- tokens) must not go through
                // id.eq — Postgres fails the whole query with a uuid cast error
                // (22P02) and the server never gets updated.
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.systemId);
                let updateQuery = supabase
                    .from('beneficiaries')
                    .update({ file_number: row.fileNumber });
                updateQuery = isUuid
                    ? updateQuery.or(`id.eq.${row.systemId},offline_token.eq.${row.systemId}`)
                    : updateQuery.eq('offline_token', row.systemId);
                const { data, error } = await updateQuery.select();

                if (error) {
                    console.error('Supabase update error:', error);
                    // If supabase fails, try local DB (for pending offline records)
                    const localUpdated = await db.beneficiaries
                        .where('offline_token')
                        .equals(row.systemId)
                        .modify({ file_number: row.fileNumber });

                    if (localUpdated) {
                        summary.updated++;
                    } else {
                        summary.errors++;
                    }
                } else if (data && data.length > 0) {
                    summary.updated++;
                } else {
                    // Not found in Supabase, try local
                    const localUpdated = await db.beneficiaries
                        .where('offline_token')
                        .equals(row.systemId)
                        .modify({ file_number: row.fileNumber });

                    if (localUpdated) {
                        summary.updated++;
                    } else {
                        summary.notMatched++;
                    }
                }
            } catch (err) {
                console.error('Import row error:', err);
                summary.errors++;
            }
        }

        return summary;
    } catch (error) {
        console.error('Excel processing error:', error);
        throw error;
    }
};
