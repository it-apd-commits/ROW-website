// Single source of truth for the bus fleet. Used by the Trip Entry form,
// the Calendar bus filter, and schedule bulk-upload validation.
export const BUSES = ['BUS ABB', 'BUS Juniper', 'BUS Brigade'] as const;

export type BusNumber = (typeof BUSES)[number];

export const DEFAULT_BUS: BusNumber = 'BUS ABB';

export const BUS_OPTIONS = BUSES.map(bus => ({ value: bus, label: bus }));

// Distinct badge color per bus for the "All Buses" calendar view.
export const BUS_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
    'BUS ABB': { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    'BUS Juniper': { bg: 'bg-teal-100', text: 'text-teal-700' },
    'BUS Brigade': { bg: 'bg-amber-100', text: 'text-amber-700' },
};

/**
 * Match a free-text bus value (from an Excel/CSV upload) to a known bus.
 * Accepts case-insensitive names with or without the "BUS " prefix
 * (e.g. "abb", "Bus Brigade", "JUNIPER"). Returns null when unknown.
 */
export function normalizeBusName(raw: unknown): BusNumber | null {
    if (raw == null) return null;
    const cleaned = String(raw).trim().toLowerCase().replace(/^bus\s+/, '');
    const match = BUSES.find(bus => bus.toLowerCase().replace(/^bus\s+/, '') === cleaned);
    return match ?? null;
}
