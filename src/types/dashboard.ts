export type TimeFrame = 'daily' | 'monthly' | 'yearly' | 'all';

export interface ChartFilter {
    startDate: string;
    endDate: string;
    location?: string;
    busId?: string;
    donor?: string; // 'all' or a specific donor name; omitted/'all' means no donor scoping
}

export interface BeneficiaryChartData {
    date: string; // Formatting depends on timeframe (e.g., "2023-10-25", "Oct 2023", "2023")
    count: number;
    locationDetails?: Record<string, number>; // Optional breakdown by location for that period
}

export interface BusCoverageData {
    date: string;
    coveredLocationsCount: number;
    beneficiariesServed: number;
    totalDistance?: number;
    busDetails?: Record<string, number>; // Breakdown by bus if 'All' is selected
}

export interface DashboardStats {
    totalBeneficiaries: number;
    totalTrips: number;
    activeLocations: number;
}
