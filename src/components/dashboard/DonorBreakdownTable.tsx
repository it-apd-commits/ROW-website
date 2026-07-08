import { Card } from '@/components/common/Card';
import { HeartHandshake } from 'lucide-react';

export interface DonorBreakdownRow {
    donor: string;
    beneficiaries: number;
    services: number;
}

interface Props {
    rows: DonorBreakdownRow[];
    isLoading: boolean;
    selectedDonor: string; // 'all' or a specific donor (for row highlight)
}

export function DonorBreakdownTable({ rows, isLoading, selectedDonor }: Props) {
    const totals = rows.reduce(
        (acc, r) => ({ beneficiaries: acc.beneficiaries + r.beneficiaries, services: acc.services + r.services }),
        { beneficiaries: 0, services: 0 }
    );

    return (
        <Card>
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-rose-50 rounded-lg">
                    <HeartHandshake size={18} className="text-rose-500" />
                </div>
                <div>
                    <h3 className="font-semibold text-text-main">Donor Breakdown</h3>
                    <p className="text-xs text-text-muted">Beneficiaries and services attributed to each donor</p>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-2">
                    {[0, 1, 2].map(i => (
                        <div key={i} className="h-10 bg-gray-100 animate-pulse rounded" />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <div className="text-center py-8 text-sm text-text-muted">
                    No donor data for the selected period.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                <th className="py-2 pr-4">Donor</th>
                                <th className="py-2 px-4 text-right">Beneficiaries</th>
                                <th className="py-2 pl-4 text-right">Services</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.map(r => {
                                const active = selectedDonor !== 'all' && selectedDonor === r.donor;
                                return (
                                    <tr
                                        key={r.donor}
                                        className={`transition-colors ${active ? 'bg-primary/5' : 'hover:bg-gray-50'}`}
                                    >
                                        <td className="py-2.5 pr-4 font-medium text-text-main">
                                            {r.donor}
                                            {active && (
                                                <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full uppercase">
                                                    Filtered
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-semibold text-blue-600">{r.beneficiaries.toLocaleString()}</td>
                                        <td className="py-2.5 pl-4 text-right font-semibold text-orange-600">{r.services.toLocaleString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-gray-100 font-bold text-text-main">
                                <td className="py-2.5 pr-4">Total</td>
                                <td className="py-2.5 px-4 text-right">{totals.beneficiaries.toLocaleString()}</td>
                                <td className="py-2.5 pl-4 text-right">{totals.services.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </Card>
    );
}
