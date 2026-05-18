import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';
import type { OfflineBeneficiary } from '@/lib/db';

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
                // Try updating in Supabase first (for synced records)
                const { data, error } = await supabase
                    .from('beneficiaries')
                    .update({ file_number: row.fileNumber })
                    .or(`id.eq.${row.systemId},offline_token.eq.${row.systemId}`)
                    .select();

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
