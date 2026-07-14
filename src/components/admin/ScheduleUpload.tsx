import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Upload, FileUp, AlertCircle, CheckCircle, Download } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useAuth } from '@/hooks/useAuth';
import { BUSES, normalizeBusName } from '@/constants/buses';



interface ScheduleRow {
    location_name: string;
    scheduled_date: string;
    bus_name: string;
    donor?: string;
    address?: string;
}

export function ScheduleUpload() {
    const [uploading, setUploading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { user } = useAuth();

    const processFile = async (file: File) => {
        setUploading(true);
        setMessage(null);

        try {

            if (file.name.endsWith('.csv')) {
                // Parse CSV
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: async (results) => {
                        await uploadData(results.data as Record<string, unknown>[]);
                    },
                    error: (error) => {
                        // Thrown errors inside async Papa callbacks are not caught by the
                        // surrounding try/catch — surface and reset state directly.
                        setMessage({ type: 'error', text: `CSV Parse Error: ${error.message}` });
                        setUploading(false);
                    }
                });
            } else if (file.name.match(/\.(xlsx|xls)$/)) {
                // Parse Excel
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const binaryStr = e.target?.result;
                        const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: true });
                        const sheetName = workbook.SheetNames[0];
                        const sheet = workbook.Sheets[sheetName];
                        // raw: true + cellDates: true → date cells arrive as real Date
                        // objects instead of locale-formatted text (which xlsx renders
                        // as ambiguous US-style "7/10/26" regardless of the cell format).
                        const jsonData = XLSX.utils.sheet_to_json(sheet, { raw: true }) as Record<string, unknown>[];
                        await uploadData(jsonData);
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                        setMessage({ type: 'error', text: errorMessage });
                        setUploading(false);
                    }
                };
                reader.onerror = () => {
                    setMessage({ type: 'error', text: 'Failed to read the file.' });
                    setUploading(false);
                };
                reader.readAsBinaryString(file);
            } else {
                throw new Error('Invalid file type. Please upload a CSV or Excel file.');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
            setMessage({ type: 'error', text: errorMessage });
            setUploading(false);
        }
    };

    const uploadData = async (rawData: Record<string, unknown>[]) => {
        try {
            // 1. Validate Structure
            if (rawData.length === 0) throw new Error("File is empty.");

            // Normalize keys to lowercase to be safe
            const normalizedData = rawData.map(row => {
                const newRow: Record<string, unknown> = {};
                Object.keys(row).forEach(key => {
                    const normalizedKey = key.replace(/^\ufeff/, '').toLowerCase().trim().replace(/ /g, '_');
                    newRow[normalizedKey] = row[key];
                });
                return newRow as unknown as ScheduleRow;
            });

            // Check for required columns ("Bus Name" or "Bus Number" both accepted)
            const firstRow = normalizedData[0] as unknown as Record<string, unknown>;
            const hasBusCol = 'bus_name' in firstRow || 'bus_number' in firstRow || 'bus' in firstRow;
            const requiredCols = ['location_name', 'scheduled_date'];
            const missingCols = requiredCols.filter(col => !Object.keys(firstRow).includes(col));
            if (!hasBusCol) missingCols.push('bus_name');

            if (missingCols.length > 0) {
                throw new Error(`Missing columns: ${missingCols.join(', ')}`);
            }

            // Helper function to parse various date formats
            const parseDate = (dateStr: string | number | Date): Date => {
                // Real Excel date cells (read with cellDates: true) arrive as Date
                // objects. SheetJS returns them slightly BEFORE midnight of the
                // intended day (e.g. 23:59:59 of the previous day), so shift by
                // 12h before taking the day — rounds to the nearest day in any timezone.
                if (dateStr instanceof Date) {
                    const shifted = new Date(dateStr.getTime() + 12 * 60 * 60 * 1000);
                    return new Date(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
                }

                // Handle Excel serial numbers
                if (typeof dateStr === 'number') {
                    // Excel date serial number: serial 1 = Jan 1, 1900
                    // Subtract 2 to account for Excel's 1-based index and leap year bug
                    // Use day-based math (not milliseconds) to avoid DST issues
                    return new Date(1900, 0, 1 + (dateStr - 2));
                }

                const str = String(dateStr).trim();

                // D-M-YYYY / DD-MM-YYYY format (day first, as used in Indian date format)
                if (str.match(/^\d{1,2}-\d{1,2}-\d{4}$/)) {
                    const [day, month, year] = str.split('-').map(Number);
                    return new Date(year, month - 1, day);
                }

                // Try D/M/YYYY / DD/MM/YYYY format
                if (str.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
                    const [day, month, year] = str.split('/').map(Number);
                    return new Date(year, month - 1, day);
                }

                // Try YYYY-MM-DD format (ISO)
                if (str.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    const [year, month, day] = str.split('-').map(Number);
                    return new Date(year, month - 1, day);
                }

                // D-M-YY / D/M/YY with a 2-digit year (day first) → 20YY
                if (str.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{2}$/)) {
                    const [day, month, year] = str.split(/[-/]/).map(Number);
                    return new Date(2000 + year, month - 1, day);
                }

                // No native Date fallback — new Date(str) parses month-first and
                // would silently corrupt day-first dates. Reject instead.
                throw new Error(`Unable to parse date: ${str}. Use DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD.`);
            };


            const uniqueLocations = new Set(normalizedData.map(row => row.location_name));

            // 2. Transform Data for DB — month/year derived per row from its own date,
            // bus validated against the known fleet so typos don't create ghost buses
            const dbRows = normalizedData.map((row, index) => {
                let parsedDate: Date;
                try {
                    parsedDate = parseDate(row.scheduled_date);
                } catch (err) {
                    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                    throw new Error(`Invalid date in row ${index + 1}: ${errorMessage}`);
                }

                if (isNaN(parsedDate.getTime())) {
                    throw new Error(`Invalid date value in row ${index + 1}: ${row.scheduled_date}`);
                }

                const rawRecord = row as unknown as Record<string, unknown>;
                const rawBus = rawRecord.bus_name ?? rawRecord.bus_number ?? rawRecord.bus;
                const busNumber = normalizeBusName(rawBus);
                if (!busNumber) {
                    throw new Error(`Invalid bus name in row ${index + 1}: "${rawBus ?? ''}". Valid buses: ${BUSES.join(', ')}.`);
                }

                const donor = rawRecord.donor != null ? String(rawRecord.donor).trim() : '';

                // Format date as YYYY-MM-DD using local time (not UTC) to avoid timezone shift
                const yyyy = parsedDate.getFullYear();
                const mm = String(parsedDate.getMonth() + 1).padStart(2, '0');
                const dd = String(parsedDate.getDate()).padStart(2, '0');

                return {
                    month: parsedDate.getMonth() + 1, // 1-12
                    year: parsedDate.getFullYear(),
                    location_name: row.location_name,
                    scheduled_date: `${yyyy}-${mm}-${dd}`,
                    bus_number: busNumber,
                    donor: donor || null,
                    address: row.address || null,
                    is_active: true
                };
            });

            // Every distinct month/year/bus present in the file
            const monthYearBusKeys = Array.from(new Set(dbRows.map(r => `${r.month}|${r.year}|${r.bus_number}`)));

            // 5. Database Transaction

            // A. Archive previous schedules per month + bus in the file (if re-uploading).
            // Scoped to the bus so uploading one bus's schedule never deactivates
            // another bus's schedule for the same month.
            for (const key of monthYearBusKeys) {
                const [m, y, bus] = key.split('|');
                const { error: updateError } = await supabase
                    .from('monthly_schedules')
                    .update({ is_active: false })
                    .eq('month', Number(m))
                    .eq('year', Number(y))
                    .eq('bus_number', bus);

                if (updateError) throw updateError;
            }

            // B. Insert new records
            const { error: insertError } = await supabase
                .from('monthly_schedules')
                .insert(dbRows);

            if (insertError) throw insertError;

            // Log the upload action
            await supabase.from('audit_logs').insert({
                user_id: user?.id,
                action: 'SCHEDULE_UPLOAD',
                details: {
                    month_bus_batches: monthYearBusKeys,
                    location_count: dbRows.length,
                    unique_locations: uniqueLocations.size
                }
            });

            const batchLabels = monthYearBusKeys.map(key => {
                const [m, y, bus] = key.split('|');
                return `${new Date(Number(y), Number(m) - 1).toLocaleString('default', { month: 'long' })} ${y} (${bus})`;
            }).join(', ');
            setMessage({ type: 'success', text: `Successfully uploaded ${dbRows.length} schedule records for ${batchLabels}.` });

        } catch (error) {
            console.error(error);
            const errorMessage = error instanceof Error ? error.message : "Upload failed.";
            setMessage({ type: 'error', text: errorMessage });
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const downloadTemplate = () => {
        // Create sample data for the template
        const sampleData = [
            {
                'Scheduled Date': '2026-03-10',
                'Location Name': 'Chanrayapatna',
                'Bus Name': 'BUS ABB',
                'Donor': 'Donor A',
                'Address': 'Chanrayapatna, Hassan District, Karnataka'
            },
            {
                'Scheduled Date': '2026-03-15',
                'Location Name': 'Hesarghatta',
                'Bus Name': 'BUS ABB',
                'Donor': 'Donor A',
                'Address': 'Hesarghatta, Bangalore Rural, Karnataka'
            },
            {
                'Scheduled Date': '2026-03-20',
                'Location Name': 'Nalur',
                'Bus Name': 'BUS Brigade',
                'Donor': 'Donor B',
                'Address': 'Nalur, Bangalore, Karnataka'
            },
            {
                'Scheduled Date': '2026-03-25',
                'Location Name': 'Sonnenahalli',
                'Bus Name': 'BUS Juniper',
                'Donor': '',
                'Address': 'Sonnenahalli, Bangalore, Karnataka'
            }
        ];

        // Generate Excel file using the XLSX library already imported
        const ws = XLSX.utils.json_to_sheet(sampleData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Schedule Template");

        // Set column widths for better readability
        ws['!cols'] = [
            { wch: 15 }, // Scheduled Date
            { wch: 20 }, // Location Name
            { wch: 15 }, // Bus Name
            { wch: 20 }, // Donor
            { wch: 40 }  // Address
        ];

        // Trigger download
        XLSX.writeFile(wb, 'monthly_schedule_template.xlsx');
    };

    return (
        <Card className="p-6">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <FileUp className="text-primary" /> Import Monthly Schedule
            </h3>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <h4 className="text-sm font-bold text-blue-900 mb-2">Instructions:</h4>
                <ul className="list-disc list-inside text-xs text-blue-800 space-y-1">
                    <li>Upload CSV or Excel (.xlsx) file.</li>
                    <li>Required Columns: <strong>Scheduled Date, Location Name, Bus Name</strong> — Optional: <strong>Donor, Address</strong></li>
                    <li>Valid bus names: <strong>{BUSES.join(', ')}</strong>. One file can mix multiple buses.</li>
                    <li>Format: Locations and dates from the Excel will reflect in the Calendar and Upcoming Camps.</li>
                    <li>System will automatically detect the Month/Year from the dates.</li>
                    <li>Re-uploading replaces the schedule only for the bus(es) and month(s) present in the file — other buses' schedules are untouched.</li>
                </ul>
            </div>

            <div className="mb-6 flex justify-end">
                <Button
                    onClick={downloadTemplate}
                    variant="outline"
                    className="flex items-center gap-2 text-sm"
                >
                    <Download size={16} />
                    Download Sample Template (.xlsx)
                </Button>
            </div>

            <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-10 hover:bg-gray-50 transition-colors">
                <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv, .xlsx, .xls"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                    disabled={uploading}
                />

                {uploading ? (
                    <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
                        <p className="text-sm text-text-muted">Processing file...</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <Upload className="mx-auto h-10 w-10 text-gray-400 mb-2" />
                        <p className="text-sm text-text-main font-medium mb-1">Click to upload schedule</p>
                        <p className="text-xs text-text-muted">CSV or Excel files only</p>
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            className="mt-4"
                            variant="outline"
                        >
                            Select File
                        </Button>
                    </div>
                )}
            </div>

            {message && (
                <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 text-sm ${message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message.type === 'success' ? <CheckCircle size={16} className="mt-0.5" /> : <AlertCircle size={16} className="mt-0.5" />}
                    <span>{message.text}</span>
                </div>
            )}
        </Card>
    );
}
