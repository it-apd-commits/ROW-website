import { supabase } from '@/lib/supabase';
import type { BeneficiaryChartData, BusCoverageData, ChartFilter, TimeFrame } from '@/types/dashboard';

export const UNSPECIFIED_DONOR = 'Unspecified';
export const normalizeDonor = (d: string | null | undefined): string => (d && d.trim() ? d.trim() : UNSPECIFIED_DONOR);

// True when a specific donor has been chosen (i.e. the filter isn't 'all'/unset).
const isDonorScoped = (filter: ChartFilter): boolean => !!filter.donor && filter.donor !== 'all';

// --- Helper for pagination ---
// Supabase caps selects at 1000 rows by default; page through .range()
// so stats aren't silently truncated on large tables.
export const fetchAllRows = async <T>(
    buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> }
): Promise<T[]> => {
    const PAGE_SIZE = 1000;
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const page = data ?? [];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
    }
    return rows;
};

// Maps a beneficiary's file_number AND id to its normalized donor, so a
// service_entries.file_number holding either value still resolves.
const fetchDonorByKey = async (): Promise<Map<string, string>> => {
    const rows = await fetchAllRows<{ id: string; file_number: string | null; donor: string | null }>(() =>
        supabase.from('beneficiaries').select('id, file_number, donor')
    );
    const map = new Map<string, string>();
    rows.forEach((b) => {
        const d = normalizeDonor(b.donor);
        if (b.file_number) map.set(b.file_number, d);
        if (b.id) map.set(b.id, d);
    });
    return map;
};

// --- Helper for aggregation ---
const formatDateKey = (dateStr: string, timeframe: TimeFrame): string => {
    const date = new Date(dateStr);
    if (timeframe === 'daily') {
        return date.toISOString().split('T')[0]; // "YYYY-MM-DD"
    } else if (timeframe === 'monthly' || timeframe === 'all') {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // "YYYY-MM"
    } else {
        return `${date.getFullYear()}`; // "YYYY"
    }
};

