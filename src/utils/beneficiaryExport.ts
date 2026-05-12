export const exportBeneficiariesToExcel = async (
    data: Record<string, unknown>[],
    dateRange?: { startDate?: string; endDate?: string }
) => {
    if (!data || data.length === 0) return;

    const ExcelJS = (await import('exceljs')).default;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Beneficiaries');

    // Define columns with headers and keys (21 fields now)
    worksheet.columns = [
        { header: 'SYSTEM_ID', key: 'system_id', width: 40 },
        { header: 'NAME', key: 'name', width: 25 },
        { header: 'AGE', key: 'age', width: 10 },
        { header: 'GENDER', key: 'gender', width: 15 },
        { header: 'DATE OF REGISTRATION', key: 'date_of_registration', width: 25 },
        { header: 'PARENT/GUARDIAN NAME', key: 'parent_guardian', width: 25 },
        { header: 'RELATIONSHIP', key: 'relationship', width: 20 },
        { header: 'TYPE OF BENEFICIARY', key: 'beneficiary_type', width: 25 },
        { header: 'STATUS', key: 'status', width: 15 },
        { header: 'ADDRESS', key: 'address', width: 30 },
        { header: 'ADDRESS TYPE', key: 'address_type', width: 20 },
        { header: 'COUNTRY', key: 'country', width: 15 },
        { header: 'STATE', key: 'state', width: 20 },
        { header: 'DISTRICT', key: 'district', width: 20 },
        { header: 'CITY', key: 'city', width: 20 },
        { header: 'PINCODE', key: 'pincode', width: 15 },
        { header: 'MOBILE NO', key: 'mobile_no', width: 20 },
        { header: 'PURPOSE OF VISIT', key: 'purpose_of_visit', width: 25 },
        { header: 'DISABILITY TYPE', key: 'disability_type', width: 25 },
        { header: 'PROGRAM', key: 'program', width: 20 },
        { header: 'DONOR', key: 'donor', width: 20 },
    ];

    // Add data rows
    data.forEach(item => {
        worksheet.addRow({
            system_id: item.id || item.offline_token || '',
            name: item.name ?? '',
            age: item.age ?? '',
            gender: item.gender ?? '',
            date_of_registration: item.date_of_registration ?? '',
            parent_guardian: item.parent_guardian ?? '',
            relationship: item.relationship ?? '',
            beneficiary_type: item.beneficiary_type ?? '',
            status: item.status ?? '',
            address: item.address ?? '',
            address_type: item.address_type ?? '',
            country: item.country ?? '',
            state: item.state ?? '',
            district: item.district ?? '',
            city: item.city ?? '',
            pincode: item.pincode ?? '',
            mobile_no: item.mobile_no ?? '',
            purpose_of_visit: item.purpose_of_visit ?? '',
            disability_type: item.disability_type ?? '',
            program: item.program ?? '',
            donor: item.donor ?? '',
        });
    });

    // Style the header row (Row 1)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
        cell.font = {
            bold: true,
            color: { argb: 'FF000000' }, // Black text as per image
            size: 12
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });
    headerRow.height = 30;

    // Add date range info row if filtered
    if (dateRange?.startDate || dateRange?.endDate) {
        worksheet.addRow({});
        const rangeText = `Filtered: ${dateRange.startDate || 'Start'} to ${dateRange.endDate || 'Present'} | Total Records: ${data.length}`;
        const infoRow = worksheet.addRow({ name: rangeText });
        infoRow.getCell(2).font = { italic: true, color: { argb: 'FF666666' }, size: 10 };
    }

    // Generate Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const date = new Date().toISOString().split('T')[0];
    const rangeSuffix = dateRange?.startDate || dateRange?.endDate
        ? `_${dateRange.startDate || 'start'}_to_${dateRange.endDate || 'present'}`
        : '';
    const fileName = `Beneficiary_Report_${date}${rangeSuffix}.xlsx`;

    // Create blob and trigger download
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

/**
 * Utility to download a sample format for file number import
 */
export const downloadSampleImportFile = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sample_Import');

    worksheet.columns = [
        { header: 'SYSTEM_ID', key: 'system_id', width: 40 },
        { header: 'FILE_NUMBER', key: 'file_number', width: 20 },
        { header: 'NAME (Optional Info)', key: 'name', width: 25 },
    ];

    // Add example row
    worksheet.addRow({
        system_id: 'copy-id-from-export-here',
        file_number: 'NEW-FILE-001',
        name: 'Example Patient Name'
    });

    // Style header
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F0F0' }
    };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'File_Number_Import_Sample.xlsx';
    anchor.click();
    window.URL.revokeObjectURL(url);
};
