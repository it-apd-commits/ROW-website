import {
    Users,
    Bus,
    MapPin,
    TrendingUp,
    Stethoscope,
    ArrowUpRight,
    ArrowRight,
    Filter
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';

import { Link } from 'react-router-dom';
import { BeneficiaryRegistrationChart } from '@/components/dashboard/BeneficiaryRegistrationChart';
import { ServiceDashboardChart } from '@/components/dashboard/ServiceDashboardChart';
import { AssessmentVsReassessmentChart } from '@/components/dashboard/AssessmentVsReassessmentChart';
import { DonorBreakdownTable } from '@/components/dashboard/DonorBreakdownTable';
import { GenderBreakdownChart } from '@/components/dashboard/GenderBreakdownChart';
import type { DonorBreakdownRow } from '@/components/dashboard/DonorBreakdownTable';
import type { TimeFrame, ChartFilter } from '@/types/dashboard';
import { normalizeDonor, fetchAllRows } from '@/services/dashboardService';


interface MappedCamp {
    location: string;
    date: string;
    type: string;
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export function DashboardPage() {
    const [isLoading, setIsLoading] = useState(true);
    const [dynamicStats, setDynamicStats] = useState({
        totalBeneficiaries: 0,
        activeBuses: 0,
        campsConducted: 0,
        servicesProvided: 0
    });

    const [upcomingCamps, setUpcomingCamps] = useState<MappedCamp[]>([]);

    // Donor breakdown + filter state
    const [donorBreakdown, setDonorBreakdown] = useState<DonorBreakdownRow[]>([]);
    const [donorFilter, setDonorFilter] = useState<string>('all');

    // Global Filter State
    const [timeframe, setTimeframe] = useState<TimeFrame>('all');
    const [globalFilter, setGlobalFilter] = useState<ChartFilter>({
        startDate: '',
        endDate: '',
    });

    // Helper to set dates based on timeframe
    const handleTimeframeChange = (t: TimeFrame) => {
        setTimeframe(t);
        // Format LOCAL date parts (toISOString shifts to UTC, which is the previous day in IST)
        const formatLocalDate = (d: Date) =>
            `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const today = new Date();
        let start = '';
        const end = formatLocalDate(today);

        if (t === 'daily') {
            start = end;
        } else if (t === 'monthly') {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            start = formatLocalDate(firstDay);
        } else if (t === 'yearly') {
            const firstDayYear = new Date(today.getFullYear(), 0, 1);
            start = formatLocalDate(firstDayYear);
        } else {
            // 'all'
            start = '';
            setGlobalFilter({ startDate: '', endDate: '' });
            return;
        }
        setGlobalFilter({ ...globalFilter, startDate: start, endDate: end });
    };

    const fetchDashboardData = useCallback(() => {
        const run = async () => {
            setIsLoading(true);
            try {
                // Build filtered queries
                let bQuery = supabase
                    .from('beneficiaries')
                    .select('*', { count: 'exact', head: true });
                if (globalFilter.startDate) bQuery = bQuery.gte('date_of_registration', globalFilter.startDate);
                if (globalFilter.endDate) bQuery = bQuery.lte('date_of_registration', globalFilter.endDate);

                let tQuery = supabase.from('trips').select('bus_number');
                if (globalFilter.startDate) tQuery = tQuery.gte('date', globalFilter.startDate);
                if (globalFilter.endDate) tQuery = tQuery.lte('date', globalFilter.endDate);

                let sQuery = supabase
                    .from('service_entries')
                    .select('*', { count: 'exact', head: true });
                if (globalFilter.startDate) sQuery = sQuery.gte('schedule_date', globalFilter.startDate);
                if (globalFilter.endDate) sQuery = sQuery.lte('schedule_date', globalFilter.endDate);

                // Donor rows — fetch ALL beneficiaries (no date filter) so the
                // service→donor map is complete even when a date range is applied;
                // beneficiary counts are date-filtered in JS below.
                // Paginated via fetchAllRows: a single .range() request is still
                // capped at Supabase's default 1000-row limit regardless of the
                // bounds passed, which was silently truncating this once the
                // beneficiaries table passed 1000 rows.
                const bRowsPromise = fetchAllRows<{ id: string; file_number: string | null; donor: string | null; date_of_registration: string | null }>(() =>
                    supabase.from('beneficiaries').select('id, file_number, donor, date_of_registration')
                );

                // Services for donor attribution — date-filtered on schedule_date.
                const sRowsPromise = fetchAllRows<{ file_number: string | null }>(() => {
                    let q = supabase.from('service_entries').select('file_number');
                    if (globalFilter.startDate) q = q.gte('schedule_date', globalFilter.startDate);
                    if (globalFilter.endDate) q = q.lte('schedule_date', globalFilter.endDate);
                    return q;
                });

                const todayStr = new Date().toISOString().split('T')[0];

                // Run queries in parallel
                const [
                    { count: beneficiaryCount, error: bError },
                    { data: trips, error: tError },
                    { count: servicesCount, error: srvError },
                    { data: schedules, error: sError },
                    benList,
                    srvList,
                ] = await Promise.all([
                    bQuery,
                    tQuery,
                    sQuery,
                    supabase
                        .from('monthly_schedules')
                        .select('location_name, scheduled_date, status')
                        .eq('is_active', true)
                        .gte('scheduled_date', todayStr)
                        .order('scheduled_date', { ascending: true })
                        .limit(10),
                    bRowsPromise,
                    sRowsPromise,
                ]);

                if (bError) throw bError;
                if (tError) throw tError;
                if (srvError) throw srvError;
                if (sError) throw sError;

                // ---- Donor breakdown computation ----

                // Map every beneficiary key (file_number AND id) to its donor, so a
                // service_entry.file_number that holds either value still resolves.
                const donorByKey = new Map<string, string>();
                benList.forEach(b => {
                    const d = normalizeDonor(b.donor);
                    if (b.file_number) donorByKey.set(b.file_number, d);
                    if (b.id) donorByKey.set(b.id, d);
                });

                const inRange = (date: string | null): boolean => {
                    if (!date) return false;
                    if (globalFilter.startDate && date < globalFilter.startDate) return false;
                    if (globalFilter.endDate && date > globalFilter.endDate) return false;
                    return true;
                };

                const benByDonor: Record<string, number> = {};
                benList.forEach(b => {
                    if (!inRange(b.date_of_registration)) return;
                    const d = normalizeDonor(b.donor);
                    benByDonor[d] = (benByDonor[d] || 0) + 1;
                });

                const srvByDonor: Record<string, number> = {};
                srvList.forEach(s => {
                    const d = (s.file_number && donorByKey.get(s.file_number)) || 'Unknown';
                    srvByDonor[d] = (srvByDonor[d] || 0) + 1;
                });

                const allDonorKeys = Array.from(new Set([...Object.keys(benByDonor), ...Object.keys(srvByDonor)]));
                const breakdown: DonorBreakdownRow[] = allDonorKeys
                    .map(d => ({ donor: d, beneficiaries: benByDonor[d] || 0, services: srvByDonor[d] || 0 }))
                    .filter(r => r.beneficiaries > 0 || r.services > 0)
                    .sort((a, b) => b.beneficiaries - a.beneficiaries || b.services - a.services);

                setDonorBreakdown(breakdown);

                const uniqueBuses = trips ? new Set(trips.map(t => t.bus_number)).size : 0;
                const campsConducted = trips ? trips.length : 0;

                setDynamicStats({
                    totalBeneficiaries: beneficiaryCount || 0,
                    activeBuses: uniqueBuses,
                    campsConducted,
                    servicesProvided: servicesCount || 0,
                });

                if (schedules) {
                    const upcomingList = schedules.slice(0, 4);
                    const mappedCamps: MappedCamp[] = upcomingList.map(camp => ({
                        location: camp.location_name,
                        date: new Date(camp.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
                        type: camp.status === 'completed' ? 'Completed' : 'Screening Camp',
                    }));
                    setUpcomingCamps(mappedCamps);
                }

            } catch (err) {
                console.error('Error fetching dashboard stats:', err);
            } finally {
                setIsLoading(false);
            }
        };

        run();
    }, [globalFilter]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // Live refresh: refetch whenever beneficiaries/services/trips/schedules
    // change on another device, or when this tab regains focus, so the stat
    // boxes don't go stale between page loads.
    useRealtimeSync({
        tables: ['beneficiaries', 'service_entries', 'trips', 'monthly_schedules'],
        onChange: fetchDashboardData,
    });

    // If the selected donor no longer appears (e.g. after a date-range change), reset to All.
    useEffect(() => {
        if (donorFilter !== 'all' && !donorBreakdown.some(r => r.donor === donorFilter)) {
            setDonorFilter('all');
        }
    }, [donorBreakdown, donorFilter]);

    // Filter passed to every chart/box so donor scoping applies dashboard-wide.
    // Memoized so an unrelated re-render (e.g. isLoading toggling) doesn't create
    // a new object identity and trigger every chart's fetch effect needlessly.
    const chartFilter = useMemo<ChartFilter>(
        () => ({ ...globalFilter, donor: donorFilter }),
        [globalFilter, donorFilter]
    );

    // Donor dropdown options (real donors only) + the donor-scoped card values.
    const donorOptions = donorBreakdown.map(r => r.donor).filter(d => d !== 'Unknown');
    const selectedDonorRow = donorFilter !== 'all' ? donorBreakdown.find(r => r.donor === donorFilter) : null;
    const isDonorScoped = donorFilter !== 'all';
    const displayedBeneficiaries = isDonorScoped ? (selectedDonorRow?.beneficiaries ?? 0) : dynamicStats.totalBeneficiaries;
    const displayedServices = isDonorScoped ? (selectedDonorRow?.services ?? 0) : dynamicStats.servicesProvided;

    const stats = [
        {
            label: isDonorScoped ? `Beneficiaries · ${donorFilter}` : 'Total Beneficiaries',
            value: displayedBeneficiaries.toLocaleString(),
            icon: Users,
            change: '+0%',
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            link: isDonorScoped ? `/beneficiary/list?donor=${encodeURIComponent(donorFilter)}` : '/beneficiary/list'
        },
        {
            label: 'Active Buses',
            value: dynamicStats.activeBuses.toString(),
            icon: Bus,
            change: 'Online',
            color: 'text-green-600',
            bg: 'bg-green-50',
            link: '/tracking'
        },
        {
            label: 'Camps Conducted',
            value: dynamicStats.campsConducted.toString(),
            icon: MapPin,
            change: 'Lifetime',
            color: 'text-purple-600',
            bg: 'bg-purple-50',
            link: '/tracking/history'
        },
        {
            label: isDonorScoped ? `Services · ${donorFilter}` : 'Services Provided',
            value: displayedServices.toLocaleString(),
            icon: Stethoscope,
            change: 'Lifetime',
            color: 'text-orange-600',
            bg: 'bg-orange-50',
            link: '/services/history'
        },
    ];

    return (
        <div className="space-y-4 md:space-y-6 animate-in fade-in duration-500">
            {/* Global Filters Section */}
            <Card className="p-4 bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <Filter size={18} className="text-gray-400" />
                        <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Filters</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                        {/* Donor Filter */}
                        <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                            <span className="text-[11px] font-bold text-gray-400 uppercase">Donor</span>
                            <select
                                value={donorFilter}
                                onChange={(e) => setDonorFilter(e.target.value)}
                                className="bg-transparent border-none p-0 text-xs font-semibold focus:ring-0 cursor-pointer"
                            >
                                <option value="all">All Donors</option>
                                {donorOptions.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                ))}
                            </select>
                        </div>

                        {/* Timeframe Presets */}
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {(['daily', 'monthly', 'yearly', 'all'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => handleTimeframeChange(t)}
                                    className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${timeframe === t
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                        }`}
                                >
                                    {t === 'daily' ? 'Day Wise' : t === 'monthly' ? 'Month Wise' : t === 'yearly' ? 'Year Wise' : 'Whole Data'}
                                </button>
                            ))}
                        </div>

                        {/* Custom Date Range Picker */}
                        <div className="flex flex-wrap items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-gray-400 uppercase">From</span>
                                <input
                                    type="date"
                                    value={globalFilter.startDate}
                                    onChange={(e) => setGlobalFilter({ ...globalFilter, startDate: e.target.value })}
                                    className="bg-transparent border-none p-0 text-xs font-semibold focus:ring-0"
                                />
                            </div>
                            <span className="text-gray-300">|</span>
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-gray-400 uppercase">To</span>
                                <input
                                    type="date"
                                    value={globalFilter.endDate}
                                    onChange={(e) => setGlobalFilter({ ...globalFilter, endDate: e.target.value })}
                                    className="bg-transparent border-none p-0 text-xs font-semibold focus:ring-0"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </Card>

            {/* Header Section (Removed extra select date button as we have global filter) */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main">Dashboard Overview</h1>
                    <p className="text-text-muted">Welcome back, Admin. Here's what's happening today.</p>
                </div>

            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, index) => (
                    <Link key={index} to={stat.link} className="block group">
                        <Card className="p-4 border-l-4 border-l-primary hover:shadow-lg transition-all duration-300 group-hover:-translate-y-1 cursor-pointer h-full">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-sm font-medium text-text-muted mb-1 group-hover:text-primary transition-colors">{stat.label}</p>
                                    {isLoading ? (
                                        <div className="h-8 w-24 bg-gray-100 animate-pulse rounded"></div>
                                    ) : (
                                        <h3 className="text-2xl font-bold text-text-main">{stat.value}</h3>
                                    )}
                                </div>
                                <div className={`p-2 rounded-lg ${stat.bg} group-hover:scale-110 transition-transform`}>
                                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                                </div>
                            </div>
                            <div className="mt-4 flex items-center justify-between">
                                <div className="flex items-center text-xs font-medium text-green-600">
                                    <TrendingUp size={14} className="mr-1" />
                                    {stat.change}
                                    <span className="text-text-muted ml-2 font-normal">vs last month</span>
                                </div>
                                <ArrowRight size={14} className="text-primary opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                            </div>
                        </Card>
                    </Link>
                ))}
            </div>


            {/* Main Content Areas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                {/* Charts Area */}
                <div className="lg:col-span-2 space-y-4 md:space-y-6">
                    <BeneficiaryRegistrationChart timeframe={timeframe} filter={chartFilter} />
                    <ServiceDashboardChart timeframe={timeframe} filter={chartFilter} />
                    <AssessmentVsReassessmentChart filter={chartFilter} />
                </div>

                {/* Side Panel: Donor Breakdown + Scheduled Camps */}
                <div className="space-y-4 md:space-y-6">
                    <GenderBreakdownChart filter={chartFilter} />
                    <DonorBreakdownTable rows={donorBreakdown} isLoading={isLoading} selectedDonor={donorFilter} />

                    <Card>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-lg text-text-main">Upcoming Camps</h3>
                            <Link to="/tracking#upcoming-camps" className="text-xs text-primary font-medium hover:underline flex items-center">
                                View All <ArrowUpRight size={12} className="ml-1" />
                            </Link>
                        </div>
                        <div className="space-y-4">
                            {upcomingCamps.map((camp: MappedCamp, i: number) => (
                                <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100 cursor-pointer">
                                    <div className="flex flex-col items-center justify-center w-12 h-12 bg-primary/10 text-primary rounded-lg shrink-0">
                                        <span className="text-xs font-bold">{camp.date.split(' ')[0]}</span>
                                        <span className="text-lg font-bold leading-none">{camp.date.split(' ')[1].replace(',', '')}</span>
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-text-main text-sm">{camp.location}</h4>
                                        <p className="text-xs text-text-muted mt-1">{camp.type}</p>
                                        <div className="flex items-center mt-2 text-xs text-text-muted">
                                            <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Confirmed
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <Button variant="secondary" className="w-full mt-4 text-sm">Schedule New Camp</Button>
                    </Card>
                </div>
            </div>
        </div>
    );
}
