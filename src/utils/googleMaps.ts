import type { Location } from '@/types/trip';

// Google Maps API configuration
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
const USE_MOCK_MODE = !GOOGLE_MAPS_API_KEY; // Use mock if no API key

interface DistanceResult {
    distance: number; // in kilometers
    duration: number; // in minutes
    success: boolean;
    error?: string;
}

/**
 * Calculate distance between two locations using Google Maps Distance Matrix API
 * Falls back to standard distance if API fails or in mock mode
 */
export async function calculateDistance(
    origin: Location,
    destination: Location
): Promise<DistanceResult> {
    // Mock mode for development (no API key needed)
    if (USE_MOCK_MODE) {
        return getMockDistance(destination);
    }

    try {
        const originStr = `${origin.coordinates.lat},${origin.coordinates.lng}`;
        const destStr = `${destination.coordinates.lat},${destination.coordinates.lng}`;

        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originStr}&destinations=${destStr}&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.rows[0]?.elements[0]?.status === 'OK') {
            const element = data.rows[0].elements[0];
            const distanceKm = element.distance.value / 1000; // Convert meters to km
            const durationMin = element.duration.value / 60; // Convert seconds to minutes

            return {
                distance: Math.round(distanceKm * 2), // Round trip
                duration: Math.round(durationMin * 2), // Round trip
                success: true
            };
        } else {
            // Fallback to standard distance
            return getMockDistance(destination);
        }
    } catch (error) {
        console.error('Google Maps API error:', error);
        // Fallback to standard distance
        return getMockDistance(destination);
    }
}

/**
 * Get mock/standard distance (used in development or as fallback)
 */
function getMockDistance(destination: Location): DistanceResult {
    const distance = destination.standardDistance || 100; // Default 100km if not set
    const duration = Math.round(distance / 40 * 60); // Assume 40 km/h average

    return {
        distance,
        duration,
        success: true
    };
}

/**
 * Calculate distance from odometer readings
 */
export function calculateOdometerDistance(start: number, end: number): number {
    if (!start || !end || end < start) {
        return 0;
    }
    return end - start;
}

/**
 * Calculate trip duration in hours
 */
export function calculateDuration(departureTime: string, returnTime: string): number {
    try {
        const [depHour, depMin] = departureTime.split(':').map(Number);
        const [retHour, retMin] = returnTime.split(':').map(Number);

        const depMinutes = depHour * 60 + depMin;
        const retMinutes = retHour * 60 + retMin;

        let diffMinutes = retMinutes - depMinutes;
        // Return before departure means the trip crossed midnight — add 24 hours
        if (diffMinutes < 0) diffMinutes += 24 * 60;
        return Number((diffMinutes / 60).toFixed(2));
    } catch {
        return 0;
    }
}

/**
 * Calculate fuel efficiency
 */
export function calculateFuelEfficiency(distance: number, fuelLiters: number): number {
    if (!fuelLiters || fuelLiters === 0) return 0;
    return Number((distance / fuelLiters).toFixed(2));
}
