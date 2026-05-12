import { supabase } from '@/lib/supabase';
import { db } from '@/lib/db';

export interface ImportSummary {
    total: number;
    updated: number;
    notMatched: number;
    errors: number;
    duplicatesInFile: number;
}

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
