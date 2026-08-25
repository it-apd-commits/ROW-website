import { useEffect, useState } from 'react';
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
} from 'recharts';
import { Card } from '@/components/common/Card';
import { supabase } from '@/lib/supabase';
import { ClipboardList, Filter } from 'lucide-react';
import type { ChartFilter } from '@/types/dashboard';
import { normalizeDonor, fetchAllRows } from '@/services/dashboardService';

interface Props {
    filter: ChartFilter;
}

interface MonthRow {
    key: string;          // YYYY-MM
    label: string;        // "Apr '26"
    assessments: number;
    reassessments: number;
}

// Build a contiguous list of months from start to end (inclusive) so gaps
// render as zero-height bars instead of collapsing the x-axis.
function buildMonthBuckets(start: Date, end: Date): MonthRow[] {
    const rows: MonthRow[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const stop = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= stop) {
        const year = cursor.getFullYear();
        const month = cursor.getMonth();
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        const label = `${cursor.toLocaleString('en-US', { month: 'short' })} '${String(year).slice(2)}`;
        rows.push({ key, label, assessments: 0, reassessments: 0 });
        cursor.setMonth(month + 1);
    }
    return rows;
}

function monthKey(dateStr: string): string {
    return dateStr.slice(0, 7); // YYYY-MM (works for ISO dates / YYYY-MM-DD)
}

// Assessment tables have no donor/beneficiary_id column — only patient_name
// and phone. Same soft-link approach BeneficiaryProfile.tsx uses to attach
// a beneficiary's history: normalize name/phone and match against the
// beneficiaries table to find that patient's donor.
const normalizeName = (n: string | null | undefined): string => (n || '').trim().toLowerCase();
const normalizePhone = (p: string | null | undefined): string => (p || '').trim();

