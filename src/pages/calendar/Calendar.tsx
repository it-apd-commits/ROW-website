import { useState, useEffect } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    Calendar as CalendarIcon,
    MapPin,
    User,
    Clock,
    X,
    Bus,
    CheckCircle,
    XCircle,
    AlertTriangle,
    Users,
    ArrowRight
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Link } from 'react-router-dom';
import { fetchCalendarEvents, fetchScheduleDonors, updateScheduleStatus, type CalendarEvent } from '@/services/calendarService';
import { BUSES, BUS_BADGE_STYLES } from '@/constants/buses';

const ALL_BUSES = 'All Buses';
const ALL_DONORS = 'All Donors';

// Status color config
const STATUS_STYLES: Record<CalendarEvent['status'], { bg: string; text: string; border: string; label: string; icon: typeof CheckCircle }> = {
    scheduled: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-l-blue-500', label: 'Scheduled', icon: CalendarIcon },
    completed: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-l-green-500', label: 'Completed', icon: CheckCircle },
    cancelled: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-l-gray-400', label: 'Cancelled', icon: XCircle },
    missed: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-l-red-500', label: 'Missed', icon: AlertTriangle },
};

const EVENT_TYPE_COLORS: Record<CalendarEvent['eventType'], { bg: string; text: string }> = {
    'screening': { bg: 'bg-blue-100', text: 'text-blue-700' },
    'follow-up': { bg: 'bg-green-100', text: 'text-green-700' },
    'maintenance': { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    'emergency': { bg: 'bg-red-100', text: 'text-red-700' },
    'other': { bg: 'bg-gray-100', text: 'text-gray-600' },
};

export function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<'all' | 'scheduled' | 'completed' | 'missed' | null>(null);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
    const [busFilter, setBusFilter] = useState<string>(ALL_BUSES);
    const [donorFilter, setDonorFilter] = useState<string>(ALL_DONORS);
    const [donors, setDonors] = useState<string[]>([]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-indexed

    // Donor filter options (from active schedules)
    useEffect(() => {
        fetchScheduleDonors().then(setDonors);
    }, []);

    // Fetch events when month/year or filters change
    useEffect(() => {
        const loadEvents = async () => {
            setLoading(true);
            try {
                const data = await fetchCalendarEvents(year, month + 1, { // API expects 1-indexed month
                    busNumber: busFilter === ALL_BUSES ? undefined : busFilter,
                    donor: donorFilter === ALL_DONORS ? undefined : donorFilter,
                });
                setEvents(data);
            } catch (err) {
                console.error('Failed to load calendar events:', err);
                setEvents([]);
            } finally {
                setLoading(false);
            }
        };
        loadEvents();
    }, [year, month, busFilter, donorFilter]);

    // Handle marking a schedule as completed or missed
    const handleMarkStatus = async (eventId: string, newStatus: 'completed' | 'missed') => {
        setUpdatingStatus(eventId);
        const success = await updateScheduleStatus(eventId, newStatus);
        if (success) {
            setEvents(prev => prev.map(e =>
                e.id === eventId ? { ...e, status: newStatus } : e
            ));
        }
        setUpdatingStatus(null);
    };

    // Calendar utilities
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Navigation
    const goToPreviousMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
        setSelectedDate(null);
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
        setSelectedDate(null);
    };

    const goToToday = () => {
        setCurrentDate(new Date());
        setSelectedDate(null);
    };

    // Get events for a specific day
    const getDateEvents = (day: number): CalendarEvent[] => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        return events.filter(e => e.date === dateStr);
    };

    const isToday = (day: number): boolean => {
        const today = new Date();
        return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
    };

    // Summary stats
    const totalScheduled = events.length;
    const completedCount = events.filter(e => e.status === 'completed').length;
    const missedCount = events.filter(e => e.status === 'missed').length;
    const upcomingCount = events.filter(e => e.status === 'scheduled').length;

    // Handle card click — toggle filter and show filtered events in side panel
    const handleCardClick = (filter: 'all' | 'scheduled' | 'completed' | 'missed') => {
        if (activeFilter === filter) {
            setActiveFilter(null);
            setSelectedDate(null);
        } else {
            setActiveFilter(filter);
            setSelectedDate(null);
        }
    };

    // Get events for the side panel based on active filter or selected date
    const getFilteredPanelEvents = (): CalendarEvent[] => {
        if (selectedDate) return events.filter(e => e.date === selectedDate);
        if (activeFilter === 'all') return [...events].sort((a, b) => a.date.localeCompare(b.date));
        if (activeFilter) return events.filter(e => e.status === activeFilter).sort((a, b) => a.date.localeCompare(b.date));
        return [];
    };

    const panelEvents = getFilteredPanelEvents();

    const filterLabels: Record<string, string> = {
        all: 'All Scheduled Camps',
        scheduled: 'Upcoming Camps',
        completed: 'Completed Camps',
        missed: 'Missed Camps',
    };

    // Render calendar grid
    const renderCalendar = () => {
        const days = [];
        const totalCells = Math.ceil((firstDayOfMonth + daysInMonth) / 7) * 7;

        for (let i = 0; i < totalCells; i++) {
            const day = i - firstDayOfMonth + 1;
            const isValidDay = day > 0 && day <= daysInMonth;
            const dayEvents = isValidDay ? getDateEvents(day) : [];
            const hasEvents = dayEvents.length > 0;
            const isTodayDate = isValidDay && isToday(day);
            const dateStr = isValidDay ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';

            // Check if this day has events matching the active filter
            const hasFilterMatch = activeFilter && hasEvents && (
                activeFilter === 'all' || dayEvents.some(e => e.status === activeFilter)
            );

            days.push(
                <div
                    key={i}
                    onClick={() => {
                        if (isValidDay && hasEvents) {
                            setSelectedDate(dateStr);
                            setActiveFilter(null);
                        }
                    }}
                    className={`
                        min-h-[60px] md:min-h-[100px] p-1 md:p-2 border border-gray-100 relative
                        ${!isValidDay ? 'bg-gray-50' : hasEvents ? 'bg-white cursor-pointer hover:bg-gray-50' : 'bg-white'}
                        ${isTodayDate ? 'ring-2 ring-primary ring-inset' : ''}
                        ${selectedDate === dateStr ? 'bg-blue-50' : ''}
                        ${hasFilterMatch ? 'ring-2 ring-inset ' + (activeFilter === 'missed' ? 'ring-red-400 bg-red-50/50' : activeFilter === 'scheduled' ? 'ring-orange-400 bg-orange-50/50' : activeFilter === 'completed' ? 'ring-green-400 bg-green-50/50' : 'ring-blue-400 bg-blue-50/50') : ''}
                        transition-colors
                    `}
                >
                    {isValidDay && (
                        <>
                            <div className="flex items-center justify-between mb-1">
                                <span className={`
                                    text-sm font-medium
                                    ${isTodayDate ? 'bg-primary text-white rounded-full w-6 h-6 flex items-center justify-center text-xs' : 'text-text-main'}
                                `}>
                                    {day}
                                </span>
                            </div>

                            {hasEvents && (
                                <div className="space-y-1">
                                    {dayEvents.slice(0, 2).map((event, idx) => {
                                        const statusStyle = STATUS_STYLES[event.status];
                                        const busBadge = event.busNumber ? BUS_BADGE_STYLES[event.busNumber] : undefined;
                                        return (
                                            <div
                                                key={idx}
                                                className={`text-xs px-1.5 py-1 rounded truncate flex items-center gap-1 ${statusStyle.bg} ${statusStyle.text}`}
                                            >
                                                {event.status === 'completed' && <CheckCircle size={10} />}
                                                {event.status === 'missed' && <AlertTriangle size={10} />}
                                                {/* Bus tag only matters when viewing all buses together */}
                                                {busFilter === ALL_BUSES && event.busNumber && (
                                                    <span className={`shrink-0 px-1 rounded text-[9px] font-semibold ${busBadge ? `${busBadge.bg} ${busBadge.text}` : 'bg-gray-100 text-gray-600'}`}>
                                                        {event.busNumber.replace(/^BUS\s+/i, '')}
                                                    </span>
                                                )}
                                                <span className="truncate">{event.location}</span>
                                            </div>
                                        );
                                    })}
                                    {dayEvents.length > 2 && (
                                        <div className="text-[10px] text-text-muted">
                                            +{dayEvents.length - 2} more
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            );
        }

        return days;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                        <CalendarIcon className="text-primary" size={28} />
                        Schedule Calendar
                    </h1>
                    <p className="text-text-muted">View scheduled camps, trips, and follow-up sessions from uploaded schedules</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                        <Bus size={16} className="text-text-muted" />
                        <select
                            value={busFilter}
                            onChange={e => setBusFilter(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value={ALL_BUSES}>{ALL_BUSES}</option>
                            {BUSES.map(bus => (
                                <option key={bus} value={bus}>{bus}</option>
                            ))}
                        </select>
                    </div>
                    {donors.length > 0 && (
                        <select
                            value={donorFilter}
                            onChange={e => setDonorFilter(e.target.value)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                        >
                            <option value={ALL_DONORS}>{ALL_DONORS}</option>
                            {donors.map(donor => (
                                <option key={donor} value={donor}>{donor}</option>
                            ))}
                        </select>
                    )}
                </div>
            </div>

            {/* Monthly Summary Cards — Clickable */}
            {!loading && events.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div
                        onClick={() => handleCardClick('all')}
                        className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:shadow-md ${activeFilter === 'all' ? 'ring-2 ring-blue-500 bg-blue-100 border border-blue-300' : 'bg-blue-50 border border-blue-100'}`}
                    >
                        <p className="text-2xl font-bold text-blue-700">{totalScheduled}</p>
                        <p className="text-xs text-blue-600 font-medium">Total Scheduled</p>
                    </div>
                    <div
                        onClick={() => handleCardClick('completed')}
                        className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:shadow-md ${activeFilter === 'completed' ? 'ring-2 ring-green-500 bg-green-100 border border-green-300' : 'bg-green-50 border border-green-100'}`}
                    >
                        <p className="text-2xl font-bold text-green-700">{completedCount}</p>
                        <p className="text-xs text-green-600 font-medium">Completed</p>
                    </div>
                    <div
                        onClick={() => handleCardClick('scheduled')}
                        className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:shadow-md ${activeFilter === 'scheduled' ? 'ring-2 ring-orange-500 bg-orange-100 border border-orange-300' : 'bg-orange-50 border border-orange-100'}`}
                    >
                        <p className="text-2xl font-bold text-orange-700">{upcomingCount}</p>
                        <p className="text-xs text-orange-600 font-medium">Upcoming</p>
                    </div>
                    <div
                        onClick={() => handleCardClick('missed')}
                        className={`rounded-lg p-3 text-center cursor-pointer transition-all hover:shadow-md ${activeFilter === 'missed' ? 'ring-2 ring-red-500 bg-red-100 border border-red-300' : 'bg-red-50 border border-red-100'}`}
                    >
                        <p className="text-2xl font-bold text-red-700">{missedCount}</p>
                        <p className="text-xs text-red-600 font-medium">Missed</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Calendar */}
                <Card className="lg:col-span-2">
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                        <h2 className="text-xl font-bold text-text-main">
                            {monthNames[month]} {year}
                        </h2>
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={goToToday} className="text-sm">
                                Today
                            </Button>
                            <Button variant="outline" onClick={goToPreviousMonth} className="px-3">
                                <ChevronLeft size={18} />
                            </Button>
                            <Button variant="outline" onClick={goToNextMonth} className="px-3">
                                <ChevronRight size={18} />
                            </Button>
                        </div>
                    </div>

                    {/* Info Banner */}
                    {!loading && events.length > 0 && (
                        <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                            <p className="text-sm text-blue-700">
                                <strong>{events.length} events</strong> scheduled this month
                                {completedCount > 0 && <> • <span className="text-green-700 font-medium">{completedCount} completed</span></>}
                                {missedCount > 0 && <> • <span className="text-red-700 font-medium">{missedCount} missed</span></>}
                            </p>
                        </div>
                    )}

                    {!loading && events.length === 0 && (
                        <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg text-center">
                            <CalendarIcon size={32} className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-text-muted font-medium">No schedules uploaded for this month</p>
                            <p className="text-xs text-text-muted mt-1">Upload a schedule from Admin Control to see events here</p>
                        </div>
                    )}

                    {loading && (
                        <div className="flex justify-center py-8 mb-4">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    )}

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-0 mb-2 min-w-[320px]">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                            <div key={day} className="text-center text-xs md:text-sm font-semibold text-text-muted py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-0 border-t border-gray-200 min-w-[320px]">
                        {renderCalendar()}
                    </div>

                    {/* Legend */}
                    <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap gap-4 text-xs">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-blue-50 border border-blue-200 rounded"></div>
                            <span className="text-text-muted">Scheduled</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-green-50 border border-green-200 rounded"></div>
                            <span className="text-text-muted">Completed (Trip Logged)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-red-50 border border-red-200 rounded"></div>
                            <span className="text-text-muted">Missed (No Trip)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded"></div>
                            <span className="text-text-muted">Cancelled</span>
                        </div>
                    </div>
                </Card>

                {/* Event Details Panel */}
                <Card className="lg:col-span-1">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-lg text-text-main">
                            {activeFilter && !selectedDate ? filterLabels[activeFilter] : 'Event Details'}
                        </h3>
                        {(selectedDate || activeFilter) && (
                            <button
                                onClick={() => { setSelectedDate(null); setActiveFilter(null); }}
                                className="text-text-muted hover:text-text-main"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>

                    {(selectedDate || activeFilter) ? (
                        <div className="space-y-4 max-h-[600px] overflow-y-auto">
                            {selectedDate && (
                                <div className="text-sm text-text-muted mb-4">
                                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </div>
                            )}

                            {activeFilter && !selectedDate && (
                                <div className="text-sm text-text-muted mb-2">
                                    {panelEvents.length} camp{panelEvents.length !== 1 ? 's' : ''} found
                                </div>
                            )}

                            {panelEvents.length === 0 && (
                                <div className="text-center py-8">
                                    <CalendarIcon size={36} className="mx-auto text-gray-300 mb-2" />
                                    <p className="text-text-muted text-sm">No camps found for this filter</p>
                                </div>
                            )}

                            {panelEvents.map((event, idx) => {
                                const statusStyle = STATUS_STYLES[event.status];
                                const typeColor = EVENT_TYPE_COLORS[event.eventType];
                                return (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-lg border-l-4 ${statusStyle.bg} ${statusStyle.border}`}
                                    >
                                        {/* Show date when viewing filtered list */}
                                        {activeFilter && !selectedDate && (
                                            <div className="text-xs font-medium text-text-muted mb-2 flex items-center gap-1">
                                                <CalendarIcon size={12} />
                                                {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                                                    weekday: 'short',
                                                    month: 'short',
                                                    day: 'numeric'
                                                })}
                                            </div>
                                        )}
                                        {/* Status & Type badges */}
                                        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                            <span className={`text-xs font-semibold px-2 py-1 rounded ${typeColor.bg} ${typeColor.text}`}>
                                                {event.eventType === 'follow-up' ? 'Follow-up' : event.eventType.charAt(0).toUpperCase() + event.eventType.slice(1)}
                                            </span>
                                            <span className={`text-xs font-semibold px-2 py-1 rounded flex items-center gap-1 ${statusStyle.bg} ${statusStyle.text}`}>
                                                <statusStyle.icon size={12} />
                                                {statusStyle.label}
                                            </span>
                                        </div>

                                        <div className="space-y-2 text-sm">
                                            {/* Location */}
                                            <div className="flex items-start gap-2">
                                                <MapPin size={16} className="text-text-muted mt-0.5 shrink-0" />
                                                <div>
                                                    <div className="font-medium text-text-main">{event.location}</div>
                                                    {event.address && (
                                                        <div className="text-xs text-text-muted">{event.address}</div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Bus assigned to this camp (from schedule or logged trip) */}
                                            {event.busNumber && (
                                                <div className="flex items-center gap-2">
                                                    <Bus size={16} className="text-text-muted shrink-0" />
                                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${BUS_BADGE_STYLES[event.busNumber] ? `${BUS_BADGE_STYLES[event.busNumber].bg} ${BUS_BADGE_STYLES[event.busNumber].text}` : 'bg-gray-100 text-gray-600'}`}>
                                                        {event.busNumber}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Donor sponsoring this camp */}
                                            {event.donor && (
                                                <div className="flex items-center gap-2">
                                                    <User size={16} className="text-text-muted shrink-0" />
                                                    <span className="text-text-main text-xs">Donor: {event.donor}</span>
                                                </div>
                                            )}

                                            {/* Trip details (if completed) */}
                                            {event.tripId && (
                                                <>
                                                    {event.driverName && (
                                                        <div className="flex items-center gap-2">
                                                            <User size={16} className="text-text-muted shrink-0" />
                                                            <span className="text-text-main">{event.driverName}</span>
                                                        </div>
                                                    )}

                                                    {(event.departureTime || event.returnTime) && (
                                                        <div className="flex items-center gap-2">
                                                            <Clock size={16} className="text-text-muted shrink-0" />
                                                            <span className="text-text-main">
                                                                {event.departureTime || '--'} - {event.returnTime || '--'}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {event.beneficiariesServed != null && event.beneficiariesServed > 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <Users size={16} className="text-text-muted shrink-0" />
                                                            <span className="text-text-main">{event.beneficiariesServed} beneficiaries served</span>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Action buttons for scheduled/missed events */}
                                            {(event.status === 'scheduled' || event.status === 'missed') && (
                                                <div className="mt-3 pt-3 border-t border-gray-200/50 space-y-2">
                                                    <Link
                                                        to={`/tracking/add-trip?date=${event.date}&location=${encodeURIComponent(event.location)}${event.busNumber ? `&bus=${encodeURIComponent(event.busNumber)}` : ''}`}
                                                    >
                                                        <Button variant="outline" className="w-full text-xs flex items-center justify-center gap-2">
                                                            Log Trip <ArrowRight size={14} />
                                                        </Button>
                                                    </Link>
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleMarkStatus(event.id, 'completed')}
                                                            disabled={updatingStatus === event.id}
                                                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors disabled:opacity-50"
                                                        >
                                                            <CheckCircle size={14} />
                                                            {updatingStatus === event.id ? '...' : 'Completed'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleMarkStatus(event.id, 'missed')}
                                                            disabled={updatingStatus === event.id}
                                                            className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                                                        >
                                                            <AlertTriangle size={14} />
                                                            {updatingStatus === event.id ? '...' : 'Missed'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* View trip for completed events */}
                                            {event.status === 'completed' && event.tripId && (
                                                <div className="mt-3 pt-3 border-t border-gray-200/50">
                                                    <Link to={`/tracking/edit-trip/${event.tripId}`}>
                                                        <Button variant="outline" className="w-full text-xs flex items-center justify-center gap-2">
                                                            View Trip Details <ArrowRight size={14} />
                                                        </Button>
                                                    </Link>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12">
                            <CalendarIcon size={48} className="mx-auto text-gray-300 mb-3" />
                            <p className="text-text-muted text-sm">
                                Click on a date with events to view details
                            </p>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}
