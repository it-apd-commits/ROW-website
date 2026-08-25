import type { ServiceErrorRow } from '@/services/importService';
import { SERVICE_MASTER, LOCATION_MASTER, MODE_OF_SERVICE } from '@/data/masters';

const FOLLOW_UP_OPTIONS = ['Initial Visit', 'Follow Up 1', 'Follow Up 2', 'Follow Up 3', 'Follow Up 4'];

const THIN_BORDER = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
};

const triggerDownload = (buffer: ArrayBuffer, fileName: string) => {
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
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

export const downloadServiceImportTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();

    // ── Sheet 1: Service Import ──────────────────────────────────────────────
    const ws = workbook.addWorksheet('Service Import');

    const COLS = [
        // Required (green header)
        { header: 'FILE_NUMBER',           key: 'file_number',           width: 18, required: true,  hint: 'e.g. ROW-001 (must exist in system)' },
        { header: 'STATUS',                key: 'status',                width: 14, required: true,  hint: 'SCHEDULED or AVAILED' },
        { header: 'SCHEDULE_DATE',         key: 'schedule_date',         width: 16, required: true,  hint: 'DD-MM-YYYY' },
        { header: 'START_DATE',            key: 'start_date',            width: 16, required: true,  hint: 'DD-MM-YYYY' },
        { header: 'END_DATE',              key: 'end_date',              width: 22, required: false, hint: 'DD-MM-YYYY  (required if STATUS=AVAILED)' },
        { header: 'LOCATION_CODE',         key: 'location_code',         width: 16, required: true,  hint: LOCATION_MASTER.map(l => l.code).join(' / ') },
        { header: 'SERVICE_CODE',          key: 'service_code',          width: 16, required: true,  hint: 'Pick from dropdown — full list on "Reference" sheet' },
        { header: 'SERVICE_PROVIDER_CODE', key: 'service_provider_code', width: 24, required: true,  hint: 'Provider name or code' },
        { header: 'MODE_OF_SERVICE',       key: 'mode_of_service',       width: 18, required: true,  hint: MODE_OF_SERVICE.map(m => m.code).join(' / ') },
        { header: 'FOLLOW_UP_NUMBER',      key: 'follow_up_number',      width: 22, required: true,  hint: 'Initial Visit / Follow Up 1 / 2 / 3 / 4' },
        { header: 'TOTAL_MINUTES',         key: 'total_minutes',         width: 16, required: true,  hint: 'Number e.g. 30, 45, 60' },
        // Optional (yellow header)
        { header: 'REMARKS',               key: 'remarks',               width: 25, required: false, hint: 'Optional – free text' },
        { header: 'RECOMMENDATION',        key: 'recommendation',        width: 25, required: false, hint: 'Optional – free text' },
        { header: 'OUTCOME',               key: 'outcome',               width: 20, required: false, hint: 'Optional – free text' },
        { header: 'OUTCOME_DESCRIPTION',   key: 'outcome_description',   width: 30, required: false, hint: 'Optional – free text' },
        { header: 'TOTAL_FEE',             key: 'total_fee',             width: 14, required: false, hint: 'Optional – number' },
        { header: 'CONTRIBUTION',          key: 'contribution',          width: 14, required: false, hint: 'Optional – number' },
        { header: 'BALANCE',               key: 'balance',               width: 14, required: false, hint: 'Optional – number' },
        { header: 'RECEIPT_NO',            key: 'receipt_no',            width: 16, required: false, hint: 'Optional – free text' },
    ];

    // Set column widths/keys only — omit 'header' here so ExcelJS does NOT
    // auto-insert a header row during serialization (which would duplicate row 1).
    ws.columns = COLS.map(c => ({ key: c.key, width: c.width }));

    // Row 1 — Headers (written explicitly to avoid ExcelJS duplication)
    const headerRow = ws.getRow(1);
    headerRow.height = 36;
    COLS.forEach((col, idx) => {
        const cell = headerRow.getCell(idx + 1);
        cell.value = col.header;
        cell.font = { bold: true, color: { argb: 'FF000000' }, size: 10 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = THIN_BORDER;
        cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: col.required ? 'FF86EFAC' : 'FFFDE68A' },
        };
    });
    headerRow.commit();

    // Row 2 — Hints (allowed values, skipped by import)
    const hintsRow = ws.getRow(2);
    hintsRow.height = 32;
    COLS.forEach((col, idx) => {
        const cell = hintsRow.getCell(idx + 1);
        cell.value = col.hint;
        cell.font = { italic: true, color: { argb: 'FF6B7280' }, size: 8 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        cell.border = THIN_BORDER;
    });

    // Row 3 — Sample data (light blue)
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const todayStr = `${dd}-${mm}-${yyyy}`;

    const sampleRow = ws.getRow(3);
    sampleRow.height = 22;
    const sampleValues = [
        'ROW-001', 'AVAILED', todayStr, todayStr, todayStr,
        'MCB', 'General Screening', 'Dr. Rajesh Kumar', 'ROW', 'Initial Visit', '45',
        'Sample session note', '', '', '', '', '', '', '',
    ];
    sampleValues.forEach((val, idx) => {
        const cell = sampleRow.getCell(idx + 1);
        cell.value = val;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        cell.font = { color: { argb: 'FF0369A1' }, size: 10, italic: true };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = THIN_BORDER;
    });
    sampleRow.getCell(1).note = 'Sample row — delete this row before uploading your data';

    // Service names are long and there are many of them — an inline Excel list
    // formula ("a,b,c,...") is capped at 255 characters, which this list blows
    // past. Put the options on a hidden sheet instead and reference that range.
    const listsSheet = workbook.addWorksheet('Lists');
    listsSheet.state = 'veryHidden';
    SERVICE_MASTER.forEach((s, i) => {
        listsSheet.getCell(i + 1, 1).value = s.code;
    });
    const serviceListRange = `Lists!$A$1:$A$${SERVICE_MASTER.length}`;

    // Dropdown validation for rows 4–500
    for (let r = 4; r <= 500; r++) {
        ws.getCell(r, 2).dataValidation  = { type: 'list', allowBlank: true, formulae: ['"SCHEDULED,AVAILED"'] };
        ws.getCell(r, 6).dataValidation  = { type: 'list', allowBlank: true, formulae: [`"${LOCATION_MASTER.map(l => l.code).join(',')}"`] };
        ws.getCell(r, 7).dataValidation  = { type: 'list', allowBlank: true, formulae: [serviceListRange] };
        ws.getCell(r, 9).dataValidation  = { type: 'list', allowBlank: true, formulae: [`"${MODE_OF_SERVICE.map(m => m.code).join(',')}"`] };
        ws.getCell(r, 10).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${FOLLOW_UP_OPTIONS.join(',')}"`] };
    }

    // Freeze header + hints rows so they stay visible while scrolling
    ws.views = [{ state: 'frozen', ySplit: 2, xSplit: 0 }];

    // Legend row (after data area)
    ws.getRow(502).getCell(1).value =
        '■ Green header = Required   ■ Yellow header = Optional   Row 2 = Hints (do not delete)   Row 3 = Sample (delete before uploading)';
    ws.getRow(502).getCell(1).font = { italic: true, color: { argb: 'FF9CA3AF' }, size: 8 };
    ws.mergeCells(502, 1, 502, 11);

    // ── Sheet 2: Reference ───────────────────────────────────────────────────
    const ref = workbook.addWorksheet('Reference');
    ref.columns = [
        { header: 'Field', key: 'field', width: 24 },
        { header: 'Code', key: 'code', width: 22 },
        { header: 'Full Name / Description', key: 'name', width: 40 },
    ];

    const refHeader = ref.getRow(1);
    refHeader.height = 28;
    refHeader.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = THIN_BORDER;
    });

    const addSection = (label: string, items: { code: string; name: string }[]) => {
        const sRow = ref.addRow([label, '', '']);
        sRow.height = 22;
        sRow.getCell(1).font = { bold: true, color: { argb: 'FF1E3A8A' }, size: 10 };
        sRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
        ref.mergeCells(sRow.number, 1, sRow.number, 3);
        sRow.getCell(1).border = THIN_BORDER;

        items.forEach(item => {
            const row = ref.addRow(['', item.code, item.name]);
            row.height = 20;
            row.getCell(2).font = { bold: true, color: { argb: 'FF1E40AF' } };
            row.eachCell(cell => {
                cell.border = THIN_BORDER;
                cell.alignment = { vertical: 'middle' };
            });
        });

        ref.addRow([]);
    };

    addSection('LOCATION_CODE', LOCATION_MASTER);
    addSection('SERVICE_CODE', SERVICE_MASTER);
    addSection('MODE_OF_SERVICE', MODE_OF_SERVICE);
    addSection('FOLLOW_UP_NUMBER', FOLLOW_UP_OPTIONS.map(o => ({ code: o, name: '—' })));
    addSection('STATUS', [
        { code: 'SCHEDULED', name: 'Service is scheduled but not yet availed' },
        { code: 'AVAILED',   name: 'Service has been availed (END_DATE is required)' },
    ]);

    ref.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    triggerDownload(buffer as ArrayBuffer, 'Service_Import_Template.xlsx');
};

