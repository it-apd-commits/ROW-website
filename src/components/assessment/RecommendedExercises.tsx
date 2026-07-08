import { useState, useEffect, useCallback, useRef } from 'react';
import { Card } from '@/components/common/Card';
import { exerciseService } from '@/services/exerciseService';
import type { Exercise, SelectedExercise } from '@/types/exercise';
import {
    Dumbbell,
    Check,
    Search,
    Filter,
    ImageIcon,
    Save,
    Loader2,
    X,
    Printer,
} from 'lucide-react';
import { EXERCISE_CATEGORIES } from '@/constants/exerciseConstants';

// Remembers whether the exercise sheet is enabled, so it stays off across visits
// and the user can scroll straight to Core Service Details below.
const ENABLED_STORAGE_KEY = 'row.recommendedExercises.enabled';

const readEnabledPref = (): boolean => {
    try {
        return localStorage.getItem(ENABLED_STORAGE_KEY) !== 'false';
    } catch {
        return true;
    }
};

// Map assessment condition names to exercise condition names
const CONDITION_MAP: Record<string, string> = {
    'Neuro Muscular Painful Condition': 'Pain',
    'Neurological Condition': 'Neuro',
    'Pulmonary Condition': 'Pulmonary',
    'Post Operative Condition': 'Post-Operative',
    'Disability': 'Disability',
    'Amputation': 'Amputation',
    'Early Intervention Assessment': 'Early Intervention',
};

interface Props {
    patientId: string;
    patientName?: string;
    condition: string;
}

