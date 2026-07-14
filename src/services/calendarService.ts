import { supabase } from '@/lib/supabase';

export interface CalendarEvent {
    id: string;
    date: string; // YYYY-MM-DD
    location: string;
    address?: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'missed';
    eventType: 'screening' | 'follow-up' | 'maintenance' | 'emergency' | 'other';
    // From linked trip (if any)
    tripId?: string;
    busNumber?: string; // bus assigned in the schedule (falls back to the linked trip's bus)
    driverName?: string;
    departureTime?: string;
    returnTime?: string;
    beneficiariesServed?: number;
    // Schedule metadata
    donor?: string;
    isActive: boolean;
}

export interface CalendarFilters {
    busNumber?: string; // exact bus, omit for all buses
    donor?: string;     // exact donor, omit for all donors
}

/**
 * Fetch all calendar events for a given month/year from monthly_schedules + linked trips
 */
export async function fetchCalendarEvents(year: number, month: number, filters?: CalendarFilters): Promise<CalendarEvent[]> {
    // 1. Fetch schedules for the month
    let query = supabase
        .from('monthly_schedules')
        .select('*')
        .eq('month', month)
        .eq('year', year)
        .eq('is_active', true);
    if (filters?.busNumber) query = query.eq('bus_number', filters.busNumber);
    if (filters?.donor) query = query.eq('donor', filters.donor);
    const { data: schedules, error: schedError } = await query.order('scheduled_date', { ascending: true });

    if (schedError) {
        console.error('Error fetching schedules:', schedError);
        return [];
    }

    if (!schedules || schedules.length === 0) return [];

    // 2. Fetch trips for the same month to match with schedules
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data: trips, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate);

    if (tripError) {
        console.error('Error fetching trips:', tripError);
    }

    // 3. Build calendar events - match schedules with trips by date + location
    // (+ bus, when the schedule has one — two buses can visit the same place/day)
    const events: CalendarEvent[] = schedules.map((schedule) => {
        // Try to find a matching trip for this schedule
        const matchingTrip = trips?.find(
            (trip) =>
                trip.date === schedule.scheduled_date &&
                trip.location?.toLowerCase() === schedule.location_name?.toLowerCase() &&
                (!schedule.bus_number || trip.bus_number === schedule.bus_number)
        );

        // Determine status
        let status: CalendarEvent['status'] = 'scheduled';
        if (schedule.status === 'completed' || matchingTrip) {
            status = 'completed';
        } else if (schedule.status === 'cancelled') {
            status = 'cancelled';
        } else {
            // Check if the date has passed without a trip
            const today = new Date().toISOString().split('T')[0];
            if (schedule.scheduled_date < today && !matchingTrip) {
                status = 'missed';
            }
        }

        // Determine event type from trip purpose or default to screening
        let eventType: CalendarEvent['eventType'] = 'screening';
        if (matchingTrip) {
            const purpose = matchingTrip.purpose?.toLowerCase() || '';
            if (purpose.includes('follow')) eventType = 'follow-up';
            else if (purpose.includes('maintenance')) eventType = 'maintenance';
            else if (purpose.includes('emergency')) eventType = 'emergency';
            else if (purpose.includes('other')) eventType = 'other';
            else eventType = 'screening';
        }

        return {
            id: schedule.id,
            date: schedule.scheduled_date,
            location: schedule.location_name,
            address: schedule.address || undefined,
            status,
            eventType,
            tripId: matchingTrip?.id || schedule.trip_id || undefined,
            busNumber: schedule.bus_number || matchingTrip?.bus_number || undefined,
            donor: schedule.donor || undefined,
            driverName: matchingTrip?.driver_name || undefined,
            departureTime: matchingTrip?.departure_time || undefined,
            returnTime: matchingTrip?.return_time || undefined,
            beneficiariesServed: matchingTrip?.beneficiaries_served || undefined,
            isActive: schedule.is_active,
        };
    });

    return events;
}

/**
 * Fetch upcoming scheduled events (for notifications/dashboard)
 */
export async function fetchUpcomingEvents(daysAhead: number = 7): Promise<CalendarEvent[]> {
    const today = new Date().toISOString().split('T')[0];
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);
    const futureDateStr = futureDate.toISOString().split('T')[0];

    const { data: schedules, error } = await supabase
        .from('monthly_schedules')
        .select('*')
        .eq('is_active', true)
        .gte('scheduled_date', today)
        .lte('scheduled_date', futureDateStr)
        .order('scheduled_date', { ascending: true });

    if (error) {
        console.error('Error fetching upcoming events:', error);
        return [];
    }

    return (schedules || []).map((schedule) => ({
        id: schedule.id,
        date: schedule.scheduled_date,
        location: schedule.location_name,
        address: schedule.address || undefined,
        status: 'scheduled' as const,
        eventType: 'screening' as const,
        busNumber: schedule.bus_number || undefined,
        donor: schedule.donor || undefined,
        isActive: true,
    }));
}

/**
 * Fetch missed camps (scheduled but no trip logged, date already passed)
 */
export async function fetchMissedCamps(): Promise<CalendarEvent[]> {
    const today = new Date().toISOString().split('T')[0];

    const { data: schedules, error } = await supabase
        .from('monthly_schedules')
        .select('*')
        .eq('is_active', true)
        .lt('scheduled_date', today)
        .is('trip_id', null)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching missed camps:', error);
        return [];
    }

    return (schedules || []).map((schedule) => ({
        id: schedule.id,
        date: schedule.scheduled_date,
        location: schedule.location_name,
        address: schedule.address || undefined,
        status: 'missed' as const,
        eventType: 'screening' as const,
        busNumber: schedule.bus_number || undefined,
        donor: schedule.donor || undefined,
        isActive: true,
    }));
}

/**
 * Distinct donor names across active schedules — populates the calendar's donor filter.
 */
export async function fetchScheduleDonors(): Promise<string[]> {
    const { data, error } = await supabase
        .from('monthly_schedules')
        .select('donor')
        .eq('is_active', true)
        .not('donor', 'is', null);

    if (error) {
        console.error('Error fetching schedule donors:', error);
        return [];
    }

    const donors = new Set<string>();
    (data || []).forEach(row => { if (row.donor) donors.add(row.donor); });
    return Array.from(donors).sort((a, b) => a.localeCompare(b));
}

/**
 * Update the status of a schedule entry (mark as completed or missed)
 */
export async function updateScheduleStatus(
    scheduleId: string,
    status: 'completed' | 'missed' | 'scheduled' | 'cancelled'
): Promise<boolean> {
    const { error } = await supabase
        .from('monthly_schedules')
        .update({ status })
        .eq('id', scheduleId);

    if (error) {
        console.error('Error updating schedule status:', error);
        return false;
    }
    return true;
}