export const exportServiceImportErrors = async (errorRows: ServiceErrorRow[]) => {
    if (errorRows.length === 0) return;

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Import Errors');

    const ERROR_COL = 21;

    ws.columns = [
        { header: 'ROW #',                 key: 'rowNumber',             width: 8  },
        { header: 'FILE_NUMBER',           key: 'file_number',           width: 18 },
        { header: 'STATUS',                key: 'status',                width: 14 },
        { header: 'SCHEDULE_DATE',         key: 'schedule_date',         width: 16 },
        { header: 'START_DATE',            key: 'start_date',            width: 16 },
        { header: 'END_DATE',              key: 'end_date',              width: 16 },
        { header: 'LOCATION_CODE',         key: 'location_code',         width: 16 },
        { header: 'SERVICE_CODE',          key: 'service_code',          width: 16 },
        { header: 'SERVICE_PROVIDER_CODE', key: 'service_provider_code', width: 24 },
        { header: 'MODE_OF_SERVICE',       key: 'mode_of_service',       width: 18 },
        { header: 'FOLLOW_UP_NUMBER',      key: 'follow_up_number',      width: 22 },
        { header: 'TOTAL_MINUTES',         key: 'total_minutes',         width: 16 },
        { header: 'REMARKS',               key: 'remarks',               width: 25 },
        { header: 'RECOMMENDATION',        key: 'recommendation',        width: 25 },
        { header: 'OUTCOME',               key: 'outcome',               width: 20 },
        { header: 'OUTCOME_DESCRIPTION',   key: 'outcome_description',   width: 30 },
        { header: 'TOTAL_FEE',             key: 'total_fee',             width: 14 },
        { header: 'CONTRIBUTION',          key: 'contribution',          width: 14 },
        { header: 'BALANCE',               key: 'balance',               width: 14 },
        { header: 'RECEIPT_NO',            key: 'receipt_no',            width: 16 },
        { header: 'ERROR',                 key: 'errorMessage',          width: 50 },
    ];

    // Header row
    const headerRow = ws.getRow(1);
    headerRow.height = 30;
    headerRow.eachCell((cell, colNum) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
        cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: colNum === ERROR_COL ? 'FFDC2626' : 'FF374151' },
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = THIN_BORDER;
    });

    // Data rows
    errorRows.forEach(row => {
        const dataRow = ws.addRow({
            rowNumber:             row.rowNumber,
            file_number:           row.file_number,
            status:                row.status,
            schedule_date:         row.schedule_date,
            start_date:            row.start_date,
            end_date:              row.end_date,
            location_code:         row.location_code,
            service_code:          row.service_code,
            service_provider_code: row.service_provider_code,
            mode_of_service:       row.mode_of_service,
            follow_up_number:      row.follow_up_number,
            total_minutes:         row.total_minutes,
            remarks:               row.remarks,
            recommendation:        row.recommendation,
            outcome:               row.outcome,
            outcome_description:   row.outcome_description,
            total_fee:             row.total_fee,
            contribution:          row.contribution,
            balance:               row.balance,
            receipt_no:            row.receipt_no,
            errorMessage:          row.errorMessage,
        });
        dataRow.height = 20;
        dataRow.eachCell((cell, colNum) => {
            const isErr = colNum === ERROR_COL;
            cell.fill = {
                type: 'pattern', pattern: 'solid',
                fgColor: { argb: isErr ? 'FFFEE2E2' : 'FFFFFFFF' },
            };
            if (isErr) cell.font = { color: { argb: 'FFDC2626' }, size: 10, bold: true };
            cell.border = THIN_BORDER;
            cell.alignment = { vertical: 'middle', wrapText: isErr };
        });
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const date = new Date().toISOString().split('T')[0];
    triggerDownload(buffer as ArrayBuffer, `services_import_errors_${date}.xlsx`);
};
