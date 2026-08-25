import { useState, useEffect } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend,
    LabelList,
} from "recharts";
import { Card } from "@/components/common/Card";
import {
    fetchBeneficiaryStats,
    fetchUniqueLocations
} from "@/services/dashboardService";
import type { TimeFrame, BeneficiaryChartData, ChartFilter } from "@/types/dashboard";
import { Users, Filter } from "lucide-react";

interface Props {
    timeframe: TimeFrame;
    filter: ChartFilter;
}

export function BeneficiaryRegistrationChart({ timeframe, filter }: Props) {
    const [data, setData] = useState<BeneficiaryChartData[]>([]);
    const [locations, setLocations] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedLocation, setSelectedLocation] = useState<string>("All");

    // Load locations on mount
    useEffect(() => {
        fetchUniqueLocations().then(setLocations);
    }, []);

    // Fetch chart data when filters change
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const chartData = await fetchBeneficiaryStats(timeframe, {
                startDate: filter.startDate,
                endDate: filter.endDate,
                location: selectedLocation,
                donor: filter.donor,
            });
            setData(chartData);
            setLoading(false);
        };
        loadData();
    }, [timeframe, selectedLocation, filter]);

    return (
        <Card className="p-6 h-[300px] md:h-[500px] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Users className="text-primary" size={20} />
                        Beneficiary Registrations
                    </h3>
                    <p className="text-sm text-gray-500">
                        Total registrations over time
                    </p>
                </div>

                {/* Keep Location Filter as an extra refinement */}
                <div className="flex items-center gap-3">
                    <select
                        className="text-xs border-gray-200 rounded-md focus:ring-primary focus:border-primary py-1"
                        value={selectedLocation}
                        onChange={(e) => setSelectedLocation(e.target.value)}
                    >
                        <option value="All">All Regions</option>
                        {locations.map((loc) => (
                            <option key={loc} value={loc}>{loc}</option>
                        ))}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : data.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <Filter size={48} className="mb-2 opacity-20" />
                    <p>No data found for the selected range</p>
                </div>
            ) : (
                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tick={{ fontSize: 12, fill: '#6B7280' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 12, fill: '#6B7280' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend verticalAlign="top" height={36} />
                            <Bar
                                name="Registered Beneficiaries"
                                dataKey="count"
                                fill="#0ea5e9"
                                radius={[4, 4, 0, 0]}
                                barSize={timeframe === 'daily' ? 20 : 40}
                            >
                                <LabelList dataKey="count" position="top" style={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