const getDisplayDate = (key: string, timeframe: TimeFrame): string => {
    if (timeframe === 'daily') return key;
    if (timeframe === 'monthly' || timeframe === 'all') {
        const [year, month] = key.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    return key;
};


// --- Beneficiary Service ---

export const fetchBeneficiaryStats = async (
    timeframe: TimeFrame,
    filter: ChartFilter
): Promise<BeneficiaryChartData[]> => {
    try {
        const data = await fetchAllRows<{ id: string; date_of_registration: string | null; district: string | null; city: string | null; donor: string | null }>(() => {
            let query = supabase
                .from('beneficiaries')
                .select('id, date_of_registration, district, city, donor');

            if (filter.startDate) {
                query = query.gte('date_of_registration', filter.startDate);
            }
            if (filter.endDate) {
                query = query.lte('date_of_registration', filter.endDate);
            }
            if (filter.location && filter.location !== 'All') {
                // Trying both district and city for flexibility
                query = query.or(`district.eq.${filter.location},city.eq.${filter.location}`);
            }

            return query;
        });

        const donorScoped = isDonorScoped(filter);

        // Aggregate Data
        const groupedData: Record<string, number> = {};

        data.forEach((item) => {
            if (!item.date_of_registration) return;
            if (donorScoped && normalizeDonor(item.donor) !== filter.donor) return;
            const key = formatDateKey(item.date_of_registration, timeframe);
            groupedData[key] = (groupedData[key] || 0) + 1;
        });

        // Transform to chart format and sort
        return Object.entries(groupedData)
            .map(([key, count]) => ({
                date: getDisplayDate(key, timeframe),
                rawDate: key, // for sorting
                count,
            }))
            .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
            .map(({ date, count }) => ({ date, count }));

    } catch (error) {
        console.error('Error fetching beneficiary stats:', error);
        return [];
    }
};

export interface GenderBreakdown {
    male: number;
    female: number;
    other: number;
    total: number;
}

export const fetchGenderBreakdown = async (filter: ChartFilter): Promise<GenderBreakdown> => {
    try {
        const rows = await fetchAllRows<{ gender: string | null; donor: string | null; date_of_registration: string | null }>(() => {
            let query = supabase.from('beneficiaries').select('gender, donor, date_of_registration');
            if (filter.startDate) query = query.gte('date_of_registration', filter.startDate);
            if (filter.endDate) query = query.lte('date_of_registration', filter.endDate);
            return query;
        });

        const donorScoped = isDonorScoped(filter);
        let totalCount = 0;
        let maleCount = 0;
        let femaleCount = 0;

        rows.forEach((r) => {
            if (donorScoped && normalizeDonor(r.donor) !== filter.donor) return;
            totalCount++;
            if (r.gender === 'Male') maleCount++;
            else if (r.gender === 'Female') femaleCount++;
        });

        // Anything not exactly 'Male'/'Female' (literal 'Other' selection, or blank/legacy import
        // values) is folded into a single 'Other' bucket rather than a query per possible value.
        const otherCount = Math.max(0, totalCount - maleCount - femaleCount);

        return { male: maleCount, female: femaleCount, other: otherCount, total: totalCount };
    } catch (error) {
        console.error('Error fetching gender breakdown:', error);
        return { male: 0, female: 0, other: 0, total: 0 };
    }
};

export const fetchUniqueLocations = async (): Promise<string[]> => {
    try {
        const { data, error } = await supabase
            .from('beneficiaries')
            .select('district')
            .not('district', 'is', null);

        if (error) throw error;

        const locations = Array.from(new Set(data?.map((d) => d.district).filter(Boolean) as string[]));
        return locations.sort();
    } catch (error) {
        console.error('Error fetching locations:', error);
        return [];
    }
};


// --- Bus Tracking Service ---

export const fetchBusCoverageStats = async (
    timeframe: TimeFrame,
    filter: ChartFilter
): Promise<BusCoverageData[]> => {
    try {
        let query = supabase
            .from('trips')
            .select('id, date, bus_number, location, final_distance, beneficiaries_served');

        // Trip table uses 'date' column
        if (filter.startDate) query = query.gte('date', filter.startDate);
        if (filter.endDate) query = query.lte('date', filter.endDate);
        if (filter.busId && filter.busId !== 'All') query = query.eq('bus_number', filter.busId);

        const { data, error } = await query;

        if (error) throw error;
        if (!data) return [];

        // Aggregate Data
        // We need: Date -> { locations: Set(), distance: sum, beneficiaries: sum }
        const groupedData: Record<string, { locations: Set<string>, distance: number, beneficiaries: number }> = {};

        data.forEach((trip) => {
            if (!trip.date) return;
            const key = formatDateKey(trip.date, timeframe);

            if (!groupedData[key]) {
                groupedData[key] = { locations: new Set(), distance: 0, beneficiaries: 0 };
            }

            if (trip.location) groupedData[key].locations.add(trip.location);
            groupedData[key].distance += (trip.final_distance || 0);
            groupedData[key].beneficiaries += (trip.beneficiaries_served || 0);
        });

        return Object.entries(groupedData)
            .map(([key, stats]) => ({
                date: getDisplayDate(key, timeframe),
                rawDate: key,
                coveredLocationsCount: stats.locations.size,
                beneficiariesServed: stats.beneficiaries,
                totalDistance: stats.distance
            }))
            .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
            .map(({ date, coveredLocationsCount, beneficiariesServed, totalDistance }) => ({
                date,
                coveredLocationsCount,
                beneficiariesServed,
                totalDistance
            }));

    } catch (error) {
        console.error('Error fetching bus stats:', error);
        return [];
    }
};

export const fetchUniqueBuses = async (): Promise<string[]> => {
    try {
        const { data, error } = await supabase
            .from('trips')
            .select('bus_number')
            .not('bus_number', 'is', null);

        if (error) throw error;

        const buses = Array.from(new Set(data?.map(t => t.bus_number).filter(Boolean) as string[]));
        return buses.sort();
    } catch (error) {
        console.error('Error fetching buses', error);
        return [];
    }
}

// --- Service Dashboard Service ---

export interface ServiceChartData {
    date: string;
    count: number;
}

export interface ServiceSummaryStats {
    totalServices: number;
    totalBeneficiaries: number;
    mostActiveService: string;
    avgServicesPerDay: number;
}

export const fetchServiceStats = async (
    timeframe: TimeFrame,
    filter: ChartFilter
): Promise<ServiceChartData[]> => {
    try {
        const donorScoped = isDonorScoped(filter);
        const [data, donorByKey] = await Promise.all([
            fetchAllRows<{ id: string; schedule_date: string | null; file_number: string | null }>(() => {
                let query = supabase
                    .from('service_entries')
                    .select('id, schedule_date, file_number');

                if (filter.startDate) query = query.gte('schedule_date', filter.startDate);
                if (filter.endDate) query = query.lte('schedule_date', filter.endDate);

                return query;
            }),
            donorScoped ? fetchDonorByKey() : Promise.resolve(null),
        ]);

        const groupedData: Record<string, number> = {};

        data.forEach((item) => {
            if (!item.schedule_date) return;
            if (donorScoped) {
                const d = (item.file_number && donorByKey!.get(item.file_number)) || 'Unknown';
                if (d !== filter.donor) return;
            }
            const key = formatDateKey(item.schedule_date, timeframe);
            groupedData[key] = (groupedData[key] || 0) + 1;
        });

        return Object.entries(groupedData)
            .map(([key, count]) => ({
                date: getDisplayDate(key, timeframe),
                rawDate: key,
                count,
            }))
            .sort((a, b) => a.rawDate.localeCompare(b.rawDate))
            .map(({ date, count }) => ({ date, count }));

    } catch (error) {
        console.error('Error fetching service stats:', error);
        return [];
    }
};

export const fetchServiceSummary = async (
    filter: ChartFilter
): Promise<ServiceSummaryStats> => {
    try {
        const donorScoped = isDonorScoped(filter);
        const [rawData, donorByKey] = await Promise.all([
            fetchAllRows<{ id: string; schedule_date: string | null; service_code: string; file_number: string | null }>(() => {
                let query = supabase
                    .from('service_entries')
                    .select('id, schedule_date, service_code, file_number');

                if (filter.startDate) query = query.gte('schedule_date', filter.startDate);
                if (filter.endDate) query = query.lte('schedule_date', filter.endDate);

                return query;
            }),
            donorScoped ? fetchDonorByKey() : Promise.resolve(null),
        ]);

        const data = donorScoped
            ? rawData.filter(s => ((s.file_number && donorByKey!.get(s.file_number)) || 'Unknown') === filter.donor)
            : rawData;

        if (data.length === 0) return {
            totalServices: 0,
            totalBeneficiaries: 0,
            mostActiveService: 'N/A',
            avgServicesPerDay: 0
        };

        const totalServices = data.length;
        const totalBeneficiaries = new Set(data.map(s => s.file_number)).size;

        // Find most active service
        const serviceCounts: Record<string, number> = {};
        data.forEach(s => {
            serviceCounts[s.service_code] = (serviceCounts[s.service_code] || 0) + 1;
        });
        const mostActiveService = Object.entries(serviceCounts)
            .sort((a, b) => b[1] - a[1])[0][0];

        // Average services per day
        const uniqueDays = new Set(data.map(s => s.schedule_date)).size;
        const avgServicesPerDay = Number((totalServices / (uniqueDays || 1)).toFixed(1));

        return {
            totalServices,
            totalBeneficiaries,
            mostActiveService,
            avgServicesPerDay
        };
    } catch (error) {
        console.error('Error fetching service summary:', error);
        return {
            totalServices: 0,
            totalBeneficiaries: 0,
            mostActiveService: 'Error',
            avgServicesPerDay: 0
        };
    }
};
