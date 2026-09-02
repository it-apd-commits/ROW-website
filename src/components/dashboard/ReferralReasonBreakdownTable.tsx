import { Card } from '@/components/common/Card';
import { ClipboardList } from 'lucide-react';

export interface ReferralReasonRow {
    reason: string;
    count: number;
}

interface Props {
    rows: ReferralReasonRow[];
    isLoading: boolean;
}

export function ReferralReasonBreakdownTable({ rows, isLoading }: Props) {
    const total = rows.reduce((sum, r) => sum + r.count, 0);

    return (
        <Card>
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-teal-50 rounded-lg">
                    <ClipboardList size={18} className="text-teal-600" />
                </div>
                <div>
                    <h3 className="font-semibold text-text-main">Referral Reasons</h3>
                    <p className="text-xs text-text-muted">Why beneficiaries were referred for a service or assessment</p>
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
                    No referrals for the selected period.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                                <th className="py-2 pr-4">Reason</th>
                                <th className="py-2 pl-4 text-right">Count</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {rows.map(r => (
                                <tr key={r.reason} className="hover:bg-gray-50 transition-colors">
                                    <td className="py-2.5 pr-4 font-medium text-text-main">{r.reason}</td>
                                    <td className="py-2.5 pl-4 text-right font-semibold text-teal-600">{r.count.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="border-t-2 border-gray-100 font-bold text-text-main">
                                <td className="py-2.5 pr-4">Total</td>
                                <td className="py-2.5 pl-4 text-right">{total.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </Card>
    );
}
