import { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/common/Card";
import { fetchGenderBreakdown } from "@/services/dashboardService";
import type { GenderBreakdown } from "@/services/dashboardService";
import type { ChartFilter } from "@/types/dashboard";
import { Users } from "lucide-react";

interface Props {
    filter: ChartFilter;
}

// Categorical slots 1–3 (blue / orange / aqua) — validated CVD-safe as a set.
const SLICE_COLORS: Record<string, string> = {
    Male: '#2a78d6',
    Female: '#eb6834',
    Other: '#1baf7a',
};

const EMPTY_BREAKDOWN: GenderBreakdown = { male: 0, female: 0, other: 0, total: 0 };

export function GenderBreakdownChart({ filter }: Props) {
    const [loading, setLoading] = useState(true);
    const [breakdown, setBreakdown] = useState<GenderBreakdown>(EMPTY_BREAKDOWN);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            const data = await fetchGenderBreakdown(filter);
            setBreakdown(data);
            setLoading(false);
        };
        loadData();
    }, [filter]);

    const total = breakdown.total;
    const percentOf = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

    const rows = [
        { name: 'Male', value: breakdown.male },
        { name: 'Female', value: breakdown.female },
        { name: 'Other', value: breakdown.other },
    ].filter(r => r.value > 0);

    return (
        <Card className="p-6 flex flex-col space-y-4">
            <div>
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Users className="text-primary" size={20} />
                    Gender Distribution
                </h3>
                <p className="text-sm text-gray-500">Beneficiary breakdown by gender</p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-[220px]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : total === 0 ? (
                <div className="flex flex-col items-center justify-center h-[220px] text-gray-400">
                    <Users size={48} className="mb-2 opacity-20" />
                    <p>No beneficiary data found</p>
                </div>
            ) : (
                <>
                    <div className="relative h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={rows}
                                    dataKey="value"
                                    nameKey="name"
                                    innerRadius={60}
                                    outerRadius={85}
                                    paddingAngle={2}
                                    startAngle={90}
                                    endAngle={-270}
                                >
                                    {rows.map((r) => (
                                        <Cell key={r.name} fill={SLICE_COLORS[r.name]} stroke="#FFFFFF" strokeWidth={2} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number | undefined, name: string | undefined) => {
                                        const v = value ?? 0;
                                        return [`${v.toLocaleString()} (${percentOf(v)}%)`, name ?? ''];
                                    }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-2xl font-bold text-text-main">{total.toLocaleString()}</span>
                            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Total</span>
                        </div>
                    </div>

                    {/* Legend doubles as the explicit count + percentage breakdown */}
                    <div className="space-y-2">
                        {rows.map(r => (
                            <div key={r.name} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: SLICE_COLORS[r.name] }}></span>
                                    <span className="font-medium text-text-main">{r.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-text-muted">{r.value.toLocaleString()}</span>
                                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full min-w-[3rem] text-center">
                                        {percentOf(r.value)}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </Card>
    );
}
