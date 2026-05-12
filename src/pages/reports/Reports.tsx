import { useState, useEffect, useCallback } from 'react';
import {
    BarChart3,
    Download,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    Minus,
    AlertTriangle,
    Users,
    ClipboardList,
    Filter,
    Loader2,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { getOutcomes, summarize } from '@/services/outcomeEvaluationService';
import { getAllScales, getConditions, getScalesByCondition } from '@/config/outcomeScales';
import type { ScaleConfig } from '@/config/outcomeScales';
import type { OutcomeRow, OutcomeSummary, OutcomeFilters } from '@/types/outcomeEvaluation';

const ALL_SCALES = getAllScales();
const CONDITIONS = getConditions();

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    improved: { label: 'Improved', color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-200' },
    declined: { label: 'Declined', color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-200' },
    same: { label: 'Same', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200' },
    baseline_only: { label: 'Baseline Only', color: 'text-gray-600', bg: 'bg-gray-100', border: 'border-gray-200' },
    needs_referral: { label: 'Needs Referral', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200' },
    not_evaluable: { label: 'Not Evaluable', color: 'text-gray-400', bg: 'bg-gray-50', border: 'border-gray-100' },
};

function formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatValue(v: string | number | null): string {
    if (v === null || v === undefined) return '—';
    return String(v);
}

export function ReportsPage() {
    const [selectedCondition, setSelectedCondition] = useState(CONDITIONS[0] || '');
    const [scaleId, setScaleId] = useState(ALL_SCALES[0]?.id || '');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [rows, setRows] = useState<OutcomeRow[]>([]);
    const [summary, setSummary] = useState<OutcomeSummary | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const conditionScales = getScalesByCondition(selectedCondition);
    const activeScale: ScaleConfig | undefined = conditionScales.find(s => s.id === scaleId) || conditionScales[0];

    useEffect(() => {
        const scales = getScalesByCondition(selectedCondition);
        if (scales.length > 0 && !scales.find(s => s.id === scaleId)) {
            setScaleId(scales[0].id);
        }
    }, [selectedCondition, scaleId]);

    const fetchReport = useCallback(async () => {
        const effectiveId = activeScale?.id;
        if (!effectiveId) return;
        setIsLoading(true);
        setError(null);
        try {
            const filters: OutcomeFilters = {
                scaleId: effectiveId,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
            };
            const data = await getOutcomes(filters);
            setRows(data);
            setSummary(summarize(data));
        } catch (err) {
            console.error('Outcome report error:', err);
            setError(err instanceof Error ? err.message : 'Failed to load report');
        } finally {
            setIsLoading(false);
        }
    }, [activeScale?.id, fromDate, toDate]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const filteredRows = rows.filter(r =>
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.patient_id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const evaluableCount = summary
        ? summary.improved + summary.declined + summary.same + summary.needs_referral
        : 0;

    const pct = (n: number) => evaluableCount > 0 ? `${((n / evaluableCount) * 100).toFixed(1)}%` : '—';

    const handleExport = async () => {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const scaleName = activeScale?.label || scaleId;

        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Field', key: 'field', width: 25 },
            { header: 'Value', key: 'value', width: 30 },
        ];
        summarySheet.addRow({ field: 'Report', value: 'Outcome Evaluation Report' });
        summarySheet.addRow({ field: 'Scale', value: scaleName });
        summarySheet.addRow({ field: 'Date Range', value: `${fromDate || 'All'} to ${toDate || 'All'}` });
        summarySheet.addRow({ field: 'Exported On', value: new Date().toISOString().split('T')[0] });
        summarySheet.addRow({ field: '', value: '' });
        if (summary) {
            summarySheet.addRow({ field: 'Total Patients', value: summary.total });
            summarySheet.addRow({ field: 'Evaluable', value: evaluableCount });
            summarySheet.addRow({ field: 'Improved', value: `${summary.improved} (${pct(summary.improved)})` });
            summarySheet.addRow({ field: 'Declined', value: `${summary.declined} (${pct(summary.declined)})` });
            summarySheet.addRow({ field: 'Same', value: `${summary.same} (${pct(summary.same)})` });
            summarySheet.addRow({ field: 'Needs Referral', value: summary.needs_referral });
            summarySheet.addRow({ field: 'Baseline Only', value: summary.baseline_only });
            summarySheet.addRow({ field: 'Not Evaluable', value: summary.not_evaluable });
        }

        const dataSheet = workbook.addWorksheet('Consolidated');
        dataSheet.columns = [
            { header: 'Patient ID', key: 'patient_id', width: 24 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Scale', key: 'scale', width: 28 },
            { header: 'Baseline Value', key: 'baseline_value', width: 18 },
            { header: 'Baseline Date', key: 'baseline_date', width: 16 },
            { header: 'Current Value', key: 'current_value', width: 18 },
            { header: 'Current Date', key: 'current_date', width: 16 },
            { header: 'Status', key: 'status', width: 18 },
        ];

        const exportRows = searchTerm ? filteredRows : rows;
        exportRows.forEach(r => {
            dataSheet.addRow({
                patient_id: r.patient_id,
                name: r.name,
                scale: scaleName,
                baseline_value: formatValue(r.baseline_value),
                baseline_date: formatDate(r.baseline_date),
                current_value: formatValue(r.current_value),
                current_date: formatDate(r.current_date),
                status: STATUS_CONFIG[r.status]?.label || r.status,
            });
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const rangeLabel = fromDate || toDate ? `_${fromDate || 'start'}_to_${toDate || 'end'}` : '';
        anchor.download = `Outcome_${scaleId}${rangeLabel}_${new Date().toISOString().split('T')[0]}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                        <BarChart3 className="text-primary" /> Outcome Evaluation Report
                    </h1>
                    <p className="text-text-muted text-sm mt-1">
                        Compare baseline vs latest follow-up to evaluate beneficiary outcomes.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="secondary" onClick={fetchReport} className="bg-white">
                        <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
                    </Button>
                    <Button
                        onClick={handleExport}
                        disabled={rows.length === 0 || isLoading}
                        className="flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                        <Download size={18} /> <span className="hidden sm:inline">Export Excel</span>
                    </Button>
                </div>
            </div>

            {/* Filters */}
            <Card className="p-4 md:p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Filter size={16} className="text-primary" />
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Filters</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Select
                        label="Condition"
                        name="condition"
                        value={selectedCondition}
                        onChange={(e) => setSelectedCondition(e.target.value)}
                        options={CONDITIONS.map(c => ({ value: c, label: c }))}
                    />
                    <Select
                        label="Assessment Scale"
                        name="scale"
                        value={activeScale?.id || ''}
                        onChange={(e) => setScaleId(e.target.value)}
                        options={conditionScales.map(s => ({ value: s.id, label: s.label }))}
                    />
                    <div />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    <Input
                        label="From Date (Follow-up)"
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                    />
                    <Input
                        label="To Date (Follow-up)"
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                    />
                    <div className="flex items-end">
                        {(fromDate || toDate) && (
                            <button
                                onClick={() => { setFromDate(''); setToDate(''); }}
                                className="text-xs font-bold text-primary hover:underline px-2 pb-2"
                            >
                                Clear Dates
                            </button>
                        )}
                    </div>
                </div>
            </Card>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-xl text-sm font-medium">
                    {error}
                </div>
            )}

            {/* Summary Cards */}
            {!isLoading && summary && (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                    <SummaryCard
                        icon={<Users size={18} className="text-primary" />}
                        label="Total Patients"
                        value={summary.total}
                        accent="text-primary"
                        bgAccent="bg-primary/10"
                    />
                    <SummaryCard
                        icon={<TrendingUp size={18} className="text-green-600" />}
                        label="Improved"
                        value={summary.improved}
                        sub={pct(summary.improved)}
                        accent="text-green-700"
                        bgAccent="bg-green-100"
                    />
                    <SummaryCard
                        icon={<TrendingDown size={18} className="text-red-600" />}
                        label="Declined"
                        value={summary.declined}
                        sub={pct(summary.declined)}
                        accent="text-red-700"
                        bgAccent="bg-red-100"
                    />
                    <SummaryCard
                        icon={<Minus size={18} className="text-amber-600" />}
                        label="Same"
                        value={summary.same}
                        sub={pct(summary.same)}
                        accent="text-amber-700"
                        bgAccent="bg-amber-100"
                    />
                    {activeScale?.id === 'ei_outcome' && (
                        <SummaryCard
                            icon={<AlertTriangle size={18} className="text-purple-600" />}
                            label="Needs Referral"
                            value={summary.needs_referral}
                            accent="text-purple-700"
                            bgAccent="bg-purple-100"
                        />
                    )}
                    <SummaryCard
                        icon={<ClipboardList size={18} className="text-gray-500" />}
                        label="Baseline Only"
                        value={summary.baseline_only}
                        accent="text-gray-600"
                        bgAccent="bg-gray-100"
                    />
                </div>
            )}

            {/* Search + Table */}
            <Card className="p-4 md:p-6">
                <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
                    <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                        <ClipboardList size={16} className="text-primary" /> Consolidated Report
                    </h3>
                    <div className="flex-1 relative max-w-md">
                        <Input
                            placeholder="Search by name or patient ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <span className="text-xs text-gray-400 font-medium">
                        {filteredRows.length} of {rows.length} records
                    </span>
                </div>

                {isLoading ? (
                    <div className="py-24 flex flex-col items-center justify-center">
                        <Loader2 size={32} className="text-primary animate-spin mb-4" />
                        <p className="text-text-muted font-medium">Loading outcome data...</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="py-24 text-center">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <BarChart3 size={32} className="text-gray-200" />
                        </div>
                        <p className="text-gray-400 font-medium">
                            {rows.length === 0
                                ? 'No assessment data found for the selected scale and date range.'
                                : 'No records match your search.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto min-w-0 w-full">
                        <table className="w-full min-w-[800px] text-left border-collapse">
                            <thead>
                                <tr className="border-b border-gray-100">
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider pl-4">Patient ID</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Name</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Baseline</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Current</th>
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {filteredRows.map((row) => {
                                    const cfg = STATUS_CONFIG[row.status] || STATUS_CONFIG.not_evaluable;
                                    return (
                                        <tr key={row.patient_id} className="hover:bg-gray-50/50 transition-colors group align-top">
                                            <td className="py-4 pl-4">
                                                <span className="text-xs font-mono font-bold text-blue-600">{row.patient_id}</span>
                                            </td>
                                            <td className="py-4">
                                                <span className="text-sm font-bold text-gray-900 group-hover:text-primary transition-colors">
                                                    {row.name}
                                                </span>
                                            </td>
                                            <td className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-gray-800">
                                                        {formatValue(row.baseline_value)}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 mt-0.5">
                                                        {formatDate(row.baseline_date)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-gray-800">
                                                        {formatValue(row.current_value)}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 mt-0.5">
                                                        {formatDate(row.current_date)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-4">
                                                <span className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-lg text-[11px] font-bold tracking-wider border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                                                    {cfg.label}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Info cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-4 bg-gray-50/50 border-gray-100">
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">How it works</h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                        Baseline values come from the initial clinical assessment. Current values come from the most recent
                        follow-up assessment within the selected date range. "Baseline Only" means no follow-up has been
                        recorded in the selected period.
                    </p>
                </Card>
                <Card className="p-4 bg-blue-50/30 border-blue-100">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Excel Export</h4>
                    <p className="text-[11px] text-blue-500 leading-relaxed">
                        Exports include a Summary sheet (active filters + counts) and a Consolidated sheet (all visible
                        rows). The filename includes the scale and date range for audit traceability.
                    </p>
                </Card>
            </div>
        </div>
    );
}

function SummaryCard({ icon, label, value, sub, accent, bgAccent }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    sub?: string;
    accent: string;
    bgAccent: string;
}) {
    return (
        <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-sm min-w-0">
            <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 ${bgAccent} rounded-xl shrink-0`}>{icon}</div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">
                    {label}
                </p>
            </div>
            <h3 className={`text-2xl font-black ${accent}`}>{value}</h3>
            {sub && <p className="text-[11px] text-gray-400 font-medium mt-0.5">{sub}</p>}
        </div>
    );
}
