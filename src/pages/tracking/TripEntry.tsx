import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bus, Save, Calculator, MapPin, Clock, Fuel, Edit2, CheckCircle, Zap, AlertCircle, ChevronDown } from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Input } from '@/components/common/Input';
import { Select } from '@/components/common/Select';
import { Button } from '@/components/common/Button';
import { LOCATIONS, BASE_LOCATION, getLocationByName } from '@/data/locations'; // Keep as fallback
import { calculateDistance, calculateDuration, calculateFuelEfficiency } from '@/utils/googleMaps';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

const BUS_MILEAGE_KMPL = 4.5;

export function TripEntryPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const isEditMode = !!id;

    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        busNumber: 'BUS ABB',
        driverName: '',
        assistantName: '',
        odometerStart: '',
        odometerEnd: '',
        location: '',
        departureTime: '09:00',
        returnTime: '17:00',
        purpose: 'Screening',
        fuelLiters: '',
        fuelCost: '',
        generatorStart: '',
        generatorEnd: '',
        notes: '',
    });

    const [calculatedData, setCalculatedData] = useState({
        distance: 0,
        duration: 0,
        fuelEfficiency: 0,
        generatorUnitsUsed: 0,
    });

    const [isCalculating, setIsCalculating] = useState(false);
    const [dynamicLocations, setDynamicLocations] = useState<string[]>([]);
    const [todayScheduledLocation, setTodayScheduledLocation] = useState<string | null>(null);
    const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
    const locationRef = useRef<HTMLDivElement>(null);

    // Load trip data in edit mode
    useEffect(() => {
        const fetchTrip = async () => {
            if (isEditMode && id) {
                const { data: tripToEdit, error } = await supabase
                    .from('trips')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) {
                    console.error('Error fetching trip:', error);
                    return;
                }

                if (tripToEdit) {
                    setFormData({
                        date: tripToEdit.date,
                        busNumber: tripToEdit.bus_number,
                        driverName: tripToEdit.driver_name,
                        assistantName: tripToEdit.assistant_name || '',
                        odometerStart: tripToEdit.odometer_start?.toString() || '',
                        odometerEnd: tripToEdit.odometer_end?.toString() || '',
                        location: tripToEdit.location,
                        departureTime: tripToEdit.departure_time,
                        returnTime: tripToEdit.return_time,
                        purpose: tripToEdit.purpose,
                        fuelLiters: tripToEdit.fuel_liters?.toString() || '',
                        fuelCost: tripToEdit.fuel_cost?.toString() || '',
                        generatorStart: tripToEdit.generator_start_reading?.toString() || '',
                        generatorEnd: tripToEdit.generator_end_reading?.toString() || '',
                        notes: tripToEdit.notes || '',
                    });
                    setCalculatedData({
                        distance: tripToEdit.final_distance,
                        duration: tripToEdit.duration_hours,
                        fuelEfficiency: tripToEdit.fuel_efficiency || 0,
                        generatorUnitsUsed: tripToEdit.generator_units_used || 0,
                    });
                }
            }
        };

        fetchTrip();
    }, [id, isEditMode]);

    // Fetch dynamic locations based on form date
    useEffect(() => {
        const fetchLocations = async () => {
            try {
                // Parse the selected date to get month/year
                const selectedDate = new Date(formData.date);
                if (isNaN(selectedDate.getTime())) return;

                const month = selectedDate.getMonth() + 1;
                const year = selectedDate.getFullYear();

                const { data, error } = await supabase
                    .from('monthly_schedules')
                    .select('location_name')
                    .eq('is_active', true)
                    .eq('month', month)
                    .eq('year', year);

                if (error) throw error;

                if (data && data.length > 0) {
                    const uniqueLocations = [...new Set(data.map(item => item.location_name))];
                    setDynamicLocations(uniqueLocations);
                } else {
                    setDynamicLocations(LOCATIONS.map(loc => loc.name));
                }
            } catch (err) {
                console.error('Error fetching locations:', err);
                setDynamicLocations(LOCATIONS.map(loc => loc.name));
            }
        };

        fetchLocations();
    }, [formData.date]);

    // Fetch today's scheduled location for auto-suggest
    useEffect(() => {
        const fetchTodayScheduledLocation = async () => {
            try {
                const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('monthly_schedules')
                    .select('location_name')
                    .eq('scheduled_date', today)
                    .eq('is_active', true)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    throw error;
                }

                if (data) {
                    setTodayScheduledLocation(data.location_name);
                    if (!isEditMode && !formData.location && formData.date === today) {
                        setFormData(prev => ({ ...prev, location: data.location_name }));
                    }
                }
            } catch (err) {
                console.error("Error fetching today's scheduled location:", err);
            }
        };

        fetchTodayScheduledLocation();
    }, [isEditMode, formData.date, formData.location]);

    // Wrap calculateDistanceFromLocation in useCallback
    const calculateDistanceFromLocation = useCallback(async () => {
        const location = getLocationByName(formData.location);
        if (!location) return;

        setIsCalculating(true);
        try {
            const result = await calculateDistance(BASE_LOCATION, location);
            if (result.success) {
                setCalculatedData(prev => ({
                    ...prev,
                    distance: result.distance,
                    duration: result.duration / 60 // Convert minutes to hours
                }));
            }
        } catch (error) {
            console.error('Distance calculation error:', error);
        } finally {
            setIsCalculating(false);
        }
    }, [formData.location]);

    // Auto-calculate distance when location is selected
    useEffect(() => {
        if (formData.location && !isEditMode) {
            calculateDistanceFromLocation();
        }
    }, [formData.location, isEditMode, calculateDistanceFromLocation]);

    // Auto-calculate from odometer when values change
    useEffect(() => {
        if (formData.odometerStart && formData.odometerEnd) {
            const start = parseFloat(formData.odometerStart);
            const end = parseFloat(formData.odometerEnd);
            if (end > start) {
                const distance = end - start;
                setCalculatedData(prev => ({ ...prev, distance }));
            }
        }
    }, [formData.odometerStart, formData.odometerEnd]);

    // Auto-calculate fuel consumed from distance using bus mileage
    useEffect(() => {
        if (calculatedData.distance > 0) {
            const estimated = (calculatedData.distance / BUS_MILEAGE_KMPL).toFixed(2);
            setFormData(prev => ({ ...prev, fuelLiters: estimated }));
        }
    }, [calculatedData.distance]);

    // Auto-calculate duration
    useEffect(() => {
        if (formData.departureTime && formData.returnTime) {
            const duration = calculateDuration(formData.departureTime, formData.returnTime);
            setCalculatedData(prev => ({ ...prev, duration }));
        }
    }, [formData.departureTime, formData.returnTime]);

    // Auto-calculate fuel efficiency
    useEffect(() => {
        const distance = calculatedData.distance;
        const fuel = parseFloat(formData.fuelLiters);
        if (distance > 0 && fuel > 0) {
            const efficiency = calculateFuelEfficiency(distance, fuel);
            setCalculatedData(prev => ({ ...prev, fuelEfficiency: efficiency }));
        }
    }, [calculatedData.distance, formData.fuelLiters]);

    // Auto-calculate generator units used
    useEffect(() => {
        const start = parseFloat(formData.generatorStart);
        const end = parseFloat(formData.generatorEnd);
        if (!isNaN(start) && !isNaN(end) && end > start) {
            setCalculatedData(prev => ({ ...prev, generatorUnitsUsed: parseFloat((end - start).toFixed(2)) }));
        } else {
            setCalculatedData(prev => ({ ...prev, generatorUnitsUsed: 0 }));
        }
    }, [formData.generatorStart, formData.generatorEnd]);



    // Mark the matching monthly_schedule as completed when a trip is saved
    const markScheduleCompleted = async (tripDate: string, tripLocation: string, tripId: string) => {
        try {
            // Try exact match first, then case-insensitive partial match
            const { data: schedules } = await supabase
                .from('monthly_schedules')
                .select('id, location_name')
                .eq('scheduled_date', tripDate)
                .eq('is_active', true)
                .neq('status', 'completed');

            if (!schedules || schedules.length === 0) return;

            // Find best match: exact first, then case-insensitive contains
            const match = schedules.find(s => s.location_name === tripLocation)
                || schedules.find(s =>
                    tripLocation.toLowerCase().includes(s.location_name.toLowerCase()) ||
                    s.location_name.toLowerCase().includes(tripLocation.toLowerCase())
                );

            if (match) {
                await supabase
                    .from('monthly_schedules')
                    .update({ status: 'completed', trip_id: tripId })
                    .eq('id', match.id);
            }
        } catch (err) {
            // Non-blocking — the trip is already saved
            console.error('Error marking schedule completed:', err);
        }
    };

    // Close location dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (locationRef.current && !locationRef.current.contains(e.target as Node)) {
                setLocationDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        if (!user) {
            alert('You must be logged in to save trips');
            return;
        }

        // Map frontend data to DB schema (snake_case)
        const tripData = {
            date: formData.date,
            bus_number: formData.busNumber,
            driver_name: formData.driverName,
            assistant_name: formData.assistantName || null,
            odometer_start: formData.odometerStart ? parseFloat(formData.odometerStart) : null,
            odometer_end: formData.odometerEnd ? parseFloat(formData.odometerEnd) : null,
            final_distance: calculatedData.distance,
            location: formData.location,
            departure_time: formData.departureTime,
            return_time: formData.returnTime,
            duration_hours: calculatedData.duration,
            purpose: formData.purpose,
            fuel_liters: formData.fuelLiters ? parseFloat(formData.fuelLiters) : null,
            fuel_cost: formData.fuelCost ? parseFloat(formData.fuelCost) : null,
            fuel_efficiency: calculatedData.fuelEfficiency || null,
            generator_start_reading: formData.generatorStart ? parseFloat(formData.generatorStart) : null,
            generator_end_reading: formData.generatorEnd ? parseFloat(formData.generatorEnd) : null,
            generator_units_used: calculatedData.generatorUnitsUsed || null,
            notes: formData.notes || null,
            created_by: user.id
        };

        try {
            if (isEditMode) {
                // Update existing trip
                const { error } = await supabase
                    .from('trips')
                    .update({ ...tripData, updated_at: new Date().toISOString() })
                    .eq('id', id);

                if (error) throw error;

                // Update matching schedule status (fallback if DB trigger doesn't match)
                await markScheduleCompleted(formData.date, formData.location, id!);
            } else {
                // Create new trip
                const { data: inserted, error } = await supabase
                    .from('trips')
                    .insert([tripData])
                    .select('id')
                    .single();

                if (error) throw error;

                // Update matching schedule status (fallback if DB trigger doesn't match)
                if (inserted) {
                    await markScheduleCompleted(formData.date, formData.location, inserted.id);
                }
            }
            // Navigate to tracking dashboard
            navigate('/tracking');
        } catch (error) {
            console.error('Error saving trip:', error);
            const message = error instanceof Error ? error.message : 'Error saving trip data';
            alert(message);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-text-main flex items-center gap-2">
                        {isEditMode ? <Edit2 className="text-primary" size={28} /> : <Bus className="text-primary" size={28} />}
                        {isEditMode ? 'Edit Bus Trip' : 'Add Bus Trip'}
                    </h1>
                    <p className="text-text-muted">
                        {isEditMode ? `Updating trip record for ${formData.location}` : 'Log daily bus journey with automatic distance calculation'}
                    </p>
                </div>
            </div>

            <Card>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Basic Details */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2">
                            Basic Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input
                                label="Date"
                                name="date"
                                type="date"
                                value={formData.date}
                                onChange={handleChange}
                                required
                            />
                            <Select
                                label="Bus Name"
                                name="busName"
                                value={formData.busNumber}
                                onChange={handleChange}
                                options={[
                                    { value: 'BUS ABB', label: 'BUS ABB' },
                                    { value: 'BUS Juniper', label: 'BUS Juniper' },
                                    { value: 'BUS Brigade', label: 'BUS Brigade' },
                                ]}
                            />
                            <Select
                                label="Purpose"
                                name="purpose"
                                value={formData.purpose}
                                onChange={handleChange}
                                options={[
                                    { value: 'Screening', label: 'Screening Assessment' },
                                    { value: 'Follow-up', label: 'Follow-up Session' },
                                    { value: 'Maintenance', label: 'Maintenance Trip' },
                                    { value: 'Emergency', label: 'Emergency' },
                                    { value: 'Medical Camp', label: 'Medical Camp' },
                                    { value: 'External Programs ', label: 'External Programs' },
                                    { value: 'Other', label: 'Other' },
                                ]}
                            />
                            <Input
                                label="Driver Name"
                                name="driverName"
                                value={formData.driverName}
                                onChange={handleChange}
                                required
                                placeholder="Driver name"
                            />
                            <Input
                                label="Assistant Name (Optional)"
                                name="assistantName"
                                value={formData.assistantName}
                                onChange={handleChange}
                                placeholder="Assistant name"
                            />
                        </div>
                    </div>

                    {/* Distance Tracking */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2 flex items-center gap-2">
                            <MapPin size={20} />
                            Distance Tracking
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Method 1: Location Selection */}
                            <div className="md:col-span-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
                                    <Calculator size={16} />
                                    Method 1: Auto-Calculate from Location (Recommended)
                                </h4>

                                {/* Location combobox — dropdown + free text */}
                                <div className="relative" ref={locationRef}>
                                    <label className="block text-sm font-medium text-text-main mb-1.5">
                                        Location <span className="text-red-500">*</span>
                                        <span className="ml-2 text-[11px] font-normal text-gray-400">Select from list or type a new location</span>
                                    </label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
                                        <input
                                            type="text"
                                            name="location"
                                            value={formData.location}
                                            onChange={(e) => {
                                                setFormData(prev => ({ ...prev, location: e.target.value }));
                                                setLocationDropdownOpen(true);
                                            }}
                                            onFocus={() => setLocationDropdownOpen(true)}
                                            placeholder="Search scheduled locations or type a new one..."
                                            className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm"
                                            required
                                            autoComplete="off"
                                        />
                                        <button
                                            type="button"
                                            tabIndex={-1}
                                            onClick={() => setLocationDropdownOpen(o => !o)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            <ChevronDown size={16} className={`transition-transform ${locationDropdownOpen ? 'rotate-180' : ''}`} />
                                        </button>
                                    </div>

                                    {/* Suggestion dropdown */}
                                    {locationDropdownOpen && (() => {
                                        const suggestions = dynamicLocations.filter(loc =>
                                            !formData.location || loc.toLowerCase().includes(formData.location.toLowerCase())
                                        );
                                        return suggestions.length > 0 ? (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                                                {suggestions.map(loc => (
                                                    <button
                                                        key={loc}
                                                        type="button"
                                                        onMouseDown={() => {
                                                            setFormData(prev => ({ ...prev, location: loc }));
                                                            setLocationDropdownOpen(false);
                                                        }}
                                                        className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-primary/5 hover:text-primary transition-colors ${formData.location === loc ? 'bg-primary/5 text-primary font-semibold' : 'text-gray-700'}`}
                                                    >
                                                        <MapPin size={13} className="shrink-0 text-gray-400" />
                                                        {loc}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null;
                                    })()}
                                </div>

                                {/* Status hints */}
                                {todayScheduledLocation && formData.location === todayScheduledLocation && (
                                    <p className="text-sm text-green-700 mt-2 flex items-center gap-1">
                                        <CheckCircle size={14} /> Auto-suggested: This location is scheduled for today
                                    </p>
                                )}
                                {formData.location && !dynamicLocations.includes(formData.location) && (
                                    <p className="text-xs text-amber-700 mt-2 flex items-center gap-1.5 bg-amber-50 border border-amber-100 px-3 py-2 rounded-lg">
                                        <AlertCircle size={13} className="shrink-0" />
                                        Custom location — distance won't auto-calculate. Use odometer readings (Method 2) below to record the distance.
                                    </p>
                                )}
                                {isCalculating && (
                                    <p className="text-sm text-blue-700 mt-2">Calculating distance...</p>
                                )}
                            </div>

                            {/* Method 2: Odometer Readings */}
                            <div className="md:col-span-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                <h4 className="font-medium text-gray-900 mb-2">
                                    Method 2: Odometer Readings (Optional Override)
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Input
                                        label="Odometer Start (km)"
                                        name="odometerStart"
                                        type="number"
                                        value={formData.odometerStart}
                                        onChange={handleChange}
                                        placeholder="45892"
                                    />
                                    <Input
                                        label="Odometer End (km)"
                                        name="odometerEnd"
                                        type="number"
                                        value={formData.odometerEnd}
                                        onChange={handleChange}
                                        placeholder="45986"
                                    />
                                </div>
                            </div>

                            {/* Calculated Distance Display */}
                            <div className="md:col-span-3">
                                <Card className="bg-green-50 border-green-200">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="text-sm text-green-700 mb-1">Calculated Distance</p>
                                            <p className="text-2xl md:text-3xl font-bold text-green-900 break-words">
                                                {calculatedData.distance} <span className="text-lg">km</span>
                                            </p>
                                        </div>
                                        <Calculator className="text-green-600" size={40} />
                                    </div>
                                </Card>
                            </div>
                        </div>
                    </div>

                    {/* Time & Duration */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2 flex items-center gap-2">
                            <Clock size={20} />
                            Time Tracking
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input
                                label="Departure Time"
                                name="departureTime"
                                type="time"
                                value={formData.departureTime}
                                onChange={handleChange}
                                required
                            />
                            <Input
                                label="Return Time"
                                name="returnTime"
                                type="time"
                                value={formData.returnTime}
                                onChange={handleChange}
                                required
                            />
                            <div className="flex items-end">
                                <div className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <p className="text-xs text-gray-600 mb-1">Duration</p>
                                    <p className="text-xl font-semibold text-gray-900">
                                        {calculatedData.duration.toFixed(2)} hours
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Fuel & Cost */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2 flex items-center gap-2">
                            <Fuel size={20} />
                            Fuel & Cost
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <Input
                                    label="Fuel Consumed (Liters)"
                                    name="fuelLiters"
                                    type="number"
                                    step="0.1"
                                    value={formData.fuelLiters}
                                    onChange={handleChange}
                                    placeholder="0.0"
                                />
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Auto-estimated at {BUS_MILEAGE_KMPL} km/L — edit if actual differs.
                                </p>
                            </div>
                            <Input
                                label="Fuel Cost (₹)"
                                name="fuelCost"
                                type="number"
                                step="0.01"
                                value={formData.fuelCost}
                                onChange={handleChange}
                                placeholder="0.00"
                            />
                            <div className="flex items-end md:col-span-2">
                                <div className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200">
                                    <p className="text-xs text-gray-600 mb-1">Fuel Efficiency</p>
                                    <p className="text-xl font-semibold text-gray-900">
                                        {calculatedData.fuelEfficiency > 0 ? `${calculatedData.fuelEfficiency} km/L` : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Generator Meter */}
                    <div>
                        <h3 className="text-lg font-semibold text-primary mb-4 border-b border-gray-100 pb-2 flex items-center gap-2">
                            <Zap size={20} />
                            Generator Meter
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input
                                label="Generator Start Reading"
                                name="generatorStart"
                                type="number"
                                step="0.01"
                                value={formData.generatorStart}
                                onChange={handleChange}
                                placeholder="e.g. 1520.5"
                            />
                            <Input
                                label="Generator End Reading"
                                name="generatorEnd"
                                type="number"
                                step="0.01"
                                value={formData.generatorEnd}
                                onChange={handleChange}
                                placeholder="e.g. 1528.3"
                            />
                            <div className="flex items-end">
                                <div className="w-full p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                                    <p className="text-xs text-yellow-700 mb-1">Units Used</p>
                                    <p className="text-xl font-semibold text-yellow-900">
                                        {calculatedData.generatorUnitsUsed > 0 ? `${calculatedData.generatorUnitsUsed} units` : 'N/A'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-text-main mb-2">
                            Notes / Stops / Delays
                        </label>
                        <textarea
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="Any additional notes, stops, or delays..."
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col-reverse sm:flex-row gap-4 pt-4 border-t border-gray-100 sm:justify-end">
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => navigate('/tracking')}
                            className="w-full sm:w-32"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="w-full sm:w-40 flex items-center justify-center gap-2"
                            disabled={!formData.location || (!calculatedData.distance && dynamicLocations.includes(formData.location))}
                        >
                            <Save size={18} />
                            {isEditMode ? 'Update Trip' : 'Save Trip'}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
}
