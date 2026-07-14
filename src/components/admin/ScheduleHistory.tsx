import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Calendar, MapPin, Clock, Trash2, Archive, CheckCircle, XCircle, Bus } from 'lucide-react';
import { BUS_BADGE_STYLES } from '@/constants/buses';

interface Schedule {
    id: string;
    month: number;
    year: number;
    location_name: string;
    scheduled_date: string;
    address: string;
    is_active: boolean;
    created_at: string;
    status?: string; // scheduled, completed, cancelled
    trip_id?: string;
    bus_number?: string;
    donor?: string;
}

export function ScheduleHistory() {
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');

    const fetchSchedules = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('monthly_schedules')
                .select('*')
                .order('year', { ascending: false })
                .order('month', { ascending: false })
                .order('scheduled_date', { ascending: true });

            if (filter === 'active') {
                query = query.eq('is_active', true);
            } else if (filter === 'archived') {
                query = query.eq('is_active', false);
            }

            const { data, error } = await query;
            if (error) throw error;

            setSchedules(data || []);
        } catch (error) {
            console.error('Error fetching schedules:', error);
        } finally {
            setLoading(false);
        }
    }, [filter]);

    useEffect(() => {
        fetchSchedules();
    }, [filter, fetchSchedules]);

    const handleArchiveSchedule = async (month: number, year: number, busNumber?: string) => {
        const busLabel = busNumber ? ` (${busNumber})` : '';
        if (!confirm(`Archive all schedules for ${getMonthName(month)} ${year}${busLabel}?`)) return;

        try {
            // Scope archiving to the group's bus so other buses' schedules
            // for the same month stay active.
            let query = supabase
                .from('monthly_schedules')
                .update({ is_active: false })
                .eq('month', month)
                .eq('year', year);
            if (busNumber) query = query.eq('bus_number', busNumber);
            const { error } = await query;

            if (error) throw error;

            alert('Schedule archived successfully');
            fetchSchedules();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            alert('Error archiving schedule: ' + message);
        }
    };

    const handleDeleteSchedule = async (id: string) => {
        if (!confirm('Are you sure you want to permanently delete this schedule entry?')) return;

        try {
            const { error } = await supabase
                .from('monthly_schedules')
                .delete()
                .eq('id', id);

            if (error) throw error;

            alert('Schedule deleted successfully');
            fetchSchedules();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error occurred';
            alert('Error deleting schedule: ' + message);
        }
    };

    const getMonthName = (month: number) => {
        return new Date(2000, month - 1, 1).toLocaleString('default', { month: 'long' });
    };

    // Group schedules by month-year + bus + active status so each bus's upload
    // (and archived vs active versions) appears as its own group
    const groupedSchedules = schedules.reduce((acc, schedule) => {
        const key = `${schedule.month}-${schedule.year}-${schedule.bus_number || 'no-bus'}-${schedule.is_active ? 'active' : 'archived'}`;
        if (!acc[key]) {
            acc[key] = {
                month: schedule.month,
                year: schedule.year,
                bus_number: schedule.bus_number,
                is_active: schedule.is_active,
                items: [],
                completed: 0,
                total: 0
            };
        }
        acc[key].items.push(schedule);
        acc[key].total++;
        if (schedule.status === 'completed') acc[key].completed++;
        return acc;
    }, {} as Record<string, { month: number; year: number; bus_number?: string; is_active: boolean; items: Schedule[]; completed: number; total: number }>);

    return (
        <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg flex items-center gap-2">
                    <Clock className="text-primary" />
                    Schedule History
                </h3>
                <div className="flex gap-2">
                    <Button
                        variant={filter === 'all' ? 'primary' : 'outline'}
                        onClick={() => setFilter('all')}
                        className="text-xs py-1 px-3"
                    >
                        All
                    </Button>
                    <Button
                        variant={filter === 'active' ? 'primary' : 'outline'}
                        onClick={() => setFilter('active')}
                        className="text-xs py-1 px-3"
                    >
                        Active
                    </Button>
                    <Button
                        variant={filter === 'archived' ? 'primary' : 'outline'}
                        onClick={() => setFilter('archived')}
                        className="text-xs py-1 px-3"
                    >
                        Archived
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : Object.keys(groupedSchedules).length > 0 ? (
                <div className="space-y-6">
                    {Object.entries(groupedSchedules).map(([key, group]) => (
                        <div key={key} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <h4 className="font-bold text-lg text-text-main">
                                        {getMonthName(group.month)} {group.year}
                                    </h4>
                                    {group.bus_number && (
                                        <span className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${BUS_BADGE_STYLES[group.bus_number] ? `${BUS_BADGE_STYLES[group.bus_number].bg} ${BUS_BADGE_STYLES[group.bus_number].text}` : 'bg-gray-100 text-gray-600'}`}>
                                            <Bus size={12} />
                                            {group.bus_number}
                                        </span>
                                    )}
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${group.is_active
                                        ? 'bg-green-100 text-green-700'
                                        : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {group.is_active ? (
                                            <><CheckCircle size={12} className="inline mr-1" />Active</>
                                        ) : (
                                            <><XCircle size={12} className="inline mr-1" />Archived</>
                                        )}
                                    </span>
                                    <span className="text-xs text-text-muted">
                                        {group.items.length} location{group.items.length !== 1 ? 's' : ''} • {group.completed}/{group.total} completed
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="text-right mr-2">
                                        <p className="text-xs text-gray-500">Progress</p>
                                        <p className="text-sm font-bold text-primary">
                                            {group.total > 0 ? Math.round((group.completed / group.total) * 100) : 0}%
                                        </p>
                                    </div>
                                    {group.is_active && (
                                        <Button
                                            variant="outline"
                                            onClick={() => handleArchiveSchedule(group.month, group.year, group.bus_number)}
                                            className="text-xs py-1 px-3 text-orange-600 border-orange-200 hover:bg-orange-50"
                                        >
                                            <Archive size={14} className="mr-1" />
                                            Archive
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {group.items.map((schedule) => (
                                    <div key={schedule.id} className={`rounded-lg p-3 border ${schedule.status === 'completed'
                                        ? 'bg-green-50 border-green-200'
                                        : 'bg-gray-50 border-gray-100'
                                        }`}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={16} className="text-primary" />
                                                <span className="text-sm font-bold text-text-main">
                                                    {new Date(schedule.scheduled_date).toLocaleDateString('en-US', {
                                                        month: 'short',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    })}
                                                </span>
                                                {schedule.status === 'completed' && (
                                                    <CheckCircle size={14} className="text-green-600" />
                                                )}
                                            </div>
                                            <button
                                                onClick={() => handleDeleteSchedule(schedule.id)}
                                                className="text-red-500 hover:text-red-700"
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <h5 className="font-semibold text-sm text-text-main mb-1 flex items-center gap-1">
                                            <MapPin size={14} className="text-primary" />
                                            {schedule.location_name}
                                        </h5>
                                        {schedule.address && (
                                            <p className="text-xs text-text-muted line-clamp-2">
                                                {schedule.address}
                                            </p>
                                        )}
                                        {schedule.donor && (
                                            <p className="text-xs text-text-muted mt-1">
                                                Donor: <span className="font-medium">{schedule.donor}</span>
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Calendar size={48} className="mx-auto text-gray-300 mb-3" />
                    <p className="text-text-muted">No schedules found</p>
                    <p className="text-xs text-text-muted mt-1">Upload a schedule to get started</p>
                </div>
            )}
        </Card>
    );
}