export function AssessmentVsReassessmentChart({ filter }: Props) {
    const [data, setData] = useState<MonthRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [totals, setTotals] = useState({ assessments: 0, reassessments: 0 });

    useEffect(() => {
        const load = async () => {
            setLoading(true);

            // Resolve window: use global filter if set, else last 6 months.
            const today = new Date();
            const defaultStart = new Date(today.getFullYear(), today.getMonth() - 5, 1);
            const start = filter.startDate ? new Date(filter.startDate) : defaultStart;
            const end = filter.endDate ? new Date(filter.endDate) : today;

            const startISO = start.toISOString().split('T')[0];
            const endISO = end.toISOString().split('T')[0];

            try {
                const donorScoped = !!filter.donor && filter.donor !== 'all';

                // Donor lookups only fetched when actually needed — the plain
                // date-scoped queries below stay cheap when no donor is selected.
                const [beneficiaries, allInitials, followUps] = await Promise.all([
                    donorScoped
                        ? fetchAllRows<{ name: string | null; mobile_no: string | null; donor: string | null }>(() =>
                            supabase.from('beneficiaries').select('name, mobile_no, donor')
                        )
                        : Promise.resolve([]),
                    donorScoped
                        // Fetch ALL initial_assessment rows (not date-scoped) so
                        // follow-ups whose initial assessment falls outside this
                        // window can still be resolved to a patient/donor below.
                        ? fetchAllRows<{ patient_id: string; patient_name: string | null; phone: string | null; assessment_date: string | null }>(() =>
                            supabase.from('initial_assessment').select('patient_id, patient_name, phone, assessment_date')
                        )
                        : supabase
                            .from('initial_assessment')
                            .select('patient_id, patient_name, phone, assessment_date')
                            .gte('assessment_date', startISO)
                            .lte('assessment_date', endISO)
                            .then(({ data }) => data || []),
                    supabase
                        .from('follow_up_assessment')
                        .select('patient_id, visit_date')
                        .gte('visit_date', startISO)
                        .lte('visit_date', endISO)
                        .then(({ data }) => data || []),
                ]);

                const donorByName = new Map<string, string>();
                const donorByPhone = new Map<string, string>();
                beneficiaries.forEach((b) => {
                    const d = normalizeDonor(b.donor);
                    const n = normalizeName(b.name);
                    const p = normalizePhone(b.mobile_no);
                    if (n) donorByName.set(n, d);
                    if (p) donorByPhone.set(p, d);
                });

                // null = couldn't be matched to any beneficiary, so it can't be
                // attributed to the selected donor and gets excluded when scoped.
                const resolveDonor = (name: string | null, phone: string | null): string | null => {
                    const n = normalizeName(name);
                    const p = normalizePhone(phone);
                    if (n && donorByName.has(n)) return donorByName.get(n)!;
                    if (p && donorByPhone.has(p)) return donorByPhone.get(p)!;
                    return null;
                };

                // Follow-ups only carry patient_id — resolve via the initial
                // assessment's name/phone for that same patient_id.
                const patientDonor = new Map<string, string | null>();
                if (donorScoped) {
                    allInitials.forEach((row) => {
                        patientDonor.set(row.patient_id, resolveDonor(row.patient_name, row.phone));
                    });
                }

                const initialsInRange = donorScoped
                    ? allInitials.filter((row) => row.assessment_date && row.assessment_date >= startISO && row.assessment_date <= endISO)
                    : allInitials;

                const buckets = buildMonthBuckets(start, end);
                const index = new Map(buckets.map((b, i) => [b.key, i]));

                initialsInRange.forEach((row) => {
                    if (!row.assessment_date) return;
                    if (donorScoped && resolveDonor(row.patient_name, row.phone) !== filter.donor) return;
                    const idx = index.get(monthKey(row.assessment_date));
                    if (idx !== undefined) buckets[idx].assessments += 1;
                });

                followUps.forEach((row) => {
                    if (!row.visit_date) return;
                    if (donorScoped && patientDonor.get(row.patient_id) !== filter.donor) return;
                    const idx = index.get(monthKey(row.visit_date));
                    if (idx !== undefined) buckets[idx].reassessments += 1;
                });

                setData(buckets);
                setTotals({
                    assessments: buckets.reduce((s, b) => s + b.assessments, 0),
                    reassessments: buckets.reduce((s, b) => s + b.reassessments, 0),
                });
            } catch (err) {
                console.error('Error loading assessment chart:', err);
                setData([]);
            } finally {
                setLoading(false);
            }
        };

        load();
    }, [filter.startDate, filter.endDate, filter.donor]);

    const isEmpty = !loading && data.every((d) => d.assessments === 0 && d.reassessments === 0);

    return (
        <Card className="p-6 h-[300px] md:h-[500px] flex flex-col">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <ClipboardList className="text-primary" size={20} />
                        Assessments vs Reassessments
                    </h3>
                    <p className="text-sm text-gray-500">
                        Monthly new assessments compared with follow-up sessions
                    </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-1 rounded-md bg-primary/10 text-primary font-semibold">
                        Assessments: {totals.assessments}
                    </span>
                    <span className="px-2 py-1 rounded-md bg-emerald-100 text-emerald-700 font-semibold">
                        Reassessments: {totals.reassessments}
                    </span>
                </div>
            </div>

            {loading ? (
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            ) : isEmpty ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                    <Filter size={48} className="mb-2 opacity-20" />
                    <p>No assessments recorded in this range</p>
                </div>
            ) : (
                <div className="flex-1 w-full min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 12, fill: '#6B7280' }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                tick={{ fontSize: 12, fill: '#6B7280' }}
                                axisLine={false}
                                tickLine={false}
                                allowDecimals={false}
                            />
                            <Tooltip
                                cursor={{ fill: 'transparent' }}
                                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            />
                            <Legend verticalAlign="top" height={36} />
                            <Bar
                                name="Assessments"
                                dataKey="assessments"
                                fill="#0ea5e9"
                                radius={[4, 4, 0, 0]}
                                barSize={22}
                            >
                                <LabelList dataKey="assessments" position="top" style={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                            </Bar>
                            <Bar
                                name="Reassessments"
                                dataKey="reassessments"
                                fill="#10b981"
                                radius={[4, 4, 0, 0]}
                                barSize={22}
                            >
                                <LabelList dataKey="reassessments" position="top" style={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}
        </Card>
    );
}
