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
    CheckCircle2,
    Filter,
    Loader2,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { getOutcomes, summarize } from '@/services/outcomeEvaluationService';
import { fetchProgramReport } from '@/services/programReportService';
import { nameMatchesSearch } from '@/utils/fuzzySearch';
import { getAllScales, getScalesByCondition } from '@/config/outcomeScales';
import type { ScaleConfig } from '@/config/outcomeScales';
import type { OutcomeRow, OutcomeSummary, OutcomeFilters, OutcomeStatus } from '@/types/outcomeEvaluation';
import { DROPDOWNS, FIM_LOCOMOTION_ITEMS, FIM_MOBILITY_ITEMS } from '@/constants/assessmentDropdowns';
import { isDisabilityCondition } from '@/utils/assessmentLogic';

const FIM_CATEGORIES = ['Locomotion', 'Mobility'] as const;
type FimCategory = typeof FIM_CATEGORIES[number];
const FIM_LOCOMOTION_KEYS: string[] = FIM_LOCOMOTION_ITEMS.map(i => i.key);
const FIM_MOBILITY_KEYS: string[] = FIM_MOBILITY_ITEMS.map(i => i.key);

function formatMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-');
    return new Date(parseInt(year, 10), parseInt(month, 10) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatPct(v: number | null): string {
    return v === null ? '—' : `${v}%`;
}

type CardFilter = OutcomeStatus | 'endline_completed' | null;

const ALL_SCALES = getAllScales();
// Every selectable Primary Condition value, including individual disability
// sub-types (Cerebral Palsy, Down Syndrome, etc.) — matches the Primary Condition
// dropdown used when entering an Initial Assessment, not just the broad outcome buckets.
const CONDITIONS = DROPDOWNS.Condition;

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
    const [cardFilter, setCardFilter] = useState<CardFilter>(null);
    const [isExporting, setIsExporting] = useState(false);
    const [fimCategory, setFimCategory] = useState<FimCategory>('Locomotion');

    // Individual disability sub-types (Cerebral Palsy, Down Syndrome, etc.) share the
    // same 'Disability' outcome scales (FIM measures) as the broad 'Disability' condition.
    const isDisability = isDisabilityCondition(selectedCondition);
    const scaleCondition = isDisability ? 'Disability' : selectedCondition;
    const conditionScales = isDisability
        ? getScalesByCondition('Disability').filter(s =>
            (fimCategory === 'Locomotion' ? FIM_LOCOMOTION_KEYS : FIM_MOBILITY_KEYS).includes(s.id))
        : getScalesByCondition(scaleCondition);
    const activeScale: ScaleConfig | undefined = conditionScales.find(s => s.id === scaleId) || conditionScales[0];
    const disabilityTypeFilter = isDisability && selectedCondition !== 'Disability'
        ? selectedCondition
        : undefined;

    useEffect(() => {
        if (conditionScales.length > 0 && !conditionScales.find(s => s.id === scaleId)) {
            setScaleId(conditionScales[0].id);
        }
        // conditionScales is recomputed from scaleCondition/fimCategory each render — depend on
        // those directly rather than the derived array so this doesn't loop on identity changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scaleCondition, fimCategory, scaleId]);

    const fetchReport = useCallback(async () => {
        const effectiveId = activeScale?.id;
        if (!effectiveId) {
            setRows([]);
            setSummary(null);
            setError(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const filters: OutcomeFilters = {
                scaleId: effectiveId,
                fromDate: fromDate || undefined,
                toDate: toDate || undefined,
                disabilityType: disabilityTypeFilter,
            };
            const data = await getOutcomes(filters);
            setRows(data);
            setSummary(summarize(data));
            setCardFilter(null);
        } catch (err) {
            console.error('Outcome report error:', err);
            setError(err instanceof Error ? err.message : 'Failed to load report');
        } finally {
            setIsLoading(false);
        }
    }, [activeScale?.id, fromDate, toDate, disabilityTypeFilter]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const filteredRows = rows.filter(r => {
        const matchesSearch = nameMatchesSearch(r.name, searchTerm) ||
            r.patient_id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCard = cardFilter === null ? true
            : cardFilter === 'endline_completed' ? r.current_date != null
            : r.status === cardFilter;
        return matchesSearch && matchesCard;
    });

    const evaluableCount = summary
        ? summary.improved + summary.declined + summary.same + summary.needs_referral
        : 0;

    const pct = (n: number) => evaluableCount > 0 ? `${((n / evaluableCount) * 100).toFixed(1)}%` : '—';

    const handleExport = async () => {
        setIsExporting(true);
        try {
        const ExcelJS = (await import('exceljs')).default;
        const workbook = new ExcelJS.Workbook();
        const scaleName = activeScale?.label || scaleId;

        const summarySheet = workbook.addWorksheet('Summary');
        summarySheet.columns = [
            { header: 'Field', key: 'field', width: 25 },
            { header: 'Value', key: 'value', width: 30 },
        ];
        summarySheet.addRow({ field: 'Report', value: 'Outcome Evaluation Report' });
        summarySheet.addRow({ field: 'Condition', value: selectedCondition });
        if (isDisability) {
            summarySheet.addRow({ field: 'FIM Category', value: fimCategory });
        }
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
            summarySheet.addRow({ field: 'Baseline Only (Endline Pending)', value: summary.baseline_only });
            summarySheet.addRow({ field: 'Endline Completed', value: rows.filter(r => r.current_date != null).length });
            summarySheet.addRow({ field: 'Not Evaluable', value: summary.not_evaluable });
        }

        const dataSheet = workbook.addWorksheet('Consolidated');
        dataSheet.columns = [
            { header: 'Patient ID', key: 'patient_id', width: 24 },
            { header: 'Name', key: 'name', width: 25 },
            { header: 'Scale', key: 'scale', width: 28 },
            { header: 'Baseline Value', key: 'baseline_value', width: 18 },
            { header: 'Baseline Date', key: 'baseline_date', width: 16 },
            { header: 'Endline Value', key: 'current_value', width: 18 },
            { header: 'Endline Date', key: 'current_date', width: 16 },
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

        // ── One consolidated program-wide sheet (spans every condition, not just the
        // filter above) instead of a separate tab per section, to keep the tab count down. ──
        const program = await fetchProgramReport({ fromDate: fromDate || undefined, toDate: toDate || undefined });

        const programSheet = workbook.addWorksheet('Program Report');
        programSheet.columns = [{ width: 34 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 40 }];

        type CellValue = string | number;
        const addSection = (title: string, headers: string[], dataRows: CellValue[][]) => {
            const titleRow = programSheet.addRow([title]);
            titleRow.font = { bold: true, size: 13 };
            if (headers.length > 0) {
                const headerRow = programSheet.addRow(headers);
                headerRow.font = { bold: true };
                headerRow.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
                });
            }
            dataRows.forEach(r => programSheet.addRow(r));
            programSheet.addRow([]);
        };

        const es = program.executiveSummary;
        addSection('1. Executive Summary', ['Metric', 'Value', 'Percentage'], [
            ['Total Beneficiaries Assessed', es.totalAssessed, ''],
            ['Baseline Completed', es.baselineCompleted, formatPct(es.baselineCompletedPct)],
            ['Post-Assessment Completed', es.postAssessmentCompleted, formatPct(es.postAssessmentCompletedPct)],
            ['Improved Outcomes', es.improved, formatPct(program.outcomeAnalysis[0].pct)],
            ['No Change', es.same, formatPct(program.outcomeAnalysis[1].pct)],
            ['Deteriorated', es.deteriorated, formatPct(program.outcomeAnalysis[2].pct)],
        ]);

        addSection('2. Overall Outcome Analysis', ['Outcome', 'Count', 'Percentage'], [
            ...program.outcomeAnalysis.map(r => [r.outcome, r.count, formatPct(r.pct)]),
            ['', '', ''],
            [`Donor-facing framing: "${program.outcomeAnalysis[0].pct}% of beneficiaries demonstrated measurable improvement following intervention."`, '', ''],
        ]);

        addSection('3. Outcome by Primary Condition', ['Condition', 'Improved', 'Same', 'Worse', 'Evaluable Count', 'Note'],
            program.outcomeByCondition.map(r => [r.condition, formatPct(r.improvedPct), formatPct(r.samePct), formatPct(r.worsePct), r.evaluableCount, r.note || '']));

        addSection('4. Improvement by Outcome Measure', ['Condition', 'Category', 'Measure', 'Improved %', 'Evaluable Count'],
            program.improvementByMeasure.map(r => [r.condition, r.category || '', r.measure, formatPct(r.improvedPct), r.evaluableCount]));

        addSection('5. Pre vs Post Comparison (VAS)', ['Pain Level', 'Pre', 'Post'],
            program.vasBands.map(r => [r.band, r.pre, r.post]));

        addSection('6. District-wise Performance', ['District', 'Improved %', 'Evaluable Count'],
            program.districtPerformance.map(r => [r.district, formatPct(r.improvedPct), r.evaluableCount]));

        addSection('7. Monthly Trend', ['Month', 'Improvement %', 'Evaluable Count'],
            program.monthlyTrend.map(r => [formatMonthLabel(r.month), formatPct(r.improvedPct), r.evaluableCount]));

        addSection('8. Assessment Completion', ['Stage', 'Count', 'Percentage'],
            program.assessmentCompletion.map(r => [r.stage, r.count, formatPct(r.pct)]));

        addSection('9. Disability Profile', ['Category', 'Count', 'Percentage'],
            program.disabilityProfile.map(r => [r.category, r.count, formatPct(r.pct)]));

        addSection('Notes & Methodology', [], program.notes.map(n => [n]));

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        const rangeLabel = fromDate || toDate ? `_${fromDate || 'start'}_to_${toDate || 'end'}` : '';
        anchor.download = `Outcome_${scaleId}${rangeLabel}_${new Date().toISOString().split('T')[0]}.xlsx`;
        anchor.click();
        window.URL.revokeObjectURL(url);
        } finally {
            setIsExporting(false);
        }
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
                        disabled={rows.length === 0 || isLoading || isExporting}
                        className="flex items-center gap-2 shadow-lg shadow-primary/20"
                    >
                        {isExporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                        <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export Excel'}</span>
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
                    {isDisability && (
                        <Select
                            label="FIM Category"
                            name="fimCategory"
                            value={fimCategory}
                            onChange={(e) => setFimCategory(e.target.value as FimCategory)}
                            options={FIM_CATEGORIES.map(c => ({ value: c, label: c }))}
                        />
                    )}
                    <Select
                        label="Assessment Scale"
                        name="scale"
                        value={activeScale?.id || ''}
                        onChange={(e) => setScaleId(e.target.value)}
                        options={conditionScales.map(s => ({ value: s.id, label: s.label }))}
                    />
                    {!isDisability && <div />}
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
                        active={cardFilter === null}
                        onClick={() => setCardFilter(null)}
                    />
                    <SummaryCard
                        icon={<TrendingUp size={18} className="text-green-600" />}
                        label="Improved"
                        value={summary.improved}
                        sub={pct(summary.improved)}
                        accent="text-green-700"
                        bgAccent="bg-green-100"
                        active={cardFilter === 'improved'}
                        onClick={() => setCardFilter(f => f === 'improved' ? null : 'improved')}
                    />
                    <SummaryCard
                        icon={<TrendingDown size={18} className="text-red-600" />}
                        label="Declined"
                        value={summary.declined}
                        sub={pct(summary.declined)}
                        accent="text-red-700"
                        bgAccent="bg-red-100"
                        active={cardFilter === 'declined'}
                        onClick={() => setCardFilter(f => f === 'declined' ? null : 'declined')}
                    />
                    <SummaryCard
                        icon={<Minus size={18} className="text-amber-600" />}
                        label="Same"
                        value={summary.same}
                        sub={pct(summary.same)}
                        accent="text-amber-700"
                        bgAccent="bg-amber-100"
                        active={cardFilter === 'same'}
                        onClick={() => setCardFilter(f => f === 'same' ? null : 'same')}
                    />
                    {activeScale?.id === 'ei_outcome' && (
                        <SummaryCard
                            icon={<AlertTriangle size={18} className="text-purple-600" />}
                            label="Needs Referral"
                            value={summary.needs_referral}
                            accent="text-purple-700"
                            bgAccent="bg-purple-100"
                            active={cardFilter === 'needs_referral'}
                            onClick={() => setCardFilter(f => f === 'needs_referral' ? null : 'needs_referral')}
                        />
                    )}
                    <SummaryCard
                        icon={<ClipboardList size={18} className="text-gray-500" />}
                        label="Baseline Only"
                        value={summary.baseline_only}
                        accent="text-gray-600"
                        bgAccent="bg-gray-100"
                        active={cardFilter === 'baseline_only'}
                        onClick={() => setCardFilter(f => f === 'baseline_only' ? null : 'baseline_only')}
                    />
                    <SummaryCard
                        icon={<CheckCircle2 size={18} className="text-teal-600" />}
                        label="Endline Done"
                        value={rows.filter(r => r.current_date != null).length}
                        accent="text-teal-700"
                        bgAccent="bg-teal-100"
                        active={cardFilter === 'endline_completed'}
                        onClick={() => setCardFilter(f => f === 'endline_completed' ? null : 'endline_completed')}
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
                            {conditionScales.length === 0
                                ? 'No outcome scale is configured for this condition yet.'
                                : rows.length === 0
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
                                    <th className="py-4 font-bold text-[10px] uppercase text-gray-400 tracking-wider">Endline</th>
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
                        Baseline values come from the initial clinical assessment. Endline values come from the most recent
                        follow-up assessment within the selected date range (for VAS Pain, the post-treatment reading of that
                        visit). "Baseline Only" means no follow-up has been recorded in the selected period yet.
                    </p>
                </Card>
                <Card className="p-4 bg-blue-50/30 border-blue-100">
                    <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">Excel Export</h4>
                    <p className="text-[11px] text-blue-500 leading-relaxed">
                        Exports include 3 tabs: Summary and Consolidated for the selected scale/date range, plus one
                        Program Report tab covering every condition — Executive Summary, Overall Outcome Analysis,
                        Outcome by Condition, Improvement by Measure, Pre vs Post (VAS), District Performance,
                        Monthly Trend, Assessment Completion, Disability Profile, and Notes &amp; Methodology —
                        stacked as labeled sections on one sheet.
                    </p>
                </Card>
            </div>
        </div>
    );
}

function SummaryCard({ icon, label, value, sub, accent, bgAccent, active, onClick }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    sub?: string;
    accent: string;
    bgAccent: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-left w-full p-4 sm:p-5 rounded-2xl border shadow-sm min-w-0 transition-colors ${active
                ? 'bg-primary/5 border-primary/40 ring-2 ring-primary/20'
                : 'bg-white border-gray-100 hover:border-primary/20'
                }`}
        >
            <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 ${bgAccent} rounded-xl shrink-0`}>{icon}</div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-tight min-w-0 break-words">
                    {label}{active && label !== 'Total Patients' ? ' (Filtered)' : ''}
                </p>
            </div>
            <h3 className={`text-2xl font-black ${accent}`}>{value}</h3>
            {sub && <p className="text-[11px] text-gray-400 font-medium mt-0.5">{sub}</p>}
        </button>
    );
}
