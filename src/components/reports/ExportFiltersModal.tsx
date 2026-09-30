import { useState, useMemo } from 'react';
import { X, Download, Loader2, ChevronDown, Info } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Input } from '@/components/common/Input';
import { getAllScales, getScalesByCondition } from '@/config/outcomeScales';
import { isDisabilityCondition } from '@/utils/assessmentLogic';
import { FIM_LOCOMOTION_ITEMS, FIM_MOBILITY_ITEMS } from '@/constants/assessmentDropdowns';

// Mirrors the on-screen Filters card: Disability's scales split into
// Locomotion/Mobility, so picking a Disability condition here needs the same
// FIM Category selector to narrow the Assessment Scale list accordingly.
const FIM_CATEGORIES = ['Locomotion', 'Mobility'] as const;
type FimCategory = typeof FIM_CATEGORIES[number];
const FIM_LOCOMOTION_KEYS: string[] = FIM_LOCOMOTION_ITEMS.map(i => i.key);
const FIM_MOBILITY_KEYS: string[] = FIM_MOBILITY_ITEMS.map(i => i.key);

export interface ExportFilters {
    condition: string;
    scaleId: string;
    fromDate: string;
    toDate: string;
    search: string;
    donor: string;
}

interface ExportFiltersModalProps {
    isOpen: boolean;
    isExporting: boolean;
    conditions: string[];
    donors: string[];
    onClose: () => void;
    onExport: (filters: ExportFilters) => void;
}

const EMPTY_FILTERS: ExportFilters = { condition: '', scaleId: '', fromDate: '', toDate: '', search: '', donor: '' };

export function ExportFiltersModal({ isOpen, isExporting, conditions, donors, onClose, onExport }: ExportFiltersModalProps) {
    const [filters, setFilters] = useState<ExportFilters>(EMPTY_FILTERS);
    const [fimCategory, setFimCategory] = useState<FimCategory>('Locomotion');

    const isDisability = isDisabilityCondition(filters.condition);

    // Scale choices depend on the Condition (and, for Disability, FIM
    // Category) picked here — mirrors the on-screen Filters card, but kept
    // independent of it (this popup doesn't inherit whatever Condition/Scale
    // is selected on screen).
    const scaleOptions = useMemo(() => {
        if (!filters.condition) return getAllScales();
        if (isDisability) {
            return getScalesByCondition('Disability').filter(s =>
                (fimCategory === 'Locomotion' ? FIM_LOCOMOTION_KEYS : FIM_MOBILITY_KEYS).includes(s.id));
        }
        return getScalesByCondition(filters.condition);
    }, [filters.condition, isDisability, fimCategory]);

    if (!isOpen) return null;

    const hasFilters = Boolean(filters.condition || filters.scaleId || filters.fromDate || filters.toDate || filters.search.trim() || filters.donor);

    const handleClose = () => {
        setFilters(EMPTY_FILTERS);
        setFimCategory('Locomotion');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <Card className="w-full max-w-lg shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Export Excel — Filters</h2>
                    <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-5">
                    <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex gap-2.5 text-xs text-blue-700">
                        <Info size={16} className="shrink-0 mt-0.5" />
                        <p>Leave every field blank to export the full program-wide report (every condition, every scale, all-time). Set any filter below to export just that slice instead.</p>
                    </div>

                    <div className="flex flex-col gap-1 w-full">
                        <label className="text-sm font-medium text-text-main">Condition</label>
                        <div className="relative">
                            <select
                                className="w-full px-3 py-2.5 border rounded-lg appearance-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border-gray-300"
                                value={filters.condition}
                                onChange={(e) => setFilters(f => ({ ...f, condition: e.target.value, scaleId: '' }))}
                            >
                                <option value="">All Conditions</option>
                                {conditions.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                    </div>

                    {isDisability && (
                        <div className="flex flex-col gap-1 w-full">
                            <label className="text-sm font-medium text-text-main">FIM Category</label>
                            <div className="relative">
                                <select
                                    className="w-full px-3 py-2.5 border rounded-lg appearance-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border-gray-300"
                                    value={fimCategory}
                                    onChange={(e) => { setFimCategory(e.target.value as FimCategory); setFilters(f => ({ ...f, scaleId: '' })); }}
                                >
                                    {FIM_CATEGORIES.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-1 w-full">
                        <label className="text-sm font-medium text-text-main">Assessment Scale</label>
                        <div className="relative">
                            <select
                                className="w-full px-3 py-2.5 border rounded-lg appearance-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border-gray-300"
                                value={filters.scaleId}
                                onChange={(e) => setFilters(f => ({ ...f, scaleId: e.target.value }))}
                            >
                                <option value="">All Scales</option>
                                {scaleOptions.map(s => (
                                    <option key={s.id} value={s.id}>{s.label}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                        <p className="text-xs text-text-muted italic">Only narrows the Consolidated and Improvement by Outcome Measure tables — Executive Summary and Outcome Analysis still use each condition's primary measure.</p>
                    </div>

                    <div className="flex flex-col gap-1 w-full">
                        <label className="text-sm font-medium text-text-main">Donor</label>
                        <div className="relative">
                            <select
                                className="w-full px-3 py-2.5 border rounded-lg appearance-none bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary border-gray-300"
                                value={filters.donor}
                                onChange={(e) => setFilters(f => ({ ...f, donor: e.target.value }))}
                            >
                                <option value="">All Donors</option>
                                {donors.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Input
                            label="From Date (Follow-up)"
                            type="date"
                            value={filters.fromDate}
                            onChange={(e) => setFilters(f => ({ ...f, fromDate: e.target.value }))}
                        />
                        <Input
                            label="To Date (Follow-up)"
                            type="date"
                            value={filters.toDate}
                            onChange={(e) => setFilters(f => ({ ...f, toDate: e.target.value }))}
                        />
                    </div>

                    <Input
                        label="Search (Name or Patient ID)"
                        placeholder="Optional"
                        value={filters.search}
                        onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                    />
                </div>

                <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50/50 rounded-b-2xl">
                    <Button variant="outline" onClick={handleClose} disabled={isExporting}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => onExport(filters)}
                        disabled={isExporting}
                        className="flex items-center gap-2"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {isExporting ? 'Exporting...' : hasFilters ? 'Export Filtered Data' : 'Export Full Report'}
                    </Button>
                </div>
            </Card>
        </div>
    );
}