export function RecommendedExercises({ patientId, patientName, condition }: Props) {
    const [exercises, setExercises] = useState<Exercise[]>([]);
    const [selected, setSelected] = useState<Map<number, SelectedExercise>>(new Map());
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [enabled, setEnabled] = useState<boolean>(readEnabledPref);
    const printRef = useRef<HTMLDivElement>(null);

    const toggleEnabled = () => {
        setEnabled(prev => {
            const next = !prev;
            try { localStorage.setItem(ENABLED_STORAGE_KEY, String(next)); } catch { /* ignore */ }
            return next;
        });
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Map condition name and load exercises
            const mappedCondition = CONDITION_MAP[condition] || condition;
            let available = await exerciseService.getByCondition(mappedCondition);

            // If no exercises found for condition, load all active exercises
            if (available.length === 0) {
                available = await exerciseService.getActive();
            }
            setExercises(available);

            // Load already recommended exercises for this patient
            const existing = await exerciseService.getPatientExercises(patientId);
            const map = new Map<number, SelectedExercise>();
            existing.forEach(rec => {
                if (rec.exercise) {
                    map.set(rec.exercise_id, {
                        exercise: rec.exercise,
                        times: rec.times || '',
                        repetitions: rec.repetitions || '',
                        sets: rec.sets || '',
                        hold: rec.hold || '',
                        notes: rec.notes || '',
                    });
                }
            });
            setSelected(map);
        } catch (err) {
            console.error('Failed to load exercises:', err);
            // Fallback: try loading all active exercises
            try {
                const all = await exerciseService.getActive();
                setExercises(all);
            } catch {
                console.error('Failed to load any exercises');
            }
        } finally {
            setLoading(false);
        }
    }, [patientId, condition]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const toggleExercise = (exercise: Exercise) => {
        const id = exercise.id!;
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.set(id, {
                    exercise,
                    times: '',
                    repetitions: '',
                    sets: '',
                    hold: '',
                    notes: '',
                });
            }
            return next;
        });
    };

    const updateExerciseField = (exerciseId: number, field: keyof Omit<SelectedExercise, 'exercise'>, value: string) => {
        setSelected(prev => {
            const next = new Map(prev);
            const item = next.get(exerciseId);
            if (item) {
                next.set(exerciseId, { ...item, [field]: value });
            }
            return next;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const exerciseList = Array.from(selected.values());
            await exerciseService.savePatientExercises(patientId, exerciseList);
            alert('Recommended exercises saved successfully!');
        } catch (err) {
            console.error('Save error:', err);
            alert('Failed to save recommended exercises.');
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = () => {
        const selectedExercises = Array.from(selected.values());
        if (selectedExercises.length === 0) {
            alert('Please select at least one exercise to print.');
            return;
        }

        const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const name = patientName || patientId;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            alert('Please allow popups to print.');
            return;
        }

        const exerciseCards = selectedExercises.map(sel => `
            <div style="border: 1px solid #d4d4d4; border-radius: 8px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; display: flex; gap: 16px; align-items: flex-start;">
                ${sel.exercise.thumbnail_url
                    ? `<img src="${sel.exercise.thumbnail_url}" style="width: 140px; height: 110px; object-fit: cover; border-radius: 8px; flex-shrink: 0;" />`
                    : `<div style="width: 140px; height: 110px; background: #f3f4f6; border-radius: 8px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: #9ca3af; font-size: 12px;">No Image</div>`
                }
                <div style="flex: 1;">
                    <h3 style="margin: 0 0 2px 0; font-size: 15px; font-weight: 700; color: #1a1a1a;">${sel.exercise.name}</h3>
                    <p style="margin: 0 0 8px 0; font-size: 11px; color: #059669; font-weight: 600;">${sel.exercise.heading}</p>
                    <p style="margin: 0 0 12px 0; font-size: 13px; color: #4b5563; line-height: 1.5;">${sel.exercise.description}</p>
                    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <div>
                            <span style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Times</span>
                            <div style="border-bottom: 2px solid #000; min-width: 70px; padding: 2px 0; font-size: 14px; font-weight: 600; margin-top: 2px;">${sel.times || '____'}</div>
                        </div>
                        <div>
                            <span style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Repetition</span>
                            <div style="border-bottom: 2px solid #000; min-width: 70px; padding: 2px 0; font-size: 14px; font-weight: 600; margin-top: 2px;">${sel.repetitions || '____'}</div>
                        </div>
                        <div>
                            <span style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Set</span>
                            <div style="border-bottom: 2px solid #000; min-width: 80px; padding: 2px 0; font-size: 14px; font-weight: 600; margin-top: 2px;">${sel.sets || '____'}</div>
                        </div>
                        <div>
                            <span style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Hold</span>
                            <div style="border-bottom: 2px solid #000; min-width: 80px; padding: 2px 0; font-size: 14px; font-weight: 600; margin-top: 2px;">${sel.hold || '____'}</div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Recommended Exercises - ${name}</title>
                <style>
                    @media print {
                        body { margin: 0; padding: 20px; }
                        .no-print { display: none !important; }
                    }
                    body {
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                        padding: 24px;
                        color: #1a1a1a;
                        max-width: 800px;
                        margin: 0 auto;
                    }
                </style>
            </head>
            <body>
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; border-bottom: 3px solid #059669; padding-bottom: 16px;">
                    <div style="flex: 1;">
                        <h1 style="margin: 0; font-size: 22px; color: #1a1a1a; font-weight: 800; line-height: 1.2;">The Association of People with Disability</h1>
                        <p style="margin: 6px 0 0 0; font-size: 11px; color: #4b5563; line-height: 1.4;">6th Cross Road, Horamavu Agara Road, Off, Hutchins Rd, St Thomas Town, Lingarajapuram, Bengaluru, Karnataka 560084</p>
                        <p style="margin: 6px 0 0 0; font-size: 14px; color: #059669; font-weight: 600;">Recommended Exercises</p>
                    </div>
                    <img src="${window.location.origin}/logo.jpg" alt="APD Logo" style="height: 80px; width: auto; flex-shrink: 0;" />
                </div>

                <div style="display: flex; justify-content: space-between; margin-bottom: 20px; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
                    <div>
                        <span style="font-size: 12px; color: #6b7280; font-weight: 600;">Patient Name</span>
                        <div style="font-size: 15px; font-weight: 700; margin-top: 2px;">${name}</div>
                    </div>
                    <div>
                        <span style="font-size: 12px; color: #6b7280; font-weight: 600;">Patient ID</span>
                        <div style="font-size: 15px; font-weight: 700; margin-top: 2px;">${patientId}</div>
                    </div>
                    <div>
                        <span style="font-size: 12px; color: #6b7280; font-weight: 600;">Date</span>
                        <div style="font-size: 15px; font-weight: 700; margin-top: 2px;">${today}</div>
                    </div>
                    <div>
                        <span style="font-size: 12px; color: #6b7280; font-weight: 600;">Condition</span>
                        <div style="font-size: 15px; font-weight: 700; margin-top: 2px;">${condition}</div>
                    </div>
                </div>

                ${exerciseCards}

                <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
                    <p style="font-size: 11px; color: #9ca3af; text-align: center;">Rehab on Wheels (ROW) - Recommended Exercise Sheet</p>
                </div>

                <button class="no-print" onclick="window.print()" style="position: fixed; bottom: 20px; right: 20px; background: #059669; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Print / Save PDF
                </button>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    const filtered = exercises.filter(ex => {
        const matchesSearch = !searchQuery ||
            ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ex.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = !filterCategory || ex.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    // Group by category
    const grouped: Record<string, Exercise[]> = {};
    filtered.forEach(ex => {
        if (!grouped[ex.category]) grouped[ex.category] = [];
        grouped[ex.category].push(ex);
    });

    const selectedCount = selected.size;

    return (
        <Card>
            {/* Section Header with enable/disable toggle */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                <div className="flex items-center gap-2">
                    <Dumbbell size={18} className="text-emerald-600" />
                    <h3 className="font-semibold text-text-main">Recommended Exercises</h3>
                    {enabled && selectedCount > 0 && (
                        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                            {selectedCount} selected
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2.5">
                    <span className={`text-xs font-semibold ${enabled ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {enabled ? 'On' : 'Off'}
                    </span>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label="Toggle recommended exercises"
                        onClick={toggleEnabled}
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-300 ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </div>

            {!enabled && (
                <p className="text-sm text-text-muted">Exercise sheet is off — turn it on to recommend exercises.</p>
            )}

            {enabled && (
                <>
                    {loading ? (
                        <div className="text-center py-8 text-text-muted">
                            <Loader2 className="animate-spin mx-auto mb-2" size={24} />
                            Loading exercises...
                        </div>
                    ) : exercises.length === 0 ? (
                        <div className="text-center py-8">
                            <Dumbbell className="mx-auto text-gray-300 mb-2" size={36} />
                            <p className="text-text-muted text-sm">No exercises available.</p>
                            <p className="text-xs text-gray-400 mt-1">Add exercises from the Exercise Library page first.</p>
                        </div>
                    ) : (
                        <div ref={printRef}>
                            {/* Search & Filter */}
                            <div className="flex flex-col sm:flex-row gap-2 mb-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                                    <input
                                        type="text"
                                        placeholder="Search exercises..."
                                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="relative">
                                    <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <select
                                        className="pl-8 pr-4 py-2 border border-gray-200 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
                                        value={filterCategory}
                                        onChange={e => setFilterCategory(e.target.value)}
                                    >
                                        <option value="">All Categories</option>
                                        {EXERCISE_CATEGORIES.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Exercise Cards */}
                            {Object.entries(grouped).map(([category, items]) => (
                                <div key={category} className="mb-5">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                        <Dumbbell size={12} />
                                        {category}
                                    </h4>
                                    <div className="space-y-3">
                                        {items.map(exercise => {
                                            const isSelected = selected.has(exercise.id!);
                                            const selData = selected.get(exercise.id!);
                                            return (
                                                <div
                                                    key={exercise.id}
                                                    className={`rounded-xl border-2 transition-all overflow-hidden ${
                                                        isSelected
                                                            ? 'border-emerald-400 bg-emerald-50/30 shadow-sm'
                                                            : 'border-gray-200 bg-white hover:border-gray-300'
                                                    }`}
                                                >
                                                    {/* Exercise Card */}
                                                    <div
                                                        className="flex gap-4 p-4 cursor-pointer"
                                                        onClick={() => toggleExercise(exercise)}
                                                    >
                                                        {/* Thumbnail / Illustration */}
                                                        <div className="shrink-0 w-28 h-24 md:w-36 md:h-28 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                                                            {exercise.thumbnail_url ? (
                                                                <img
                                                                    src={exercise.thumbnail_url}
                                                                    alt={exercise.name}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            ) : (
                                                                <ImageIcon size={28} className="text-gray-300" />
                                                            )}
                                                        </div>

                                                        {/* Content */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <div>
                                                                    <h4 className="font-semibold text-text-main text-sm md:text-base">
                                                                        {exercise.name}
                                                                    </h4>
                                                                    <p className="text-xs text-emerald-600 font-medium">
                                                                        {exercise.heading}
                                                                    </p>
                                                                </div>
                                                                {/* Select Indicator */}
                                                                <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                                                    isSelected
                                                                        ? 'bg-emerald-500 border-emerald-500'
                                                                        : 'border-gray-300'
                                                                }`}>
                                                                    {isSelected && <Check size={14} className="text-white" />}
                                                                </div>
                                                            </div>
                                                            <p className="text-xs md:text-sm text-text-muted mt-1.5 leading-relaxed line-clamp-2">
                                                                {exercise.description}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* Rep / Set / Hold - shown when selected */}
                                                    {isSelected && selData && (
                                                        <div className="px-4 pb-4 pt-0">
                                                            <div className="bg-white rounded-lg border border-emerald-200 p-3">
                                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                                    <div>
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                                                            Times
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="e.g., 10"
                                                                            value={selData.times}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onChange={e => updateExerciseField(exercise.id!, 'times', e.target.value)}
                                                                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                                                            Repetition
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="e.g., 2"
                                                                            value={selData.repetitions}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onChange={e => updateExerciseField(exercise.id!, 'repetitions', e.target.value)}
                                                                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                                                            Set
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="e.g., 3"
                                                                            value={selData.sets}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onChange={e => updateExerciseField(exercise.id!, 'sets', e.target.value)}
                                                                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                                                                            Hold
                                                                        </label>
                                                                        <input
                                                                            type="text"
                                                                            placeholder="e.g., 5 sec"
                                                                            value={selData.hold}
                                                                            onClick={e => e.stopPropagation()}
                                                                            onChange={e => updateExerciseField(exercise.id!, 'hold', e.target.value)}
                                                                            className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-center focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {filtered.length === 0 && (
                                <div className="text-center py-6 text-text-muted text-sm">
                                    No exercises match your search.
                                </div>
                            )}

                            {/* Selected Summary, Save & Print */}
                            {selectedCount > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-medium text-text-main">
                                                {selectedCount} exercise{selectedCount > 1 ? 's' : ''} selected
                                            </p>
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                {Array.from(selected.values()).map(sel => (
                                                    <span
                                                        key={sel.exercise.id}
                                                        className="inline-flex items-center gap-1 text-[11px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full"
                                                    >
                                                        {sel.exercise.name}
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleExercise(sel.exercise)}
                                                            className="hover:text-red-500"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={handlePrint}
                                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                            >
                                                <Printer size={14} /> Print PDF
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSave}
                                                disabled={saving}
                                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                                            >
                                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                                {saving ? 'Saving...' : 'Save Exercises'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </Card>
    );
}
