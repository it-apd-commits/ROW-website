import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    Bus,
    Plus,
    TrendingUp,
    MapPin,
    Fuel,
    Calendar,
    BarChart3,
    Download,
    Zap,
    CheckCircle2,
    Clock,
    History,
    Eye,
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import type { Trip, TripSummary } from '@/types/trip';
import { clearTripData } from '@/data/tripData';
import { exportTripsToCSV } from '@/utils/exportUtils';

import { supabase } from '@/lib/supabase';
import { BusMap } from '@/components/tracking/BusMap';
import { BUS_BADGE_STYLES } from '@/constants/buses';

interface MonthlySchedule {
    id: string;
    location_name: string;
    scheduled_date: string;
    address?: string;
    status?: string;
    is_active: boolean;
    trip_id?: string;
    bus_number?: string;
    donor?: string;
}

interface CompletedCamp {
    schedule: MonthlySchedule;
    trip: Trip | null;
}

export function LiveBusTrackingPage() {
    const [trips, setTrips] = useState<Trip[]>([]);
    const [monthlyStats, setMonthlyStats] = useState<TripSummary | null>(null);
    const [timeframe, setTimeframe] = useState<'daily' | 'weekly' | 'monthly' | 'custom' | 'all'>('all');
    const [customDateRange, setCustomDateRange] = useState({
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [upcomingCamps, setUpcomingCamps] = useState<MonthlySchedule[]>([]);
    const [completedCamps, setCompletedCamps] = useState<CompletedCamp[]>([]);
    const [campTab, setCampTab] = useState<'upcoming' | 'completed'>('upcoming');

    const getFilteredTrips = useCallback(() => {
        const now = new Date();
        return trips.filter(trip => {
            const tripDate = new Date(trip.date);
            if (timeframe === 'daily') {
                return tripDate.toDateString() === now.toDateString();
            }
            if (timeframe === 'weekly') {
                const weekAgo = new Date();
                weekAgo.setDate(now.getDate() - 7);
                return tripDate >= weekAgo;
            }
            if (timeframe === 'monthly') {
                return tripDate.getMonth() === now.getMonth() && tripDate.getFullYear() === now.getFullYear();
            }
            if (timeframe === 'custom') {
                const start = new Date(customDateRange.start);
                const end = new Date(customDateRange.end);
                end.setHours(23, 59, 59, 999);
                return tripDate >= start && tripDate <= end;
            }
            return true; // 'all'
        });
    }, [trips, timeframe, customDateRange]);

    const calculateStats = useCallback(() => {
        const filtered = getFilteredTrips();

        if (filtered.length === 0) {
            setMonthlyStats({
                totalDistance: 0,
                totalTrips: 0,
                operatingDays: 0,
                averageDistance: 0,
                totalBeneficiaries: 0,
                totalFuelCost: 0,
                totalFuelLiters: 0,
                averageFuelEfficiency: 0,
                locationsCovered: 0,
            });
            return;
        }

        const totalDistance = Math.round(filtered.reduce((sum, trip) => sum + trip.finalDistance, 0));
        const totalFuelCost = Math.round(filtered.reduce((sum, trip) => sum + (trip.fuelCost || 0), 0));
        const totalFuelLiters = Number(filtered.reduce((sum, trip) => sum + (trip.fuelLiters || 0), 0).toFixed(2));
        const totalBeneficiaries = filtered.reduce((sum, trip) => sum + (trip.beneficiariesServed || 0), 0);

        const tripsWithFuel = filtered.filter(t => t.fuelEfficiency);
        const averageFuelEfficiency = tripsWithFuel.length > 0
            ? Number((tripsWithFuel.reduce((sum, t) => sum + (t.fuelEfficiency || 0), 0) / tripsWithFuel.length).toFixed(2))
            : 0;

        const uniqueDates = new Set(filtered.map(t => t.date));
        const uniqueLocations = new Set(filtered.map(t => t.location));

        setMonthlyStats({
            totalDistance,
            totalTrips: filtered.length,
            operatingDays: uniqueDates.size,
            averageDistance: filtered.length > 0 ? Math.round(totalDistance / filtered.length) : 0,
            totalBeneficiaries,
            totalFuelCost,
            totalFuelLiters,
            averageFuelEfficiency,
            locationsCovered: uniqueLocations.size,
        });
    }, [getFilteredTrips]);

    useEffect(() => {
        loadTrips();
        loadCamps();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        calculateStats();
    }, [calculateStats]);

    const mapTrip = (t: Record<string, unknown>): Trip => ({
        id: t.id as string,
        date: t.date as string,
        busNumber: t.bus_number as string,
        driverName: t.driver_name as string,
        assistantName: t.assistant_name as string | undefined,
        odometerStart: t.odometer_start as number | undefined,
        odometerEnd: t.odometer_end as number | undefined,
        finalDistance: t.final_distance as number,
        location: t.location as string,
        departureTime: t.departure_time as string,
        returnTime: t.return_time as string,
        durationHours: t.duration_hours as number,
        purpose: t.purpose as Trip['purpose'],
        beneficiariesServed: (t.beneficiaries_served as number) || 0,
        fuelLiters: t.fuel_liters as number | undefined,
        fuelCost: t.fuel_cost as number | undefined,
        fuelEfficiency: t.fuel_efficiency as number | undefined,
        generatorStartReading: t.generator_start_reading as number | undefined,
        generatorEndReading: t.generator_end_reading as number | undefined,
        generatorUnitsUsed: t.generator_units_used as number | undefined,
        notes: t.notes as string | undefined,
        createdAt: t.created_at as string,
        createdBy: t.created_by as string,
    });

    const loadTrips = async () => {
        try {
            const { data, error } = await supabase
                .from('trips')
                .select('*')
                .order('date', { ascending: false });

            if (error) throw error;
            setTrips((data || []).map(mapTrip));
        } catch (error) {
            console.error('Error loading trips:', error);
        }
    };

    const loadCamps = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];

            // 1) Upcoming: active schedules that are NOT completed and date >= today
            const { data: upcoming, error: upErr } = await supabase
                .from('monthly_schedules')
                .select('*')
                .eq('is_active', true)
                .gte('scheduled_date', today)
                .neq('status', 'completed')
                .order('scheduled_date', { ascending: true });

            if (upErr) throw upErr;
            setUpcomingCamps(upcoming || []);

            // 2) Completed: active schedules that are completed OR have a trip_id
            const { data: completed, error: compErr } = await supabase
                .from('monthly_schedules')
                .select('*')
                .eq('is_active', true)
                .or('status.eq.completed,trip_id.not.is.null')
                .order('scheduled_date', { ascending: false });

            if (compErr) throw compErr;

            if (!completed || completed.length === 0) {
                setCompletedCamps([]);
                return;
            }

            // Fetch linked trips for completed camps
            const tripIds = completed
                .map(c => c.trip_id)
                .filter((id): id is string => !!id);

            const tripsMap = new Map<string, Trip>();
            if (tripIds.length > 0) {
                const { data: tripRows } = await supabase
                    .from('trips')
                    .select('*')
                    .in('id', tripIds);

                (tripRows || []).forEach(t => {
                    tripsMap.set(t.id, mapTrip(t));
                });
            }

            // Also match by date + location for camps without trip_id
            const unmatchedCamps = completed.filter(c => !c.trip_id);
            if (unmatchedCamps.length > 0) {
                const dates = [...new Set(unmatchedCamps.map(c => c.scheduled_date))];
                const { data: matchTrips } = await supabase
                    .from('trips')
                    .select('*')
                    .in('date', dates);

                (matchTrips || []).forEach(t => {
                    // Find matching camp by date + location name
                    const matchedCamp = unmatchedCamps.find(
                        c => c.scheduled_date === t.date &&
                            t.location.toLowerCase().includes(c.location_name.toLowerCase())
                    );
                    if (matchedCamp && !tripsMap.has(t.id)) {
                        tripsMap.set(matchedCamp.id, mapTrip(t));
                    }
                });
            }

            setCompletedCamps(
                completed.map(schedule => ({
                    schedule,
                    trip: tripsMap.get(schedule.trip_id || schedule.id) || null,
                }))
            );
        } catch (error) {
            console.error('Error loading camps:', error);
        }
    };

    const getLocationStats = () => {
        const filtered = getFilteredTrips();
        const locationMap: Record<string, { visits: number; distance: number }> = {};

        filtered.forEach(trip => {
            if (!locationMap[trip.location]) {
                locationMap[trip.location] = { visits: 0, distance: 0 };
            }
            locationMap[trip.location].visits++;
            locationMap[trip.location].distance += trip.finalDistance;
        });

        return Object.entries(locationMap)
            .map(([location, data]) => ({ location, ...data }))
            .sort((a, b) => b.visits - a.visits);
    };

    const getRecentTrips = () => {
        return [...getFilteredTrips()]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 5);
    };

    const stats = monthlyStats || {
        totalDistance: 0,
        totalTrips: 0,
        operatingDays: 0,
        averageDistance: 0,
        totalBeneficiaries: 0,
        totalFuelCost: 0,
        totalFuelLiters: 0,
        averageFuelEfficiency: 0,
        locationsCovered: 0,
    };

    const locationStats = getLocationStats();
    const recentTrips = getRecentTrips();

    const handleClearData = () => {
        if (confirm('Are you sure you want to clear all trip data?')) {
            clearTripData();
            loadTrips();
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                        <Bus className="text-primary" size={28} />
                        Bus Tracking Dashboard
                    </h1>
                    <p className="text-text-muted">
                        {timeframe === 'monthly' ? `Analytics for ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` :
                            timeframe === 'weekly' ? 'Analytics for the last 7 days' :
                                timeframe === 'daily' ? 'Analytics for today' : 'Overall lifetime analytics'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-4 items-center">
                    {/* Timeframe Selection */}
                    <div className="flex flex-col gap-2">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {(['daily', 'weekly', 'monthly', 'custom', 'all'] as const).map((t) => (
                                <button
                                    key={t}
                                    onClick={() => setTimeframe(t)}
                                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${timeframe === t
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-text-muted hover:text-text-main'
                                        }`}
                                >
                                    {t === 'daily' ? 'Day' : t.charAt(0).toUpperCase() + t.slice(1)}
                                </button>
                            ))}
                        </div>

                        {timeframe === 'custom' && (
                            <div className="flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-1">
                                    <span className="text-[10px] text-text-muted uppercase font-bold">From:</span>
                                    <input
                                        type="date"
                                        className="text-xs focus:outline-none"
                                        value={customDateRange.start}
                                        onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                                    />
                                </div>
                                <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-md px-2 py-1">
                                    <span className="text-[10px] text-text-muted uppercase font-bold">To:</span>
                                    <input
                                        type="date"
                                        className="text-xs focus:outline-none"
                                        value={customDateRange.end}
                                        onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex gap-2">
                        {getFilteredTrips().length > 0 && (
                            <Button
                                variant="outline"
                                onClick={() => exportTripsToCSV(getFilteredTrips())}
                                className="flex items-center gap-2"
                            >
                                <Download size={16} />
                                <span className="hidden sm:inline">Export</span>
                            </Button>
                        )}
                        <Button
                            variant="outline"
                            onClick={handleClearData}
                            className="flex items-center gap-2 text-red-600 hover:bg-red-50 border-red-100"
                        >
                            🗑️
                        </Button>
                        <Link to="/tracking/add-trip">
                            <Button className="flex items-center gap-2 min-h-[44px]">
                                <Plus size={16} />
                                <span className="hidden sm:inline">Add Trip</span>
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="p-4 border-l-4 border-l-blue-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-text-muted mb-1">Total Distance</p>
                            <h3 className="text-2xl font-bold text-text-main">{stats.totalDistance} km</h3>
                        </div>
                        <div className="p-2 rounded-lg bg-blue-50">
                            <TrendingUp className="w-5 h-5 text-blue-600" />
                        </div>
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                        Avg: {stats.averageDistance} km/trip
                    </p>
                </Card>

                <Card className="p-4 border-l-4 border-l-green-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-text-muted mb-1">Operating Days</p>
                            <h3 className="text-2xl font-bold text-text-main">{stats.operatingDays}</h3>
                        </div>
                        <div className="p-2 rounded-lg bg-green-50">
                            <Calendar className="w-5 h-5 text-green-600" />
                        </div>
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                        {stats.totalTrips} total trips
                    </p>
                </Card>

                <Card className="p-4 border-l-4 border-l-orange-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-text-muted mb-1">Fuel Consumed</p>
                            <h3 className="text-2xl font-bold text-text-main">
                                {stats.totalFuelLiters > 0 ? stats.totalFuelLiters : '--'} <span className="text-sm">L</span>
                            </h3>
                        </div>
                        <div className="p-2 rounded-lg bg-orange-50">
                            <Fuel className="w-5 h-5 text-orange-600" />
                        </div>
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                        Cost: ₹{stats.totalFuelCost.toLocaleString()}
                        {stats.averageFuelEfficiency > 0 && ` • Avg ${stats.averageFuelEfficiency} km/L`}
                    </p>
                </Card>

                <Card className="p-4 border-l-4 border-l-yellow-500">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="text-sm font-medium text-text-muted mb-1">Generator Running Record</p>
                            <h3 className="text-2xl font-bold text-text-main">
                                {(() => {
                                    const filtered = getFilteredTrips();
                                    const total = filtered.reduce((sum, t) => sum + (t.generatorUnitsUsed || 0), 0);
                                    return total > 0 ? total.toFixed(1) : '--';
                                })()} <span className="text-sm">units</span>
                            </h3>
                        </div>
                        <div className="p-2 rounded-lg bg-yellow-50">
                            <Zap className="w-5 h-5 text-yellow-600" />
                        </div>
                    </div>
                    <p className="text-xs text-text-muted mt-2">
                        {(() => {
                            const filtered = getFilteredTrips();
                            const tripsWithGen = filtered.filter(t => t.generatorUnitsUsed && t.generatorUnitsUsed > 0).length;
                            return `${tripsWithGen} trip${tripsWithGen === 1 ? '' : 's'} logged`;
                        })()}
                    </p>
                </Card>
            </div>

            {/* Main Content */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Location Coverage */}
                <Card className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-lg text-text-main flex items-center gap-2">
                            <MapPin className="text-primary" size={20} />
                            Location Coverage
                        </h3>
                        <Link to="/tracking/history">
                            <Button variant="outline" className="text-sm">
                                View All
                            </Button>
                        </Link>
                    </div>

                    {locationStats.length > 0 ? (
                        <div className="space-y-4">
                            {locationStats.map((loc, index) => (
                                <div key={index} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                                    <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="text-primary font-bold">{loc.visits}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-medium text-text-main truncate">{loc.location}</h4>
                                        <p className="text-sm text-text-muted">
                                            {loc.distance} km total • {loc.visits} visits
                                        </p>
                                    </div>
                                    <div className="w-24">
                                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full"
                                                style={{
                                                    width: `${(loc.visits / Math.max(...locationStats.map(l => l.visits))) * 100}%`
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <MapPin size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-text-muted">No trips recorded this month</p>
                            <Link to="/tracking/add-trip">
                                <Button className="mt-4 flex items-center gap-2 mx-auto">
                                    <Plus size={16} />
                                    Add Your First Trip
                                </Button>
                            </Link>
                        </div>
                    )}

                    {/* Map */}
                    <div className="mt-8 border-t border-gray-100 pt-6">
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-semibold text-text-main flex items-center gap-2">
                                <MapPin className="text-primary" size={18} />
                                Area Coverage Map
                            </h4>
                            <span className="text-xs text-text-muted">
                                {getFilteredTrips().length} points of interest
                            </span>
                        </div>
                        <BusMap trips={getFilteredTrips()} />
                    </div>
                </Card>

                {/* Recent Trips */}
                <Card>
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="font-semibold text-lg text-text-main flex items-center gap-2">
                            <BarChart3 className="text-primary" size={20} />
                            Recent Trips
                        </h3>
                    </div>

                    {recentTrips.length > 0 ? (
                        <div className="space-y-3">
                            {recentTrips.map((trip, index) => (
                                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-primary">
                                            {new Date(trip.date).toLocaleDateString()}
                                        </span>
                                        <span className="text-xs text-text-muted">{trip.busNumber}</span>
                                    </div>
                                    <h4 className="font-medium text-sm text-text-main">{trip.location}</h4>
                                    <div className="flex items-center gap-4 mt-2 text-xs text-text-muted">
                                        <span>{trip.finalDistance} km</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-8">
                            <p className="text-text-muted text-sm">No trips yet</p>
                        </div>
                    )}
                </Card>

                {/* Upcoming Camps & Trip History — Tabbed Section */}
                <div id="upcoming-camps" className="lg:col-span-3">
                    <Card>
                        {/* Tab Header */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button
                                    onClick={() => setCampTab('upcoming')}
                                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${campTab === 'upcoming'
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-text-muted hover:text-text-main'
                                        }`}
                                >
                                    <Clock size={16} />
                                    Upcoming Camps
                                    {upcomingCamps.length > 0 && (
                                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
                                            {upcomingCamps.length}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setCampTab('completed')}
                                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${campTab === 'completed'
                                        ? 'bg-white text-primary shadow-sm'
                                        : 'text-text-muted hover:text-text-main'
                                        }`}
                                >
                                    <History size={16} />
                                    Trip History
                                    {completedCamps.length > 0 && (
                                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-green-100 text-green-700">
                                            {completedCamps.length}
                                        </span>
                                    )}
                                </button>
                            </div>
                            {campTab === 'upcoming' && upcomingCamps.length > 0 && (
                                <p className="text-xs text-text-muted">
                                    Camps move to Trip History once a trip is logged for them.
                                </p>
                            )}
                        </div>

                        {/* Upcoming Camps Tab */}
                        {campTab === 'upcoming' && (
                            <>
                                {upcomingCamps.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {upcomingCamps.map((camp) => {
                                            // Parse YYYY-MM-DD as a LOCAL date (new Date(string) would parse it as UTC midnight)
                                            const [cy, cm, cd] = camp.scheduled_date.split('-').map(Number);
                                            const campDate = new Date(cy, cm - 1, cd);
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);
                                            const diffDays = Math.ceil((campDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                            const isToday = diffDays === 0;
                                            const isTomorrow = diffDays === 1;

                                            return (
                                                <div key={camp.id} className={`p-4 border rounded-xl transition-all ${isToday
                                                    ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200'
                                                    : isTomorrow
                                                        ? 'bg-blue-50 border-blue-200'
                                                        : 'bg-white border-gray-200 hover:border-primary/30'
                                                    }`}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <span className={`text-xs font-bold uppercase tracking-wider ${isToday ? 'text-amber-700' : isTomorrow ? 'text-blue-700' : 'text-gray-500'}`}>
                                                            {campDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                                        </span>
                                                        {isToday && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-200 text-amber-800 animate-pulse">
                                                                TODAY
                                                            </span>
                                                        )}
                                                        {isTomorrow && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-200 text-blue-800">
                                                                TOMORROW
                                                            </span>
                                                        )}
                                                        {!isToday && !isTomorrow && (
                                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500">
                                                                In {diffDays} days
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="font-semibold text-sm text-text-main mb-1 flex items-center gap-1.5">
                                                        <MapPin size={14} className="text-primary flex-shrink-0" />
                                                        {camp.location_name}
                                                    </h4>
                                                    {camp.address && (
                                                        <p className="text-xs text-text-muted line-clamp-2 ml-5">
                                                            {camp.address}
                                                        </p>
                                                    )}
                                                    {(camp.bus_number || camp.donor) && (
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-2 ml-5">
                                                            {camp.bus_number && (
                                                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${BUS_BADGE_STYLES[camp.bus_number] ? `${BUS_BADGE_STYLES[camp.bus_number].bg} ${BUS_BADGE_STYLES[camp.bus_number].text}` : 'bg-gray-100 text-gray-600'}`}>
                                                                    {camp.bus_number}
                                                                </span>
                                                            )}
                                                            {camp.donor && (
                                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                                                                    {camp.donor}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {isToday && (
                                                        <Link
                                                            to={`/tracking/add-trip?date=${camp.scheduled_date}&location=${encodeURIComponent(camp.location_name)}${camp.bus_number ? `&bus=${encodeURIComponent(camp.bus_number)}` : ''}`}
                                                            className="mt-3 block"
                                                        >
                                                            <Button className="w-full text-xs py-1.5 flex items-center justify-center gap-1.5">
                                                                <Plus size={14} /> Log Trip
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                                        <Calendar size={36} className="mx-auto text-gray-300 mb-3" />
                                        <p className="text-text-muted font-medium">No upcoming camps scheduled</p>
                                        <p className="text-xs text-text-muted mt-1">Upload monthly schedule in Admin Control</p>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Completed / Trip History Tab */}
                        {campTab === 'completed' && (
                            <>
                                {completedCamps.length > 0 ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-200 bg-gray-50">
                                                    <th className="text-left py-3 px-4 font-semibold text-text-main">Scheduled Date</th>
                                                    <th className="text-left py-3 px-4 font-semibold text-text-main">Location</th>
                                                    <th className="text-left py-3 px-4 font-semibold text-text-main">Trip Date</th>
                                                    <th className="text-left py-3 px-4 font-semibold text-text-main">Bus</th>
                                                    <th className="text-right py-3 px-4 font-semibold text-text-main">Distance</th>
                                                    <th className="text-right py-3 px-4 font-semibold text-text-main">Beneficiaries</th>
                                                    <th className="text-left py-3 px-4 font-semibold text-text-main">Driver</th>
                                                    <th className="text-center py-3 px-4 font-semibold text-text-main">Status</th>
                                                    <th className="text-right py-3 px-4 font-semibold text-text-main">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {completedCamps.map((item) => (
                                                    <tr key={item.schedule.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="py-3 px-4">
                                                            <span className="text-xs font-bold text-gray-600">
                                                                {new Date(item.schedule.scheduled_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="flex items-center gap-1.5">
                                                                <MapPin size={14} className="text-primary flex-shrink-0" />
                                                                <div>
                                                                    <span className="font-medium text-text-main">{item.schedule.location_name}</span>
                                                                    {item.schedule.address && (
                                                                        <p className="text-[10px] text-text-muted truncate max-w-[180px]">{item.schedule.address}</p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        {item.trip ? (
                                                            <>
                                                                <td className="py-3 px-4 text-xs">
                                                                    {new Date(item.trip.date).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                </td>
                                                                <td className="py-3 px-4 text-xs text-text-muted">{item.trip.busNumber}</td>
                                                                <td className="py-3 px-4 text-right font-medium">{item.trip.finalDistance} km</td>
                                                                <td className="py-3 px-4 text-right font-medium text-blue-600">{item.trip.beneficiariesServed}</td>
                                                                <td className="py-3 px-4 text-xs text-text-muted">{item.trip.driverName}</td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td className="py-3 px-4 text-xs text-text-muted">--</td>
                                                                <td className="py-3 px-4 text-xs text-text-muted">--</td>
                                                                <td className="py-3 px-4 text-right text-xs text-text-muted">--</td>
                                                                <td className="py-3 px-4 text-right text-xs text-text-muted">--</td>
                                                                <td className="py-3 px-4 text-xs text-text-muted">--</td>
                                                            </>
                                                        )}
                                                        <td className="py-3 px-4 text-center">
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                                                                <CheckCircle2 size={10} /> Completed
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            {item.trip && (
                                                                <Link to={`/tracking/edit-trip/${item.trip.id}`}>
                                                                    <button className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors">
                                                                        <Eye size={12} /> View
                                                                    </button>
                                                                </Link>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-12 bg-gray-50 rounded-lg">
                                        <CheckCircle2 size={36} className="mx-auto text-gray-300 mb-3" />
                                        <p className="text-text-muted font-medium">No completed trips yet</p>
                                        <p className="text-xs text-text-muted mt-1">Trips will appear here once a camp is completed</p>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>
                </div>
            </div>
        </div>
    );
}
