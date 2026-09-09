import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, LabelList, ResponsiveContainer } from "recharts";
import { Card } from "@/components/common/Card";
import { fetchAgeBreakdown } from "@/services/dashboardService";
import type { AgeBreakdown } from "@/services/dashboardService";
import type { ChartFilter } from "@/types/dashboard";
import { Baby } from "lucide-react";

interface Props {
    filter: ChartFilter;
}

const EMPTY_BREAKDOWN: AgeBreakdown = {
    buckets: [
        { label: 'Early Childhood', range: '0–5 years', count: 0 },
        { label: 'Children', range: '6–14 years', count: 0 },
        { label: 'Adolescents & Youth', range: '15–24 years', count: 0 },
        { label: 'Adults', range: '25–59 years', count: 0 },
        { label: 'Older Adults', range: '60 and above', count: 0 },
    ],
    total: 0,
};

const BAR_COLOR = '#00897B';

export function AgeBreakdownChart({ filter }: Props) {
    const [loading, setLoading] = useState(true);
    const [breakdown, setBreakdown] = useState<AgeBreakdown>(EMPTY_BREAKDOWN);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const data = await fetchAgeBreakdown(filter);
            setBreakdown(data);
            setLoading(false);
        };
        loadData();
    }, [filter]);

    const total = breakdown.total;
    const percentOf = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

    return (
        <Card className="p-6 flex flex-col space-y-4">
            <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Baby className="text-primary" size={20} />
                    Age Distribution
                </h3>
                <p className="text-sm text-gray-500">Beneficiary breakdown by age category</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-[220px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : total === 0 ? (
                <div className="flex flex-col items-center justify-center h-[220px] text-gray-400">
                    <Baby size={48} className="mb-2 opacity-20" />
                    <p>No beneficiary data found</p>
                </div>
            ) : (
                <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={breakdown.buckets}
                            layout="vertical"
                            margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis
                                type="category"
                                dataKey="label"
                                width={110}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                cursor={{ fill: '#f8fafc' }}
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                formatter={(value: number | undefined, _name: string | undefined, item) => {
                                    const v = value ?? 0;
                                    const range = item?.payload?.range as string | undefined;
                                    return [`${v.toLocaleString()} (${percentOf(v)}%)`, range ?? 'Count'];
                                }}
                            />
                            <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={22}>
                                {breakdown.buckets.map((b) => (
                                    <Cell key={b.label} fill={BAR_COLOR} />
                                ))}
                                <LabelList dataKey="count" position="right" style={{ fill: '#374151', fontSize: 11, fontWeight: 700 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
